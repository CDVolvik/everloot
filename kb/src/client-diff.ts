/**
 * Field-level diff between two client snapshots: rows added, removed and changed per table, with each
 * changed field's before and after value. Deterministic: tables, ids and fields come out sorted.
 */
import { isDeepStrictEqual } from "node:util";
import { readClientMeta, readClientRows, readClientTables } from "./client-snapshot.js";

export interface FieldChange { field: string; before: unknown; after: unknown }
export interface TableDiff {
  table: string;
  added: number[];
  removed: number[];
  changed: { id: number; fields: FieldChange[] }[];
  /** Columns only one build's layout has: reported once here, left out of the per-row changes. */
  schema: { addedFields: string[]; removedFields: string[] };
}
export interface BuildRef { product: string; version: string; buildConfig: string; buildId: number }
export interface ClientDiff { from: BuildRef; to: BuildRef; crossProduct: boolean; tables: TableDiff[]; warnings: string[] }

const ref = (path: string): BuildRef => {
  const m = readClientMeta(path);
  return { product: m.product, version: m.version, buildConfig: m.buildConfig, buildId: m.buildId };
};

/** A share of removed rows above `massDeletionShare` (default one half) is flagged as a likely parsing problem. */
export function diffSnapshots(fromPath: string, toPath: string, opts: { massDeletionShare?: number } = {}): ClientDiff {
  const share = opts.massDeletionShare ?? 0.5;
  const from = ref(fromPath);
  const to = ref(toPath);
  const fromTables = readClientTables(fromPath);
  const toTables = readClientTables(toPath);
  const warnings: string[] = [];
  for (const t of fromTables) if (!toTables.includes(t)) warnings.push(`${t}: only in ${from.version} (${from.product})`);
  for (const t of toTables) if (!fromTables.includes(t)) warnings.push(`${t}: only in ${to.version} (${to.product})`);
  const tables: TableDiff[] = [];
  for (const table of fromTables.filter((t) => toTables.includes(t))) {
    const a = readClientRows(fromPath, table);
    const b = readClientRows(toPath, table);
    const added = [...b.keys()].filter((id) => !a.has(id)).sort((x, y) => x - y);
    const removed = [...a.keys()].filter((id) => !b.has(id)).sort((x, y) => x - y);
    const columns = (rows: Map<number, Record<string, unknown>>) => new Set([...rows.values()].flatMap((r) => Object.keys(r)));
    const before = columns(a);
    const after = columns(b);
    const schema = {
      addedFields: [...after].filter((f) => !before.has(f)).sort(),
      removedFields: [...before].filter((f) => !after.has(f)).sort(),
    };
    const shared = [...before].filter((f) => after.has(f)).sort();
    const changed: TableDiff["changed"] = [];
    for (const id of [...a.keys()].filter((k) => b.has(k)).sort((x, y) => x - y)) {
      const old = a.get(id)!;
      const now = b.get(id)!;
      const fields = shared
        .filter((f) => !isDeepStrictEqual(old[f], now[f]))
        .map((f) => ({ field: f, before: old[f] ?? null, after: now[f] ?? null }));
      if (fields.length) changed.push({ id, fields });
    }
    if (a.size > 0 && removed.length / a.size > share) {
      warnings.push(`${table}: ${removed.length} of ${a.size} rows removed; check the extraction before trusting this`);
    }
    tables.push({ table, added, removed, changed, schema });
  }
  return { from, to, crossProduct: from.product !== to.product, tables, warnings };
}
