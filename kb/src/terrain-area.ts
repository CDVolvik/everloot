/**
 * Which area of the world a spot lies in, decided the way the game decides it: by the ground. A continent's
 * WDT file lists its terrain tiles (MAID: one ADT file data id per tile), and each tile's ADT file is cut into
 * 16 by 16 chunks (MCNK) whose header names the AreaTable area of that patch of ground. The area's
 * `ParentAreaID` chain then reaches a zone's area, and UiMapAssignment says which UiMap shows that area
 * (world-map-data.ts). Zone rectangles overlap, so they cannot say this on their own.
 *
 * Only the tiles under the spots the site places (dungeon and raid entrances, flight masters) are read, and of
 * each chunk only its corner and area id are kept, as the derived snapshot table `TerrainArea`. Files are found
 * by their file data ids from the tables; an encrypted or missing file is skipped, never decrypted.
 */
import type { ExtractedTable } from "./client-snapshot.js";

export const TERRAIN_AREA_TABLE = "TerrainArea";
/** A terrain tile is 1600/3 yards on a side, a chunk a sixteenth of that; a continent is 64 by 64 tiles. */
export const TILE_YARDS = 1600 / 3;
export const CHUNK_YARDS = TILE_YARDS / 16;
const GRID = 64 * 16;

export interface TerrainPoint { continentId: number; worldX: number; worldY: number }

/** The chunks of a chunked client file (WDT, ADT): four-character id (stored reversed) and size, then the body. */
export function fileChunks(buf: Buffer): { id: string; body: Buffer }[] {
  const out: { id: string; body: Buffer }[] = [];
  for (let at = 0; at + 8 <= buf.length;) {
    const id = buf.toString("latin1", at, at + 4).split("").reverse().join("");
    const size = buf.readUInt32LE(at + 4);
    out.push({ id, body: buf.subarray(at + 8, Math.min(buf.length, at + 8 + size)) });
    at += 8 + size;
  }
  return out;
}

/**
 * A chunk's place on the continent-wide grid of 1024 by 1024 chunks: `col` counts east from the west edge, `row`
 * south from the north edge, as the tiles do (world x runs north, world y west, both 0 at the centre).
 */
export function chunkOf(worldX: number, worldY: number): { col: number; row: number } {
  return { col: Math.floor(GRID / 2 - worldY / CHUNK_YARDS), row: Math.floor(GRID / 2 - worldX / CHUNK_YARDS) };
}

/** The row id a chunk has in `TerrainArea`: one number per continent and chunk. */
export function terrainRowId(continentId: number, col: number, row: number): number {
  return continentId * GRID * GRID + row * GRID + col;
}

/** The ADT file data id of each terrain tile a WDT lists, by tile index (row * 64 + column). */
export function wdtTiles(wdt: Buffer): Map<number, number> {
  const tiles = new Map<number, number>();
  const maid = fileChunks(wdt).find((c) => c.id === "MAID")?.body;
  if (!maid) return tiles;
  // Each tile has eight file data ids; the first is the root ADT, the one with the terrain chunks.
  for (let i = 0; i < 64 * 64 && (i + 1) * 32 <= maid.length; i++) {
    const adt = maid.readUInt32LE(i * 32);
    if (adt) tiles.set(i, adt);
  }
  return tiles;
}

/** Each terrain chunk of a root ADT: its north-west corner in world yards and its area id. */
export function adtChunkAreas(adt: Buffer): { top: number; left: number; areaId: number }[] {
  return fileChunks(adt)
    .filter((c) => c.id === "MCNK" && c.body.length >= 0x74)
    .map((c) => ({ areaId: c.body.readUInt32LE(0x34), top: c.body.readFloatLE(0x68), left: c.body.readFloatLE(0x6c) }));
}

/** The area id of the ground under a point, from `TerrainArea` rows, or null when its tile was not read. */
export function terrainAreaAt(rows: Map<number, Record<string, unknown>>, point: TerrainPoint): number | null {
  const { col, row } = chunkOf(point.worldX, point.worldY);
  const area = rows.get(terrainRowId(point.continentId, col, row))?.AreaID;
  return typeof area === "number" && area > 0 ? area : null;
}

/** What the reader needs: a file's bytes by file data id, and how many of its blocks were encrypted. */
export type ReadFile = (fileDataID: number) => Promise<{ buffer: Buffer; encryptedBlocks: number } | null>;

/**
 * The spots the site places: where each dungeon and raid is entered (Map `Corpse` on `CorpseMapID`) and every
 * taxi node (TaxiNodes `Pos` on `ContinentID`), from the extracted tables.
 */
export function placedPoints(tables: Pick<ExtractedTable, "table" | "rows">[]): TerrainPoint[] {
  const rows = (name: string) => [...(tables.find((t) => t.table === name)?.rows.values() ?? [])];
  const points: TerrainPoint[] = [];
  const add = (continentId: unknown, at: unknown) => {
    if (typeof continentId !== "number" || !Array.isArray(at) || typeof at[0] !== "number" || typeof at[1] !== "number") return;
    if (at[0] === 0 && at[1] === 0) return;
    points.push({ continentId, worldX: at[0], worldY: at[1] });
  };
  for (const m of rows("Map")) if (m.InstanceType === 1 || m.InstanceType === 2) add(m.CorpseMapID, m.Corpse);
  for (const n of rows("TaxiNodes")) add(n.ContinentID, n.Pos);
  return points;
}

/**
 * Reads the terrain tiles under `points` and returns every chunk of them as `TerrainArea` rows ({ ID, ContinentID,
 * Top, Left, AreaID }). A continent comes from the Map table's `WdtFileDataID`. Files that are missing or have
 * encrypted blocks are left out and counted in `encryptedBlocks`; their spots stay unresolved.
 */
export async function readTerrainAreas(readFile: ReadFile, tables: Pick<ExtractedTable, "table" | "rows">[]): Promise<ExtractedTable | null> {
  const maps = tables.find((t) => t.table === "Map")?.rows;
  if (!maps) return null;
  const wanted = new Map<number, Set<number>>();
  for (const p of placedPoints(tables)) {
    const { col, row } = chunkOf(p.worldX, p.worldY);
    if (col < 0 || row < 0 || col >= GRID || row >= GRID) continue;
    const set = wanted.get(p.continentId) ?? new Set<number>();
    wanted.set(p.continentId, set.add(Math.floor(row / 16) * 64 + Math.floor(col / 16)));
  }
  const rows = new Map<number, Record<string, unknown>>();
  let encryptedBlocks = 0;
  for (const [continentId, tiles] of [...wanted].sort((a, b) => a[0] - b[0])) {
    const wdtId = Number(maps.get(continentId)?.WdtFileDataID);
    if (!(wdtId > 0)) continue;
    const wdt = await readFile(wdtId);
    if (!wdt || wdt.encryptedBlocks) { encryptedBlocks += wdt?.encryptedBlocks ?? 0; continue; }
    const adts = wdtTiles(wdt.buffer);
    for (const tile of [...tiles].sort((a, b) => a - b)) {
      const adtId = adts.get(tile);
      const adt = adtId ? await readFile(adtId) : null;
      if (!adt || adt.encryptedBlocks) { encryptedBlocks += adt?.encryptedBlocks ?? 0; continue; }
      for (const c of adtChunkAreas(adt.buffer)) {
        // The corner sits on the chunk grid; the chunk's middle names its cell without rounding trouble.
        const { col, row } = chunkOf(c.top - CHUNK_YARDS / 2, c.left - CHUNK_YARDS / 2);
        const id = terrainRowId(continentId, col, row);
        rows.set(id, { ID: id, ContinentID: continentId, Top: c.top, Left: c.left, AreaID: c.areaId });
      }
    }
  }
  return { table: TERRAIN_AREA_TABLE, fileDataID: 0, cKey: null, encryptedBlocks, rows };
}
