import { expect, test } from "vitest";
import {
  agreedCatalog, COMPLETION_LIMITS, COMPLETION_MAX_BYTES, completionFactsOf, emptyCompletion, foldCompletion, normalizeCompletion, trimCompletion,
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

/** Characters with a few hundred achievements and quests each, injected straight into the state. */
function character(n: number) {
  return {
    class: "MAGE", level: 60, at: day(1 + n), n: 1,
    a: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [String(1000 + i), { at: day(1), n: 1, c: i % 2 === 0, m: 1, t: 2 }])),
    f: {}, t: [1, 2, 3], q: Array.from({ length: 2000 }, (_, i) => i + 1),
  };
}
function addInstall(state: CompletionState, installId: string, grants: string[], characters: number) {
  state.owned[installId] = {
    grants, dropped: 0,
    characters: Object.assign(Object.create(null), Object.fromEntries(Array.from({ length: characters }, (_, i) => [`0000000${i}`, character(i)]))),
  };
}

/**
 * The rollup at its real 32 MB limit: 20 real entries with 20 supporters each (seen long ago), one live owner
 * with 8 characters, and junk backed by every one of `junk` colluding addresses (so each junk entry has more
 * supporters than the old "low support" bar), recently seen, up to 95% of the limit.
 */
function atTheLimit(junk: number) {
  const state = emptyCompletion();
  const realVoters = Array.from({ length: 20 }, (_, i) => `r:${reporter(8000 + i)}`);
  for (let i = 0; i < 20; i++) {
    state.catalog.a[String(900_000 + i)] = [{ c: JSON.stringify({ category: "General", criteriaCount: 1, name: `Real ${i}`, points: 10 }), v: realVoters, s: 1, f: 1, by: [realVoters[0], "real-install"] }];
  }
  addInstall(state, "owner-install", ["a".repeat(64)], 8);
  const junkVoters = Array.from({ length: junk }, (_, i) => `r:${reporter(7000 + i)}`);
  const variant = (k: number) => ({ c: JSON.stringify({ name: `Junk ${k} ${"x".repeat(200)}` }), v: junkVoters, s: 2_000_000_000, f: 2_000_000_000, by: [junkVoters[k % junk], `junk-install-${k % junk}`] as [string, string] });
  const base = JSON.stringify(state).length;
  const each = JSON.stringify({ "100000": [variant(100000)] }).length;
  const count = Math.ceil((COMPLETION_MAX_BYTES * 0.95 - base) / each);
  const kinds = ["a", "f", "t", "q"] as const;
  for (let k = 0; k < count; k++) state.catalog[kinds[k % 4]][String(100_000 + k)] = [variant(k)];
  return { state, count };
}

for (const junk of [7, 10]) {
  test(`at the real limit with ${junk} colluding junk addresses, the live owner keeps every character and 20-supporter entries survive`, () => {
    const { state, count } = atTheLimit(junk);
    expect(JSON.stringify(state).length).toBeGreaterThan(COMPLETION_MAX_BYTES * 0.9);
    const out = trimCompletion(state, COMPLETION_MAX_BYTES, new Set(["owner-install"]));
    expect(out.size).toBeLessThanOrEqual(COMPLETION_MAX_BYTES * 0.8);
    expect(out.characters).toBe(0);
    expect(Object.keys(state.owned["owner-install"].characters)).toHaveLength(8);
    for (let i = 0; i < 20; i++) expect(agreedCatalog(state).achievements.get(900_000 + i)?.name).toBe(`Real ${i}`);
    expect(out.variants).toBeGreaterThan(count / 10);
  }, 120_000);
}

test("live progress is trimmed only when owned progress alone is over the target, and the catalog goes first", () => {
  const state = emptyCompletion();
  // 3000 confirmed entries with 4 supporters each, and 6 live owners with 8 characters each.
  const voters = Array.from({ length: 4 }, (_, i) => `r:${reporter(6000 + i)}`);
  for (let i = 0; i < 3000; i++) state.catalog.a[String(50_000 + i)] = [{ c: JSON.stringify({ name: `Entry ${i} ${"n".repeat(80)}` }), v: voters, s: i, f: i, by: [voters[0], "x-install"] }];
  for (let i = 0; i < 6; i++) addInstall(state, `owner-${i}-install`, ["a".repeat(64)], 8);
  const size = JSON.stringify(state).length;
  const live = new Set(Object.keys(state.owned));
  const owned = JSON.stringify(state.owned).length;
  const catalog = size - owned;
  // Owned alone fits the target: only catalog content goes.
  const fits = normalizeCompletion(JSON.parse(JSON.stringify(state)) as CompletionState);
  const a = trimCompletion(fits, Math.ceil((owned + catalog * 0.3) / 0.8), live);
  expect(a.characters).toBe(0);
  expect(a.variants).toBeGreaterThan(0);
  // Owned alone is over the target: the whole catalog went first, then the oldest characters.
  const b = trimCompletion(state, Math.floor(size / 2), live);
  expect(Object.keys(state.catalog.a)).toEqual([]);
  expect(b.characters).toBeGreaterThan(0);
});

test("when the grant lookup failed, only installs holding no grant lose progress, and the catalog is not wiped for nothing", () => {
  const withGrants = () => {
    const state = emptyCompletion();
    for (let i = 0; i < 20; i++) real(state, 50_000 + i, 4);
    for (let i = 0; i < 4; i++) addInstall(state, `granted-${i}-install`, ["a".repeat(64)], 1);
    for (let i = 0; i < 4; i++) addInstall(state, `ungranted-${i}-install`, [], 1);
    return state;
  };
  // The installs without a grant are enough: they go, and the granted ones and the catalog stay.
  const one = withGrants();
  const ungranted = JSON.stringify(Object.fromEntries(Object.entries(one.owned).filter(([id]) => id.startsWith("ungranted")))).length;
  const out = trimCompletion(one, Math.floor((JSON.stringify(one).length - ungranted / 2) / 0.86), null);
  expect(out.characters).toBeGreaterThan(0);
  expect(Object.entries(one.owned).filter(([id]) => id.startsWith("ungranted")).some(([, i]) => i.dropped > 0)).toBe(true);
  expect(Object.entries(one.owned).filter(([id]) => id.startsWith("granted")).every(([, i]) => Object.keys(i.characters).length === 1)).toBe(true);
  expect(agreedCatalog(one).achievements.size).toBe(20);
  // Progress kept is over what a write allows: trimming could not help, so the catalog is left whole.
  const two = withGrants();
  const out2 = trimCompletion(two, 20_000, null);
  expect(out2.variants).toBe(0);
  expect(agreedCatalog(two).achievements.size).toBe(20);
  expect(Object.entries(two.owned).filter(([id]) => id.startsWith("granted")).every(([, i]) => Object.keys(i.characters).length === 1)).toBe(true);
});

test("one address can create only so many bytes of entries, so bloating the rollup takes many addresses", () => {
  const state = emptyCompletion();
  const long = (i: number) => `Long name ${i} ${"y".repeat(100)}`;
  // Two uploads, so the per-upload limit of 4000 new entries is not what stops it.
  for (const half of [0, 2500]) {
    foldCompletion(state, [{ grants: [], reporter: reporter(1), receivedAt: day(1), records: Array.from({ length: 2500 }, (_, i) => ({
      ...title("install-bytes", 10_000 + half + i, long(half + i)), category: "z".repeat(80),
    })) }]);
  }
  const created = Object.values(state.catalog.a).flat().filter((v) => v.by[0] === `r:${reporter(1)}`);
  const bytes = created.reduce((n, v) => n + v.c.length, 0);
  expect(bytes).toBeLessThanOrEqual(COMPLETION_LIMITS.createdBytesPerVoter);
  expect(bytes).toBeGreaterThan(COMPLETION_LIMITS.createdBytesPerVoter - 300);
  expect(created.length).toBeLessThan(5000);
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
