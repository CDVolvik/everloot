# Idle cron and internal coverage report closeout

Implements steps 2 and 3 of the
[coverage plateau design](design/specs/2026-10-21-coverage-plateau-design.md), following the
[drop-rate settling closeout](2026-10-21-lane-coverage-engine-closeout.md).
The coordinator owns review and merge. Nothing is released by this change.

## Idle cron

Before replaying uploads, the cron reads the snapshot watermark and makes one index query:
`select=id`, `received_at=gt.<lastReceivedAt>`, `limit=1`. Without a snapshot it builds the first
one. `?rebuild=1` bypasses the idle probe and keeps the existing full rebuild behavior.

When caught up, it skips the corpus and completion writes. The market checks its own `generatedAt`
and skips its index read, fold and write on the same UTC date. A new UTC date still folds and prunes
the market. Quota cleanup and the existing conditional key/player retention still run.

There is one recovery exception to skipping rollups: a prior failed fold or unfinished bounded
completion batch must continue even without a newer upload. The successful-run heartbeat records
the corpus generation it completed and whether completion has work left. A generation mismatch,
missing heartbeat or pending completion retries the rollups without rewriting the corpus. Otherwise
an upload that advanced the corpus before a market failure, or a rebuild taking several completion
batches, would be stranded indefinitely on an idle site.

`cron/last-run.json` is written only after successful work, including a successful idle run. Health
reads its `generatedAt`, keeping the existing 30-minute threshold and unknown/error behavior. It
does not use the corpus object's age. The public corpus `dataAsOf` remains the last snapshot change.
On first deployment, health is missing until the first successful authorized cron run writes the
heartbeat. No migration or switch is needed. A failed heartbeat write fails the run.

## Local report

```text
npm run kb -- coverage-report --db <source db> --out <folder outside the repository>
  [--client <client snapshot>] [--recheck-since <ISO timestamp>]
```

The command reads the source database read-only, takes uploads from the same configured public
corpus or local files as `baseline-report`, and writes:

- `coverage-report.md`: every candidate field by zone and level, including baseline names, values,
  voter counts and missing, reported, contested, spread and recheck diagnostics.
- `coverage-report.json`: the same detail, including confirmed/settled fields, capture-time bounds
  and drop measurements with their Wilson interval.
- `coverage-expected.json`: version 1, with `zones` entries containing `zone`, `types` and `fields`.
  Counts only; no entity ids, names or rows. `zone` identifies a UiMap, an `area:<zone>` fallback,
  or `unplaced`. Identifier-bearing field labels are aggregated to `reward`, `role` or `npc`.

All three files must be outside the repository. The writer applies the same boundary check as
`writeBaselineReport`, before creating a directory. It never uploads or publishes a file.
Fixtures used in tests are handwritten; no real baseline detail is tracked.

## Decisions for review and the next lane

- Counts use **entity fields**, not whole entities. `types` is the number of expected field facts;
  `fields` subdivides that number. The universe includes observed additions and excludes expanded
  shared-loot joins. Consumers must use the same grain for their numerator.
- Local counts retain held-back zones, area-only placements and unplaced client quests. A public
  consumer must exclude held-back and unplaced candidates according to the design; this command
  does not authorize or implement their publication.
- Supply `--client` to include game-file-only quest and boss candidates. Without it the report
  explicitly marks that part of the universe unknown. Journal bosses match through their
  DungeonEncounter id; journal-only ids without that link cannot be matched to upload encounters.
- Placement uses an agreed NPC pin before the baseline zone, with the baseline's majority-spawn
  fallback. File entrances use the shared world-coordinate placement. Treasure candidates retain
  separate baseline spawn clusters; baseline coordinates identify candidates and never vote.
- Recorder identities fold before tallying. Scalar fields use `tallyVotes`; rate fields use the
  merged drop-rate measurement. Spread pins remain open. Quest-side settling remains conservative
  at confirmed while the dedicated side rule is pending. Object loot without capture times cannot
  settle a pin. Missing values display as `[?]`.
- `--recheck-since` supplies an explicit local cutoff to the existing scalar tally. It is not patch
  detection, scoped recheck storage or a drop-rate recheck rule.

## Verification

- Full KB suite: **107 files, 1,122 tests passed**. The new report suite has **10 passing tests**.
- Full web suite: **211 files, 2,081 tests passed**, with **1 file / 3 existing tests skipped**.
- Both typechecks and the production web build pass. Web lint passes with existing warnings outside this lane.
- Wiki check: **28 pages, 0 problems**. Private-path and Markdown-link guards pass.
- The real CLI completed against the maintainer's local baseline and client snapshot with the
  public corpus connected; all artifacts stayed outside the repository. No baseline detail is
  included here. The synthetic CLI test also proves the source database hash stays unchanged and
  an internal output directory is refused before any artifact is written.
- Cron tests cover the strict bounded probe, same-day/day-change market behavior, idle write skips,
  explicit rebuild, pending-fold recovery, failure handling and heartbeat freshness.

## Boundaries and remaining work

No coverage score or public coverage page, item facts, assets, tooltip, sitemap, importer, name-gap
reader, protocol, record kind, MCP schema, addon module, migration, switch, secret or release changed.
No baseline file or counts file was uploaded. No production cron or rebuild was triggered.

Lane 2 owns the public coverage score/page and its denominator integration. Settled lists, uploader
filters, server tallies, patch detection, source-loot and quest-side settling, plateau/spot checks and
the optional wanted list remain separate work. Changes requiring live client behavior still wait
for the launch-day check. This lane's server/report changes do not prove any new in-game behavior.
