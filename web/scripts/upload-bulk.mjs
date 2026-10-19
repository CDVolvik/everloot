/**
 * Owner step: upload a bulk export folder (scripts/export-bulk.ts) to the public bulk bucket, so the
 * files are served from data.everloot.app with free egress. Create-only per folder: every object is
 * written with If-None-Match: *, so an export is never overwritten; a new export is a new folder named
 * by its generatedAt stamp. The data files go first and index.json last, so a half-finished upload never
 * lists a file that is not there. Then latest.json, the one object this script does overwrite, points at
 * the folder just uploaded. Each file is checked against the index's sha256 first, and a folder whose
 * index or data carries what looks like a local filesystem path is refused before anything is sent.
 *
 * Environment (never arguments, never committed): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * and BULK_BUCKET (the public bucket; must not be the uploads bucket).
 *   node scripts/upload-bulk.mjs <folder with index.json>
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { AwsClient } from "aws4fetch";

const TYPES = { ".ndjson": "application/x-ndjson", ".json": "application/json" };
const CACHE = "public, max-age=31536000, immutable";

/** What a published file must never carry: a machine's own filesystem paths (Windows drive form, /Users/, /home/, AppData). */
const LOCAL_PATH = /[A-Za-z]:\\|\/(?:Users|home)\/|AppData[\\/]/;

/** The upload order: every data file the index lists, then the index itself. Throws on a hash mismatch or a file carrying what looks like a local filesystem path. */
export function plan(folder, indexText) {
  const index = JSON.parse(indexText);
  if (!Array.isArray(index.files) || typeof index.generatedAt !== "string") throw new Error("index.json is not a bulk index");
  const indexHit = indexText.match(LOCAL_PATH);
  if (indexHit) throw new Error(`index.json carries what looks like a local filesystem path (${indexHit[0]}); nothing uploaded`);
  const files = index.files.map((f) => {
    const body = readFileSync(join(folder, f.name));
    if (createHash("sha256").update(body).digest("hex") !== f.sha256) throw new Error(`${f.name} does not match its sha256 in index.json; nothing uploaded`);
    if (body.length !== f.bytes) throw new Error(`${f.name} is ${body.length} bytes, index.json says ${f.bytes}; nothing uploaded`);
    const hit = body.toString("utf8").match(LOCAL_PATH);
    if (hit) throw new Error(`${f.name} carries what looks like a local filesystem path (${hit[0]}); nothing uploaded`);
    return { name: f.name, body, type: TYPES[f.name.slice(f.name.lastIndexOf("."))] ?? "application/octet-stream" };
  });
  const stamp = index.generatedAt.replace(/[:.]/g, "-");
  return { stamp, files: [...files, { name: "index.json", body: Buffer.from(indexText, "utf8"), type: TYPES[".json"] }] };
}

/**
 * @param {{ folder: string, env?: Record<string, string | undefined>, fetch?: (req: Request) => Promise<Response> }} options
 * @returns {Promise<string>} the folder key the export was written under
 */
export async function uploadBulk({ folder, env = process.env, fetch = globalThis.fetch }) {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: secret, BULK_BUCKET: bucket, R2_BUCKET: uploads } = env;
  if (!account || !id || !secret || !bucket) throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and BULK_BUCKET must be set");
  if (uploads && bucket === uploads) throw new Error("BULK_BUCKET is the uploads bucket; the export goes to a public bucket of its own");
  const { stamp, files } = plan(folder, readFileSync(join(folder, "index.json"), "utf8"));
  const aws = new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: "s3", region: "auto" });
  const base = `https://${account}.r2.cloudflarestorage.com/${bucket}`;
  for (const f of files) {
    const req = await aws.sign(`${base}/${stamp}/${f.name}`, {
      method: "PUT", body: f.body, headers: { "content-type": f.type, "cache-control": CACHE, "if-none-match": "*" },
    });
    const res = await fetch(req);
    if (res.status === 412) throw new Error(`${stamp}/${f.name} already exists; not overwritten`);
    if (!res.ok) throw new Error(`${stamp}/${f.name} upload failed (${res.status})`);
  }
  const latest = JSON.stringify({ stamp, index: `${stamp}/index.json` }) + "\n";
  const req = await aws.sign(`${base}/latest.json`, {
    method: "PUT", body: latest, headers: { "content-type": TYPES[".json"], "cache-control": "public, max-age=0, s-maxage=300" },
  });
  const res = await fetch(req);
  if (!res.ok) throw new Error(`latest.json upload failed (${res.status})`);
  return stamp;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [folder] = process.argv.slice(2);
  if (!folder || folder.startsWith("-")) {
    console.error("usage: node scripts/upload-bulk.mjs <folder with index.json>");
    process.exit(2);
  }
  uploadBulk({ folder }).then((stamp) => console.log(`uploaded ${stamp}/ and pointed latest.json at it`), (err) => {
    console.error(err.message);
    process.exit(1);
  });
}
