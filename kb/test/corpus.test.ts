import { expect, test } from "vitest";
import { mergeCorpus, publicRecords } from "../src/corpus.js";
import { parseRecords } from "../../web/src/lib/intake.js";

const loot = (eventId = "epoch:1", over = {}) => ({
  kind: "loot", installId: "install-one", eventId,
  capturedAt: "2026-10-07T00:00:00Z", sourceNpcId: 42,
  items: [{ itemId: 5, count: 1 }], ...over,
});

test("event identity survives canonical parsing", () => {
  expect(parseRecords([loot()]).records[0]).toHaveProperty("eventId", "epoch:1");
});
test("replays count once, but distinct identical same-second events count separately", () => {
  const a = mergeCorpus(undefined, [loot(), loot()]);
  expect(publicRecords(a)).toHaveLength(1);
  const b = mergeCorpus(a, [loot(), loot("epoch:2")]);
  expect(publicRecords(b)).toHaveLength(2);
  expect(b).toEqual(mergeCorpus(undefined, [loot(), loot(), loot(), loot("epoch:2")]));
});
test("conflicts are order independent and cannot be restored by replay", () => {
  const changed = loot("epoch:1", { items: [{ itemId: 5, count: 9 }] });
  const a = mergeCorpus(mergeCorpus(undefined, [loot()]), [changed]);
  const b = mergeCorpus(undefined, [changed, loot()]);
  expect(a).toEqual(b);
  expect(publicRecords(mergeCorpus(JSON.parse(JSON.stringify(a)), [loot()]))).toEqual([]);
  expect(a.conflicts).toHaveLength(1);
});
test("legacy rows and rejected rows are withheld while raw inputs remain untouched", () => {
  const legacy = loot(); delete (legacy as { eventId?: string }).eventId;
  const invalid = loot("epoch:2", { installId: "" });
  const state = mergeCorpus(undefined, [legacy, invalid, loot()]);
  expect(state.legacyRecords).toBe(1);
  expect(publicRecords(state)).toEqual(parseRecords([loot()]).records);
  expect(legacy).not.toHaveProperty("eventId");
});
test("named records are private when no live publication authorization is supplied", () => {
  const state = mergeCorpus(undefined, [{ ...loot(), kind: "gold_snapshot",
    character: "Thrall", realm: "Moon Guard", currentCopper: 100, peakCopper: 100 }]);
  expect(publicRecords(state)).toEqual([]);
});
