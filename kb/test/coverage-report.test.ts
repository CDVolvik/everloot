import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { buildCoverageReport, formatCoverageReport, writeCoverageReport } from "../src/coverage-report.js";
import { CoverageExpected as CoverageExpectedFile } from "../src/coverage.js";
import type { Baseline } from "../src/baseline-report.js";
import { WORLD_MAP_DATA } from "../src/world-map-file.js";
import { zoneTable, zoneToWorld } from "../src/world-coords.js";
import { openDb } from "../src/db.js";
import { importPfquest } from "../src/importers/pfquest.js";
import { mapSnapshot, pfquestCheckout } from "./pfquest-fixture.js";

const baseline = (): Baseline => ({ commit: "a".repeat(40),
  units: new Map([[10, { id: 10, name: "Local rat", minLevel: 5, spawns: [{ areaId: 12, uiMapId: 1429, x: 40, y: 60, respawnSecs: 30 }], refs: [] }]]),
  quests: new Map([[20, { id: 20, title: "Local errand", lvl: 5, start: { U: [10] }, end: { U: [10] } }]]),
  objects: new Map(), items: new Map([[30, { id: 30, name: "Local cheese", drops: [{ npc: 10, chance: 20 }], refs: [{ ref: 1, chance: 50 }], vendors: [{ npc: 10, count: 1 }] }]]),
});
const npc = (i: number, extra = {}) => ({ kind: "npc_sighting", eventId: `event-${i}`, installId: `install-${i}`, capturedAt: "2026-10-01T00:00:00Z", npcId: 10, name: "Rat", mapId: 1429, x: 40, y: 60, positionKind: "npc", level: 5, ...extra });
const run = (records: unknown[] = [], extra = {}) => buildCoverageReport({ baseline: baseline(), records, dataAsOf: "2026-10-22T00:00:00Z", connected: true, questIds: [20, 999], ...extra });

test("expected universe includes missing per-field baseline facts, direct pairs and unplaced client quests", () => {
  const report = run();
  expect(report.rows.find(r => r.type === "quest" && r.id === "20" && r.field === "giver")).toMatchObject({ state: "missing", name: "Local errand", zone: "1429", level: 5 });
  expect(report.rows.find(r => r.type === "quest" && r.id === "999")).toMatchObject({ state: "missing", zone: "unplaced", name: "[?]" });
  expect(report.rows.filter(r => r.type === "drop")).toHaveLength(1); // shared loot stays a join
  expect(report.rows.filter(r => r.type === "vendor")).toHaveLength(2); // price and stock
});

test("one reporter, contested scalars, settled scalars and spread pins retain their detail", () => {
  const one = run([npc(1)]);
  expect(one.rows.find(r => r.type === "npc" && r.field === "name")?.state).toBe("reported");
  const report = run(Array.from({ length: 6 }, (_, i) => npc(i, { name: i < 3 ? "Rat" : "Mouse", x: i === 5 ? 70 : 40 })));
  expect(report.rows.find(r => r.type === "npc" && r.field === "name")).toMatchObject({ state: "reported", contested: true });
  expect(report.rows.find(r => r.type === "npc" && r.field === "level")?.state).toBe("settled");
  expect(report.rows.find(r => r.type === "npc_pin")).toMatchObject({ state: "confirmed", spread: true });
});

test("agreed pin placement wins over the baseline and player positions never make a pin", () => {
  const report = run([npc(1, { mapId: 1411 }), npc(2, { mapId: 1411 }), npc(3, { mapId: 1411 })]);
  expect(report.rows.find(r => r.type === "npc" && r.field === "name")?.zone).toBe("1411");
  const player = run([npc(1, { positionKind: "player" })]);
  expect(player.rows.find(r => r.type === "npc_pin")?.state).toBe("missing");
});

test("recheck is explicit and linked Recorder installs do not confirm each other", () => {
  const report = run([npc(1), npc(2), npc(3)], { recheckSince: "2026-10-20T00:00:00Z" });
  expect(report.rows.find(r => r.type === "npc" && r.field === "name")?.state).toBe("recheck");
  const linked = run([1, 2, 3].map(i => npc(i, { installId: `ps-${String(i).padStart(16, "0")}-${"a".repeat(16)}` })));
  expect(linked.rows.find(r => r.type === "npc" && r.field === "name")?.state).toBe("reported");
});

test("a recheck scope puts only the facts it names to recheck: neither confirmed nor settled, here or in the plateau, and the notes say so", () => {
  const records = Array.from({ length: 5 }, (_, i) => npc(i, { capturedAt: "2026-09-01T00:00:00Z" }));
  const scope = { since: "2026-10-20T00:00:00Z", source: "https://example.test/hotfix", type: "npcs" as const, ids: [10] };
  const report = run(records, { recheck: [scope] });
  for (const field of ["name", "level"]) expect(report.rows.find(r => r.type === "npc" && r.field === field)?.state).toBe("recheck");
  // The scope names NPCs, so the pin keeps its own state.
  expect(report.rows.find(r => r.type === "npc_pin")?.state).toBe("settled");
  expect(report.notes.join("\n")).toMatch(/1 scopes from kb\/curated\/recheck\.json.*neither confirmed nor settled.*fact fields are in recheck/);
  const pins = report.plateau!.types.find(t => t.type === "pins")!;
  expect(pins).toMatchObject({ confirmed: 1, settled: 1 });
  const npcs = report.plateau!.types.find(t => t.type === "npcs")!;
  expect(npcs.recheck).toBeGreaterThanOrEqual(2);
  expect(npcs.settled).toBe(0);
  // Another zone's or another NPC's scope leaves it alone; a scope from before the reports changes nothing.
  for (const other of [{ ...scope, ids: [11] }, { ...scope, type: "npcs" as const, ids: undefined, zones: [1411] }, { ...scope, since: "2026-08-01T00:00:00Z" }]) {
    expect(run(records, { recheck: [other] }).rows.find(r => r.type === "npc" && r.field === "name")?.state).toBe("settled");
  }
  const md = formatCoverageReport(report);
  expect(md).toContain("## Plateau");
  expect(md).toMatch(/\| pins \| (yes|no|\[\?\]) \|/);
});

test("expected file contains only zone/type/field counts, no entity ids or baseline names", () => {
  const report = run();
  const text = JSON.stringify(report.expected);
  for (const name of ["Local rat", "Local cheese", "Local errand", '"id"', '"ids"']) expect(text).not.toContain(name);
  expect(report.expected.zones.find(z => z.zone === "1429")?.types.drop).toBe(1);
  expect(formatCoverageReport(report)).toContain("[?]");
});

test("writer refuses the repository before making files and writes all three local artifacts outside", () => {
  const root = mkdtempSync(join(tmpdir(), "coverage-root-"));
  expect(() => writeCoverageReport(run(), join(root, "nested"), root)).toThrow(/inside the repository/);
  expect(() => writeCoverageReport(run(), join(root, "..hidden"), root)).toThrow(/inside the repository/);
  expect(existsSync(join(root, "nested"))).toBe(false);
  const outside = mkdtempSync(join(tmpdir(), "coverage-out-"));
  const paths = writeCoverageReport(run(), outside, root);
  expect(JSON.parse(readFileSync(paths.expected, "utf8"))).toEqual(run().expected);
  expect(readFileSync(paths.markdown, "utf8")).toContain("Local only");
  expect(JSON.parse(readFileSync(paths.json, "utf8")).rows.length).toBeGreaterThan(0);
});

test("the expected counts carry the date they were made, so a count is never dateless", () => {
  const root = mkdtempSync(join(tmpdir(), "coverage-date-root-"));
  const outside = mkdtempSync(join(tmpdir(), "coverage-date-out-"));
  const paths = writeCoverageReport(run(), outside, root);
  const expected = JSON.parse(readFileSync(paths.expected, "utf8"));
  expect(expected.dataAsOf).toBe("2026-10-22T00:00:00Z");
  // The page's strict parser reads the same file, so the date survives the round trip.
  expect(CoverageExpectedFile.parse(expected).dataAsOf).toBe("2026-10-22T00:00:00Z");
});

test("rare ranks, vendor stock, entrances, bosses and separate treasure clusters remain local facts", () => {
  const b = baseline();
  b.objects.set(100, { id: 100, name: "Local chest", refs: [], spawns: [
    { areaId: 12, uiMapId: 1429, x: 20, y: 20, respawnSecs: 30 },
    { areaId: 12, uiMapId: 1429, x: 80, y: 80, respawnSecs: 30 },
  ] });
  const records = [npc(1, { rank: "rare" }),
    { kind: "vendor", eventId: "offer", installId: "install-1", capturedAt: "2026-10-01T00:00:00Z", vendorNpcId: 10, items: [{ itemId: 30, priceCopper: 20, limitedStock: 1 }] },
    { kind: "object_sighting", eventId: "chest", installId: "install-1", capturedAt: "2026-10-01T00:00:00Z", objectId: 100, name: "Chest", mapId: 1429, x: 20, y: 20 },
    { kind: "instance_entrance", eventId: "door", installId: "install-1", capturedAt: "2026-10-01T00:00:00Z", instanceMapId: 36, name: "Dungeon", instanceType: "party", mapId: 1429, x: 40, y: 60 },
    { kind: "encounter", eventId: "boss", installId: "install-1", capturedAt: "2026-10-01T00:00:00Z", instanceMapId: 36, encounterId: 1, name: "Boss", success: true, npcIds: [10] },
  ];
  const report = run(records, { baseline: b });
  expect(report.rows.find(r => r.type === "rare" && r.field === "name")?.state).toBe("reported");
  expect(report.rows.find(r => r.type === "vendor" && r.field === "stock")?.values[0]?.value).toBe(1);
  expect(report.rows.find(r => r.type === "entrance" && r.id === "36:1429" && r.field === "position")?.state).toBe("reported");
  expect(report.rows.find(r => r.type === "boss" && r.field === "npc:10")?.state).toBe("reported");
  const treasurePins = report.rows.filter(r => r.type === "treasure" && r.field === "position");
  expect(treasurePins.map(r => r.state).sort()).toEqual(["missing", "reported"]);
});

test("file entrances use the shared world-coordinate placement and missing client bosses are retained", () => {
  const point = zoneToWorld(zoneTable(WORLD_MAP_DATA), 1429, 0.5, 0.5)!;
  const report = run([], { mapData: { ...WORLD_MAP_DATA, entrances: [{ mapId: 999, name: "File entrance", raid: false, ...point }] }, bosses: [{ encounterId: 55, instanceMapId: 999 }] });
  expect(report.rows.find(r => r.type === "entrance" && r.field === "position")).toMatchObject({ zone: "1429", state: "missing" });
  expect(report.rows.find(r => r.type === "boss" && r.field === "listed")).toMatchObject({ zone: "1429", state: "missing" });
});

test("drop rate precision uses attributed windows and leaves pending loot out", () => {
  const loot = (i: number, sourceEvidence: string) => ({ kind: "loot", eventId: `loot-${sourceEvidence}-${i}`, installId: `install-${i % 5}`, capturedAt: "2026-10-01T00:00:00Z", sourceNpcId: 10, sourceEvidence, items: [{ itemId: 30, count: 1 }] });
  const pending = run(Array.from({ length: 50 }, (_, i) => loot(i, "inferred")));
  expect(pending.rows.find(r => r.type === "drop")?.state).toBe("missing");
  const measured = run(Array.from({ length: 50 }, (_, i) => loot(i, "loot-api")));
  expect(measured.rows.find(r => r.type === "drop")).toMatchObject({ state: "settled", values: [{ value: "50/50", voters: 5 }] });
});

test("real CLI writes outside the repository, refuses an internal output, and never changes the source DB", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "coverage-cli-"));
  const dbPath = join(cwd, "source.sqlite"), db = openDb(dbPath);
  await importPfquest(db, pfquestCheckout(), { snapshotPath: mapSnapshot() });
  db.close();
  const hash = () => createHash("sha256").update(readFileSync(dbPath)).digest("hex");
  const before = hash();
  const root = fileURLToPath(new URL("../", import.meta.url));
  const tsx = join(root, "node_modules", "tsx", "dist", "cli.mjs"), cli = join(root, "src", "cli.ts");
  const args = [tsx, cli, "coverage-report", "--db", dbPath, "--out"];
  const env = { ...process.env, EVERLOOT_PUBLIC_CORPUS_URL: "", EVERLOOT_UPLOADS: "" };
  execFileSync(process.execPath, [...args, join(cwd, "out")], { cwd, env });
  expect(existsSync(join(cwd, "out", "coverage-expected.json"))).toBe(true);
  expect(hash()).toBe(before);
  const refused = spawnSync(process.execPath, [...args, join(root, "coverage-report-rejected")], { cwd, env, encoding: "utf8" });
  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toMatch(/inside the repository/);
  expect(existsSync(join(root, "coverage-report-rejected"))).toBe(false);
}, 60_000);
