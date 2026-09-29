import type { DB } from "./db.js";
import type { GameVersion, Kind } from "./entities.js";

export interface SearchHit {
  id: number;
  kind: string;
  name: string;
  snippet: string;
  gameVersion: GameVersion;
  sourceUrl: string;
  sourceId: string;
  licence: string;
  retrievedAt: string;
}

export interface SearchOptions {
  kinds?: Kind[];
  versions?: GameVersion[];
}

/** Every term is quoted, so user input can never be read as FTS syntax. Terms are ANDed. */
export function toFtsQuery(input: string): string {
  const terms = input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms.map((t) => `"${t}"`).join(" ");
}

/**
 * Words that carry no meaning for a knowledge lookup ("where is Thrall" asks about Thrall).
 * Single letters are contraction debris ("don't" -> "don" + "t"). When everything is noise
 * ("The"), the raw terms are used so the query still matches something.
 */
const STOPWORDS = new Set([
  "a", "about", "an", "and", "are", "at", "be", "been", "can", "could", "did", "do", "does",
  "find", "for", "from", "get", "give", "how", "in", "is", "list", "me", "of", "on", "or",
  "please", "show", "should", "tell", "the", "to", "was", "were", "what", "when", "where",
  "which", "who", "whom", "whose", "why", "with", "would",
]);

function contentTerms(input: string): string[] {
  const terms = input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const kept = terms.filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return kept.length > 0 ? kept : terms;
}

const ROW = `e.id, e.kind, e.name,
  snippet(entities_fts, 1, '', '', '…', 16) AS snippet,
  e.game_version AS gameVersion, e.source_url AS sourceUrl,
  e.source_id AS sourceId, e.licence, e.retrieved_at AS retrievedAt`;

export function search(db: DB, query: string, limit = 10, opts: SearchOptions = {}): SearchHit[] {
  const raw = query.trim();
  if (!raw) return [];
  const q = contentTerms(raw)
    .map((t) => `"${t}"`)
    .join(" ");
  if (!q) return [];
  const conds = ["entities_fts MATCH ?"];
  const params: unknown[] = [q];
  if (opts.kinds?.length) {
    conds.push(`e.kind IN (${opts.kinds.map(() => "?").join(",")})`);
    params.push(...opts.kinds);
  }
  if (opts.versions?.length) {
    conds.push(`e.game_version IN (${opts.versions.map(() => "?").join(",")})`);
    params.push(...opts.versions);
  }
  params.push(raw, limit);
  return db
    .prepare(
      `SELECT ${ROW}
       FROM entities_fts JOIN entities e ON e.id = entities_fts.rowid
       WHERE ${conds.join(" AND ")}
       ORDER BY CASE WHEN e.name = ? COLLATE NOCASE THEN 0 ELSE 1 END, bm25(entities_fts, 10.0, 1.0)
       LIMIT ?`,
    )
    .all(...params) as SearchHit[];
}

interface EntityRow {
  id: number;
  kind: string;
  name: string;
  body: string;
  gameVersion: GameVersion;
  sourceUrl: string;
  sourceId: string;
  licence: string;
  retrievedAt: string;
}

const ROW_BY_ID = `id, kind, name, body, game_version AS gameVersion, source_url AS sourceUrl,
  source_id AS sourceId, licence, retrieved_at AS retrievedAt`;

function toHit(r: EntityRow): SearchHit {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    snippet: r.body.length > 160 ? `${r.body.slice(0, 160)}…` : r.body,
    gameVersion: r.gameVersion,
    sourceUrl: r.sourceUrl,
    sourceId: r.sourceId,
    licence: r.licence,
    retrievedAt: r.retrievedAt,
  };
}

/** One row by id, for page rendering and the MCP server. Unknown id gives undefined. */
export function getEntity(db: DB, id: number): SearchHit | undefined {
  const r = db.prepare(`SELECT ${ROW_BY_ID} FROM entities WHERE id = ?`).get(id) as EntityRow | undefined;
  return r ? toHit(r) : undefined;
}

/** Exact full-name match (case-insensitive), optionally narrowed to one kind. */
export function getByName(db: DB, name: string, kind?: Kind): SearchHit[] {
  const cond = kind ? "AND kind = ?" : "";
  const params = kind ? [name, kind] : [name];
  const rows = db
    .prepare(`SELECT ${ROW_BY_ID} FROM entities WHERE name = ? COLLATE NOCASE ${cond} ORDER BY id`)
    .all(...params) as EntityRow[];
  return rows.map(toHit);
}
