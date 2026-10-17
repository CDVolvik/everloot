/**
 * Player-observed points on the world map, and "what is near this place".
 *
 * Observed points are NPC pins from `npc_sighting` records, after the same 3-install rule the NPC page
 * applies (world-pages.ts `npcPage`: a pin needs 3 installs on one map, measured at the NPC). A vendor
 * is an NPC with at least one vendor offer that 3 installs agree on (`vendorPage`). Game objects are not
 * here: no public record kind gives an object a position (loot rows name an object id and nothing else).
 *
 * Entrances come from the game-file map layer (world-map-data.ts). Held-back zones are never used
 * here: the public MCP tool does not carry spoilers.
 */
import { npcPage, vendorPage, worldFactsFromRecords, type NpcSightingRow, type VendorSighting, type WorldFacts } from "./world-pages.js";
import {
  placeEntrances, worldToMap, zoneAt, zoneTable, zoneToWorld, type MapPoint, type WorldPoint, type ZoneEntry,
} from "./world-coords.js";
import type { WorldMapData } from "./world-map-data.js";

export type ObservedKind = "npc" | "vendor";

export interface ObservedPin {
  kind: ObservedKind;
  npcId: number;
  name: string | null;
  /** The zone's UiMap id and name. */
  mapId: number;
  zoneName: string;
  /** Position on the zone map, 0..100 as the NPC page shows it. */
  x: number;
  y: number;
  world: WorldPoint;
  map: MapPoint;
  reporters: number;
  /** True when the pin lies in a zone the files hold back as possibly unreleased. */
  spoiler: boolean;
}

/** Every zone, with the held-back ones flagged. */
export function allZones(data: Pick<WorldMapData, "zones" | "heldBackZones">): { zones: ZoneEntry[]; held: Set<number> } {
  return {
    zones: zoneTable({ zones: [...data.zones, ...data.heldBackZones] }),
    held: new Set(data.heldBackZones.map((z) => z.uiMapId)),
  };
}

/** Corroborated NPC and vendor pins that fall inside a known zone. Pins in unknown zones are dropped. */
export function observedPins(facts: Pick<WorldFacts, "npcs" | "vendors">, data: Pick<WorldMapData, "zones" | "heldBackZones">): ObservedPin[] {
  const { zones, held } = allZones(data);
  const npcRows = new Map<number, NpcSightingRow[]>();
  for (const row of facts.npcs) {
    const rows = npcRows.get(row.npcId) ?? [];
    rows.push(row);
    npcRows.set(row.npcId, rows);
  }
  const vendorRows = new Map<number, VendorSighting[]>();
  for (const row of facts.vendors) {
    const rows = vendorRows.get(row.vendorNpcId) ?? [];
    rows.push(row);
    vendorRows.set(row.vendorNpcId, rows);
  }
  const vendors = new Set<number>();
  for (const [id, rows] of vendorRows) if (vendorPage(id, { npcs: [], quests: [], vendors: rows }).offers.length > 0) vendors.add(id);

  const pins: ObservedPin[] = [];
  for (const [npcId, rows] of npcRows) {
    const page = npcPage(npcId, { npcs: rows, quests: [], vendors: [] });
    for (const pin of page.pins) {
      const zone = zones.find((z) => z.mapId === pin.mapId);
      const world = zoneToWorld(zones, pin.mapId, pin.x / 100, pin.y / 100);
      if (!zone || !world) continue;
      pins.push({
        kind: vendors.has(npcId) ? "vendor" : "npc", npcId, name: page.name, mapId: pin.mapId, zoneName: zone.name,
        x: pin.x, y: pin.y, world, map: worldToMap(world), reporters: pin.reporters, spoiler: held.has(pin.mapId),
      });
    }
  }
  return pins.sort((a, b) => a.npcId - b.npcId || a.mapId - b.mapId);
}

/** Straight-line distance in yards, or Infinity across continents. */
export function distanceYards(a: WorldPoint, b: WorldPoint): number {
  if (a.continentId !== b.continentId) return Infinity;
  return Math.hypot(a.worldX - b.worldX, a.worldY - b.worldY);
}

export const NEAR_DEFAULT_RADIUS = 500;
export const NEAR_MAX_RADIUS = 5000;
export const NEAR_DEFAULT_LIMIT = 5;
export const NEAR_MAX_LIMIT = 20;
const NAME_MAX = 80;

export interface NearArgs {
  zone?: string;
  x?: number;
  y?: number;
  npcId?: number;
  radius?: number;
  limit?: number;
}

const clip = (s: string) => (s.length > NAME_MAX ? `${s.slice(0, NAME_MAX - 1)}…` : s);
const oneDecimal = (n: number) => Math.round(n * 10) / 10;

/**
 * Entrances, NPCs and vendors near a spot, nearest first, with distances in yards. Give either a zone
 * (name or UiMap id) with x and y from 0 to 100, or an NPC id to start from where that NPC stands.
 */
export function handleWorldMapNear(args: NearArgs, data: WorldMapData, facts: Pick<WorldFacts, "npcs" | "vendors">): string {
  const hasSpot = args.zone !== undefined || args.x !== undefined || args.y !== undefined;
  if (hasSpot && args.npcId !== undefined) return "Give either a zone with x and y, or an npc id, not both.";
  if (!hasSpot && args.npcId === undefined) return "Give a zone with x and y (0 to 100), or an npc id.";

  const radius = args.radius ?? NEAR_DEFAULT_RADIUS;
  const limit = args.limit ?? NEAR_DEFAULT_LIMIT;
  if (!Number.isFinite(radius) || radius <= 0 || radius > NEAR_MAX_RADIUS) return `Radius must be above 0 and at most ${NEAR_MAX_RADIUS} yards.`;
  if (!Number.isInteger(limit) || limit < 1 || limit > NEAR_MAX_LIMIT) return `Limit must be a whole number from 1 to ${NEAR_MAX_LIMIT}.`;

  const zones = zoneTable(data);
  const pins = observedPins(facts, data).filter((p) => !p.spoiler);
  let origin: WorldPoint;
  let label: string;
  let selfId: number | null = null;

  if (args.npcId !== undefined) {
    if (!Number.isInteger(args.npcId) || args.npcId < 1) return "Name an npc id.";
    const own = pins.find((p) => p.npcId === args.npcId);
    if (!own) return `NPC ${args.npcId} has no agreed position in a mapped zone. A pin needs 3 installs on the same map.`;
    origin = own.world;
    selfId = own.npcId;
    label = `${own.name ? clip(own.name) : `NPC ${own.npcId}`} in ${own.zoneName} at ${own.x}, ${own.y}`;
  } else {
    const { zone, x, y } = args;
    if (typeof zone !== "string" || !zone.trim() || zone.length > NAME_MAX) return "Name a zone, by name or map id.";
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
      return "x and y are needed, each from 0 to 100, as on the zone map.";
    }
    const wanted = zone.trim().toLowerCase();
    const found = zones.find((z) => String(z.mapId) === wanted) ?? zones.find((z) => z.name.toLowerCase() === wanted);
    if (!found) return `No zone "${clip(zone.trim())}" in the map layer. Held-back zones are not offered here.`;
    const world = zoneToWorld(zones, found.mapId, x / 100, y / 100);
    if (!world) return "That spot is outside the zone.";
    origin = world;
    label = `${found.name} at ${x}, ${y}`;
  }

  const entrances = placeEntrances(data)
    .map((p) => ({ p, d: distanceYards(origin, p.world) }))
    .filter((e) => e.d <= radius)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit);
  const observed = (kind: ObservedKind) => pins
    .filter((p) => p.kind === kind && p.npcId !== selfId)
    .map((p) => ({ p, d: distanceYards(origin, p.world) }))
    .filter((e) => e.d <= radius)
    .sort((a, b) => a.d - b.d || a.p.npcId - b.p.npcId)
    .slice(0, limit);

  const lines = [`Near ${label}, within ${radius} yards. Distances are straight lines in yards.`];
  lines.push("Entrances (from the game files, found in game files, unconfirmed):");
  if (!entrances.length) lines.push("  none in range");
  for (const { p, d } of entrances) {
    const zone = zoneAt(zones, p.world)?.name;
    lines.push(`  ${clip(p.names.join(", "))} (${p.raid ? "raid" : "dungeon"})${zone ? ` in ${zone}` : ""}  ${oneDecimal(d)} yards`);
  }
  for (const [title, kind] of [["NPCs", "npc"], ["Vendors", "vendor"]] as const) {
    lines.push(`${title} (players saw them; a pin needs 3 installs on the same map):`);
    const rows = observed(kind);
    if (!rows.length) lines.push("  none in range");
    for (const { p, d } of rows) {
      lines.push(`  ${p.name ? clip(p.name) : "unnamed"} (NPC ${p.npcId}) in ${p.zoneName} at ${p.x}, ${p.y}  ${oneDecimal(d)} yards  ${p.reporters} reporters`);
    }
  }
  lines.push("Game objects are not listed: no public record gives an object a position.");
  return lines.join("\n");
}

/** The facts this tool reads: NPC positions and vendor offers. Quests are left out, so the tool needs only its two kinds. */
export function mapFactsFromRecords(records: unknown[]): Pick<WorldFacts, "npcs" | "vendors"> {
  const { npcs, vendors } = worldFactsFromRecords(records);
  return { npcs, vendors };
}
