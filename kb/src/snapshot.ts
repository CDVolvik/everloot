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
function sha256File(path: string): string {
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
    const counts = verifyOutput(work, keep);
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

/** Reopens the output read-only and proves it holds only publishable data. Returns rows per source. */
function verifyOutput(file: string, keep: SourceId[]): Record<string, number> {
  const out = new Database(file, { readonly: true });
  try {
    const fail = (why: string): never => {
      throw new Error(`snapshot check failed: ${why}`);
    };
    const expected = expectedSchemaEntries();
    const actual = new Set(
      (
        out.prepare("SELECT type, name, sql FROM sqlite_master").all() as {
          type: string;
          name: string;
          sql: string | null;
        }[]
      ).map((r) => `${r.type}:${r.name}:${normalizeSchemaSql(r.sql)}`),
    );
    const missing = [...expected].filter((e) => !actual.has(e));
    const extra = [...actual].filter((e) => !expected.has(e));
    if (missing.length > 0 || extra.length > 0) {
      fail(`unexpected schema — missing: ${missing.join(", ") || "(none)"}; extra: ${extra.join(", ") || "(none)"}`);
    }
    const counts: Record<string, number> = Object.fromEntries(keep.map((id) => [id, 0]));
    for (const r of out.prepare("SELECT source_id, count(*) AS n FROM entities GROUP BY source_id").all() as { source_id: string; n: number }[]) {
      if (!(keep as string[]).includes(r.source_id)) fail(`non-publishable source ${r.source_id}`);
      counts[r.source_id] = r.n;
    }
    for (const r of out.prepare("SELECT id FROM sources").all() as { id: string }[]) {
      if (!(keep as string[]).includes(r.id)) fail(`non-publishable source row present: ${r.id}`);
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
    const freelistCount = out.pragma("freelist_count", { simple: true }) as number;
    if (freelistCount !== 0) fail(`freelist_count is ${freelistCount} (VACUUM did not reclaim pages)`);
    // The fts5 integrity-check command is a write (it's issued as an INSERT), so it needs a
    // writable handle even though the rest of this check runs read-only; open one just for this.
    const writable = new Database(file);
    try {
      writable.prepare("INSERT INTO entities_fts(entities_fts, rank) VALUES ('integrity-check', 1)").run();
    } catch (err) {
      fail(`entities_fts integrity-check: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      writable.close();
    }
    return counts;
  } finally {
    out.close();
  }
}
