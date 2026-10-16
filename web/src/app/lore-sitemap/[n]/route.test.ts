import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { buildLoreRelease } from "@/test/lore-release";

let release = "";
beforeAll(async () => { release = await buildLoreRelease(); });
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.restoreAllMocks(); });

async function get(n: string, path = release) {
  vi.stubEnv("KB_SNAPSHOT_PATH", path);
  const { GET } = await import("./route");
  return GET(new Request(`https://everloot.app/lore-sitemap/${n}`), { params: Promise.resolve({ n }) });
}

test("chunk 0 lists only indexable pages as canonical lore URLs", async () => {
  const res = await get("0.xml");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/xml");
  const xml = await res.text();
  expect(xml).toContain("<urlset");
  expect(xml.match(/<loc>/g)).toHaveLength(26);
  expect(xml).toContain("<loc>https://everloot.app/lore/6-redirected-road</loc>");
  expect(xml).toContain("<loc>https://everloot.app/lore/1-thrall</loc>");
  expect(xml).toContain("<loc>https://everloot.app/lore/100-zone-1</loc>");
  expect(xml).not.toContain("2-stub");
  expect(xml).not.toContain("3-old-name");
  expect(xml).not.toContain("forever-launch-date");
  expect(xml).toContain("<lastmod>2026-10-15T00:00:00.000Z</lastmod>");
});

test("a chunk past the end or a malformed name is 404", async () => {
  expect((await get("1.xml")).status).toBe(404);
  expect((await get("abc.xml")).status).toBe(404);
  expect((await get("0")).status).toBe(404);
  expect((await get("-1.xml")).status).toBe(404);
});

test("an unavailable release is a 503", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const res = await get("0.xml", join(tmpdir(), "missing.sqlite"));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "Lore archive unavailable" });
});
