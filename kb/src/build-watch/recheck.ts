/**
 * Recheck scopes from a new build (coverage and plateau design, section 5): the facts a patch may have changed, written
 * to `kb/curated/recheck.json` so the coverage score counts only reports made after the build was seen. The build
 * watch adds the map changes its changelog entry lists: a zone whose bounds changed or that left the files puts its
 * pins and entrances to recheck, and a moved or removed entrance its own entrance. A changed client table needs the
 * row-level answer, which only two local snapshots give (`client-diff`): `scopesFromClientDiff` reads that diff.
 * Maintainers add scopes for blue posts by hand, with the post's url and date.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { RECHECK_SCHEMA, RecheckFile, type RecheckScope } from "../coverage.js";
import type { ChangeEntry } from "./changes.js";
import type { ClientDiff } from "../client-diff.js";

export const RECHECK_FILE = "kb/curated/recheck.json";

/** Scopes for the zones and entrances a build changed. An added zone or entrance has nothing to recheck. */
export function scopesFromEntry(entry: Pick<ChangeEntry, "id" | "detectedAt" | "mapChanges">): RecheckScope[] {
  const source = `build-watch ${entry.id}`;
  const since = new Date(entry.detectedAt).toISOString();
  const changed = (entry.mapChanges ?? []).filter((c) => c.change !== "added");
  const zones = [...new Set(changed.filter((c) => c.kind === "zone").map((c) => c.id))].sort((a, b) => a - b);
  const entrances = [...new Set(changed.filter((c) => c.kind === "entrance").map((c) => c.id))].sort((a, b) => a - b);
  return [
    ...(zones.length ? [{ since, source, type: "pins" as const, zones }, { since, source, type: "entrances" as const, zones }] : []),
    ...(entrances.length ? [{ since, source, type: "entrances" as const, ids: entrances }] : []),
  ];
}

/** Row-level scopes from `client-diff`: a changed or removed `QuestV2` row puts that quest to recheck, a changed `UiMap` row the pins on that map. */
export function scopesFromClientDiff(diff: Pick<ClientDiff, "tables">, opts: { since: string; source: string }): RecheckScope[] {
  const touched = (table: string) => {
    const t = diff.tables.find((x) => x.table === table);
    return t ? [...new Set([...t.changed.map((c) => c.id), ...t.removed])].filter((id) => Number.isInteger(id) && id > 0).sort((a, b) => a - b) : [];
  };
  const since = new Date(opts.since).toISOString();
  const quests = touched("QuestV2"), maps = touched("UiMap");
  return [
    ...(quests.length ? [{ since, source: opts.source, type: "quests" as const, ids: quests }] : []),
    ...(maps.length ? [{ since, source: opts.source, type: "pins" as const, zones: maps }] : []),
  ];
}

export function readRecheck(root: string): RecheckFile {
  const path = join(root, RECHECK_FILE);
  if (!existsSync(path)) return { schema: RECHECK_SCHEMA, scopes: [] };
  return RecheckFile.parse(JSON.parse(readFileSync(path, "utf8")));
}

const scopeKey = (s: RecheckScope) => JSON.stringify([s.source, s.type ?? null, s.zones ?? null, s.ids ?? null]);

/**
 * Adds scopes to the file read from `from` and writes it under `to` (the same tree, or a dry run's scratch tree). A
 * scope already there (same source, type, zones and ids) is not added twice, so a rerun changes nothing. Returns
 * whether the file changed.
 */
export function addRecheckScopes(from: string, to: string, scopes: readonly RecheckScope[]): boolean {
  const file = readRecheck(from);
  const known = new Set(file.scopes.map(scopeKey));
  const fresh = scopes.filter((s) => !known.has(scopeKey(s)));
  if (!fresh.length && from === to) return false;
  const next = RecheckFile.parse({ schema: RECHECK_SCHEMA, scopes: [...file.scopes, ...fresh] });
  const path = join(to, RECHECK_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return fresh.length > 0;
}
