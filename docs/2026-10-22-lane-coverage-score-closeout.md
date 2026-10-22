# Coverage score lane closeout — 2026-10-22

Wave 3, lane 2: build step 4 of the [coverage and plateau design](design/specs/2026-10-21-coverage-plateau-design.md)
(the score and the public page) and the recheck part of step 7 (`kb/curated/recheck.json` and the build-watch
hook). It builds on the fact states ([closeout](2026-10-21-lane-fact-states-closeout.md)) and the drop-rate
settling rule ([closeout](2026-10-21-lane-coverage-engine-closeout.md)).

## What was built

**The score, `kb/src/coverage.ts`.** `computeCoverage` is a pure function of the folded public records, the corpus
time, the released zones, the game-file entrances, the counts-only expected file and the recheck scopes. For each
released zone, and for each of the nine types (quests, NPCs, pins, vendors, drops, rares, entrances, bosses,
treasures) and each field (quest title, level, giver, turn-in, reward, category, side, group size, tag; NPC name,
level, creature type, rank, role; pin position; vendor price and stock; drop rate; rare name and pin; entrance
position, name and type; boss listed, name and boss NPC; treasure position and name), it counts the facts
reported, to recheck, confirmed and settled, and the denominator `max(expected, observed)`.
`coverageShares` turns a cell into `settled / denominator` and `confirmed / denominator`, capped at 1.

- States come from `tallyVotes` for scalar fields and "listed" fields (a reward, a role, a boss), from the merged
  `measureDropRate` for drop rates, and from a position rule for pins, entrances and treasures: confirmed at 3
  installs, settled at 5 when every install stood within `POSITION_TOLERANCE` (5 map units) of the median and the
  third reported at least 14 days before the corpus time. A spread pin stays confirmed. Quest side follows the
  spec's 5-and-none rule.
- Placement: an NPC is counted on the map most installs placed it (pin positions first); a quest in its leading
  giver's zone, else its turn-in's; a vendor offer and an NPC drop in the NPC's zone; an object drop on the
  object's busiest map; an entrance in the zone the game files put it, else the players' map; a boss in its
  instance's entrance zone. Anything outside a released zone is *unplaced* (counted, never in a denominator).
  Held-back zones are left out entirely.
- The expected file (`everloot.coverage-expected/1`) is parsed strictly: counts per zone and type, the build, the
  date, the sources and the list of types it counts. A name, an id list, a negative count or any extra key refuses
  the whole file. A type it does not list has no denominator (`[?]`); a zone it leaves out of a listed type expects 0.
  Entrances have a denominator without it, from the game files.
- The lists of facts one or two installs short carry the type, the field, an id label ("NPC 200", "NPC 4 · item
  2589"), the installs behind the leading value, how many more are needed, and a link. Never a value under 3
  installs; contested facts are left out (they need agreement, not voters). At most 200 per zone, closest first,
  with the full count beside them.
- Every report states its method (`COVERAGE_METHOD`), its corpus time and the distinct folded installs behind it,
  overall and per zone.

**The page, `/database/coverage`.** A search box first (zone name, quest id or NPC id: an id says which zone it is
counted in), then one dense table, one row per released zone, with Quests to Treasures each as
`settled% / confirmed%`, sortable, lowest Quests first by default. A cell's counts are in its tooltip and in
screen-reader text. `/database/coverage/<zone>` shows the per-field table and the needs-more-installs table,
linked to the NPC, quest, vendor, object and instance pages. Site table style (`DataTable dense`, `FilterBar`),
data width, no breadcrumbs, no provenance or licence lines. Without the expected file the shares read `[?]` and
the needs tables still show. Unreachable storage says so.

**Where it runs.** `web/src/lib/coverage-compute.ts` computes the score once per corpus version (the key
`rollup-compute.ts` uses) and expected file, so a warm page pays nothing. The expected file is read from
`<build folder>/coverage-expected.json` in the private bucket, like the item names, for the client layer's build
only. `web/src/lib/coverage-store.ts` exports `writeCoverage({ added, rebuild })` for the snapshot cron: it skips
when the run added nothing and did not rebuild, else writes `coverage/<build>.json` to R2.

**Recheck.** `kb/curated/recheck.json` (`everloot.recheck/1`, empty) holds scopes: a date, a source, and a type,
zones or ids. The score counts only reports after a scope's date for the facts it covers (`tallyVotes`'
`recheckSince` and the same cut in the position rule). The build watch now adds scopes from its changelog entry:
a moved or removed zone puts its pins and entrances to recheck, a moved or removed entrance its own. For changed
tables, `npm run kb -- recheck-scopes <diff.json> --since <time> --source <build>` turns a `client-diff` output
into scopes (changed or removed `QuestV2` rows, changed `UiMap` rows). Reruns add nothing twice. The build-watch
workflow uploads the file with the generated ones, stages it, and its allowed-files list accepts it.

**Policy.** `docs/DATA_POLICY.md`, "Open sources", gains the sentence for Carlos's decision of 2026-10-21: counts and
percentages from the baseline may be shown, never a baseline name, id or row.

## Files

- New: `kb/src/coverage.ts`, `kb/src/build-watch/recheck.ts`, `kb/curated/recheck.json`,
  `kb/test/coverage.test.ts`, `kb/test/build-watch-recheck.test.ts`, `web/src/lib/coverage-compute.ts`,
  `web/src/lib/coverage-store.ts`, `web/src/lib/coverage-view.ts`, `web/src/app/database/coverage/page.tsx`,
  `web/src/app/database/coverage/[zone]/page.tsx`, `web/src/app/database/coverage/coverage.test.tsx`, this file.
- Changed: `kb/src/build-watch/watch.ts` (the hook), `kb/src/build-watch/render.ts` (two review lines in the
  pull request body), `kb/src/cli.ts` (`recheck-scopes`), `.github/workflows/build-watch.yml` (artifact, stage,
  allowed list, push check), `docs/BUILD_WATCH.md`, `docs/DATA_POLICY.md` (one sentence),
  `web/src/lib/talents/assets.test.ts` (one allow-list line: `coverage-compute.ts` reads the private bucket
  for the counts file, beside the item names).

## Verification

- `kb/test/coverage.test.ts`: 17 tests. Confirm at 3 and settle at 5 with the third 14 days old; 13 days does not
  settle; a spread pin stays confirmed; `max(expected, observed)` and the 100% cap; no denominator without the
  file while the needs list still fills; no unagreed value anywhere in the output; the strict expected file
  (names, id lists, negatives, extra keys, another build); unlisted types and absent zones; quest placement and
  unplaced quests; quest core fields; held-back zones; game-file entrances; drop rates settling from loot-api
  windows only (Recorder windows never count); recheck scopes by type, zone and id; the strict recheck file; repeat
  reports as one voter; rares.
- `kb/test/build-watch-recheck.test.ts`: 5 tests. Scopes from map changes (added ignored), from a client diff,
  idempotent writes, the dry run's scratch tree, and the committed file parses.
- `web/src/app/database/coverage/coverage.test.tsx`: 7 tests. The index (search before the table, the nine
  columns, `[?]` without a denominator, the measured line, no unagreed name, no breadcrumbs, no licence line);
  sorting and a bad sort as 404; the id and zone search; the zone page (fields, the needs table linked by id,
  canonical redirect, unknown zone 404); unreachable storage; the expected file read from the private bucket for
  this build only; the cron writer skipping an idle run and writing `coverage/<build>.json` with no names.
- Full KB suite: 108 files, 1,134 tests pass, the 22 new ones included. KB typecheck passes.
- Full web suite: 212 files pass and 1 is skipped; 2,080 tests pass and 3 are skipped. Web typecheck, lint (only
  the existing warnings) and `next build` pass; `/database/coverage` answered 200 on a local dev server. No
  screenshot was taken: the preview browser timed out.
- A synthetic corpus of 140,000 records (4,000 NPCs, 3,000 quests, 30,000 loot windows) scores in about 0.7 s,
  with a 162 KB report.
- Internal-path and Markdown-link guards pass.

## Decisions for the reviewer

1. **Core fields** decide an entity's state, the one its type's column counts: quests title, level, giver and
   turn-in; NPCs name only (many mobs have a level range, so level would hold NPCs open forever); vendors price;
   rares name and pin; entrances, treasures position; bosses "listed". The others show per field. A core field
   with no report caps the entity at reported.
2. **Pins settle by the position rule plus the 14-day age of the third voter**, the spread check standing in for
   "no conflicting report". The spec's pin paragraph names only the count and the radius.
3. **Quest side settles by count alone** (5 of one side and none of the other, or 5 of each), as the spec words it.
4. **The page computes the score itself** (memoized per corpus version) instead of reading the R2 file, so it works
   before the cron calls `writeCoverage`. The R2 file is there for the API, the MCP tool and the settled list.
5. **Per-field denominators**: a field with one value per entity shares its type's denominator; multi-valued
   fields (reward, role, boss NPC) show counts with no share.
6. **Contested facts** are not in the needs list: another voter does not settle a split.
7. The default sort is the Quests column, lowest first; zones without a denominator sort last.

## What is not built, and what remains

- **The cron call.** The cron route is lane 1's. After `writeSnapshot`:
  `const coverage = await writeCoverage({ added: result.added, rebuild }).catch((err) => { console.error("coverage failed", err); return null; });`
  (import from `@/lib/coverage-store`). Until then nothing is written to R2; the page does not need it.
- **The expected file** (`coverage-expected.json`) is lane 1's internal report to write, in the shape
  `CoverageExpected` in `kb/src/coverage.ts` defines (the strict schema; types listed explicitly), uploaded to the
  private bucket's build folder. Until it is uploaded, every share but entrances reads `[?]`.
- **Links in.** The sitemap and the `/database` index are other lanes' files; the page is reachable by URL only
  until one of them links it.
- Recheck cut-offs for drop rates and treasure names, the readers' own cut-off on the public pages, and the weekly
  spot check (step 7's other parts).
- The plateau (confirmed 90%, settled 75%, under 0.5% newly confirmed in 28 days), source-level loot settling, the
  settled list and uploader filter (step 5), server tallies (step 6), and the MCP tool `coverage` (wave 4).
- Nothing here needs the live client; no switch, migration, protocol, record kind, addon module, MCP schema or
  release changed.

The coordinator reviews the diff and the checks and owns the merge.
