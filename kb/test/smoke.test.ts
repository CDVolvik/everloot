import Database from "better-sqlite3";
import { expect, test } from "vitest";

test("bundled SQLite has FTS5", () => {
  const db = new Database(":memory:");
  db.exec("CREATE VIRTUAL TABLE t USING fts5(a); INSERT INTO t VALUES ('hello world');");
  const row = db.prepare("SELECT count(*) AS n FROM t WHERE t MATCH 'hello'").get() as { n: number };
  expect(row.n).toBe(1);
});
