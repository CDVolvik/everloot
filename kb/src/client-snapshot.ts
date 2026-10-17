/**
 * One immutable SQLite snapshot per game build: the raw rows of the client tables we read, a few
 * normalized fields for items and spells, and a manifest beside it with provenance and a sha256.
 * Game file data is Blizzard's; it never goes into the CC BY-SA knowledge release.
 */
import Database from "better-sqlite3";
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { sha256File } from "./snapshot.js";

/** File data ids of the tables read so far (stable across builds). */
export const CLIENT_TABLES = { ItemSparse: 1572924, Item: 841626, SpellName: 1990283, Spell: 1140089 } as const;
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

/** Write the snapshot and its manifest. The file is built beside the target and renamed into place. */
export function writeClientSnapshot(path: string, meta: ClientBuildMeta, tables: ExtractedTable[]): ClientManifest {
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
