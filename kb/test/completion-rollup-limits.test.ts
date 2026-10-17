import { expect, test } from "vitest";
import {
  agreedCatalog, COMPLETION_LIMITS, completionFactsOf, emptyCompletion, foldCompletion, normalizeCompletion, trimCompletion,
  type CompletionState, type CompletionUpload,
} from "../src/completion-rollup.js";

const at = "2026-10-10T00:00:00Z";
let seq = 0;
const reporter = (n: number) => n.toString(16).padStart(16, "0");
/** Achievement rows: their ids go up to 2e9, where title ids stop at 5000. */
const title = (installId: string, achievementId: number, name = `Achievement ${achievementId}`) =>
  ({ kind: "achievement_catalog", installId, eventId: `e:${++seq}`, capturedAt: at, achievementId, name, categoryId: 1, category: "General", points: 10, criteriaCount: 0, criteria: [] });
const titles = (r: number, from: number, n: number, receivedAt = at, name?: (id: number) => string): CompletionUpload => ({
  grants: [], reporter: reporter(r), receivedAt,
  records: Array.from({ length: n }, (_, i) => title(`install-${r}`, from + i, name?.(from + i))),
});
const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}T00:00:00Z`;

// --- timing: a fold never scans the whole catalog per row --------------------------------------------

test("4000 new ids fold in well under a second at 16k ids, and 18 uploads at the cap stay fast", () => {
  const state = emptyCompletion();
  let id = 1;
  for (let r = 0; r < 4; r++) { foldCompletion(state, [titles(r, id, 4000)]); id += 4000; }
  expect(Object.keys(state.catalog.a).length).toBe(16_000);
  let t = performance.now();
  foldCompletion(state, [titles(100, id, 4000)]); id += 4000;
  const one = performance.now() - t;
  t = performance.now();
  for (let u = 0; u < 18; u++) { foldCompletion(state, [titles(200 + u, id, 4000)]); id += 4000; }
  const eighteen = performance.now() - t;
  // Before the per-fold index these took 1.7 s and 62 s on the machine that wrote this test (37 ms and 0.8 s after).
  expect(one).toBeLessThan(1500);
  expect(eighteen).toBeLessThan(10_000);
  expect(Object.keys(state.catalog.a).length).toBeLessThanOrEqual(COMPLETION_LIMITS.idsPerKind);
}, 120_000);

// --- confirmed junk, eviction and the trim order -------------------------------------------------------

/** Three addresses each create and back the same junk: confirmed with 3 supporters. */
function confirmedJunk(state: CompletionState, from: number, n: number, receivedAt = day(1)) {
  for (const r of [900, 901, 902]) foldCompletion(state, [titles(r, from, n, receivedAt, (i) => `Junk ${i}`)]);
}
/** A real entry backed by `k` addresses. */
function real(state: CompletionState, titleId: number, k: number, receivedAt = day(5)) {
  for (let r = 0; r < k; r++) foldCompletion(state, [{ grants: [], reporter: reporter(5000 + r), receivedAt, records: [title(`real-install-${r}`, titleId, "Real")] }]);
}

test("one voter cannot create more than its share, confirmed or not", () => {
  const state = emptyCompletion();
  for (let u = 0; u < 3; u++) foldCompletion(state, [titles(1, 1 + u * 4000, 4000)]);
  expect(Object.keys(state.catalog.a).length).toBe(COMPLETION_LIMITS.createdPerVoter);
});

test("three addresses filling the catalog with confirmed junk cannot keep a real entry out", () => {
  const state = emptyCompletion();
  // Each junk address creates up to its share; the others confirm it.
  for (let block = 0; block < 4; block++) confirmedJunk(state, 1 + block * 5000, 5000);
  for (let r = 910; r < 920; r++) foldCompletion(state, [titles(r, 100_000 + (r - 910) * 5000, 5000, day(2))]);
  expect(Object.keys(state.catalog.a).length).toBe(COMPLETION_LIMITS.idsPerKind);
  real(state, 999_999, 3);
  expect(agreedCatalog(state).achievements.get(999_999)?.name).toBe("Real");
});

test("the trim drops low-support entries, junk included, before any granted owner's progress or well-supported entries", () => {
  const state = emptyCompletion();
  confirmedJunk(state, 1, 3000);
  for (let i = 0; i < 50; i++) real(state, 50_000 + i, 8);
  const granted = { grants: ["a".repeat(64)], receivedAt: day(6), records: [{
    kind: "quest_owned", installId: "owner-install", eventId: "o:1", capturedAt: day(6), characterKey: "0a1b2c3d", class: "MAGE", level: 40, questIds: [1, 2, 3],
  }] };
  foldCompletion(state, [granted]);
  const size = JSON.stringify(state).length;
  const out = trimCompletion(state, Math.floor(size / 2), new Set(["owner-install"]));
  expect(out.characters).toBe(0);
  expect(Object.keys(state.owned["owner-install"].characters)).toEqual(["0a1b2c3d"]);
  for (let i = 0; i < 50; i++) expect(agreedCatalog(state).achievements.get(50_000 + i)?.name).toBe("Real");
  expect(Object.keys(state.catalog.a).filter((id) => Number(id) < 50_000).length).toBeLessThan(3000);
});

test("when the grant lookup failed, the trim leaves every character alone", () => {
  const state = emptyCompletion();
  foldCompletion(state, [{ grants: [], receivedAt: day(1), records: Array.from({ length: 8 }, (_, i) => ({
    kind: "quest_owned", installId: `install-${i}`, eventId: `q:${i}`, capturedAt: day(1), characterKey: "0a1b2c3d", class: "MAGE", level: 40,
    questIds: Array.from({ length: 200 }, (_, q) => q + 1),
  })) }]);
  const out = trimCompletion(state, Math.floor(JSON.stringify(state).length / 2), null);
  expect(out.characters).toBe(0);
  expect(Object.values(state.owned).every((i) => Object.keys(i.characters).length === 1)).toBe(true);
});

// --- supporters, ties and lost votes --------------------------------------------------------------------

test("16 spam addresses cannot replace an entry 20 addresses back, and a tie keeps the first confirmed", () => {
  const state = emptyCompletion();
  for (let r = 0; r < 20; r++) foldCompletion(state, [{ grants: [], reporter: reporter(r), receivedAt: day(1), records: [title(`voter-install-${r}`, 6, "Sergeant")] }]);
  for (let r = 100; r < 116; r++) foldCompletion(state, [{ grants: [], reporter: reporter(r), receivedAt: day(9), records: [title(`voter-install-${r}`, 6, "Spam")] }]);
  expect(agreedCatalog(state).achievements.get(6)?.name).toBe("Sergeant");
  for (let r = 116; r < 120; r++) foldCompletion(state, [{ grants: [], reporter: reporter(r), receivedAt: day(9), records: [title(`voter-install-${r}`, 6, "Spam")] }]);
  // 20 against 20: the content confirmed first stays.
  expect(state.catalog.a["6"].map((v) => v.v.length).sort()).toEqual([20, 20]);
  expect(agreedCatalog(state).achievements.get(6)?.name).toBe("Sergeant");
});

test("a vote is not lost when the voter may create nothing more, and contents nobody backs leave", () => {
  const state = emptyCompletion();
  // Voter 1 backs "Sergeant", then uses up its creations elsewhere.
  foldCompletion(state, [{ grants: [], reporter: reporter(1), receivedAt: day(1), records: [title("install-1", 6, "Sergeant")] }]);
  foldCompletion(state, [titles(1, 1000, 4000), titles(1, 5000, 4000)]);
  // A new content from voter 1 is refused, and its vote for "Sergeant" stays.
  foldCompletion(state, [{ grants: [], reporter: reporter(1), receivedAt: day(2), records: [title("install-1", 6, "Changed")] }]);
  expect(state.catalog.a["6"].map((v) => [JSON.parse(v.c).name, v.v.length])).toEqual([["Sergeant", 1]]);
  // Moving to an existing content takes the vote along, and the content left with nobody is removed.
  foldCompletion(state, [{ grants: [], reporter: reporter(2), receivedAt: day(2), records: [title("install-2", 6, "Other")] }]);
  foldCompletion(state, [{ grants: [], reporter: reporter(1), receivedAt: day(3), records: [title("install-1", 6, "Other")] }]);
  expect(state.catalog.a["6"].map((v) => [JSON.parse(v.c).name, v.v.length])).toEqual([["Other", 2]]);
});

// --- an install id is free text ---------------------------------------------------------------------------

test("an install called __proto__ is an ordinary install, folded, stored and read back", () => {
  const records = [{ kind: "title_owned", installId: "__proto__", eventId: "p:1", capturedAt: at, characterKey: "0a1b2c3d", class: "MAGE", level: 40, titleIds: [4] }];
  const state = foldCompletion(emptyCompletion(), [{ records, grants: [] }]);
  expect(completionFactsOf(state, "all", "__proto__").owned.map((c) => c.installId)).toEqual(["__proto__"]);
  expect(completionFactsOf(state, "all", "constructor").owned).toEqual([]);
  const stored = normalizeCompletion(JSON.parse(JSON.stringify(state)) as CompletionState);
  expect(Object.getPrototypeOf(stored.owned)).toBeNull();
  expect(completionFactsOf(stored, "all", "__proto__").owned).toHaveLength(1);
  foldCompletion(stored, [{ records: [{ ...records[0], eventId: "p:2", titleIds: [5] }], grants: [] }]);
  expect(completionFactsOf(stored, "all", "__proto__").owned[0].titles).toEqual(new Set([4, 5]));
});
