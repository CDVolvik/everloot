import { expect, test } from "vitest";
import { auctionSightingsFromRecords, handleAuctionHistory, type AuctionSighting } from "../src/auction-history.js";

function scan(installId: string, copper: number, seenAt = "2026-09-30T12:00:00.000Z"): AuctionSighting {
  return { installId, realm: "Forever", itemId: 1234, copper, seenAt };
}

test("three scans on one day publish the median and a thin day stays off", () => {
  const text = handleAuctionHistory({ realm: "Forever", itemId: 1234 }, [
    scan("a", 100),
    scan("b", 300),
    scan("c", 500),
    scan("a", 900, "2026-10-01T12:00:00.000Z"),
    scan("b", 900, "2026-10-01T12:00:00.000Z"),
  ]);
  expect(text).toContain("2026-09-30  3s 0c  3 reporters");
  expect(text).not.toContain("2026-10-01");
});

test("one install repeating a scan is not three reporters", () => {
  const text = handleAuctionHistory({ realm: "Forever", itemId: 1234 }, [
    scan("a", 100),
    scan("a", 100, "2026-09-30T18:00:00.000Z"),
    scan("b", 100),
  ]);
  expect(text).toContain("Price unrecorded");
  expect(handleAuctionHistory({ realm: " ", itemId: 1 })).toBe("Name a realm.");
  expect(handleAuctionHistory({ realm: "Forever", itemId: 0 })).toBe("Name an item id.");
});

test("auction_scan records keep the capture time", () => {
  const rows = auctionSightingsFromRecords([
    { kind: "auction_scan", installId: "a", realm: "Forever", itemId: 1, copper: 50, capturedAt: "2026-09-30T00:00:00.000Z" },
    { kind: "loot", installId: "a" },
  ]);
  expect(rows).toEqual([
    { installId: "a", realm: "Forever", itemId: 1, copper: 50, seenAt: "2026-09-30T00:00:00.000Z" },
  ]);
});
