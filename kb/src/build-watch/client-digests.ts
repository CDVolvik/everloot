/**
 * Digests of the client tables the extractor reads: how many rows each table has and a hash of their
 * content, never the rows themselves. `client-digests.json` is committed and overwritten per build, so
 * the build watch can say what a new build changed in the read set without keeping a 357 MB snapshot
 * (see docs/design/specs/2026-10-18-build-changes-read-set-design.md).
 *
 * The hash is the first 12 hex digits of a sha256 over the rows in id order, one line per row:
 * `<id>\t<canonical JSON>`, object keys sorted. `hashVersion` records that rule; changing it invalidates
 * one comparison, not the data. Counts and hashes only, like the tooltip hash in spell-values.json.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { CLIENT_TABLES } from "../client-snapshot.js";
import { BuildStamp, LABEL } from "../talents/catalog.js";
import type { ReadSet } from "./changes.js";

export const DIGEST_SCHEMA = "everloot.client-digests/1";
export const HASH_VERSION = 1;
export const CLIENT_DIGESTS_REL = "web/src/data/game-data/client-digests.json";

const TableDigest = z.object({
  rows: z.number().int().nonnegative(),
  /** First 12 hex digits of a sha256 over the table's rows; independent of row insertion order. */
  hash: z.string().regex(/^[0-9a-f]{12}$/),
});

export const ClientDigests = z.object({
  schema: z.literal(DIGEST_SCHEMA),
  label: z.literal(LABEL),
  /** Version of the hash rule above. */
  hashVersion: z.literal(HASH_VERSION),
  build: BuildStamp,
  /** Every table that was read, empty tables included, sorted by name. */
  tables: z.record(z.string(), TableDigest),
});
export type ClientDigests = z.infer<typeof ClientDigests>;

/** JSON with object keys sorted recursively; bigints as strings, like the snapshot's own JSON. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) as string;
}

export function tableHash(rows: Map<number, Record<string, unknown>>): string {
  const h = createHash("sha256");
  for (const id of [...rows.keys()].sort((a, b) => a - b)) h.update(`${id}\t${canonicalJson(rows.get(id))}\n`);
  return h.digest("hex").slice(0, 12);
}

export interface DigestInput {
  table: string;
  rows: Map<number, Record<string, unknown>>;
}

/** Digests of the rows an extraction produced, one entry per table, sorted by name. */
export function clientDigestsOf(build: BuildStamp, tables: DigestInput[]): ClientDigests {
  const out: Record<string, { rows: number; hash: string }> = {};
  for (const t of [...tables].sort((a, b) => a.table.localeCompare(b.table))) out[t.table] = { rows: t.rows.size, hash: tableHash(t.rows) };
  return ClientDigests.parse({ schema: DIGEST_SCHEMA, label: LABEL, hashVersion: HASH_VERSION, build, tables: out });
}

/** One table per line, so a diff between builds reads table by table. */
export function writeClientDigests(root: string, digests: ClientDigests): string {
  const path = join(root, CLIENT_DIGESTS_REL);
  mkdirSync(dirname(path), { recursive: true });
  const names = Object.keys(digests.tables).sort();
  const lines = names.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(digests.tables[n])}`).join(",\n");
  const { tables: _t, ...head } = digests;
  writeFileSync(path, `${JSON.stringify(head).slice(0, -1)},"tables":{\n${lines}\n}}\n`);
  return path;
}

export function readClientDigests(root: string): ClientDigests | null {
  const path = join(root, CLIENT_DIGESTS_REL);
  return existsSync(path) ? ClientDigests.parse(JSON.parse(readFileSync(path, "utf8"))) : null;
}

const fileDataId = (table: string): number | null => (CLIENT_TABLES as Record<string, number>)[table] ?? null;
const count = (d: ClientDigests) => Object.keys(d.tables).length;
const totalRows = (d: ClientDigests) => Object.values(d.tables).reduce((n, t) => n + t.rows, 0);

export interface ReadSetDiff {
  readSet: ReadSet;
  warnings: string[];
}

/**
 * What changed in the read set between two builds. A table that was read before and is absent from the
 * new build (not in the build, or unreadable) is a warning, not a removal: its disappearance is the
 * build's, not a change of what we read.
 */
export function diffClientDigests(before: ClientDigests, after: ClientDigests, missing: { table: string; reason: string }[] = []): ReadSetDiff {
  const absent = new Map(missing.map((m) => [m.table, m.reason]));
  const names = [...new Set([...Object.keys(before.tables), ...Object.keys(after.tables)])].sort();
  const addedTables: ReadSet["addedTables"] = [];
  const removedTables: ReadSet["removedTables"] = [];
  const changedTables: ReadSet["changedTables"] = [];
  const warnings: string[] = [];
  for (const table of names) {
    const b = before.tables[table];
    const a = after.tables[table];
    if (!b && a) addedTables.push({ table, fileDataID: fileDataId(table), rows: a.rows });
    else if (b && !a) {
      const reason = absent.get(table);
      if (reason) warnings.push(`client table ${table} was read before and is absent from this build (${reason}), so it is not counted as removed`);
      else removedTables.push({ table, fileDataID: fileDataId(table) });
    } else if (b && a && b.hash !== a.hash) changedTables.push({ table, rowsBefore: b.rows, rowsAfter: a.rows, changed: true });
  }
  return {
    readSet: {
      tables: { before: count(before), after: count(after) },
      rows: { before: totalRows(before), after: totalRows(after) },
      addedTables, removedTables, changedTables,
      layoutChanged: before.build.definitions !== after.build.definitions,
    },
    warnings,
  };
}
