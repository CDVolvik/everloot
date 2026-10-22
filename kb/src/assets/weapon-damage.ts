/**
 * A weapon's damage range from what the item shards hold of the client's ItemDamage* tables (items.ts, `w`): the
 * table value for the item's level and quality, its swing time and its spread. No file says how the client combines
 * them or how it rounds, so the two readings the files allow are named here and neither is trusted: a range is
 * printed only under the one that the weapons checked against the game's own tooltip all agree with.
 *
 * No imports: the web app reads this at render time, and items.ts pulls in the snapshot reader.
 */

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

/** What a range needs of an item record: its swing time in ms (`d`) and its table inputs (`w`). */
type Rec = { d: number; w?: WeaponDamageInputs };

/**
 * The two ways the client may turn a table value into the middle of a weapon's damage range. Neither is confirmed:
 * no file says which, and the game's own tooltip settles it (step 23 of the launch checklist).
 */
export const DAMAGE_READINGS = {
  /** The table value is the middle of the range. */
  tableAlone: (value: number, _delayMs: number): number => value,
  /** The table value is per second: the middle is the value times the swing time. */
  tableTimesSwing: (value: number, delayMs: number): number => (value * delayMs) / 1000,
} as const;
export type DamageReading = keyof typeof DAMAGE_READINGS;

/** The two numbers of "N - M Damage". */
export interface DamageRange {
  min: number;
  max: number;
}

/**
 * A weapon's range under a reading: the middle × (1 ± spread ÷ 2), rounded down and up. Null without the table's
 * inputs, without a swing time, and for ammunition: the game prints no range for it but the damage per second it
 * adds to the bow, so its table value is recorded and nothing is worked out from it.
 */
export function damageRange(r: Rec, reading: DamageReading): DamageRange | null {
  if (!r.w || r.d <= 0 || r.w.t === "ItemDamageAmmo") return null;
  const middle = DAMAGE_READINGS[reading](r.w.dps, r.d);
  return { min: Math.floor(middle * (1 - r.w.dv / 2)), max: Math.ceil(middle * (1 + r.w.dv / 2)) };
}

/**
 * A weapon whose damage line was read off the game's own tooltip. `n`, `l`, `q`, `d` and `w` are copied from the item's
 * shard record; `game` is the line the game printed ("9 - 17 Damage" is 9 and 17), on the day `seen` (YYYY-MM-DD), in `build`.
 */
export interface CheckedWeapon {
  id: number;
  /** Name, item level, quality and swing time (ms). */
  n: string;
  l: number;
  q: number;
  d: number;
  w: WeaponDamageInputs;
  game: DamageRange;
  seen: string;
  build: string;
}

/**
 * The weapons checked against the game's own tooltip. Empty until that check is done in the game: while it is, no
 * range is printed anywhere.
 */
export const CHECKED_WEAPONS: readonly CheckedWeapon[] = [];

/** The one reading every checked weapon agrees with; null with none checked, when none agrees or when both do. */
export function confirmedReading(checked: readonly CheckedWeapon[] = CHECKED_WEAPONS): DamageReading | null {
  if (!checked.length) return null;
  const agree = (Object.keys(DAMAGE_READINGS) as DamageReading[]).filter((reading) => checked.every((c) => {
    const got = damageRange(c, reading);
    return got !== null && got.min === c.game.min && got.max === c.game.max;
  }));
  return agree.length === 1 ? agree[0] : null;
}

/** A range the site may print, and the checked weapons that vouch for it: those from the same table. */
export interface CheckedDamageRange extends DamageRange {
  reading: DamageReading;
  table: string;
  checked: readonly CheckedWeapon[];
}

/**
 * The item's range under the confirmed reading, for an item whose table a checked weapon came from. Null otherwise:
 * a table nobody checked (the wand's, say) keeps `[?]` even once the one-hand table is settled.
 */
export function checkedDamageRange(r: Rec, checked: readonly CheckedWeapon[] = CHECKED_WEAPONS): CheckedDamageRange | null {
  const reading = confirmedReading(checked);
  const vouching = checked.filter((c) => c.w.t === r.w?.t);
  const range = r.w && reading && vouching.length ? damageRange(r, reading) : null;
  return range && r.w && reading ? { ...range, reading, table: r.w.t, checked: vouching } : null;
}
