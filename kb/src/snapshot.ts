import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { openDb, type DB } from "./db.js";
import { FACET_KEYS } from "./importers/wiki-classify.js";
import { SOURCES, type SourceId } from "./sources.js";
import { validate } from "./validate.js";

export const PUBLISHED_LICENCE = "CC-BY-SA-4.0";

export const NOTICE =
  "Data licensed CC BY-SA 4.0. Lore text comes from Warcraft Wiki (warcraft.wiki.gg) via the Internet " +
  "Archive dump of 2023-11-13, used under CC BY-SA 4.0; converted from wikitext to plain text, with " +
  "templates, tables and images removed; curated entries are written by the WoWVault project " +
  "under CC BY-SA 4.0. Every row carries its source URL. Blizzard API responses are not included; they stay " +
  "in each user's local cache. World of Warcraft is a trademark of Blizzard " +
  "Entertainment; this project is not affiliated with Blizzard.";

/** One facet value and how many lore pages carry it. */
export interface ManifestFacetCount {
  value: string;
  n: number;
}

/** Build-time facet summaries, so the site never scans 260k rows for a filter list. */
export interface ManifestFacets {
  /** The ten most common values per key across every lore page, most common first. */
  top: Record<string, ManifestFacetCount[]>;
  /** Every distinct value per page type per key, for the browse filters. */
  byType: Record<string, Record<string, string[]>>;
}

export interface Manifest {
  createdAt: string;
  licence: typeof PUBLISHED_LICENCE;
  notice: string;
  sha256: string;
  counts: Record<string, number>;
  /** Rows per `data.type` (`other` when untyped). Absent in releases built before 2026-10-15. */
  types?: Record<string, number>;
  /** Rows whose converted text still shows template damage. Absent in older releases. */
  damaged?: number;
  /** Facet summaries for the lore archive. Absent in releases built before 2026-10-16. */
  facets?: ManifestFacets;
  /** Per page type, the browse letters (a–z, then "#") it has lore pages under. Absent before 2026-10-16. */
  letters?: Record<string, string[]>;
}

/** Schema entries a release may lack: added after the first release shipped, so old files still open. */
const OPTIONAL_SCHEMA_NAMES = new Set(["entities_type_name"]);

/** Publishable sources, decided by the code registry — never by the database being exported. */
function publishableIds(): SourceId[] {
  return Object.values(SOURCES).filter((s) => s.publishable).map((s) => s.id);
}

/**
 * Case/symlink-insensitive identity for a path whose parent directory exists.
 * Lower-cased on win32/darwin, where the filesystem is case-insensitive.
 */
function pathKey(path: string): string {
  const real = join(realpathSync.native(dirname(path)), basename(path));
  return process.platform === "win32" || process.platform === "darwin" ? real.toLowerCase() : real;
}

/** Escapes a string for use as a literal fragment inside a `RegExp` pattern. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes leftovers from a crashed prior run: `.kb-snapshot-work-*` files (and their
 * -journal/-wal/-shm sidecars) in `workDir`, and `<targetBase>.partial-*` /
 * `<targetBase>.manifest.json.partial-*` files in `targetDir`. Patterns are anchored to the
 * digits-only pid suffix so an unrelated file that merely starts with the same prefix — e.g. a
 * user's own `<targetBase>.partial-notes.txt` — is never touched.
 * Best-effort — a removal failure here must never block a fresh snapshot.
 */
function sweepStaleFiles(dirs: string[], targetBase: string): void {
  const escapedBase = escapeRegExp(targetBase);
  const workPattern = /^\.kb-snapshot-work-\d+\.sqlite(-journal|-wal|-shm)?$/;
  const partialPattern = new RegExp(`^${escapedBase}\\.partial-\\d+(-journal|-wal|-shm)?$`);
  const manifestPartialPattern = new RegExp(`^${escapedBase}\\.manifest\\.json\\.partial-\\d+$`);
  for (const dir of new Set(dirs)) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (workPattern.test(name) || partialPattern.test(name) || manifestPartialPattern.test(name)) {
        try {
          rmSync(join(dir, name), { force: true });
        } catch {
          // best-effort: a stale file we can't remove now will be swept by a later run
        }
      }
    }
  }
}

/** Streaming sha256 of a file — avoids readFileSync's ~2 GiB (ERR_FS_FILE_TOO_LARGE) limit. */
export function sha256File(path: string): string {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let bytesRead: number;
    while ((bytesRead = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

/**
 * Writes a copy of the database holding only publishable sources, plus `<out>.manifest.json`.
 *
 * All filtering happens in a work file beside the live database (`.kb-snapshot-work-<pid>.sqlite`,
 * or under the OS temp dir for an in-memory `db`) — never inside the release folder — so a hard
 * kill mid-run cannot leave an unfiltered copy where the published file is expected. Only once
 * `verifyOutput` has proven the work file clean does it get copied into the release folder as
 * `<target>.partial-<pid>`. The old manifest is removed immediately before that partial is renamed
 * into place as `<target>` — the two steps are back-to-back with no other I/O between them — so a
 * crash before them leaves the old published DB and its old manifest intact, and a crash after them
 * leaves the new DB in place with its (already-hashed) manifest write still to follow; the next
 * run's sweep clears any stray `.partial-` leftovers either way. The only residual risk is a crash
 * landing in the instant between the manifest removal and the rename, which at worst leaves a
 * published DB (old or new) briefly without a manifest — never an unfiltered file, and never a DB
 * paired with the wrong manifest.
 */
export function snapshot(db: DB, outPath: string, now = new Date()): Manifest {
  const target = resolve(outPath);
  const targetDir = dirname(target);
  mkdirSync(targetDir, { recursive: true });

  const live = db.memory ? undefined : resolve(db.name);
  if (live !== undefined) {
    const liveKey = pathKey(live);
    const targetKey = pathKey(target);
    if (targetKey === liveKey || targetKey.startsWith(`${liveKey}-`)) {
      throw new Error("refusing to write the snapshot over the live database");
    }
    if (dirname(targetKey) === dirname(liveKey)) {
      throw new Error("refusing to write the snapshot into the live database's folder");
    }
  }

  const workDir = live !== undefined ? dirname(live) : tmpdir();
  sweepStaleFiles([workDir, targetDir], basename(target));

  const problems = validate(db);
  if (problems.length > 0) throw new Error(`validation failed:\n${problems.join("\n")}`);

  const pid = process.pid;
  const work = join(workDir, `.kb-snapshot-work-${pid}.sqlite`);
  const targetPartial = `${target}.partial-${pid}`;
  const manifestPath = `${target}.manifest.json`;
  const manifestPartial = `${manifestPath}.partial-${pid}`;
  const cleanup = () => {
    for (const f of [work, `${work}-journal`, `${work}-wal`, `${work}-shm`, targetPartial, manifestPartial]) {
      try {
        rmSync(f, { force: true });
      } catch {
        // best-effort cleanup only — must never mask the real error from the try block below
      }
    }
  };
  cleanup();
  try {
    db.prepare("VACUUM INTO ?").run(work);
    const keep = publishableIds();
    const marks = keep.map(() => "?").join(", ");
    const out = new Database(work);
    try {
      // ANALYZE/PRAGMA optimize on the live DB creates sqlite_stat*, which can hold sampled
      // index keys from non-publishable rows. Drop before VACUUM; never allowlist them.
      out.exec(
        "DROP TABLE IF EXISTS sqlite_stat1; DROP TABLE IF EXISTS sqlite_stat2; " +
          "DROP TABLE IF EXISTS sqlite_stat3; DROP TABLE IF EXISTS sqlite_stat4;",
      );
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
    const counts = verifyOutput(work);
    const { types, damaged, facets, letters } = releaseSummary(work);
    const sha256 = sha256File(work);
    copyFileSync(work, targetPartial);
    rmSync(manifestPath, { force: true }); // delete the old manifest right before the DB swap below
    renameSync(targetPartial, target);
    const manifest: Manifest = {
      createdAt: now.toISOString(),
      licence: PUBLISHED_LICENCE,
      notice: NOTICE,
      sha256,
      counts,
      types,
      damaged,
      facets,
      letters,
    };
    writeFileSync(manifestPartial, `${JSON.stringify(manifest, null, 2)}\n`);
    renameSync(manifestPartial, manifestPath);
    return manifest;
  } finally {
    cleanup();
  }
}

/** Normalises `sqlite_master.sql` for comparison: collapses whitespace; autoindexes have no sql. */
function normalizeSchemaSql(sql: string | null): string {
  return sql === null ? "" : sql.replace(/\s+/g, " ").trim();
}

/** The full schema (table/view/trigger/index definitions) a fresh database is expected to have. */
function expectedSchemaEntries(): Set<string> {
  const ref = openDb(":memory:");
  try {
    return new Set(
      (
        ref.prepare("SELECT type, name, sql FROM sqlite_master").all() as {
          type: string;
          name: string;
          sql: string | null;
        }[]
      ).map((r) => `${r.type}:${r.name}:${normalizeSchemaSql(r.sql)}`),
    );
  } finally {
    ref.close();
  }
}

/**
 * Proves an open database holds only publishable data and is clean: exact schema, registry
 * source allowlist, empty API cache, published licences, integrity check and no free pages.
 * Returns rows per publishable registry source. It performs no writes on `db`, so it is safe on a
 * read-only handle; the fts5 integrity-check command is deliberately absent because SQLite issues
 * it as an INSERT, and that stays in the exporter's writable phase (`verifyOutput`).
 */
export function checkPublishedDb(db: DB): Record<string, number> {
  const fail = (why: string): never => {
    throw new Error(`snapshot check failed: ${why}`);
  };
  const keep = publishableIds();
  const expected = expectedSchemaEntries();
  const actual = new Set(
    (
      db.prepare("SELECT type, name, sql FROM sqlite_master").all() as {
        type: string;
        name: string;
        sql: string | null;
      }[]
    ).map((r) => `${r.type}:${r.name}:${normalizeSchemaSql(r.sql)}`),
  );
  const optional = (entry: string) => OPTIONAL_SCHEMA_NAMES.has(entry.split(":")[1]);
  const missing = [...expected].filter((e) => !actual.has(e) && !optional(e));
  const extra = [...actual].filter((e) => !expected.has(e));
  if (missing.length > 0 || extra.length > 0) {
    fail(`unexpected schema — missing: ${missing.join(", ") || "(none)"}; extra: ${extra.join(", ") || "(none)"}`);
  }
  const counts: Record<string, number> = Object.fromEntries(keep.map((id) => [id, 0]));
  for (const r of db.prepare("SELECT source_id, count(*) AS n FROM entities GROUP BY source_id").all() as { source_id: string; n: number }[]) {
    if (!(keep as string[]).includes(r.source_id)) fail(`non-publishable source ${r.source_id}`);
    counts[r.source_id] = r.n;
  }
  for (const r of db.prepare("SELECT id FROM sources").all() as { id: string }[]) {
    if (!(keep as string[]).includes(r.id)) fail(`non-publishable source row present: ${r.id}`);
  }
  const cache = db.prepare("SELECT count(*) AS n FROM api_cache").get() as { n: number };
  if (cache.n !== 0) fail("api_cache is not empty");
  const badSources = db
    .prepare("SELECT count(*) AS n FROM sources WHERE publishable <> 1 OR licence <> ?")
    .get(PUBLISHED_LICENCE) as { n: number };
  if (badSources.n !== 0) fail("a source in the file is not publishable CC BY-SA 4.0");
  const badRows = db.prepare("SELECT count(*) AS n FROM entities WHERE licence <> ?").get(PUBLISHED_LICENCE) as { n: number };
  if (badRows.n !== 0) fail(`${badRows.n} row(s) not licensed ${PUBLISHED_LICENCE}`);
  const integrity = db.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") fail(`integrity_check: ${String(integrity)}`);
  const freelistCount = db.pragma("freelist_count", { simple: true }) as number;
  if (freelistCount !== 0) fail(`freelist_count is ${freelistCount} (VACUUM did not reclaim pages)`);
  return counts;
}

/** SQLite's COLLATE NOCASE folds ASCII A–Z only; mirror that for facet value order. */
function byValueNoCase(a: string, b: string): number {
  const fa = a.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const fb = b.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return fa < fb ? -1 : fa > fb ? 1 : 0;
}

/** The browse letters, in the order the site lists them; "#" is every name not starting with a–z. */
export const BROWSE_LETTERS = [..."abcdefghijklmnopqrstuvwxyz", "#"];

/**
 * The finished work file's summary: rows per page type, the damaged-page count, the lore facet
 * summaries (top ten values per key, plus every value per page type) and the browse letters each
 * page type has. Absent in releases built before 2026-10-15/16 for types and the rest respectively.
 */
function releaseSummary(file: string): {
  types?: Record<string, number>;
  damaged?: number;
  facets?: ManifestFacets;
  letters?: Record<string, string[]>;
} {
  const out = new Database(file, { readonly: true });
  try {
    const { n: typed } = out.prepare("SELECT count(*) AS n FROM entities WHERE json_extract(data, '$.type') IS NOT NULL").get() as { n: number };
    if (typed === 0) return {}; // built from an unclassified database: say nothing rather than "all other"
    const types: Record<string, number> = {};
    for (const r of out.prepare("SELECT coalesce(json_extract(data, '$.type'), 'other') AS t, count(*) AS n FROM entities GROUP BY t").all() as { t: string; n: number }[]) {
      types[r.t] = r.n;
    }
    const { n: damaged } = out.prepare("SELECT count(*) AS n FROM entities WHERE json_extract(data, '$.damaged') = 1").get() as { n: number };
    const top: Record<string, ManifestFacetCount[]> = {};
    const byType: Record<string, Record<string, string[]>> = {};
    for (const key of FACET_KEYS) {
      // One scan per key: grouping by page type and value answers both the top list and the per-type lists.
      const rows = out
        .prepare(
          `SELECT coalesce(json_extract(data, '$.type'), 'other') AS t, j.value AS v, count(*) AS n
           FROM entities, json_each(json_extract(data, '$.facets.${key}')) AS j
           GROUP BY t, v`,
        )
        .all() as { t: string; v: string; n: number }[];
      const totals = new Map<string, number>();
      const seen: Record<string, string[]> = {};
      for (const r of rows) {
        totals.set(r.v, (totals.get(r.v) ?? 0) + r.n);
        (seen[r.t] ??= []).push(r.v);
      }
      top[key] = [...totals.entries()]
        .sort((a, b) => b[1] - a[1] || byValueNoCase(a[0], b[0]))
        .slice(0, 10)
        .map(([value, n]) => ({ value, n }));
      for (const [t, values] of Object.entries(seen)) (byType[t] ??= {})[key] = values.sort(byValueNoCase);
    }
    // Every type that has any facet keeps all six keys, so site readers never branch on shape.
    for (const entry of Object.values(byType)) for (const key of FACET_KEYS) entry[key] ??= [];
    // lower() folds ASCII only, like the site's letter filter (LIKE 'x%' and NOT BETWEEN 'a' AND 'z').
    const starts = new Map<string, Set<string>>();
    for (const r of out
      .prepare(
        `SELECT coalesce(json_extract(data, '$.type'), 'other') AS t, lower(substr(name, 1, 1)) AS c
         FROM entities WHERE kind = 'lore_page' GROUP BY t, c`,
      )
      .all() as { t: string; c: string }[]) {
      if (!starts.has(r.t)) starts.set(r.t, new Set());
      starts.get(r.t)!.add(r.c >= "a" && r.c <= "z" ? r.c : "#");
    }
    const letters: Record<string, string[]> = {};
    for (const [t, seen] of starts) letters[t] = BROWSE_LETTERS.filter((l) => seen.has(l));
    return { types, damaged, facets: { top, byType }, letters };
  } finally {
    out.close();
  }
}

/** Reopens the output read-only and proves it holds only publishable data. Returns rows per source. */
function verifyOutput(file: string): Record<string, number> {
  const out = new Database(file, { readonly: true });
  try {
    const counts = checkPublishedDb(out);
    // The fts5 integrity-check command is a write (it's issued as an INSERT), so it needs a
    // writable handle even though the rest of this check runs read-only; open one just for this.
    const writable = new Database(file);
    try {
      writable.prepare("INSERT INTO entities_fts(entities_fts, rank) VALUES ('integrity-check', 1)").run();
    } catch (err) {
      throw new Error(
        `snapshot check failed: entities_fts integrity-check: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      writable.close();
    }
    return counts;
  } finally {
    out.close();
  }
}
