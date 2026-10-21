# Fact states lane closeout — 2026-10-21

Implements PR 1 of the coverage engine, following the
[coverage and plateau design](design/specs/2026-10-21-coverage-plateau-design.md)
and this lane's narrower scope.

Review: [PR #298](https://github.com/Everloot/everloot/pull/298), against `main`.

## Outcome

`tallyVotes` returns every scalar value group, its distinct voters, first and last
capture times, the third voter's time, the unique winning group, and a fact state:

| State | Implemented rule |
| --- | --- |
| missing | No valid report for a candidate supplied by the caller. |
| reported | No value has three voters, or multiple values do (contested). |
| confirmed | Exactly one value has at least three distinct installs. |
| settled | That value has at least five voters, its third voter is at least 14 days old, and no competing value gained a voter in the last 14 days. |
| recheck | A previously confirmed or settled fact has a supplied patch/build cutoff and has not yet regained a unique three-voter agreement after it. |

The constants are `WORLD_AGREEMENT = 3`, `SETTLE_EXTRA_VOTERS = 2` and
`SETTLE_WINDOW_DAYS = 14`. Time is `capturedAt`, clamped to the explicitly supplied
corpus time (`asOf`). Without usable capture times or corpus time, age cannot be
inferred. Recheck counts only captures strictly after `recheckSince`; three new
agreeing voters confirm again, and the ordinary settling rule then applies.

Text grouping retains the readers' trimmed, case-insensitive comparison and first
trimmed spelling. Numbers retain their integer rule. An install counts once per
value group; repeating its report never adds a voter. Different values remain
separate groups. Recorder character/address identities use the existing
`foldRecorderInstalls` in `publicRecords`, before the caller selects field rows;
the tally does not introduce a second identity rule or fold a field in isolation.

## Files

- `kb/src/fact-states.ts`: pure scalar tally, groups, constants and states.
- `kb/src/world-pages.ts`: the existing label and number readers wrap the shared
  tally, retaining their public results and the `WORLD_AGREEMENT` export.
- `kb/test/fact-states.test.ts`: state, threshold, time, identity and reader
  regression tests.
- `docs/2026-10-21-lane-fact-states-closeout.md`: this handoff.

## Verification

- Before implementation: nine state tests failed against an empty tally; the
  reader regression test passed against the existing readers.
- Focused state, world-page and Recorder tests: 23 passed.
- Full KB suite: 103 files, 1,085 tests passed.
- KB typecheck passed.
- Web regression suite: 207 files passed, one skipped; 2,035 tests passed, three
  skipped. Web typecheck passed.
- Wiki check: 28 pages, zero problems.
- Internal-path, Markdown-link, DCO and attribution guards passed; diff whitespace
  check passed.

The tests cover every state; two versus three voters; four versus five voters;
different values and multiple winning groups; repeated installs; one Recorder
character on two addresses; label normalization and integer validation; 13 versus
14 days and the millisecond boundary; the third distinct voter's date; new versus
repeat conflicting voters; future and missing timestamps; and recheck cutoff,
reconfirmation and resettling.

## Boundaries and handoff

Public page output is unchanged. No switch, migration, MCP schema, web app,
protocol, addon, players table or corpus route changed. No baseline rows are read
or published. This tally expects one scalar entity field at a time; discovering
the expected universe remains the coverage caller's responsibility.

Drop-rate and source settling, pin spread and quest-side settling, the CLI count,
the coverage rollup, plateau, cron idle skip, settled lists, and patch/build signal
wiring remain for their assigned later PRs. No PR 2 work is included. The
coordinator reviews the diff and checks and owns the merge; this lane does not
merge its PR.
