import type { DB } from "./db.js";

type Row = { source_id: string; kind: string; ext_id: string };

const ref = (r: Row) => `${r.source_id}/${r.kind}/${r.ext_id}`;

/**
 * Runs a per-row provenance check (rows matching `whereSql`) and pushes up to 50
 * `bad <label>: <ref>` lines. If there are more than 50 matching rows, pushes one
 * extra `bad <label>: … and <n> more` line so truncation isn't silent.
 */
function checkRows(db: DB, problems: string[], label: string, whereSql: string): void {
  const rows = db.prepare(`SELECT source_id, kind, ext_id FROM entities WHERE ${whereSql} LIMIT 50`).all() as Row[];
  for (const r of rows) problems.push(`bad ${label}: ${ref(r)}`);
  if (rows.length === 50) {
    const { n } = db.prepare(`SELECT count(*) AS n FROM entities WHERE ${whereSql}`).get() as { n: number };
    if (n > 50) problems.push(`bad ${label}: … and ${n - 50} more`);
  }
}

/** Returns a list of problems; empty means every row carries valid provenance. */
export function validate(db: DB): string[] {
  const problems: string[] = [];

  checkRows(db, problems, "source_url", "source_url NOT LIKE 'https://_%'");
  // Shape check only (YYYY-MM-DD...) — does not verify the date is a real calendar date.
  checkRows(db, problems, "retrieved_at", "retrieved_at NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]*'");
  checkRows(db, problems, "name", "trim(name) = ''");

  for (const r of db
    .prepare(
      `SELECT e.source_id, s.licence, count(*) AS n FROM entities e JOIN sources s ON s.id = e.source_id
       WHERE e.licence <> s.licence GROUP BY e.source_id, s.licence`,
    )
    .all() as { source_id: string; licence: string; n: number }[]) {
    problems.push(`licence mismatch: ${r.source_id} has ${r.n} row(s) not licensed ${r.licence}`);
  }
  for (const r of db
    .prepare(
      `SELECT e.source_id, count(*) AS n FROM entities e LEFT JOIN sources s ON s.id = e.source_id
       WHERE s.id IS NULL GROUP BY e.source_id`,
    )
    .all() as { source_id: string; n: number }[]) {
    problems.push(`unknown source: ${r.source_id} has ${r.n} row(s)`);
  }
  try {
    db.exec("INSERT INTO entities_fts(entities_fts, rank) VALUES ('integrity-check', 1)");
  } catch (e) {
    problems.push(`search index out of sync: ${(e as Error).message}`);
  }
  return problems;
}
