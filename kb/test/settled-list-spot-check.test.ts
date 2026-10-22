import { expect, test } from "vitest";
import { computeSettled, decodeIds } from "../src/settled-list.js";
import { isSpotChecked } from "../src/spot-check.js";

const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString();
const quests = Array.from({ length: 5 }, (_, i) => ({ kind: "quest", installId: `install-${i}`, capturedAt: day(0), questId: 20, title: "A Threat Within", level: 5, rewardItemIds: [] }));
const loot = (n: number, from: number, at: number) => Array.from({ length: n }, (_, i) => ({ kind: "loot", installId: `install-${(from + i) % 5}`, capturedAt: day(at), sourceNpcId: 10, sourceEvidence: "loot-api", items: [{ itemId: 30, count: 1 }] }));

test("a spot-checked quest is left out of the settled list that week only", () => {
  const weeks = Array.from({ length: 520 }, (_, i) => `${2026 + Math.floor(i / 52)}-W${String((i % 52) + 1).padStart(2, "0")}`);
  const picked = weeks.find((w) => isSpotChecked({ key: "quest:20", zone: null }, w))!;
  const other = weeks.find((w) => !isSpotChecked({ key: "quest:20", zone: null }, w))!;
  expect(decodeIds(computeSettled({ records: quests, asOf: day(30), build: "1.0.0", week: other }).quest)).toEqual([20]);
  expect(decodeIds(computeSettled({ records: quests, asOf: day(30), build: "1.0.0", week: picked }).quest)).toEqual([]);
});

test("a scoped loot source settles again on the windows after its date", () => {
  const records = [...loot(300, 0, 0), ...loot(250, 0, 21)];
  const scope = { since: day(20), source: "https://example.test/hotfix", type: "drops" as const, ids: [10] };
  const listed = (asOf: string) => computeSettled({ records, asOf, build: "1.0.0", recheck: [scope], week: "2026-W03" }).loot.npc;
  expect(decodeIds(computeSettled({ records: loot(300, 0, 0), asOf: day(30), build: "1.0.0", week: "2026-W03" }).loot.npc)).toEqual([10]);
  expect(decodeIds(listed(day(60)))).toEqual([10]);
  // Old windows alone no longer count once the scope begins.
  expect(decodeIds(computeSettled({ records: loot(300, 0, 0), asOf: day(60), build: "1.0.0", recheck: [scope], week: "2026-W03" }).loot.npc)).toEqual([]);
  // Without a week, nothing is spot-checked: the list is a pure function of its input.
  expect(decodeIds(computeSettled({ records: quests, asOf: day(30), build: "1.0.0" }).quest)).toEqual([20]);
});
