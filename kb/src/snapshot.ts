import Database from "better-sqlite3";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import type { DB } from "./db.js";
import { validate } from "./validate.js";

export const NOTICE =
  "Data licensed CC BY-SA 4.0. Lore text comes from Warcraft Wiki (warcraft.wiki.gg) via the Internet " +
  "Archive dump of 2023-11-13, used under CC BY-SA 4.0; every row carries its source URL. Blizzard game " +
  "data and Blizzard API responses are not included — rebuild them locally with the kb scripts. " +
  "World of Warcraft is a trademark of Blizzard Entertainment; this project is not affiliated with Blizzard.";

export interface Manifest {
  createdAt: string;
  licence: "CC-BY-SA-4.0";
  notice: string;
  counts: Record<string, number>;
}

/** Writes a copy of the database containing only publishable sources, plus `<out>.manifest.json`. */
export function snapshot(db: DB, outPath: string, now = new Date()): Manifest {
  const problems = validate(db);
  if (problems.length > 0) throw new Error(`validation failed:\n${problems.join("\n")}`);
  if (existsSync(outPath)) rmSync(outPath);
  db.prepare("VACUUM INTO ?").run(outPath);

  const out = new Database(outPath);
  try {
    out.exec(`
      DELETE FROM entities WHERE source_id IN (SELECT id FROM sources WHERE publishable = 0);
      DELETE FROM sources WHERE publishable = 0;
      DELETE FROM api_cache;
      INSERT INTO entities_fts(entities_fts) VALUES ('rebuild');
    `);
    out.exec("VACUUM");
    const counts = Object.fromEntries(
      (out.prepare("SELECT source_id, count(*) AS n FROM entities GROUP BY source_id").all() as { source_id: string; n: number }[]).map(
        (r) => [r.source_id, r.n],
      ),
    );
    const manifest: Manifest = { createdAt: now.toISOString(), licence: "CC-BY-SA-4.0", notice: NOTICE, counts };
    writeFileSync(`${outPath}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } finally {
    out.close();
  }
}
