import { beforeEach, describe, expect, it, vi } from "vitest";

const { itemFacts, worldFacts } = vi.hoisted(() => ({
  itemFacts: { rates: [] as unknown[], names: [] as unknown[], npcs: [] as unknown[], unreachable: false },
  worldFacts: { npcs: [] as unknown[], quests: [] as unknown[], vendors: [] as unknown[], unreachable: false },
}));
vi.mock("@/lib/rollup-compute", () => ({
  loadItemFacts: async () => itemFacts,
  loadWorldFacts: async () => worldFacts,
  computeRollups: vi.fn(),
}));
vi.mock("@/lib/upload-store", () => ({ STORAGE_UNREACHABLE: "Storage unavailable" }));
import { generateMetadata as itemMetadata } from "@/app/database/items/[id]/page";
import { generateMetadata as npcMetadata } from "@/app/database/npcs/[id]/page";
import { generateMetadata as questMetadata } from "@/app/database/quests/[id]/page";
import { generateMetadata as vendorMetadata } from "@/app/database/vendors/[id]/page";

describe("entity indexing follows public facts", () => {
  beforeEach(() => {
    Object.assign(itemFacts, { rates: [], names: [], npcs: [], unreachable: false });
    Object.assign(worldFacts, { npcs: [], quests: [], vendors: [], unreachable: false });
  });
  it.each([itemMetadata, npcMetadata, questMetadata, vendorMetadata])("keeps arbitrary unknown IDs out of search", async (metadata) => {
    expect((await metadata({ params: Promise.resolve({ id: "123" }) })).robots).toMatchObject({ index: false, follow: true });
  });
  it("indexes an agreed item name but fails closed on unavailable storage", async () => {
    itemFacts.names = ["a", "b", "c"].map((installId) => ({ installId, itemId: 123, name: "Observed item" }));
    expect((await itemMetadata({ params: Promise.resolve({ id: "123" }) }))).toMatchObject({ title: "Observed item", robots: { index: true } });
    itemFacts.unreachable = true;
    expect((await itemMetadata({ params: Promise.resolve({ id: "123" }) })).robots).toMatchObject({ index: false });
  });
});
