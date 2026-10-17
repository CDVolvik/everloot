// Raid builder logic: slots, coverage math and the share code. No React, no browser calls,
// so the tests run it as plain functions. The rules come from a BuffTable (data/raid-buffs.ts).
import { CLASSES } from "@/design/tokens";
import type { BuffEntry, BuffTable, Family } from "@/data/game-data/raid";

export const SIZES = [10, 20, 40] as const;
export type Size = (typeof SIZES)[number];
export const GROUP_SIZE = 5;

export type ClassName = (typeof CLASSES)[number];

/** Tree names for a class, in the client's order, from the build's game file extract. Tree 0 in a slot means "any". */
export const treeNames = (table: BuffTable, c: ClassName): string[] => table.trees[c] ?? [];

export interface Slot {
  class: ClassName;
  /** 0 = any tree. */
  tree: 0 | 1 | 2 | 3;
}
export type Slots = (Slot | null)[];

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function emptySlots(size: Size): Slots {
  return Array.from({ length: size }, () => null);
}

/** Keep the first `size` slots and pad with empty ones. */
export function resize(slots: Slots, size: Size): Slots {
  return [...slots.slice(0, size), ...emptySlots(size).slice(slots.length)];
}

export function groupsOf(slots: Slots): Slots[] {
  const groups: Slots[] = [];
  for (let i = 0; i < slots.length; i += GROUP_SIZE) groups.push(slots.slice(i, i + GROUP_SIZE));
  return groups;
}

/* ---------- Coverage ---------- */

/**
 * covered: the scope reaches this group and a picked class brings it.
 * cast: a picked class brings it, but it is cast on one player at a time (or a group of nearby players).
 * unknown: someone brings it, but how far it reaches is not known for this build.
 * missing: no picked class brings it.
 */
export type State = "covered" | "cast" | "unknown" | "missing";

const RANK: Record<State, number> = { covered: 3, cast: 2, unknown: 1, missing: 0 };
const best = (a: State, b: State): State => (RANK[a] >= RANK[b] ? a : b);

const brings = (slots: Slots, entry: BuffEntry) => slots.some((s) => s?.class === entry.class);

/** How one entry stands for a set of slots it could reach. `group` is the slots of one group. */
function entryState(entry: BuffEntry, everyone: Slots, group: Slots): State {
  // Who can bring it: a party effect needs a provider in the group, anything else needs one in the raid.
  if (!brings(entry.scope === "party" ? group : everyone, entry)) return "missing";
  switch (entry.scope) {
    case "raid":
    case "party":
    case "enemy":
      return "covered";
    case "single":
    case "area":
      return "cast";
    default:
      return "unknown";
  }
}

export interface FamilyCoverage {
  family: Family;
  /** One state per group, in group order. Debuffs are raid-wide, so every group shows the same. */
  groups: State[];
  /** The raid as a whole: covered only when every group is covered, otherwise the weakest group. */
  raid: State;
  /** The entries behind the best state, for the label and the build's evidence. */
  entries: BuffEntry[];
}

export interface Coverage {
  buffs: FamilyCoverage[];
  debuffs: FamilyCoverage[];
  /** Counts for the headline, over buffs. */
  summary: Record<State, number>;
}

const entriesIn = (table: BuffTable, family: string) => table.entries.filter((e) => e.family === family && e.scope !== "self");

export function coverage(slots: Slots, table: BuffTable): Coverage {
  const groups = groupsOf(slots);
  const compute = (family: Family): FamilyCoverage => {
    const entries = entriesIn(table, family.id);
    const perGroup = groups.map((group) =>
      entries.reduce<State>((state, e) => best(state, entryState(e, slots, group)), "missing"),
    );
    const raid = perGroup.reduce<State>((weakest, s) => (RANK[s] < RANK[weakest] ? s : weakest), perGroup[0] ?? "missing");
    return { family, groups: perGroup, raid, entries };
  };
  const all = table.families.filter((f) => entriesIn(table, f.id).length > 0).map(compute);
  const buffs = all.filter((f) => f.family.kind === "buff");
  const summary: Record<State, number> = { covered: 0, cast: 0, unknown: 0, missing: 0 };
  for (const b of buffs) summary[b.raid]++;
  return { buffs, debuffs: all.filter((f) => f.family.kind === "debuff"), summary };
}

export const STATE_LABEL: Record<State, string> = {
  covered: "Yes",
  cast: "By cast",
  unknown: "Unknown reach",
  missing: "Missing",
};

/* ---------- Share code ---------- */

/**
 * ELR1-<size>-<build>-<payload>
 *   size     10, 20 or 40
 *   build    game build the rules were read for, e.g. 1.60.1.70450
 *   payload  base64url, no padding, of two digits per slot: class (1-9) then tree (0-3); "00" is empty.
 *            Trailing empty slots are left out.
 * Class numbers follow CLASSES (tokens.ts): warrior 1, paladin 2, hunter 3, rogue 4, priest 5, shaman 6,
 * mage 7, warlock 8, druid 9. Changing that order, or the digits, needs ELR2.
 * It is separate from the talent code (EL1-...), so each reader refuses the other's codes.
 */
export const SHARE_VERSION = 1;
const PREFIX = `ELR${SHARE_VERSION}`;

export interface RaidCode {
  size: Size;
  build: string;
  slots: Slots;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encode64(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 3) {
    const a = text.charCodeAt(i), b = text.charCodeAt(i + 1), c = text.charCodeAt(i + 2);
    const n = a * 65536 + (b || 0) * 256 + (c || 0);
    const chars = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63];
    const keep = i + 2 < text.length ? 4 : i + 1 < text.length ? 3 : 2;
    for (let k = 0; k < keep; k++) out += B64[chars[k]];
  }
  return out;
}

function decode64(text: string): string | null {
  if (text.length % 4 === 1) return null;
  let out = "";
  for (let i = 0; i < text.length; i += 4) {
    let n = 0, count = 0;
    for (let k = i; k < Math.min(i + 4, text.length); k++) {
      const v = B64.indexOf(text[k]);
      if (v < 0) return null;
      n = n * 64 + v;
      count++;
    }
    for (let k = count; k < 4; k++) n *= 64;
    const bytes = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (let k = 0; k < count - 1; k++) out += String.fromCharCode(bytes[k]);
  }
  return out;
}

const BUILD_SHAPE = /^\d+\.[\d.]*\d$/;
export const validBuild = (build: string) => BUILD_SHAPE.test(build) && !build.includes("..");

export function encodeRaid({ size, build, slots }: RaidCode): string {
  let text = slots
    .slice(0, size)
    .map((s) => (s ? `${CLASSES.indexOf(s.class) + 1}${s.tree}` : "00"))
    .join("");
  text = text.replace(/(?:00)+$/, "");
  return `${PREFIX}-${size}-${build}-${encode64(text)}`;
}

/** Pull a raid code out of pasted text: a bare code, or a link that carries one in its fragment. */
export function findCode(text: string): string {
  return /ELR\d+-\d+-[\d.]+-[\w-]*/.exec(text)?.[0] ?? text.trim();
}

export type Decoded = { ok: true; value: RaidCode } | { ok: false; error: string };

export function decodeRaid(input: string): Decoded {
  const code = input.trim().replace(/=+$/, "");
  const m = /^ELR(\d+)-(\d+)-([\d.]+)-([\w-]*)$/.exec(code);
  if (!m) return { ok: false, error: "That is not an Everloot raid code (ELR1-size-build-slots)." };
  if (Number(m[1]) !== SHARE_VERSION) {
    return { ok: false, error: `Raid code version ${m[1]} is newer than this page reads (version ${SHARE_VERSION}).` };
  }
  const size = Number(m[2]);
  if (!(SIZES as readonly number[]).includes(size)) return { ok: false, error: "The raid size in the code is not 10, 20 or 40." };
  if (!validBuild(m[3])) return { ok: false, error: "The build in the code is damaged." };
  const text = decode64(m[4]);
  if (text === null || text.length % 2 !== 0 || text.length > size * 2 || !/^\d*$/.test(text)) {
    return { ok: false, error: "The slots in the code are damaged." };
  }
  const slots = emptySlots(size as Size);
  for (let i = 0; i < text.length / 2; i++) {
    const c = Number(text[i * 2]);
    const t = Number(text[i * 2 + 1]);
    if (c === 0 && t === 0) continue;
    if (c < 1 || c > CLASSES.length || t > 3) return { ok: false, error: "The slots in the code are damaged." };
    slots[i] = { class: CLASSES[c - 1], tree: t as Slot["tree"] };
  }
  return { ok: true, value: { size: size as Size, build: m[3], slots } };
}
