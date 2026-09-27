import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { DB } from "../db.js";
import { ALL_GAME_VERSIONS, ALL_KINDS, replaceSourceRows, type EntityInput, type GameVersion, type Kind } from "../entities.js";

const REQUIRED = ["kind", "id", "name", "game_version", "body", "source_url", "retrieved_at"] as const;

function isMissing(value: unknown): boolean {
  return value === undefined || String(value).trim() === "";
}

/**
 * Reads every `*.yaml` in `dir`. Each file is a list of entries written in our own words; `source_url`
 * points at the evidence. Replaces all curated rows.
 */
export async function importCurated(db: DB, dir: string): Promise<number> {
  const rows: EntityInput[] = [];
  const seen = new Map<string, string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()) {
    const entries = parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>[] | null;
    if (entries !== null && !Array.isArray(entries)) {
      throw new Error(`${file}: top level must be a list of entries`);
    }
    (entries ?? []).forEach((e, i) => {
      for (const field of REQUIRED) {
        if (isMissing(e[field])) throw new Error(`${file}: entry ${i + 1} is missing ${field}`);
      }
      const kind = e.kind as string;
      if (!ALL_KINDS.includes(kind as Kind)) {
        throw new Error(`${file}: entry ${i + 1} has kind "${kind}"; expected one of: ${ALL_KINDS.join(", ")}`);
      }
      const gameVersion = e.game_version as string;
      if (!ALL_GAME_VERSIONS.includes(gameVersion as GameVersion)) {
        throw new Error(
          `${file}: entry ${i + 1} has game_version "${gameVersion}"; expected one of: ${ALL_GAME_VERSIONS.join(", ")}`,
        );
      }
      const extId = String(e.id);
      const key = `${kind}\u0000${extId}`;
      const firstFile = seen.get(key);
      if (firstFile !== undefined) {
        throw new Error(`${file}: entry ${i + 1} duplicates ${kind} id "${extId}" (first defined in ${firstFile})`);
      }
      seen.set(key, file);
      rows.push({
        kind: kind as Kind,
        extId,
        name: String(e.name).trim(),
        body: String(e.body).trim(),
        gameVersion: gameVersion as GameVersion,
        sourceUrl: String(e.source_url),
        retrievedAt: String(e.retrieved_at),
      });
    });
  }
  return replaceSourceRows(db, "curated", ALL_KINDS, rows);
}
