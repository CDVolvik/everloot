import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DB } from "./db.js";
import { SOURCES, type SourceId } from "./sources.js";
import { validate } from "./validate.js";

export const PUBLISHED_LICENCE = "CC-BY-SA-4.0";

/** The only tables a snapshot may contain. A table added later must be listed here on purpose. */
const EXPECTED_TABLES = [
  "api_cache",
  "entities",
  "entities_fts",
  "entities_fts_config",
  "entities_fts_data",
  "entities_fts_docsize",
  "entities_fts_idx",
  "sources",
];

export const NOTICE =
  "Data licensed CC BY-SA 4.0. Lore text comes from Warcraft Wiki (warcraft.wiki.gg) via the Internet " +
  "Archive dump of 2023-11-13, used under CC BY-SA 4.0; curated entries are written by the WoWVault project " +
  "under CC BY-SA 4.0. Every row carries its source URL. Blizzard game data and Blizzard API responses are " +
  "not included — rebuild them locally with the kb scripts. World of Warcraft is a trademark of Blizzard " +
  "Entertainment; this project is not affiliated with Blizzard.";

export interface Manifest {
  createdAt: string;
  licence: typeof PUBLISHED_LICENCE;
  notice: string;
  sha256: string;
  counts: Record<string, number>;
}

/** Publishable sources, decided by the code registry — never by the database being exported. */
function publishableIds(): SourceId[] {
  return Object.values(SOURCES).filter((s) => s.publishable).map((s) => s.id);
}

/**
 * Writes a copy of the database holding only publishable sources, plus `<out>.manifest.json`.
 * The copy is built and verified in a temp file and only renamed into place once it is proven clean,
 * so a failure never leaves unfiltered data at `outPath`.
 */
export function snapshot(db: DB, outPath: string, now = new Date()): Manifest {
  const target = resolve(outPath);
  const live = resolve(db.name);
  if (target === live || target.startsWith(`${live}-`)) throw new Error("refusing to write the snapshot over the live database");
  const problems = validate(db);
  if (problems.length > 0) throw new Error(`validation failed:\n${problems.join("\n")}`);

  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.partial-${process.pid}`;
  const cleanup = () => {
    for (const f of [tmp, `${tmp}-journal`, `${tmp}-wal`, `${tmp}-shm`]) rmSync(f, { force: true });
  };
  cleanup();
  try {
    db.prepare("VACUUM INTO ?").run(tmp);
    const keep = publishableIds();
    const marks = keep.map(() => "?").join(", ");
    const out = new Database(tmp);
    try {
      out.prepare(`DELETE FROM entities WHERE source_id NOT IN (${marks})`).run(...keep);
      out.prepare(`DELETE FROM sources WHERE id NOT IN (${marks})`).run(...keep);
      const resync = out.prepare(
        `INSERT INTO sources (id, name, licence, publishable, homepage) VALUES (@id, @name, @licence, 1, @homepage)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, licence = excluded.licence, publishable = 1, homepage = excluded.homepage`,
      );
      for (const id of keep) resync.run(SOURCES[id]);
      out.exec("DELETE FROM api_cache; INSERT INTO entities_fts(entities_fts) VALUES ('rebuild');");
      out.exec("VACUUM"); // required: without it, deleted text survives in free pages of the file
    } finally {
      out.close();
    }
    const counts = verifyOutput(tmp, keep);
    renameSync(tmp, target);
    const manifest: Manifest = {
      createdAt: now.toISOString(),
      licence: PUBLISHED_LICENCE,
      notice: NOTICE,
      sha256: createHash("sha256").update(readFileSync(target)).digest("hex"),
      counts,
    };
    writeFileSync(`${target}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } finally {
    cleanup();
  }
}

/** Reopens the output read-only and proves it holds only publishable data. Returns rows per source. */
function verifyOutput(file: string, keep: SourceId[]): Record<string, number> {
  const out = new Database(file, { readonly: true });
  try {
    const fail = (why: string): never => {
      throw new Error(`snapshot check failed: ${why}`);
    };
    const tables = (out.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map(
      (r) => r.name,
    );
    if (tables.join(",") !== EXPECTED_TABLES.join(",")) fail(`unexpected tables: ${tables.join(", ")}`);
    const counts: Record<string, number> = Object.fromEntries(keep.map((id) => [id, 0]));
    for (const r of out.prepare("SELECT source_id, count(*) AS n FROM entities GROUP BY source_id").all() as { source_id: string; n: number }[]) {
      if (!(keep as string[]).includes(r.source_id)) fail(`non-publishable source ${r.source_id}`);
      counts[r.source_id] = r.n;
    }
    const cache = out.prepare("SELECT count(*) AS n FROM api_cache").get() as { n: number };
    if (cache.n !== 0) fail("api_cache is not empty");
    const badSources = out
      .prepare("SELECT count(*) AS n FROM sources WHERE publishable <> 1 OR licence <> ?")
      .get(PUBLISHED_LICENCE) as { n: number };
    if (badSources.n !== 0) fail("a source in the file is not publishable CC BY-SA 4.0");
    const badRows = out.prepare("SELECT count(*) AS n FROM entities WHERE licence <> ?").get(PUBLISHED_LICENCE) as { n: number };
    if (badRows.n !== 0) fail(`${badRows.n} row(s) not licensed ${PUBLISHED_LICENCE}`);
    const integrity = out.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") fail(`integrity_check: ${String(integrity)}`);
    return counts;
  } finally {
    out.close();
  }
}
