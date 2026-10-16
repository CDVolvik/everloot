import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { buildLoreRelease } from "@/test/lore-release";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

let release = "";
beforeAll(async () => { release = await buildLoreRelease(); });
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.restoreAllMocks(); });

async function render(path = release) {
  vi.stubEnv("KB_SNAPSHOT_PATH", path);
  const { default: CoveragePage } = await import("./page");
  return renderToStaticMarkup(await CoveragePage());
}

test("the coverage page reports types, facets, pages, damage and the release date", async () => {
  const html = await render();
  expect(html).toMatch(/Zones and locations<\/a><\/th><td[^>]*>23</);
  expect(html).toMatch(/NPCs and characters<\/a><\/th><td[^>]*>3</);
  expect(html).toContain("Legion");
  expect(html).toContain("Orc");
  expect(html).toMatch(/Indexable pages[\s\S]{0,120}>28</);
  expect(html).toMatch(/Damaged pages[\s\S]{0,120}>1</);
  expect(html).toContain("2026-10-15");
  expect(html).toContain("not WoW: Forever data");
  expect(html).toContain('href="/lore/zones"');
});

test("a release without type data shows totals only and says it predates classification", async () => {
  const html = await render(await buildLoreRelease({ typed: false }));
  expect(html).toContain("This release predates classification.");
  expect(html).toContain("30"); // wiki pages from the manifest counts
  expect(html).toContain("not measured");
});

test("metadata is indexed with its canonical", async () => {
  vi.stubEnv("KB_SNAPSHOT_PATH", release);
  const { metadata } = await import("./page");
  expect(metadata.alternates).toMatchObject({ canonical: "/lore/coverage" });
});

test("an unavailable release renders the unavailable copy", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await render(join(tmpdir(), "missing.sqlite"))).toContain("Lore archive unavailable");
});
