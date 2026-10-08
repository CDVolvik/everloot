import { existsSync, readFileSync, statSync } from "node:fs";
import { openExistingReadOnlyDb, type DB } from "./db.js";
import {
  checkPublishedDb,
  NOTICE,
  PUBLISHED_LICENCE,
  sha256File,
  type Manifest,
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
