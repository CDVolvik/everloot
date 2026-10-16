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

async function render(query: Record<string, string>, path = release) {
  vi.stubEnv("KB_SNAPSHOT_PATH", path);
  const { default: SearchPage } = await import("./page");
  return renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve(query) }));
}

test("without a query it shows the form and no results", async () => {
  const html = await render({});
  expect(html).toContain('name="q"');
  expect(html).toContain('action="/search"');
  expect(html).not.toContain("<ol");
});

test("a query lists 20 hits linking to lore pages, with a next link", async () => {
  const html = await render({ q: "grommash" });
  expect(html.match(/href="\/lore\/1\d\d-zone-\d+"/g)).toHaveLength(20);
  expect(html).toContain('href="/search?q=grommash&amp;page=2"');
  expect(html).toContain("lore · 2023");
});

test("the last page has no next link; a page past the end says nothing matched", async () => {
  expect(await render({ q: "grommash", page: "2" })).not.toContain("page=3");
  const past = await render({ q: "grommash", page: "3" });
  expect(past).toContain("No more results");
  expect(past).not.toContain("No lore page matches that.");
  expect(past).toContain('href="/search?q=grommash"');
  expect(past).not.toContain("page=4");
});

test("page 0 and a non-numeric page behave as page 1", async () => {
  for (const page of ["0", "abc", "-4", "1e300"]) {
    expect(await render({ q: "grommash", page })).toContain("page=2");
  }
});

test("page numbers beyond the cap or beyond 64 bits render no hits, never a crash", async () => {
  for (const page of ["1000000000000000000", "51"]) {
    const html = await render({ q: "grommash", page });
    expect(html).toContain("No more results");
    expect(html).not.toContain("Next");
  }
});

test("no hits offers the wiki's own search for the encoded query", async () => {
  const html = await render({ q: "zzzz notfound" });
  expect(html).toContain("No lore page matches that.");
  expect(html).toContain('href="https://warcraft.wiki.gg/index.php?search=zzzz%20notfound"');
});

test("the page is never indexed and canonicalises to /search", async () => {
  vi.stubEnv("KB_SNAPSHOT_PATH", release);
  const { metadata } = await import("./page");
  expect(metadata.robots).toMatchObject({ index: false, follow: true });
  expect(metadata.alternates).toMatchObject({ canonical: "/search" });
});

test("an unavailable release renders the unavailable copy", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await render({ q: "thrall" }, join(tmpdir(), "missing.sqlite"))).toContain("Lore archive unavailable");
});

test("type chips filter the results and keep the query; an unknown type behaves as All", async () => {
  const zones = await render({ q: "grommash", type: "zone" });
  expect(zones).toContain('href="/search?q=grommash&amp;type=npc"');
  expect(zones).toContain('href="/search?q=grommash"');
  expect(zones.match(/href="\/lore\/1\d\d-zone-\d+"/g)).toHaveLength(20);
  const npcs = await render({ q: "grommash", type: "npc" });
  expect(npcs).toContain("No lore page matches that.");
  const mounts = await render({ q: "grommash", type: "mounts" });
  expect(mounts.match(/href="\/lore\/1\d\d-zone-\d+"/g)).toHaveLength(20);
});

test("type chips are hidden for a release without type data", async () => {
  const html = await render({ q: "grommash" }, await buildLoreRelease({ typed: false }));
  expect(html).not.toContain("type=npc");
});
