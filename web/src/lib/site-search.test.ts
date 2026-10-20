import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { buildLoreRelease } from "@/test/lore-release";

const mocks = vi.hoisted(() => ({
  names: { items: new Map<number, string>(), npcs: new Map<number, string>(), quests: new Map<number, string>() },
  objects: { rates: [] as unknown[], measuredZeros: [] as unknown[], names: [] as unknown[], unreachable: false },
}));
vi.mock("@/lib/names", () => ({ loadNames: async () => mocks.names }));
vi.mock("@/lib/objects", () => ({ loadObjectFacts: async () => mocks.objects }));

let release = "";
beforeAll(async () => { release = await buildLoreRelease(); });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  mocks.names = { items: new Map(), npcs: new Map(), quests: new Map() };
  mocks.objects = { rates: [], measuredZeros: [], names: [], unreachable: false };
});

async function search(q: string, path = release) {
  vi.stubEnv("KB_SNAPSHOT_PATH", path);
  const { siteSearch } = await import("./site-search");
  return siteSearch(q);
}

test("an empty query finds nothing", async () => {
  expect(await search("   ")).toEqual([]);
});

test("items, NPCs and quests are grouped by type, exact name first, then prefix, then contains", async () => {
  mocks.names.items = new Map([[1, "Thrall's Cloak"], [2, "Thrall"], [3, "Old Thrall"]]);
  mocks.names.npcs = new Map([[77, "Thrall"]]);
  mocks.names.quests = new Map([[5, "Thrall's Return"]]);
  const groups = await search("thrall");
  const types = groups.map((g) => g.type);
  expect(types).toContain("item");
  expect(types).toContain("npc");
  expect(types).toContain("quest");
  const items = groups.find((g) => g.type === "item")!.results;
  expect(items.map((r) => r.label)).toEqual(["Thrall", "Thrall's Cloak", "Old Thrall"]);
  expect(items[0]).toMatchObject({ href: "/database/items/2", exact: true });
  expect(items[1].exact).toBe(false);
  expect(groups.find((g) => g.type === "npc")!.results[0].href).toBe("/database/npcs/77");
});

test("a group with an exact match moves above one with only partial matches", async () => {
  mocks.names.items = new Map([[1, "Thrall's Cloak"]]);
  mocks.names.npcs = new Map([[77, "Thrall"]]);
  const types = (await search("thrall")).map((g) => g.type);
  expect(types.indexOf("npc")).toBeLessThan(types.indexOf("item"));
});

test("an id opens the item, NPC and quest with that id first, named when a name is agreed", async () => {
  mocks.names.items = new Map([[6948, "Hearthstone"]]);
  const groups = await search("6948");
  expect(groups.find((g) => g.type === "item")!.results[0]).toMatchObject({ label: "Hearthstone", href: "/database/items/6948", exact: true });
  expect(groups.find((g) => g.type === "npc")!.results[0]).toMatchObject({ label: "NPC 6948", href: "/database/npcs/6948" });
  expect(groups.find((g) => g.type === "quest")!.results[0]).toMatchObject({ label: "Quest 6948", href: "/database/quests/6948" });
  expect((await search("#6948")).find((g) => g.type === "item")!.results[0].href).toBe("/database/items/6948");
  // Not an id: leading zero, a decimal, or too long.
  for (const q of ["06948", "69.48", "1234567890"]) {
    expect((await search(q)).find((g) => g.type === "npc")).toBeUndefined();
  }
});

test("an object is found by id, and only when it has public loot observations", async () => {
  mocks.objects.rates = [{ sourceObjectId: 55, itemId: 9, kills: 10, drops: 3, rate: 0.3, reporters: 3, public: true }];
  expect((await search("55")).find((g) => g.type === "object")!.results[0]).toMatchObject({ href: "/database/objects/55", exact: true });
  expect((await search("56")).find((g) => g.type === "object")).toBeUndefined();
  mocks.objects.unreachable = true;
  expect((await search("55")).find((g) => g.type === "object")).toBeUndefined();
});

test("zones are the released ones, linking to the map", async () => {
  const zones = (await search("elwynn")).find((g) => g.type === "zone")!.results;
  expect(zones[0]).toMatchObject({ label: "Elwynn Forest", href: "/database/zones/1429-elwynn-forest", exact: false });
  expect((await search("Elwynn Forest")).find((g) => g.type === "zone")!.results[0].exact).toBe(true);
});

test("lore pages come with their lore link, and tools by title or keyword", async () => {
  const groups = await search("thrall");
  expect(groups.find((g) => g.type === "lore")!.results[0]).toMatchObject({ label: "Thrall", href: "/lore/1-thrall", exact: true });
  const tools = (await search("talent")).find((g) => g.type === "tool")!.results;
  expect(tools[0]).toMatchObject({ label: "Talent Calculator", href: "/tools/talents" });
  expect((await search("gph")).find((g) => g.type === "tool")!.results[0].href).toBe("/tools/gold-per-hour");
});

test("without a lore release the other groups still answer", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.names.npcs = new Map([[77, "Thrall"]]);
  const groups = await search("thrall", "C:/missing/release.sqlite");
  expect(groups.map((g) => g.type)).toEqual(["npc"]);
});

test("a name nobody matches gives no groups", async () => {
  expect(await search("qqqqzzzz")).toEqual([]);
});
