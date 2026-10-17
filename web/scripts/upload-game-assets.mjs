// Uploads an extracted asset folder (`npm run kb -- client-assets`) to an S3-compatible bucket such as
// Cloudflare R2. A maintainer runs it with their own credentials; nothing runs it for them.
//
//   node scripts/upload-game-assets.mjs <kb/data/assets/<build>> [--dry-run]
//
// Environment (never arguments, never committed):
//   ASSETS_S3_ENDPOINT        https://<account id>.r2.cloudflarestorage.com
//   ASSETS_BUCKET             the bucket name
//   ASSETS_ACCESS_KEY_ID      an access key that can write to that bucket only
//   ASSETS_SECRET_ACCESS_KEY  its secret
//   ASSETS_REGION             optional, "auto" by default (R2)
//
// What it does: checks the folder against its manifest (every file there, every hash right, nothing
// extra, only .webp files and manifest.json), then uploads under the build's folder name, files first
// and manifest.json last, so a half-finished upload never shows a manifest that points at missing
// files. See docs/ASSETS.md.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { AwsClient } from "aws4fetch";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) fail("usage: node scripts/upload-game-assets.mjs <asset folder> [--dry-run]");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const root = resolve(dir);
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
if (manifest.schema !== "everloot.game-assets/1") fail(`manifest.json has schema ${manifest.schema}, expected everloot.game-assets/1`);

// Every file the manifest names, with its hash.
const expected = new Map();
for (const group of [manifest.icons, manifest.frames]) for (const f of Object.values(group)) expected.set(f.file, f.sha256);

function walk(base, prefix = "") {
  return readdirSync(join(base, prefix)).flatMap((name) => {
    const rel = prefix ? `${prefix}/${name}` : name;
    return statSync(join(base, rel)).isDirectory() ? walk(base, rel) : [rel];
  });
}
const present = walk(root).filter((f) => f !== "manifest.json");
const problems = [];
for (const f of present) if (!expected.has(f)) problems.push(`not in the manifest: ${f}`);
for (const [f, sha] of expected) {
  if (!present.includes(f)) problems.push(`missing: ${f}`);
  else if (createHash("sha256").update(readFileSync(join(root, f))).digest("hex") !== sha) problems.push(`hash differs: ${f}`);
}
for (const f of present) if (!f.endsWith(".webp")) problems.push(`only .webp files go up: ${f}`);
if (problems.length) fail(`The folder does not match its manifest, nothing uploaded:\n${problems.slice(0, 20).join("\n")}`);

const prefix = basename(root);
console.log(`${present.length} files + manifest.json for build ${manifest.build.version} -> ${prefix}/${dry ? " (dry run, nothing sent)" : ""}`);
if (dry) process.exit(0);

const need = ["ASSETS_S3_ENDPOINT", "ASSETS_BUCKET", "ASSETS_ACCESS_KEY_ID", "ASSETS_SECRET_ACCESS_KEY"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) fail(`Set ${missing.join(", ")} in the environment first.`);

const client = new AwsClient({
  accessKeyId: process.env.ASSETS_ACCESS_KEY_ID,
  secretAccessKey: process.env.ASSETS_SECRET_ACCESS_KEY,
  service: "s3",
  region: process.env.ASSETS_REGION || "auto",
});
const endpoint = process.env.ASSETS_S3_ENDPOINT.replace(/\/+$/, "");

async function put(rel, type, cache) {
  const res = await client.fetch(`${endpoint}/${process.env.ASSETS_BUCKET}/${prefix}/${rel}`, {
    method: "PUT",
    headers: { "content-type": type, "cache-control": cache },
    body: readFileSync(join(root, rel)),
  });
  if (!res.ok) fail(`Upload of ${rel} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

for (const f of present) await put(f, "image/webp", "public, max-age=31536000, immutable");
await put("manifest.json", "application/json", "public, max-age=300");
console.log(`Done. Set NEXT_PUBLIC_GAME_ASSETS_URL to <the bucket's public URL>/${prefix} and redeploy.`);
