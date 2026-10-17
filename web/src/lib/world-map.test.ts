import { describe, expect, test } from "vitest";
import type { MapBoundsRow } from "../../../kb/src/map-bounds";
import type { WorldMapData } from "../../../kb/src/world-map-data";
import { worldToZone, zoneAt, zoneTable } from "../../../kb/src/world-coords";
import { continentMap, WORLD_MAP } from "./world-map";

// SYNTHETIC data in the shape of the generated file; the numbers are made up.
const data: WorldMapData = {
  schema: "everloot.world-map/1",
  source: { name: "test", status: "found in game files, unconfirmed", licence: "l", licenceUrl: "u", product: "p", buildId: 1, version: "1.0.0.1", buildConfig: "c", definitions: null, extractedAt: "2026-10-17T00:00:00Z", tables: [] },
  continents: [
    { id: 0, name: "Eastern Kingdoms", bounds: { top: 7000, bottom: -16000, left: 16000, right: -19000 } },
    { id: 1, name: "Kalimdor", bounds: { top: 12000, bottom: -11000, left: 17000, right: -19000 } },
  ],
  zones: [
    { uiMapId: 1429, name: "Synthetic Forest", continentId: 0, bounds: { top: -7940, bottom: -10254, left: 1535, right: -1935 } },
    { uiMapId: 1411, name: "Synthetic Dunes", continentId: 1, bounds: { top: 1800, bottom: -1700, left: -2000, right: -7250 } },
  ],
  entrances: [
    { mapId: 34, name: "Synthetic Stockade", raid: false, continentId: 0, worldX: -8762.4, worldY: 848 },
    { mapId: 389, name: "Synthetic Chasm", raid: false, continentId: 1, worldX: 1816.8, worldY: -4423.4 },
  ],
  warnings: [],
};

const report = (installId: string, change: Partial<MapBoundsRow> = {}): MapBoundsRow =>
  ({ installId, capturedAt: "2026-10-17T00:00:00Z", mapId: 1429, continentId: 0, left: 1535, top: -7940, right: -1935, bottom: -10254, ...change });

describe("continentMap", () => {
  test("every zone and entrance of a continent shows with no reports at all", () => {
    const map = continentMap(0, [], data);
    expect(map.name).toBe("Eastern Kingdoms");
    expect(map.zones).toHaveLength(1);
    expect(map.zones[0]).toMatchObject({ mapId: 1429, name: "Synthetic Forest", x: -1535, y: 7940, width: 3470, height: 2314 });
    expect(map.entrances.map((p) => p.names[0])).toEqual(["Synthetic Stockade"]);
    expect(map.confirmedZones).toBe(0);
    expect(map.disagreements).toEqual([]);
  });

  test("the other continent has its own zones and entrances", () => {
    const map = continentMap(1, [], data);
    expect(map.zones.map((z) => z.name)).toEqual(["Synthetic Dunes"]);
    expect(map.entrances.map((p) => p.names[0])).toEqual(["Synthetic Chasm"]);
  });

  test("the view box holds every zone and entrance", () => {
    const map = continentMap(0, [], data);
    const vb = map.viewBox!;
    for (const z of map.zones) {
      expect(z.x).toBeGreaterThanOrEqual(vb.x);
      expect(z.x + z.width).toBeLessThanOrEqual(vb.x + vb.width);
      expect(z.y + z.height).toBeLessThanOrEqual(vb.y + vb.height);
    }
    for (const p of map.entrances) expect(p.map.x).toBeGreaterThanOrEqual(vb.x);
  });

  test("3 installs that match the files confirm a zone; 3 that differ are listed; fewer are ignored", () => {
    expect(continentMap(0, [report("a"), report("b"), report("c")], data)).toMatchObject({ confirmedZones: 1, disagreements: [] });
    const differ = [report("a", { right: -1599 }), report("b", { right: -1599 }), report("c", { right: -1599 })];
    const map = continentMap(0, differ, data);
    expect(map.confirmedZones).toBe(0);
    expect(map.disagreements.map((d) => d.name)).toEqual(["Synthetic Forest"]);
    expect(continentMap(0, [report("a", { right: -1599 }), report("b", { right: -1599 })], data).disagreements).toEqual([]);
  });

  test("reports for a zone on the other continent do not show on this one, and no install id reaches the result", () => {
    const rows = [report("secret-install"), report("b"), report("c")];
    expect(continentMap(1, rows, data).confirmedZones).toBe(0);
    expect(JSON.stringify(continentMap(0, rows, data))).not.toContain("secret-install");
  });

  test("with nothing to place there is no view box", () => {
    expect(continentMap(0, [], { ...data, zones: [], entrances: [] }).viewBox).toBeNull();
  });
});

describe("the committed map data, loaded for the page", () => {
  test("Stormwind Stockade's entrance lies in Stormwind City, which lies inside Elwynn Forest, by the files' own numbers", () => {
    const stockade = WORLD_MAP.entrances.find((e) => e.name === "Stormwind Stockade")!;
    const at = { continentId: stockade.continentId, worldX: stockade.worldX, worldY: stockade.worldY };
    const zones = zoneTable(WORLD_MAP);
    expect(zoneAt(zones, at)?.name).toBe("Stormwind City");
    expect(worldToZone(zones, 1429, at)).not.toBeNull();
  });

  test("both continents have zones and entrances", () => {
    for (const id of [0, 1]) {
      const map = continentMap(id, []);
      expect(map.zones.length).toBeGreaterThan(10);
      expect(map.entrances.length).toBeGreaterThan(5);
      expect(map.viewBox).not.toBeNull();
    }
  });
});
