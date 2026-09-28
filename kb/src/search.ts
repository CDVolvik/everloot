import type { DB } from "./db.js";

export interface SearchHit {
  id: number;
  kind: string;
  name: string;
  snippet: string;
  sourceUrl: string;
  sourceId: string;
  licence: string;
}

/** Every term is quoted, so user input can never be read as FTS syntax. Terms are ANDed. */
export function toFtsQuery(input: string): string {
  const terms = input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms.map((t) => `"${t}"`).join(" ");
}

export function search(db: DB, query: string, limit = 10): SearchHit[] {
  const q = toFtsQuery(query);
  if (!q) return [];
  return db
    .prepare(
      `SELECT e.id, e.kind, e.name,
              snippet(entities_fts, 1, '', '', '…', 16) AS snippet,
              e.source_url AS sourceUrl, e.source_id AS sourceId, e.licence
       FROM entities_fts JOIN entities e ON e.id = entities_fts.rowid
       WHERE entities_fts MATCH ?
       ORDER BY bm25(entities_fts, 10.0, 1.0)
       LIMIT ?`,
    )
    .all(q, limit) as SearchHit[];
}
