# Classic baseline (local only)

**Date:** 2026-10-17
**Status:** design for Carlos's review.

## Why

Before launch, Everloot has few observations. A baseline of what Classic 1.12 had (which NPCs
spawn where, what drops from what, which quests exist) shows what WoW: Forever changed and where
players should look first. Carlos chose to keep it local: it guides our work, and only what Forever
players confirm is published.

## Source

pfQuest's database (github.com/shagu/pfQuest, `db/units.lua`, `objects.lua`, `items.lua`,
`quests.lua`, `refloot.lua`, `zones.lua`, enUS locale). The addon is MIT; the database was built
from emulator databases (VMaNGOS, GPL-2.0; CMaNGOS classic-db, GPL-3.0), which is why it stays
local and is never mixed into the CC BY-SA data.

## What gets built

- A new source `pfquest-classic` in `kb/src/sources.ts`, `publishable: false`. The release build
  already refuses non-publishable sources, and `audit-sources` reports them.
- `kb/src/importers/pfquest.ts`: reads the files at a pinned commit (`104f356` today) from a local download into the
  source database (kinds `npc`, `object`, `item`, `quest`, `loot_ref`), with tests on fixture copies.
- `npm run kb -- baseline-report --db <source db>`: compares the corroborated corpus with the
  baseline and writes a local report (not in the repository):
  - **Confirmed**: Forever matches Classic (same NPC in the same zone, same drop).
  - **Changed**: present in both but different (zone, level, drop, vendor price).
  - **New in Forever**: observed, not in the baseline.
  - **Not seen yet**: in the baseline, not observed; sorted by zone and level so players know
    where to look.
- A ledger row (`local only`) and a note in `docs/DATA_POLICY.md`'s open sources section that a
  Classic baseline is used locally for checking and never published.

## Checks

`audit-sources` on every release stays clean; a test proves the snapshot drops `pfquest-classic`
rows. The report runs on the maintainer's machine only.

## Out of scope

Publishing any baseline row; Wowhead in any form.
