import { placeEntrances, worldToZone, zoneAt, zoneTable } from "../../../kb/src/world-coords";
import type { WorldMapData } from "../../../kb/src/world-map-data";
import { observedPins } from "../../../kb/src/world-map-near";
import { questPage, type WorldFacts } from "../../../kb/src/world-pages";
import { slugify } from "../../../kb/src/lore-slug";
import { WORLD_MAP } from "./world-map";

/** The zone's own address segment: `1411-durotar`. A name with no letters or digits leaves the bare id. */
export function zoneSlug(id: number, name: string): string {
  const words = slugify(name);
  return words ? `${id}-${words}` : String(id);
}

/** Where a zone's page is. The one place a zone link is built, so the address can change in one line. */
export function zoneHref(id: number, name: string): string {
  return `/database/zones/${zoneSlug(id, name)}`;
}

/** The map for a zone. The map keeps its own links; this one is for the "Open on the map" button. */
export const zoneMapHref = (id: number): string => `/map?zone=${id}`;

/** The UiMap id in a `<id>-<slug>` segment, or null when the segment does not start with one. */
export function parseZoneSegment(segment: string): number | null {
  const m = /^([1-9]\d*)(?:-[a-z0-9-]*)?$/.exec(segment);
  return m ? Number(m[1]) : null;
}

export interface ZoneSummary { mapId: number; name: string; continentId: number; continentName: string }

/**
 * The zones the site shows: the released ones only. A zone found only in the game files (UiMap id above
 * 1458, kept in `heldBackZones`) never gets a page or a line in the index, as on the map without spoilers.
 */
export function publicZones(data: Pick<WorldMapData, "zones" | "continents"> = WORLD_MAP): ZoneSummary[] {
  return zoneTable(data).map((z) => ({
    mapId: z.mapId, name: z.name, continentId: z.continentId,
    continentName: data.continents.find((c) => c.id === z.continentId)?.name ?? `Continent ${z.continentId}`,
  }));
}

export function zoneByMapId(mapId: number, data: Pick<WorldMapData, "zones" | "continents"> = WORLD_MAP): ZoneSummary | undefined {
  return publicZones(data).find((z) => z.mapId === mapId);
}

export interface ZoneNpc { npcId: number; name: string | null; x: number; y: number; reporters: number; vendor: boolean }
export interface ZoneQuest { questId: number; title: string | null; level: number | null; giverNpcId: number | null; turnInNpcId: number | null }
export interface ZoneEntrance { names: string[]; raid: boolean; x: number; y: number }
export interface ZoneContents { npcs: ZoneNpc[]; quests: ZoneQuest[]; entrances: ZoneEntrance[] }

/**
 * What is known to be in each released zone. NPC and vendor positions come through `observedPins`, so the
 * 3-install rule holds as everywhere else. A quest is in the zone where its agreed giver or turn-in NPC
 * stands. Dungeon and raid entrances are read from the game files and go to the smallest zone around them.
 */
export function zoneContents(
  facts: Pick<WorldFacts, "npcs" | "quests" | "vendors">, data: Pick<WorldMapData, "zones" | "heldBackZones" | "continents" | "entrances"> = WORLD_MAP,
): Map<number, ZoneContents> {
  const zones = zoneTable(data);
  const out = new Map<number, ZoneContents>(zones.map((z) => [z.mapId, { npcs: [], quests: [], entrances: [] }]));

  const npcsHere = new Map<number, Set<number>>();
  for (const pin of observedPins(facts, data)) {
    const here = out.get(pin.mapId);
    if (!here) continue;
    here.npcs.push({ npcId: pin.npcId, name: pin.name, x: pin.x, y: pin.y, reporters: pin.reporters, vendor: pin.kind === "vendor" });
    npcsHere.set(pin.mapId, (npcsHere.get(pin.mapId) ?? new Set()).add(pin.npcId));
  }

  const byQuest = new Map<number, WorldFacts["quests"]>();
  for (const q of facts.quests) byQuest.set(q.questId, [...(byQuest.get(q.questId) ?? []), q]);
  for (const [questId, rows] of byQuest) {
    const q = questPage(questId, { npcs: [], quests: rows, vendors: [] });
    for (const [mapId, npcs] of npcsHere) {
      if ((q.giverNpcId !== null && npcs.has(q.giverNpcId)) || (q.turnInNpcId !== null && npcs.has(q.turnInNpcId))) {
        out.get(mapId)!.quests.push({ questId, title: q.title, level: q.level, giverNpcId: q.giverNpcId, turnInNpcId: q.turnInNpcId });
      }
    }
  }

  for (const pin of placeEntrances(data)) {
    const zone = zoneAt(zones, pin.world);
    const at = zone && worldToZone(zones, zone.mapId, pin.world);
    if (zone && at) out.get(zone.mapId)!.entrances.push({ names: pin.names, raid: pin.raid, x: Math.round(at.x * 1000) / 10, y: Math.round(at.y * 1000) / 10 });
  }

  for (const here of out.values()) {
    here.npcs.sort((a, b) => (a.name ?? "￿").localeCompare(b.name ?? "￿") || a.npcId - b.npcId);
    here.quests.sort((a, b) => (a.level ?? 999) - (b.level ?? 999) || a.questId - b.questId);
  }
  return out;
}

/** Players' reports or the game files put something on the page beyond the zone's name. */
export const hasContent = (c: ZoneContents | undefined): boolean => Boolean(c && (c.npcs.length || c.quests.length || c.entrances.length));
