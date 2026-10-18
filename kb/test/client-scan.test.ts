import { expect, test } from "vitest";
import { classifyDomain, DOMAINS, formatScanReport, loadManifest, neverReason, parseManifest, scanBuild, type ManifestEntry } from "../src/client-scan.js";
import type { FileStatus } from "../src/client-extract.js";

test("domains are classified by the site area each table serves", () => {
  expect(classifyDomain("ItemSparse")).toBe("items");
  expect(classifyDomain("TransmogSet")).toBe("items");
  expect(classifyDomain("SpellMisc")).toBe("spells");
  expect(classifyDomain("TraitTree")).toBe("talents");
  expect(classifyDomain("ChrRaces")).toBe("characters");
  expect(classifyDomain("CreatureFamily")).toBe("creatures");
  expect(classifyDomain("CreatureModelData")).toBe("models");
  expect(classifyDomain("GameObjects")).toBe("objects");
  expect(classifyDomain("QuestV2")).toBe("quests");
  expect(classifyDomain("UiMapArt")).toBe("world");
  expect(classifyDomain("AreaTable")).toBe("world");
  expect(classifyDomain("ZoneMusic")).toBe("audio");
  expect(classifyDomain("ZoneStory")).toBe("lore");
  expect(classifyDomain("Faction")).toBe("factions");
  expect(classifyDomain("BattlePetSpecies")).toBe("collections");
  expect(classifyDomain("SkillLineAbility")).toBe("professions");
  expect(classifyDomain("Achievement")).toBe("achievements");
  expect(classifyDomain("CurrencyTypes")).toBe("currencies");
  expect(classifyDomain("HolidayNames")).toBe("holidays");
  expect(classifyDomain("PvPRank")).toBe("pvp");
  expect(classifyDomain("LFGDungeons")).toBe("group content");
  expect(classifyDomain("JournalInstance")).toBe("group content");
  expect(classifyDomain("TaxiNodes")).toBe("travel");
  expect(classifyDomain("UiTextureAtlas")).toBe("interface");
  expect(classifyDomain("ContentTuning")).toBe("other");
  expect(DOMAINS).toContain(classifyDomain("SomethingNew"));
});

test("the manifest parses entries with either file data id, and rejects a bad shape", () => {
  expect(parseManifest(JSON.stringify([
    { tableName: "Achievement", tableHash: "D2EE2CA7", dbcFileDataID: 841607, db2FileDataID: 1260179 },
    { tableName: "Achievement_Criteria", tableHash: "E3614CCD" },
  ]))).toEqual([
    { tableName: "Achievement", dbcFileDataID: 841607, db2FileDataID: 1260179 },
    { tableName: "Achievement_Criteria" },
  ]);
  expect(() => parseManifest("{}")).toThrow("not an array");
  expect(() => parseManifest(JSON.stringify([{ tableHash: "X" }]))).toThrow("tableName");
});

test("loadManifest fetches a URL and refuses a bad answer", async () => {
  const ok = (async () => new Response(JSON.stringify([{ tableName: "Item", db2FileDataID: 1 }]))) as typeof fetch;
  const got = await loadManifest("https://example.com/manifest.json", ok);
  expect(got.source).toBe("https://example.com/manifest.json");
  expect(got.entries).toEqual([{ tableName: "Item", db2FileDataID: 1 }]);
  const bad = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  await expect(loadManifest("https://example.com/manifest.json", bad)).rejects.toThrow("answered 500");
});

const entries: ManifestEntry[] = [
  { tableName: "Item", db2FileDataID: 1 },
  { tableName: "LFGDungeons", db2FileDataID: 3 },
  { tableName: "TraitThing", db2FileDataID: 4 },
  { tableName: "EncryptedThing", db2FileDataID: 5 },
  { tableName: "OldOnly", dbcFileDataID: 6 },
  { tableName: "NoId" },
  { tableName: "Moved", db2FileDataID: 7 },
  { tableName: "Stale", db2FileDataID: 8 },
];
const status: Record<number, FileStatus> = { 1: "present", 3: "present", 4: "absent", 5: "encrypted", 6: "present", 7: "present" };
const statusOf = (id: number): FileStatus => status[id] ?? "absent";
const read = { Item: 1, Stale: 8, Moved: 5, Vanished: 9 };
const meta = { build: { product: "wow_classic_beta", version: "1.60.1.70450", buildId: 70450, buildConfig: "84bea4233331e390fda8724c6f91ffa5" }, definitions: "b9a63096cdd9", manifest: "https://example.com/manifest.json" };

test("scanBuild counts the build, keeps the candidates and notes every curated mismatch", () => {
  const report = scanBuild(meta, entries, statusOf, read);
  expect(report.totals).toEqual({ known: 8, present: 4, absent: 2, encrypted: 1, noFileDataID: 1, read: 4, readPresent: 2, excluded: 0, neverListed: 0 });
  expect(report.candidates).toEqual([
    { table: "LFGDungeons", fileDataID: 3, via: "db2", domain: "group content" },
    { table: "OldOnly", fileDataID: 6, via: "dbc", domain: "other" },
  ]);
  expect(report.neverList).toEqual([]);
  expect(report.notes).toEqual([
    { table: "Stale", note: "not in the build" },
    { table: "Moved", note: "read from file data id 5; the manifest lists 7" },
    { table: "Vanished", note: "not in the WoWDBDefs manifest" },
  ]);
  expect(report.domains).toEqual([
    { domain: "items", present: 1, read: 1, unread: 0 },
    { domain: "group content", present: 1, read: 0, unread: 1 },
    { domain: "other", present: 2, read: 1, unread: 1 },
  ]);
  expect(report.scannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test("key-material tables are counted and named, never candidates", () => {
  const withKeys: ManifestEntry[] = [
    { tableName: "Item", db2FileDataID: 1 },
    { tableName: "TactKey", db2FileDataID: 10 },
    { tableName: "TactKeyLookup", db2FileDataID: 11 },
  ];
  const report = scanBuild(meta, withKeys, (id) => (id === 1 || id === 10 || id === 11 ? "present" : "absent"), { Item: 1 });
  expect(report.totals).toEqual({ known: 3, present: 1, absent: 0, encrypted: 0, noFileDataID: 0, read: 1, readPresent: 1, excluded: 2, neverListed: 0 });
  expect(report.candidates).toEqual([]);
  expect(report.domains).toEqual([{ domain: "items", present: 1, read: 1, unread: 0 }]);
  expect(formatScanReport(report)).toContain("| excluded (key material, never read) | 2 |");
});

test("never-list tables are counted, named and kept out of the candidates", () => {
  expect(neverReason("GarrBuilding")).toBe("retail-only system, not live in Forever");
  expect(neverReason("MythicPlusSeason")).toBe("retail-only system, not live in Forever");
  expect(neverReason("AvailableSuperDistrict")).toBe("retail-only system, not live in Forever");
  expect(neverReason("GlobalStrings")).toBe("client plumbing, not game data");
  expect(neverReason("ContentTuning")).toBeNull();
  expect(neverReason("PVPDifficulty")).toBeNull();
  const withNever: ManifestEntry[] = [
    { tableName: "Item", db2FileDataID: 1 },
    { tableName: "GarrBuilding", db2FileDataID: 20 },
    { tableName: "MythicPlusSeason", db2FileDataID: 21 },
    { tableName: "GlobalStrings", db2FileDataID: 22 },
    { tableName: "ContentTuning", db2FileDataID: 23 },
  ];
  const report = scanBuild(meta, withNever, () => "present", { Item: 1 });
  expect(report.totals.neverListed).toBe(3);
  expect(report.neverList).toEqual([
    { table: "GarrBuilding", reason: "retail-only system, not live in Forever" },
    { table: "MythicPlusSeason", reason: "retail-only system, not live in Forever" },
    { table: "GlobalStrings", reason: "client plumbing, not game data" },
  ]);
  expect(report.candidates.map((c) => c.table)).toEqual(["ContentTuning"]);
  expect(report.domains).toEqual([
    { domain: "items", present: 1, read: 1, unread: 0 },
    { domain: "other", present: 4, read: 0, unread: 1 },
  ]);
  const md = formatScanReport(report);
  expect(md).toContain("| never-list (decided never, not candidates) | 3 |");
  expect(md).toContain("| GarrBuilding | retail-only system, not live in Forever |");
  expect(md).toContain("### other — 4 present, 0 read, 1 unread");
  expect(md).not.toContain("| GarrBuilding | 20 | db2 |");
});

test("a never-list table the knowledge base reads flows through the read path", () => {
  const withRead: ManifestEntry[] = [
    { tableName: "GlobalStrings", db2FileDataID: 1 },
  ];
  const report = scanBuild(meta, withRead, () => "present", { GlobalStrings: 1 });
  expect(report.totals.neverListed).toBe(0);
  expect(report.totals.readPresent).toBe(1);
});

test("the markdown report carries the totals, the notes and each domain's candidates", () => {
  const md = formatScanReport(scanBuild(meta, entries, statusOf, read));
  expect(md).toContain("# Client table scan — wow_classic_beta 1.60.1.70450");
  expect(md).toContain("| in this build | 4 |");
  expect(md).toContain("| candidates not read yet | 2 |");
  expect(md).toContain("- Moved: read from file data id 5; the manifest lists 7");
  expect(md).toContain("### group content — 1 present, 0 read, 1 unread");
  expect(md).toContain("| LFGDungeons | 3 | db2 |");
  expect(md).toContain("### items — 1 present, 1 read, 0 unread");
});
