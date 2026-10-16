import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { buildLoreRelease } from "@/test/lore-release";

let release = "";
let untyped = "";
beforeAll(async () => { release = await buildLoreRelease(); untyped = await buildLoreRelease({ typed: false }); });
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.restoreAllMocks(); });

async function get(path = release) {
  vi.stubEnv("KB_SNAPSHOT_PATH", path);
  const { GET } = await import("./route");
  return GET();
}

test("lists one URL per type and letter plus the coverage page, with escaped query strings", async () => {
  const res = await get();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/xml");
  expect(res.headers.get("cache-control")).toBe("public, s-maxage=86400, stale-while-revalidate=604800");
  const xml = await res.text();
  expect(xml.match(/<loc>/g)).toHaveLength(5 * 27 + 1);
  expect(xml).toContain("<loc>https://everloot.app/lore/npcs</loc>");
  expect(xml).toContain("<loc>https://everloot.app/lore/npcs?letter=b</loc>");
  expect(xml).toContain("<loc>https://everloot.app/lore/items?letter=%23</loc>");
  expect(xml).toContain("<loc>https://everloot.app/lore/coverage</loc>");
  expect(xml).toContain("<lastmod>2026-10-15T00:00:00.000Z</lastmod>");
  expect(xml).not.toContain("letter=a<");
});

test("a release without type data has no browse pages to list", async () => {
  expect((await get(untyped)).status).toBe(404);
});

test("an unavailable release is a 503", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const res = await get(join(tmpdir(), "missing.sqlite"));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "Lore archive unavailable" });
});
