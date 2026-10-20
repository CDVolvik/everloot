import { describe, expect, test } from "vitest";
import type { WorldMapData } from "../../../kb/src/world-map-data";
import type { WorldFacts } from "../../../kb/src/world-pages";
import { hasContent, parseZoneSegment, publicZones, zoneByMapId, zoneContents, zoneHref, zoneMapHref, zoneSlug } from "./zones";

// SYNTHETIC data in the shape of the generated file; the numbers and names are made up.
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
  heldBackZones: [
    { uiMapId: 2482, name: "Synthetic Peak", continentId: 1, bounds: { top: 6000, bottom: 4000, left: -900, right: -4400 } },
  ],
  entrances: [
    { mapId: 34, name: "Synthetic Stockade", raid: false, continentId: 0, worldX: -8762.4, worldY: 848 },
    { mapId: 389, name: "Synthetic Chasm", raid: false, continentId: 1, worldX: 1500, worldY: -4423.4 },
    { mapId: 99, name: "Synthetic Spire", raid: true, continentId: 1, worldX: 5000, worldY: -2000 },
  ],
  warnings: [],
};

const sighting = (installId: string, npcId: number, name: string, mapId: number, x: number, y: number) =>
  ({ installId, npcId, name, mapId, x, y, positionKind: "npc" as const });
const three = (npcId: number, name: string, mapId: number, x: number, y: number) =>
  ["a", "b", "c"].map((i) => sighting(`install-${i}`, npcId, name, mapId, x, y));
const quest = (installId: string, questId: number, giverNpcId: number, level = 5) =>
  ({ installId, questId, title: `Quest ${questId}`, level, giverNpcId, rewardItemIds: [] });
const vendor = (installId: string, vendorNpcId: number) => ({ installId, vendorNpcId, itemId: 159, priceCopper: 25 });

describe("zone addresses", () => {
  test("the segment is the map id and a name slug, and the id is what counts", () => {
    expect(zoneSlug(1411, "Durotar")).toBe("1411-durotar");
    expect(zoneSlug(1429, "Elwynn Forest")).toBe("1429-elwynn-forest");
    expect(zoneSlug(1453, "Stormwind City")).toBe("1453-stormwind-city");
    expect(zoneSlug(1411, "")).toBe("1411");
    expect(zoneHref(1411, "Durotar")).toBe("/database/zones/1411-durotar");
    expect(zoneMapHref(1411)).toBe("/map?zone=1411");
    expect(parseZoneSegment("1411-durotar")).toBe(1411);
    expect(parseZoneSegment("1411")).toBe(1411);
    expect(parseZoneSegment("durotar")).toBeNull();
    expect(parseZoneSegment("0-x")).toBeNull();
    expect(parseZoneSegment("1411-Durotar")).toBeNull();
  });

  test("a zone found only in the game files has no page", () => {
    expect(publicZones(data).map((z) => z.mapId)).toEqual([1411, 1429]);
    expect(zoneByMapId(2482, data)).toBeUndefined();
    expect(zoneByMapId(1411, data)).toMatchObject({ name: "Synthetic Dunes", continentName: "Kalimdor" });
  });
});

describe("zoneContents", () => {
  const empty: WorldFacts = { npcs: [], quests: [], vendors: [] };

  test("an NPC needs 3 installs on the zone's map; two are not enough", () => {
    const facts: WorldFacts = { ...empty, npcs: [...three(100, "Guard Orin", 1429, 40, 50), sighting("install-a", 101, "Lone Wolf", 1429, 10, 10), sighting("install-b", 101, "Lone Wolf", 1429, 10, 10)] };
    const forest = zoneContents(facts, data).get(1429)!;
    expect(forest.npcs).toEqual([{ npcId: 100, name: "Guard Orin", x: 40, y: 50, reporters: 3, vendor: false }]);
    expect(zoneContents(facts, data).get(1411)!.npcs).toEqual([]);
  });

  test("a vendor is an NPC whose goods 3 installs agree on", () => {
    const facts: WorldFacts = { ...empty, npcs: three(200, "Trader Vell", 1411, 20, 30), vendors: ["a", "b", "c"].map((i) => vendor(`install-${i}`, 200)) };
    expect(zoneContents(facts, data).get(1411)!.npcs[0]).toMatchObject({ npcId: 200, vendor: true });
  });

  test("a quest sits in the zone where its agreed giver stands, with its agreed level", () => {
    const facts: WorldFacts = { ...empty, npcs: three(100, "Guard Orin", 1429, 40, 50), quests: ["a", "b", "c"].map((i) => quest(`install-${i}`, 7, 100, 4)) };
    expect(zoneContents(facts, data).get(1429)!.quests).toEqual([{ questId: 7, title: "Quest 7", level: 4, giverNpcId: 100, turnInNpcId: null }]);
    expect(zoneContents(facts, data).get(1411)!.quests).toEqual([]);
    const twoOnly: WorldFacts = { ...facts, quests: ["a", "b"].map((i) => quest(`install-${i}`, 7, 100)) };
    expect(zoneContents(twoOnly, data).get(1429)!.quests).toEqual([]);
  });

  test("an entrance goes to the smallest released zone around it; one in a held-back zone is not placed", () => {
    const contents = zoneContents(empty, data);
    expect(contents.get(1429)!.entrances).toEqual([{ names: ["Synthetic Stockade"], raid: false, x: 19.8, y: 35.5 }]);
    expect(contents.get(1411)!.entrances.map((e) => e.names[0])).toEqual(["Synthetic Chasm"]);
    expect([...contents.values()].flatMap((c) => c.entrances).map((e) => e.names[0])).not.toContain("Synthetic Spire");
  });

  test("held-back zones are not in the result at all", () => {
    expect([...zoneContents(empty, data).keys()]).toEqual([1411, 1429]);
  });

  test("hasContent is false for a zone with nothing, true with an entrance", () => {
    const contents = zoneContents(empty, { ...data, entrances: [] });
    expect(hasContent(contents.get(1429))).toBe(false);
    expect(hasContent(zoneContents(empty, data).get(1429))).toBe(true);
    expect(hasContent(undefined)).toBe(false);
  });
});
