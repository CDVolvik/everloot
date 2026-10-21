import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { loadPrivatePathPattern } from "../../../../../kb/src/wiki/data";

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className} {...rest}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, usePathname: () => "/" }));

// Three installs agree on an item name and an NPC name; the quest has no title anywhere, so it reads "Quest 166".
const agree = <T,>(row: (installId: string) => T) => ["a", "b", "c"].map(row);
const facts = vi.hoisted(() => ({ rates: [] as unknown[], names: [] as unknown[], npcs: [] as unknown[], unreachable: false }));
const world = vi.hoisted(() => ({ npcs: [] as unknown[], quests: [] as unknown[], vendors: [] as unknown[], unreachable: false }));
vi.mock("@/lib/rollup-compute", () => ({ loadItemFacts: async () => facts, loadWorldFacts: async () => world }));
facts.names = agree((installId) => ({ installId, itemId: 2589, name: "Linen Cloth" }));
world.npcs = agree((installId) => ({ installId, npcId: 639, name: "Edwin VanCleef", mapId: 1436, x: 40, y: 70, positionKind: "npc" }));

const FIXTURES = fileURLToPath(new URL("../../../test/wiki", import.meta.url));
beforeEach(() => { vi.stubEnv("WIKI_DIR", FIXTURES); });
afterEach(() => { vi.unstubAllEnvs(); });

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const render = async (slug: string) => {
  const { default: WikiArticle } = await import("./page");
  return renderToStaticMarkup(await WikiArticle(params(slug)));
};

test("a published page that meets the bar is indexed, with a self canonical and a title under 60 characters", async () => {
  const { generateMetadata } = await import("./page");
  const meta = await generateMetadata(params("test-dungeon"));
  expect(meta.title).toBe("Test Dungeon · WoW Forever dungeon");
  expect(String(meta.title).length).toBeLessThan(60);
  expect(meta.description).toBe("A fixture dungeon page, published and written in Everloot's own words, for the page tests.");
  expect(meta.robots).toEqual({ index: true, follow: true });
  expect(meta.alternates?.canonical).toBe("/wiki/test-dungeon");
  expect(meta.openGraph).toMatchObject({ type: "article", url: "/wiki/test-dungeon" });
});

test("a published page is in sitemap.xml, dated by its review; adapted pages and drafts are not", async () => {
  const { default: sitemap } = await import("../../sitemap");
  const entries = new Map((await sitemap()).map((e) => [new URL(e.url).pathname, e]));
  expect(entries.get("/wiki/test-dungeon")?.lastModified).toEqual(new Date("2026-10-27"));
  expect(entries.has("/wiki")).toBe(true);
  expect(entries.has("/wiki/test-zone")).toBe(false);
  expect(entries.has("/wiki/test-draft")).toBe(false);
});

test("only published pages are built, and a draft answers 404 in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const { default: WikiArticle, generateMetadata, generateStaticParams } = await import("./page");
  expect(generateStaticParams().map((p) => p.slug).sort()).toEqual(["test-dungeon", "test-zone"]);
  await expect(WikiArticle(params("test-draft"))).rejects.toThrow("NOT_FOUND");
  await expect(WikiArticle(params("no-such-page"))).rejects.toThrow("NOT_FOUND");
  expect((await generateMetadata(params("test-draft"))).robots).toEqual({ index: false, follow: true });
});

test("an adapted page shows exactly one credit line and stays out of search; an original page shows none", async () => {
  const adapted = await render("test-zone");
  expect(adapted.match(/data-wiki-credit/g)).toHaveLength(1);
  expect(adapted).toMatch(/Adapted from <span><a href="https:\/\/warcraft\.wiki\.gg\/wiki\/Westfall"[^>]*>Westfall<\/a><\/span> by Warcraft Wiki contributors · <a href="https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/" rel="license noopener"[^>]*>CC BY-SA 4.0<\/a>/);
  const { generateMetadata } = await import("./page");
  expect((await generateMetadata(params("test-zone"))).robots).toEqual({ index: false, follow: true });

  const original = await render("test-dungeon");
  expect(original).not.toContain("data-wiki-credit");
  expect(original).not.toContain("Adapted from");
  expect(original).not.toContain("CC BY-SA");
});

test("tokens link to their database pages under the name rules, and [[links]] to published pages only", async () => {
  const html = await render("test-dungeon");
  expect(html).toContain('<a href="/database/items/2589" data-wiki-token="item:2589">Linen Cloth</a>');
  expect(html).toContain('<a href="/database/npcs/639" data-wiki-token="npc:639">Edwin VanCleef</a>');
  expect(html).toContain('<a href="/database/quests/166" data-wiki-token="quest:166">Quest 166</a>');
  expect(html).toContain('<a href="/database/zones/1436-westfall" data-wiki-token="zone:1436">Westfall</a>');
  expect(html).toContain('<a href="/wiki/test-zone" data-wiki-link="test-zone">Test Zone</a>');
  expect(html).not.toContain('href="/wiki/test-draft"');
  expect(html).toContain("<span>test draft</span>");
  // Inline Markdown is drawn, and quotes keep their words.
  expect(html).toContain("&quot;a short quote stays a quote&quot;");
});

test("the page shows title, summary, sections in type order, categories, Linked from and placeholders, with no visible breadcrumb", async () => {
  const html = await render("test-dungeon");
  expect(html).toContain("<h1");
  expect(html).toContain("Test Dungeon");
  expect(html).toContain("A fixture dungeon page, published and written in Everloot&#x27;s own words, for the page tests.");
  const order = ["Overview", "Getting there", "History", "In WoW: Forever"].map((h) => html.indexOf(`>${h}</h2>`));
  expect(order.every((i) => i > 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(html).toContain("Dungeons · Eastern Kingdoms · Westfall");
  // "Linked from": published pages only, collapsed.
  expect(html).toMatch(/<details[^>]*id="linked-from"/);
  expect(html).toContain("Linked from (1)");
  expect(html).toMatch(/<a href="\/wiki\/test-zone"[^>]*>Test Zone<\/a><\/li>/);
  expect(html).not.toContain("Test Draft");
  // Infobox and data blocks are marked placeholders: no numbers in them.
  expect(html).toContain('data-wiki-placeholder="infobox"');
  expect(html).toMatch(/data-wiki-placeholder="blocks"[\s\S]*Bosses[\s\S]*Loot by boss/);
  // No visible trail: the BreadcrumbList is structured data only, beside the Article.
  expect(html).not.toMatch(/<nav[^>]*breadcrumb/i);
  expect(html).not.toMatch(/>Home</);
  expect(html).toContain('"@type":"BreadcrumbList"');
  expect(html).toContain('"@type":"Article"');
  expect(html).toContain('"headline":"Test Dungeon"');
  expect(html).toContain('"dateModified":"2026-10-27"');
  expect(html).toContain('"about":{"@type":"Thing","name":"Deadmines"}');
  // No ads on wiki pages.
  expect(html).not.toContain("adsbygoogle");
});

test("no private path or internal name reaches the output", async () => {
  const pattern = loadPrivatePathPattern();
  for (const slug of ["test-dungeon", "test-zone"]) expect(await render(slug)).not.toMatch(pattern);
});
