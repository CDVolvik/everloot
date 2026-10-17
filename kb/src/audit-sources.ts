import { openExistingReadOnlyDb } from "./db.js";
import { SOURCES } from "./sources.js";

export interface SourceAudit {
  path: string;
  /** Rows per source id, as stored in the file. */
  sources: Record<string, number>;
  /** Raw Battle.net responses cached in the file; any at all means it is not publishable. */
  cachedApiRows: number;
  /** Non-publishable source ids present in the file, plus "api_cache" if it holds rows. Empty means clean. */
  unexpected: string[];
}

/** Which sources a knowledge database or release actually holds, and anything in it that may not be published. */
export function auditSources(path: string): SourceAudit {
  const db = openExistingReadOnlyDb(path);
  try {
    const rows = db.prepare("SELECT source_id AS id, count(*) AS n FROM entities GROUP BY source_id").all() as { id: string; n: number }[];
    const hasCache = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'api_cache'").get() !== undefined;
    const cachedApiRows = hasCache ? (db.prepare("SELECT count(*) AS n FROM api_cache").get() as { n: number }).n : 0;
    const publishable = new Set(Object.values(SOURCES).filter((s) => s.publishable).map((s) => s.id as string));
    const sources: Record<string, number> = {};
    for (const r of rows) sources[r.id] = r.n;
    const unexpected = rows.map((r) => r.id).filter((id) => !publishable.has(id));
    if (cachedApiRows > 0) unexpected.push("api_cache");
    return { path, sources, cachedApiRows, unexpected };
  } finally {
    db.close();
  }
}
