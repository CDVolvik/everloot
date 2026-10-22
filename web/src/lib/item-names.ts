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

/** How an item's spell effect triggers (ItemEffect.TriggerType), as its tooltip line begins. */
const TRIGGER: Record<number, string> = { 0: "Use", 1: "Equip", 2: "Chance on hit", 5: "Use" };

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
}

/** The tooltip of an item as the game lays it out, from what the record holds. Damage, armor and stat amounts are not in the tables: `[?]`. */
export function itemTipText(r: ItemRecord): ItemTipText {
  const lines: string[] = [];
  if (BINDING[r.b]) lines.push(BINDING[r.b]);
  if (r.u === 1) lines.push("Unique");
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
  if (r.cl?.length) lines.push(`Classes: ${r.cl.join(", ")}`);
  if (r.r > 1) lines.push(`Requires Level ${r.r}`);
  if (r.l > 0) lines.push(`Item Level ${r.l}`);
  for (const e of r.fx ?? []) lines.push(`${TRIGGER[e.k] ?? "Use"}: ${e.x}`);
  if (r.set) lines.push(r.set);
  if (r.t) lines.push(`"${r.t}"`);
  if (r.sp > 0) lines.push(`Sell Price: ${formatCopper(r.sp)}`);
  return { name: r.n, quality: QUALITY_NAMES[r.q] ?? `quality ${r.q}`, lines, partial: stats.length > 0 || weapon || armor };
}
