// Words for the numbers in an item record (kb/src/assets/items.ts): quality, binding, slot, armour and
// weapon kind, stat kind. These are the client's own enumerations, as the WoWDev wiki documents them.
// A number this file does not know is printed as unknown, never guessed; a stat kind it does not know is left out.
import { tokens } from "@/design/tokens";
import { formatCopper } from "../../../kb/src/market";
import type { ItemRecord } from "../../../kb/src/assets/items";

export const PLACEHOLDER = "[?]";

export const QUALITY_NAMES = ["Poor", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Artifact", "Heirloom"] as const;

/** Item name colour on the always-dark tooltip: the dark theme's quality colours, then the game's for 6 and 7. */
export function qualityColor(q: number): string {
  const named = ["poor", "common", "uncommon", "rare", "epic", "legendary"] as const;
  if (q >= 0 && q < named.length) return tokens.dark[`q-${named[q]}`];
  return q === 6 ? "#E6CC80" : q === 7 ? "#00CCFF" : tokens.dark["q-common"];
}

const BINDING: Record<number, string> = { 1: "Binds when picked up", 2: "Binds when equipped", 3: "Binds when used", 4: "Quest Item" };

const SLOT: Record<number, string> = {
  1: "Head", 2: "Neck", 3: "Shoulder", 4: "Shirt", 5: "Chest", 6: "Waist", 7: "Legs", 8: "Feet", 9: "Wrist", 10: "Hands",
  11: "Finger", 12: "Trinket", 13: "One-Hand", 14: "Off Hand", 15: "Ranged", 16: "Back", 17: "Two-Hand", 18: "Bag", 19: "Tabard",
  20: "Chest", 21: "Main Hand", 22: "Off Hand", 23: "Held In Off-hand", 24: "Projectile", 25: "Thrown", 26: "Ranged", 28: "Relic",
};

const WEAPON: Record<number, string> = {
  0: "Axe", 1: "Axe", 2: "Bow", 3: "Gun", 4: "Mace", 5: "Mace", 6: "Polearm", 7: "Sword", 8: "Sword", 10: "Staff",
  13: "Fist Weapon", 14: "Miscellaneous", 15: "Dagger", 16: "Thrown", 18: "Crossbow", 19: "Wand", 20: "Fishing Pole",
};
const ARMOR: Record<number, string> = { 1: "Cloth", 2: "Leather", 3: "Mail", 4: "Plate", 6: "Shield", 7: "Libram", 8: "Idol", 9: "Totem" };
/** Armor subclasses that carry an armor value (cloth to plate, shields), and the slots that never do (shirt, tabard). */
const ARMORED = new Set([1, 2, 3, 4, 6]);
const NO_ARMOR_SLOT = new Set([4, 19]);

const STAT: Record<number, string> = {
  1: "Health", 3: "Agility", 4: "Strength", 5: "Intellect", 6: "Spirit", 7: "Stamina", 12: "Defense Rating", 13: "Dodge Rating",
  14: "Parry Rating", 15: "Block Rating", 31: "Hit Rating", 32: "Critical Strike Rating", 35: "Resilience Rating", 36: "Haste Rating",
  37: "Expertise Rating", 38: "Attack Power", 43: "Mana Regeneration", 45: "Spell Power",
};

/** Item class 2 is weapons, 4 armour; other classes carry no kind on the slot line. */
function kind(c: number | null, sc: number | null): string | null {
  if (c === 2 && sc !== null) return WEAPON[sc] ?? null;
  if (c === 4 && sc !== null && sc > 0) return ARMOR[sc] ?? null;
  return null;
}

export interface ItemTipText {
  name: string;
  quality: string;
  /** The tooltip's lines under the name, in the game's order. */
  lines: string[];
  /** True when a line holds the placeholder for a value the tables do not give (damage, armor, stat amounts). */
  partial: boolean;
  /** Why each kind of placeholder is there, in plain words: one line per kind the tooltip holds. */
  why: string[];
}

/** What a placeholder stands for, by kind. A reason says what the files lack, never only that a value is unknown. */
export const WHY = {
  stats: `${PLACEHOLDER} stat amounts: this build's item tables name the stats but hold no amounts; the game works them out from tables we do not read.`,
  armor: `${PLACEHOLDER} armor: this build's item tables hold no armor value; the game works it out from tables we do not read.`,
  damage: `${PLACEHOLDER} damage: the game works it out from its weapon damage tables, the weapon speed and its own rounding. No range is shown until one is checked against the game's own tooltip.`,
  effect: `${PLACEHOLDER} in a Use, Equip or Chance on hit line: a value the spell tables we read do not give.`,
  restriction: `${PLACEHOLDER} in a restriction: the game files give the requirement but not its name.`,
  set: `${PLACEHOLDER} set: the game files list the item in a set but give the set no name.`,
  older: `${PLACEHOLDER} restrictions, set and Use and Equip lines: the item file the site reads was written before these were read from the game files.`,
} as const;

/** The tooltip's lines and then the reasons for its placeholders, as every item card shows them. */
export const tipLines = (t: Pick<ItemTipText, "lines" | "why">): string[] => [...t.lines, ...t.why];

/**
 * The tooltip of an item as the game lays it out, from what the record holds. Damage, armor and stat amounts are not
 * in the tables: `[?]`, with the reason under the lines. A record from before 2026-10-22 has no restriction, set or
 * Use and Equip lines, and gets `[?]` for those.
 */
export function itemTipText(r: ItemRecord): ItemTipText {
  const lines: string[] = [];
  const why = new Set<string>();
  if (BINDING[r.b]) lines.push(BINDING[r.b]);
  if (r.lc) lines.push(r.lc);
  else if (r.u === 1) lines.push("Unique");
  const slot = SLOT[r.s];
  const k = kind(r.c, r.sc);
  if (slot || k) lines.push([slot, k].filter(Boolean).join(" · "));
  // A weapon's damage is not in the 1.60.1 item tables (the client works it out from ItemDamage*), so its
  // damage and per-second lines carry the placeholder; the speed sits beside the damage, as in the game.
  const weapon = r.c === 2 && r.d > 0;
  const speed = r.d > 0 ? `Speed ${(r.d / 1000).toFixed(2)}` : null;
  if (weapon) lines.push(`${PLACEHOLDER} - ${PLACEHOLDER} Damage · ${speed}`, `(${PLACEHOLDER} damage per second)`);
  else if (speed) lines.push(speed);
  // Cloth, leather, mail, plate and shields always carry armor in the game; its amount is not in the tables either.
  const armor = r.c === 4 && r.sc !== null && ARMORED.has(r.sc) && !NO_ARMOR_SLOT.has(r.s);
  if (armor) lines.push(`${PLACEHOLDER} Armor`);
  // A stat kind this file has no word for is left out rather than printed as "unknown stat 51".
  const stats = r.st.filter((s) => STAT[s]);
  for (const s of stats) lines.push(`+${PLACEHOLDER} ${STAT[s]}`);
  if (stats.length) why.add(WHY.stats);
  if (armor) why.add(WHY.armor);
  if (weapon) why.add(WHY.damage);
  const known = r.cr !== undefined && r.rq !== undefined && r.fx !== undefined;
  // Classes and races, then the level, then the skill, spell and reputation, then the effects and the set, as the game orders them.
  lines.push(...(r.cr ?? []));
  if (r.r > 1) lines.push(`Requires Level ${r.r}`);
  lines.push(...(r.rq ?? []));
  if ([r.lc ?? "", ...(r.cr ?? []), ...(r.rq ?? [])].some((l) => l.includes(PLACEHOLDER))) why.add(WHY.restriction);
  if (r.l > 0) lines.push(`Item Level ${r.l}`);
  lines.push(...(r.fx ?? []));
  if (r.fx?.some((l) => l.includes(PLACEHOLDER))) why.add(WHY.effect);
  if (r.is) lines.push(`Set: ${r.is.n ?? PLACEHOLDER}`);
  if (r.is && !r.is.n) why.add(WHY.set);
  if (!known) {
    lines.push(`Restrictions: ${PLACEHOLDER}`, `Set: ${PLACEHOLDER}`, `Equip and Use: ${PLACEHOLDER}`);
    why.add(WHY.older);
  }
  if (r.t) lines.push(`"${r.t}"`);
  if (r.sp > 0) lines.push(`Sell Price: ${formatCopper(r.sp)}`);
  return { name: r.n, quality: QUALITY_NAMES[r.q] ?? `quality ${r.q}`, lines, partial: why.size > 0, why: [...why] };
}
