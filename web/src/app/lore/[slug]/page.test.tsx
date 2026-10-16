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
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  permanentRedirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
}));

let release = "";
beforeAll(async () => { release = await buildLoreRelease(); });
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.restoreAllMocks(); });

async function page(path = release) {
  vi.stubEnv("KB_SNAPSHOT_PATH", path);
  return import("./page");
}
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

test("a substantive page is indexed with its name, canonical slug and first sentence", async () => {
  const { generateMetadata } = await page();
  const meta = await generateMetadata(params("1-thrall"));
  expect(meta.title).toBe("Thrall · Lore archive");
  expect(meta.robots).toMatchObject({ index: true, follow: true });
  expect(meta.alternates).toMatchObject({ canonical: "/lore/1-thrall" });
  expect(meta.description).toBe("Thrall is the former Warchief of the Horde.");
  expect(meta.openGraph).toMatchObject({ type: "article", title: "Thrall", description: "Thrall is the former Warchief of the Horde.", url: "/lore/1-thrall" });
  expect(meta.twitter).toMatchObject({ card: "summary", title: "Thrall" });
});

test("stubs and redirects are served but kept out of search engines", async () => {
  const { generateMetadata } = await page();
  expect((await generateMetadata(params("2-stub"))).robots).toMatchObject({ index: false, follow: true });
  expect((await generateMetadata(params("3-old-name"))).robots).toMatchObject({ index: false, follow: true });
});

test("the page shows the body, attribution and the predates-Forever note", async () => {
  const { default: LorePage } = await page();
  const html = renderToStaticMarkup(await LorePage(params("1-thrall")));
  expect(html).toContain("Lore archive · Warcraft Wiki, 2023 dump");
  expect(html).toContain("<h1");
  expect(html).toContain("Thrall is the former Warchief of the Horde.");
  expect(html).toContain("<li>Son of Durotan</li>");
  expect(html).toContain("https://warcraft.wiki.gg/wiki/Thrall");
  expect(html).toContain("retrieved 2023-11-13");
  expect(html).toContain("CC BY-SA 4.0");
  expect(html).toContain("Converted from wikitext with templates, tables and images removed, so some sentences may be missing values.");
  expect(html).toContain("Orcs");
  expect(html).toContain("2023-01-14");
  expect(html).toContain("predates WoW: Forever");
  expect(html).toContain('href="/database"');
});

test("a stale name part redirects to the canonical slug", async () => {
  const { default: LorePage } = await page();
  await expect(LorePage(params("1-wrong"))).rejects.toThrow("REDIRECT:/lore/1-thrall");
});

test("malformed slugs and unknown ids are not found", async () => {
  const { default: LorePage, generateMetadata } = await page();
  for (const slug of ["01-thrall", "abc", "999-x", "1-Thrall"]) {
    await expect(LorePage(params(slug))).rejects.toThrow("NOT_FOUND");
  }
  expect((await generateMetadata(params("abc"))).robots).toMatchObject({ index: false });
});

test("a curated row is labelled with its source and game version", async () => {
  const { default: LorePage } = await page();
  const html = renderToStaticMarkup(await LorePage(params("forever-launch-date")));
  expect(html).toContain("Lore archive · curated · forever");
  expect(html).toContain("November 4, 2026");
  expect(html).not.toContain("Converted from wikitext");
  expect(html).not.toContain("predates WoW: Forever");
  expect(html).toContain("https://news.blizzard.com/example");
});

test("lore pages render per request so an unavailable answer is never cached for a day", async () => {
  const mod = await page();
  expect(mod.dynamic).toBe("force-dynamic");
  expect((mod as Record<string, unknown>).revalidate).toBeUndefined();
});

test("an unavailable release renders the unavailable copy and is not indexed", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { default: LorePage, generateMetadata } = await page(join(tmpdir(), "missing.sqlite"));
  expect(renderToStaticMarkup(await LorePage(params("1-thrall")))).toContain("Lore archive unavailable");
  expect((await generateMetadata(params("1-thrall"))).robots).toMatchObject({ index: false });
});
