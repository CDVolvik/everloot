/**
 * Item icon ids and item tooltip facts from the client's item tables, in shards the site reads on demand.
 * Pure: it takes a table reader and writes nothing. Only what the tables give is recorded. What they do
 * not give (stat amounts, armor, damage: the client works those out from tables we do not read) is left
 * out, and the site shows `[?]` for it.
 *
 * Tables, with column names from WoWDBDefs:
 * - ItemSparse: name (Display_lang), flavour text (Description_lang), OverallQualityID, ItemLevel,
 *   RequiredLevel, Bonding, InventoryType, ItemDelay (ms), MaxCount (1 is "Unique"), SellPrice (copper),
 *   and the stat kinds of the item (StatModifier_bonusStat). StatPercentEditor is a share of a budget
 *   the client computes, not an amount, so no amount is recorded.
 * - Item: IconFileDataID, ClassID and SubclassID.
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
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const list = (rows: Rows | undefined) => [...(rows?.values() ?? [])];

export interface ItemSet {
  records: Map<number, ItemRecord>;
  /** Icon file data id per item, from Item.IconFileDataID, for every record that has one. */
  iconOf: Map<number, number>;
}

/** The item records, for every ItemSparse row (or only for `only`, when given) that has a name. */
export function buildItemSet(get: TableReader, only?: ReadonlySet<number>): ItemSet {
  const sparse = get("ItemSparse"), item = get("Item");
  if (!sparse || !item) throw new Error("the snapshot has no ItemSparse and Item tables; run `client-extract --refresh` first");
  const records = new Map<number, ItemRecord>();
  const iconOf = new Map<number, number>();
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
