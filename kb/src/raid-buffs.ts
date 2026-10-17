/**
 * Raid buff and debuff table for one game build: for each entry on a curated list of spell ids, the
 * spells that apply an aura, and who the aura reaches (the caster, one target, the caster's party, the
 * raid, or everyone near). Read from SpellName, Spell, SpellEffect and SpellRadius of a client
 * snapshot. Game file data is Blizzard's: not published, not in the CC BY-SA release.
 */
import { z } from "zod";
import { LABEL, BuildStamp } from "./talents/catalog.js";
import type { Row, Rows, TableReader } from "./talents/build-catalog.js";

export const RAID_BUFF_SCHEMA = "everloot.raid-buffs/2";

export const Scope = z.enum(["self", "single", "party", "raid", "area", "enemy", "unknown"]);
export type Scope = z.infer<typeof Scope>;

/** The curated list: our own choice of what to look up. It holds spell ids and labels, no game data. */
export const Curated = z.array(z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["buff", "debuff"]),
  /** Class that casts it; omit for effects several classes share. */
  class: z.string().optional(),
  /** The spells that give the aura: the ranks a player can learn. A totem lists the ranks of the aura it gives off, not the spell that drops it. */
  spells: z.array(z.number().int()).min(1),
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
    /** The scope every listed spell shares, "mixed" when they differ (see `byRank`), null when none was found. */
    scope: z.union([Scope, z.literal("mixed")]).nullable(),
    /** Scope per rank, lowest rank first. Rank null: spells without a "Rank N" subtext. */
    byRank: z.array(z.object({ rank: z.number().int().nullable(), spellIds: z.array(z.number().int()), scope: z.union([Scope, z.literal("mixed")]) })),
    spells: z.array(z.object({
      spellId: z.number().int(),
      name: z.string().nullable(),
      rank: z.number().int().nullable(),
      scope: Scope,
      effects: z.array(Effect),
    })),
    /** Listed ids with no aura effect in this build (not shipped, or in an encrypted block). */
    missingSpells: z.array(z.number().int()),
  })),
  /** Curated ids for which not one spell was found. */
  notFound: z.array(z.string()),
});
export type RaidBuffTable = z.infer<typeof RaidBuffTable>;

/** SpellEffect.Effect values that put an aura on someone: apply aura, persistent area, area party, area raid, area pet, area friend, area enemy, area owner. */
const AURA_EFFECTS = new Set([6, 27, 35, 65, 119, 128, 129, 143]);
/**
 * Widest reach first: the first match wins. "unknown" sits above single and self so that a target we
 * cannot read is never hidden behind a reading we can. "area" (everyone friendly within a radius,
 * whatever their group) is last: it says nothing about party or raid membership.
 */
const ORDER: Scope[] = ["raid", "party", "enemy", "unknown", "single", "self", "area"];
/**
 * Implicit target ids seen on the spells on the list. 20 and 56 were confirmed by the change they show
 * between Classic Era (Battle Shout targets 20, tooltip "party members") and build 1.60.1.70450 (56,
 * "party or raid members"). Any other id makes the spell "unknown".
 */
const TARGET_SCOPE: Record<number, Scope | undefined> = {
  1: "self", 20: "party", 56: "raid", 21: "single", 25: "single", 30: "area", 31: "area", 6: "enemy", 15: "enemy", 16: "enemy",
};
/** Targets that name no one: none, or a position (the caster's) that an area target is measured from. */
const NEUTRAL_TARGETS = new Set([0, 18, 22]);
const EFFECT_SCOPE: Record<number, Scope | undefined> = { 35: "party", 65: "raid", 27: "area", 128: "area", 129: "enemy" };
/** Targets that agree with an area aura effect: the caster it is centred on, or the same reach. */
const AGREES: Record<string, Scope[]> = {
  party: ["self", "area", "party"], raid: ["self", "area", "raid"], area: ["self", "area"], enemy: ["enemy", "area"],
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const pair = (v: unknown): [number, number] => (Array.isArray(v) ? [num(v[0]), num(v[1])] : [num(v), 0]);
const widest = (scopes: Scope[]): Scope => ORDER.find((s) => scopes.includes(s)) ?? "unknown";

/**
 * Who an effect reaches. The target ids are read first and an id we do not know makes it "unknown".
 * An area aura effect type (party, raid) must agree with them; when they disagree it is "unknown".
 */
export function effectScope(effect: number, targets: [number, number]): Scope {
  const ids = targets.filter((t) => !NEUTRAL_TARGETS.has(t));
  if (ids.some((t) => TARGET_SCOPE[t] === undefined)) return "unknown";
  const byTarget = ids.map((t) => TARGET_SCOPE[t]!);
  const byEffect = EFFECT_SCOPE[effect];
  if (byEffect) return byTarget.every((s) => AGREES[byEffect].includes(s)) ? byEffect : "unknown";
  return byTarget.length ? widest(byTarget) : "unknown";
}

function rankOf(subtext: unknown): number | null {
  const m = typeof subtext === "string" ? /^Rank (\d+)$/.exec(subtext) : null;
  return m ? Number(m[1]) : null;
}

const same = (scopes: Scope[]): Scope | "mixed" => (new Set(scopes).size === 1 ? scopes[0] : "mixed");

export function buildRaidBuffTable(get: TableReader, build: BuildStamp, curated: Curated): RaidBuffTable {
  const names = new Map([...(get("SpellName")?.values() ?? [])].map((r) => [num(r.ID), typeof r.Name_lang === "string" ? r.Name_lang : null]));
  const spells: Rows = get("Spell") ?? new Map();
  const radius = new Map([...(get("SpellRadius")?.values() ?? [])].map((r) => [num(r.ID), num(r.Radius)]));
  const effectsBySpell = new Map<number, Row[]>();
  for (const e of get("SpellEffect")?.values() ?? []) {
    if (num(e.DifficultyID) !== 0 || !AURA_EFFECTS.has(num(e.Effect))) continue;
    effectsBySpell.set(num(e.SpellID), [...(effectsBySpell.get(num(e.SpellID)) ?? []), e]);
  }

  const notFound: string[] = [];
  const entries: RaidBuffTable["entries"] = curated.map((c) => {
    const missingSpells: number[] = [];
    const list = [...new Set(c.spells)].sort((a, b) => a - b).flatMap((spellId) => {
      const raw = effectsBySpell.get(spellId);
      if (!raw?.length) { missingSpells.push(spellId); return []; }
      const effects = [...raw].sort((a, b) => num(a.EffectIndex) - num(b.EffectIndex)).map((e) => {
        const targets = pair(e.ImplicitTarget);
        const radii = pair(e.EffectRadiusIndex).map((i) => radius.get(i) ?? 0).filter((r) => r > 0);
        return {
          index: num(e.EffectIndex), effect: num(e.Effect), aura: num(e.EffectAura), targets,
          radiusYards: radii.length ? Math.max(...radii) : null, scope: effectScope(num(e.Effect), targets),
        };
      });
      return [{ spellId, name: names.get(spellId) ?? null, rank: rankOf(spells.get(spellId)?.NameSubtext_lang), scope: widest(effects.map((e) => e.scope)), effects }];
    });
    if (!list.length) notFound.push(c.id);
    const ranks = [...new Set(list.map((s) => s.rank))].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
    const byRank = ranks.map((rank) => {
      const at = list.filter((s) => s.rank === rank);
      return { rank, spellIds: at.map((s) => s.spellId), scope: same(at.map((s) => s.scope)) };
    });
    return { id: c.id, label: c.label, kind: c.kind, class: c.class ?? null, scope: list.length ? same(list.map((s) => s.scope)) : null, byRank, spells: list, missingSpells };
  });
  return { schema: RAID_BUFF_SCHEMA, label: LABEL, build, entries, notFound };
}

export interface ScopeChange {
  id: string; label: string;
  before: Scope | "mixed" | null; after: Scope | "mixed" | null;
  /** Scope per rank on each side, e.g. "1:party 2:party". Differs even when `before` and `after` are both "mixed". */
  beforeRanks: string; afterRanks: string;
}

const ranksOf = (e: RaidBuffTable["entries"][number] | undefined): string => (e?.byRank ?? []).map((r) => `${r.rank ?? "-"}:${r.scope}`).join(" ");

/** Entries whose scope, or scope of any rank, differs between two builds (an entry on one side only counts as a change). */
export function diffRaidBuffs(before: RaidBuffTable, after: RaidBuffTable): ScopeChange[] {
  const a = new Map(before.entries.map((e) => [e.id, e]));
  const b = new Map(after.entries.map((e) => [e.id, e]));
  return [...new Set([...a.keys(), ...b.keys()])].sort().flatMap((id) => {
    const x = a.get(id)?.scope ?? null;
    const y = b.get(id)?.scope ?? null;
    const [rx, ry] = [ranksOf(a.get(id)), ranksOf(b.get(id))];
    return x === y && rx === ry ? [] : [{ id, label: (b.get(id) ?? a.get(id))!.label, before: x, after: y, beforeRanks: rx, afterRanks: ry }];
  });
}
