# Coverage score lane closeout — 2026-10-22

Wave 3, lane 2: build step 4 of the [coverage and plateau design](design/specs/2026-10-21-coverage-plateau-design.md)
(the score, the public page and the cron call) and the recheck part of step 7 (`kb/curated/recheck.json` and the
build-watch hook). It builds on the fact states ([closeout](2026-10-21-lane-fact-states-closeout.md)), the
drop-rate settling rule ([closeout](2026-10-21-lane-coverage-engine-closeout.md)) and lane 1's idle cron and
internal coverage report ([closeout](2026-10-22-lane-idle-cron-coverage-report-closeout.md)), merged into this
branch from `main` before the cron call was added.

## What was built

**The score, `kb/src/coverage.ts`.** `computeCoverage` is a pure function of the folded public records, the corpus
time, the released zones, the game-file entrances, the counts-only expected file and the recheck scopes. A fact is
one field of one entity, the grain lane 1's report counts its expected facts in: a quest's title, level, giver,
turn-in, each reward, category, side, group size and tag; an NPC's name, level, creature type, rank and each role;
each NPC pin's position; a vendor offer's price and stock; a drop rate; a rare's name and each map's pin; an
entrance's position, name and type; a boss's listing, name and each boss NPC; a treasure cluster's position and
name. For each released zone, each type's cell counts every field fact of that type, and each field's cell that
field's facts: reported, to recheck, confirmed and settled, over the denominator `max(expected, observed)`. The
type and field keys are the ones in the expected file, so the numerator and the denominator count the same thing.
`coverageShares` turns a cell into `settled / denominator` and `confirmed / denominator`, capped at 1.

- States come from `tallyVotes` for scalar fields and "listed" fields (a reward, a role, a boss), from the merged
  `measureDropRate` for drop rates, and from a position rule for pins, entrances and treasures: confirmed at 3
  installs, settled at 5 when every install stood within 5 map units of the median and the third reported at
  least 14 days before the corpus time. A spread pin stays confirmed. Quest side follows the spec's 5-and-none rule.
- Placement: an NPC is counted on the map most installs placed it (pin positions first); a quest in its leading
  giver's zone, else its turn-in's; a vendor offer and an NPC drop in the NPC's zone; an object drop on the
  object's busiest map; an entrance in the zone the game files put it, else the players' map; a boss in its
  instance's entrance zone. Anything outside a released zone is unplaced and never in a denominator; held-back zones
  are left out entirely. From the expected file only released UiMap zones are read: its `area:N`, `unplaced` and
  held-back entries stay out of every share and total, as lane 1 asked.
- The expected file is lane 1's `CoverageExpected` (`version: 1`, `zones: [{ zone, types, fields }]`), parsed
  strictly: counts only, under the nine type keys and the known field keys, zones as UiMap ids, `area:N` or
  `unplaced`. A name, an id, a row or any extra key refuses the whole file. A test runs lane 1's
  `buildCoverageReport` and scores its `expected` output, so the two stay in step.
- The lists of facts one or two installs short carry the type, the field, an id label ("NPC 200", "NPC 4 · item
  2589"), the installs behind the leading value, how many more are needed, and a link. Never a value under 3
  installs; contested facts are left out (they need agreement, not voters). At most 200 per zone, closest first,
  with the full count beside them.
- Every report states its method, its corpus time, its build and the distinct folded installs behind it, overall
  and per zone.

**The page, `/database/coverage`.** A search box first (zone name, quest id or NPC id: an id says which zone it is
counted in), then one dense table, one row per released zone, with Quests to Treasures each as
`settled% / confirmed%`, sortable, lowest Quests first by default. A cell's counts are in its tooltip and in
screen-reader text. `/database/coverage/<zone>` shows the per-field table (a field the file expects that nobody
reported still has its row) and the needs-more-installs table, linked to the NPC, quest, vendor, object and instance
pages. Site table style (`DataTable dense`, `FilterBar`), data width, no breadcrumbs, no provenance or licence lines.
Without the expected file the shares read `[?]` (entrances excepted) and the needs tables still show.
Unreachable storage says so.

**Where it runs.** The snapshot cron calls `writeCoverage` after `writeSnapshot`, only on a run that is not idle and
added uploads or rebuilt, and writes `coverage/<build>.json` to R2. The score is dated by the snapshot's
`dataAsOf`, the one lane 1's heartbeat carries, never by the run's clock. A coverage failure is logged and does
not fail the run or hold back the heartbeat; the next run that adds uploads writes it again. The pages compute the
same score themselves, once per corpus version and expected file (`web/src/lib/coverage-compute.ts`), so a page
view pays nothing once warm and does not wait on the cron. The expected file is read from
`<build folder>/coverage-expected.json` in the private bucket, like the item names; the folder ties it to a build.

**Recheck.** `kb/curated/recheck.json` (`everloot.recheck/1`, empty) holds scopes: a date, a source, and a type,
zones or ids. The score counts only reports after a scope's date for the facts it covers. The build watch adds
scopes from its changelog entry: a moved or removed zone puts its pins and entrances to recheck, a moved or removed
entrance its own. For changed tables, `npm run kb -- recheck-scopes <diff.json> --since <time> --source <build>`
turns a `client-diff` output into scopes (changed or removed `QuestV2` rows, changed `UiMap` rows). Reruns add
nothing twice. The build-watch workflow uploads the file with the generated ones, stages it, and accepts it.

**Policy.** `docs/DATA_POLICY.md`, "Open sources", gains the sentence for Carlos's decision of 2026-10-21: counts and
percentages from the baseline may be shown, never a baseline name, id or row.

## Files

- New: `kb/src/coverage.ts`, `kb/src/build-watch/recheck.ts`, `kb/curated/recheck.json`,
  `kb/test/coverage.test.ts`, `kb/test/build-watch-recheck.test.ts`, `web/src/lib/coverage-compute.ts`,
  `web/src/lib/coverage-store.ts`, `web/src/lib/coverage-view.ts`, `web/src/app/database/coverage/page.tsx`,
  `web/src/app/database/coverage/[zone]/page.tsx`, `web/src/app/database/coverage/coverage.test.tsx`, this file.
- Changed: `web/src/app/api/cron/snapshot/route.ts` and its test (the coverage call), `kb/src/build-watch/watch.ts`
  (the hook), `kb/src/build-watch/render.ts` (two review lines in the pull request body), `kb/src/cli.ts`
  (`recheck-scopes`), `.github/workflows/build-watch.yml` (artifact, stage, allowed list, push check),
  `docs/BUILD_WATCH.md`, `docs/DATA_POLICY.md` (one sentence), `web/src/lib/talents/assets.test.ts` (one
  allow-list line: `coverage-compute.ts` reads the private bucket for the counts file, beside the item names).
- Not changed: `kb/src/coverage-report.ts`, `web/src/lib/upload-store.ts`, `web/src/app/api/health/route.ts`.

## Verification

- `kb/test/coverage.test.ts`: 18 tests. Field facts confirming at 3 and settling at 5 with the third 14 days old;
  13 days does not settle; a spread pin stays confirmed (and the radius equals the baseline's); `max(expected,
  observed)` at field grain and the 100% cap; an expected field nobody reported keeps its row; `area:N`,
  `unplaced` and held-back entries kept out of every share and total; no denominator without the file while the
  needs list still fills; no unagreed value anywhere; the strict file (names, unknown keys, bad zones, negatives,
  rows); lane 1's report output parsed and scored at the same grain, with no baseline name in the result; quest
  placement and unplaced quests; one field confirmed while another is short; held-back zones; game-file entrances;
  drop rates from loot-api windows only; recheck scopes by type, zone and id; the strict recheck file; repeat
  reports as one voter; rares.
- `kb/test/build-watch-recheck.test.ts`: 5 tests. Scopes from map changes, from a client diff, idempotent writes,
  the dry run's scratch tree, and the committed file parses.
- `web/src/app/database/coverage/coverage.test.tsx`: 7 tests, and `web/src/app/api/cron/snapshot/route.test.ts`:
  two new (the score written after a changed snapshot with its `dataAsOf`, never on an idle run; a coverage failure
  logged with the run and heartbeat still succeeding), 13 in all.
- Full KB suite on the branch merged with `main`: 109 files, 1,145 tests pass; KB typecheck passes.
- Full web suite: 212 files pass and 1 is skipped; 2,090 tests pass and 3 are skipped. Web typecheck, lint (only
  the existing warnings) and `next build` pass.
- Internal-path, Markdown-link, DCO and attribution guards pass.
- A synthetic corpus of 140,000 records (4,000 NPCs, 3,000 quests, 30,000 loot windows) scores in about 0.9 s,
  with a 162 KB report.
- `/database/coverage` answered 200 on a local dev server. No screenshot: the preview browser timed out.

## Decisions for the reviewer

1. **Field grain throughout**, to match lane 1's expected counts: the Quests column is quest fields, not quests.
2. **Pins settle by the position rule plus the 14-day age of the third voter**, the spread check standing in for
   "no conflicting report".
3. **Quest side settles by count alone** (5 of one side and none of the other, or 5 of each), as the spec words it.
4. **The page computes the score itself** (memoized per corpus version) rather than reading the R2 file, so it never
   shows a stale score after a failed cron write. The R2 file is there for the API, the MCP tool and the settled list.
5. **A released zone the file leaves out expects 0**, so its share is `[?]` rather than a misleading 100%.
6. **Contested facts** are not in the needs list: another voter does not settle a split.
7. The default sort is the Quests column, lowest first; zones without a denominator sort last.

## Asked of `kb/src/coverage-report.ts` (not changed here)

- **Date the expected file.** `writeCoverageReport` writes `report.expected` without the report's `dataAsOf`, so the
  page says the counts were made on `[?]`. Adding `dataAsOf: report.dataAsOf` to the written object is enough: the
  parser already accepts it.
- **Field keys.** The parser accepts the keys the report writes today (rewards, roles and boss NPCs already
  collapse to `reward`, `role`, `npc`). A new field there needs the same key added to `COVERAGE_FIELDS` here, or the
  file is refused whole.

## What is not built, and what remains

- **Links in.** The sitemap and the `/database` index are other lanes' files; the page is reachable by URL only
  until one of them links it.
- Recheck cut-offs for drop rates and treasure names, the readers' own cut-off on the public pages, and the weekly
  spot check (step 7's other parts).
- The plateau (confirmed 90%, settled 75%, under 0.5% newly confirmed in 28 days), source-level loot settling, the
  settled list and uploader filter (step 5), server tallies (step 6), and the MCP tool `coverage` (wave 4).
- Nothing here needs the live client; no switch, migration, protocol, record kind, addon module, MCP schema or
  release changed.

The coordinator reviews the diff and the checks and owns the merge.
