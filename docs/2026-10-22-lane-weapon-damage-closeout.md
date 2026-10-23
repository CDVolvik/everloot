# Weapon damage lane closeout — 2026-10-22

Wave 5, lane D. The item pages print `[?] - [?] Damage` for every weapon. The `ItemDamage*` tables are now in the
client snapshot, so the files give a value per item level and quality. What no file gives is how the client
combines that value with the swing time and the spread, or how it rounds. This lane builds the range from the
files, puts the two readings in the code, and prints nothing until a check in the game picks one.

Review: the pull request against `main` that carries this file.

## What was built

`kb/src/assets/weapon-damage.ts`, a pure module with no imports. The web app reads it at render time, and
`items.ts` pulls in the snapshot reader, so the damage code could not live there.

- **The inputs** stay where the wave-3 lane put them: `buildItemSet` records `w` on every weapon and every piece of
  ammunition. That is the table `weaponDamageTable` picks from the item's inventory type (and subclass for ranged,
  and the caster flag), and the value at the item's level and quality. The swing time is the record's `d`, the
  spread `w.dv`. The shards already carry `w`. The site's shard reader (`web/src/lib/game-assets.ts`) dropped it
  until now; it keeps it now.
- **The two readings**, `DAMAGE_READINGS`:
  - `tableAlone`: the middle of the range is the table value;
  - `tableTimesSwing`: the middle is the table value × the swing time in seconds.

  Either way the range is the middle × (1 ± spread ÷ 2), rounded down and up (`damageRange`).
- **The gate**, `CHECKED_WEAPONS`: the weapons read off the game's own tooltip. It ships **empty**.
  `confirmedReading` returns the one reading that every checked weapon agrees with exactly. It returns null if
  the list is empty, if no reading fits every weapon, or if both do. `checkedDamageRange` gives an item's range
  under that reading, but only when a checked weapon came from the item's own table.
- **The page.** `itemTipText` (`web/src/lib/item-names.ts`) prints `N - M Damage · Speed S` once
  `checkedDamageRange` gives a range. A wand gets its school: `17 - 32 Fire Damage`. Under the lines, in place of
  the `WHY.damage` reason, it prints where the range came from: "10 - 20 Damage: worked out from the game files
  (ItemDamageOneHand, the weapon speed and its spread), the way 1 weapon from that table read off the game's own
  tooltip on 2026-11-04 agree, build …". Until then the line is `[?] - [?] Damage` with the `WHY.damage` reason,
  as before. The item page, the site card, item links and the embeddable card all print `itemTipText`, so they
  all change together and nothing else reaches the page.
- **The per-second line stays the players'.** `([?] damage per second)` is filled only by `withReported`, from
  the installs' reports, with its own "reported by N installs, last seen …, build …" line. The files' range never
  writes a per-second number. So when both are known, the page shows two lines, each saying where it came from.

## Checked against the real tables

The snapshot re-extracted on 2026-10-22 with the `ItemDamage*` tables (370 MB, outside the repository, read by
path) was run through the real `buildItemSet` and `damageRange` by a scratch script that is not committed.

| Table | Rows | Item levels | Qualities | Items that read it |
|---|---|---|---|---|
| `ItemDamageOneHand` | 100 | 1–100 | 7 | 863 |
| `ItemDamageOneHandCaster` | 100 | 1–100 | 7 | 0 |
| `ItemDamageTwoHand` | 100 | 1–100 | 7 | 604 |
| `ItemDamageTwoHandCaster` | 100 | 1–100 | 7 | 0 |
| `ItemDamageRanged` | 100 | 1–100 | 7 | 190 |
| `ItemDamageThrown` | 100 | 1–100 | 7 | 34 |
| `ItemDamageWand` | 100 | 1–100 | 7 | 81 |
| `ItemDamageAmmo` | 1,000 | 1–1000 | 7 | 36 |

- Of 19,231 named items, 1,812 are weapons or ammunition. 1,808 have inputs. Every one of them found a row for its
  level; none was missing.
- **4 weapons have no table**: three miscellaneous weapons (subclass 14) in slots 0, 10 and 23, and one fist
  weapon in a ranged slot (26). They keep `[?]`, and so does any weapon with no `w`.
- **21 weapons have inputs but no swing time** (`ItemDelay` 0). They print no damage line, as before.
- **No item in 1.60.1 sets the caster flag** (`Flags[1] & 0x200`), so the two caster tables are read by nothing.
  At level 15 their values are the same as the plain one-hand and two-hand tables'.
- **The Cutlass (851)**: item level 15, common, 2200 ms, spread 0.6000000238 (float32), one-hand table value
  6.957369327545166. That gives `4 - 10` under `tableAlone` and `10 - 20` under `tableTimesSwing`, as the brief
  worked out. The kb test holds the level 15 row of all eight tables as the build stores them and checks both
  readings against them.

### A hint, not a check

For three famous weapons, `tableTimesSwing` gives ranges close to the classic tooltips as I remember them:
Sulfuras, Hand of Ragnaros (17182) `223 - 372`, and Arcanite Reaper (12784) `153 - 257` where I remember 153 - 256.
Thunderfury (19019) fits neither reading. No source on disk confirms any of these, and
Forever may change numbers. If the Arcanite Reaper memory is right, the client does not round the top of the
range up, and neither reading in the code would match it. The check would then show "agrees with neither" and
print nothing, which is the point of the gate. Nothing ships on these.

## What stays `[?]`, and why

- **Every weapon's damage**, until `CHECKED_WEAPONS` is filled. The reason line is unchanged (`WHY.damage`).
- **After the check, every table no checked weapon came from.** Step 23's three lines (a one-hand at a low level,
  one at a high level, a two-hand or a caster) settle the one-hand and two-hand tables. The ranged, thrown and
  wand tables stay `[?]` until a weapon of their own is checked. `weaponDamageTable`'s choice for them is the
  build's own reading, and it is not confirmed.
- **Ammunition.** The game prints "Adds N damage per second" for it, not a range, so `damageRange` gives nothing
  for the ammo table. The value is recorded. Its line and its rounding are not built or checked here.
- **A weapon in a slot with no table**, or with a school this file has no word for.
- **The per-second line**, until 3 installs agree on it (the wave-4 rule, unchanged).

## For the coordinator, after the in-game check

Fill `CHECKED_WEAPONS` in `kb/src/assets/weapon-damage.ts`, one entry per damage line from step 23. Copy `n`, `l`,
`q`, `d` and `w` from the item's shard record, and add what the game printed:

```ts
export const CHECKED_WEAPONS: readonly CheckedWeapon[] = [
  {
    id: 851, n: "Cutlass", l: 15, q: 1, d: 2200,
    w: { t: "ItemDamageOneHand", dps: 6.957369327545166, dv: 0.6000000238418579, ds: 0 },
    game: { min: 10, max: 20 },      // the tooltip's "10 - 20 Damage"
    seen: "2026-11-04", build: "1.60.1.70450",
  },
  // … the high-level one-hand, and the two-hand or caster
];
```

The kb test `each weapon in the shipped list is whole, and the list confirms one reading` fails if the entries
agree with neither reading, or with both. A failure means the formula needs another look, not a shipped guess.
The item shards need no rebuild: the range is worked out when the page renders, from the `w` the shards already
hold.

## Decisions a reviewer should look at

1. **The gate is per table.** A confirmed reading prints only for tables a checked weapon came from. The brief's
   "the site prints the range" could be read as "all weapons". I took the narrower reading because which table
   goes with which weapon kind is itself unconfirmed. Three checks from step 23 light up the one-hand and two-hand
   tables (1,446 weapons that print a damage line), and the rest wait for their own check.
2. **The check is exact and needs one winner.** Every checked weapon must match a reading to the point, both
   ends. If both readings fit (possible only for odd inputs), nothing prints. Rounding is part of the reading, so
   a game that rounds differently confirms nothing.
3. **A new file, `kb/src/assets/weapon-damage.ts`.** It belongs to the item reader but has no imports, so the web
   app can import it without pulling `better-sqlite3` into the bundle through `items.ts` → `banners.ts` →
   `world-map-data.ts`. `WeaponDamageInputs` moved there, and `items.ts` imports it as a type.
4. **`web/src/lib/game-assets.ts` changed by one line**: the shard schema keeps `w`. Without it the range could
   never reach the page (the `item-damage.test.ts` test fails without that line). It is the path the brief named,
   not a second way in.
5. **`partial`** in `itemTipText` is now "a line holds `[?]`", the same rule `withReported` already used. The old
   rule, "there is a reason line", would have turned true once a range's source line was added. The two rules
   give the same result for every tooltip that existed before.
6. **Floating point.** The tables are float32, read as doubles, and the range is taken without a fudge. A middle ×
   (1 ± spread ÷ 2) that lands exactly on a whole number in the game could land a hair above it here, and come out
   one point higher. The check catches that the same way.

## Not done here

- No shard rebuild or upload. The shards on the bucket were built before `w` reached the site's reader, and they
  may predate the damage tables entirely. They need the maintainer's next asset run (`docs/ASSETS.md`) for `w` to
  be there once `CHECKED_WEAPONS` is filled.
- No change to the MCP tools, the API, the protocol, the addon, the migrations, the switches or
  `docs/DATA_POLICY.md`.

## Files

- `kb/src/assets/weapon-damage.ts`: the readings, the range, the checked list and the gate.
- `kb/src/assets/items.ts`: the header comment; `WeaponDamageInputs` moved out.
- `kb/test/weapon-damage.test.ts`: the table per slot, both readings over the build's own level 15 rows, the gate.
- `web/src/lib/item-names.ts`: the damage line, the school, the source line, `partial`.
- `web/src/lib/game-assets.ts`: the shard schema keeps `w`.
- `web/src/lib/item-names.test.ts`, `web/src/lib/item-damage.test.ts`: the page lines, empty and filled list, a shard end to end.
- This file.

## Verification

- kb: typecheck passed; 116 test files, 1,218 tests passed (7 new in `weapon-damage.test.ts`).
- web: typecheck passed; lint has no warnings in the files this pull request touches; 223 test files passed and one
  skipped, 2,145 tests passed and three skipped (3 new). The end-to-end shard test fails with the schema line removed.
- The internal-path guard and the Markdown link check passed locally. The DCO, AI-credit and title checks run on the pull request.
