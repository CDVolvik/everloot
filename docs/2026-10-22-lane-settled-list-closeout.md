# Settled list and uploader filter closeout — 2026-10-22

Wave 4, lane A: build steps 5 and 6 of the [coverage and plateau design](design/specs/2026-10-21-coverage-plateau-design.md)
(section 4, "the off-switch"): the settled list, the uploader filter on the upload page and in the Desktop App, and
the server's tally for rows that repeat a settled fact. It builds on the fact states, the coverage score
([closeout](2026-10-22-lane-coverage-score-closeout.md)) and the idle cron
([closeout](2026-10-22-lane-idle-cron-coverage-report-closeout.md)).

## What was built

**The list, `kb/src/settled-list.ts`.** `computeSettled` is a pure function of the folded public records, the corpus
time, the build and the recheck scopes. It returns one compact list per upload row kind, at the grain a row has:

- `npc_sighting`: NPC ids whose name, level, creature type, rank and every role are settled, each with the maps whose
  pin is settled (5 installs, all within 5 map units of the median, the third at least 14 days old). A sighting is
  skipped when its NPC and its map are both listed.
- `quest`: quest ids whose every reported field is settled: title, level, giver, turn-in, each reward, category,
  group size, tag, and side by the spec's 5-and-none rule.
- `vendor`: vendor ids whose every offer has a settled price and stock.
- `loot`: `npc` and `obj` source ids with at least 200 loot-api windows, every item at 3% or more holding a settled
  rate. Recorder windows carry no loot-api source and never settle a source.
- `instance_entrance` (instance with its outdoor maps), `encounter` (encounter with its instance: listed, name and
  every boss NPC settled) and `object_sighting` (object with the maps where every treasure cluster and the name are
  settled).

A field nobody reported does not hold an entity open; a field reported but not settled does. Recheck scopes are
honoured as the score honours them: only reports after the scope's date count, so a fact a patch may have changed
leaves the list until it settles again. Ids are sorted and delta-encoded. Settled implies confirmed, so the list
holds only facts the pages already show: nothing from the local baseline.

The file the cron writes also carries each fact's settled values, all of them already public, keyed by the same fact
key the uploaders skip by (`npc:1@1429`, `quest:783`, `loot:npc:99`). `matchSettled` returns the key when a row agrees
in every field, and null when anything differs: another name, a level nobody reported before, a role not in the list,
a pin position outside 5 map units, a new reward, a new vendor item or price, a loot item the source never dropped.

**Where it is written and served.** The snapshot cron calls `writeSettled` (`web/src/lib/settled-store.ts`) beside
`writeCoverage`, under the same rule: only after a run that changed the snapshot, dated by the snapshot's
`dataAsOf`. A failure is logged and does not fail the run. The file is `coverage/settled-<build>.json` in R2.
`GET /api/coverage/settled?build=<build>` serves the list without the values, with an ETag and a 304 on
`If-None-Match`. A build the cron has not written gets an empty list (`dataAsOf: null`), so nothing is skipped until
the server has looked at a new build. A malformed build is a 400; unreachable storage is a 503 with `no-store`, so an
app keeps the copy it has instead of caching an empty list.

**The uploader filter.** `prepareUpload` takes an optional `skip(record)` and returns the skipped rows' event ids
in `skipped`. Legacy rows without an event id and named rows are never skipped. Both callers build `skip` with
`settledSkip(list, clientBuild)`, which skips nothing without a list, for a file without a build, or for a list of
another build.

- The upload page fetches the list for the file's build when it reads the file (5 s timeout; no answer means nothing
  is skipped) and says in the preview: "Skipped 312 already settled: these rows repeat facts at least five installs
  agree on, with no other report for 14 days, so Everloot does not need them again. They stay in your file."
- The Desktop App (`desktop/src/main/jobs.ts`) passes `uploadFile` a loader, `appSettledList`
  (`web/src/lib/settled-cache.ts`), which keeps `settled-<build>.json` beside `sent.json`, refreshes it once a day
  with its ETag, and falls back to a copy up to a week old when the site is out of reach. `uploadFile` marks skipped
  rows handled in `sent.json`, so they are not weighed again, and returns `skipped`. The app's log reads
  "sent 40 new events in 1 batch(es); skipped 312 already settled; kept …".

**The server tally.** With `EVERLOOT_SETTLED_TALLY=1` (strict, off), the intake reads the file for the upload's
build (a file without a build is read against the site's build), at most every 10 minutes. A row that matches its
settled fact in every field is accepted in the receipt, not stored, and its install is added to the fact's voters
through `tally_settled_facts`, a `security definer` function like the intake quotas
(`supabase/migrations/20261023120000_settled_tallies.sql`, not applied). The install is kept only as an HMAC; a fact
counts each install once and every call moves `last_seen`. A row that differs in any field is stored in full. If the
tally call fails, the rows are stored in full instead: not counted is not lost. An upload of nothing but repeats is
confirmed without an upload object; the receipt says `settled: <n>`.

## Files

- New: `kb/src/settled-list.ts`, `kb/test/settled-list.test.ts`, `web/src/lib/settled-store.ts` and its test,
  `web/src/lib/settled-cache.ts` and its test, `web/src/app/api/coverage/settled/route.ts` and its test,
  `web/src/app/api/intake/settled.test.ts`, `supabase/migrations/20261023120000_settled_tallies.sql`,
  `supabase/tests/settled_tallies.sql`, this file.
- Changed: `web/src/lib/upload-batches.ts` and its test, `web/src/app/upload/UploadClient.tsx`,
  `web/src/app/api/intake/route.ts`, `web/src/app/api/cron/snapshot/route.ts` and its test,
  `companion/src/uploader.ts` and its test, `desktop/src/main/jobs.ts` and its test, `.env.example` (the switch, off).
- Not changed: `kb/src/coverage.ts`, the coverage page, `packages/protocol/**`, the addon, the MCP tools,
  `docs/DATA_POLICY.md`, `CHANGELOG.md`, any switch value, secret, release or tag.

## Verification

- `kb/test/settled-list.test.ts`: 13 tests. Delta encoding; an NPC listed with only its settled maps; a spread pin,
  a split level and a second name inside 14 days keep it out; no corpus time and a new build list nothing; the list
  agrees with `computeCoverage` on the same records; quests need every reward settled; vendors need every offer;
  loot at 200 windows and not 199, Recorder windows never; entrances, encounters and treasures; a recheck scope
  removes a fact until it settles again after the scope's date; `settledSkip` by NPC and map together and only for
  its own build; `matchSettled` field by field; strict parsing, and the public list carries no values.
- Web: `settled-store` 4, `settled-cache` 2, the endpoint 3, the intake tally 5, the cron 1 new (14 in all), and one
  new `upload-batches` test. Companion: 2 new (43 in all). Desktop: 1 new, the app's log line and its cached list
  (137 in all).
- The migration and `supabase/tests/settled_tallies.sql` ran clean on a throwaway Postgres 16 container with the
  roles `anon`, `authenticated` and `service_role`: closed to the browser roles, RLS on, the service role can only
  call the function, one install counts once, bad builds, raw install ids and malformed fact keys are refused.
  Not applied anywhere else.
- Full KB suite, rebased on `main` with #319: 111 files, 1,171 tests pass; KB typecheck passes.
- Full web suite, rebased: 217 files pass and 1 is skipped; 2,119 tests pass and 3 are skipped. Web typecheck, lint (only the
  existing warnings) and `next build` pass. Companion and desktop typecheck pass; the desktop build bundles only
  `settled-list`, `fact-states` and `coverage` from `kb/`.
- A synthetic corpus of 120,000 records (4,000 NPCs, 3,000 quests, 30,000 loot windows) settles in about 0.35 s:
  7,000 facts, a 42 KB public list and a 634 KB file with values.
- No production cron, rebuild, upload or switch was run or changed. Nothing here was tested against the live client.

## Decisions for the reviewer

1. **The tally ships behind a new switch, `EVERLOOT_SETTLED_TALLY`, off**, with its migration unapplied. The tally is
   real (table, function, intake path, failure fallback), but turning it on needs the owner to apply the migration
   and decide open question 3.
2. **Voters, not rows.** The table counts distinct installs per fact (an HMAC per install), so a re-upload or a
   retried batch never counts twice. Recorder ids are not folded here the way `publicRecords` folds them: two
   Recorder characters of one player add two voters to a settled fact's tally. The tally does not change any page.
3. **The spec's server file and the public list are one object.** The cron writes the list and the values in
   `coverage/settled-<build>.json`; the endpoint strips the values. The values are all public (settled facts).
4. **`kb/src/settled-list.ts` re-implements the score's private position rule** (`settledAt`, beside the score's
   `position`) rather than touching `kb/src/coverage.ts`, which lane B owns. Both use `POSITION_TOLERANCE` from the
   score; a test holds the list and the score to the same settled facts. When `coverage.ts` is free, exporting its
   rule would remove the copy.
5. **Drop rates have no recheck cut-off yet**, so a source a scope covers stays out of the list while the scope
   exists. Conservative: those rows are sent.
6. **`settled-cache.ts` is the Desktop App's copy only**; the server side is a second new file,
   `web/src/lib/settled-store.ts`, so the app bundle does not pull in the site's storage code.
7. **A file without a build** skips nothing in the uploaders; the server reads it against the site's build, as the
   spec says, which is safe because only rows that agree in every field are tallied.
8. **The command-line uploader** (`companion/src/cli.ts`) does not pass a list, so it skips nothing.

## What the data policy would have to say (open question 3, not changed here)

`docs/DATA_POLICY.md` says: "Uploaded observations are public as individual, anonymous records … so anyone can count
installs and check our counts." With the tally on, that stops being true for settled facts. The wording would have
to become something like: "Uploaded observations are public as individual, anonymous records … so anyone can count
installs and check our counts. Once a fact is settled (five installs agree on it, with no other report for 14 days),
an upload that repeats it in every field is not kept as a record: it adds its install to a published count of
agreeing installs for that fact, with the time it was last seen. An upload that differs in any field is kept and
published as a record, as before." The tally is not published anywhere yet; publishing it (an endpoint or a field
in the corpus) belongs with that decision, and the switch should stay off until both are done.

## What is not built, and what remains

- Publishing the tallies, and the policy wording above; then turning the switch on.
- The weekly 2% spot check, the drop-rate recheck cut-off, and the weekly refresh after the plateau (lane B's plateau
  line is what would tell the app to slow down).
- `/api/coverage/settled` is not in the protocol's route catalogue (`API_ROUTES`), so it is not in
  `/api/openapi.json` or the API docs. That catalogue is in `packages/protocol`, which lane D owns.
- A changelog line, left to the coordinator because every lane edits that file. Proposed, under Unreleased:
  "Desktop app and site: an upload leaves out rows whose facts are already settled (five installs agree, with no
  other report for 14 days), and says how many it skipped. The list is at `/api/coverage/settled`."
- The Desktop App change reaches players with the next desktop release, which only Carlos cuts.

The coordinator reviews the diff and the checks and owns the merge.
