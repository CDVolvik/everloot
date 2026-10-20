import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn() }));
vi.mock("@/lib/upload-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-store")>()),
  uploadStore: { loadCorpus: store.loadCorpus },
}));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import FarmingPage, { generateMetadata } from "./page";

let n = 0;
const base = (installId: string) => ({ installId, eventId: `e${n++}`, capturedAt: "2026-10-10T00:00:00.000Z" });
const three = ["a", "b", "c"];
const sight = (npcId: number, name: string, level: number, mapId: number) =>
  three.map((i) => ({ ...base(i), kind: "npc_sighting", positionKind: "npc", npcId, name, mapId, x: 40, y: 60, level, reaction: "hostile" }));
const loot = (npcId: number, itemId: number) =>
  three.map((i) => ({ ...base(i), kind: "loot", sourceEvidence: "loot-api", sourceNpcId: npcId, items: [{ itemId, count: 1 }] }));
// Elwynn Forest (1429): Hogger, level 11, drops a non-trade item; a level 15 mob drops Linen Cloth (2589).
// Durotar (1411): a level 5 mob drops Light Leather (2318). Nothing places herbs, ore or reputation.
const records = [
  ...sight(448, "Hogger", 11, 1429), ...loot(448, 1931),
  ...sight(500, "Defias Bandit", 15, 1429), ...loot(500, 2589),
  ...sight(600, "Mottled Boar", 5, 1411), ...loot(600, 2318),
];

const html = async (el: Promise<ReactNode>) => renderToStaticMarkup(await el);
const search = (s: Record<string, string> = {}) => ({ searchParams: Promise.resolve(s) });
/** One category's section of the page. */
const section = (page: string, slug: string) => {
  const at = page.indexOf(`data-farm="${slug}"`);
  return at < 0 ? null : page.slice(at, page.indexOf("</section>", at));
};
const zonesIn = (part: string | null) => [...(part ?? "").matchAll(/href="\/database\/zones\/(\d+)-/g)].map((m) => Number(m[1]));

beforeEach(() => store.loadCorpus.mockReset().mockResolvedValue({ uploads: 3, records, dataAsOf: `2026-10-10T00:00:${String(n++ % 60).padStart(2, "0")}.000Z` }));

test("each category lists the zones its mobs back, with levels, the zone page and the map", async () => {
  const page = await html(FarmingPage(search()));
  expect(zonesIn(section(page, "gold"))).toEqual([1411, 1429]);
  expect(section(page, "gold")).toContain("11–15");
  expect(section(page, "gold")).toContain('href="/map?zone=1429"');
  expect(zonesIn(section(page, "cloth"))).toEqual([1429]);
  expect(section(page, "cloth")).toContain(">15<");
  expect(zonesIn(section(page, "leather"))).toEqual([1411]);
  expect(section(page, "dungeons")).toContain("Shadowfang Keep");
});

test("a category with nothing behind it says so quietly, and invents nothing", async () => {
  const page = await html(FarmingPage(search()));
  expect(section(page, "herbs")).toContain("Routes for herbs arrive as players upload.");
  expect(section(page, "ore")).toContain("Routes for ore arrive as players upload.");
  expect(section(page, "reputation")).toContain("Routes for reputation arrive as players upload.");
  for (const slug of ["herbs", "ore", "reputation"]) expect(section(page, slug)).not.toContain("<table");

  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], dataAsOf: null });
  const empty = await html(FarmingPage(search()));
  expect(section(empty, "gold")).toContain("Routes for gold arrive as players upload.");
  expect(section(empty, "cloth")).toContain("Routes for cloth arrive as players upload.");
  // The dungeons are in the game files, so they stay.
  expect(section(empty, "dungeons")).toContain("Shadowfang Keep");
});

test("storage down: the mob lists read as unread, not empty", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], dataAsOf: null, unreachable: true });
  const page = await html(FarmingPage(search()));
  expect(section(page, "gold")).toContain("unreachable");
  expect(section(page, "gold")).not.toContain("arrive as players upload");
  expect(section(page, "dungeons")).toContain("Shadowfang Keep");
});

test("the category and level filters live in the URL", async () => {
  const cloth = await html(FarmingPage(search({ category: "cloth" })));
  expect(section(cloth, "cloth")).not.toBeNull();
  expect(section(cloth, "gold")).toBeNull();
  expect(section(cloth, "dungeons")).toBeNull();

  // Levels overlap the range; an area with no agreed level is out of every range.
  const low = await html(FarmingPage(search({ level: "1-10" })));
  expect(zonesIn(section(low, "gold"))).toEqual([1411]);
  expect(section(low, "cloth")).toContain("Nothing here for levels 1-10.");
  expect(section(low, "dungeons")).toContain("Nothing here for levels 1-10.");
  expect(section(low, "herbs")).toContain("Routes for herbs arrive as players upload.");
  expect(zonesIn(section(await html(FarmingPage(search({ level: "12-20" }))), "gold"))).toEqual([1429]);

  const both = await html(FarmingPage(search({ category: "gold", level: "11-20" })));
  expect(zonesIn(section(both, "gold"))).toEqual([1429]);
  // The menus keep the other filter and the bar offers a way back.
  expect(both).toContain('href="/tools/farming-routes?category=cloth&amp;level=11-20"');
  expect(both).toContain('href="/tools/farming-routes?category=gold&amp;level=1-10"');
  expect(both).toContain('href="/tools/farming-routes"');

  for (const bad of [{ category: "fish" }, { level: "20-10" }, { level: "x" }] as Record<string, string>[]) {
    await expect(html(FarmingPage(search(bad))), JSON.stringify(bad)).rejects.toThrow("NEXT_NOT_FOUND");
  }
});

test("only the plain page is indexed", async () => {
  expect((await generateMetadata(search())).robots).toBeUndefined();
  expect((await generateMetadata(search({ category: "gold" }))).robots).toEqual({ index: false, follow: true });
  expect((await generateMetadata(search({ level: "1-10" }))).robots).toEqual({ index: false, follow: true });
});
