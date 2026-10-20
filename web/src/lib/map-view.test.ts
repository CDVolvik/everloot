import { describe, expect, test } from "vitest";
import {
  DEFAULT_LAYERS, DEFAULT_SPOILERS, labelFontPx, mapHref, parseDeepLink, parseViewState, parseZoneLink, placeLabels, searchMap, viewSearch,
  visibleItems, wayCommand, zoneHref, zoneSpot, type MapItems,
} from "./map-view";

const items: MapItems = {
  zones: [
    { mapId: 1, name: "Open", x: 0, y: 0, width: 1000, height: 500, heldBack: false },
    { mapId: 2, name: "Held", x: 2000, y: 0, width: 100, height: 100, heldBack: true },
    { mapId: 3, name: "Open City", x: 100, y: 100, width: 100, height: 100, heldBack: false },
  ],
  entrances: [{ id: "e", names: ["Open Dungeon"], raid: false, x: 5, y: 5, worldX: 0, worldY: 0 }],
  pins: [
    { id: "n1", kind: "npc", npcId: 1, name: "A", mapId: 1, zoneName: "Open", x: 0, y: 0, zoneX: 1, zoneY: 1, reporters: 3, heldBack: false },
    { id: "n2", kind: "npc", npcId: 2, name: "B", mapId: 2, zoneName: "Held", x: 0, y: 0, zoneX: 1, zoneY: 1, reporters: 3, heldBack: true },
    { id: "v1", kind: "vendor", npcId: 3, name: "C", mapId: 1, zoneName: "Open", x: 0, y: 0, zoneX: 1, zoneY: 1, reporters: 3, heldBack: false },
  ],
  flightMasters: [
    { id: "f1", name: "Open Post", x: 1, y: 1, heldBack: false },
    { id: "f2", name: "Held Post", x: 2, y: 2, heldBack: true },
  ],
  flightLines: [
    { id: "l1", from: "f1", to: "f2", points: [[1, 1], [2, 2]], heldBack: true },
    { id: "l2", from: "f1", to: "f1", points: [[1, 1], [3, 3]], heldBack: false },
  ],
};

describe("layers and the spoiler switch", () => {
  test("spoilers are off by default, and held-back zones and their points stay hidden", () => {
    expect(DEFAULT_SPOILERS).toBe(false);
    const shown = visibleItems(items, DEFAULT_LAYERS, DEFAULT_SPOILERS);
    expect(shown.zones.map((z) => z.name)).toEqual(["Open", "Open City"]);
    expect(shown.pins.map((p) => p.id)).toEqual(["n1", "v1"]);
    expect(shown.flightMasters.map((f) => f.id)).toEqual(["f1"]);
    expect(shown.flightLines.map((l) => l.id)).toEqual(["l2"]);
  });

  test("the spoiler switch reveals them", () => {
    const shown = visibleItems(items, DEFAULT_LAYERS, true);
    expect(shown.zones.map((z) => z.name)).toEqual(["Open", "Held", "Open City"]);
    expect(shown.pins.map((p) => p.id)).toEqual(["n1", "n2", "v1"]);
    expect(shown.flightMasters).toHaveLength(2);
    expect(shown.flightLines).toHaveLength(2);
  });

  test("each layer toggles on its own", () => {
    expect(visibleItems(items, { ...DEFAULT_LAYERS, zones: false }, true).zones).toEqual([]);
    expect(visibleItems(items, { ...DEFAULT_LAYERS, entrances: false }, true).entrances).toEqual([]);
    expect(visibleItems(items, { ...DEFAULT_LAYERS, npcs: false }, true).pins.map((p) => p.kind)).toEqual(["vendor"]);
    expect(visibleItems(items, { ...DEFAULT_LAYERS, vendors: false }, true).pins.map((p) => p.kind)).toEqual(["npc", "npc"]);
    expect(visibleItems(items, { ...DEFAULT_LAYERS, flightMasters: false }, true).flightMasters).toEqual([]);
    expect(visibleItems(items, { ...DEFAULT_LAYERS, flightPaths: false }, true).flightLines).toEqual([]);
    const none = visibleItems(items, { zones: false, entrances: false, flightMasters: false, flightPaths: false, npcs: false, vendors: false }, true);
    expect(none).toEqual({ zones: [], entrances: [], pins: [], flightMasters: [], flightLines: [] });
  });

  test("filtering does not change the input", () => {
    const copy = JSON.stringify(items);
    visibleItems(items, DEFAULT_LAYERS, false);
    expect(JSON.stringify(items)).toBe(copy);
  });
});

describe("zone coordinates and /way", () => {
  test("a point is placed on the zone's 0 to 100 scale from its top-left corner", () => {
    const at = zoneSpot(items.zones, 250, 125);
    expect(at?.zone.name).toBe("Open");
    expect(at).toMatchObject({ x: 25, y: 25 });
  });

  test("where zones overlap the smallest wins, and a point outside every zone has no spot", () => {
    expect(zoneSpot(items.zones, 150, 150)?.zone.name).toBe("Open City");
    expect(zoneSpot(items.zones, 150, 150)).toMatchObject({ x: 50, y: 50 });
    expect(zoneSpot(items.zones, 5000, 5000)).toBeNull();
  });

  test("the waypoint line is /way, the two numbers, then the name", () => {
    expect(wayCommand(42.5, 60, "Stormwind Guard")).toBe("/way 42.5 60 Stormwind Guard");
    expect(wayCommand(1, 2, "")).toBe("/way 1 2");
  });
});

describe("map search", () => {
  test("finds zones, entrances, flight masters and NPCs by name, names that start with the query first", () => {
    expect(searchMap(items, "open").map((h) => h.label)).toEqual(["Open", "Open City", "Open Post", "Open Dungeon"]);
    expect(searchMap(items, "open post")[0]).toMatchObject({ kind: "flight", label: "Open Post", id: "f1" });
    expect(searchMap(items, "a")).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "npc", label: "A" })]));
  });

  test("every word must match, and an empty query finds nothing", () => {
    expect(searchMap(items, "open city").map((h) => h.label)).toEqual(["Open City"]);
    expect(searchMap(items, "city open").map((h) => h.label)).toEqual(["Open City"]);
    expect(searchMap(items, "  ")).toEqual([]);
    expect(searchMap(items, "nothing like this")).toEqual([]);
  });

  test("searches only what is shown, so a held-back zone never turns up", () => {
    const shown = visibleItems(items, DEFAULT_LAYERS, false);
    expect(searchMap(shown, "held")).toEqual([]);
    expect(searchMap(visibleItems(items, DEFAULT_LAYERS, true), "held").map((h) => h.label)).toContain("Held");
  });

  test("a zone hit points at the middle of the zone, and the list is capped", () => {
    expect(searchMap(items, "open city")[0]).toMatchObject({ x: 150, y: 150 });
    const many: MapItems = { ...items, zones: Array.from({ length: 30 }, (_, i) => ({ mapId: i, name: `Zone ${i}`, x: 0, y: 0, width: 1, height: 1, heldBack: false })) };
    expect(searchMap(many, "zone")).toHaveLength(8);
  });
});

describe("links", () => {
  test("a link round-trips", () => {
    expect(parseDeepLink({ zone: "1429", x: "42.5", y: "60" })).toEqual({ mapId: 1429, x: 42.5, y: 60 });
    expect(mapHref({ mapId: 1429, x: 42.55, y: 60 })).toBe("/map?zone=1429&x=42.6&y=60");
  });

  test("anything malformed or out of range is not a pin link", () => {
    for (const q of [
      {}, { zone: "1429" }, { zone: "abc", x: "1", y: "1" }, { zone: "1429", x: "101", y: "1" }, { zone: "1429", x: "-1", y: "1" },
      { zone: "1429", x: "1", y: "NaN" }, { zone: "1.5", x: "1", y: "1" }, { zone: "0", x: "1", y: "1" }, { zone: "1429", x: "1e2", y: "1" },
    ]) expect(parseDeepLink(q), JSON.stringify(q)).toBeNull();
  });

  test("a repeated parameter uses the first", () => {
    expect(parseDeepLink({ zone: ["1429", "1"], x: ["5", "6"], y: "7" })).toEqual({ mapId: 1429, x: 5, y: 7 });
  });

  test("a zone with no spot is a zone link: the zone is fitted to the view", () => {
    expect(parseZoneLink({ zone: "1429" })).toBe(1429);
    expect(zoneHref(1429)).toBe("/map?zone=1429");
    expect(zoneHref(1429, true)).toBe("/map?zone=1429&spoilers=1");
    // Only the whole-number zone id is read; a spot makes it a pin link instead.
    expect(parseZoneLink({ zone: "1429", x: "10", y: "20" })).toBeNull();
    for (const q of [{}, { zone: "abc" }, { zone: "0" }, { zone: "1.5" }, { zone: "-3" }]) expect(parseZoneLink(q), JSON.stringify(q)).toBeNull();
    // A half spot is not a pin, so the zone still opens.
    expect(parseZoneLink({ zone: "1429", x: "10" })).toBe(1429);
  });

  test("the view in the address: centre, zoom and selected item, read back the same", () => {
    const search = viewSearch(new URLSearchParams("continent=0&zone=1429&pin=old"), { x: 1234.6, y: -88.2, zoom: -2.337, pin: "e5" });
    const q = new URLSearchParams(search);
    expect(q.get("continent")).toBe("0");
    expect(q.get("zone")).toBe("1429");
    expect(parseViewState({ at: q.get("at")!, z: q.get("z")!, pin: q.get("pin")! })).toEqual({ at: [1235, -88], zoom: -2.34, pin: "e5" });
    expect(new URLSearchParams(viewSearch(new URLSearchParams(), { x: 0, y: 0, zoom: 1, pin: null })).has("pin")).toBe(false);
  });

  test("an entrance's id, which carries its world position, is a valid pin", () => {
    expect(parseViewState({ pin: "e-4459.4--1660.2" }).pin).toBe("e-4459.4--1660.2");
  });

  test("a malformed view is left out, so a bad link opens the plain map", () => {
    expect(parseViewState({ at: "abc,1", z: "99", pin: "<script>" })).toEqual({ at: null, zoom: null, pin: null });
    expect(parseViewState({})).toEqual({ at: null, zoom: null, pin: null });
  });
});

describe("labels", () => {
  test("label size is 11 to 14 pixels at every zoom", () => {
    expect(labelFontPx(1)).toBe(11);
    expect(labelFontPx(40)).toBeLessThanOrEqual(14);
    expect(labelFontPx(8)).toBeGreaterThan(labelFontPx(2));
    expect(labelFontPx(0)).toBe(11);
  });

  const view = { x: 0, y: 0, width: 1000, height: 500 };
  const at = (id: string, x: number, y: number, priority: number, text = "Tirisfal Glades") => ({ id, text, x, y, priority, align: "middle" as const });

  test("labels that collide give way to the higher priority; far apart ones all show", () => {
    const placed = placeLabels([at("low", 500, 250, 1), at("high", 510, 252, 9)], view, 1000, 11);
    expect(placed.map((l) => l.id)).toEqual(["high"]);
    expect(placeLabels([at("a", 200, 100, 1), at("b", 800, 400, 1)], view, 1000, 11)).toHaveLength(2);
  });

  test("a label that would be clipped by the edge is hidden, one that is only close is kept", () => {
    expect(placeLabels([at("edge", 5, 250, 1)], view, 1000, 11)).toEqual([]);
    expect(placeLabels([at("edge", 500, 2, 1)], view, 1000, 11)).toEqual([]);
    expect(placeLabels([at("ok", 500, 250, 1)], view, 1000, 11)).toHaveLength(1);
  });

  test("the same input always places the same labels, whatever the order it arrives in", () => {
    const a = [at("a", 500, 250, 5), at("b", 505, 250, 5, "Silverpine Forest"), at("c", 100, 100, 1)];
    expect(placeLabels(a, view, 1000, 11).map((l) => l.id)).toEqual(placeLabels([...a].reverse(), view, 1000, 11).map((l) => l.id));
  });
});
