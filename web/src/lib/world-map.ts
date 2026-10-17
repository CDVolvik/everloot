import mapJson from "@/data/game-data/map.json";
import { rollupMapBounds, type MapBoundsRow } from "../../../kb/src/map-bounds";
import { checkReportedBounds, placeEntrances, worldToMap, zoneTable, type BoundsCheck, type EntrancePin } from "../../../kb/src/world-coords";
import { WorldMapData } from "../../../kb/src/world-map-data";
import { observedPins } from "../../../kb/src/world-map-near";
import { PUBLIC_RECORD_KINDS } from "./intake";
import { mapHref, type MapPin } from "./map-view";
import { worldFactsFromRecords, type WorldFacts } from "../../../kb/src/world-pages";

export const CONTINENTS = [
  { id: 0, name: "Eastern Kingdoms" },
  { id: 1, name: "Kalimdor" },
] as const;

export interface ZoneShape { mapId: number; name: string; x: number; y: number; width: number; height: number; heldBack: boolean }
export interface ContinentMap {
  continentId: number;
  name: string;
  /** SVG viewBox in yards on the stitched map (x east, y south): the continent's rectangle, trimmed to what is placed. */
  viewBox: { x: number; y: number; width: number; height: number } | null;
  zones: ZoneShape[];
  entrances: EntrancePin[];
  /** Zones where 3 agreeing installs report corners that differ from the game files. */
  disagreements: BoundsCheck[];
  /** How many zones 3 installs have confirmed within a yard. */
  confirmedZones: number;
}

/** Validated once at load: a bad file fails the build, not a visitor's page. */
export const WORLD_MAP: WorldMapData = WorldMapData.parse(mapJson);

/** One continent's map from the game-file data. In-game reports only add the cross-check; no install ids reach the result. */
export function continentMap(continentId: number, boundsRows: MapBoundsRow[], data: WorldMapData = WORLD_MAP, spoilers = false): ContinentMap {
  const held = new Set(data.heldBackZones.map((z) => z.uiMapId));
  // Held-back zones are left out of the data altogether unless spoilers are on.
  const zones = zoneTable({ zones: spoilers ? [...data.zones, ...data.heldBackZones] : data.zones });
  const shapes: ZoneShape[] = zones
    .filter((z) => z.continentId === continentId)
    .map((z) => {
      const a = worldToMap({ continentId, worldX: z.bounds.top, worldY: z.bounds.left });
      const c = worldToMap({ continentId, worldX: z.bounds.bottom, worldY: z.bounds.right });
      return { mapId: z.mapId, name: z.name, x: a.x, y: a.y, width: c.x - a.x, height: c.y - a.y, heldBack: held.has(z.mapId) };
    });
  const entrances = placeEntrances(data).filter((p) => p.world.continentId === continentId);

  // The frame is fixed by the released zones, so turning spoilers on adds shapes without moving the map.
  const placed = shapes.filter((s) => !s.heldBack);
  const xs = [...placed.flatMap((s) => [s.x, s.x + s.width]), ...entrances.map((p) => p.map.x)];
  const ys = [...placed.flatMap((s) => [s.y, s.y + s.height]), ...entrances.map((p) => p.map.y)];
  let viewBox: ContinentMap["viewBox"] = null;
  if (xs.length) {
    const pad = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.04;
    viewBox = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + 2 * pad, height: Math.max(...ys) - Math.min(...ys) + 2 * pad };
  }

  const checks = checkReportedBounds(zones, rollupMapBounds(boundsRows)).filter((c) => zones.find((z) => z.mapId === c.mapId)?.continentId === continentId);
  return {
    continentId,
    name: data.continents.find((c) => c.id === continentId)?.name ?? CONTINENTS.find((c) => c.id === continentId)?.name ?? `Continent ${continentId}`,
    viewBox, zones: shapes, entrances,
    disagreements: checks.filter((c) => c.result === "differs"),
    confirmedZones: checks.filter((c) => c.result === "agrees").length,
  };
}

export const MAP_SOURCE = WORLD_MAP.source;

/**
 * Player-observed NPC and vendor points on one continent, after the 3-install rule (kb/src/world-map-near.ts).
 * Pins in held-back zones are returned only when spoilers are on.
 */
export function continentPins(
  continentId: number, facts: Parameters<typeof observedPins>[0], spoilers = false, data: WorldMapData = WORLD_MAP,
): MapPin[] {
  return observedPins(facts, data)
    .filter((p) => p.world.continentId === continentId && (spoilers || !p.spoiler))
    .map((p) => ({
      id: `${p.kind}-${p.npcId}-${p.mapId}`, kind: p.kind, npcId: p.npcId, name: p.name, mapId: p.mapId, zoneName: p.zoneName,
      x: p.map.x, y: p.map.y, zoneX: p.x, zoneY: p.y, reporters: p.reporters, heldBack: p.spoiler,
    }));
}

/** The record kinds the map reads. Both are on the public allowlist; world-map.test.ts checks that. */
export const MAP_RECORD_KINDS = ["npc_sighting", "vendor"] as const;

/** NPC and vendor facts from records, taking only allowlisted kinds, whatever the caller passed in. */
export function observedFacts(records: readonly unknown[]): WorldFacts {
  const allowed = new Set<string>(PUBLIC_RECORD_KINDS.filter((k) => (MAP_RECORD_KINDS as readonly string[]).includes(k)));
  return worldFactsFromRecords(records.filter((r) => allowed.has((r as { kind?: string } | null)?.kind ?? "")));
}

/**
 * A link to the map for a spot on a zone map (x, y from 0 to 100, as the database pages print them).
 * Null for a zone the map does not draw, which includes the held-back zones: a link must not reveal them.
 */
export function pinLink(mapId: number, x: number, y: number): string | null {
  return WORLD_MAP.zones.some((z) => z.uiMapId === mapId) ? mapHref({ mapId, x, y }) : null;
}
