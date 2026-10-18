/**
 * Zone and continent map pictures, planned from the client's map art tables. Pure: it reads table rows
 * and says which tile files make which picture and where the picture lies in world yards. The fetching
 * and stitching are done by client-assets.ts and scripts/blp_convert.py.
 *
 * Tables, with column names from WoWDBDefs:
 * - UiMapXMapArt: which art (UiMapArtID) a map (UiMapID) shows. A row with a PhaseID other than 0 is for
 *   a phased version of the map and is not used.
 * - UiMapArt: the art's style (UiMapArtStyleID).
 * - UiMapArtStyleLayer: per style and layer, the size in pixels of the whole picture (LayerWidth,
 *   LayerHeight) and of one tile. Layer 0 is the picture at its base zoom; later layers are the same
 *   picture sharper, and are not used.
 * - UiMapArtTile: one tile file (FileDataID) per row and column of an art's layer.
 *
 * The tiles are laid on a grid of whole tiles, which is usually a little bigger than the picture
 * (1002 x 668 pixels on a 4 x 3 grid of 256 pixel tiles is 1024 x 768), and the picture is the top-left
 * LayerWidth x LayerHeight part of that grid. The picture covers exactly the rectangle that the map's
 * UiMapAssignment gives (the whole map, UiMin 0,0 to UiMax 1,1), so it lines up with the zone outlines.
 */
import { ORIGINAL_ZONE_UI_MAP_IDS, placeUiMaps, type WorldRect } from "../world-map-data.js";
import type { Rows, TableReader } from "../talents/build-catalog.js";

export interface ArtTile { row: number; col: number; fileId: number }
export interface ArtLayer { width: number; height: number; tileWidth: number; tileHeight: number }

export interface MapTarget {
  uiMapId: number;
  kind: "continent" | "zone";
  name: string;
  /** The game map (0 Eastern Kingdoms, 1 Kalimdor) it lies on. */
  continentId: number;
  rect: WorldRect;
  /** Zones with UiMap ids outside the original world's: shown only behind the spoiler switch. */
  heldBack: boolean;
  artId: number;
  layer: ArtLayer;
  tiles: ArtTile[];
}

export interface StitchPlan {
  cols: number;
  rows: number;
  /** The grid in pixels. */
  canvas: { width: number; height: number };
  /** The picture's part of the grid: left, top, right, bottom. */
  crop: [number, number, number, number];
  /** Grid cells with no tile row. Any gap means the picture is not made. */
  missing: { row: number; col: number }[];
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const list = (rows: Rows | undefined) => [...(rows?.values() ?? [])];

/** The grid a layer's tiles make and the crop that gives the picture. Throws when a tile is outside the layer's grid. */
export function stitchPlan(layer: ArtLayer, tiles: ArtTile[]): StitchPlan {
  if (layer.width <= 0 || layer.height <= 0 || layer.tileWidth <= 0 || layer.tileHeight <= 0) throw new Error("the layer has no size");
  const cols = Math.ceil(layer.width / layer.tileWidth);
  const rows = Math.ceil(layer.height / layer.tileHeight);
  const have = new Set<string>();
  for (const t of tiles) {
    if (t.row < 0 || t.col < 0 || t.row >= rows || t.col >= cols) throw new Error(`tile ${t.row},${t.col} is outside the ${cols} x ${rows} grid`);
    have.add(`${t.row},${t.col}`);
  }
  const missing: StitchPlan["missing"] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) if (!have.has(`${row},${col}`)) missing.push({ row, col });
  return {
    cols, rows,
    canvas: { width: cols * layer.tileWidth, height: rows * layer.tileHeight },
    crop: [0, 0, layer.width, layer.height],
    missing,
  };
}

/** The size a picture is saved at: scaled down to fit `max` on its longer side, never up. */
export function fitSize(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const UI_MAP_CONTINENT = 2;
const UI_MAP_ZONE = 3;
const WORLD_UI_MAP = 947;

/**
 * Every continent and zone the map layer places, with the art it shows. A map without a layer 0, art row
 * or tile is left out and named in `skipped`, never guessed.
 */
export function planMapArt(get: TableReader): { targets: MapTarget[]; skipped: string[] } {
  const uiMaps = get("UiMap"), assignments = get("UiMapAssignment"), maps = get("Map");
  const xArt = get("UiMapXMapArt"), arts = get("UiMapArt"), layers = get("UiMapArtStyleLayer"), tileRows = get("UiMapArtTile");
  if (!uiMaps || !assignments || !xArt || !arts || !layers || !tileRows) throw new Error("the snapshot has no map art tables; run `client-extract --refresh` first");

  const placed = placeUiMaps(list(assignments));
  const artOf = new Map<number, number>();
  for (const r of [...list(xArt)].sort((a, b) => num(a.ID) - num(b.ID))) {
    if (num(r.PhaseID) !== 0) continue;
    if (!artOf.has(num(r.UiMapID))) artOf.set(num(r.UiMapID), num(r.UiMapArtID));
  }
  const tilesOf = new Map<number, ArtTile[]>();
  for (const r of list(tileRows)) {
    if (num(r.LayerIndex) !== 0) continue;
    const id = num(r.UiMapArtID);
    tilesOf.set(id, [...(tilesOf.get(id) ?? []), { row: num(r.RowIndex), col: num(r.ColIndex), fileId: num(r.FileDataID) }]);
  }
  const layerOf = new Map<number, ArtLayer>();
  for (const r of list(layers)) {
    if (num(r.LayerIndex) === 0) layerOf.set(num(r.UiMapArtStyleID), { width: num(r.LayerWidth), height: num(r.LayerHeight), tileWidth: num(r.TileWidth), tileHeight: num(r.TileHeight) });
  }

  const continents = new Set<number>();
  const targets: MapTarget[] = [];
  const skipped: string[] = [];
  const add = (uiMapId: number, kind: MapTarget["kind"], name: string, continentId: number, heldBack: boolean) => {
    const at = placed.get(uiMapId), artId = artOf.get(uiMapId);
    const art = artId === undefined ? undefined : arts.get(artId);
    const layer = art ? layerOf.get(num(art.UiMapArtStyleID)) : undefined;
    const tiles = artId === undefined ? undefined : tilesOf.get(artId);
    if (!at || !layer || !tiles?.length) { skipped.push(`${name} (${uiMapId}): no art in this build`); return; }
    targets.push({ uiMapId, kind, name, continentId, rect: at.rect, heldBack, artId: artId!, layer, tiles });
  };

  // Continents first: a UiMap of the continent type under the world map.
  for (const u of list(uiMaps)) {
    const at = placed.get(num(u.ID));
    if (u.Type !== UI_MAP_CONTINENT || num(u.ParentUiMapID) !== WORLD_UI_MAP || !at) continue;
    const mapName = maps?.get(at.mapId)?.MapName_lang;
    continents.add(at.mapId);
    add(num(u.ID), "continent", typeof mapName === "string" ? mapName : String(u.Name_lang), at.mapId, false);
  }
  for (const u of list(uiMaps)) {
    const id = num(u.ID), at = placed.get(id);
    if (u.Type !== UI_MAP_ZONE || !at || !continents.has(at.mapId) || typeof u.Name_lang !== "string") continue;
    add(id, "zone", u.Name_lang, at.mapId, id < ORIGINAL_ZONE_UI_MAP_IDS.min || id > ORIGINAL_ZONE_UI_MAP_IDS.max);
  }
  targets.sort((a, b) => (a.kind === b.kind ? a.uiMapId - b.uiMapId : a.kind === "continent" ? -1 : 1));
  return { targets, skipped };
}
