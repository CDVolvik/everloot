import type { DB } from "./db.js";
import { SOURCES, type SourceId } from "./sources.js";

export type Kind = "item" | "npc" | "quest" | "zone" | "spell" | "lore_page" | "creator" | "realm";
export type GameVersion = "forever" | "classic" | "retail" | "lore";

export const ALL_KINDS: Kind[] = ["item", "npc", "quest", "zone", "spell", "lore_page", "creator", "realm"];

export interface EntityInput {
  kind: Kind;
  extId: string;
  name: string;
  body?: string;
  data?: Record<string, unknown>;
  gameVersion: GameVersion;
  sourceUrl: string;
  retrievedAt: string;
}

/**
 * Atomically replaces every row of `sourceId` whose kind is in `kinds` with `rows`.
 * On any error the previous rows are kept.
 */
export async function replaceSourceRows(
  db: DB,
  sourceId: SourceId,
  kinds: Kind[],
  rows: Iterable<EntityInput> | AsyncIterable<EntityInput>,
): Promise<number> {
  const licence = SOURCES[sourceId].licence;
  const del = db.prepare("DELETE FROM entities WHERE source_id = ? AND kind = ?");
  const ins = db.prepare(
    `INSERT INTO entities (kind, ext_id, name, body, data, game_version, source_id, source_url, licence, retrieved_at)
     VALUES (@kind, @extId, @name, @body, @data, @gameVersion, @sourceId, @sourceUrl, @licence, @retrievedAt)`,
  );
  db.exec("BEGIN");
  try {
    for (const k of kinds) del.run(sourceId, k);
    let n = 0;
    for await (const r of rows) {
      if (!kinds.includes(r.kind)) throw new Error(`row kind ${r.kind} is not one of: ${kinds.join(", ")}`);
      ins.run({ ...r, body: r.body ?? "", data: JSON.stringify(r.data ?? {}), sourceId, licence });
      n++;
    }
    db.exec("COMMIT");
    return n;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
