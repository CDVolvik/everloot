# Item facts lane closeout — 2026-10-22

Wave 3, lane 3. The item pages and the hover cards showed `[?]` for an item's restrictions, its set and its Use and
Equip lines, and a bare `[?]` with no reason for its stat amounts, armor and weapon damage. This lane reads the
facts the client files do carry and makes every remaining `[?]` say why.

Review: the pull request against `main` that carries this file.

## What became real

All read from the maintainer's client snapshot of build 1.60.1.70450 (extracted 2026-10-18, outside the
repository) by `buildItemSet` in `kb/src/assets/items.ts`, the same pure reader that builds the private item
shards. Counts are over the 19,231 `ItemSparse` rows with a name.

| Line | Read from | Items |
|---|---|---|
| `Set: <name>` | `ItemSparse.ItemSet` → `ItemSet.Name_lang` | 827, every one named |
| `Unique-Equipped: <name> (n)` or `Unique: <name> (n)`, in place of "Unique" | `ItemSparse.LimitCategory` → `ItemLimitCategory` (name, `Quantity`, `Flags` bit 0) | 170 |
| `Classes: …` | `ItemSparse.AllowableClass` against the 9 `ChrClasses` rows | 2,695 |
| `Races: …` | `ItemSparse.AllowableRace` (64 bits, two words) against `ChrRaces.PlayableRaceBit`, announced races only | 107 |
| `Requires <skill> (rank)`, `Requires <spell>`, `Requires <faction> - <standing>` | `RequiredSkill`/`RequiredSkillRank` → `SkillLine`; `RequiredAbility` → `SpellName`; `MinFactionID`/`MinReputation` → `Faction` | 2,912 items with one or more |
| `Use: …`, `Equip: …`, `Chance on hit: …` | `ItemXItemEffect` → `ItemEffect` (trigger 0 and 5, 1, 2) → the spell's description, resolved like the talents' | 3,383 lines on 3,363 items |

The lines sit where the game prints them: the category line under the binding, classes and races before
"Requires Level", the skill, spell and reputation after it, then the effects and the set, then the flavour text.

On the site they appear in the item page's tooltip box, the site's own hover card (`/database/card`), the
inline item links and the embeddable card (`/api/tooltip`), under the rules each already has. The tooltip facts
stay pages-only: `kb/src/item-page.ts`, which feeds the MCP tool and the API, is unchanged.

## What stays `[?]`, and the reason each tooltip now prints

Each kind of placeholder adds one plain line under the tooltip, in place of the old generic
"[?] marks a value the game files do not give us yet." (`WHY` in `web/src/lib/item-names.ts`):

- **Stat amounts.** `ItemSparse` names the stats (`StatModifier_bonusStat`) but holds no amounts.
  `StatPercentEditor` is a share of a budget the client computes, so no amount is guessed from it.
- **Armor.** No armor column in this build. Nothing is derived from a related item.
- **Weapon damage.** See the next section.
- **A value inside a Use or Equip line** the spell tables we read do not give: 512 of the 3,383 lines. Mostly
  food, whose "Restores [?] health over 18 sec." depends on the eater's level, and the Hearthstone's "Returns
  you to [?]".
- **A restriction the files only number**: "Requires PvP rank [?]" (449 items; the rank's name depends on the
  player's faction), one skill missing from `SkillLine`, and one class mask that names no class in `ChrClasses`.
- **An item file written before this change**: until the maintainer regenerates and uploads the shards, every
  record lacks the new fields, and its tooltip prints `Restrictions: [?]`, `Set: [?]` and `Equip and Use: [?]`
  with the reason "the item file the site reads was written before these were read from the game files". An
  empty list in a new shard means "none", not "unknown".

## Weapon damage: not printed, and why

The brief said the `ItemDamage*` tables are in the snapshot. They are not: the snapshot was extracted on
2026-10-18, before those tables joined `CLIENT_TABLES`, and its manifest lists 322 tables, none of them
`ItemDamage*`. So no record carries the damage inputs (`w` is set on 0 items), and no range can be worked out
from this snapshot, let alone checked. Weapons keep `[?] - [?] Damage` and say why: the game works the range out
from its weapon damage tables, the weapon speed and its own rounding, and no range is shown until one is checked
against the game's own tooltip.

Checking a range against the real client needs the live game, and there is none before launch. Nothing about
damage ships blind: the formula is not in the site code, only the reader's inputs (`w`), as before.

**For the launch-day check:** refresh the snapshot (`client-extract --refresh`, which adds the `ItemDamage*`
rows), regenerate the shards, then compare a few weapons' worked-out ranges with the in-game tooltip before
any code prints them.

## What was checked against the client files

- **The reader over the real snapshot.** A scratch script (not committed) ran `buildItemSet` with the same
  description resolver `client-assets.ts` uses, over all 19,231 named items. The counts above come from it.
- **Spell ranges.** The first run printed "Restores 160 mana." for Minor Mana Potion. The game prints a range:
  `SpellEffect` in this build keeps a base and a `Variance` (160 and 0.25), not dice, and the resolver ignored
  `Variance`. The game's range is base × (1 ± variance / 2), rounded:

  | Spell | Base, variance | Worked out | Source for the game's text |
  |---|---|---|---|
  | Minor Mana Potion (437) | 160, 0.25 | 140 to 180 | Warcraft Wiki dump, "Minor Mana Potion": "restores 140 to 180 mana" |
  | Sulfuras's fireball (21162) | 303, 0.198 | 273 to 333 | none on disk (see below) |
  | Frostbolt rank 1 (116) | 19, 0.105 | 18 to 20 | none on disk |
  | Fireball rank 1 (133) | 18, 0.444 | 14 to 22 | none on disk |

  Only the first row is checked against a source. The other three match the classic values as I remember them,
  but the wiki dump's Sulfuras page carries the current retail numbers (49 Fire damage) and its Frostbolt and
  Fireball pages give no rank 1 values, so treat those three as unverified. `kb/src/assets/tooltip.ts` now reads
  `variance` (optional, so a caller that does not pass it is unchanged), and `client-assets.ts` passes
  `SpellEffect.Variance`.
- **Effect lines with no variance**, against the dump: Wrath of Cenarius (21190), "Equip: Gives a chance when
  your harmful spells land to increase the damage of your spells and effects by 132 for 10 sec.", is word for
  word the dump's text. Thunderfury (19019) matches the dump's wording, the 25 Nature resistance aside: the dump
  has retail's squished 46 damage and 4 resistance where this build has 300 and 25. Its "5 targets" and "20% for
  12 sec" match.

The dump is the Warcraft Wiki of 2023-11-13, not the Forever client. Forever may change a number, and the site
prints what this build's files say.

## Decisions a reviewer should look at

1. **The set name rule.** The brief asked for "three installs agree, or the game files and the wiki agree".
   `docs/DATA_POLICY.md` ("Item set and spell names from the game files", decided 2026-10-21) shows set names
   from the files alone, with the unconfirmed marker. No wiki source for set names exists, so the brief's rule
   would show none. I followed the policy. The set line sits inside the game file tooltip, which already
   carries the unconfirmed marker and the build.
2. **`ItemLimitCategory` is the Unique-Equipped category**, not slot restrictions such as "Two-Hand" or "Tank"
   (51 rows, for example "Hand of Justice", "Waylaid Shipment"). The line follows the retail format,
   `Unique-Equipped: <name> (n)`. A category without a name prints its kind, with the count past one. That is
   my reading of the client, and it needs the launch-day check.
3. **`RequiredSkill` is "Requires Tailoring (150)"**, not a "Use: teaches" line. A recipe's "Use: Teaches
   you how to …" is not in the files: its Use spell ("Learning") has an empty description, and its learning
   effect (trigger 6) prints nothing. So no line is written for it rather than an invented one.
4. **Races.** Only races announced for Forever (`RACE_ATLAS` in `kb/src/assets/banners.ts`) count. A
   faction's whole set therefore prints as, for example, "Races: Human, Dwarf, Night Elf, Gnome, High Order
   Skyborne" (47 items). The game may print nothing or a faction name there instead. Launch-day check.
5. **The shared spell resolver changed** (`kb/src/assets/tooltip.ts`). Talent and raid buff tooltips built
   by the next asset run will also print ranges where a spell has a variance. That is the game's own text,
   but it reaches beyond items.
6. **Files outside the listed ownership**, each a small change the new fields need: `web/src/lib/game-assets.ts`
   (the shard schema and `ItemTip.why`), `kb/src/client-assets.ts` (passes the resolver and `Variance`),
   `kb/src/assets/tooltip.ts` (point 5), and `web/src/lib/site-card.ts` and `web/src/components/game/ItemTip.tsx`
   (they show the reasons instead of the generic line). No other lane lists any of them.
7. **`docs/DATA_POLICY.md`**: the item tooltip facts list now names these lines, marked as proposed in this
   pull request, which is the maintainer review the policy asks for.

## Not done here

- **The shards are not regenerated or uploaded.** That is the maintainer's step (`docs/ASSETS.md`): run the
  asset build against the snapshot and upload the private folder. Until then, live tooltips show the older-shard
  reason.
- **No protocol, record kind, addon, migration or switch change.** Player-reported item facts are a later
  wave; `ItemCardFacts` in `web/src/lib/tooltip.ts` stays for them, used today only when the files cannot be
  read.
- **The map's hover card** has no item lines (it shows NPCs, objects and zones), so nothing changed there.

## Files

- `kb/src/assets/items.ts`: the set, category, class, race, requirement and effect lines.
- `kb/src/assets/tooltip.ts`: `variance` in a spell effect's range.
- `kb/src/client-assets.ts`: passes `Variance` and the description resolver to `buildItemSet`.
- `kb/test/asset-items-maps.test.ts`, `kb/test/tooltip.test.ts`: the new lines and the range.
- `web/src/lib/item-names.ts`: the lines in the game's order, `WHY`, `tipLines`, the older-shard fallback.
- `web/src/lib/game-assets.ts`: the shard schema reads the new fields; `ItemTip.why`.
- `web/src/lib/tooltip.ts`: the embeddable card uses the files' lines and reasons; without the files it says so.
- `web/src/lib/site-card.ts`, `web/src/components/game/ItemTip.tsx`, `web/src/app/database/items/[id]/page.tsx`:
  the reasons replace the generic line.
- `web/src/lib/game-assets.test.ts`, `web/src/lib/game-assets.fixture.ts`, `web/src/app/api/tooltip/[type]/[id]/route.test.ts`,
  `web/src/app/database/card/[type]/[id]/route.test.ts`, `web/src/app/database/items/icons.test.tsx`: tests.
- `docs/DATA_POLICY.md`, this file.

## Verification

- New and changed tests: 2 kb tests (the item lines from the files' tables; a variance range), 3 web tests (the
  reasons, the lines in the game's order, the older-shard fallback), and the card and route tests updated for
  the reasons replacing the generic line.
- Full kb suite: 106 files, 1,114 tests passed. kb typecheck passed.
- Full web suite: 211 files passed, one skipped; 2,076 tests passed, three skipped. Web typecheck, lint (no
  errors; no warnings in the files this pull request touches) and `npm run build` passed.
- The internal-path guard and the Markdown link check passed locally.
- The reader over the real snapshot: the counts in the tables above, from a scratch run that is not committed.
