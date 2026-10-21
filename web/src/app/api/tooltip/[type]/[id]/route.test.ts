import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { tooltipResponse } from "@everloot/protocol";

const mocks = vi.hoisted(() => ({
  items: vi.fn(), world: vi.fn(), objects: vi.fn(), assets: vi.fn(), tips: vi.fn(),
}));
vi.mock("@/lib/rollup-compute", () => ({ loadItemFacts: mocks.items, loadWorldFacts: mocks.world }));
vi.mock("@/lib/objects", () => ({ loadObjectFacts: mocks.objects }));
vi.mock("@/lib/game-assets", () => ({ loadSiteAssets: mocks.assets, loadItemTips: mocks.tips }));

import { GET, OPTIONS } from "./route";

const three = (make: (installId: string) => object) => ["a", "b", "c"].map(make);
const call = (type: string, id: string) => GET(new Request(`https://everloot.app/api/tooltip/${type}/${id}`), { params: Promise.resolve({ type, id }) });

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  mocks.items.mockReset().mockResolvedValue({
    rates: [], npcs: [], unreachable: false,
    names: [...three((installId) => ({ installId, itemId: 19019, name: "Thunderfury" })), { installId: "a", itemId: 5, name: "Lonely" }],
  });
  mocks.world.mockReset().mockResolvedValue({
    unreachable: false, vendors: [],
    npcs: three((installId) => ({ installId, npcId: 6, name: "Thrall", positionKind: "npc", mapId: 1, x: 40, y: 50 })),
    quests: three((installId) => ({ installId, questId: 9, title: "Cutting Teeth", level: 1, giverNpcId: 6, rewardItemIds: [] })),
  });
  mocks.objects.mockReset().mockResolvedValue({ rates: [], names: [], unreachable: false, dataAsOf: null, measuredZeros: [{ sourceObjectId: 7, kills: 12, reporters: 3, public: true }] });
  mocks.assets.mockReset().mockResolvedValue({ base: "https://assets.everloot.app/b", version: "70450", label: "Found in game files, unconfirmed" });
  mocks.tips.mockReset().mockResolvedValue(new Map());
});

test("an item card carries the page's name, the licence and the page URL, and parses as the protocol's shape", async () => {
  const res = await call("item", "19019");
  expect(res.status).toBe(200);
  const body = tooltipResponse.parse(await res.json());
  expect(body).toMatchObject({ type: "item", id: 19019, title: "Thunderfury", url: "https://everloot.app/database/items/19019", gameData: null });
  expect(body.attribution.credit).toContain("Everloot");
  expect(res.headers.get("x-everloot-licence")).toBeTruthy();
});

test("the game files' tooltip text and icon come with their label and build, and the Blizzard credit", async () => {
  mocks.tips.mockResolvedValue(new Map([[19019, { name: "Thunderfury", color: "#ff8000", quality: "Legendary", icon: "https://assets.everloot.app/b/icons/1.webp", lines: ["Binds when picked up", '"Blessed Blade"'], partial: true, label: "x" }]]));
  const body = tooltipResponse.parse(await (await call("item", "19019")).json());
  expect(body).toMatchObject({ color: "#ff8000", icon: "https://assets.everloot.app/b/icons/1.webp", partial: true, gameData: { label: "Found in game files, unconfirmed", build: "70450" } });
  expect(body.gameData?.credit).toContain("Blizzard");
  expect(body.lines).toEqual(expect.arrayContaining(["Binds when picked up", '"Blessed Blade"']));
});

test("a tooltip line with no fact reads [?], never a blank: stat amounts, restrictions, the set and the Equip/Use lines", async () => {
  const bare = tooltipResponse.parse(await (await call("item", "19019")).json());
  expect(bare.lines).toEqual(["Stats: [?]", "Restrictions: [?]", "Set: [?]", "Equip and Use: [?]", "[?] marks a value the game files do not give us yet."]);
  expect(bare.partial).toBe(true);
  // With the files' own stat lines, the amounts stay on them and get no line of their own.
  mocks.tips.mockResolvedValue(new Map([[19019, { name: "Thunderfury", color: "#ff8000", quality: "Legendary", icon: null, lines: ["One-Hand · Sword", "+[?] Agility"], partial: true, label: "x" }]]));
  const withStats = tooltipResponse.parse(await (await call("item", "19019")).json());
  expect(withStats.lines).toEqual(["One-Hand · Sword", "+[?] Agility", "Restrictions: [?]", "Set: [?]", "Equip and Use: [?]", "[?] marks a value the game files do not give us yet."]);
  for (const line of [...bare.lines, ...withStats.lines]) expect(line.trim()).not.toMatch(/(^|:)$/);
});

test("agreed facts take the [?]'s place, line for line", async () => {
  const { itemFactLines } = await import("@/lib/tooltip");
  expect(itemFactLines({ restrictions: ["Classes: Warrior"], setName: "Synthetic Battlegear", effects: ["Equip: Synthetic effect."] }, true))
    .toEqual(["Classes: Warrior", "Set: Synthetic Battlegear", "Equip: Synthetic effect."]);
});

test("an item nobody reported is a 404, and so is one a single install named (the 3-install rule)", async () => {
  expect((await call("item", "123456")).status).toBe(404);
  expect((await call("item", "5")).status).toBe(404);
  expect(mocks.tips).not.toHaveBeenCalled();
});

test("npc, quest and object cards say what the page says", async () => {
  expect(await (await call("npc", "6")).json()).toMatchObject({ title: "Thrall", lines: ["Seen on 1 map, agreed by 3 or more installs."] });
  expect(await (await call("quest", "9")).json()).toMatchObject({ title: "Cutting Teeth", lines: ["Level 1", "Starts with Thrall"] });
  expect(await (await call("object", "7")).json()).toMatchObject({ title: "Object 7", lines: ["No items in 12 loot windows players opened."] });
  expect((await call("npc", "999")).status).toBe(404);
});

test("an object card shows the name 3 installs agree on", async () => {
  mocks.objects.mockResolvedValue({ rates: [], names: [], unreachable: false, dataAsOf: null, measuredZeros: [{ sourceObjectId: 7, kills: 12, reporters: 3, public: true }], objects: three((installId) => ({ installId, objectId: 7, name: "Copper Vein" })) });
  expect(await (await call("object", "7")).json()).toMatchObject({ title: "Copper Vein" });
});

test("bad types and bad ids are 404s, without reading any data", async () => {
  for (const [type, id] of [["spell", "1"], ["item", "abc"], ["item", "0"], ["item", "-1"], ["item", "01"], ["item", "1.5"], ["item", "99999999999"], ["item", "2147483648"], ["items", "1"]]) {
    const res = await call(type, id);
    expect(res.status, `${type}/${id}`).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false });
  }
  expect(mocks.items).not.toHaveBeenCalled();
});

test("unreachable storage is a 503 that is not cached", async () => {
  mocks.items.mockResolvedValue({ rates: [], names: [], npcs: [], unreachable: true });
  const res = await call("item", "19019");
  expect(res.status).toBe(503);
  expect(res.headers.get("cache-control")).toBe("no-store");
});

test("any site may read it with GET: CORS is open, nothing else is", async () => {
  for (const res of [await call("item", "19019"), await call("item", "x")]) {
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  }
  const pre = OPTIONS();
  expect(pre.status).toBe(204);
  expect(pre.headers.get("access-control-allow-origin")).toBe("*");
  expect(pre.headers.get("access-control-allow-methods")).toBe("GET");
});

test("the CDN keeps a card for an hour and serves it stale for a day; a 404 is kept briefly", async () => {
  const cache = (await call("item", "19019")).headers.get("cache-control") ?? "";
  expect(cache).toContain("public");
  expect(cache).toContain("s-maxage=3600");
  expect(cache).toContain("stale-while-revalidate=86400");
  const missing = (await call("item", "123456")).headers.get("cache-control") ?? "";
  expect(missing).toContain("s-maxage=300");
});
