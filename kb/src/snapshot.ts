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
 * Case/symlink-insensitive identity for a path whose parent directory exists.
 * Lower-cased on win32/darwin, where the filesystem is case-insensitive.
 */
function pathKey(path: string): string {
  const real = join(realpathSync.native(dirname(path)), basename(path));
  return process.platform === "win32" || process.platform === "darwin" ? real.toLowerCase() : real;
}

/**
 * Removes leftovers from a crashed prior run: `.kb-snapshot-work-*` files (and their
 * -journal/-wal/-shm sidecars) in `workDir`, and `<targetBase>.partial-*` files in `targetDir`.
 * Best-effort — a removal failure here must never block a fresh snapshot.
 */
function sweepStaleFiles(dirs: string[], targetBase: string): void {
  const workPattern = /^\.kb-snapshot-work-\d+\.sqlite(-journal|-wal|-shm)?$/;
  for (const dir of new Set(dirs)) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (workPattern.test(name) || name.startsWith(`${targetBase}.partial-`)) {
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
 * `<target>.partial-<pid>` and renamed into place; the manifest is hashed and (re)written the same
 * way, so a crash leaves either the old published pair intact, nothing, or a verified new pair —
 * never an unfiltered file and never a DB paired with the wrong manifest.
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
    rmSync(manifestPath, { force: true }); // delete the old manifest before the DB is replaced
    copyFileSync(work, targetPartial);
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

/** The full schema (table/view/trigger/index names) a fresh database is expected to have. */
function expectedSchemaEntries(): Set<string> {
  const ref = openDb(":memory:");
  try {
    return new Set(
      (ref.prepare("SELECT type, name FROM sqlite_master").all() as { type: string; name: string }[]).map(
        (r) => `${r.type}:${r.name}`,
      ),
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
      (out.prepare("SELECT type, name FROM sqlite_master").all() as { type: string; name: string }[]).map(
        (r) => `${r.type}:${r.name}`,
      ),
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
    return counts;
  } finally {
    out.close();
  }
}
