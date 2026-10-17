import { expect, test } from "vitest";
import { buildItemSet, parseItemIds, shardOf, shardRecords, ITEM_SHARD_SIZE } from "../src/assets/items.js";
import { fitSize, planMapArt, stitchPlan } from "../src/assets/map-art.js";
import type { Row, Rows } from "../src/talents/build-catalog.js";

const t = (rows: Row[]): Rows => new Map(rows.map((r, i) => [typeof r.ID === "number" ? r.ID : i + 1, r]));

// Made-up items; the ids and values are invented.
const itemTables: Record<string, Rows> = {
  ItemSparse: t([
    { ID: 25, Display_lang: "Worn Shortsword", Description_lang: "", OverallQualityID: 1, ItemLevel: 2, RequiredLevel: 1, Bonding: 0, InventoryType: 13, ItemDelay: 1900, MaxCount: 0, SellPrice: 7, StatModifier_bonusStat: [-1, -1], StatPercentEditor: [0, 0] },
    { ID: 600, Display_lang: "Test Helm", Description_lang: "Shiny.", OverallQualityID: 3, ItemLevel: 30, RequiredLevel: 25, Bonding: 2, InventoryType: 1, ItemDelay: 0, MaxCount: 1, SellPrice: 1234, StatModifier_bonusStat: [7, 4, 5], StatPercentEditor: [5000, 3000, 0] },
    { ID: 601, Display_lang: "  ", OverallQualityID: 1 },
  ]),
  Item: t([
    { ID: 25, IconFileDataID: 135274, ClassID: 2, SubclassID: 7 },
    { ID: 600, IconFileDataID: 0, ClassID: 4, SubclassID: 4 },
  ]),
};

test("item records keep what the tables give, and only stat kinds with a share", () => {
  const { records, iconOf } = buildItemSet((n) => itemTables[n]);
  expect([...records.keys()]).toEqual([25, 600]);
  expect(records.get(25)).toEqual({ n: "Worn Shortsword", q: 1, l: 2, r: 1, b: 0, s: 13, c: 2, sc: 7, d: 1900, st: [], sp: 7, u: 0 });
  expect(records.get(600)).toMatchObject({ n: "Test Helm", q: 3, b: 2, s: 1, c: 4, sc: 4, st: [7, 4], u: 1, t: "Shiny." });
  // Only an item with an icon file has one; no icon is invented.
  expect([...iconOf]).toEqual([[25, 135274]]);
});

test("an allowlist limits the items, and a snapshot without item tables is refused", () => {
  expect([...buildItemSet((n) => itemTables[n], new Set([600])).records.keys()]).toEqual([600]);
  expect(() => buildItemSet(() => undefined)).toThrow(/client-extract --refresh/);
});

test("shards group items by id, and a page finds an item's shard from its id alone", () => {
  expect(shardOf(25)).toBe(0);
  expect(shardOf(ITEM_SHARD_SIZE)).toBe(1);
  const shards = shardRecords(buildItemSet((n) => itemTables[n]).records);
  expect([...shards.keys()]).toEqual([0, 1]);
  expect(Object.keys(shards.get(1)!)).toEqual(["600"]);
});

test("an item list is a JSON array or one id per line; anything else is an error", () => {
  expect([...parseItemIds("[25, 600]")]).toEqual([25, 600]);
  expect([...parseItemIds("25\r\n600\n")]).toEqual([25, 600]);
  expect(() => parseItemIds("25\nsword")).toThrow(/whole numbers/);
});

test("a map's tiles fill a grid that is cut to the picture; a hole is reported, a stray tile refused", () => {
  const layer = { width: 1002, height: 668, tileWidth: 256, tileHeight: 256 };
  const tiles = [0, 1, 2].flatMap((row) => [0, 1, 2, 3].map((col) => ({ row, col, fileId: 1000 + row * 4 + col })));
  expect(stitchPlan(layer, tiles)).toEqual({ cols: 4, rows: 3, canvas: { width: 1024, height: 768 }, crop: [0, 0, 1002, 668], missing: [] });
  expect(stitchPlan(layer, tiles.slice(1)).missing).toEqual([{ row: 0, col: 0 }]);
  expect(() => stitchPlan(layer, [...tiles, { row: 3, col: 0, fileId: 1 }])).toThrow(/outside/);
  expect(fitSize(1002, 668, 2048)).toEqual({ width: 1002, height: 668 });
  expect(fitSize(4008, 2672, 2048)).toEqual({ width: 2048, height: 1365 });
});

// A continent (UiMap 13) with one released zone (1429) and one held-back zone (2000), and a zone with no art.
const region = (n: number, s: number, w: number, e: number) => [n, w, 0, s, e, 0];
const mapTables: Record<string, Rows> = {
  Map: t([{ ID: 0, MapName_lang: "Eastern Kingdoms" }]),
  UiMap: t([
    { ID: 947, Name_lang: "Azeroth", Type: 1, ParentUiMapID: 0 },
    { ID: 13, Name_lang: "Eastern Kingdoms", Type: 2, ParentUiMapID: 947 },
    { ID: 1429, Name_lang: "Elwynn Forest", Type: 3, ParentUiMapID: 13 },
    { ID: 2000, Name_lang: "Secret Isle", Type: 3, ParentUiMapID: 13 },
    { ID: 1430, Name_lang: "No Art Vale", Type: 3, ParentUiMapID: 13 },
  ]),
  UiMapAssignment: t([
    { ID: 1, UiMapID: 13, MapID: 0, OrderIndex: 0, UiMin: [0, 0], UiMax: [1, 1], Region: region(4000, -4000, 4000, -4000) },
    { ID: 2, UiMapID: 1429, MapID: 0, OrderIndex: 0, UiMin: [0, 0], UiMax: [1, 1], Region: region(500, -500, 1000, 0) },
    { ID: 3, UiMapID: 2000, MapID: 0, OrderIndex: 0, UiMin: [0, 0], UiMax: [1, 1], Region: region(3000, 2000, 3000, 2000) },
    { ID: 4, UiMapID: 1430, MapID: 0, OrderIndex: 0, UiMin: [0, 0], UiMax: [1, 1], Region: region(100, 0, 100, 0) },
  ]),
  UiMapXMapArt: t([
    { ID: 1, UiMapID: 13, UiMapArtID: 50, PhaseID: 0 },
    { ID: 2, UiMapID: 1429, UiMapArtID: 51, PhaseID: 0 },
    { ID: 3, UiMapID: 1429, UiMapArtID: 99, PhaseID: 7 },
    { ID: 4, UiMapID: 2000, UiMapArtID: 52, PhaseID: 0 },
  ]),
  UiMapArt: t([{ ID: 50, UiMapArtStyleID: 1 }, { ID: 51, UiMapArtStyleID: 1 }, { ID: 52, UiMapArtStyleID: 1 }, { ID: 99, UiMapArtStyleID: 1 }]),
  UiMapArtStyleLayer: t([
    { ID: 1, UiMapArtStyleID: 1, LayerIndex: 0, LayerWidth: 500, LayerHeight: 256, TileWidth: 256, TileHeight: 256 },
    { ID: 2, UiMapArtStyleID: 1, LayerIndex: 1, LayerWidth: 1000, LayerHeight: 512, TileWidth: 256, TileHeight: 256 },
  ]),
  UiMapArtTile: t([
    ...[50, 51, 52, 99].flatMap((art) => [0, 1].map((col) => ({ UiMapArtID: art, LayerIndex: 0, RowIndex: 0, ColIndex: col, FileDataID: art * 10 + col }))),
    { UiMapArtID: 51, LayerIndex: 1, RowIndex: 0, ColIndex: 0, FileDataID: 9999 },
  ]),
};

test("map art is planned per continent and zone from the art tables, phased art and sharper layers left out", () => {
  const { targets, skipped } = planMapArt((n) => mapTables[n]);
  expect(targets.map((m) => [m.uiMapId, m.kind, m.heldBack])).toEqual([[13, "continent", false], [1429, "zone", false], [2000, "zone", true]]);
  const elwynn = targets.find((m) => m.uiMapId === 1429)!;
  expect(elwynn.artId).toBe(51);
  expect(elwynn.tiles.map((x) => x.fileId)).toEqual([510, 511]);
  expect(elwynn.rect).toEqual({ left: 1000, top: 500, right: 0, bottom: -500 });
  expect(skipped).toEqual(["No Art Vale (1430): no art in this build"]);
});
