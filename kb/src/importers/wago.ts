import { parse } from "csv-parse/sync";
import type { DB } from "../db.js";
import { replaceSourceRows, type EntityInput, type Kind } from "../entities.js";
import { USER_AGENT } from "../http.js";

export interface WagoTable {
  table: string;
  kind: Kind;
  columns: { id: string; name: string; extra: Record<string, string> };
}

/**
 * DB2 tables we import and the CSV columns we read from each. Column names are checked against the
 * live header before the first real import; `wagoRows` refuses a CSV missing any of them.
 */
export const WAGO_TABLES: WagoTable[] = [
  {
    table: "ItemSparse",
    kind: "item",
    columns: {
      id: "ID",
      name: "Display_lang",
      extra: { quality: "OverallQualityID", itemLevel: "ItemLevel", requiredLevel: "RequiredLevel" },
    },
  },
  { table: "SpellName", kind: "spell", columns: { id: "ID", name: "Name_lang", extra: {} } },
  {
    table: "AreaTable",
    kind: "zone",
    columns: { id: "ID", name: "AreaName_lang", extra: { continentId: "ContinentID", parentAreaId: "ParentAreaID" } },
  },
];

export function wagoCsvUrl(table: string, build: string): string {
  return `https://wago.tools/db2/${table}/csv?build=${encodeURIComponent(build)}`;
}

export function wagoRows(cfg: WagoTable, csv: string, build: string, retrievedAt: string): EntityInput[] {
  const records = parse(csv, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  if (records.length === 0) throw new Error(`${cfg.table}: no rows — not a valid export (wrong build, or an error page?)`);
  const wanted = [cfg.columns.id, cfg.columns.name, ...Object.values(cfg.columns.extra)];
  const missing = wanted.filter((c) => !(c in records[0]));
  if (missing.length > 0) throw new Error(`${cfg.table}: missing columns ${missing.join(", ")}`);
  const seenIds = new Set<string>();
  return records
    .filter((r) => r[cfg.columns.name]?.trim())
    .map((r) => {
      const id = r[cfg.columns.id];
      if (seenIds.has(id)) throw new Error(`${cfg.table}: duplicate ID ${id} in export`);
      seenIds.add(id);
      return {
        kind: cfg.kind,
        extId: id,
        name: r[cfg.columns.name].trim(),
        data: {
          build,
          ...Object.fromEntries(Object.entries(cfg.columns.extra).map(([key, col]) => [key, r[col]])),
        },
        gameVersion: "forever" as const,
        sourceUrl: wagoCsvUrl(cfg.table, build),
        retrievedAt,
      };
    });
}

/** Downloads one table for one build and replaces that kind's wago.tools rows. */
export async function importWagoTable(db: DB, cfg: WagoTable, build: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const res = await fetchImpl(wagoCsvUrl(cfg.table, build), { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`wago.tools ${cfg.table} ${build}: HTTP ${res.status}`);
  const rows = wagoRows(cfg, await res.text(), build, new Date().toISOString());
  return replaceSourceRows(db, "wago-tools", [cfg.kind], rows);
}
