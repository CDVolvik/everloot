import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { plan, uploadBulk } from "./upload-bulk.mjs";

const ENV = { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret", BULK_BUCKET: "everloot-bulk", R2_BUCKET: "everloot-uploads" };

let dir: string;
const edges = '{"fromKind":"item","fromId":1}\n';
function index(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    protocol: "1.0.0", generatedAt: "2026-10-18T12:00:00.000Z", dataAsOf: null, build: "70450", site: "https://everloot.app",
    licence: "CC BY-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/", credit: "Everloot contributors",
    files: [{ name: "edges.ndjson", dataset: "edges", format: "ndjson", rowsOf: "edgesResponse", field: "edges", rows: 1, bytes: Buffer.byteLength(edges), sha256: createHash("sha256").update(edges).digest("hex"), data: "game-files", attribution: null, gameData: null }],
    ...overrides,
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "everloot-bulk-upload-"));
  writeFileSync(join(dir, "edges.ndjson"), edges);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("the plan lists the data files first and the index last, under a folder named by the stamp", () => {
  const p = plan(dir, index());
  expect(p.stamp).toBe("2026-10-18T12-00-00-000Z");
  expect(p.files.map((f: { name: string }) => f.name)).toEqual(["edges.ndjson", "index.json"]);
  expect(p.files[0].type).toBe("application/x-ndjson");
});

test("a file that does not match its hash or size in the index stops the upload before anything is sent", () => {
  expect(() => plan(dir, index({ files: [{ ...JSON.parse(index()).files[0], sha256: "0".repeat(64) }] }))).toThrow(/does not match its sha256/);
  expect(() => plan(dir, index({ files: [{ ...JSON.parse(index()).files[0], bytes: 1 }] }))).toThrow(/bytes/);
});

test("every object is written create-only and immutable, then latest.json points at the folder", async () => {
  writeFileSync(join(dir, "index.json"), index());
  const seen: { url: string; ifNoneMatch: string | null; cache: string | null }[] = [];
  const fetch = async (req: Request) => {
    seen.push({ url: req.url, ifNoneMatch: req.headers.get("if-none-match"), cache: req.headers.get("cache-control") });
    return new Response("", { status: 200 });
  };
  expect(await uploadBulk({ folder: dir, env: ENV, fetch })).toBe("2026-10-18T12-00-00-000Z");
  expect(seen.map((s) => s.url)).toEqual([
    "https://acct.r2.cloudflarestorage.com/everloot-bulk/2026-10-18T12-00-00-000Z/edges.ndjson",
    "https://acct.r2.cloudflarestorage.com/everloot-bulk/2026-10-18T12-00-00-000Z/index.json",
    "https://acct.r2.cloudflarestorage.com/everloot-bulk/latest.json",
  ]);
  expect(seen.slice(0, 2).every((s) => s.ifNoneMatch === "*" && s.cache?.includes("immutable"))).toBe(true);
  expect(seen[2].ifNoneMatch).toBeNull();
});

test("an existing folder is never overwritten, and the uploads bucket is refused as the target", async () => {
  writeFileSync(join(dir, "index.json"), index());
  const fetch = async () => new Response("", { status: 412 });
  await expect(uploadBulk({ folder: dir, env: ENV, fetch })).rejects.toThrow(/already exists/);
  await expect(uploadBulk({ folder: dir, env: { ...ENV, BULK_BUCKET: "everloot-uploads" }, fetch })).rejects.toThrow(/uploads bucket/);
});
