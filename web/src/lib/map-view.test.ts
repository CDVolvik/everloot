import { describe, expect, test } from "vitest";
import {
  DEFAULT_LAYERS, DEFAULT_SPOILERS, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, cameraBox, cameraForKey, cameraOn, fitCamera, homeCamera, mapHref, panBy,
  parseDeepLink, pinchFactor, visibleItems, zoomAt, type MapItems,
} from "./map-view";

const base = { x: -1000, y: -500, width: 2000, height: 1000 };
const home = homeCamera(base);

describe("zoom and pan maths", () => {
  test("home shows the whole base box", () => {
    expect(cameraBox(base, home)).toEqual(base);
  });

  test("zoom is clamped to its limits", () => {
    expect(zoomAt(base, home, 0.1, 0, 0).zoom).toBe(MIN_ZOOM);
    expect(zoomAt(base, home, 1e6, 0, 0).zoom).toBe(MAX_ZOOM);
    expect(fitCamera(base, { zoom: NaN, cx: NaN, cy: NaN })).toEqual(home);
  });

  test("zooming keeps the point under the cursor still", () => {
    const start = fitCamera(base, { zoom: 2, cx: -200, cy: 0 });
    const focus = { x: 100, y: 120 };
    const before = cameraBox(base, start);
    const next = zoomAt(base, start, 2, focus.x, focus.y);
    const after = cameraBox(base, next);
    expect(next.zoom).toBe(4);
    // The focus sits at the same share of the view before and after.
    expect((focus.x - before.x) / before.width).toBeCloseTo((focus.x - after.x) / after.width, 9);
    expect((focus.y - before.y) / before.height).toBeCloseTo((focus.y - after.y) / after.height, 9);
  });

  test("the camera cannot leave the map", () => {
    const zoomed = fitCamera(base, { zoom: 4, cx: 0, cy: 0 });
    const far = panBy(base, zoomed, 1e6, -1e6);
    const v = cameraBox(base, far);
    expect(v.x + v.width).toBeCloseTo(base.x + base.width);
    expect(v.y).toBeCloseTo(base.y);
    expect(panBy(base, home, 500, 500)).toEqual(home);
  });

  test("keys pan by a share of the view, zoom by a step, and reset", () => {
    const z = fitCamera(base, { zoom: 4, cx: 0, cy: 0 });
    expect(cameraForKey(base, z, "ArrowRight")!.cx).toBeCloseTo(z.cx + (base.width / 4) * 0.2);
    expect(cameraForKey(base, z, "ArrowUp")!.cy).toBeLessThan(z.cy);
    expect(cameraForKey(base, z, "+")!.zoom).toBeCloseTo(4 * ZOOM_STEP);
    expect(cameraForKey(base, z, "-")!.zoom).toBeCloseTo(4 / ZOOM_STEP);
    expect(cameraForKey(base, z, "0")).toEqual(home);
    expect(cameraForKey(base, z, "Tab")).toBeNull();
    expect(cameraForKey(base, z, "a")).toBeNull();
  });

  test("pinch scales by the ratio of finger distances and ignores a zero distance", () => {
    expect(pinchFactor(100, 200)).toBe(2);
    expect(pinchFactor(200, 100)).toBe(0.5);
    expect(pinchFactor(0, 100)).toBe(1);
    expect(pinchFactor(100, 0)).toBe(1);
  });

  test("cameraOn centres a point and shows about the span asked for", () => {
    const c = cameraOn(base, 300, 100, 500);
    expect(c.zoom).toBe(4);
    expect(cameraBox(base, c)).toMatchObject({ width: 500, x: 50 });
  });
});

describe("layers and the spoiler switch", () => {
  const items: MapItems = {
    zones: [
      { mapId: 1, name: "Open", x: 0, y: 0, width: 1, height: 1, heldBack: false },
      { mapId: 2, name: "Held", x: 0, y: 0, width: 1, height: 1, heldBack: true },
    ],
    entrances: [{ id: "e", names: ["Dungeon"], raid: false, x: 0, y: 0, worldX: 0, worldY: 0 }],
    pins: [
      { id: "n1", kind: "npc", npcId: 1, name: "A", mapId: 1, zoneName: "Open", x: 0, y: 0, zoneX: 1, zoneY: 1, reporters: 3, heldBack: false },
      { id: "n2", kind: "npc", npcId: 2, name: "B", mapId: 2, zoneName: "Held", x: 0, y: 0, zoneX: 1, zoneY: 1, reporters: 3, heldBack: true },
      { id: "v1", kind: "vendor", npcId: 3, name: "C", mapId: 1, zoneName: "Open", x: 0, y: 0, zoneX: 1, zoneY: 1, reporters: 3, heldBack: false },
    ],
  };

  test("spoilers are off by default, and held-back zones and their points stay hidden", () => {
    expect(DEFAULT_SPOILERS).toBe(false);
    const shown = visibleItems(items, DEFAULT_LAYERS, DEFAULT_SPOILERS);
    expect(shown.zones.map((z) => z.name)).toEqual(["Open"]);
    expect(shown.pins.map((p) => p.id)).toEqual(["n1", "v1"]);
  });

  test("the spoiler switch reveals them", () => {
    const shown = visibleItems(items, DEFAULT_LAYERS, true);
    expect(shown.zones.map((z) => z.name)).toEqual(["Open", "Held"]);
    expect(shown.pins.map((p) => p.id)).toEqual(["n1", "n2", "v1"]);
  });

  test("each layer toggles on its own", () => {
    expect(visibleItems(items, { ...DEFAULT_LAYERS, zones: false }, true).zones).toEqual([]);
    expect(visibleItems(items, { ...DEFAULT_LAYERS, entrances: false }, true).entrances).toEqual([]);
    expect(visibleItems(items, { ...DEFAULT_LAYERS, npcs: false }, true).pins.map((p) => p.kind)).toEqual(["vendor"]);
    expect(visibleItems(items, { ...DEFAULT_LAYERS, vendors: false }, true).pins.map((p) => p.kind)).toEqual(["npc", "npc"]);
    const none = visibleItems(items, { zones: false, entrances: false, npcs: false, vendors: false }, true);
    expect(none).toEqual({ zones: [], entrances: [], pins: [] });
  });

  test("filtering does not change the input", () => {
    const copy = JSON.stringify(items);
    visibleItems(items, DEFAULT_LAYERS, false);
    expect(JSON.stringify(items)).toBe(copy);
  });
});

describe("deep links", () => {
  test("a link round-trips", () => {
    expect(parseDeepLink({ zone: "1429", x: "42.5", y: "60" })).toEqual({ mapId: 1429, x: 42.5, y: 60 });
    expect(mapHref({ mapId: 1429, x: 42.55, y: 60 })).toBe("/map?zone=1429&x=42.6&y=60");
  });

  test("anything malformed or out of range opens the plain map", () => {
    for (const q of [
      {}, { zone: "1429" }, { zone: "abc", x: "1", y: "1" }, { zone: "1429", x: "101", y: "1" }, { zone: "1429", x: "-1", y: "1" },
      { zone: "1429", x: "1", y: "NaN" }, { zone: "1.5", x: "1", y: "1" }, { zone: "0", x: "1", y: "1" }, { zone: "1429", x: "1e2", y: "1" },
    ]) expect(parseDeepLink(q), JSON.stringify(q)).toBeNull();
  });

  test("a repeated parameter uses the first", () => {
    expect(parseDeepLink({ zone: ["1429", "1"], x: ["5", "6"], y: "7" })).toEqual({ mapId: 1429, x: 5, y: 7 });
  });
});