// Raid buffs and debuffs for the raid builder, written by hand for one game build.
//
// This is NOT the extracted table. The table `client-catalog` writes (kb/src/raid-buffs.ts) is Blizzard's
// game file data and stays on a maintainer's machine until docs/DATA_POLICY.md approves publishing it.
// This file holds only our own choices: which effects to track, which classes bring them, and how far
// each one reaches on build 70450, as far as the raid-buff docs and patch notes say. Nothing in it is
// copied from the game files or from another site. It carries no spell ids or icons.
//
// Where `evidence` is "patch-notes", the reach was widened to the whole raid in build 70425 (SeeMeta
// patch notes, and the build 70450 client table for Battle Shout: target 56, "party or raid members").
// Where it is "classic-assumed", the reach is how Classic Era behaves and nobody has checked it on
// build 70450. Where the scope is "unknown", we do not know. Every row is unconfirmed until an in-game
// pass. `adaptGenerated` in lib/raid.ts swaps in the extracted table once it may be published.

export type Scope = "self" | "single" | "party" | "raid" | "area" | "enemy" | "unknown";
export type Evidence = "patch-notes" | "classic-assumed" | "client-table" | "not-in-table";
export type Kind = "buff" | "debuff";

/** A class (and optionally a talent tree) that can bring an effect. `tree` is 1 to 3, in Classic Era's tree order. */
export interface Provider {
  class: string;
  tree?: 1 | 2 | 3;
}

export interface BuffEntry {
  id: string;
  label: string;
  /** Effects in one family do not stack, so the page counts the family once. */
  family: string;
  scope: Scope;
  evidence: Evidence;
  providers: Provider[];
  /** Aura names the addon looks for. English client names; spell ids arrive with the generated table. */
  names: string[];
  spellIds?: number[];
}

export interface Family {
  id: string;
  label: string;
  kind: Kind;
}

export interface BuffTable {
  build: string;
  /** What the page shows next to the build. */
  label: string;
  families: Family[];
  entries: BuffEntry[];
}

export const RAID_BUFF_LABEL = "Unconfirmed: a hand-checked list, not read from game files";
export const CURRENT_BUILD = "1.60.1.70450";

const FAMILIES: Family[] = [
  { id: "battle-shout", label: "Battle Shout", kind: "buff" },
  { id: "trueshot-aura", label: "Trueshot Aura", kind: "buff" },
  { id: "leader-of-the-pack", label: "Leader of the Pack", kind: "buff" },
  { id: "mark-of-the-wild", label: "Mark of the Wild", kind: "buff" },
  { id: "arcane-intellect", label: "Arcane Intellect", kind: "buff" },
  { id: "fortitude", label: "Power Word: Fortitude", kind: "buff" },
  { id: "spirit", label: "Divine Spirit", kind: "buff" },
  { id: "might", label: "Blessing of Might", kind: "buff" },
  { id: "kings", label: "Blessing of Kings", kind: "buff" },
  { id: "wisdom", label: "Blessing of Wisdom", kind: "buff" },
  { id: "salvation", label: "Blessing of Salvation", kind: "buff" },
  { id: "sanctuary", label: "Blessing of Sanctuary", kind: "buff" },
  { id: "devotion-aura", label: "Devotion Aura", kind: "buff" },
  { id: "retribution-aura", label: "Retribution Aura", kind: "buff" },
  { id: "concentration-aura", label: "Concentration Aura", kind: "buff" },
  { id: "sanctity-aura", label: "Sanctity Aura", kind: "buff" },
  { id: "strength-of-earth", label: "Strength of Earth Totem", kind: "buff" },
  { id: "grace-of-air", label: "Grace of Air Totem", kind: "buff" },
  { id: "windfury", label: "Windfury Totem", kind: "buff" },
  { id: "flametongue", label: "Flametongue Totem", kind: "buff" },
  { id: "fire-resistance-totem", label: "Fire Resistance Totem", kind: "buff" },
  { id: "mana-spring", label: "Mana Spring Totem", kind: "buff" },
  { id: "tranquil-air", label: "Tranquil Air Totem", kind: "buff" },
  { id: "healing-stream", label: "Healing Stream Totem", kind: "buff" },
  { id: "blood-pact", label: "Blood Pact", kind: "buff" },
  { id: "sunder-armor", label: "Sunder Armor", kind: "debuff" },
  { id: "demoralizing-shout", label: "Demoralizing Shout", kind: "debuff" },
  { id: "thunder-clap", label: "Thunder Clap", kind: "debuff" },
  { id: "faerie-fire", label: "Faerie Fire", kind: "debuff" },
  { id: "demoralizing-roar", label: "Demoralizing Roar", kind: "debuff" },
  { id: "curse-of-the-elements", label: "Curse of the Elements", kind: "debuff" },
  { id: "curse-of-recklessness", label: "Curse of Recklessness", kind: "debuff" },
  { id: "curse-of-weakness", label: "Curse of Weakness", kind: "debuff" },
  { id: "curse-of-tongues", label: "Curse of Tongues", kind: "debuff" },
  { id: "expose-armor", label: "Expose Armor", kind: "debuff" },
  { id: "winters-chill", label: "Winter's Chill", kind: "debuff" },
  { id: "judgement-of-light", label: "Judgement of Light", kind: "debuff" },
];

type Row = [id: string, label: string, family: string, scope: Scope, evidence: Evidence, providers: Provider[], names: string[]];

const w = (c: string, tree?: 1 | 2 | 3): Provider => (tree ? { class: c, tree } : { class: c });

// Tree numbers follow Classic Era's three trees per class (see CLASS_TREES in lib/raid.ts). Forever's own
// tree order comes from the talent catalog, which is not published, so a tree gate here is a Classic Era
// assumption too.
const ROWS: Row[] = [
  ["battle-shout", "Battle Shout", "battle-shout", "raid", "patch-notes", [w("warrior")], ["Battle Shout"]],
  ["trueshot-aura", "Trueshot Aura", "trueshot-aura", "raid", "patch-notes", [w("hunter", 2)], ["Trueshot Aura"]],
  ["leader-of-the-pack", "Leader of the Pack", "leader-of-the-pack", "party", "classic-assumed", [w("druid", 2)], ["Leader of the Pack"]],
  ["mark-of-the-wild", "Mark of the Wild", "mark-of-the-wild", "single", "classic-assumed", [w("druid")], ["Mark of the Wild"]],
  ["gift-of-the-wild", "Gift of the Wild", "mark-of-the-wild", "unknown", "classic-assumed", [w("druid")], ["Gift of the Wild"]],
  ["arcane-intellect", "Arcane Intellect", "arcane-intellect", "single", "classic-assumed", [w("mage")], ["Arcane Intellect"]],
  ["arcane-brilliance", "Arcane Brilliance", "arcane-intellect", "unknown", "classic-assumed", [w("mage")], ["Arcane Brilliance"]],
  ["power-word-fortitude", "Power Word: Fortitude", "fortitude", "single", "classic-assumed", [w("priest")], ["Power Word: Fortitude"]],
  ["prayer-of-fortitude", "Prayer of Fortitude", "fortitude", "unknown", "classic-assumed", [w("priest")], ["Prayer of Fortitude"]],
  ["divine-spirit", "Divine Spirit", "spirit", "single", "classic-assumed", [w("priest", 1)], ["Divine Spirit"]],
  ["prayer-of-spirit", "Prayer of Spirit", "spirit", "unknown", "classic-assumed", [w("priest", 1)], ["Prayer of Spirit"]],
  ["blessing-of-might", "Blessing of Might", "might", "single", "classic-assumed", [w("paladin")], ["Blessing of Might"]],
  ["greater-blessing-of-might", "Greater Blessing of Might", "might", "unknown", "classic-assumed", [w("paladin")], ["Greater Blessing of Might"]],
  ["blessing-of-kings", "Blessing of Kings", "kings", "single", "classic-assumed", [w("paladin", 2)], ["Blessing of Kings"]],
  ["greater-blessing-of-kings", "Greater Blessing of Kings", "kings", "unknown", "classic-assumed", [w("paladin", 2)], ["Greater Blessing of Kings"]],
  ["blessing-of-wisdom", "Blessing of Wisdom", "wisdom", "single", "classic-assumed", [w("paladin")], ["Blessing of Wisdom"]],
  ["greater-blessing-of-wisdom", "Greater Blessing of Wisdom", "wisdom", "unknown", "classic-assumed", [w("paladin")], ["Greater Blessing of Wisdom"]],
  ["blessing-of-salvation", "Blessing of Salvation", "salvation", "single", "classic-assumed", [w("paladin")], ["Blessing of Salvation"]],
  ["greater-blessing-of-salvation", "Greater Blessing of Salvation", "salvation", "unknown", "classic-assumed", [w("paladin")], ["Greater Blessing of Salvation"]],
  ["blessing-of-sanctuary", "Blessing of Sanctuary", "sanctuary", "single", "classic-assumed", [w("paladin", 2)], ["Blessing of Sanctuary"]],
  ["devotion-aura", "Devotion Aura", "devotion-aura", "party", "classic-assumed", [w("paladin")], ["Devotion Aura"]],
  ["retribution-aura", "Retribution Aura", "retribution-aura", "party", "classic-assumed", [w("paladin")], ["Retribution Aura"]],
  ["concentration-aura", "Concentration Aura", "concentration-aura", "party", "classic-assumed", [w("paladin")], ["Concentration Aura"]],
  ["sanctity-aura", "Sanctity Aura", "sanctity-aura", "unknown", "classic-assumed", [w("paladin", 3)], ["Sanctity Aura"]],
  ["strength-of-earth-totem", "Strength of Earth Totem", "strength-of-earth", "raid", "patch-notes", [w("shaman")], ["Strength of Earth Totem", "Strength of Earth"]],
  ["grace-of-air-totem", "Grace of Air Totem", "grace-of-air", "raid", "patch-notes", [w("shaman")], ["Grace of Air Totem", "Grace of Air"]],
  ["windfury-totem", "Windfury Totem", "windfury", "raid", "patch-notes", [w("shaman")], ["Windfury Totem", "Windfury"]],
  ["flametongue-totem", "Flametongue Totem", "flametongue", "raid", "patch-notes", [w("shaman")], ["Flametongue Totem", "Flametongue"]],
  ["fire-resistance-totem", "Fire Resistance Totem", "fire-resistance-totem", "raid", "patch-notes", [w("shaman")], ["Fire Resistance Totem", "Fire Resistance"]],
  ["mana-spring-totem", "Mana Spring Totem", "mana-spring", "party", "classic-assumed", [w("shaman")], ["Mana Spring Totem", "Mana Spring"]],
  ["tranquil-air-totem", "Tranquil Air Totem", "tranquil-air", "party", "classic-assumed", [w("shaman")], ["Tranquil Air Totem", "Tranquil Air"]],
  ["healing-stream-totem", "Healing Stream Totem", "healing-stream", "party", "classic-assumed", [w("shaman")], ["Healing Stream Totem", "Healing Stream"]],
  ["blood-pact", "Blood Pact", "blood-pact", "unknown", "classic-assumed", [w("warlock")], ["Blood Pact"]],
  ["sunder-armor", "Sunder Armor", "sunder-armor", "enemy", "classic-assumed", [w("warrior")], ["Sunder Armor"]],
  ["demoralizing-shout", "Demoralizing Shout", "demoralizing-shout", "enemy", "classic-assumed", [w("warrior")], ["Demoralizing Shout"]],
  ["thunder-clap", "Thunder Clap", "thunder-clap", "enemy", "classic-assumed", [w("warrior")], ["Thunder Clap"]],
  ["faerie-fire", "Faerie Fire", "faerie-fire", "enemy", "classic-assumed", [w("druid")], ["Faerie Fire", "Faerie Fire (Feral)"]],
  ["demoralizing-roar", "Demoralizing Roar", "demoralizing-roar", "enemy", "classic-assumed", [w("druid")], ["Demoralizing Roar"]],
  ["curse-of-the-elements", "Curse of the Elements", "curse-of-the-elements", "enemy", "classic-assumed", [w("warlock")], ["Curse of the Elements", "Curse of Elements"]],
  ["curse-of-recklessness", "Curse of Recklessness", "curse-of-recklessness", "enemy", "classic-assumed", [w("warlock")], ["Curse of Recklessness"]],
  ["curse-of-weakness", "Curse of Weakness", "curse-of-weakness", "enemy", "classic-assumed", [w("warlock")], ["Curse of Weakness"]],
  ["curse-of-tongues", "Curse of Tongues", "curse-of-tongues", "enemy", "classic-assumed", [w("warlock")], ["Curse of Tongues"]],
  ["expose-armor", "Expose Armor", "expose-armor", "enemy", "classic-assumed", [w("rogue")], ["Expose Armor"]],
  ["judgement-of-light", "Judgement of Light", "judgement-of-light", "enemy", "classic-assumed", [w("paladin")], ["Judgement of Light"]],
  ["winters-chill", "Winter's Chill", "winters-chill", "enemy", "classic-assumed", [w("mage", 3)], ["Winter's Chill"]],
];

export const TABLES: Record<string, BuffTable> = {
  [CURRENT_BUILD]: {
    build: CURRENT_BUILD,
    label: RAID_BUFF_LABEL,
    families: FAMILIES,
    entries: ROWS.map(([id, label, family, scope, evidence, providers, names]) => ({ id, label, family, scope, evidence, providers, names })),
  },
};
