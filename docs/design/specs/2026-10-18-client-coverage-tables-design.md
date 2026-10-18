# Client coverage tables

**Date:** 2026-10-18
**Status:** step 1 of 5 from the [database taxonomy research](../../2026-10-18-database-taxonomy-research.md).
Approved by Carlos for building; publishing anything from these tables is a separate decision.
**Next:** relation edges (step 2), item taxonomy (3), object kind (4), entity-keyed icon manifest (5).

## Why

Item categories, item sets, "created by", reagents, zones, races, factions, pet families: the
entity lists a game database carries are tables in the client. The research note's coverage table
lists twenty we do not read yet. Steps 2 to 5 build on them, so first we read them and find out
what the Forever build actually holds.

## What gets built

- **Twenty tables added to `CLIENT_TABLES`** (`kb/src/client-snapshot.ts`): `ItemClass`,
  `ItemSubClass`, `ItemSet`, `SkillLineAbility`, `SpellItemEnchantment`, `SpellReagents`,
  `AreaTable`, `ChrRaces`, `Faction`, `CharTitles`, `Languages`, `CurrencyTypes`, `CreatureFamily`,
  `CreatureType`, `Holidays`, `Toy`, `BattlePetSpecies`, `Creature`, `GameObjects`, `QuestV2`.
  Each file data id is the `db2FileDataID` of the WoWDBDefs manifest at commit `b9a63096cdd9`, and
  a test pins them. The four ids we already read (`ItemSparse`, `Item`, `SpellMisc`, `SpellEffect`)
  match that manifest, which checks the method.
- **Field names checked against the Forever layout.** Every one of the twenty definitions has a
  layout block for the 1.60.1 builds. The columns later steps read are listed in
  `NEEDED_FIELDS` (`kb/src/client-coverage.ts`), and the coverage report shows whether each exists
  in the build's rows and how many rows fill it. A name the layout does not have is reported as
  missing, never guessed.
- **The manifest records tables that were not read**, with the reason (`missing`), so a report
  can tell "not in this build" from "could not be read".
- **`npm run kb -- client-coverage <snapshot> [--out file]`**: a markdown table of every client
  table with file data id, status, rows, encrypted blocks and the needed fields.

## What does not change

- Nothing new is published. The snapshot stays in gitignored `kb/data/client/`, as before. The
  data policy's status line (table data not published, except the talent catalog, map layer, raid
  buff table and build changes) holds.
- No decryption keys, no listfile. Encrypted blocks are counted and skipped.
- The build watch commits only the files the site generators write; it ignores the new tables.

## Findings from build 1.60.1.70450

- All twenty tables are in the build and read without error. None is absent, `Toy` and
  `BattlePetSpecies` included (20 and 117 rows).
- `CreatureFamily`'s icon column is `IconFileID`, not `IconFileDataID` as the research note had it.
- `Creature` is almost empty on the client (179 rows; `Classification` and `CreatureFamily` are 0
  in every row). NPCs stay an addon-observed kind.
- `GameObjects` has 1,526 rows, of which 1,521 are type 5 (map labels such as "Old Coast Road").
  Chests, herbs and ore are not there, so the object kind (step 4) leans on the addon's
  `sourceObjectId`.
- `Item` has 31,849 rows, `ItemSparse` 19,231. Every `ItemSparse` row has an `Item` row; the other
  12,618 items have a class but no name or quality in the readable blocks.
- 3,336 `SpellEffect` rows are create-item effects (effect 24) naming 3,169 distinct items: the
  source for "created by". `SpellReagents` has 3,300 spells, every one with a `SpellName` row.
- `Holidays` holds name ids, not names; the names live in `HolidayNames`, which we do not read yet.

## Risks

- **Build watch.** It reads every table in `CLIENT_TABLES` and fails the run if one cannot be
  read (missing from the build is fine). Twenty more tables mean more download (the whole
  extraction, all 64 tables, took 55 seconds on a maintainer machine) and twenty more chances of a
  layout WoWDBDefs has not caught up with. If that happens, the fix is a
  WoWDBDefs update or dropping the table, not a silent skip.
