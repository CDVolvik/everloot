/**
 * Item icon ids and item tooltip facts from the client's item tables, in shards the site reads on demand.
 * Pure: it takes a table reader and writes nothing. Only what the tables give is recorded. What they do
 * not give (stat amounts and armor: the client works those out from tables we do not read) is left out,
 * and the site shows `[?]` for it.
 *
 * Tables, with column names from WoWDBDefs:
 * - ItemSparse: name (Display_lang), flavour text (Description_lang), OverallQualityID, ItemLevel,
 *   RequiredLevel, Bonding, InventoryType, ItemDelay (ms), MaxCount (1 is "Unique"), SellPrice (copper),
 *   and the stat kinds of the item (StatModifier_bonusStat). StatPercentEditor is a share of a budget
 *   the client computes, not an amount, so no amount is recorded.
 * - Item: IconFileDataID, ClassID and SubclassID.
 * - ItemSparse.AllowableClass (a mask, bit class id - 1) with ChrClasses' names; ItemSparse.ItemSet with
 *   ItemSet.Name_lang; ItemXItemEffect and ItemEffect (SpellID, TriggerType) for the Equip and Use lines, whose
 *   text is the spell's tooltip resolved by the caller.
 * - ItemDamage*: a weapon's damage per second by item level and quality. In 1.60.1 ItemSparse has no
 *   MinDamage/MaxDamage; the client works a weapon's damage out from this value, the weapon speed and
 *   ItemSparse.DmgVariance. Those inputs are recorded as the tables give them (`w`), not the damage:
 *   which table goes with which weapon kind (weaponDamageTable) and the client's rounding still have to
 *   be checked against the game's own tooltips for a few weapons before the site prints "N - M Damage".
 *
 * The numbers for quality, binding, slot, class and subclass are the client's own enumerations (the
 * WoWDev wiki documents them); the names for them are in item-names.ts of the web app.
 */
import type { Rows, TableReader } from "../talents/build-catalog.js";

/** Items per shard file. Items a page shows tend to sit near each other, so a page reads few shards. */
export const ITEM_SHARD_SIZE = 512;
export const shardOf = (itemId: number): number => Math.floor(itemId / ITEM_SHARD_SIZE);

/** One item as the site reads it. Short keys: the file holds thousands. */
export interface ItemRecord {
  /** Name. */
  n: string;
  /** Quality, 0 poor to 7 heirloom. */
  q: number;
  /** Item level. */
  l: number;
  /** Required level; 0 when there is none. */
  r: number;
  /** Bonding enum. */
  b: number;
  /** Inventory type enum; 0 is not worn. */
  s: number;
  /** Item class and subclass, null when the Item table has no row. */
  c: number | null;
  sc: number | null;
  /** Weapon delay in milliseconds; 0 when none. */
  d: number;
  /** Stat kinds (ITEM_MOD enum), in the order of the item. Amounts are not recorded. */
  st: number[];
  /** Sell price in copper. */
  sp: number;
  /** MaxCount: 1 is Unique. */
  u: number;
  /** Flavour text; omitted when empty. */
  t?: string;
  /** Icon file data id, set only after the icon file was extracted. */
  i?: number;
  /** Weapon damage inputs; omitted when the item is not a weapon or the build has no row for it. */
  w?: WeaponDamageInputs;
  /** The classes that may use it (ChrClasses names, by class id); omitted when every class may. */
  cl?: string[];
  /** Its item set's name; omitted when it is in none. */
  set?: string;
  /** Its Equip, Use and Chance on hit lines: the trigger (ItemEffect.TriggerType) and the spell's tooltip text. */
  fx?: ItemEffectLine[];
}

/** One spell effect of an item. `k` is 0 Use, 1 Equip, 2 Chance on hit, 5 Use (no delay); `x` is the resolved text. */
export interface ItemEffectLine { k: number; x: string }

/** The triggers an item tooltip prints a line for; others (soulstone, learning a recipe's spell) print none. */
const SHOWN_TRIGGERS = new Set([0, 1, 2, 5]);

/** What the client works a weapon's damage out from, as the tables give it. */
export interface WeaponDamageInputs {
  /** The ItemDamage table the value came from. */
  t: string;
  /** That table's damage per second for the item's level and quality. */
  dps: number;
  /** ItemSparse.DmgVariance. */
  dv: number;
  /** ItemSparse.DamageType: the damage school, 0 physical. */
  ds: number;
}

/** ITEM_FLAG2_CASTER_WEAPON, in the second Flags word. */
const CASTER_WEAPON = 0x200;

/**
 * The ItemDamage table a weapon's damage per second is read from, by inventory type and weapon subclass:
 * the retail client's choice for one-hand, two-hand and ammo, and the Ranged, Thrown and Wand tables 1.60.1
 * adds for those kinds. Null for anything else.
 */
export function weaponDamageTable(inventoryType: number, subclass: number | null, caster: boolean): string | null {
  switch (inventoryType) {
    case 13: case 21: case 22: return caster ? "ItemDamageOneHandCaster" : "ItemDamageOneHand";
    case 17: return caster ? "ItemDamageTwoHandCaster" : "ItemDamageTwoHand";
    case 15: case 26: return subclass === 19 ? "ItemDamageWand" : subclass === 2 || subclass === 3 || subclass === 18 ? "ItemDamageRanged" : null;
    case 25: return "ItemDamageThrown";
    case 24: return "ItemDamageAmmo";
    default: return null;
  }
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const list = (rows: Rows | undefined) => [...(rows?.values() ?? [])];

export interface ItemSet {
  records: Map<number, ItemRecord>;
  /** Icon file data id per item, from Item.IconFileDataID, for every record that has one. */
  iconOf: Map<number, number>;
}

/**
 * The item records, for every ItemSparse row (or only for `only`, when given) that has a name. `describe` gives a
 * spell's tooltip text, resolved, for the item's Equip and Use lines; without it no effect is recorded.
 */
export function buildItemSet(get: TableReader, only?: ReadonlySet<number>, describe?: (spellId: number) => string | null): ItemSet {
  const sparse = get("ItemSparse"), item = get("Item");
  if (!sparse || !item) throw new Error("the snapshot has no ItemSparse and Item tables; run `client-extract --refresh` first");
  const records = new Map<number, ItemRecord>();
  const iconOf = new Map<number, number>();
  // AllowableClass is a mask with bit (class id - 1) per class; a mask that covers every class is no restriction.
  const classes = list(get("ChrClasses")).map((r) => ({ id: num(r.ID), name: text(r.Name_lang) })).filter((c) => c.id > 0 && c.name).sort((a, b) => a.id - b.id);
  const everyClass = classes.reduce((mask, c) => mask | (1 << (c.id - 1)), 0);
  const setName = new Map(list(get("ItemSet")).map((r) => [num(r.ID), text(r.Name_lang)]));
  const effect = new Map(list(get("ItemEffect")).map((r) => [num(r.ID), r]));
  const effectsOf = new Map<number, number[]>();
  for (const r of list(get("ItemXItemEffect"))) effectsOf.set(num(r.ItemID), [...(effectsOf.get(num(r.ItemID)) ?? []), num(r.ItemEffectID)]);
  // Damage per second by table and item level: the Quality column, one value per quality.
  const damage = new Map<string, Map<number, unknown[]>>();
  const damageAt = (table: string, level: number): unknown[] | undefined => {
    if (!damage.has(table)) damage.set(table, new Map(list(get(table)).map((r) => [num(r.ItemLevel), Array.isArray(r.Quality) ? r.Quality : []])));
    return damage.get(table)!.get(level);
  };
  for (const row of list(sparse)) {
    const id = num(row.ID);
    const name = text(row.Display_lang);
    if (id <= 0 || !name || (only && !only.has(id))) continue;
    const base = item.get(id);
    const stats = (Array.isArray(row.StatModifier_bonusStat) ? row.StatModifier_bonusStat : []).map(num);
    const percents = Array.isArray(row.StatPercentEditor) ? row.StatPercentEditor.map(num) : [];
    // -1 is an empty slot. A stat kind with a zero share is a slot the client does not use either.
    const st = stats.filter((s, i) => s > 0 && (percents[i] ?? 0) !== 0);
    const flavour = text(row.Description_lang);
    const record: ItemRecord = {
      n: name, q: num(row.OverallQualityID), l: num(row.ItemLevel), r: num(row.RequiredLevel), b: num(row.Bonding), s: num(row.InventoryType),
      c: base ? num(base.ClassID) : null, sc: base ? num(base.SubclassID) : null,
      d: num(row.ItemDelay), st, sp: num(row.SellPrice), u: num(row.MaxCount),
    };
    if (flavour) record.t = flavour;
    const flags = Array.isArray(row.Flags) ? row.Flags.map(num) : [];
    const table = record.c === 2 || record.s === 24 ? weaponDamageTable(record.s, record.sc, ((flags[1] ?? 0) & CASTER_WEAPON) !== 0) : null;
    const dps = table ? damageAt(table, record.l)?.[record.q] : undefined;
    if (table && typeof dps === "number" && dps > 0) record.w = { t: table, dps, dv: num(row.DmgVariance), ds: num(row.DamageType) };
    const mask = num(row.AllowableClass);
    if (mask > 0 && everyClass > 0 && (mask & everyClass) !== everyClass) {
      const cl = classes.filter((c) => (mask & (1 << (c.id - 1))) !== 0).map((c) => c.name!);
      if (cl.length) record.cl = cl;
    }
    const inSet = setName.get(num(row.ItemSet));
    if (inSet) record.set = inSet;
    const fx = describe ? (effectsOf.get(id) ?? [])
      .map((e) => effect.get(e)).filter((e) => e !== undefined)
      .sort((a, b) => num(a.LegacySlotIndex) - num(b.LegacySlotIndex) || num(a.ID) - num(b.ID))
      .flatMap((e) => {
        const k = num(e.TriggerType), x = num(e.SpellID) > 0 && SHOWN_TRIGGERS.has(k) ? describe(num(e.SpellID)) : null;
        return x ? [{ k, x }] : [];
      }) : [];
    if (fx.length) record.fx = fx;
    records.set(id, record);
    const icon = base ? num(base.IconFileDataID) : 0;
    if (icon > 0) iconOf.set(id, icon);
  }
  return { records, iconOf };
}

/** Records grouped into shards, each as `{ "<item id>": record }`, ordered by id. */
export function shardRecords(records: ReadonlyMap<number, ItemRecord>): Map<number, Record<string, ItemRecord>> {
  const out = new Map<number, Record<string, ItemRecord>>();
  for (const id of [...records.keys()].sort((a, b) => a - b)) {
    const shard = shardOf(id);
    const into = out.get(shard) ?? {};
    into[String(id)] = records.get(id)!;
    out.set(shard, into);
  }
  return out;
}

/** An allowlist file: a JSON array of ids, or one id per line. Anything else is an error, not an empty list. */
export function parseItemIds(raw: string): Set<number> {
  const trimmed = raw.trim();
  const ids = trimmed.startsWith("[")
    ? (JSON.parse(trimmed) as unknown[]).map((v) => Number(v))
    : trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => Number(l));
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw new Error("the item list must hold positive whole numbers only");
  return new Set(ids);
}
