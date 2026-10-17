// Uploads an extracted asset folder (`npm run kb -- client-assets`) to an S3-compatible bucket such as
// Cloudflare R2. A maintainer runs it with their own credentials; nothing runs it for them.
//
//   node scripts/upload-game-assets.mjs <kb/data/assets/<build>> [--dry-run]
//   node scripts/upload-game-assets.mjs --snapshot <kb/data/client/<build>.sqlite> [--dry-run]
//
// With --snapshot it first runs the extraction (`client-assets` in kb/, which needs Python with Pillow)
// and then uploads the folder it wrote: one command for the talent art, item icons and tooltips, class,
// buff and profession icons and the map pictures.
//
// Environment (never arguments, never committed):
//   ASSETS_S3_ENDPOINT        https://<account id>.r2.cloudflarestorage.com
//   ASSETS_BUCKET             the bucket name
//   ASSETS_ACCESS_KEY_ID      an access key that can write to that bucket only
//   ASSETS_SECRET_ACCESS_KEY  its secret
//   ASSETS_REGION             optional, "auto" by default (R2)
//
// What it does: checks the folder against its manifest (every file there, every hash right, nothing
// extra, only .webp images and the item .json shards), then uploads under the build's folder name,
// files first and manifest.json last, so a half-finished upload never shows a manifest that points at
// missing files. See docs/ASSETS.md.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AwsClient } from "aws4fetch";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const snapshotAt = args.indexOf("--snapshot");
const snapshot = snapshotAt >= 0 ? args[snapshotAt + 1] : null;
const positional = args.filter((a, i) => !a.startsWith("--") && !(snapshotAt >= 0 && i === snapshotAt + 1));
const usage = "usage: node scripts/upload-game-assets.mjs <asset folder> [--dry-run]\n   or: node scripts/upload-game-assets.mjs --snapshot <snapshot.sqlite> [--dry-run]";
if (snapshotAt >= 0 && !snapshot) fail(usage);
if (!snapshot && !positional[0]) fail(usage);

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Runs `client-assets` in kb/ on the snapshot and returns the folder it wrote. */
function extract(snapshotPath) {
  const kb = fileURLToPath(new URL("../../kb/", import.meta.url));
  const tsx = join(kb, "node_modules", "tsx", "dist", "cli.mjs");
  console.log(`Extracting from ${snapshotPath} ...`);
  const run = spawnSync(process.execPath, [tsx, "src/cli.ts", "client-assets", resolve(snapshotPath)], { cwd: kb, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.status !== 0) fail(`The extraction stopped (exit ${run.status ?? run.signal}); nothing uploaded.`);
  const out = /^-> (.+)$/m.exec(run.stdout ?? "")?.[1]?.trim();
  if (!out) fail("The extraction did not say where it wrote the files; nothing uploaded.");
  return resolve(kb, out);
}

const root = snapshot ? extract(snapshot) : resolve(positional[0]);
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
if (manifest.schema !== "everloot.game-assets/1") fail(`manifest.json has schema ${manifest.schema}, expected everloot.game-assets/1`);

// Every file the manifest names, with its hash. Older manifests have no maps or items.
const expected = new Map();
for (const group of [manifest.icons, manifest.frames, manifest.maps ?? {}, manifest.items?.shards ?? {}]) {
  for (const f of Object.values(group)) expected.set(f.file, f.sha256);
}

function walk(base, prefix = "") {
  return readdirSync(join(base, prefix)).flatMap((name) => {
    const rel = prefix ? `${prefix}/${name}` : name;
    return statSync(join(base, rel)).isDirectory() ? walk(base, rel) : [rel];
  });
}
const present = walk(root).filter((f) => f !== "manifest.json");
const allowed = (f) => f.endsWith(".webp") || /^items\/\d+\.json$/.test(f);
const problems = [];
for (const f of present) if (!expected.has(f)) problems.push(`not in the manifest: ${f}`);
for (const [f, sha] of expected) {
  if (!present.includes(f)) problems.push(`missing: ${f}`);
  else if (createHash("sha256").update(readFileSync(join(root, f))).digest("hex") !== sha) problems.push(`hash differs: ${f}`);
}
for (const f of present) if (!allowed(f)) problems.push(`only .webp images and items/<n>.json go up: ${f}`);
if (problems.length) fail(`The folder does not match its manifest, nothing uploaded:\n${problems.slice(0, 20).join("\n")}`);

const prefix = basename(root);
const counts = { icons: Object.keys(manifest.icons).length, frames: Object.keys(manifest.frames).length, maps: Object.keys(manifest.maps ?? {}).length, itemShards: Object.keys(manifest.items?.shards ?? {}).length };
console.log(`${present.length} files + manifest.json for build ${manifest.build.version} -> ${prefix}/${dry ? " (dry run, nothing sent)" : ""}`);
console.log(`  ${counts.icons} icons, ${counts.frames} frame pieces, ${counts.maps} map pictures, ${counts.itemShards} item shards`);
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

// Each build has its own folder, so its files never change: they can be cached for a year. Eight at a
// time: item icons run to thousands of files.
let done = 0;
const queue = [...present];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let f = queue.shift(); f !== undefined; f = queue.shift()) {
    await put(f, f.endsWith(".json") ? "application/json" : "image/webp", "public, max-age=31536000, immutable");
    if (++done % 500 === 0) console.log(`  ${done} of ${present.length}`);
  }
}));
await put("manifest.json", "application/json", "public, max-age=300");
console.log(`Done. Set NEXT_PUBLIC_GAME_ASSETS_URL to <the bucket's public URL>/${prefix} and redeploy.`);
