/**
 * Mirror Everloot's R2 bucket (raw uploads, the record of truth, plus the snapshot and the knowledge
 * release) into a local backup folder. Incremental: an object whose size and MD5 already match is kept.
 * Every download is checked against its ETag MD5 (single-part objects); any mismatch fails the run and
 * no _manifest.json is written, so a partial mirror cannot pass for a complete one.
 * Credentials: a read-only R2 token in the environment (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET), e.g. from an env file kept outside the repository.
 * Run: node scripts/backup-r2.mjs <destination folder>
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { AwsClient } from "aws4fetch";

// &amp; last, so an escaped entity such as &amp;lt; decodes once, to the text &lt;.
const xml = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * @param {{ dest: string, env?: Record<string, string | undefined>, fetch?: (req: Request) => Promise<Response>, log?: (msg: string) => void, now?: () => Date }} options
 * @returns {Promise<{ objects: number, downloaded: number, kept: number, bytes: number }>}
 */
export async function mirrorBucket({ dest, env = process.env, fetch = globalThis.fetch, log = console.log, now = () => new Date() }) {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: secret, R2_BUCKET: bucket } = env;
  if (!account || !id || !secret || !bucket) throw new Error("R2 variables are not set");
  const aws = new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: "s3", region: "auto" });
  const base = `https://${account}.r2.cloudflarestorage.com/${bucket}`;
  const root = resolve(dest);
  mkdirSync(root, { recursive: true });
  rmSync(join(root, "_manifest.json"), { force: true });

  const listed = [];
  let token = null;
  do {
    const url = new URL(base);
    url.searchParams.set("list-type", "2");
    if (token) url.searchParams.set("continuation-token", token);
    const res = await fetch(await aws.sign(url.href, { method: "GET" }));
    if (!res.ok) throw new Error(`listing failed (${res.status})`);
    const body = await res.text();
    for (const m of body.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = xml(/<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1] ?? "");
      const size = Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? NaN);
      const etag = xml(/<ETag>([\s\S]*?)<\/ETag>/.exec(m[1])?.[1] ?? "").replace(/"/g, "");
      listed.push({ key, size, etag });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(body) ? xml(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(body)?.[1] ?? "") : null;
  } while (token);

  let downloaded = 0, kept = 0, bytes = 0;
  for (const { key, size, etag } of listed) {
    const target = resolve(root, key);
    if (!key || !target.startsWith(root + sep)) throw new Error(`unsafe key: ${key}`);
    const single = /^[0-9a-f]{32}$/.test(etag);
    const matches = (buf) => buf.length === size && (!single || createHash("md5").update(buf).digest("hex") === etag);
    bytes += size;
    if (existsSync(target) && matches(readFileSync(target))) { kept++; continue; }
    const res = await fetch(await aws.sign(`${base}/${key.split("/").map(encodeURIComponent).join("/")}`, { method: "GET" }));
    const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    if (!buf || !matches(buf)) {
      rmSync(target, { force: true });
      throw new Error(`${key} did not match its listed size/MD5 (${res.status}); mirror incomplete`);
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(`${target}.tmp`, buf);
    renameSync(`${target}.tmp`, target);
    downloaded++;
  }
  // Written last, like the Supabase exporter's manifest: its presence means the mirror is complete.
  writeFileSync(join(root, "_manifest.json"), JSON.stringify({ bucket, takenAt: now().toISOString(), count: listed.length, bytes, objects: listed }, null, 1));
  log(`[r2-backup] ${listed.length} objects (${downloaded} downloaded, ${kept} unchanged), ${bytes} bytes`);
  return { objects: listed.length, downloaded, kept, bytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dest = process.argv[2];
  if (!dest) throw new Error("usage: node scripts/backup-r2.mjs <destination folder>");
  await mirrorBucket({ dest });
}
