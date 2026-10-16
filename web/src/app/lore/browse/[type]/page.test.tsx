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
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

let release = "";
let untyped = "";
beforeAll(async () => { release = await buildLoreRelease(); untyped = await buildLoreRelease({ typed: false }); });
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.restoreAllMocks(); });

const props = (type: string, query: Record<string, string> = {}) => ({ params: Promise.resolve({ type }), searchParams: Promise.resolve(query) });

async function page(path = release) {
  vi.stubEnv("KB_SNAPSHOT_PATH", path);
  return import("./page");
}
async function html(type: string, query: Record<string, string> = {}, path = release) {
  const { default: BrowsePage } = await page(path);
  return renderToStaticMarkup(await BrowsePage(props(type, query)));
}

test("the default letter lists the type's pages alphabetically with letter tabs", async () => {
  const out = await html("zones", { letter: "z" });
  expect(out).toContain("Zones and locations");
  expect(out).toContain('href="/lore/zones?letter=b"');
  expect(out).toContain('href="/lore/zones"');
  expect(out.match(/href="\/lore\/1\d\d-zone-\d+"/g)).toHaveLength(22);
  expect(out.indexOf("Zone 1<")).toBeLessThan(out.indexOf("Zone 10<"));
  expect(out).toContain("Lore archive · Warcraft Wiki, 2023 dump");
});

test("facet filters narrow the list and the filter form keeps the letter", async () => {
  const out = await html("zones", { letter: "z", expansion: "Legion" });
  expect(out.match(/href="\/lore\/1\d\d-zone-\d+"/g)).toHaveLength(11);
  expect(out).toContain('name="expansion"');
  expect(out).toContain('<option value="Legion" selected');
  expect(out).toContain('name="letter"');
});

test("an empty filter result says so and keeps the form; a page past the end says no more results", async () => {
  const empty = await html("quests", { letter: "q" });
  expect(empty).toContain("No pages match these filters.");
  expect(empty).toContain("<form");
  const past = await html("zones", { letter: "z", page: "9" });
  expect(past).toContain("No more results.");
  expect(past).toContain('href="/lore/zones?letter=z"');
});

test("unknown types and letters are not found", async () => {
  const { default: BrowsePage } = await page();
  await expect(BrowsePage(props("mounts"))).rejects.toThrow("NOT_FOUND");
  await expect(BrowsePage(props("zones", { letter: "ab" }))).rejects.toThrow("NOT_FOUND");
});

test("metadata: unfiltered letter pages are indexed with a short canonical; filters and paging are not", async () => {
  const { generateMetadata } = await page();
  const a = await generateMetadata(props("zones"));
  expect(a.title).toBe("Zones and locations starting with A · Lore archive");
  expect(a.alternates).toMatchObject({ canonical: "/lore/zones" });
  expect(a.robots).toMatchObject({ index: true, follow: true });
  const z = await generateMetadata(props("zones", { letter: "z" }));
  expect(z.alternates).toMatchObject({ canonical: "/lore/zones?letter=z" });
  expect(z.robots).toMatchObject({ index: true });
  const paged = await generateMetadata(props("zones", { letter: "z", page: "2" }));
  expect(paged.robots).toMatchObject({ index: false, follow: true });
  expect(paged.alternates).toMatchObject({ canonical: "/lore/zones?letter=z" });
  const filtered = await generateMetadata(props("zones", { expansion: "Legion" }));
  expect(filtered.robots).toMatchObject({ index: false });
});

test("a release without type data explains itself and links to search", async () => {
  const out = await html("npcs", {}, untyped);
  expect(out).toContain("This release predates classification.");
  expect(out).toContain('href="/search"');
  expect(out).not.toContain('href="/lore/npcs?letter=b"');
});

test("an unavailable release renders the unavailable copy and is not indexed", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const missing = join(tmpdir(), "missing.sqlite");
  expect(await html("npcs", {}, missing)).toContain("Lore archive unavailable");
  const { generateMetadata } = await page(missing);
  expect((await generateMetadata(props("npcs"))).robots).toMatchObject({ index: false });
});
