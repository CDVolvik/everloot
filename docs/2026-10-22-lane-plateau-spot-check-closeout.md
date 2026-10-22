# Plateau and spot check lane closeout — 2026-10-22

Wave 4, lane B: section 5 of the [coverage and plateau design](design/specs/2026-10-21-coverage-plateau-design.md)
(the plateau and the weekly spot check), and the coverage report's own handling of a fact in recheck. It builds on
the coverage score ([closeout](2026-10-22-lane-coverage-score-closeout.md)), the internal coverage report
([closeout](2026-10-22-lane-idle-cron-coverage-report-closeout.md)) and the fact states
([closeout](2026-10-21-lane-fact-states-closeout.md)). Lane A builds the settled list and the uploader filter in the
same wave; this lane does not touch them.

## What was built

**The plateau, `kb/src/plateau.ts`.** A type is at its plateau when, over the facts expected in the released zones,
at least 90% are confirmed, at least 75% settled, and fewer than 0.5% became confirmed in the 28 days before the
data date. The site is at its plateau when quests, NPC pins, vendors and drops all are. The thresholds, the window,
the deciding types and the settled-list refresh (1 day while collecting, 7 at the plateau) are exported constants.

- Pure, over the coverage score's own input. `plateauInput` gives the input as it stood at the window's start: the
  reports captured by then, that time as the data date, and only the recheck scopes begun by then (a later scope
  would otherwise make an old fact read as recheck). `measurePlateau(now, then, records)` compares the two scores;
  `computePlateau(input, now?)` runs both.
- Confirmed and settled are the score's own totals over the released zones; the denominator is the score's
  `max(expected, observed)` per zone. Newly confirmed is the rise from the window's start to now, summed field by field
  and zone by zone, so a fact that left confirmed in one cell cannot hide one that joined in another.
- A fact in recheck is in the denominator and in neither count, now or at the window's start.
- Unknown is never a claim: without an expected file, with an empty denominator, or without a data date, a type's
  verdict is `null` (shown `[?]`), and so is the site's unless one deciding type is already below the line.
- Each figure carries its method (`PLATEAU_METHOD`), its data date and window start, and two install counts: the
  distinct folded installs behind the counted facts, and those with a report captured inside the window.

**The plateau on `/database/coverage`.** Under the page's measured line, one line: "Plateau: not yet. Quests not yet,
Pins not yet, Vendors not yet, Drops not yet." (or `[?]` per type and overall without the expected file), linked to a
"Plateau" section below the zone table: one row per deciding type with Confirmed, Settled, Newly confirmed and At
plateau, the counts behind each in a tooltip and in screen-reader text, then the measured line (data date, installs,
installs in the window) and the method. Shares round down to one decimal, so 89.99% never reads as 90%. The window's
score is computed once per corpus version and expected file (`web/src/app/database/coverage/plateau.ts`); the score
now is the one the page already loads.

**The weekly spot check, `kb/src/spot-check.ts`.**

- `isSpotChecked({ key, zone }, week, scopes)`: a fact is left out of the settled list in an ISO week when
  `spotCheckHash(key, week) < rate`. The hash is FNV-1a over `key|week` with MurmurHash3's finalizer, in plain
  JavaScript so the web and the KB give the same answer. The same week picks the same facts on every run; nothing
  from the corpus enters the pick.
- The rate is `SPOT_CHECK_RATE` (2%), or `SPOT_CHECK_BOOSTED_RATE` (10%) in a zone for the `SPOT_CHECK_BOOST_WEEKS`
  (4) weeks after a spot check found a conflict there. The boost reads only `kb/curated/recheck.json`: a scope whose
  source is `spot-check <week>` and that names the zone. Since both rates compare one hash, the boosted pick holds the
  base pick.
- Keys are at the settled list's grain (spec section 4): `npc:<id>`, `pin:<npc>:<map>`, `quest:<id>`, `vendor:<id>`,
  and `loot:npc:<id>` or `loot:obj:<id>`. The zone is placed by the coverage score's rule (an NPC on the map most
  installs pinned it on, then any map; a quest at its leading giver, then turn-in; a vendor at its NPC; a pin on its
  map).
- `spotCheckConflicts(records, week, scopes)` reads NPCs, pins, quests and vendors (a drop rate has no conflicting
  value). For each fact the current week or the three before picked (`SPOT_CHECK_LOOKBACK_WEEKS`), it asks whether the
  fact was settled when its week began, from the reports before then, and whether a report captured since conflicts:
  another value for any field, or a pin position more than 5 map units from the settled median. Each conflict becomes
  a recheck scope from the start of the week it was checked in, typed, with the fact's id and zone. A fact already under
  a spot-check scope is not reported again.
- `npm run kb -- spot-check [--week YYYY-Www] [--root ..] [--dry-run]` prints how many settled facts the week leaves
  out and the conflicts, and adds their scopes to `kb/curated/recheck.json` with the build watch's own writer (a rerun
  adds nothing). The week defaults to the current UTC week, the one the settled list should pick with, so an idle
  corpus does not hold one week's pick forever.

**Recheck in the internal report, `kb/src/coverage-report.ts`.** The report now reads the scopes in
`kb/curated/recheck.json` (`coverage-report` passes them; `--root` names the checkout) and applies each one per fact,
matched by type, zone and ids as the public score matches them: a fact in a scope that was confirmed before the scope's
date counts only reports after it and stays `recheck` until three new installs agree. `--recheck-since` still adds one
cutoff for every fact; the later of the two applies. The notes say how many scopes were read, how many fact fields are
in recheck, that a recheck fact is neither confirmed nor settled here or in the plateau, and that drop rates ignore
scopes. The report also states the plateau (JSON `plateau`, a "Plateau" section in the Markdown, one line on the
console), computed from its own expected counts with the public score's rules over the released zones.

## Files

- New: `kb/src/plateau.ts`, `kb/src/spot-check.ts`, `kb/test/plateau.test.ts`, `kb/test/spot-check.test.ts`,
  `web/src/app/database/coverage/plateau.ts`, this file.
- Changed: `kb/src/coverage-report.ts` (recheck scopes, notes, plateau), `kb/src/cli.ts` (`spot-check`, and the
  scopes and the plateau line in `coverage-report`), `kb/test/coverage-report.test.ts` (one test),
  `web/src/app/database/coverage/page.tsx` (the plateau line and section), `web/src/app/database/coverage/coverage.test.tsx`
  (two tests).
- Not changed: `kb/src/coverage.ts`, `kb/src/fact-states.ts`, `kb/src/world-pages.ts`, the instance and object readers,
  `kb/src/settled-list.ts`, the settled API, the uploaders, the Desktop App, the intake and cron routes,
  `kb/curated/recheck.json`, `docs/DATA_POLICY.md`, any migration, switch, protocol, addon module or MCP schema.

## Verification

- `kb/test/plateau.test.ts`: 7 tests. A type with everything settled long ago is at its plateau; a fact confirmed
  inside the window counts as new and one confirmed before it does not; 90% confirmed with 70% settled is not the
  plateau; the site needs all four deciding types and its refresh then goes weekly; no expected file or no data date
  gives `null`, never a claim; a recheck fact is neither confirmed nor settled and a scope begun inside the window is
  not applied to its start; the window's start keeps only reports captured by then.
- `kb/test/spot-check.test.ts`: 7 tests. ISO weeks at the year's edges (2020-W53, 2025-W01); over 20,000 keys the
  week picks between 1.7% and 2.3%, the same set on a rerun and a mostly different set the next week, and more than 60%
  of facts are picked at least once in 52 weeks; the 10% boost for exactly the four weeks after, only in the zone named
  and only for `spot-check` sources, holding the base pick; entity keys and placement; a renamed NPC conflicts and its
  scope parses and puts the NPC to recheck in the public score, while the same name, a report before the week, or a
  fact already scoped does not; a pin conflicts only beyond 5 map units; a fact not settled is neither counted nor
  checked.
- `kb/test/coverage-report.test.ts`: one new test (12 in all). A scope puts only the facts it names to recheck (the
  NPC's fields, not its pin); another NPC's or zone's scope, or a scope older than the reports, leaves the fact
  settled; the notes say so; the plateau counts the recheck fields in neither count; the Markdown has its Plateau table.
- `web/src/app/database/coverage/coverage.test.tsx`: two new tests (9 in all). The index states the plateau with
  `[?]` and no claim without the expected file, its columns, the method and the measured line; shares round down.
- Full KB suite: **111 files, 1,167 tests pass** (from 109 files and 1,152 on `main`); KB typecheck passes.
- Full web suite: **213 files pass and 1 is skipped; 2,103 tests pass and 3 are skipped.** Web typecheck and lint
  pass (only the existing warnings); `next build` passes.
- `spot-check --dry-run` against the live public corpus (read only): week 2026-W43, 0 of 0 settled NPCs, pins,
  quests and vendors, so nothing is left out yet and no conflict; nothing written.
- A synthetic corpus of 39,000 records (4,000 NPCs, 3,000 quests over 110 days): the score in 221 ms, the plateau's
  window score and diff in 189 ms more, the spot check in 433 ms, picking 181 of 9,779 settled entities (1.85%).
- Internal-path, Markdown-link, DCO and attribution guards pass.

## Decisions for the reviewer

1. **Newly confirmed is a rise between two scores, not a per-fact time.** The score keeps no per-fact confirmation
   time, and changing `coverage.ts` was out of this lane. Summing the rise per field and zone counts a fact that joins
   in one cell even if another leaves elsewhere. Two consequences: a fact that went to recheck and was confirmed again
   inside the window is not counted as new (it was confirmed at the window's start too), and an NPC whose busiest map
   changes counts once as new in its new zone. Both keep the rate a measure of facts joining.
2. **A record with no capture time reads as new** (it is left out of the window's start), so it can only delay the
   plateau. The protocol requires `capturedAt`, so this is the defensive case.
3. **The page's verdict is `[?]` while there is no expected file in the private bucket**, which is today's state; the
   numbers then show `[?]` too. The site verdict is "not yet" as soon as one deciding type is measurably below the line.
4. **The spot-check week is the current UTC week**, not the corpus date's. An idle week leaves `dataAsOf` where it was;
   picking by it would leave the same 2% out until the next upload.
5. **The boost begins the week after the conflict was found** and lasts four weeks, so a conflict found mid-week
   never changes that week's pick between two runs.
6. **The spot-check scope names the fact's zone**, which the boost needs; a public-score fact counted in another zone
   would not match it. The zone uses the score's placement rule, duplicated in `spotCheckFacts` and pinned by a test.
7. **Placement of the plateau's window score in the page**: `plateau.ts` under the coverage route rebuilds the score
   input (zones, held-back zones, entrances, scopes) rather than changing `coverage-compute.ts`, which other lanes read.

## What wave 5 must do: the readers' recheck cut-off

The plateau and the spot check give a fact a recheck scope and a date; the public readers do not yet use either.
Wave 5 should:

- In the shared readers (`kb/src/world-pages.ts`'s `agreedLabel`, `agreedNumber`, `agreedLabelsById`, the NPC pin,
  vendor offer, reward and role counts, and the instance and object readers in `kb/src/instances.ts` and
  `kb/src/object-spawns.ts`), take the recheck scopes and, for a fact in one, count only rows captured after the
  scope's `since`, as `tallyVotes({ recheckSince })` already does for the score. Then three new voters on a changed
  value show it, rather than two winning groups showing nothing.
- Pass the same `RECHECK_SCOPES` the score reads (`web/src/lib/coverage-compute.ts`) into the pages, and match scopes
  with one shared function: today the match is in `coverage.ts` (`since`) and mirrored in `coverage-report.ts`.
- Decide the drop-rate cut-off: neither the score nor the report recounts loot windows after a scope's date.
- Wire the spot check into the settled list (lane A's `kb/src/settled-list.ts`): leave out an entry when
  `isSpotChecked({ key, zone }, isoWeek(now), RECHECK_SCOPES)`, with the key formats above, and leave out every fact
  under any recheck scope.
- Use `PlateauReport.refreshDays` (or `SETTLED_LIST_REFRESH_DAYS`) for the Desktop App's settled-list refresh, for
  example by carrying the site verdict in the settled list's response.
- Run `spot-check` weekly (a scheduled workflow committing `kb/curated/recheck.json`, as the build watch does), once
  the settled list leaves facts out; until then there is nothing for it to find.

## What is not built, and what remains

- The readers' cut-off, the settled list's use of the pick, the Desktop App's weekly refresh and a scheduled
  spot-check run (above).
- The plateau in the MCP tool and in the cron's `coverage/<build>.json`; the page computes it itself.
- A per-fact confirmation time in the score, which would replace the rise between two scores.
- Observed, not changed: `loadCoverage` compares the expected file by object identity, and the file is parsed anew on
  every read, so with a file in the bucket the score is recomputed on each page view. The plateau's own memo keys on
  the file's content.
- Nothing here needs the live client; no switch, migration, protocol, record kind, addon module, MCP schema or release
  changed. The coordinator reviews the diff and the checks and owns the merge.
