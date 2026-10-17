import { existsSync, readFileSync, statSync } from "node:fs";
import { openExistingReadOnlyDb, type DB } from "./db.js";
import {
  checkPublishedDb,
  NOTICE,
  BROWSE_LETTERS,
  PUBLISHED_LICENCE,
  sha256File,
  type Manifest,
  type ManifestFacets,
} from "./snapshot.js";
import { SOURCES } from "./sources.js";

/**
 * Serving a public knowledge release is a separate decision from producing one. The exporter's
 * job is to write an artifact; this module's job is to refuse anything that is not that exact
 * artifact — no manifest, a manifest that does not match this build's notice or the file's bytes,
 * a leftover sidecar, a tampered database, or a source the registry does not publish. It opens the
 * file read-only and never repairs it. The caller owns the returned handle and must close it.
 */

export interface PublicSnapshot {
  db: DB;
  manifest: Manifest;
}

/** Sidecars a live writer leaves behind. A release must be inactive before it is served. */
const SIDECARS = ["-wal", "-shm", "-journal"] as const;

function publishableIds(): string[] {
  return Object.values(SOURCES).filter((s) => s.publishable).map((s) => s.id);
}

/** True when `v` is a plain object: not null, not an array. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Shape-check a manifest's optional facet summaries. */
function facetsLookValid(f: unknown): f is ManifestFacets {
  if (!isObject(f) || !isObject(f.top) || !isObject(f.byType)) return false;
  for (const entries of Object.values(f.top)) {
    if (!Array.isArray(entries)) return false;
    for (const e of entries) {
      if (!isObject(e) || typeof e.value !== "string" || typeof e.n !== "number" || !Number.isInteger(e.n) || e.n < 0) {
        return false;
      }
    }
  }
  for (const keys of Object.values(f.byType)) {
    if (!isObject(keys)) return false;
    for (const values of Object.values(keys)) {
      if (!Array.isArray(values) || values.some((v) => typeof v !== "string")) return false;
    }
  }
  return true;
}

/** Shape-check a manifest's optional browse letters: each type maps to letters from BROWSE_LETTERS. */
function lettersLookValid(l: unknown): l is Record<string, string[]> {
  if (!isObject(l)) return false;
  return Object.values(l).every((v) => Array.isArray(v) && v.every((c) => typeof c === "string" && BROWSE_LETTERS.includes(c)));
}

/** Read and shape-check the manifest that must sit beside every public release. */
function readManifest(dbPath: string): Manifest {
  const manifestPath = `${dbPath}.manifest.json`;
  if (!existsSync(manifestPath)) throw new Error(`public snapshot has no manifest: ${manifestPath}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    throw new Error(`public snapshot manifest is not valid JSON: ${manifestPath}`);
  }
  if (typeof raw !== "object" || raw === null) throw new Error(`public snapshot manifest is not an object: ${manifestPath}`);
  const m = raw as Record<string, unknown>;
  if (m.licence !== PUBLISHED_LICENCE) {
    throw new Error(`public snapshot manifest licence is ${String(m.licence)}, expected ${PUBLISHED_LICENCE}`);
  }
  if (m.notice !== NOTICE) {
    throw new Error("public snapshot manifest notice does not match this build's publication notice");
  }
  if (typeof m.createdAt !== "string" || m.createdAt.length === 0) {
    throw new Error("public snapshot manifest has no createdAt");
  }
  if (typeof m.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(m.sha256)) {
    throw new Error("public snapshot manifest has no usable sha256");
  }
  if (typeof m.counts !== "object" || m.counts === null) {
    throw new Error("public snapshot manifest has no counts");
  }
  if (m.types !== undefined) {
    if (typeof m.types !== "object" || m.types === null || Object.values(m.types).some((n) => typeof n !== "number" || !Number.isInteger(n) || n < 0)) {
      throw new Error("public snapshot manifest types must map each type to a row count");
    }
  }
  if (m.damaged !== undefined && (typeof m.damaged !== "number" || !Number.isInteger(m.damaged) || m.damaged < 0)) {
    throw new Error("public snapshot manifest damaged must be a non-negative row count");
  }
  if (m.types !== undefined && m.facets === undefined) {
    throw new Error("public snapshot manifest has types but no facet totals");
  }
  if (m.facets !== undefined && !facetsLookValid(m.facets)) {
    throw new Error("public snapshot manifest facets must map each top value to its count and each type to value lists");
  }
  if (m.types !== undefined && m.letters === undefined) {
    throw new Error("public snapshot manifest has types but no browse letters");
  }
  if (m.letters !== undefined && !lettersLookValid(m.letters)) {
    throw new Error("public snapshot manifest letters must map each type to browse letters (a-z or #)");
  }
  const allowed = publishableIds();
  if (Object.keys(m.counts).length !== allowed.length || allowed.some((id) => !Object.hasOwn(m.counts as object, id))) {
    throw new Error("public snapshot manifest counts must name every publishable source exactly once");
  }
  for (const [id, n] of Object.entries(m.counts as Record<string, unknown>)) {
    if (!allowed.includes(id)) throw new Error(`public snapshot manifest counts name a non-publishable source: ${id}`);
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      throw new Error(`public snapshot manifest count for ${id} is not a row count`);
    }
  }
  return m as unknown as Manifest;
}

/**
 * Open an approved public release for serving. Every check runs before the caller can answer a
 * question; any failure closes whatever was opened and throws.
 */
export function openPublicSnapshot(dbPath: string): PublicSnapshot {
  const target = dbPath.trim();
  if (!target) throw new Error("public snapshot path is blank: pass an explicit --db path");
  if (!existsSync(target)) throw new Error(`public snapshot not found: ${target}`);

  for (const suffix of SIDECARS) {
    const sidecar = `${target}${suffix}`;
    if (existsSync(sidecar) && statSync(sidecar).size > 0) {
      throw new Error(`public snapshot has an active ${suffix} sidecar: ${sidecar} (the release must be inactive)`);
    }
  }

  const manifest = readManifest(target);
  const actual = sha256File(target);
  if (actual !== manifest.sha256) {
    throw new Error(`public snapshot manifest hash does not match the file: ${actual} != ${manifest.sha256}`);
  }

  const db = openExistingReadOnlyDb(target);
  try {
    const counts = checkPublishedDb(db);
    for (const [id, n] of Object.entries(manifest.counts)) {
      if (counts[id] !== n) {
        throw new Error(`public snapshot manifest count for ${id} is ${n}, database holds ${counts[id]}`);
      }
    }
    const rows = Object.values(counts).reduce((a, b) => a + b, 0);
    if (rows === 0) throw new Error("public snapshot has no entities: refusing to serve an empty knowledge base");
    return { db, manifest };
  } catch (err) {
    db.close();
    throw err;
  }
}
