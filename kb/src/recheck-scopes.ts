/**
 * Which recheck scopes cover a fact (docs/design/specs/2026-10-21-coverage-plateau-design.md, section 5), in one place
 * for the coverage score, the internal coverage report and the public readers. A scope in `kb/curated/recheck.json`
 * covers a fact when it names the fact's type (or no type), one of the zones the fact is counted in (or no zone), and
 * one of the ids the fact involves (or no id). The fact then counts only rows captured after the latest such scope's
 * `since`, once it was confirmed before it (`recheckRows` in fact-states.ts).
 *
 * Where a fact is counted is the score's rule: an NPC on the map most installs pinned it on, then any map it was seen
 * on; a quest where its leading giver (then turn-in) stands; a vendor offer where its vendor stands; a pin, an
 * entrance or a treasure on its own map.
 */
import type { CoverageType, RecheckScope } from "./coverage.js";

/** What a scope is matched against: the types it may be named by, the zones it is counted in, the ids it involves. */
export interface ScopedFact {
  /** A rare's name or pin is also an NPC's name or pin: such a fact names both types. */
  types: readonly CoverageType[];
  /** Null stands for a fact placed in no zone, which a scope with zones never covers. */
  zones: readonly (number | null)[];
  /** The entity's own id first, then the ids it involves: a quest's rewards, a vendor's item, a boss's NPCs. */
  ids: readonly number[];
}

const time = (value: string) => Date.parse(value);

/** The latest `since` among the scopes that cover a fact, or null when none does. */
export function scopeSince(scopes: readonly RecheckScope[], fact: ScopedFact): string | null {
  let best: string | null = null;
  for (const s of scopes) {
    if (s.type && !fact.types.includes(s.type)) continue;
    if (s.zones?.length && !fact.zones.some((z) => z !== null && s.zones!.includes(z))) continue;
    if (s.ids?.length && !fact.ids.some((id) => s.ids!.includes(id))) continue;
    if (best === null || time(s.since) > time(best)) best = s.since;
  }
  return best;
}

/** The later of two cut-offs; either may be absent. */
export function laterSince(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return time(b) > time(a) ? b : a;
}

/** The map with the most installs, ties to the lower id; null for none. */
export function busiestMap(installs: ReadonlyMap<number, ReadonlySet<string>>): number | null {
  let best: number | null = null, size = 0;
  for (const [mapId, set] of [...installs].sort((a, b) => a[0] - b[0])) if (set.size > size) { best = mapId; size = set.size; }
  return best;
}

/**
 * Where each NPC is counted: the map most installs placed it on with a pin position (`pin`), then the map most saw it
 * on at all. NPCs with no row are absent.
 */
export function npcZones(rows: Iterable<{ npcId: number; mapId: number; installId: string; pin: boolean }>): Map<number, number | null> {
  const pinMaps = new Map<number, Map<number, Set<string>>>(), anyMaps = new Map<number, Map<number, Set<string>>>();
  const add = (by: Map<number, Map<number, Set<string>>>, r: { npcId: number; mapId: number; installId: string }) => {
    const maps = by.get(r.npcId) ?? new Map<number, Set<string>>();
    maps.set(r.mapId, (maps.get(r.mapId) ?? new Set<string>()).add(r.installId.trim()));
    by.set(r.npcId, maps);
  };
  for (const r of rows) {
    if (!r.installId.trim()) continue;
    add(anyMaps, r);
    if (r.pin) add(pinMaps, r);
  }
  const out = new Map<number, number | null>();
  for (const [npcId, maps] of anyMaps) out.set(npcId, busiestMap(pinMaps.get(npcId) ?? new Map()) ?? busiestMap(maps));
  return out;
}
