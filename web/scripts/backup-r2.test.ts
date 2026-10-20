import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { mirrorBucket } from "./backup-r2.mjs";

const env = { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "AKID", R2_SECRET_ACCESS_KEY: "synthetic", R2_BUCKET: "everloot-uploads" };
const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const quiet = () => {};

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A fake R2 bucket: ListObjectsV2 pages of one key each, and GETs that can lie. */
function bucket(objects: Record<string, string>, corrupt: string[] = []) {
  const keys = Object.keys(objects).sort();
  return vi.fn(async (req: Request) => {
    const url = new URL(req.url);
    if (url.searchParams.get("list-type") === "2") {
      const start = Number(url.searchParams.get("continuation-token") ?? 0);
      const key = keys[start];
      const more = start + 1 < keys.length;
      const body = `<ListBucketResult>${key ? `<Contents><Key>${escapeXml(key)}</Key><Size>${Buffer.byteLength(objects[key])}</Size><ETag>&quot;${md5(objects[key])}&quot;</ETag></Contents>` : ""}` +
        `<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${start + 1}</NextContinuationToken>` : ""}</ListBucketResult>`;
      return new Response(body);
    }
    const key = decodeURIComponent(url.pathname.split("/everloot-uploads/")[1]);
    if (!(key in objects)) return new Response("missing", { status: 404 });
    return new Response(corrupt.includes(key) ? "tampered" : objects[key]);
  });
}

const OBJECTS = {
  "uploads/2026-10-10/a.json": '{"records":[1]}',
  "uploads/2026-10-10/b.json": '{"records":[2]}',
  "snapshots/corpus.json": '{"records":[]}',
};

test("every object is mirrored with its key path, verified against its MD5, and listed in a manifest", async () => {
  const dest = mkdtempSync(join(tmpdir(), "everloot-r2-"));
  const fetch = bucket(OBJECTS);
  const result = await mirrorBucket({ dest, env, fetch, log: quiet, now: () => new Date("2026-10-10T03:00:00Z") });
  expect(result).toMatchObject({ objects: 3, downloaded: 3, kept: 0 });
  expect(readFileSync(join(dest, "uploads/2026-10-10/a.json"), "utf8")).toBe(OBJECTS["uploads/2026-10-10/a.json"]);
  const manifest = JSON.parse(readFileSync(join(dest, "_manifest.json"), "utf8"));
  expect(manifest).toMatchObject({ bucket: "everloot-uploads", count: 3, takenAt: "2026-10-10T03:00:00.000Z" });
  expect((fetch.mock.calls[0][0] as Request).headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
});

test("a second run downloads only what changed", async () => {
  const dest = mkdtempSync(join(tmpdir(), "everloot-r2-"));
  await mirrorBucket({ dest, env, fetch: bucket(OBJECTS), log: quiet });
  const again = await mirrorBucket({ dest, env, fetch: bucket({ ...OBJECTS, "uploads/2026-10-11/c.json": '{"records":[3]}' }), log: quiet });
  expect(again).toMatchObject({ objects: 4, downloaded: 1, kept: 3 });
});

test("a corrupted download fails the run and leaves no manifest claiming completeness", async () => {
  const dest = mkdtempSync(join(tmpdir(), "everloot-r2-"));
  await expect(mirrorBucket({ dest, env, fetch: bucket(OBJECTS, ["uploads/2026-10-10/b.json"]), log: quiet }))
    .rejects.toThrow(/uploads\/2026-10-10\/b\.json/);
  expect(existsSync(join(dest, "_manifest.json"))).toBe(false);
  expect(existsSync(join(dest, "uploads/2026-10-10/b.json"))).toBe(false);
});

test("a key that contains entity-like text is decoded once and mirrored under its own name", async () => {
  const dest = mkdtempSync(join(tmpdir(), "everloot-r2-"));
  const objects = { "uploads/R&D &lt;notes&gt;.json": '{"records":[4]}' };
  const result = await mirrorBucket({ dest, env, fetch: bucket(objects), log: quiet });
  expect(result).toMatchObject({ objects: 1, downloaded: 1 });
  expect(readFileSync(join(dest, "uploads/R&D &lt;notes&gt;.json"), "utf8")).toBe('{"records":[4]}');
});

test("keys cannot escape the backup folder", async () => {
  const dest = mkdtempSync(join(tmpdir(), "everloot-r2-"));
  await expect(mirrorBucket({ dest, env, fetch: bucket({ "../escape.json": "x" }), log: quiet })).rejects.toThrow(/unsafe key/);
});

test("missing credentials stop before any request", async () => {
  const fetch = vi.fn();
  await expect(mirrorBucket({ dest: tmpdir(), env: {}, fetch, log: quiet })).rejects.toThrow(/R2 variables/);
  expect(fetch).not.toHaveBeenCalled();
});
