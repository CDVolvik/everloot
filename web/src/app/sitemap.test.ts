import { expect, test, vi } from "vitest";
import { LAUNCH } from "@/data/wow-forever";
import { MAP_DATA_EXTRACTED_AT, TALENT_DATA_EXTRACTED_AT } from "@/lib/build-stamp";
import { loadTimeline, postPath } from "@/lib/changes";
import { CLIENT_TAXONOMY, ITEMS_PER_PAGE, itemsHref } from "@/lib/items";
import { filterItems } from "../../../kb/src/item-taxonomy";
import sitemap from "./sitemap";

const facts = vi.hoisted(() => ({ rates: [] as unknown[], names: [] as { installId: string; itemId: number; name: string }[], npcs: [] as unknown[], unreachable: false }));
const world = vi.hoisted(() => ({ npcs: [] as unknown[], quests: [] as unknown[], vendors: [] as unknown[], unreachable: false }));
vi.mock("@/lib/rollup-compute", () => ({ loadItemFacts: async () => facts, loadWorldFacts: async () => world }));
const blue = vi.hoisted(() => ({ writeups: new Map<string, { postId: string; reviewed: { by: string; on: string }; body: string }>() }));
vi.mock("@/lib/changes", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/changes")>()), loadWriteups: () => blue.writeups }));

const entries = await sitemap();
const byPath = new Map(entries.map((e) => [new URL(e.url).pathname, e]));

test("/changes is dated by its newest entry", () => {
  const newest = loadTimeline()[0];
  expect(newest).toBeDefined();
  expect(byPath.get("/changes")?.lastModified).toEqual(new Date(newest.at));
});

test("a blue post's page is listed only once it has a reviewed write-up, dated by the review", async () => {
  const posts = loadTimeline().filter((e) => e.type !== "build");
  const listed = (all: typeof entries) => all.map((e) => new URL(e.url).pathname).filter((p) => /^\/changes\/./.test(p) && p !== "/changes/feed.xml");
  expect(listed(entries)).toEqual([]);
  const [first, second] = posts;
  try {
    blue.writeups = new Map([[first.id, { postId: first.id, reviewed: { by: "Maintainer", on: "2026-10-21" }, body: "Our words." }]]);
    const withOne = await sitemap();
    expect(listed(withOne)).toEqual([postPath(first)]);
    expect(withOne.find((e) => e.url.endsWith(postPath(first)!))?.lastModified).toEqual(new Date("2026-10-21"));
    expect(listed(withOne)).not.toContain(postPath(second));
  } finally {
    blue.writeups = new Map();
  }
});

test("the game-data pages are dated by the build extraction", () => {
  expect(TALENT_DATA_EXTRACTED_AT.getTime()).toBeGreaterThan(0);
  expect(byPath.get("/map")?.lastModified).toEqual(MAP_DATA_EXTRACTED_AT);
  // Both continent pages are indexed pages of their own; no per-zone map page (the zone pages are those).
  for (const path of ["/map/eastern-kingdoms", "/map/kalimdor"]) expect(byPath.get(path)?.lastModified, path).toEqual(MAP_DATA_EXTRACTED_AT);
  expect([...byPath.keys()].filter((p) => p.startsWith("/map/")).sort()).toEqual(["/map/eastern-kingdoms", "/map/kalimdor"]);
  for (const path of ["/tools/talents", "/tools/talents/hunter", "/tools/talents/druid", "/tools/raid"]) {
    expect(byPath.get(path)?.lastModified, path).toEqual(TALENT_DATA_EXTRACTED_AT);
  }
});

test("/wow-forever is listed and dated by the day its source was read", () => {
  expect(byPath.get("/wow-forever")?.lastModified).toEqual(new Date(LAUNCH.checkedOn));
});

test("a page with no known modification time has none, instead of today's date", () => {
  for (const path of ["/about", "/privacy", "/terms", "/security", "/accessibility", "/docs"]) expect(byPath.get(path)?.lastModified, path).toBeUndefined();
});

test("changefreq and priority are gone", () => {
  for (const entry of entries) {
    expect(entry).not.toHaveProperty("changeFrequency");
    expect(entry).not.toHaveProperty("priority");
  }
});

test("the instance index and each instance page the game files place are listed, never a held-back one", () => {
  expect(byPath.has("/database/instances")).toBe(true);
  expect(byPath.has("/database/instances/36-deadmines")).toBe(true);
  expect([...byPath.keys()].filter((p) => p.startsWith("/database/instances/")).length).toBeGreaterThan(10);
});

test("the zone index is listed; a zone page only once something is on it, and never a held-back one", async () => {
  const paths = async () => (await sitemap()).map((e) => new URL(e.url).pathname);
  expect(byPath.has("/database/zones")).toBe(true);
  expect(byPath.has("/database/zones/1436-westfall")).toBe(true);
  expect(byPath.has("/database/zones/1450-moonglade")).toBe(false);
  expect([...byPath.keys()].filter((p) => p.startsWith("/database/zones/2482"))).toEqual([]);
  try {
    world.npcs = ["a", "b", "c"].map((installId) => ({ installId, npcId: 5, name: "Keeper", mapId: 1450, x: 50, y: 50, positionKind: "npc" }));
    expect(await paths()).toContain("/database/zones/1450-moonglade");
    world.unreachable = true;
    expect(await paths()).not.toContain("/database/zones/1450-moonglade");
  } finally {
    world.npcs = [];
    world.unreachable = false;
  }
});

test("an item category is listed only once half its first page has an agreed name", async () => {
  const cls = CLIENT_TAXONOMY.classes.find((c) => c.slug === "weapons")!;
  expect(byPath.has(itemsHref("weapons"))).toBe(false);
  // Named rows lead the plain list, so it takes half a page of them, wherever they sit in the id order.
  const ids = filterItems(CLIENT_TAXONOMY, { classId: cls.id }).map((r) => r[0]).reverse();
  const name = (n: number) => ids.slice(0, n).flatMap((itemId) => ["a", "b", "c"].map((installId) => ({ installId, itemId, name: `Item name ${itemId}` })));
  try {
    facts.names = name(Math.ceil(ITEMS_PER_PAGE / 2) - 1);
    expect((await sitemap()).map((e) => new URL(e.url).pathname)).not.toContain(itemsHref("weapons"));
    facts.names = name(Math.ceil(ITEMS_PER_PAGE / 2));
    expect((await sitemap()).map((e) => new URL(e.url).pathname)).toContain(itemsHref("weapons"));
  } finally {
    facts.names = [];
  }
});
