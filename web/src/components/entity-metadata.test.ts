import { beforeEach, describe, expect, it, vi } from "vitest";

const { itemFacts, worldFacts } = vi.hoisted(() => ({
  itemFacts: { rates: [] as unknown[], names: [] as unknown[], npcs: [] as unknown[], unreachable: false },
  worldFacts: { npcs: [] as unknown[], quests: [] as unknown[], vendors: [] as unknown[], unreachable: false },
}));
vi.mock("@/lib/rollup-compute", () => ({
  loadItemFacts: async () => itemFacts,
  loadWorldFacts: async () => worldFacts,
  computeRollups: async () => ({ rates: [], measuredZeros: [], rejected: [], stats: { unreachable: worldFacts.unreachable } }),
  loadCraftedItems: async () => ({ items: new Set<number>(), unreachable: itemFacts.unreachable }),
  loadObservedEdges: async () => ({ edges: [], unreachable: false, dataAsOf: null }),
}));
vi.mock("@/lib/upload-store", () => ({ STORAGE_UNREACHABLE: "Storage unavailable" }));
import { generateMetadata as itemMetadata } from "@/app/database/items/[id]/page";
import { generateMetadata as npcMetadata } from "@/app/database/npcs/[id]/page";
import { generateMetadata as questMetadata } from "@/app/database/quests/[id]/page";
import { generateMetadata as vendorMetadata } from "@/app/database/vendors/[id]/page";

const props = (id: string) => ({ params: Promise.resolve({ id }) });
const two = (row: Record<string, unknown>) => ["a", "b"].map((installId) => ({ installId, ...row }));

describe("entity indexing follows public facts", () => {
  beforeEach(() => {
    Object.assign(itemFacts, { rates: [], names: [], npcs: [], unreachable: false });
    Object.assign(worldFacts, { npcs: [], quests: [], vendors: [], unreachable: false });
  });
  it.each([
    ["item", itemMetadata, "99999999"], ["NPC", npcMetadata, "123"], ["vendor", vendorMetadata, "123"],
  ] as const)("an %s id neither the game files nor any upload knows is a 404, not a page", async (_kind, metadata, id) => {
    await expect(metadata(props(id))).rejects.toThrow(/404/);
  });
  it("an id with reports short of 3 installs, or any id while storage is down, is a noindex page", async () => {
    itemFacts.names = two({ itemId: 99999999, name: "Two votes" });
    worldFacts.npcs = two({ npcId: 123, name: "Two votes", mapId: 1, x: 1, y: 1, positionKind: "npc" });
    worldFacts.vendors = two({ vendorNpcId: 124, itemId: 5, priceCopper: 1 });
    for (const [metadata, id] of [[itemMetadata, "99999999"], [npcMetadata, "123"], [vendorMetadata, "124"]] as const) {
      expect((await metadata(props(id))).robots, id).toMatchObject({ index: false, follow: true });
    }
    // Without the quest titles file there is no list of quests to rule an id out: the page stays, noindex.
    expect((await questMetadata(props("123"))).robots).toMatchObject({ index: false, follow: true });
    Object.assign(itemFacts, { names: [], unreachable: true });
    Object.assign(worldFacts, { npcs: [], vendors: [], unreachable: true });
    for (const metadata of [itemMetadata, npcMetadata, vendorMetadata]) expect((await metadata(props("99999999"))).robots).toMatchObject({ index: false });
  });
  it("indexes an agreed item name, titled for the query, but fails closed on unavailable storage", async () => {
    itemFacts.names = ["a", "b", "c"].map((installId) => ({ installId, itemId: 99999999, name: "Observed item" }));
    expect((await itemMetadata(props("99999999")))).toMatchObject({ title: "Observed item – WoW Forever item", robots: { index: true } });
    itemFacts.unreachable = true;
    expect((await itemMetadata(props("99999999"))).robots).toMatchObject({ index: false });
  });
  it("NPC, quest and vendor titles name the kind; descriptions describe the page, not where its data comes from", async () => {
    const meta = await npcMetadata(props("123")).catch(() => null);
    expect(meta).toBeNull();
    worldFacts.npcs = ["a", "b", "c"].map((installId) => ({ installId, npcId: 123, name: "Hogger", mapId: 1, x: 1, y: 1, positionKind: "npc" }));
    const npc = await npcMetadata(props("123"));
    expect(npc).toMatchObject({ title: "Hogger – WoW Forever NPC", robots: { index: true } });
    expect(String(npc.description)).toMatch(/^Hogger is an NPC in WoW: Forever\. Seen at 1 map position\./);
    const quest = await questMetadata(props("176"));
    expect(quest.title).toBe("Quest 176 – WoW Forever quest");
    for (const m of [npc, quest]) expect(String(m.description)).not.toMatch(/corroborated|game files|build|wiki/i);
  });
});
