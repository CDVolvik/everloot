/**
 * One-time owner step: upload the approved knowledge release to the site's private R2 bucket so
 * prebuild (fetch-release.mjs) can ship it inside /mcp. Create-only: a conditional PUT never
 * overwrites an existing object. The file must match its manifest's sha256 before anything is sent.
 * Run with the production R2 variables in the environment (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET):
 *   node scripts/upload-release.mjs <path/to/release.sqlite> [knowledge/]
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { AwsClient } from "aws4fetch";

/**
 * @param {{ file: string, prefix?: string, env?: Record<string, string | undefined>, fetch?: (req: Request) => Promise<Response> }} options
 * @returns {Promise<string>} the release object key
 */
export async function uploadRelease({ file, prefix = "knowledge/", env = process.env, fetch = globalThis.fetch }) {
  const manifestText = readFileSync(`${file}.manifest.json`, "utf8");
  const body = readFileSync(file);
  const expected = JSON.parse(manifestText).sha256;
  if (createHash("sha256").update(body).digest("hex") !== expected) throw new Error("release does not match its manifest; nothing uploaded");
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: secret, R2_BUCKET: bucket } = env;
  if (!account || !id || !secret || !bucket) throw new Error("R2 variables are not set");
  const aws = new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: "s3", region: "auto" });
  const key = `${prefix}${basename(file)}`;
  for (const [objectKey, data, type] of [[`${key}.manifest.json`, manifestText, "application/json"], [key, body, "application/vnd.sqlite3"]]) {
    const req = await aws.sign(`https://${account}.r2.cloudflarestorage.com/${bucket}/${objectKey}`, {
      method: "PUT", body: data, headers: { "content-type": type, "if-none-match": "*" },
    });
    const res = await fetch(req);
    if (res.status === 412) throw new Error(`${objectKey} already exists; not overwritten`);
    if (!res.ok) throw new Error(`${objectKey} upload failed (${res.status})`);
  }
  return key;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, prefix] = process.argv.slice(2);
  if (!file) throw new Error("usage: node scripts/upload-release.mjs <release.sqlite> [knowledge/]");
  const key = await uploadRelease({ file, ...(prefix ? { prefix } : {}) });
  console.log(`Uploaded. Set EVERLOOT_KB_RELEASE_KEY=${key} in Production, then redeploy.`);
}
