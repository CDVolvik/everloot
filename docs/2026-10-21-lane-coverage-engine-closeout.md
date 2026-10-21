# Coverage engine lane closeout — 2026-10-21

Implements the drop-rate settling rule from section 1 of the
[coverage and plateau design](design/specs/2026-10-21-coverage-plateau-design.md),
the first piece after the merged fact states (PR #298). One piece only; the next
starts after this one is reviewed.

Review: pull request against `main`, link [?] until it is opened.

## Outcome

A drop rate settles when all three hold:

| Condition | Rule |
| --- | --- |
| Windows | At least 50 loot windows for the source |
| Voters | At least 5 distinct folded installs looted the source |
| Precision | The 95% Wilson interval's half-width is at most 3 percentage points, or 30% of the rate, whichever is larger |

Every measurement states how it was measured: the numerator (`drops`), the
denominator (`windows`), the source voters, the corpus date the caller supplies
(`dataAsOf`), the method (`wilson`) and the confidence (0.95). With no windows the
rate and interval are `null`, never a measured zero.

Only windows `lootWindowsFromRecords` already keeps count (`sourceEvidence:
"loot-api"`). Pending Recorder loot never reaches the rollup, so it cannot supply
the fiftieth window or the fifth voter. Voters are the rollup's `reporters`, read
from records that `publicRecords` has already folded.

## Constants

In `kb/src/drop-rate-settling.ts`, beside each other and tunable:

- `DROP_SETTLE_MIN_WINDOWS = 50`
- `DROP_SETTLE_MIN_VOTERS = 5`
- `DROP_SETTLE_ABSOLUTE_PRECISION = 0.03` (three percentage points)
- `DROP_SETTLE_RELATIVE_PRECISION = 0.30`
- `DROP_RATE_CONFIDENCE = 0.95`, `DROP_RATE_Z = 1.959963984540054`

## Files

- `kb/src/drop-rate-settling.ts`: `measureDropRate` and `meetsDropRateSettlingRule`,
  a pure module over the existing `DropRate` rollup rows.
- `kb/test/drop-rate-settling.test.ts`: the boundary and measurement tests.
- `docs/2026-10-21-lane-coverage-engine-closeout.md`: this handoff.

## Verification

- `kb/test/drop-rate-settling.test.ts`: 10 tests pass. With `drop-rollup.test.ts`: 15.
- Full KB suite: 104 files, 1,095 tests pass. KB typecheck passes.
- Wiki check: 28 pages, 0 problems.

The tests cover: 49 windows against 50 with five voters; 4 voters against 5 at 50
windows; the half-width exactly at 3 points and one hair over; exactly at 30% of
the rate and one hair over; precision holding a rate open after both minimums are
met, and the absolute allowance winning at a low rate; no windows giving `null`;
zero and all-drop samples keeping bounded Wilson intervals; the measurement's
numerator, denominator, voters, date and method; a window with the item twice
counting once; and pending Recorder loot that cannot settle a rate.

## Boundaries

No page, API route, reader, MCP schema, switch, migration, protocol, addon or
desktop file changed. The module has no caller yet, so nothing the site shows
today can change. No baseline row or count is read or quoted.

## What remains

From the design, in its build order:

- The rest of section 1: source loot settling (every item at 3% or more settled,
  at least 200 windows), pin spread and quest-side settling, and the
  `npm run kb -- fact-states` count.
- Idle cron: the early return, the day-only market fold, and `/api/health`
  reading a `cron/last-run.json` heartbeat.
- Internal coverage report and `coverage-expected.json`, written outside the repository.
- Coverage score (`kb/src/coverage.ts`, confirmed and settled over expected, per
  zone, type and field) and the public page.
- The plateau (confirmed at least 90%, settled at least 75%, under 0.5% newly
  confirmed in 28 days) and the 2% weekly spot check.
- Settled list and the uploader filter; server-side tallies.
- Recheck after a patch: the build watch hook and `kb/curated/recheck.json`.
- MCP tool `coverage`, with the next directory submission.
- Optional `EverlootWanted` slot addon.

Numbering note: the brief calls this piece PR 2. In the spec's build order,
drop-rate settling belongs to step 1 and step 2 is the idle cron. PR #298 left
drop rates out, so this pull request completes that part of step 1. The
coordinator decides how the remaining steps are numbered.

The coordinator reviews the diff and checks and owns the merge.
