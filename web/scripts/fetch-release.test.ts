import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { fetchRelease } from "./fetch-release.mjs";
import { uploadRelease } from "./upload-release.mjs";

const NAME = "2026-10-05-everloot-public.sqlite";
const DB = Buffer.from("SQLite format 3\u0000 synthetic release bytes");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const MANIFEST = JSON.stringify({ sha256: sha(DB), createdAt: "2026-10-05" });
const env = {
  R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "AKID", R2_SECRET_ACCESS_KEY: "synthetic", R2_BUCKET: "everloot-uploads",
  EVERLOOT_KB_RELEASE_KEY: `knowledge/${NAME}`,
};
const quiet = () => {};

function r2(db: Buffer, manifest = MANIFEST) {
  return vi.fn(async (req: Request) => {
    if (req.url.endsWith(`${NAME}.manifest.json`)) return new Response(manifest);
    if (req.url.endsWith(NAME)) return new Response(new Uint8Array(db));
    return new Response("missing", { status: 404 });
  });
}

test("without a configured release key nothing is fetched and the build continues", async () => {
  const dir = mkdtempSync(join(tmpdir(), "everloot-release-"));
  const fetch = r2(DB);
  expect(await fetchRelease({ dir, env: { ...env, EVERLOOT_KB_RELEASE_KEY: "" }, fetch, log: quiet })).toBe("skipped");
  expect(fetch).not.toHaveBeenCalled();
});

test("a release already present with a matching hash is kept without a download", async () => {
  const dir = mkdtempSync(join(tmpdir(), "everloot-release-"));
  writeFileSync(join(dir, NAME), DB);
  writeFileSync(join(dir, `${NAME}.manifest.json`), MANIFEST);
  const fetch = r2(DB);
  expect(await fetchRelease({ dir, env, fetch, log: quiet })).toBe("present");
  expect(fetch).not.toHaveBeenCalled();
});

test("the release and manifest are downloaded with signed requests and the hash is verified", async () => {
  const dir = join(mkdtempSync(join(tmpdir(), "everloot-release-")), ".release");
  const fetch = r2(DB);
  expect(await fetchRelease({ dir, env, fetch, log: quiet })).toBe("downloaded");
  expect(readFileSync(join(dir, NAME))).toEqual(DB);
  const urls = fetch.mock.calls.map(([req]) => (req as Request).url);
  expect(urls).toEqual([
    `https://acct.r2.cloudflarestorage.com/everloot-uploads/knowledge/${NAME}.manifest.json`,
    `https://acct.r2.cloudflarestorage.com/everloot-uploads/knowledge/${NAME}`,
  ]);
  expect((fetch.mock.calls[0][0] as Request).headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
});

test("a hash mismatch removes the files, so /mcp serves 503 instead of an unverified release", async () => {
  const dir = mkdtempSync(join(tmpdir(), "everloot-release-"));
  mkdirSync(dir, { recursive: true });
  expect(await fetchRelease({ dir, env, fetch: r2(Buffer.from("tampered")), log: quiet })).toBe("mismatch");
  expect(existsSync(join(dir, NAME))).toBe(false);
  expect(existsSync(join(dir, `${NAME}.manifest.json`))).toBe(false);
});

test("a missing object is a failure the build survives", async () => {
  const dir = mkdtempSync(join(tmpdir(), "everloot-release-"));
  const fetch = vi.fn(async () => new Response("missing", { status: 404 }));
  expect(await fetchRelease({ dir, env, fetch, log: quiet })).toBe("failed");
});

test("the owner upload is create-only and refuses a file that does not match its manifest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "everloot-upload-"));
  const file = join(dir, NAME);
  writeFileSync(file, DB);
  writeFileSync(`${file}.manifest.json`, MANIFEST);
  const put = vi.fn(async () => new Response(null, { status: 200 }));
  expect(await uploadRelease({ file, env, fetch: put })).toBe(`knowledge/${NAME}`);
  for (const [req] of put.mock.calls as unknown as [Request][]) expect(req.headers.get("if-none-match")).toBe("*");
  const exists = vi.fn(async () => new Response(null, { status: 412 }));
  await expect(uploadRelease({ file, env, fetch: exists })).rejects.toThrow(/not overwritten/);
  writeFileSync(file, Buffer.from("tampered"));
  const never = vi.fn();
  await expect(uploadRelease({ file, env, fetch: never })).rejects.toThrow(/manifest/);
  expect(never).not.toHaveBeenCalled();
});
