import { expect, test } from "vitest";
import { mapBoundsFromRecords, rollupMapBounds, type MapBoundsRow } from "../src/map-bounds.js";

const zone = { mapId: 1429, continentId: 0, left: 1535.4, top: -7939.6, right: -1599.6, bottom: -10254.2 };
const report = (installId: string, change: Partial<MapBoundsRow> = {}, capturedAt = "2026-10-17T00:00:00Z"): MapBoundsRow =>
  ({ installId, capturedAt, ...zone, ...change });

test("three installs that agree within one world unit give a zone its bounds", () => {
  const [bounds] = rollupMapBounds([report("a"), report("b", { left: zone.left + 0.6, bottom: zone.bottom - 0.9 }), report("c")]);
  expect(bounds).toMatchObject({ ...zone, installs: 3, agreed: true });
});

test("two installs that agree are not enough", () => {
  const [bounds] = rollupMapBounds([report("a"), report("b")]);
  expect(bounds).toMatchObject({ installs: 2, agreed: false });
});

test("one install, however often it reports, is not agreement", () => {
  const [bounds] = rollupMapBounds([report("a"), report("a"), report("a")]);
  expect(bounds).toMatchObject({ mapId: 1429, installs: 1, agreed: false });
});

test("more than one world unit apart, or another continent, is a disagreement", () => {
  expect(rollupMapBounds([report("a"), report("b", { right: zone.right + 1.5 })])[0]).toMatchObject({ installs: 1, agreed: false });
  expect(rollupMapBounds([report("a"), report("b", { continentId: 1 })])[0]).toMatchObject({ installs: 1, agreed: false });
});

test("when a build moves a zone, the newest agreed bounds win", () => {
  const moved = { left: zone.left + 100, right: zone.right + 100 };
  const [bounds] = rollupMapBounds([
    report("a", {}, "2026-10-10T00:00:00Z"), report("b", {}, "2026-10-10T00:00:00Z"), report("c", {}, "2026-10-10T00:00:00Z"),
    report("d", moved, "2026-10-17T00:00:00Z"), report("e", moved, "2026-10-17T00:00:00Z"), report("f", moved, "2026-10-17T00:00:00Z"),
  ]);
  expect(bounds).toMatchObject({ left: zone.left + 100, right: zone.right + 100, installs: 3, agreed: true });
});

test("each install's newest report is the one that counts", () => {
  const [bounds] = rollupMapBounds([
    report("a", { top: zone.top + 50 }, "2026-10-10T00:00:00Z"),
    report("a", {}, "2026-10-17T00:00:00Z"),
    report("b", {}, "2026-10-17T00:00:00Z"),
    report("c", {}, "2026-10-17T00:00:00Z"),
  ]);
  expect(bounds).toMatchObject({ top: zone.top, installs: 3, agreed: true });
});

test("zones come from map_bounds records only, and the result holds no install id", () => {
  const rows = mapBoundsFromRecords([
    { kind: "map_bounds", installId: "install-one", capturedAt: "2026-10-17T00:00:00Z", ...zone },
    { kind: "map_bounds", installId: "install-two", capturedAt: "2026-10-17T00:00:00Z", ...zone, mapId: 1430, left: 1 },
    { kind: "map_bounds", installId: "install-six", capturedAt: "2026-10-17T00:00:00Z", ...zone, top: "north" },
    { kind: "npc_sighting", installId: "install-one", mapId: 1429 },
  ]);
  expect(rows.map((r) => r.mapId)).toEqual([1429, 1430]);
  const result = rollupMapBounds(rows);
  expect(result.map((b) => b.mapId)).toEqual([1429, 1430]);
  expect(JSON.stringify(result)).not.toContain("install-");
});
