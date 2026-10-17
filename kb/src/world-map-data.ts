/**
 * The map data the world map page needs, read out of a client snapshot (`npm run kb -- client-extract`):
 * the continents and zones with their rectangles in world coordinates, and where each dungeon and raid
 * is entered. It is game file data: Blizzard's, stamped with the build, labelled "found in game files,
 * unconfirmed", kept apart from our CC BY-SA data (docs/DATA_POLICY.md). Only the fields the page uses
 * are written. Reads only the snapshot file.
 *
 * Tables, with column names from WoWDBDefs:
 * - UiMap: map id, name, type (2 continent, 3 zone), parent.
 * - UiMapAssignment: where a map lies in the world. `Region` is the two opposite corners in world
 *   yards, (x, y, z) then (x, y, z). World x runs north and y runs west, so the north edge is the larger
 *   x and the west edge the larger y. `UiMin`/`UiMax` say which part of the map the rectangle covers;
 *   only whole-map rectangles (0,0 to 1,1) are used.
 * - Map: the continents, and for each dungeon or raid `CorpseMapID` and `Corpse` (x, y), the spot where a
 *   ghost returns, which is the entrance.
 */
import { z } from "zod";
import { readClientManifest, readClientMeta, readClientRows, readClientTables } from "./client-snapshot.js";

export const WORLD_MAP_SCHEMA = "everloot.world-map/1";
/** Tables this file is built from. */
export const WORLD_MAP_TABLES = ["Map", "UiMap", "UiMapAssignment"] as const;

/**
 * Zones of the original world, as numbered by their UiMap ids (1411 to 1458). Zones with later ids are
 * Forever additions that may not be released yet; they stay out until the spoiler switch the data
 * policy describes exists.
 */
export const ORIGINAL_ZONE_UI_MAP_IDS = { min: 1411, max: 1458 } as const;

const Rect = z.object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() });
const ZoneRow = z.object({ uiMapId: z.number().int(), name: z.string(), continentId: z.number().int(), bounds: Rect });
export const WorldMapData = z.object({
  schema: z.literal(WORLD_MAP_SCHEMA),
  source: z.object({
    name: z.string(),
    status: z.literal("found in game files, unconfirmed"),
    licence: z.string(),
    licenceUrl: z.string(),
    product: z.string(),
    buildId: z.number().int(),
    version: z.string(),
    buildConfig: z.string(),
    definitions: z.string().nullable(),
    extractedAt: z.string(),
    tables: z.array(z.object({ table: z.string(), rows: z.number().int(), encryptedBlocks: z.number().int().nullable() })),
  }),
  continents: z.array(z.object({ id: z.number().int(), name: z.string(), bounds: Rect })),
  zones: z.array(ZoneRow),
  /** Zones with later UiMap ids: Forever additions that may be unreleased. Shown only when the reader turns spoilers on. */
  heldBackZones: z.array(ZoneRow).default([]),
  entrances: z.array(z.object({
    mapId: z.number().int(), name: z.string(), raid: z.boolean(), continentId: z.number().int(), worldX: z.number(), worldY: z.number(),
  })),
  warnings: z.array(z.string()),
});
export type WorldMapData = z.infer<typeof WorldMapData>;
export type WorldRect = z.infer<typeof Rect>;

const UI_MAP_CONTINENT = 2;
const UI_MAP_ZONE = 3;
const WORLD_UI_MAP = 947;
const round = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pair = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length >= 2 && num(v[0]) !== null && num(v[1]) !== null ? [v[0] as number, v[1] as number] : null;

/** A UiMapAssignment's rectangle in the page's terms, or null when it is not a whole-map rectangle. */
export function assignmentRect(row: Record<string, unknown>): WorldRect | null {
  const min = pair(row.UiMin), max = pair(row.UiMax);
  const region = Array.isArray(row.Region) ? row.Region.map(num) : [];
  if (!min || !max || region.length < 6 || region.some((n) => n === null)) return null;
  if (min[0] !== 0 || min[1] !== 0 || max[0] !== 1 || max[1] !== 1) return null;
  const [x0, y0, , x1, y1] = region as number[];
  const rect = { top: Math.max(x0, x1), bottom: Math.min(x0, x1), left: Math.max(y0, y1), right: Math.min(y0, y1) };
  return rect.top > rect.bottom && rect.left > rect.right ? { left: round(rect.left), top: round(rect.top), right: round(rect.right), bottom: round(rect.bottom) } : null;
}

type Rows = Map<number, Record<string, unknown>>;

export function buildWorldMapData(
  get: (table: string) => Rows | undefined,
  source: WorldMapData["source"],
): WorldMapData {
  const warnings: string[] = [];
  const need = (table: string): Rows => {
    const rows = get(table);
    if (!rows) throw new Error(`the snapshot has no ${table} table; run client-extract first`);
    return rows;
  };
  const maps = need("Map"), uiMaps = need("UiMap"), assignments = [...need("UiMapAssignment").values()];

  // The first whole-map assignment of each UiMap (lowest OrderIndex) gives its continent and rectangle.
  const placed = new Map<number, { mapId: number; rect: WorldRect }>();
  for (const a of [...assignments].sort((p, q) => Number(p.OrderIndex) - Number(q.OrderIndex))) {
    const uiMapId = num(a.UiMapID), mapId = num(a.MapID), rect = assignmentRect(a);
    if (uiMapId !== null && mapId !== null && rect && !placed.has(uiMapId)) placed.set(uiMapId, { mapId, rect });
  }

  const continents: WorldMapData["continents"] = [];
  for (const u of uiMaps.values()) {
    const at = placed.get(Number(u.ID));
    if (u.Type !== UI_MAP_CONTINENT || Number(u.ParentUiMapID) !== WORLD_UI_MAP || !at) continue;
    const name = maps.get(at.mapId)?.MapName_lang;
    continents.push({ id: at.mapId, name: typeof name === "string" ? name : String(u.Name_lang), bounds: at.rect });
  }
  continents.sort((a, b) => a.id - b.id);
  const continentIds = new Set(continents.map((c) => c.id));
  if (!continents.length) warnings.push("no continents found");

  const zones: WorldMapData["zones"] = [];
  const heldBackZones: WorldMapData["zones"] = [];
  for (const u of uiMaps.values()) {
    const id = Number(u.ID), at = placed.get(id);
    if (u.Type !== UI_MAP_ZONE || !at || !continentIds.has(at.mapId) || typeof u.Name_lang !== "string") continue;
    const row = { uiMapId: id, name: u.Name_lang, continentId: at.mapId, bounds: at.rect };
    if (id < ORIGINAL_ZONE_UI_MAP_IDS.min || id > ORIGINAL_ZONE_UI_MAP_IDS.max) heldBackZones.push(row);
    else zones.push(row);
  }
  zones.sort((a, b) => a.uiMapId - b.uiMapId);
  heldBackZones.sort((a, b) => a.uiMapId - b.uiMapId);
  if (heldBackZones.length) warnings.push(`${heldBackZones.length} zone(s) with later UiMap ids are held back as possibly unreleased`);

  const entrances: WorldMapData["entrances"] = [];
  for (const m of maps.values()) {
    const kind = m.InstanceType, at = pair(m.Corpse), name = m.MapName_lang;
    if ((kind !== 1 && kind !== 2) || !at || typeof name !== "string" || /^<unused>/i.test(name.trim())) continue;
    if (!continentIds.has(Number(m.CorpseMapID)) || (at[0] === 0 && at[1] === 0)) continue;
    entrances.push({ mapId: Number(m.ID), name, raid: kind === 2, continentId: Number(m.CorpseMapID), worldX: round(at[0]), worldY: round(at[1]) });
  }
  entrances.sort((a, b) => a.mapId - b.mapId);

  return WorldMapData.parse({ schema: WORLD_MAP_SCHEMA, source, continents, zones, heldBackZones, entrances, warnings });
}

export function writeWorldMapData(snapshotPath: string): WorldMapData {
  const meta = readClientMeta(snapshotPath);
  const present = new Set(readClientTables(snapshotPath));
  const manifest = new Map((readClientManifest(snapshotPath)?.tables ?? []).map((t) => [t.table, t]));
  const cache = new Map<string, Rows>();
  const get = (table: string) => {
    if (!present.has(table)) return undefined;
    if (!cache.has(table)) cache.set(table, readClientRows(snapshotPath, table));
    return cache.get(table);
  };
  return buildWorldMapData(get, {
    name: "Everloot client extract",
    status: "found in game files, unconfirmed",
    licence: "Blizzard game data, not under our licence",
    licenceUrl: "https://github.com/CDVolvik/everloot/blob/main/docs/DATA_POLICY.md",
    product: meta.product, buildId: meta.buildId, version: meta.version, buildConfig: meta.buildConfig,
    definitions: meta.definitions, extractedAt: meta.extractedAt,
    tables: WORLD_MAP_TABLES.filter((t) => present.has(t)).map((table) => ({
      table, rows: get(table)!.size, encryptedBlocks: manifest.get(table)?.encryptedBlocks ?? null,
    })),
  });
}
