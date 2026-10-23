import { describe, expect, test } from "vitest";
import type { ExtractedTable } from "../src/client-snapshot.js";
import {
  adtChunkAreas, CHUNK_YARDS, chunkOf, fileChunks, placedPoints, readTerrainAreas, terrainAreaAt, terrainRowId, TILE_YARDS, wdtTiles,
} from "../src/terrain-area.js";

// SYNTHETIC files in the layout of the client's WDT and ADT files; the ids and areas are made up.
const chunk = (id: string, body: Buffer) => {
  const head = Buffer.alloc(8);
  head.write(id.split("").reverse().join(""), 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
};
/** A WDT whose MAID lists `adts` (tile index -> ADT file data id). */
const wdt = (adts: Record<number, number>) => {
  const maid = Buffer.alloc(64 * 64 * 32);
  for (const [tile, id] of Object.entries(adts)) maid.writeUInt32LE(id, Number(tile) * 32);
  return Buffer.concat([chunk("MVER", Buffer.alloc(4)), chunk("MAIN", Buffer.alloc(16)), chunk("MAID", maid)]);
};
/** A root ADT for tile (col, row) whose 256 chunks all carry `area`, except those listed in `except`. */
const adt = (col: number, row: number, area: number, except: Record<number, number> = {}) => {
  const parts = [chunk("MVER", Buffer.alloc(4)), chunk("MHDR", Buffer.alloc(64))];
  for (let i = 0; i < 256; i++) {
    const h = Buffer.alloc(0x80);
    const cx = col * 16 + (i % 16), cy = row * 16 + Math.floor(i / 16);
    h.writeUInt32LE(except[i] ?? area, 0x34);
    h.writeFloatLE((512 - cy) * CHUNK_YARDS, 0x68);
    h.writeFloatLE((512 - cx) * CHUNK_YARDS, 0x6c);
    parts.push(chunk("MCNK", h));
  }
  return Buffer.concat(parts);
};
const table = (name: string, rows: Record<string, unknown>[]): ExtractedTable =>
  ({ table: name, fileDataID: 1, cKey: null, encryptedBlocks: 0, rows: new Map(rows.map((r) => [Number(r.ID), r])) });

describe("reading the client's terrain files", () => {
  test("chunks are read by their reversed four-character ids", () => {
    expect(fileChunks(chunk("MAID", Buffer.from([1, 2]))).map((c) => [c.id, [...c.body]])).toEqual([["MAID", [1, 2]]]);
  });

  test("a WDT lists the root ADT of each tile by row * 64 + column", () => {
    expect([...wdtTiles(wdt({ 0: 7, [40 * 64 + 39]: 786475 }))]).toEqual([[0, 7], [40 * 64 + 39, 786475]]);
    expect(wdtTiles(chunk("MVER", Buffer.alloc(4))).size).toBe(0);
  });

  test("each terrain chunk gives its north-west corner and area id", () => {
    const chunks = adtChunkAreas(adt(39, 40, 511));
    expect(chunks).toHaveLength(256);
    expect(chunks[0]).toEqual({ areaId: 511, top: expect.closeTo((512 - 640) * CHUNK_YARDS, 2), left: expect.closeTo((512 - 624) * CHUNK_YARDS, 2) });
  });

  test("a point falls in the chunk whose corner is north and west of it", () => {
    // Onyxia's Lair's ghost-return spot on Kalimdor, in tile 39, 40.
    const { col, row } = chunkOf(-4753.3, -3752.4);
    expect([Math.floor(col / 16), Math.floor(row / 16)]).toEqual([39, 40]);
    expect(chunkOf(TILE_YARDS * 32 - 0.01, TILE_YARDS * 32 - 0.01)).toEqual({ col: 0, row: 0 });
    expect(chunkOf(0, 0)).toEqual({ col: 512, row: 512 });
  });
});

describe("the TerrainArea table", () => {
  const tables = [
    table("Map", [
      { ID: 1, WdtFileDataID: 100, InstanceType: 0, CorpseMapID: -1, Corpse: [0, 0] },
      { ID: 249, InstanceType: 2, CorpseMapID: 1, Corpse: [-4753.3, -3752.4] },
      { ID: 999, InstanceType: 1, CorpseMapID: 1, Corpse: [0, 0] },
    ]),
    table("TaxiNodes", [{ ID: 5, ContinentID: 1, Pos: [-4753, -3760, 20] }, { ID: 6, ContinentID: 1, Pos: [9000, 9000, 1] }]),
  ];

  test("the spots placed are entrances with a position and every taxi node", () => {
    expect(placedPoints(tables)).toEqual([
      { continentId: 1, worldX: -4753.3, worldY: -3752.4 },
      { continentId: 1, worldX: -4753, worldY: -3760 },
      { continentId: 1, worldX: 9000, worldY: 9000 },
    ]);
  });

  test("only the tiles under those spots are read, each chunk kept with its area", async () => {
    const read: number[] = [];
    const { col, row } = chunkOf(-4753.3, -3752.4);
    const files: Record<number, Buffer> = { 100: wdt({ [40 * 64 + 39]: 200, 0: 300 }), 200: adt(39, 40, 15, { [(row % 16) * 16 + (col % 16)]: 511 }) };
    const terrain = (await readTerrainAreas(async (id) => {
      read.push(id);
      return files[id] ? { buffer: files[id], encryptedBlocks: 0 } : null;
    }, tables))!;
    // The second taxi node's tile is not in the WDT, so nothing is read for it; tile 0 is never asked for.
    expect(read).toEqual([100, 200]);
    expect(terrain).toMatchObject({ table: "TerrainArea", fileDataID: 0, encryptedBlocks: 0 });
    expect(terrain.rows.size).toBe(256);
    expect(terrain.rows.get(terrainRowId(1, col, row))).toMatchObject({ ContinentID: 1, AreaID: 511 });
    expect(terrainAreaAt(terrain.rows, { continentId: 1, worldX: -4753.3, worldY: -3752.4 })).toBe(511);
    expect(terrainAreaAt(terrain.rows, { continentId: 1, worldX: -4753.3 - CHUNK_YARDS, worldY: -3752.4 })).toBe(15);
    expect(terrainAreaAt(terrain.rows, { continentId: 0, worldX: -4753.3, worldY: -3752.4 })).toBeNull();
  });

  test("an encrypted terrain file is skipped and counted, never used", async () => {
    const terrain = (await readTerrainAreas(async (id) => (id === 100 ? { buffer: wdt({ [40 * 64 + 39]: 200 }), encryptedBlocks: 0 } : { buffer: Buffer.alloc(0), encryptedBlocks: 2 }), tables))!;
    expect(terrain.rows.size).toBe(0);
    expect(terrain.encryptedBlocks).toBe(2);
  });

  test("without a Map table there is nothing to read", async () => {
    expect(await readTerrainAreas(async () => null, [])).toBeNull();
  });
});
