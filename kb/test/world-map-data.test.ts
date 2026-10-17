import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { assignmentRect, buildWorldMapData, WorldMapData, WORLD_MAP_SCHEMA } from "../src/world-map-data.js";

// Synthetic rows in the shape of the client tables (column names from WoWDBDefs). The numbers are made up.
type Row = Record<string, unknown>;
const rows = (list: Row[]) => new Map(list.map((r) => [Number(r.ID), r]));
const uiMap = (ID: number, Name_lang: string, Type: number, ParentUiMapID: number): Row => ({ ID, Name_lang, Type, ParentUiMapID });
const assign = (ID: number, UiMapID: number, MapID: number, Region: number[], extra: Row = {}): Row =>
  ({ ID, UiMapID, MapID, OrderIndex: 0, UiMin: [0, 0], UiMax: [1, 1], Region, ...extra });
const map = (ID: number, MapName_lang: string, InstanceType: number, CorpseMapID: number, Corpse: number[]): Row =>
  ({ ID, MapName_lang, InstanceType, CorpseMapID, Corpse });

const tables: Record<string, ReturnType<typeof rows>> = {
  Map: rows([
    map(0, "Eastern Kingdoms", 0, 255, [0, 0]),
    map(1, "Kalimdor", 0, 255, [0, 0]),
    map(34, "Stormwind Stockade", 1, 0, [-8762.38, 848.01]),
    map(35, "<unused>StormwindPrison", 0, 0, [-8762.48, 848.05]),
    map(44, "<unused> Monastery", 1, 0, [2892.4, -811.2]),
    map(189, "Scarlet Monastery", 1, 0, [2892.24, -811.26]),
    map(409, "Molten Core", 2, 0, [-7510.56, -1036.7]),
    map(269, "Caverns of Time", 1, 0, [0, 0]),
    map(533, "Naxxramas", 2, 255, [0, 0]),
    map(489, "Warsong Gulch", 3, 0, [10, 10]),
    map(389, "Ragefire Chasm", 1, 1, [1816.76, -4423.37]),
  ]),
  UiMap: rows([
    uiMap(947, "Azeroth", 1, 0),
    uiMap(1415, "Eastern Kingdoms", 2, 947),
    uiMap(1414, "Kalimdor", 2, 947),
    uiMap(1463, "Eastern Kingdoms", 2, 0),
    uiMap(1429, "Elwynn Forest", 3, 1415),
    uiMap(1411, "Durotar", 3, 1414),
    uiMap(2548, "Riverglades", 3, 1415),
    uiMap(1460, "Warsong Gulch", 6, 1413),
    uiMap(1500, "Off continent", 3, 947),
  ]),
  UiMapAssignment: rows([
    assign(1, 1415, 0, [-16000, -19200, -1e6, 7467, 16000, 1e6]),
    assign(2, 1414, 1, [-11733, -19733, -1e6, 12800, 17067, 1e6]),
    assign(3, 1429, 0, [-10254.2, -1935, -1e6, -7939.6, 1535.4, 1e6]),
    assign(4, 1411, 1, [-1716.7, -7250, -1e6, 1808.3, -1962.5, 1e6]),
    assign(5, 2548, 0, [-9700, -6742, -1e6, -6467, -1892, 1e6]),
    assign(6, 1460, 489, [862, 896, -1e6, 1627, 2042, 1e6]),
    assign(7, 1500, 2991, [0, 0, -1e6, 10, 10, 1e6]),
    assign(8, 1463, 0, [-15980, -11880, -1e6, 5817, 9917, 1e6]),
  ]),
};
const source: WorldMapData["source"] = {
  name: "test", status: "found in game files, unconfirmed", licence: "Blizzard game data, not under our licence", licenceUrl: "u",
  product: "wow_classic_beta", buildId: 1, version: "1.0.0.1", buildConfig: "abc", definitions: null, extractedAt: "2026-10-17T00:00:00Z", tables: [],
};
const data = buildWorldMapData((t) => tables[t], source);

describe("map data from client tables", () => {
  test("a zone's rectangle: north is the larger x, west is the larger y", () => {
    expect(data.zones.find((z) => z.uiMapId === 1429)).toEqual({
      uiMapId: 1429, name: "Elwynn Forest", continentId: 0,
      bounds: { top: -7939.6, bottom: -10254.2, left: 1535.4, right: -1935 },
    });
    expect(data.zones.find((z) => z.uiMapId === 1411)).toMatchObject({ name: "Durotar", continentId: 1 });
  });

  test("continents are the world map's children, named by the Map table, not the duplicate views", () => {
    expect(data.continents.map((c) => [c.id, c.name])).toEqual([[0, "Eastern Kingdoms"], [1, "Kalimdor"]]);
  });

  test("zones that are not on a continent, battlegrounds and later ids are left out, and the hold-back is reported", () => {
    expect(data.zones.map((z) => z.uiMapId)).toEqual([1411, 1429]);
    expect(data.warnings).toEqual(["1 zone(s) with later UiMap ids are held back as possibly unreleased"]);
  });

  test("entrances are the instances' ghost-return spots; unused, positionless and off-continent maps are dropped", () => {
    expect(data.entrances.map((e) => e.name)).toEqual(["Stormwind Stockade", "Scarlet Monastery", "Ragefire Chasm", "Molten Core"]);
    expect(data.entrances[0]).toEqual({ mapId: 34, name: "Stormwind Stockade", raid: false, continentId: 0, worldX: -8762.4, worldY: 848 });
    expect(data.entrances.find((e) => e.name === "Molten Core")?.raid).toBe(true);
    expect(data.entrances.find((e) => e.name === "Ragefire Chasm")?.continentId).toBe(1);
  });

  test("a rectangle that covers only part of a map is not used as the whole map", () => {
    const base = { ID: 1, UiMapID: 1, MapID: 0, OrderIndex: 0, UiMin: [0, 0], UiMax: [1, 1], Region: [-10, -10, -1, 10, 10, 1] };
    expect(assignmentRect(base)).toEqual({ top: 10, bottom: -10, left: 10, right: -10 });
    expect(assignmentRect({ ...base, UiMax: [0.5, 1] })).toBeNull();
    expect(assignmentRect({ ...base, Region: [1, 2, 3] })).toBeNull();
    expect(assignmentRect({ ...base, Region: [5, 5, 0, 5, 7, 0] })).toBeNull();
  });

  test("the first assignment by order index wins when a map has several", () => {
    const t: typeof tables = { ...tables, UiMapAssignment: rows([
      assign(10, 1429, 0, [-1, -1, 0, 1, 1, 0], { OrderIndex: 1 }),
      assign(11, 1429, 0, [-10, -10, 0, 10, 10, 0], { OrderIndex: 0 }),
      assign(12, 1415, 0, [-16000, -19200, 0, 7467, 16000, 0]),
    ]) };
    const d = buildWorldMapData((n) => t[n], source);
    expect(d.zones[0].bounds).toEqual({ top: 10, bottom: -10, left: 10, right: -10 });
  });

  test("a snapshot without the map tables is refused with a pointer to client-extract", () => {
    expect(() => buildWorldMapData(() => undefined, source)).toThrow(/client-extract/);
  });
});

describe("the committed map data", () => {
  const committed = WorldMapData.parse(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "web", "src", "data", "game-data", "map.json"), "utf8")));

  test("is stamped with a build and labelled as game file data, not our licence", () => {
    expect(committed.schema).toBe(WORLD_MAP_SCHEMA);
    expect(committed.source).toMatchObject({ product: "wow_classic_beta", status: "found in game files, unconfirmed", licence: "Blizzard game data, not under our licence" });
    expect(committed.source.buildId).toBeGreaterThan(70000);
    expect(committed.source.tables.map((t) => t.table).sort()).toEqual(["Map", "UiMap", "UiMapAssignment"]);
  });

  test("carries no third-party data: only the fields the page uses, and no unused-map placeholders", () => {
    expect(committed.entrances.length).toBeGreaterThan(15);
    expect(committed.entrances.some((e) => /unused/i.test(e.name))).toBe(false);
    expect(Object.keys(committed.zones[0]).sort()).toEqual(["bounds", "continentId", "name", "uiMapId"]);
  });

  test("every entrance and zone lies inside its continent", () => {
    const inside = (c: number, x: number, y: number) => {
      const b = committed.continents.find((k) => k.id === c)!.bounds;
      return x <= b.top && x >= b.bottom && y <= b.left && y >= b.right;
    };
    for (const e of committed.entrances) expect(inside(e.continentId, e.worldX, e.worldY), e.name).toBe(true);
    for (const z of committed.zones) {
      expect(inside(z.continentId, z.bounds.top, z.bounds.left), z.name).toBe(true);
      expect(inside(z.continentId, z.bounds.bottom, z.bounds.right), z.name).toBe(true);
    }
  });
});
