import { openExistingReadOnlyDb } from "./db.js";
import { SOURCES } from "./sources.js";

export interface SourceAudit {
  path: string;
  /** Rows per source id, as stored in the file. */
  sources: Record<string, number>;
  /** Source ids present in the file that are not publishable. Empty means the file is clean. */
  unexpected: string[];
}

/** Which sources a knowledge database or release actually holds, and any that may not be published. */
export function auditSources(path: string): SourceAudit {
  const db = openExistingReadOnlyDb(path);
  try {
    const rows = db.prepare("SELECT source_id AS id, count(*) AS n FROM entities GROUP BY source_id").all() as { id: string; n: number }[];
    const publishable = new Set(Object.values(SOURCES).filter((s) => s.publishable).map((s) => s.id as string));
    const sources: Record<string, number> = {};
    for (const r of rows) sources[r.id] = r.n;
    return { path, sources, unexpected: rows.map((r) => r.id).filter((id) => !publishable.has(id)) };
  } finally {
    db.close();
  }
}
