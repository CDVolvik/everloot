import { expect, test } from "vitest";
import { formatCopper, goldFactsFromRecords, handleGoldLedger } from "../src/gold-ledger.js";

const snap = {
  installId: "inst-aaaa-1111",
  character: "Bigz",
  realm: "Forever",
  currentCopper: 120000,
  peakCopper: 5389075,
  seenAt: "2026-10-04T18:00:00.000Z",
};

test("copper reads as gold, silver, and copper", () => {
  expect(formatCopper(5389075)).toBe("538g 90s 75c");
  expect(formatCopper(646)).toBe("6s 46c");
  expect(formatCopper(0)).toBe("0c");
});

test("a character with no upload is unrecorded", () => {
  const text = handleGoldLedger({ character: "Bigz", realm: "Forever" });
  expect(text).toBe("Bigz — Forever\nGold unrecorded.");
  expect(text).not.toMatch(/bought|ban/i);
});

test("a snapshot without money events does not invent a zero income", () => {
  const text = handleGoldLedger({ character: "bigz", realm: "forever" }, [snap]);
  expect(text).toContain("Bigz — Forever");
  expect(text).toContain("Peak gold: 538g 90s 75c");
  expect(text).toContain("Current gold: 12g 0s 0c");
  expect(text).toContain("Income is unrecorded.");
  expect(text).toContain("Spending is unrecorded.");
  expect(text).toContain("Gameplay is unrecorded.");
  expect(text).not.toContain("Recorded income is");
  expect(text).not.toMatch(/bought|ban/i);
});

test("loot is named and the other income lines stay unrecorded", () => {
  const text = handleGoldLedger({ character: "Bigz", realm: "Forever" }, [snap], [
    { installId: "inst-aaaa-1111", character: "Bigz", realm: "Forever", category: "loot", copper: 64600, seenAt: "2026-10-04T17:00:00.000Z" },
  ]);
  expect(text).toContain("Loot: 6g 46s 0c");
  expect(text).toContain("Quest rewards, vendor sales, and auction sales are unrecorded.");
  expect(text).toContain("Recorded income is 6g 46s 0c. Peak gold is 538g 90s 75c. The difference is unrecorded.");
  expect(text).not.toMatch(/bought|ban/i);
});

test("two installs are not merged into one remainder", () => {
  const text = handleGoldLedger({ character: "Bigz", realm: "Forever" }, [
    snap,
    { ...snap, installId: "inst-bbbb-2222", peakCopper: 29704, currentCopper: 29704 },
  ], [
    { installId: "inst-bbbb-2222", character: "Bigz", realm: "Forever", category: "loot", copper: 29704, seenAt: "2026-10-04T17:00:00.000Z" },
  ]);
  expect(text).toContain("Ledgers are not merged.");
  expect(text).toContain("Install inst-aaaa-1111");
  expect(text).toContain("Install inst-bbbb-2222");
  expect(text).not.toContain("541g");
});

test("loot without a snapshot leaves the peak unrecorded", () => {
  const text = handleGoldLedger({ character: "Bigz", realm: "Forever" }, [], [
    { installId: "inst-aaaa-1111", character: "Bigz", realm: "Forever", category: "loot", copper: 100, seenAt: "2026-10-04T17:00:00.000Z" },
  ]);
  expect(text).toContain("Peak gold unrecorded.");
  expect(text).toContain("Loot: 1s 0c");
  expect(text).not.toContain("Recorded income is");
});

test("gold_snapshot and money_event records become facts", () => {
  const facts = goldFactsFromRecords([
    { kind: "gold_snapshot", installId: "a", character: "Bigz", realm: "Forever", currentCopper: 1, peakCopper: 2, capturedAt: "2026-10-04T00:00:00.000Z" },
    { kind: "money_event", installId: "a", character: "Bigz", realm: "Forever", category: "loot", copper: 50, capturedAt: "2026-10-04T00:00:00.000Z" },
    { kind: "money_event", installId: "a", character: "Bigz", realm: "Forever", category: "gift", copper: 50 },
    { kind: "loot", installId: "a" },
  ]);
  expect(facts.snapshots).toHaveLength(1);
  expect(facts.events).toEqual([
    { installId: "a", character: "Bigz", realm: "Forever", category: "loot", copper: 50, seenAt: "2026-10-04T00:00:00.000Z" },
  ]);
});
