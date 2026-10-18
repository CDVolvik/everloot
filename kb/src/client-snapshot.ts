/**
 * One immutable SQLite snapshot per game build: the raw rows of the client tables we read, a few
 * normalized fields for items and spells, and a manifest beside it with provenance and a sha256.
 * Game file data is Blizzard's; it never goes into the CC BY-SA knowledge release.
 */
import Database from "better-sqlite3";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { sha256File } from "./snapshot.js";

/**
 * File data ids of the tables read so far (stable across builds). The ids come from the `db2FileDataID`
 * field of the WoWDBDefs manifest, not from a listfile. A table a build does not ship is recorded as
 * missing; that is normal (Classic Era has almost no Trait tables).
 */
export const CLIENT_TABLES = {
  ItemSparse: 1572924, Item: 841626, SpellName: 1990283, Spell: 1140089,
  // Talents: the trait system, and what ties a tree to a class and its three talent groups.
  TraitTree: 4420305, TraitNode: 4420297, TraitNodeEntry: 4420298, TraitDefinition: 4420327, TraitEdge: 4420308,
  TraitCond: 4543085, TraitNodeGroup: 4420300, TraitNodeGroupXTraitNode: 4420302, TraitNodeXTraitNodeEntry: 4420304,
  TraitNodeXTraitCond: 4543092, TraitNodeGroupXTraitCond: 4543090, TraitNodeEntryXTraitCond: 4543088,
  TraitSubTree: 5534447, TraitSystem: 4635649, TraitTreeLoadout: 4669507, TraitNodeGroupDisplayInfo: 7935808,
  TraitCurrency: 4524216, TraitCurrencySource: 4539393, TraitCost: 4420295, TraitTreeXTraitCost: 4420306,
  TraitTreeXTraitCurrency: 4524218, TraitNodeXTraitCost: 4420303, TraitNodeGroupXTraitCost: 4420301,
  TraitNodeEntryXTraitCost: 4420299,
  SkillLineXTraitTree: 4505477, SkillLine: 1240935, SkillRaceClassInfo: 1240406,
  ChrSpecialization: 1343390, ChrClasses: 1361031,
  // Spell effects: aura type, targets and radius, for the raid buff table.
  SpellEffect: 1140088, SpellRadius: 1134584,
  // Tooltips and icons for the talent catalog: icon file id and duration of each spell.
  SpellMisc: 1003144, SpellDuration: 1137828,
  // Proc chance and charges, for the $h and $n tooltip variables.
  SpellAuraOptions: 1139952,
  // Interface art: which texture file and rectangle each named piece of the talent frame is
  // (atlas element name, member rectangle, atlas file). Read as table rows, no listfile.
  UiTextureAtlas: 897470, UiTextureAtlasElement: 1989276, UiTextureAtlasMember: 897532,
  // Maps: zone rectangles in world coordinates (UiMap names the maps, UiMapAssignment places them on a
  // continent) and, in Map, the continents and the instances with their entrance position.
  Map: 1349477, UiMap: 1957206, UiMapAssignment: 1957219,
  // Map art: which tile files make up each map's picture (UiMapXMapArt names the art of a UiMap, UiMapArtTile
  // lists its tiles by row and column, UiMapArtStyleLayer gives the tile and layer sizes).
  UiMapArt: 1957202, UiMapArtTile: 1957210, UiMapArtStyleLayer: 1957208, UiMapXMapArt: 1957217,
  // Coverage (docs/2026-10-18-database-taxonomy-research.md): item categories and sets, how spells
  // make and use items, zones, races, factions and the other entity lists a game database carries.
  // Ids from the WoWDBDefs manifest at b9a63096cdd9; every one has a 1.60.1 layout there.
  ItemClass: 1140189, ItemSubClass: 1261604, ItemSet: 1343609,
  SkillLineAbility: 1266278, SpellItemEnchantment: 1362771, SpellReagents: 841946,
  AreaTable: 1353545, ChrRaces: 1305311, Faction: 1361972, CharTitles: 1349054, Languages: 1135325,
  CurrencyTypes: 1095531, CreatureFamily: 1351351, CreatureType: 1131315, Holidays: 996357,
  Toy: 988200, BattlePetSpecies: 841622,
  // Partial on the client: most of what these describe (spawns, quest text) lives on the server.
  Creature: 841631, GameObjects: 841620, QuestV2: 1139443,
  // Loading screens (Map.LoadingScreenID names a row; the row names its picture files), for the page
  // banners. ChrRaces above also gives the race names for the race emblems.
  LoadingScreens: 1266541,
} as const;
export type ClientTableName = keyof typeof CLIENT_TABLES;

export interface ExtractedTable {
  table: string;
  fileDataID: number;
  /** Content key the table was read from; null when not recorded. */
  cKey: string | null;
  /** Blocks left out because they are encrypted (no keys are ever used). */
  encryptedBlocks: number;
  rows: Map<number, Record<string, unknown>>;
}

export interface ClientBuildMeta {
  product: string;
  buildConfig: string;
  buildId: number;
  version: string;
  extractedAt: string;
  /** Extraction library and version, e.g. "@rhyster/wow-casc-dbc@2.16.15". */
  library: string;
  /** WoWDBDefs commit the table definitions came from; null when unknown. */
  definitions: string | null;
}

export interface ClientManifest extends ClientBuildMeta {
  tables: { table: string; fileDataID: number; cKey: string | null; rows: number; encryptedBlocks: number }[];
  /** Tables that were asked for and not read, with the reason. Absent in snapshots written before 2026-10-18. */
  missing?: { table: string; reason: string }[];
  sha256: string;
}

export interface ClientItem {
  id: number; name: string | null; quality: number | null; itemLevel: number | null;
  requiredLevel: number | null; classId: number | null; subclassId: number | null; inventoryType: number | null;
}

export interface ClientSpell { id: number; name: string | null; description: string | null; auraDescription: string | null }

const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE client_rows (tbl TEXT NOT NULL, id INTEGER NOT NULL, raw TEXT NOT NULL, PRIMARY KEY (tbl, id));
CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, quality INTEGER, item_level INTEGER, required_level INTEGER,
  class_id INTEGER, subclass_id INTEGER, inventory_type INTEGER);
CREATE TABLE spells (id INTEGER PRIMARY KEY, name TEXT, description TEXT, aura_description TEXT);
`;

/** JSON with 64-bit integers kept exactly, as strings. */
function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function normalizeItem(id: number, sparse?: Record<string, unknown>, item?: Record<string, unknown>): ClientItem {
  return {
    id,
    name: str(sparse?.Display_lang), quality: num(sparse?.OverallQualityID), itemLevel: num(sparse?.ItemLevel),
    requiredLevel: num(sparse?.RequiredLevel), classId: num(item?.ClassID), subclassId: num(item?.SubclassID),
    inventoryType: num(item?.InventoryType),
  };
}

export function normalizeSpell(id: number, name?: Record<string, unknown>, spell?: Record<string, unknown>): ClientSpell {
  return { id, name: str(name?.Name_lang), description: str(spell?.Description_lang), auraDescription: str(spell?.AuraDescription_lang) };
}

/**
 * `<product>-<buildId>-<first 8 of BuildConfig>.sqlite`. Blizzard sometimes ships two builds under one
 * build number, and a build is keyed on its BuildConfig, so the name carries part of it.
 */
export function clientSnapshotName(build: { product: string; buildId: number; buildConfig: string }): string {
  return `${build.product}-${build.buildId}-${build.buildConfig.slice(0, 8)}.sqlite`;
}

/** Write the snapshot and its manifest. The file is built beside the target and renamed into place. */
export function writeClientSnapshot(path: string, meta: ClientBuildMeta, tables: ExtractedTable[], missing: { table: string; reason: string }[] = []): ClientManifest {
  const partial = `${path}.partial`;
  rmSync(partial, { force: true });
  const db = new Database(partial);
  try {
    db.exec(SCHEMA);
    const putMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
    for (const [k, v] of Object.entries(meta)) putMeta.run(k, String(v ?? ""));
    const putRow = db.prepare("INSERT INTO client_rows (tbl, id, raw) VALUES (?, ?, ?)");
    const byName = new Map(tables.map((t) => [t.table, t]));
    db.transaction(() => {
      for (const t of tables) for (const [id, raw] of t.rows) putRow.run(t.table, id, toJson(raw));
      const sparse = byName.get("ItemSparse")?.rows;
      const item = byName.get("Item")?.rows;
      const putItem = db.prepare("INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const id of new Set([...(sparse?.keys() ?? []), ...(item?.keys() ?? [])])) {
        const n = normalizeItem(id, sparse?.get(id), item?.get(id));
        putItem.run(n.id, n.name, n.quality, n.itemLevel, n.requiredLevel, n.classId, n.subclassId, n.inventoryType);
      }
      const names = byName.get("SpellName")?.rows;
      const spells = byName.get("Spell")?.rows;
      const putSpell = db.prepare("INSERT INTO spells VALUES (?, ?, ?, ?)");
      for (const id of new Set([...(names?.keys() ?? []), ...(spells?.keys() ?? [])])) {
        const n = normalizeSpell(id, names?.get(id), spells?.get(id));
        putSpell.run(n.id, n.name, n.description, n.auraDescription);
      }
    })();
  } finally {
    db.close();
  }
  renameSync(partial, path);
  const manifest: ClientManifest = {
    ...meta,
    tables: tables.map((t) => ({ table: t.table, fileDataID: t.fileDataID, cKey: t.cKey, rows: t.rows.size, encryptedBlocks: t.encryptedBlocks })),
    missing,
    sha256: sha256File(path),
  };
  writeFileSync(`${path}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function open(path: string): Database.Database {
  return new Database(path, { readonly: true, fileMustExist: true });
}

export function readClientMeta(path: string): ClientBuildMeta {
  const db = open(path);
  try {
    const m = Object.fromEntries((db.prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    return {
      product: m.product, buildConfig: m.buildConfig, buildId: Number(m.buildId), version: m.version,
      extractedAt: m.extractedAt, library: m.library, definitions: m.definitions || null,
    };
  } finally {
    db.close();
  }
}

/** The manifest written beside a snapshot (it holds the per-table encrypted block counts); null when absent. */
export function readClientManifest(path: string): ClientManifest | null {
  try {
    return JSON.parse(readFileSync(`${path}.manifest.json`, "utf8")) as ClientManifest;
  } catch {
    return null;
  }
}

export function readClientTables(path: string): string[] {
  const db = open(path);
  try {
    return (db.prepare("SELECT DISTINCT tbl FROM client_rows ORDER BY tbl").all() as { tbl: string }[]).map((r) => r.tbl);
  } finally {
    db.close();
  }
}

export function readClientRows(path: string, table: string): Map<number, Record<string, unknown>> {
  const db = open(path);
  try {
    const rows = db.prepare("SELECT id, raw FROM client_rows WHERE tbl = ? ORDER BY id").all(table) as { id: number; raw: string }[];
    return new Map(rows.map((r) => [r.id, JSON.parse(r.raw) as Record<string, unknown>]));
  } finally {
    db.close();
  }
}

export function readClientItems(path: string): ClientItem[] {
  const db = open(path);
  try {
    return db.prepare(`SELECT id, name, quality, item_level AS itemLevel, required_level AS requiredLevel,
      class_id AS classId, subclass_id AS subclassId, inventory_type AS inventoryType FROM items ORDER BY id`).all() as ClientItem[];
  } finally {
    db.close();
  }
}
