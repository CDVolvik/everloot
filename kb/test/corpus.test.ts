import { expect, test } from "vitest";
import { mergeCorpus, mergeCorpusBatches, publicRecords } from "../src/corpus.js";
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

test("batched merging equals one merge per upload, including grants, conflicts and replays", () => {
  const changed = loot("epoch:1", { items: [{ itemId: 5, count: 9 }] });
  const legacy = loot("epoch:9"); delete (legacy as { eventId?: string }).eventId;
  const g1 = "a".repeat(64), g2 = "b".repeat(64);
  const batches = [
    { raw: [loot()], grants: [] },
    { raw: [loot("epoch:2"), legacy], grants: [] },
    { raw: [loot("epoch:3")], grants: [g1] },
    { raw: [loot("epoch:3")], grants: [g2, g1] },
    { raw: [changed], grants: [] },
    { raw: [loot("epoch:4"), loot("epoch:2")], grants: [] },
  ];
  const sequential = batches.reduce<ReturnType<typeof mergeCorpus> | undefined>((state, b) => mergeCorpus(state, b.raw, b.grants), undefined);
  expect(mergeCorpusBatches(undefined, batches)).toEqual(sequential);
  const start = mergeCorpus(undefined, [loot("epoch:7")], [g2]);
  expect(mergeCorpusBatches(start, batches)).toEqual(batches.reduce((s, b) => mergeCorpus(s, b.raw, b.grants), start));
});

test("replaying a large snapshot event by event stays linear", () => {
  const batches = Array.from({ length: 20_000 }, (_, i) => ({ raw: [loot(`epoch:${i}`, { installId: `install-${i % 50}` })], grants: [] as string[] }));
  const started = performance.now();
  const state = mergeCorpusBatches(undefined, batches);
  expect(state.events).toHaveLength(20_000);
  // One merge per event was quadratic: about 15 s for 10,000 events on the dev machine.
  expect(performance.now() - started).toBeLessThan(5_000);
});
