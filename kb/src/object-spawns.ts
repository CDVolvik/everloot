/**
 * Where game objects (herbs, ore, chests) stand, from the loot windows players opened on them. The addon
 * records the player's position when the window opens, a few yards from the object, with how it was opened
 * (`gatherKind`) and the object's name. One object id has many spawn points, so an id's positions within a
 * map are grouped into clusters: a position closer than `SPAWN_RADIUS` (on the 0..100 map scale) to a
 * cluster's centre joins it. A cluster is a pin at 3 distinct installs; 1 or 2 installs are only counted,
 * never placed. Fishing is left out: the window reports the bobber, not the pool.
 *
 * A pin's key is `obj<objectId>-<mapId>-<x>_<y>`, its first agreed median rounded to 0.5. Pass the keys
 * already published back in and each keeps its place: positions near it join it before any new cluster
 * forms, so found marks and links do not break when later reports move the median.
 */
import { GATHER_KINDS } from "@everloot/protocol";
import { agreedLabelsById, WORLD_AGREEMENT } from "./world-pages.js";

export type GatherKind = (typeof GATHER_KINDS)[number];

/** How close, on the 0..100 map scale, a position must be to a cluster's centre to join it. */
export const SPAWN_RADIUS = 1.0;

export interface ObjectSpawnRow {
  installId: string;
  objectId: number;
  /** Where the player stood; absent on rows from older addons, which still count for names and kinds. */
  mapId?: number;
  x?: number;
  y?: number;
  gatherKind?: GatherKind;
  name?: string;
}

type PlacedRow = ObjectSpawnRow & { mapId: number; x: number; y: number };

export interface ObjectSpawnPin {
  key: string;
  objectId: number;
  mapId: number;
  /** The median of the cluster's positions now, to one decimal. The key keeps the first one. */
  x: number;
  y: number;
  reporters: number;
}

export interface ObjectSpawns {
  pins: ObjectSpawnPin[];
  /** Clusters seen by 1 or 2 installs, per object id and map: a count, never a place. */
  unconfirmed: { objectId: number; mapId: number; clusters: number }[];
}

const KEY = /^obj([1-9]\d*)-(\d+)-(\d+(?:\.\d)?)_(\d+(?:\.\d)?)$/;

export function spawnKey(objectId: number, mapId: number, x: number, y: number): string {
  const half = (v: number) => (Math.round(v * 2) / 2).toFixed(1);
  return `obj${objectId}-${mapId}-${half(x)}_${half(y)}`;
}

export function parseSpawnKey(key: string): { objectId: number; mapId: number; x: number; y: number } | null {
  const m = KEY.exec(key);
  if (!m) return null;
  const [objectId, mapId, x, y] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  return x <= 100 && y <= 100 ? { objectId, mapId, x, y } : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(value * 10) / 10;
}

const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

interface Cluster { key?: string; cx: number; cy: number; rows: PlacedRow[] }

/** Clusters one object id's positions on one map. Rows come sorted, so the result does not depend on input order. */
function clusterGroup(rows: PlacedRow[], anchors: { key: string; x: number; y: number }[]): Cluster[] {
  const clusters: Cluster[] = anchors.map((a) => ({ key: a.key, cx: a.x, cy: a.y, rows: [] }));
  const nearest = (row: PlacedRow, pool: Cluster[]) => {
    let best: Cluster | undefined;
    let bestDistance = SPAWN_RADIUS;
    for (const c of pool) {
      const d = distance(row.x, row.y, c.cx, c.cy);
      if (d < bestDistance) { best = c; bestDistance = d; }
    }
    return best;
  };
  const loose: PlacedRow[] = [];
  // Published places first, around their fixed keys.
  for (const row of rows) {
    const home = nearest(row, clusters);
    if (home) home.rows.push(row); else loose.push(row);
  }
  // Then new clusters, each centred on the mean of what joined it so far.
  const fresh: Cluster[] = [];
  for (const row of loose) {
    const home = nearest(row, fresh);
    if (home) {
      home.rows.push(row);
      home.cx += (row.x - home.cx) / home.rows.length;
      home.cy += (row.y - home.cy) / home.rows.length;
    } else {
      fresh.push({ cx: row.x, cy: row.y, rows: [row] });
    }
  }
  return [...clusters, ...fresh];
}

/**
 * Pins for every object id and map with positions. `published` is the list of keys already shown; each
 * keeps its key while it still has 3 installs. A new pin's key is its median rounded to 0.5; if that key is
 * already taken in this pass, the cluster joins that pin.
 */
export function objectSpawns(rows: ObjectSpawnRow[], published: readonly string[] = []): ObjectSpawns {
  const groups = new Map<string, PlacedRow[]>();
  for (const row of rows) {
    if (row.gatherKind === "fishing" || !placed(row)) continue;
    const id = `${row.objectId}|${row.mapId}`;
    const list = groups.get(id) ?? [];
    list.push(row);
    groups.set(id, list);
  }
  const anchorsByGroup = new Map<string, { key: string; x: number; y: number }[]>();
  for (const key of [...new Set(published)].sort()) {
    const at = parseSpawnKey(key);
    if (!at) continue;
    const id = `${at.objectId}|${at.mapId}`;
    const list = anchorsByGroup.get(id) ?? [];
    list.push({ key, x: at.x, y: at.y });
    anchorsByGroup.set(id, list);
  }

  const pins: ObjectSpawnPin[] = [];
  const unconfirmed: ObjectSpawns["unconfirmed"] = [];
  for (const [id, list] of groups) {
    const [objectId, mapId] = id.split("|").map(Number) as [number, number];
    const sorted = [...list].sort((a, b) => a.x - b.x || a.y - b.y || (a.installId < b.installId ? -1 : a.installId > b.installId ? 1 : 0));
    const byKey = new Map<string, PlacedRow[]>();
    let few = 0;
    for (const cluster of clusterGroup(sorted, anchorsByGroup.get(id) ?? [])) {
      const installs = new Set(cluster.rows.map((r) => r.installId.trim()));
      if (installs.size === 0) continue;
      if (installs.size < WORLD_AGREEMENT) { few += 1; continue; }
      const key = cluster.key ?? spawnKey(objectId, mapId, median(cluster.rows.map((r) => r.x)), median(cluster.rows.map((r) => r.y)));
      byKey.set(key, [...(byKey.get(key) ?? []), ...cluster.rows]);
    }
    for (const [key, members] of byKey) {
      pins.push({
        key, objectId, mapId,
        x: median(members.map((r) => r.x)), y: median(members.map((r) => r.y)),
        reporters: new Set(members.map((r) => r.installId.trim())).size,
      });
    }
    if (few > 0) unconfirmed.push({ objectId, mapId, clusters: few });
  }
  pins.sort((a, b) => a.objectId - b.objectId || a.mapId - b.mapId || (a.key < b.key ? -1 : 1));
  unconfirmed.sort((a, b) => a.objectId - b.objectId || a.mapId - b.mapId);
  return { pins, unconfirmed };
}

function placed(row: ObjectSpawnRow): row is PlacedRow {
  const { mapId, x, y } = row;
  return Boolean(row.installId.trim()) && Number.isInteger(row.objectId) && row.objectId > 0 &&
    typeof mapId === "number" && Number.isInteger(mapId) && mapId >= 0 &&
    typeof x === "number" && typeof y === "number" && x >= 0 && x <= 100 && y >= 0 && y <= 100;
}

/** Object names 3 installs agree on, by object id. Ids without one are left out: show "Object <id>". */
export function agreedObjectNames(rows: ObjectSpawnRow[]): Map<number, string> {
  return agreedLabelsById(rows.filter((r) => r.name !== undefined).map((r) => ({ id: r.objectId, installId: r.installId, label: r.name! })));
}

/** How each object is opened, by object id, when 3 installs agree on one kind. */
export function agreedGatherKinds(rows: ObjectSpawnRow[]): Map<number, GatherKind> {
  return agreedLabelsById(rows.filter((r) => r.gatherKind !== undefined).map((r) => ({ id: r.objectId, installId: r.installId, label: r.gatherKind! }))) as Map<number, GatherKind>;
}

/**
 * Object loot rows from uploads, for the functions above: every loot-api row with an object source. The place,
 * the kind and the name are each kept only when present, so rows from older addons carry just the id.
 */
export function objectSpawnRowsFromRecords(records: unknown[]): ObjectSpawnRow[] {
  const out: ObjectSpawnRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (r.kind !== "loot" || r.sourceEvidence !== "loot-api" || typeof r.installId !== "string" || !r.installId.trim()) continue;
    if (typeof r.sourceObjectId !== "number" || !Number.isInteger(r.sourceObjectId) || r.sourceObjectId < 1) continue;
    const name = typeof r.sourceObjectName === "string" && r.sourceObjectName.trim() ? r.sourceObjectName.trim() : undefined;
    const gatherKind = GATHER_KINDS.includes(r.gatherKind as GatherKind) ? (r.gatherKind as GatherKind) : undefined;
    const place = typeof r.mapId === "number" && typeof r.x === "number" && typeof r.y === "number" ? { mapId: r.mapId, x: r.x, y: r.y } : {};
    out.push({ installId: r.installId, objectId: r.sourceObjectId, ...place, ...(gatherKind ? { gatherKind } : {}), ...(name ? { name } : {}) });
  }
  return out;
}
