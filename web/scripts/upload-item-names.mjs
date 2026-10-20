// Uploads the item names the site may show (`npm run kb -- item-names`) to the PRIVATE bucket, where the site's
// server reads them with its read-only key. A maintainer runs it with their own credentials.
//
//   node scripts/upload-item-names.mjs <kb/data/assets/<build folder>-names/item-names.json> [--dry-run]
//
// The file goes to <private bucket>/<build folder>/item-names.json, beside the item tooltip facts. Unlike them it
// changes within a build (the ledger grows as sources arrive), so it is cached for five minutes, not a year.
// Same environment as upload-game-assets.mjs: ASSETS_S3_ENDPOINT, ASSETS_BUCKET (only to refuse it),
// ASSETS_PRIVATE_BUCKET, ASSETS_ACCESS_KEY_ID, ASSETS_SECRET_ACCESS_KEY, ASSETS_REGION (optional).

import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { AwsClient } from "aws4fetch";
import { itemNamesCheck, withRetry } from "./game-assets-upload.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const files = args.filter((a) => a !== "--dry-run");
if (files.length !== 1 || files[0].startsWith("--")) fail("usage: node scripts/upload-item-names.mjs <.../<build folder>-names/item-names.json> [--dry-run]");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const file = resolve(files[0]);
if (basename(file) !== "item-names.json") fail(`expected an item-names.json, not ${basename(file)}`);
const body = readFileSync(file);
const { prefix, problems } = itemNamesCheck(JSON.parse(body.toString("utf8")), basename(dirname(file)));
if (problems.length) fail(`Not uploaded:\n${problems.join("\n")}`);
const { count, build } = JSON.parse(body.toString("utf8"));
console.log(`${count} names for build ${build.version} -> <private bucket>/${prefix}/item-names.json`);
if (dry) {
  console.log("Dry run, nothing sent.");
  process.exit(0);
}

const missing = ["ASSETS_S3_ENDPOINT", "ASSETS_BUCKET", "ASSETS_PRIVATE_BUCKET", "ASSETS_ACCESS_KEY_ID", "ASSETS_SECRET_ACCESS_KEY"].filter((k) => !process.env[k]);
if (missing.length) fail(`Set ${missing.join(", ")} in the environment first.`);
if (process.env.ASSETS_PRIVATE_BUCKET === process.env.ASSETS_BUCKET) fail("ASSETS_PRIVATE_BUCKET must be a different, private bucket: the names file must not be public.");

const client = new AwsClient({
  accessKeyId: process.env.ASSETS_ACCESS_KEY_ID,
  secretAccessKey: process.env.ASSETS_SECRET_ACCESS_KEY,
  service: "s3",
  region: process.env.ASSETS_REGION || "auto",
});
const url = `${process.env.ASSETS_S3_ENDPOINT.replace(/\/+$/, "")}/${process.env.ASSETS_PRIVATE_BUCKET}/${prefix}/item-names.json`;
try {
  await withRetry(async () => {
    const res = await client.fetch(url, { method: "PUT", headers: { "content-type": "application/json", "cache-control": "private, max-age=300" }, body });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  });
} catch (e) {
  fail(`Upload failed after 4 tries: ${e.message}`);
}
console.log("Done. The pages read it within the hour (each server instance keeps a read for up to an hour).");
