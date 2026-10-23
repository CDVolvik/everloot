# Loot tables lane closeout — 2026-10-21

Wave 2, lane C. Writes the [loot tables design](design/specs/2026-10-21-loot-tables-design.md) and builds its
first slice (section 9): the NPC loot table and the item-source table, from Everloot's own uploads only.

Review: the pull request against `main` that carries this file.

## Outcome

**Spec.** Source types (kill, pick-pocketing, skinning, gathering, disenchanting, opened containers), money in
loot windows, window context (mob level and rank, instance and difficulty, player level, quest-only), shared
tables inferred from our own windows, boss loot per encounter, and the dense tables. Every number states its
denominator, date and method. It says what is honest on day one and what needs uploads the site does not have:
read from `GET /api/rollups/drops` at 2026-10-21T20:58:25Z (corpus time 2026-10-21T20:50:28Z), the public
corpus holds 10 uploads, 84 records and 0 addon loot windows, so every table is empty today and says so.

The spec also records a finding in the addon: the local set of looted GUIDs keeps only the first window opened
on a creature, so pick-pocket and skinning windows either replace the kill loot or are dropped, and item
sources (disenchanting, containers) are not recorded at all. The fix belongs to the protocol and addon lanes.

**First slice.**

| Number | Denominator | Date | Method |
|---|---|---|---|
| Windows with the item | out of the source's loot windows | first and last capture day of those windows, and the corpus time | addon loot windows the loot API attributed (`sourceEvidence: "loot-api"`), one count per window however many stacks |
| Loot windows on a source | all loot-API windows on that creature or object | same | windows with no install id or no source are left out and counted as left out |
| Installs | distinct voters among those windows (Recorder ids folded as `publicRecords` does) | same | — |
| Observed frequency | windows with the item ÷ loot windows on the source | same | shown only once 3 installs looted the source (unchanged rule); equal to `rollupDrops`' public rates |
| Pending windows | Recorder windows per NPC or item | not dated (unchanged) | `pendingLootFromRecords`, never in a rate (unchanged) |

What the pages show:

- **NPC page, Drops tab.** No windows: "Nobody has looted this NPC in Forever yet." Windows from 1 or 2
  installs: "N loot windows from M installs, dated D1 to D2. A rate needs windows from 3 installs: K more." and
  no item list. From 3 installs: the table (item, windows with it, out of, observed frequency, installs) and a
  line with the denominator, dates, method and corpus time; with no item in any window, the measured zero with
  the same line.
- **Item page, Dropped by tab.** One row per source 3 installs looted, with its windows dated. Windows on
  sources short of 3 installs are one sentence without naming the sources: "N loot windows with this item from
  M installs, on sources fewer than 3 installs have looted. A rate needs windows from 3 installs on the same
  source."
- The pending line is unchanged on both pages.

## Files

- `docs/design/specs/2026-10-21-loot-tables-design.md`: the spec.
- `kb/src/loot-tables.ts`: `lootTablesFromRecords`, `npcLootTable`, `itemDropSources` and the page sentences.
- `kb/test/loot-tables.test.ts`: rows and denominator, consistency with `rollupDrops`, object sources, short of
  3 installs, a window with no reporter, the pending counts, zero windows (no rate, no division), zero items
  from 3 installs (measured zero), capture times after the corpus time, implausible items.
- `web/src/lib/rollup-compute.ts`: the tables join the shared aggregate set; `loadLootTables`.
- `web/src/app/database/loot-tables.tsx`: the two panels.
- `web/src/app/database/npcs/[id]/page.tsx`, `web/src/app/database/items/[id]/page.tsx`: the drop tabs use
  the panels; nothing else on the pages changes.
- `web/src/app/database/loot-tables.test.tsx`: both pages at 3 installs and at 2.
- `web/src/app/database/items/icons.test.tsx`, `category-page.test.tsx`: their `rollup-compute` mock gains
  the new loader.
- `docs/2026-10-21-lane-loot-tables-closeout.md`: this handoff.

## Verification

- New KB tests failed before `kb/src/loot-tables.ts` existed (module missing), then passed: 10 tests.
- Full KB suite: 104 files, 1,095 tests passed. KB typecheck passed.
- Full web suite: 209 files passed, one skipped; 2,054 tests passed, three skipped. Web typecheck passed.
- Web lint (no errors; the warnings are in files this PR does not touch), the internal-path guard and the
  Markdown link check passed locally.

"The case where the expected count is zero" was read two ways and both are tested: a source with no windows
(no rate, no division by zero, the page says nothing was looted) and a source with windows from 3 installs and
no item (the measured zero).

## Boundaries and handoff

Unchanged: the 3-install rule, the pending counts staying out of the rates, every `EVERLOOT_*` switch, the
MCP tool schemas and their text, the protocol, the addon, the corpus route, the bulk export, the object page,
the drops list page, the map pages, `fact-states.ts`, `world-pages.ts`, `instances.ts`, `object-spawns.ts`.
No migration. Nothing from pfQuest's loot data is read, quoted or committed, and no count of it appears
anywhere in this PR.

Next slices are listed in section 12 of the spec; the protocol and addon fields (section 3) come first. This
lane stops at the open PR; the coordinator reviews and merges.
