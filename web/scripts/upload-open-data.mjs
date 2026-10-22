/**
 * Owner step: upload an open data export folder (`npm run kb -- open-data <folder>` in kb/) to the public bulk
 * bucket, under its own `open-data/` prefix, so it can never touch the bulk export's `latest.json`. Create-only
 * per folder, like scripts/upload-bulk.mjs: every object is written with If-None-Match: *, a new export is a new
 * folder named by its generatedAt stamp, the data files go first and manifest.json last, and then
 * `open-data/latest.json`, the one object this script overwrites, points at the folder just uploaded. The page at
 * /database/download reads that pointer.
 *
 * Before anything is sent, each file is checked against the manifest's sha256 and byte count, every path the
 * manifest names must be one of the export's own (observed/, game-files/ or schema/), and a folder whose files carry
 * what looks like a local filesystem path is refused.
 *
 * Environment (never arguments, never committed): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and
 * BULK_BUCKET (the public bucket; must not be the uploads bucket).
 *   node scripts/upload-open-data.mjs <folder with manifest.json>
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { AwsClient } from "aws4fetch";

const TYPES = { ".ndjson": "application/x-ndjson", ".json": "application/json", ".md": "text/markdown; charset=utf-8" };
const CACHE = "public, max-age=31536000, immutable";
const PREFIX = "open-data";

/** What a published file must never carry: a machine's own filesystem paths (Windows drive form, /Users/, /home/, AppData). */
const LOCAL_PATH = /[A-Za-z]:\\|\/(?:Users|home)\/|AppData[\\/]/;
/** The paths an export holds: a data file, or a schema, inside one of its three folders. */
const EXPORT_PATH = /^(?:observed|game-files)\/[a-z0-9-]+\.ndjson$|^schema\/[a-z0-9-]+\.schema\.json$/;

const typeOf = (name) => TYPES[name.slice(name.lastIndexOf("."))] ?? "application/octet-stream";

/** The upload order: the data files and schemas the manifest lists, README and LICENCE, then the manifest. Throws on a bad path, a hash mismatch or a local path. */
export function plan(folder, manifestText) {
  const manifest = JSON.parse(manifestText);
  if (manifest.schema !== "everloot.open-data/1" || !Array.isArray(manifest.files) || typeof manifest.generatedAt !== "string") throw new Error("manifest.json is not an open data manifest");
  const manifestHit = manifestText.match(LOCAL_PATH);
  if (manifestHit) throw new Error(`manifest.json carries what looks like a local filesystem path (${manifestHit[0]}); nothing uploaded`);
  const read = (name, check) => {
    const body = readFileSync(join(folder, name));
    const hit = body.toString("utf8").match(LOCAL_PATH);
    if (hit) throw new Error(`${name} carries what looks like a local filesystem path (${hit[0]}); nothing uploaded`);
    if (check) {
      if (createHash("sha256").update(body).digest("hex") !== check.sha256) throw new Error(`${name} does not match its sha256 in manifest.json; nothing uploaded`);
      if (body.length !== check.bytes) throw new Error(`${name} is ${body.length} bytes, manifest.json says ${check.bytes}; nothing uploaded`);
    }
    return { name, body, type: typeOf(name) };
  };
  const data = manifest.files.map((f) => {
    if (!EXPORT_PATH.test(f.path) || !EXPORT_PATH.test(f.schema)) throw new Error(`${f.path} is not a path inside an export; nothing uploaded`);
    return read(f.path, f);
  });
  const schemas = manifest.files.map((f) => read(f.schema));
  const stamp = manifest.generatedAt.replace(/[:.]/g, "-");
  return { stamp, files: [...data, ...schemas, read("README.md"), read("LICENCE.md"), { name: "manifest.json", body: Buffer.from(manifestText, "utf8"), type: typeOf("manifest.json") }] };
}

/**
 * @param {{ folder: string, env?: Record<string, string | undefined>, fetch?: (req: Request) => Promise<Response> }} options
 * @returns {Promise<string>} the folder stamp the export was written under
 */
export async function uploadOpenData({ folder, env = process.env, fetch = globalThis.fetch }) {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: secret, BULK_BUCKET: bucket, R2_BUCKET: uploads } = env;
  if (!account || !id || !secret || !bucket) throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and BULK_BUCKET must be set");
  if (uploads && bucket === uploads) throw new Error("BULK_BUCKET is the uploads bucket; the export goes to a public bucket of its own");
  const { stamp, files } = plan(folder, readFileSync(join(folder, "manifest.json"), "utf8"));
  const aws = new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: "s3", region: "auto" });
  const base = `https://${account}.r2.cloudflarestorage.com/${bucket}`;
  for (const f of files) {
    const req = await aws.sign(`${base}/${PREFIX}/${stamp}/${f.name}`, {
      method: "PUT", body: f.body, headers: { "content-type": f.type, "cache-control": CACHE, "if-none-match": "*" },
    });
    const res = await fetch(req);
    if (res.status === 412) throw new Error(`${PREFIX}/${stamp}/${f.name} already exists; not overwritten`);
    if (!res.ok) throw new Error(`${PREFIX}/${stamp}/${f.name} upload failed (${res.status})`);
  }
  const latest = JSON.stringify({ stamp, manifest: `${PREFIX}/${stamp}/manifest.json` }) + "\n";
  const req = await aws.sign(`${base}/${PREFIX}/latest.json`, {
    method: "PUT", body: latest, headers: { "content-type": TYPES[".json"], "cache-control": "public, max-age=0, s-maxage=300" },
  });
  const res = await fetch(req);
  if (!res.ok) throw new Error(`${PREFIX}/latest.json upload failed (${res.status})`);
  return stamp;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [folder] = process.argv.slice(2);
  if (!folder || folder.startsWith("-")) {
    console.error("usage: node scripts/upload-open-data.mjs <folder with manifest.json>");
    process.exit(2);
  }
  uploadOpenData({ folder }).then((stamp) => console.log(`uploaded ${PREFIX}/${stamp}/ and pointed ${PREFIX}/latest.json at it`), (err) => {
    console.error(err.message);
    process.exit(1);
  });
}
