import { expect, test } from "vitest";
import {
  emptyMarket, foldMarket, handleMarketValue, itemMarket, marketPrices, realmMarket,
} from "../src/market.js";

const NOW = new Date("2026-10-20T12:00:00Z");

function snapshot(installId: string, day: string, items: number[][], extra: Record<string, unknown> = {}) {
  return {
    kind: "auction_snapshot", installId, eventId: `${installId}:${day}`, capturedAt: `${day}T10:00:00Z`,
    realm: "Forever", scanId: `${installId}-${day}`, part: 1, parts: 1, items, ...extra,
  };
}

// [itemId, auctions, quantity, minUnit, marketUnit]
const three = (day: string, coppers: [number, number, number]) => [
  snapshot("install-a", day, [[2589, 4, 80, coppers[0], coppers[0] + 10]]),
  snapshot("install-b", day, [[2589, 5, 100, coppers[1], coppers[1] + 10]]),
  snapshot("install-c", day, [[2589, 6, 120, coppers[2], coppers[2] + 10]]),
];

test("a day is public when 3 installs scanned the item; values are medians", () => {
  const state = foldMarket(emptyMarket(), three("2026-10-20", [100, 300, 500]), NOW);
  const { value, points } = itemMarket(state, "forever", 2589, NOW);
  expect(points).toEqual([{ day: "2026-10-20", min: 300, market: 310, quantity: 100, reporters: 3 }]);
  expect(value).toMatchObject({ itemId: 2589, market: 310, min: 300, historical: 310, quantity: 100, reporters: 3, ageDays: 0 });
});

test("two installs are not enough, and an unscanned item is unrecorded, never zero", () => {
  const state = foldMarket(emptyMarket(), three("2026-10-20", [100, 300, 500]).slice(0, 2), NOW);
  expect(itemMarket(state, "Forever", 2589, NOW)).toEqual({ value: null, points: [] });
  expect(handleMarketValue({ realm: "Forever", itemId: 2589 }, state, NOW)).toContain("No public market value");
  expect(handleMarketValue({ realm: "Forever", itemId: 2589 }, state, NOW)).not.toMatch(/\b0c\b/);
});

test("an install's last scan of the day wins", () => {
  const later = snapshot("install-a", "2026-10-20", [[2589, 1, 10, 900, 950]], { capturedAt: "2026-10-20T11:00:00Z", eventId: "a:late" });
  const earlier = snapshot("install-a", "2026-10-20", [[2589, 1, 10, 1, 1]], { capturedAt: "2026-10-20T09:00:00Z", eventId: "a:early" });
  const state = foldMarket(emptyMarket(), [later, earlier, ...three("2026-10-20", [100, 300, 500]).slice(1)], NOW);
  expect(itemMarket(state, "Forever", 2589, NOW).points[0]).toMatchObject({ min: 500, reporters: 3 });
});

test("market value weights recent days; historical is the median of 60 days", () => {
  const rows = [
    ...three("2026-10-20", [100, 100, 100]), // age 0, weight 15, market 110
    ...three("2026-10-10", [200, 200, 200]), // age 10, weight 5, market 210
    ...three("2026-09-01", [900, 900, 900]), // age 49: historical only
  ];
  const { value } = itemMarket(foldMarket(emptyMarket(), rows, NOW), "Forever", 2589, NOW);
  expect(value!.market).toBe(Math.round((110 * 15 + 210 * 5) / 20));
  expect(value!.historical).toBe(210);
  expect(value!.day).toBe("2026-10-20");
});

test("only old public days: historical stays, market is unrecorded", () => {
  const { value } = itemMarket(foldMarket(emptyMarket(), three("2026-09-25", [100, 200, 300]), NOW), "Forever", 2589, NOW);
  expect(value).toMatchObject({ market: null, historical: 210, ageDays: 25 });
});

test("days past 60 and far-future scans are dropped; folding prunes old state", () => {
  const old = foldMarket(emptyMarket(), three("2026-10-01", [1, 1, 1]), new Date("2026-10-02T00:00:00Z"));
  const pruned = foldMarket(old, three("2026-08-01", [5, 5, 5]).concat(three("2026-12-20", [7, 7, 7])), new Date("2026-12-15T00:00:00Z"));
  expect(itemMarket(pruned, "Forever", 2589, new Date("2026-12-15T00:00:00Z")).points).toEqual([]);
  expect(JSON.stringify(pruned)).not.toContain("2026-10-01");
});

test("realms match case-insensitively and keep the first display name", () => {
  const rows = three("2026-10-20", [100, 300, 500]).map((r, i) => ({ ...r, realm: i ? "forever" : "Forever " }));
  const state = foldMarket(emptyMarket(), rows, NOW);
  expect(realmMarket(state, "FOREVER", NOW).map((v) => v.itemId)).toEqual([2589]);
  expect(marketPrices(state, "forever", NOW)).toMatchObject({ realm: "Forever", items: [[2589, 310, 300, 310, 100, "2026-10-20", 3]] });
});

test("other kinds and malformed snapshots are ignored", () => {
  const bad = [
    { kind: "auction_scan", installId: "install-a", realm: "Forever", itemId: 1, copper: 5, capturedAt: "2026-10-20T00:00:00Z" },
    snapshot("install-a", "2026-10-20", [[2589, 1, 1, -5, 1]]),
    snapshot("install-b", "2026-10-20", [[0, 1, 1, 5, 5]]),
    snapshot("install-c", "2026-10-20", "not items" as unknown as number[][]),
    snapshot("install-d", "not-a-day", [[2589, 1, 1, 5, 5]]),
  ];
  expect(foldMarket(emptyMarket(), bad, NOW)).toEqual(emptyMarket());
});

test("realm view lists public items by quantity", () => {
  const rows = [
    ...three("2026-10-20", [100, 300, 500]),
    ...["install-a", "install-b", "install-c"].map((id) => snapshot(id, "2026-10-20", [[765, 2, 900, 30, 33]], { eventId: `${id}:herb` })),
  ];
  expect(realmMarket(foldMarket(emptyMarket(), rows, NOW), "Forever", NOW).map((v) => v.itemId)).toEqual([765, 2589]);
});
