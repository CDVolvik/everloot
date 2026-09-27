import type { DB } from "./db.js";

type Row = { source_id: string; kind: string; ext_id: string };

/** Returns a list of problems; empty means every row carries valid provenance. */
export function validate(db: DB): string[] {
  const problems: string[] = [];
  const ref = (r: Row) => `${r.source_id}/${r.kind}/${r.ext_id}`;

  for (const r of db
    .prepare("SELECT source_id, kind, ext_id FROM entities WHERE source_url NOT LIKE 'https://%' LIMIT 50")
    .all() as Row[]) {
    problems.push(`bad source_url: ${ref(r)}`);
  }
  for (const r of db
    .prepare(
      "SELECT source_id, kind, ext_id FROM entities WHERE retrieved_at NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]*' LIMIT 50",
    )
    .all() as Row[]) {
    problems.push(`bad retrieved_at: ${ref(r)}`);
  }
  for (const r of db
    .prepare(
      `SELECT e.source_id, s.licence, count(*) AS n FROM entities e JOIN sources s ON s.id = e.source_id
       WHERE e.licence <> s.licence GROUP BY e.source_id, s.licence`,
    )
    .all() as { source_id: string; licence: string; n: number }[]) {
    problems.push(`licence mismatch: ${r.source_id} has ${r.n} row(s) not licensed ${r.licence}`);
  }
  try {
    db.exec("INSERT INTO entities_fts(entities_fts) VALUES ('integrity-check')");
  } catch (e) {
    problems.push(`search index out of sync: ${(e as Error).message}`);
  }
  return problems;
}
