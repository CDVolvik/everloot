import { expect, test } from "vitest";
import { craftedItemsFromRecords } from "../../../kb/src/item-source";
import { buildItemSources } from "./item-seen";
import { activeFilters, categoryQuery, CLIENT_TAXONOMY, itemsHref, listItems, toggled, type CategoryQuery, type SourceSlug } from "./items";

const rate = (itemId: number, over: object = {}) => ({ itemId, drops: 4, public: true, sourceNpcId: 1, ...over });
const sources = buildItemSources({
  rates: [rate(10), rate(11, { sourceNpcId: undefined, sourceObjectId: 5 }), rate(12, { public: false }), rate(13, { drops: 0 }), rate(14), rate(14, { sourceNpcId: undefined, sourceObjectId: 6 })],
  offers: [14, 15], rewards: [15, 16], crafted: new Set([17, 10]),
});

test("the source index has one entry per reported item, in menu order", () => {
  expect(sources.get(10)).toEqual(["drop", "crafted"]);
  expect(sources.get(11)).toEqual(["object"]);
  expect(sources.get(14)).toEqual(["drop", "vendor", "object"]);
  expect(sources.get(15)).toEqual(["vendor", "quest"]);
  expect(sources.get(16)).toEqual(["quest"]);
  expect(sources.get(17)).toEqual(["crafted"]);
});

test("unreported items have no source: a private rate or a zero-drop window is not one", () => {
  for (const id of [12, 13, 99]) expect(sources.has(id)).toBe(false);
});

test("a recipe makes an item only once 3 installs saw it", () => {
  const row = (installId: string, productItemId?: number) => ({ kind: "recipe_observed", installId, productItemId });
  const made = craftedItemsFromRecords([row("a", 7), row("b", 7), row("b", 7), row("a", 8), row("b", 8), row("c", 8), row("a"), { kind: "price_seen", installId: "z", productItemId: 9 }]);
  expect([...made]).toEqual([8]);
});

const rows = CLIENT_TAXONOMY.items.slice(0, 40);
const bySource: Record<number, SourceSlug[]> = { [rows[0][0]]: ["drop"], [rows[1][0]]: ["vendor", "quest"], [rows[2][0]]: ["object"] };
const ids = (q: Partial<CategoryQuery>) => listItems(rows, { page: 1, ...q }, { sources: (id) => bySource[id] }).map((r) => r[0]);

test("the src filter takes any of its values and drops unreported items", () => {
  expect(ids({ src: ["drop"] })).toEqual([rows[0][0]]);
  expect(ids({ src: ["quest", "object"] })).toEqual([rows[1][0], rows[2][0]]);
  expect(ids({ src: ["crafted"] })).toEqual([]);
  expect(ids({})).toHaveLength(40);
});

test("sorting by source puts the reported items first, A to Z", () => {
  expect(ids({ sort: { key: "seen", desc: false } }).slice(0, 3)).toEqual([rows[0][0], rows[2][0], rows[1][0]]);
});

test("src round-trips through the URL, in one order, beside the other filters", () => {
  const q = categoryQuery({ src: "quest,drop", quality: "epic", q: "robe", sort: "-seen", page: "2" })!;
  expect(q.src).toEqual(["drop", "quest"]);
  expect(activeFilters(q)).toBe(3);
  expect(itemsHref("armor", "cloth", q)).toBe("/database/items/armor/cloth?q=robe&quality=epic&src=drop,quest&sort=-seen&page=2");
  expect(toggled(q, "src", "drop")).toMatchObject({ src: ["quest"], page: 1 });
  expect(toggled(toggled(q, "src", "drop"), "src", "quest").src).toBeUndefined();
  expect(categoryQuery({ src: "loot" })).toBeNull();
});
