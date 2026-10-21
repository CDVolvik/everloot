import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { compareBaseline, formatBaselineReport, readBaseline, writeBaselineReport, type Baseline, type Observed } from "../src/baseline-report.js";
import { openDb } from "../src/db.js";
import { lootWindowsFromRecords, rollupDrops } from "../src/drop-rollup.js";
import { importPfquest } from "../src/importers/pfquest.js";
import { objectSpawnRowsFromRecords } from "../src/object-spawns.js";
import { worldFactsFromRecords } from "../src/world-pages.js";
import { mapSnapshot, pfquestCheckout } from "./pfquest-fixture.js";

const ZONES = new Map([[1429, "Elwynn Forest"], [1411, "Durotar"]]);
const INSTALLS = ["install-a", "install-b", "install-c"];

async function fixtureBaseline(): Promise<Baseline> {
  const db = openDb(":memory:");
  await importPfquest(db, pfquestCheckout(), { snapshotPath: mapSnapshot(), now: new Date("2026-10-21T00:00:00Z") });
  return readBaseline(db);
}

/** The same record from each of `installs`. */
const fromEach = (record: Record<string, unknown>, installs = INSTALLS) => installs.map((installId) => ({ ...record, installId }));

function observed(records: Record<string, unknown>[]): Observed {
  return {
    world: worldFactsFromRecords(records), drops: rollupDrops(lootWindowsFromRecords(records)).rates,
    objects: objectSpawnRowsFromRecords(records), dataAsOf: "2026-10-21T00:00:00Z", connected: true,
  };
}

const sighting = (npcId: number, name: string, mapId: number, extra: Record<string, unknown> = {}) =>
  ({ kind: "npc_sighting", npcId, name, mapId, x: 40, y: 60, positionKind: "player", ...extra });
const quest = (questId: number, title: string, level: number, extra: Record<string, unknown> = {}) =>
  ({ kind: "quest", questId, title, level, rewardItemIds: [], ...extra });
const loot = (source: Record<string, unknown>, itemIds: number[]) =>
  ({ kind: "loot", sourceEvidence: "loot-api", ...source, items: itemIds.map((itemId) => ({ itemId, count: 1 })) });

test("baseline rows are confirmed, changed, new or not seen against what 3 installs agree on", async () => {
  const report = compareBaseline(await fixtureBaseline(), observed([
    ...fromEach(sighting(10, "Field Rat", 1429, { level: 5 })),
    // Agreed pins near a Classic spawn still match.
    ...fromEach(sighting(10, "Field Rat", 1429, { positionKind: "npc", x: 41, y: 61 })),
    ...fromEach(sighting(11, "Ridge Watcher", 1429, { level: 12 })),
    ...fromEach(sighting(999, "Forever Newcomer", 1429)),
    // Two installs are not corroboration.
    ...fromEach(sighting(12, "Cellar Lurker", 1429), INSTALLS.slice(0, 2)),
    ...fromEach(quest(300, "Rat Problem", 5, { giverNpcId: 10, turnInNpcId: 11 })),
    ...fromEach(quest(302, "The \"Seam\" Report", 13, { giverNpcId: 50 })),
    ...fromEach(quest(777, "Forever Errand", 20)),
    ...fromEach(loot({ sourceNpcId: 10 }, [200, 555])),
    ...fromEach(loot({ sourceNpcId: 11 }, [200])),
    ...fromEach(loot({ sourceObjectId: 100, sourceObjectName: "Copper Seam", mapId: 1429, x: 30, y: 40 }, [201])),
    ...fromEach({ kind: "vendor", vendorNpcId: 11, items: [{ itemId: 202, priceCopper: 25 }] }),
  ]), ZONES);

  expect(report.counts).toEqual({
    npc: { confirmed: 1, changed: 1, new: 1, not_seen: 1 },
    object: { confirmed: 1, changed: 0, new: 0, not_seen: 1 },
    quest: { confirmed: 1, changed: 1, new: 1, not_seen: 0 },
    drop: { confirmed: 3, changed: 0, new: 1, not_seen: 0 },
    vendor: { confirmed: 1, changed: 0, new: 0, not_seen: 0 },
  });
  const notes = (id: string, subject: string) => report.rows.changed.find((r) => r.id === id && r.subject === subject)!.notes;
  expect(notes("11", "npc")).toEqual(["zone: seen in Elwynn Forest; Classic Durotar", "level: 12; Classic 10"]);
  expect(notes("302", "quest")).toEqual(["level: 13; Classic 12", "giver: NPC 50; Classic not an NPC"]);
  expect(report.rows.confirmed.filter((r) => r.subject === "drop").map((r) => [r.id, r.notes[0]])).toEqual([
    ["npc:11>item:200", "observed 100% over 3 windows; Classic through loot table 900 (3% within it)"],
    ["npc:10>item:200", "observed 100% over 3 windows; Classic 25.5%"],
    ["object:100>item:201", "observed 100% over 3 windows; Classic 80%"],
  ]);
  expect(report.rows.new.map((r) => `${r.subject} ${r.id} ${r.name}`)).toEqual([
    "drop npc:10>item:555 Item 555 from Field Rat", "npc 999 Forever Newcomer", "quest 777 Forever Errand",
  ]);
  expect(report.rows.not_seen.map((r) => `${r.zone}: ${r.subject} ${r.id}`)).toEqual(["Area 1581: npc 12", "No spawn recorded: object 101"]);
});

test("an agreed NPC pin far from every Classic spawn on its map is a change", async () => {
  const report = compareBaseline(await fixtureBaseline(), observed(fromEach(sighting(10, "Field Rat", 1429, { positionKind: "npc", x: 90, y: 10 }))), ZONES);
  expect(report.rows.changed.map((r) => r.notes)).toEqual([["position: 90, 10 in Elwynn Forest; nearest Classic spawn 70.5 away"]]);
});

test("with no uploads everything is not seen yet, by zone and then level", async () => {
  const report = compareBaseline(await fixtureBaseline(), { ...observed([]), connected: false, dataAsOf: null }, ZONES);
  expect(report.rows.not_seen.map((r) => `${r.zone} ${r.level ?? "-"} ${r.subject} ${r.id}`)).toEqual([
    "Durotar 10 npc 11",
    "Durotar 10 vendor npc:11",
    "Elwynn Forest 5 npc 10",
    "Elwynn Forest 5 quest 300",
    "Elwynn Forest 5 drop npc:10",
    "Elwynn Forest 12 quest 302",
    "Elwynn Forest - object 100",
    "Elwynn Forest - drop object:100",
    "Area 1581 20 npc 12",
    "No spawn recorded - object 101",
  ]);
  const md = formatBaselineReport(report);
  expect(md).toContain("Uploads: not connected or unreadable");
  expect(md).toContain("| NPCs | 0 | 0 | 0 | 3 |");
  expect(md).toContain("### Elwynn Forest");
  expect(md).toContain("| 5 | drop | npc:10 | Field Rat | 1 Classic drop without a public rate |");
});

test("the report is written outside the repository only", async () => {
  const report = compareBaseline(await fixtureBaseline(), observed([]), ZONES);
  const repo = fileURLToPath(new URL("../../", import.meta.url));
  expect(() => writeBaselineReport(report, join(repo, "kb", "data", "report"))).toThrow(/inside the repository/);
  expect(() => writeBaselineReport(report, repo)).toThrow(/inside the repository/);
  const out = join(mkdtempSync(join(tmpdir(), "kb-baseline-")), "report");
  const paths = writeBaselineReport(report, out);
  expect(existsSync(paths.markdown)).toBe(true);
  expect(JSON.parse(readFileSync(paths.json, "utf8")).counts.npc.not_seen).toBe(3);
});
