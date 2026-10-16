import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { buildLoreRelease } from "@/test/lore-release";

let release = "";
beforeAll(async () => { release = await buildLoreRelease(); });
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.restoreAllMocks(); });

async function get(path = release) {
  vi.stubEnv("KB_SNAPSHOT_PATH", path);
  const { GET } = await import("./route");
  return GET();
}

test("the index lists one chunk per 40,000 indexable pages with the manifest date", async () => {
  const res = await get();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/xml");
  expect(res.headers.get("cache-control")).toBe("public, s-maxage=86400, stale-while-revalidate=604800");
  const xml = await res.text();
  expect(xml).toContain("<sitemapindex");
  expect(xml).toContain("<loc>https://everloot.app/lore-sitemap/0.xml</loc>");
  expect(xml).toContain("<lastmod>2026-10-15T00:00:00.000Z</lastmod>");
});

test("an unavailable release is a 503, not an empty index", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const res = await get(join(tmpdir(), "missing.sqlite"));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "Lore archive unavailable" });
});

test("the index lists the browse-page chunk only when the release has type data", async () => {
  const typed = await (await get()).text();
  expect(typed).toContain("<loc>https://everloot.app/lore-sitemap/pages.xml</loc>");
  expect(typed.match(/<loc>/g)).toHaveLength(2);
  vi.resetModules();
  const untyped = await (await get(await buildLoreRelease({ typed: false }))).text();
  expect(untyped).not.toContain("pages.xml");
  expect(untyped.match(/<loc>/g)).toHaveLength(1);
});
