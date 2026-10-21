/**
 * Dungeons and raids from what players' clients saw: the entrance a player zoned in from (`instance_entrance`, the
 * last position outside) and the boss encounters that ended inside (`encounter`). Each fact is public under the
 * 3-install rule of world-pages.ts. An entrance is placed on an outdoor map when 3 installs zoned in from it there,
 * at the median of their positions, as an NPC pin is. An encounter is listed for an instance when 3 installs
 * report it there; its name, and each boss id, need 3 installs agreeing too. Names come in the client's language,
 * so a name is shown only when they agree. Instance ids are the game's map ids, the ids the game files' entrances
 * carry (`WorldMapData.entrances[].mapId`).
 */
import { INSTANCE_TYPES } from "@everloot/protocol";
import { agreedLabelsById, WORLD_AGREEMENT } from "./world-pages.js";

export type InstanceType = (typeof INSTANCE_TYPES)[number];

export interface InstanceEntranceRow { installId: string; instanceMapId: number; name: string; instanceType: InstanceType; mapId: number; x: number; y: number }
export interface EncounterRow { installId: string; encounterId: number; name: string; instanceMapId: number; success: boolean; npcIds: number[] }
export interface InstanceFacts { entrances: InstanceEntranceRow[]; encounters: EncounterRow[] }

/** One instance's agreed entrance on one outdoor map. */
export interface ConfirmedEntrance {
  instanceMapId: number;
  /** The instance's name 3 installs agree on, or null. */
  name: string | null;
  /** Dungeon or raid, when 3 installs agree. */
  instanceType: InstanceType | null;
  mapId: number;
  x: number;
  y: number;
  reporters: number;
}

/** A boss encounter 3 installs report in one instance. */
export interface InstanceBoss {
  encounterId: number;
  name: string | null;
  /** Kills reported, every install's together; wipes are not kills. */
  kills: number;
  /** Boss creature ids 3 installs agree the encounter lists. */
  npcIds: number[];
  reporters: number;
}

const valid = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(value * 10) / 10;
}

export function instanceFactsFromRecords(records: unknown[]): InstanceFacts {
  const facts: InstanceFacts = { entrances: [], encounters: [] };
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.installId !== "string" || !r.installId.trim()) continue;
    if (r.kind === "instance_entrance" && valid(r.instanceMapId) && typeof r.name === "string" && INSTANCE_TYPES.includes(r.instanceType as InstanceType)
      && typeof r.mapId === "number" && Number.isInteger(r.mapId) && r.mapId >= 0 && typeof r.x === "number" && typeof r.y === "number"
      && r.x >= 0 && r.x <= 100 && r.y >= 0 && r.y <= 100) {
      facts.entrances.push({ installId: r.installId.trim(), instanceMapId: r.instanceMapId, name: r.name, instanceType: r.instanceType as InstanceType, mapId: r.mapId, x: r.x, y: r.y });
    }
    if (r.kind === "encounter" && valid(r.encounterId) && typeof r.name === "string" && valid(r.instanceMapId) && typeof r.success === "boolean") {
      const npcIds = Array.isArray(r.npcIds) ? [...new Set(r.npcIds.filter(valid))] : [];
      facts.encounters.push({ installId: r.installId.trim(), encounterId: r.encounterId, name: r.name, instanceMapId: r.instanceMapId, success: r.success, npcIds });
    }
  }
  return facts;
}

/** Every instance's agreed entrances, one per instance and outdoor map, by instance id then map id. */
export function confirmedEntrances(rows: readonly InstanceEntranceRow[]): ConfirmedEntrance[] {
  const names = agreedLabelsById(rows.map((r) => ({ id: r.instanceMapId, installId: r.installId, label: r.name })));
  const types = agreedLabelsById(rows.map((r) => ({ id: r.instanceMapId, installId: r.installId, label: r.instanceType })));
  // One position per install and place: an install that zoned in many times counts once, at its median.
  const groups = new Map<string, Map<string, { x: number[]; y: number[] }>>();
  for (const r of rows) {
    const key = `${r.instanceMapId}|${r.mapId}`;
    const installs = groups.get(key) ?? new Map<string, { x: number[]; y: number[] }>();
    const at = installs.get(r.installId) ?? { x: [], y: [] };
    at.x.push(r.x); at.y.push(r.y);
    installs.set(r.installId, at);
    groups.set(key, installs);
  }
  const out: ConfirmedEntrance[] = [];
  for (const [key, installs] of groups) {
    if (installs.size < WORLD_AGREEMENT) continue;
    const [instanceMapId, mapId] = key.split("|").map(Number) as [number, number];
    const each = [...installs.values()];
    out.push({
      instanceMapId, name: names.get(instanceMapId) ?? null, instanceType: (types.get(instanceMapId) as InstanceType | undefined) ?? null, mapId,
      x: median(each.map((at) => median(at.x))), y: median(each.map((at) => median(at.y))), reporters: installs.size,
    });
  }
  return out.sort((a, b) => a.instanceMapId - b.instanceMapId || a.mapId - b.mapId);
}

/** The bosses 3 installs report in each instance, by instance id, each instance's in encounter id order. */
export function instanceBosses(rows: readonly EncounterRow[]): Map<number, InstanceBoss[]> {
  const byEncounter = new Map<string, EncounterRow[]>();
  for (const r of rows) {
    const key = `${r.instanceMapId}|${r.encounterId}`;
    byEncounter.set(key, [...(byEncounter.get(key) ?? []), r]);
  }
  const out = new Map<number, InstanceBoss[]>();
  for (const [key, list] of byEncounter) {
    const reporters = new Set(list.map((r) => r.installId)).size;
    if (reporters < WORLD_AGREEMENT) continue;
    const [instanceMapId, encounterId] = key.split("|").map(Number) as [number, number];
    const name = agreedLabelsById(list.map((r) => ({ id: encounterId, installId: r.installId, label: r.name }))).get(encounterId) ?? null;
    const npcInstalls = new Map<number, Set<string>>();
    for (const r of list) for (const npcId of r.npcIds) npcInstalls.set(npcId, (npcInstalls.get(npcId) ?? new Set()).add(r.installId));
    const npcIds = [...npcInstalls].filter(([, installs]) => installs.size >= WORLD_AGREEMENT).map(([npcId]) => npcId).sort((a, b) => a - b);
    const boss = { encounterId, name, kills: list.filter((r) => r.success).length, npcIds, reporters };
    out.set(instanceMapId, [...(out.get(instanceMapId) ?? []), boss].sort((a, b) => a.encounterId - b.encounterId));
  }
  return out;
}

/** "Edwin VanCleef (12 kills)": a boss as a line, by its agreed name or its encounter id. */
export function bossLabel(boss: InstanceBoss): string {
  return `${boss.name ?? `Encounter ${boss.encounterId}`} (${boss.kills.toLocaleString("en-US")} ${boss.kills === 1 ? "kill" : "kills"})`;
}
