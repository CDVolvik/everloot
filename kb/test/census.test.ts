import { expect, test } from "vitest";
import {
  CENSUS_LAUNCH, CENSUS_MIN_CHARACTERS, CENSUS_MIN_INSTALLS, CENSUS_ROUND_TO, LEVEL_BANDS,
  censusFromRecords, censusRowsFromRecords, roundCount, rollupCensus, type CensusRow, type CensusWindow,
} from "../src/census.js";

/** When the corpus was current: a Monday, twelve days after launch. */
const AS_OF = "2026-11-16T12:00:00Z";
const LAUNCH = CENSUS_LAUNCH;

let seq = 0;
const row = (over: Partial<CensusRow> & Pick<CensusRow, "installId" | "characterKey">): CensusRow => ({
  kind: "census_seen", eventId: `${over.installId}:census:${++seq}`, capturedAt: "2026-11-15T10:00:00.000Z",
  serverId: 4, race: "Gnome", class: "PRIEST", level: 20, faction: "Alliance", via: "target", ...over,
});

/** `n` different characters, each reported once, spread over `installs` in turn. */
const crowd = (n: number, prefix: string, over: Partial<CensusRow> = {}, installs = ["install-a", "install-b", "install-c"]) =>
  Array.from({ length: n }, (_, i) => row({ installId: installs[i % installs.length], characterKey: `${prefix}${i.toString(16).padStart(4, "0")}`, ...over }));

const census = (rows: CensusRow[], asOf = AS_OF) => rollupCensus(rows, { asOf, launch: LAUNCH });
const week = (rows: CensusRow[], asOf = AS_OF) => census(rows, asOf).windows.week;
const cell = (w: CensusWindow, race: string, cls: string, faction = "Alliance") =>
  w.raceClass.find((c) => c.race === race && c.class === cls && c.faction === faction)!.count;
const band = (w: CensusWindow, id: string) => w.levels.find((l) => l.band === id)!.count;

test("one character counts once, however many installs see it and whether it uploads its own rows", () => {
  const rows = crowd(10, "aa");
  // A popular character: seen by twenty installs and uploading its own data too.
  for (let i = 0; i < 20; i++) rows.push(row({ installId: `install-${i}`, characterKey: "aa0000", via: i % 2 ? "mouseover" : "group" }));
  rows.push(row({ installId: "install-own", characterKey: "aa0000", kind: "census_self", realm: "Forever", via: undefined }));
  const w = week(rows);
  expect(w.characters).toBe(10);
  expect(cell(w, "Gnome", "PRIEST")).toBe(10);
});

test("the latest row wins: a character's level is the newest one reported, from any install or kind", () => {
  const rows = [...crowd(10, "bb", { level: 12 }), ...crowd(10, "bc", { level: 25 })];
  rows.push(row({ installId: "install-z", characterKey: "bb0000", level: 19, capturedAt: "2026-11-15T20:00:00.000Z" }));
  rows.push(row({ installId: "install-own", characterKey: "bb0000", kind: "census_self", realm: "Forever", via: undefined, level: 23, capturedAt: "2026-11-16T08:00:00.000Z" }));
  // An older report of the same character does not pull it back down.
  rows.push(row({ installId: "install-y", characterKey: "bb0000", level: 5, capturedAt: "2026-11-10T08:00:00.000Z" }));
  const w = week(rows);
  expect(w.characters).toBe(20);
  // Nine left at level 12, eleven in their twenties.
  expect(band(w, "10-19")).toBeNull();
  expect(band(w, "20-29")).toBe(10);
  expect(band(w, "1-9")).toBeNull();
});

test("the 7-day window is the last seven UTC days, today included; since launch is everything from launch on", () => {
  const recent = crowd(10, "cc", { capturedAt: "2026-11-10T00:00:00.000Z" }); // first instant of the window
  const older = crowd(10, "dd", { capturedAt: "2026-11-09T23:59:59.999Z" }); // one millisecond before it
  const view = census([...recent, ...older]);
  expect(view.windows.week).toMatchObject({ from: "2026-11-10T00:00:00.000Z", to: "2026-11-16T12:00:00.000Z", characters: 10 });
  expect(view.windows.launch).toMatchObject({ from: LAUNCH, to: "2026-11-16T12:00:00.000Z", characters: 20 });
});

test("rows from before launch (the beta) and rows dated after the corpus was current are not counted", () => {
  const beta = crowd(10, "ee", { capturedAt: "2026-10-20T12:00:00.000Z" });
  const future = crowd(10, "ff", { capturedAt: "2026-11-16T12:00:01.000Z" });
  const view = census([...beta, ...future, ...crowd(10, "f0")]);
  expect(view.windows.launch.characters).toBe(10);
  expect(view.windows.week.characters).toBe(10);
});

test("the week never reaches back before launch", () => {
  const view = census(crowd(10, "g0", { capturedAt: "2026-11-05T10:00:00.000Z" }), "2026-11-06T12:00:00Z");
  expect(view.windows.week.from).toBe(LAUNCH);
  expect(view.windows.week.characters).toBe(10);
});

test("before launch, every window is collecting", () => {
  const view = census(crowd(30, "g1", { capturedAt: "2026-10-18T10:00:00.000Z" }), "2026-10-18T12:00:00Z");
  expect(view.windows.week.collecting).toBe(true);
  expect(view.windows.launch.collecting).toBe(true);
  expect(view.windows.week.characters).toBeNull();
});

test("level bands are 1-9, 10-19 ... 50-59, and at 60", () => {
  expect(LEVEL_BANDS.map((b) => b.id)).toEqual(["1-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60"]);
  const rows = [
    ...crowd(10, "h1", { level: 9 }), ...crowd(10, "h2", { level: 10 }), ...crowd(10, "h3", { level: 59 }),
    ...crowd(10, "h4", { level: 60 }), ...crowd(10, "h5", { level: 1 }),
  ];
  const w = week(rows);
  expect(band(w, "1-9")).toBe(20);
  expect(band(w, "10-19")).toBe(10);
  expect(band(w, "50-59")).toBe(10);
  expect(band(w, "60")).toBe(10);
  expect(band(w, "30-39")).toBeNull();
});

test("a cell shows at 10 characters, not at 9", () => {
  const nine = week([...crowd(9, "i1"), ...crowd(20, "i2", { race: "Human", class: "WARRIOR" })]);
  expect(cell(nine, "Gnome", "PRIEST")).toBeNull();
  const ten = week([...crowd(10, "i1"), ...crowd(20, "i2", { race: "Human", class: "WARRIOR" })]);
  expect(cell(ten, "Gnome", "PRIEST")).toBe(10);
});

test("a cell shows at 3 installs, not at 2, however many characters they report", () => {
  const two = week([...crowd(40, "j1", {}, ["install-a", "install-b"]), ...crowd(20, "j2", { race: "Human", class: "WARRIOR" })]);
  expect(cell(two, "Gnome", "PRIEST")).toBeNull();
  const three = week([...crowd(40, "j1", {}, ["install-a", "install-b", "install-c"]), ...crowd(20, "j2", { race: "Human", class: "WARRIOR" })]);
  expect(cell(three, "Gnome", "PRIEST")).toBe(40);
});

test("the installs behind a cell are every install that reported one of its characters in the window", () => {
  // Ten characters from one install, and one of them also seen by two more installs: three installs in all.
  const rows = crowd(10, "k1", {}, ["install-a"]);
  rows.push(row({ installId: "install-b", characterKey: "k10003" }), row({ installId: "install-c", characterKey: "k10007" }));
  expect(week(rows).characters).toBe(10);
});

test("below the thresholds the whole window is collecting: no number at all, only how many installs have reported", () => {
  const w = week(crowd(9, "l1"));
  expect(w.collecting).toBe(true);
  expect(w.characters).toBeNull();
  expect(w.installs).toBe(3);
  const counts = [...w.factions, ...w.races, ...w.classes, ...w.raceClass, ...w.levels].map((c) => c.count);
  expect(counts.every((c) => c === null)).toBe(true);
  expect(w.bias).toEqual({ own: null, seen: null });
  expect(census(crowd(9, "l1")).trend.every((d) => d.count === null)).toBe(true);
  expect(week(crowd(30, "l2", {}, ["install-a", "install-b"])).collecting).toBe(true);
});

test("every playable cell is listed whether or not anyone plays it, so a listed cell says nothing on its own", () => {
  const empty = week([]);
  const busy = week(crowd(50, "m1"));
  const keys = (w: CensusWindow) => w.raceClass.map((c) => `${c.faction}/${c.race}/${c.class}`);
  expect(keys(empty)).toEqual(keys(busy));
  expect(keys(busy)).toContain("Alliance/Gnome/PRIEST");
  expect(keys(busy)).toContain("Horde/Skyborne/SHAMAN");
  expect(keys(busy)).toContain("Alliance/Skyborne/MAGE");
  expect(keys(busy)).not.toContain("Horde/Orc/PALADIN");
  expect(busy.races.map((r) => `${r.faction}/${r.race}`)).toHaveLength(10);
  expect(busy.classes).toHaveLength(9);
});

test("a row that is not a playable combination, or has an impossible level, is left out", () => {
  const w = week([
    ...crowd(10, "n1"),
    ...crowd(10, "n2", { race: "Orc", class: "PALADIN", faction: "Horde" }),
    ...crowd(10, "n3", { race: "Gnome", faction: "Horde" }),
    ...crowd(10, "n4", { level: 61 }),
    ...crowd(10, "n5", { race: "Dracthyr" }),
  ]);
  expect(w.characters).toBe(10);
});

test("counts are rounded to the nearest 5, each from its own true number", () => {
  expect(CENSUS_ROUND_TO).toBe(5);
  expect([10, 12, 13, 17, 18, 102].map(roundCount)).toEqual([10, 10, 15, 15, 20, 100]);
  // 12 Hunters and 12 Warriors: each shows 10, the total of 24 shows 25, not 20.
  const w = week([...crowd(12, "o1", { race: "Human", class: "HUNTER" }), ...crowd(12, "o2", { race: "Human", class: "WARRIOR" })]);
  expect(w.classes.find((c) => c.class === "HUNTER")!.count).toBe(10);
  expect(w.classes.find((c) => c.class === "WARRIOR")!.count).toBe(10);
  expect(w.characters).toBe(25);
  const shown = [w.characters, ...w.factions, ...w.races, ...w.classes, ...w.raceClass, ...w.levels]
    .map((c) => (typeof c === "number" ? c : c?.count)).filter((c): c is number => typeof c === "number");
  expect(shown.every((c) => c % 5 === 0)).toBe(true);
});

/**
 * Every hidden count the published numbers allow: h in 0..9 such that some true values of the shown
 * parts round to what was published and the total rounds to what was published.
 */
function candidates(total: number, shown: number[]): number[] {
  const half = Math.floor(CENSUS_ROUND_TO / 2);
  // A shown count is at least the threshold, whatever it rounds to.
  const lo = shown.reduce((s, p) => s + Math.max(p - half, CENSUS_MIN_CHARACTERS), 0);
  const hi = shown.reduce((s, p) => s + p + half, 0);
  const out: number[] = [];
  for (let h = 0; h < CENSUS_MIN_CHARACTERS; h++) {
    // Some parts sum s in [lo, hi] with s + h rounding to the published total.
    if (lo + h <= total + half && hi + h >= total - half) out.push(h);
  }
  return out;
}

test("a hidden faction can't be worked out by subtracting the shown one from the total", () => {
  for (let alliance = 10; alliance <= 60; alliance++) {
    for (let horde = 1; horde < CENSUS_MIN_CHARACTERS; horde++) {
      const w = week([...crowd(alliance, "p1"), ...crowd(horde, "p2", { race: "Orc", class: "WARRIOR", faction: "Horde" })]);
      const shownAlliance = w.factions.find((f) => f.faction === "Alliance")!.count!;
      expect(w.factions.find((f) => f.faction === "Horde")!.count).toBeNull();
      const left = candidates(w.characters!, [shownAlliance]);
      expect(left).toContain(horde);
      expect(left.length, `alliance ${alliance}, horde ${horde}`).toBeGreaterThanOrEqual(2);
    }
  }
});

test("a hidden level band can't be worked out from the total and the other bands", () => {
  // 13 + 13 + 13 + 13 shown, 4 hidden: the shown bands add up to 60, the total of 56 shows 55.
  const rows = [
    ...crowd(13, "q1", { level: 15 }), ...crowd(13, "q2", { level: 25 }), ...crowd(13, "q3", { level: 35 }),
    ...crowd(13, "q4", { level: 45 }), ...crowd(4, "q5", { level: 60 }),
  ];
  const w = week(rows);
  expect(band(w, "60")).toBeNull();
  const shown = w.levels.map((l) => l.count).filter((c): c is number => c !== null);
  expect(w.characters! - shown.reduce((s, c) => s + c, 0)).not.toBe(4);
  expect(candidates(w.characters!, shown).length).toBeGreaterThanOrEqual(2);
});

test("the daily trend counts each character once a day and follows the same thresholds", () => {
  const rows = [
    ...crowd(12, "r1", { capturedAt: "2026-11-14T09:00:00.000Z" }),
    ...crowd(12, "r1", { capturedAt: "2026-11-14T21:00:00.000Z" }),
    ...crowd(4, "r2", { capturedAt: "2026-11-15T09:00:00.000Z" }),
  ];
  const { trend } = census(rows);
  expect(trend.map((d) => d.day)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"]);
  expect(trend.find((d) => d.day === "2026-11-14")!.count).toBe(10);
  expect(trend.find((d) => d.day === "2026-11-15")!.count).toBeNull();
});

test("bias: the share of characters known only from players seen, and from players' own uploads", () => {
  const rows = [
    ...crowd(30, "s1"),
    ...crowd(12, "s2", { kind: "census_self", realm: "Forever", via: undefined }),
  ];
  // Seen by someone else too: still an own character, since its own upload reported it.
  rows.push(row({ installId: "install-d", characterKey: "s20000" }));
  expect(week(rows).bias).toEqual({ seen: 30, own: 10 });
  expect(week([...crowd(30, "s3"), ...crowd(3, "s4", { kind: "census_self", realm: "Forever", via: undefined })]).bias).toEqual({ seen: 30, own: null });
});

test("no character key, install id or event id reaches the output", () => {
  const rows = [...crowd(25, "deadbeef"), row({ installId: "install-secret", characterKey: "cafef00d", kind: "census_self", realm: "Forever", via: undefined })];
  const json = JSON.stringify(census(rows));
  for (const r of rows) {
    expect(json).not.toContain(r.characterKey);
    expect(json).not.toContain(r.installId);
    expect(json).not.toContain(r.eventId!);
  }
  expect(json).not.toMatch(/"(characterKey|installId|eventId|serverId|realm|via|kind)"/);
});

test("one global view for now, labelled so a ruleset or region view can sit beside it", () => {
  const view = census(crowd(10, "t1"));
  expect(view.scope).toEqual({ id: "all", label: "All of WoW: Forever" });
  expect(view.rule).toEqual({ minCharacters: CENSUS_MIN_CHARACTERS, minInstalls: CENSUS_MIN_INSTALLS, roundTo: CENSUS_ROUND_TO });
  expect(rollupCensus(crowd(10, "t1"), { asOf: AS_OF, launch: LAUNCH, scope: { id: "pvp-us", label: "PvP, Americas" } }).scope.id).toBe("pvp-us");
});

test("records from the store: census kinds are read, everything else and malformed rows are skipped", () => {
  const good = crowd(10, "u1").map((r) => ({ ...r }));
  const records: unknown[] = [
    ...good,
    { kind: "addon_seen", installId: "install-a", capturedAt: AS_OF, name: "Questie", title: "Questie", loaded: true },
    { ...good[0], characterKey: 42 },
    { ...good[0], level: "60" },
    { ...good[0], faction: "Neutral" },
    { ...good[0], capturedAt: "yesterday" },
    null, "census_seen",
  ];
  expect(censusRowsFromRecords(records)).toHaveLength(10);
  expect(censusFromRecords(records, AS_OF).windows.week.characters).toBe(10);
});
