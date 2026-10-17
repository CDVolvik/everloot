/**
 * Raid buff and debuff table for one game build: for each entry on a curated list of names, every
 * spell with that name that applies an aura, and who the aura reaches (the caster, one target, the
 * caster's party, the raid, or everyone near). Read from SpellName, Spell, SpellEffect and SpellRadius
 * of a client snapshot. Game file data is Blizzard's: not published, not in the CC BY-SA release.
 */
import { z } from "zod";
import { LABEL, BuildStamp } from "./talents/catalog.js";
import type { Row, Rows, TableReader } from "./talents/build-catalog.js";

export const RAID_BUFF_SCHEMA = "everloot.raid-buffs/1";

export const Scope = z.enum(["self", "single", "party", "raid", "area", "enemy", "unknown"]);
export type Scope = z.infer<typeof Scope>;

/** The curated list: our own choice of what to look up. It holds names only, no game data. */
export const Curated = z.array(z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["buff", "debuff"]),
  /** Class that casts it; omit for effects several classes share. */
  class: z.string().optional(),
  /** Spell names to look up. A totem needs two: the spell that drops it and the aura it gives off. */
  names: z.array(z.string()).min(1),
}));
export type Curated = z.infer<typeof Curated>;

const Effect = z.object({
  index: z.number().int(),
  effect: z.number().int(),
  aura: z.number().int(),
  targets: z.tuple([z.number().int(), z.number().int()]),
  radiusYards: z.number().nullable(),
  scope: Scope,
});

export const RaidBuffTable = z.object({
  schema: z.literal(RAID_BUFF_SCHEMA),
  label: z.literal(LABEL),
  build: BuildStamp,
  entries: z.array(z.object({
    id: z.string(),
    label: z.string(),
    kind: z.enum(["buff", "debuff"]),
    class: z.string().nullable(),
    /** Widest reach among the entry's ranked spells ("Rank N"); with no ranked spell, among all its spells. */
    scope: Scope.nullable(),
    /** Spell count per scope. More than one key means ranks or variants disagree. */
    scopes: z.record(z.string(), z.number().int()),
    spells: z.array(z.object({
      spellId: z.number().int(),
      name: z.string(),
      rank: z.number().int().nullable(),
      scope: Scope,
      effects: z.array(Effect),
    })),
  })),
  /** Curated ids with no matching spell in this build (or none that applies an aura). */
  notFound: z.array(z.string()),
});
export type RaidBuffTable = z.infer<typeof RaidBuffTable>;

/** SpellEffect.Effect values that put an aura on someone: apply aura, persistent area, area party, area raid, area pet, area friend, area enemy, area owner. */
const AURA_EFFECTS = new Set([6, 27, 35, 65, 119, 128, 129, 143]);
/**
 * Reach order, widest first: the first match wins. "area" (everyone friendly within a radius, whatever
 * their group) sits low on purpose: it is how a "Greater" or "Prayer" cast hands a single-target buff
 * to many people through a helper spell that shares the buff's name, and it says nothing about party
 * or raid membership.
 */
const ORDER: Scope[] = ["raid", "party", "enemy", "single", "self", "area", "unknown"];
/**
 * Implicit target ids seen on the spells below. 20 and 56 were confirmed by the change they show
 * between Classic Era (Battle Shout targets 20, tooltip "party members") and build 1.60.1.70450 (56,
 * "party or raid members"). Other ids stay "unknown" until a spell on the list uses them.
 */
const TARGET_SCOPE: Record<number, Scope | undefined> = {
  1: "self", 20: "party", 56: "raid", 21: "single", 25: "single", 30: "area", 31: "area", 6: "enemy", 15: "enemy", 16: "enemy",
};
const EFFECT_SCOPE: Record<number, Scope | undefined> = { 35: "party", 65: "raid", 27: "area", 128: "area", 129: "enemy" };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const pair = (v: unknown): [number, number] => (Array.isArray(v) ? [num(v[0]), num(v[1])] : [num(v), 0]);
const widest = (scopes: Scope[]): Scope => ORDER.find((s) => scopes.includes(s)) ?? "unknown";

export function effectScope(effect: number, targets: [number, number]): Scope {
  const byEffect = EFFECT_SCOPE[effect];
  if (byEffect) return byEffect;
  const byTarget = targets.map((t) => TARGET_SCOPE[t]).filter((s): s is Scope => !!s);
  return byTarget.length ? widest(byTarget) : "unknown";
}

function rankOf(subtext: unknown): number | null {
  const m = typeof subtext === "string" ? /^Rank (\d+)$/.exec(subtext) : null;
  return m ? Number(m[1]) : null;
}

export function buildRaidBuffTable(get: TableReader, build: BuildStamp, curated: Curated): RaidBuffTable {
  const names = [...(get("SpellName")?.values() ?? [])];
  const spells: Rows = get("Spell") ?? new Map();
  const radius = new Map([...(get("SpellRadius")?.values() ?? [])].map((r) => [num(r.ID), num(r.Radius)]));
  const effectsBySpell = new Map<number, Row[]>();
  for (const e of get("SpellEffect")?.values() ?? []) {
    if (num(e.DifficultyID) !== 0 || !AURA_EFFECTS.has(num(e.Effect))) continue;
    effectsBySpell.set(num(e.SpellID), [...(effectsBySpell.get(num(e.SpellID)) ?? []), e]);
  }
  const idsByName = new Map<string, Row[]>();
  for (const r of names) {
    const n = r.Name_lang;
    if (typeof n === "string") idsByName.set(n, [...(idsByName.get(n) ?? []), r]);
  }

  const notFound: string[] = [];
  const entries: RaidBuffTable["entries"] = curated.map((c) => {
    const found = new Map<number, string>();
    for (const n of c.names) for (const r of idsByName.get(n) ?? []) found.set(num(r.ID), n);
    const list = [...found].sort((a, b) => a[0] - b[0]).flatMap(([spellId, name]) => {
      const raw = effectsBySpell.get(spellId);
      if (!raw?.length) return [];
      const effects = raw.sort((a, b) => num(a.EffectIndex) - num(b.EffectIndex)).map((e) => {
        const targets = pair(e.ImplicitTarget);
        const radii = pair(e.EffectRadiusIndex).map((i) => radius.get(i) ?? 0).filter((r) => r > 0);
        return {
          index: num(e.EffectIndex), effect: num(e.Effect), aura: num(e.EffectAura), targets,
          radiusYards: radii.length ? Math.max(...radii) : null, scope: effectScope(num(e.Effect), targets),
        };
      });
      return [{ spellId, name, rank: rankOf(spells.get(spellId)?.NameSubtext_lang), scope: widest(effects.map((e) => e.scope)), effects }];
    });
    if (!list.length) notFound.push(c.id);
    const ranked = list.filter((s) => s.rank !== null);
    const scope = list.length ? widest((ranked.length ? ranked : list).map((s) => s.scope)) : null;
    const scopes: Record<string, number> = {};
    for (const s of list) scopes[s.scope] = (scopes[s.scope] ?? 0) + 1;
    return { id: c.id, label: c.label, kind: c.kind, class: c.class ?? null, scope, scopes, spells: list };
  });
  return { schema: RAID_BUFF_SCHEMA, label: LABEL, build, entries, notFound };
}

export interface ScopeChange { id: string; label: string; before: Scope | null; after: Scope | null }

/** Entries whose scope differs between two builds (an entry on one side only counts as a change). */
export function diffRaidBuffs(before: RaidBuffTable, after: RaidBuffTable): ScopeChange[] {
  const a = new Map(before.entries.map((e) => [e.id, e]));
  const b = new Map(after.entries.map((e) => [e.id, e]));
  return [...new Set([...a.keys(), ...b.keys()])].sort().flatMap((id) => {
    const x = a.get(id)?.scope ?? null;
    const y = b.get(id)?.scope ?? null;
    return x === y ? [] : [{ id, label: (b.get(id) ?? a.get(id))!.label, before: x, after: y }];
  });
}
