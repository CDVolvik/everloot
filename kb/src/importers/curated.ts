import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { DB } from "../db.js";
import { ALL_KINDS, replaceSourceRows, type EntityInput, type GameVersion, type Kind } from "../entities.js";

const REQUIRED = ["kind", "id", "name", "game_version", "body", "source_url", "retrieved_at"] as const;

/**
 * Reads every `*.yaml` in `dir`. Each file is a list of entries written in our own words; `source_url`
 * points at the evidence. Replaces all curated rows.
 */
export async function importCurated(db: DB, dir: string): Promise<number> {
  const rows: EntityInput[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()) {
    const entries = parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>[] | null;
    (entries ?? []).forEach((e, i) => {
      for (const field of REQUIRED) {
        if (e[field] === undefined || e[field] === "") throw new Error(`${file}: entry ${i + 1} is missing ${field}`);
      }
      rows.push({
        kind: e.kind as Kind,
        extId: String(e.id),
        name: String(e.name),
        body: String(e.body),
        gameVersion: e.game_version as GameVersion,
        sourceUrl: String(e.source_url),
        retrievedAt: String(e.retrieved_at),
      });
    });
  }
  return replaceSourceRows(db, "curated", ALL_KINDS, rows);
}
