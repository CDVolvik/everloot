import mapJson from "@/data/game-data/map.json";
import { rollupMapBounds, type MapBoundsRow } from "../../../kb/src/map-bounds";
import { checkReportedBounds, placeEntrances, worldToMap, zoneTable, type BoundsCheck, type EntrancePin } from "../../../kb/src/world-coords";
import { WorldMapData } from "../../../kb/src/world-map-data";

export const CONTINENTS = [
  { id: 0, name: "Eastern Kingdoms" },
  { id: 1, name: "Kalimdor" },
] as const;

export interface ZoneShape { mapId: number; name: string; x: number; y: number; width: number; height: number }
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
export function continentMap(continentId: number, boundsRows: MapBoundsRow[], data: WorldMapData = WORLD_MAP): ContinentMap {
  const zones = zoneTable(data);
  const shapes: ZoneShape[] = zones
    .filter((z) => z.continentId === continentId)
    .map((z) => {
      const a = worldToMap({ continentId, worldX: z.bounds.top, worldY: z.bounds.left });
      const c = worldToMap({ continentId, worldX: z.bounds.bottom, worldY: z.bounds.right });
      return { mapId: z.mapId, name: z.name, x: a.x, y: a.y, width: c.x - a.x, height: c.y - a.y };
    });
  const entrances = placeEntrances(data).filter((p) => p.world.continentId === continentId);

  const xs = [...shapes.flatMap((s) => [s.x, s.x + s.width]), ...entrances.map((p) => p.map.x)];
  const ys = [...shapes.flatMap((s) => [s.y, s.y + s.height]), ...entrances.map((p) => p.map.y)];
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
