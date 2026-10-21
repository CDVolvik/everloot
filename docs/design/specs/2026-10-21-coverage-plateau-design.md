# Coverage and a plateau: collection winds down once facts are settled

**Date:** 2026-10-21
**Status:** design for Carlos's review. Nothing here is built.
**Builds on:** the 3-install rule (`kb/src/world-pages.ts`), the local Classic baseline (PR #289,
[spec](2026-10-17-classic-baseline-design.md)), Polestar Recorder uploads and their voter fold (#290),
Recorder rares, dungeons, bosses and treasures with pending loot (#291).

## Why

The data is Everloot's own. Players do not feed the site forever; they verify facts. Carlos, 2026-10-21:
"at first we need to populate that data … there will be a time where we won't need any data upload …
players just verify them so we can have that extra check that someone has encountered it … we don't want
this tool constantly pulling forever … we will have a plateau."

Two kinds of data:

- **Data Everloot makes itself.** Game files: ids, relations, zones, flight paths, dungeon entrances
  (`kb/src/client-extract.ts`, `web/src/data/game-data/`), plus lore and titles from the Warcraft Wiki
  dump. Nothing to collect from players.
- **Data only the game server knows.** NPC positions, drops, quest givers and turn-ins, vendor prices,
  rares, bosses, treasures. Someone has to play to see them. Carlos's own play with the addon counts as
  one voter, like anyone's.

Today every reader counts agreement, but nothing says when a fact is done. So every upload sends every
row, the server stores every row, and the cron rewrites the corpus every 10 minutes whether or not
anything arrived. This spec adds the missing idea: a fact can be **settled**, and a settled fact stops
being collected.

## 1. Fact states, per entity and per field

A state belongs to one field of one entity: a quest's title can be settled while its turn-in NPC is
still missing.

| State | Rule |
|---|---|
| missing | A candidate exists only from the game files or the local pfQuest baseline; no voter has reported it |
| reported | 1 or 2 voters, or 3+ voters split so no single value wins |
| confirmed | `WORLD_AGREEMENT` (3) voters agree on one value: what the pages already show |
| settled | Confirmed, plus **N = 2** more agreeing voters (5 in all), plus **no conflicting report for 14 days** after it was confirmed |
| recheck | Was confirmed or settled, and a patch may have changed it (section 5) |

N and the window are constants in one module (`SETTLE_EXTRA_VOTERS = 2`, `SETTLE_WINDOW_DAYS = 14`), tunable
without touching the readers. Why these: 5 voters means two people beyond the first three have walked up to
the same NPC and seen the same thing, which is the "extra check" Carlos asked for; 14 days covers two weekly
resets and one weekend of play, so a fact that only holds on some days is caught. Time is the rows'
`capturedAt` (`packages/protocol/src/records.ts:39`), clamped to the corpus time as the relation edges do
([relation edges](2026-10-18-relation-edges-design.md), "First and last seen").

**Voters.** A voter is an `installId`. Addon installs count as they are. Recorder ids (`ps-<character>-<address>`)
are folded by `foldRecorderInstalls` (`kb/src/recorder-installs.ts`, #290), applied once in `publicRecords`
(`kb/src/corpus.ts`, #291), so ids that share a character or an address count as one voter. Every state
below reads the folded records, so a player's alts never settle a fact for them.

**How each state comes from the existing readers.** The readers already group rows by value and count
distinct installs; they just throw the groups away and keep the winner:

- `agreedLabel` (`kb/src/world-pages.ts:100`) groups by the trimmed, lower-cased label and returns the one
  group with 3+ installs, or null when none or two do. `agreedNumber` (line 139) does the same for integers.
  Used for NPC names, quest titles, levels, giver and turn-in ids, NPC traits (`npcTraits`, line 196) and
  quest traits (`questTraits`, line 265); `agreedLabelsById` (line 114) for many ids at once, and by
  `kb/src/instances.ts` (#291) for instance and encounter names.
- NPC pins (`npcPage`, line 169) keep rows whose `positionKind` is in `PIN_POSITION_KINDS` (line 31: `npc`,
  `interaction`, and `vignette` after #291), group them by map, and draw a pin at the median once 3
  installs saw the NPC on that map. A `player` position never makes a pin.
- Vendor offers (`vendorPage`, line 291) group by item and copper price; 3 installs make an offer.
- Rewards and roles count installs per item id and per role (lines 255, 217).

The new module, `kb/src/fact-states.ts`, keeps those groups instead of discarding them. A small shared
helper, `tallyVotes(rows)`, returns every value group with its voters and its first and last `capturedAt`;
`agreedLabel` and `agreedNumber` become one-line wrappers over it, so the pages' output does not change
(tests pin that). From the groups:

- **missing**: no group at all, and the id is in the expected universe (section 2).
- **reported**: no group with 3 voters, or two groups with 3 (the reader returns null today; the internal
  report marks these *contested*).
- **confirmed**: exactly one group with 3+ voters.
- **settled**: that group has 5+ voters, its third voter is at least 14 days old, and no other group
  gained a voter in those 14 days. A text value differing only in case or spacing is the same group, as
  today.
- **Pins** are the one place a different value is normal (NPCs walk). A pin is settled when 5+ voters saw
  the NPC on that map and all of them within 5 map units of the median (`POSITION_TOLERANCE`,
  `kb/src/baseline-report.ts` in #289). A pin with voters outside that radius is *spread*: it stays
  confirmed and keeps collecting, so the off-switch never hides a patrol path.
- **Quest side** (`questTraits`, line 272) settles as Alliance or Horde with 5 voters of that side and none
  of the other; as Both with 5 of each.
- **Reaction** is left out: it depends on the reporting player's faction (comment above `npcTraits`).

What each type holds (entity, then its fields), from the readers:

| Type | Entity | Fields that get a state |
|---|---|---|
| Quest | quest id | title, level, giver, turn-in, each reward item, category, side, group size, tag |
| NPC | NPC id | name, level, creature type, rank, each role |
| NPC pin | NPC id and map | position |
| Vendor | vendor NPC id and item | price, stock |
| Drop | source and item | rate (below) |
| Rare | NPC id with rank `rare` or `rare_elite` | name, pin (a `vignette` pin after #291) |
| Dungeon entrance | instance map id and outdoor map | position, name, type (`confirmedEntrances`, #291) |
| Boss | instance and encounter id | listed, name, boss NPC ids (`instanceBosses`, #291) |
| Treasure | object id and cluster | position, name (`object_sighting`, #291) |

**Drop rates.** `rollupDrops` (`kb/src/drop-rollup.ts:51`) counts loot windows per source and per item;
a rate is public when 3 installs looted the source (`INDEPENDENT_INSTALLS`, line 10). Only windows the
loot API attributed count (`lootWindowsFromRecords`, line 135, keeps `sourceEvidence: "loot-api"`);
Recorder windows are only counted as pending (`kb/src/pending-loot.ts`, #291) and never move a rate toward
settled. Three installs say a drop exists, not what its rate is, so a rate has its own rule:

- A **rate is settled** when the source has at least 50 windows from at least 5 voters and the 95% Wilson
  interval's half-width is at most 3 percentage points or 30% of the rate, whichever is larger.
  Roughly (normal approximation): a 50% drop needs the minimum 50 windows, 20% about 170, 10% about 380
  (the worst case), 5% about 200, 1% the minimum 50.
- A **source's loot is settled** when every item it drops at 3% or more is settled and it has at least 200
  windows. Items under 3% (world drops, rare patterns) do not hold the source open; they keep their
  interval on the item page. Whether rare drops should keep a source open is an open question.
- Thresholds are tunable constants beside the others.

## 2. The expected universe (the denominator)

The union of what Everloot knows from its own game files and what the local baseline lists, plus anything
players report that neither has:

| Type | From the game files | From the local baseline (#289) |
|---|---|---|
| Quests | `QuestV2` ids (no titles; read in `kb/src/game-names.ts:127` and `kb/src/name-gaps.ts:84`) | pfQuest quests with their giver and turn-in (`start.U`, `end.U`) |
| NPCs, NPC pins | none: `Creature` has 179 rows in build 1.60.1.70450 ([client coverage tables](2026-10-18-client-coverage-tables-design.md)) | pfQuest units with spawns mapped to a UiMap |
| Rares | none | pfQuest units with a rare rank (`rank` is imported, `kb/src/importers/pfquest.ts`; `readBaseline` does not read it yet) |
| Vendors | none | pfQuest item vendor lists (`V`) |
| Drops | none | pfQuest direct drops; shared loot tables stay a join and are not counted, as `compareBaseline` does |
| Dungeon entrances | `map.json` `entrances` (25 today) | none |
| Bosses | `DungeonEncounter` and `JournalEncounter`, in `CLIENT_TABLES` (`kb/src/client-snapshot.ts`); whether the Forever build fills them is not checked yet | none |
| Treasures | none: `GameObjects` is almost all map labels | pfQuest objects with spawns |
| Zones | `map.json` `zones` (46), minus `heldBackZones` (3) | pfQuest AreaTable zones, mapped to UiMap by `pfquest.ts` |

Placement: a fact belongs to a zone by its agreed pin when it has one, else by the baseline's zone (the
`zoneOf` rule in `compareBaseline`, `kb/src/baseline-report.ts:131`). Game-file-only quest ids have no zone
(`QuestV2` holds none); they are counted as *unplaced* in the internal report and left out of the public
denominator, since many may be unreleased. Held-back zones are left out of public counts entirely, as the
map already does.

**The baseline stays local.** `compareBaseline` writes its report outside the repository and refuses a
path inside it (`writeBaselineReport`, line 358). The coverage report does the same. Public pages, the API
and the MCP tool may show only **counts and percentages** derived from the baseline: never a baseline
name, id or row, and never a "not seen" list. A public drill-down lists only what Everloot itself holds:
reported facts (already public as anonymous records) and game-file entrances already on `/map`.

**Against `docs/DATA_POLICY.md`.** Consistent with its rules as written: the policy (as #289 amends its
"Open sources" paragraph) says the baseline "is never published and never mixed into the CC BY-SA data:
only what players' uploads confirm is published". A count is not a baseline row, and no baseline value
enters the CC BY-SA data. But the policy says nothing about aggregates derived from a local-only source,
and a per-zone denominator does reveal something about the GPL-derived data (how many quests Classic had
in a zone). Showing those counts publicly needs Carlos's decision and one added sentence in the policy;
it is open question 1. Until then the denominator shows only in the internal report.

**Where the denominator is computed.** The baseline lives on the maintainer's machine; the snapshot cron
runs on Vercel and cannot read it. Recommended: the local run writes a counts-only file,
`coverage-expected.json` (per zone and type: how many facts are expected, no ids), which the maintainer
uploads to the private bucket beside `item-names.json`. The cron reads it for the denominator and computes
the numerator live; a zone's live denominator is `max(expected, observed)`, so a fact new in Forever never
pushes coverage over 100%. The alternative, uploading baseline ids so the server computes the union
exactly, takes the baseline off the maintainer's machine; that is open question 2.

## 3. The coverage score

`coverage = settled / expected`, with `confirmed / expected` beside it, per zone, per type (quests, NPCs,
NPC pins, vendors, drops, rares, dungeon entrances, bosses, treasures) and per field (quest turn-in, NPC
level, vendor price and so on).

- **Computed** in `kb/src/coverage.ts`: a pure function of the folded public records, `fact-states.ts`
  and the expected counts. The snapshot cron (`web/src/app/api/cron/snapshot/route.ts`) runs it after
  `writeSnapshot`, only when the snapshot changed, and writes `coverage/<build>.json` (counts and the
  settled list, section 4) to R2. The site's rollups already compute once per corpus version
  (`web/src/lib/rollup-compute.ts`), so pages pay nothing extra.
- **Internal report**: `npm run kb -- coverage-report --db <source db> --out <folder outside the repository>`,
  beside `baseline-report`. Full detail: every missing, reported, contested, spread and recheck fact by
  zone and level, baseline names included. Local only, like the baseline report. It also writes
  `coverage-expected.json`.
- **Public page** `/database/coverage` (after open question 1): a search box first (zone, quest or NPC id),
  then one dense table, one row per zone: Quests, NPCs, Pins, Vendors, Drops, Rares, Entrances, Bosses,
  Treasures, each `settled% / confirmed%`, sortable, lowest first so players see where to go. A zone row
  opens `/database/coverage/<zone>`: the same columns per field, then a table of reported facts that need
  one or two more voters, linked to their pages. No provenance or licence lines, no breadcrumbs, the site's
  table style. Without the denominator the page still shows the reported-facts tables.
- **MCP tool** `coverage` (zone and type optional): the same counts and reported lists as text. It changes
  the public tool list, so it ships with the next directory submission (build step 8).

## 4. The off-switch: how collection winds down

**The addon does not change.** It only listens to game events: each module registers events
(`f:RegisterEvent`, for example `addon/modules/openworld.lua:370-381`: target, mouseover, loot, quest
accepted, merchant and NPC windows) and stores a row when one fires (`E:Store`, `addon/core.lua:87`). The
two `OnUpdate` scripts (`addon/modules/auctiontab.lua:134`, `addon/modules/gph.lua:341`) only redraw a
visible panel once a second, and the `C_Timer.After` calls debounce or chunk work after an event. An
auction scan runs only when the player starts it. The addon has no network access; rows leave only when
the game writes SavedVariables and an uploader reads the file. Nothing polls. The file still fills to
`MAX_ROWS_PER_KIND` (2,000, `addon/core.lua:9`) and pauses a kind there, as today.

**The settled list.** Written by the cron with the coverage file: `coverage/settled-<build>.json`, per
client build, one compact list per upload row kind, at the grain an upload row has:

- `npc_sighting`: NPC ids whose name and traits are settled, each with the maps whose pin is settled. A
  sighting is skipped when its NPC and its map are both in the list.
- `quest`: quest ids with every field settled.
- `vendor`: vendor ids whose every offer is settled (a vendor row carries the whole window).
- `loot`: sources (`npc:<id>`, `obj:<id>`) whose loot is settled.
- From #291: entrances, encounters and object sightings, the same way.

Ids are sorted and delta-encoded; the list holds only facts that are already public (settled implies
confirmed), so it reveals nothing from the baseline. Served at `/api/coverage/settled?build=<build>` with
an ETag. A build with no list yet (a new patch) gets an empty one: **nothing is skipped until the server
has looked at the new build.**

**The Desktop App and the web upload page share one filter.** Both build their batches with
`prepareUpload` (`web/src/lib/upload-batches.ts:33`): the upload page at `UploadClient.tsx:37`, the
Desktop App through `uploadFile` (`companion/src/uploader.ts`, which already filters held kinds at line 45),
called from `desktop/src/main/jobs.ts:29`. `prepareUpload` gets an optional `skip(record)`; both callers
pass one built from the settled list for the file's `clientBuild` (`parseEverlootLua` already reads it,
`web/src/lib/sv-parse.ts:183`). The Desktop App caches the list in its data folder and refreshes it once a
day (weekly after the plateau). Skipped rows are marked as handled in `sent.json`, so they are not weighed
again, and the app's log says how many were skipped: "sent 40 new events; skipped 312 already settled".
The upload page shows the same count in its preview.

**The server counts instead of storing duplicates.** Rows still arrive from old uploaders and files
without a build. Today the intake stores every accepted row in the upload object
(`web/src/app/api/intake/route.ts:167`). With the list loaded (cached, with values), a row whose every field
matches its settled value adds one to a per-fact tally (agreeing voters, last seen; a Supabase table
written through a `security definer` function, like `intake_quota_buckets`) and is not stored. A row that
differs in any field is stored in full: that is the signal a fact changed. This changes the policy's
promise that uploads are public as individual records "so anyone can check our counts"
(`docs/DATA_POLICY.md:22`): past settling, the extra agreement is a published tally, not rows. Open
question 3.

**The snapshot cron skips its work when nothing arrived.** Today every run (`*/10 * * * *`,
`web/vercel.json`) does all of this even with no new uploads:

- `writeSnapshot` (`web/src/lib/upload-store.ts:702`) reads the whole snapshot, lists the upload index
  (the whole index when the snapshot has `seenUploadIds`, line 709 with `listIndex`, line 292), rebuilds
  the public records and PUTs the snapshot back with a new `generatedAt`.
- `writeMarket` (line 379) re-reads 62 days of the index and PUTs the market rollup; with no new scans it
  still folds to close and prune days (line 400).
- `writeCompletion` (line 543) lists the index after its watermark and PUTs its rollup even when it folded
  nothing.

Change: before anything else, one index query for a row newer than the snapshot's `lastReceivedAt` (limit
1). None, and no `?rebuild=1`: skip the snapshot and completion writes, and run the market fold only when
the UTC day changed since its `generatedAt` (that is all its pruning needs). One catch:
`/api/health` calls the snapshot "stale" when the R2 object is older than 30 minutes
(`snapshotHealth`, line 807). It needs to read freshness from the last cron run instead (a small
`cron/last-run.json` heartbeat), or an idle week reads as an outage. `dataAsOf` then honestly stays at the
time of the last real change.

**Optional, later: a wanted list in game.** The Desktop App already writes slot addons the main addon
loads after `/reload`: `EverlootAnswers` (`companion/src/bridge/answers.ts`), `EverlootPrices`
(`desktop/src/main/market.ts`), `EverlootBuilds` (`desktop/src/main/builds.ts`), all listed in
`## OptionalDeps` in `addon/Everloot.toc`. A fourth, `EverlootWanted`, would hold the missing and recheck
NPC and quest ids for the zones the player's recent rows came from, and the addon could add one tooltip
line, "Everloot needs this NPC's position". Still no polling: a tooltip hook fires on the game's own event.
This is the only step that touches the addon, so it waits until the list is proven.

## 5. Maintenance mode, once the plateau is reached

**Plateau, measurably.** A type is at its plateau when, over the public expected universe:

- confirmed coverage is at least 90% and settled coverage at least 75%, and
- fewer than 0.5% of its expected facts became confirmed in the last 28 days.

The site is at its plateau when quests, NPC pins, vendors and drops all are. Nothing flips by itself at
that moment: the off-switch is per fact and already working. The plateau is what the coverage page and the
internal report state, and it moves the Desktop App's list refresh from daily to weekly.

**Collect again only what a patch changed.** A fact goes to *recheck* from three signals:

- **The build watch** (`docs/BUILD_WATCH.md`, `kb/src/build-watch/`). Its changelog entry
  (`web/src/data/game-data/changes/<product>-<buildId>.json`) already lists map zones and entrances that
  moved and which client tables changed by row count and content hash (`client-digests.ts`; hashes only,
  never rows). Moved entrances and changed zones mark their entrance and pin facts recheck directly. For a
  changed table, the row-level answer comes from `npm run kb -- client-diff` between the two local
  snapshots (`kb/src/client-diff.ts`): a changed `QuestV2` row marks that quest recheck; a changed `UiMap`
  marks pins on that map.
- **Blue posts and patch notes** (`/changes`, `kb/changes/blue-posts.json`). Posts carry title, excerpt,
  url and dates but no entity ids, so this stays a person's call: a maintainer adds a scope to
  `kb/curated/recheck.json` (a zone, NPC, quest or item ids, or a type such as "all vendor prices"), with
  the post's url and date.
- **Spot checks** (below).

While a fact is in recheck it is left out of the settled list, so uploaders send its rows again, and the
readers count only rows captured after the recheck began (the build's `firstSeen` in
`kb/changes/builds.json`, or the scope's date). Without that cut-off, three new voters on a changed value
and five old ones on the old value make two winning groups, and `agreedLabel` shows nothing. Three new
agreeing voters return it to confirmed; settled again by the usual rule. Records carry no client build:
the upload envelope's `clientBuild` is kept in the stored upload object but not on the corpus records, so
`capturedAt` against the build's `firstSeen` is the cut-off. The build watch's commit step accepts only
the generators' files, so writing recheck scopes from it means adding that file to its allowed list.

**Spot checks catch silent changes** (hotfixes, which change no build and never reach the build watch).
Each week about **2%** of settled facts are left out of the settled list, picked by a hash of the fact key
and the ISO week, so every settled fact is looked at again about once a year and the load stays flat. A
spot-checked fact that gets a conflicting report goes to recheck, and its zone's rate goes to 10% for the
next four weeks. Both rates are tunable.

## 6. Build order

Each step is one pull request and is useful alone.

1. **Fact states.** `kb/src/fact-states.ts` with `tallyVotes`; `agreedLabel` and `agreedNumber` wrap it
   with unchanged output; drop-rate and source settling. A `npm run kb -- fact-states` count by type and
   state. Useful alone: we learn how far from settled the data is.
2. **Idle cron.** The early return in the snapshot cron, the day-only market fold and the health
   heartbeat. Independent of everything else; saves work today.
3. **Internal coverage report.** `coverage-report` beside `baseline-report`, writing outside the
   repository, plus `coverage-expected.json`. Useful alone as the maintainer's to-do list.
4. **Coverage rollup and public page.** `kb/src/coverage.ts` in the cron and `/database/coverage`; with the
   denominator only after open question 1, without it the reported-facts tables still help players.
5. **Settled list and the uploader filter.** The endpoint, `skip` in `prepareUpload`, the Desktop App's
   cached list, the counts in its log and the upload page's preview. A Desktop release.
6. **Server-side tallies** for settled facts, with the policy and privacy wording (after open question 3).
7. **Recheck and spot checks.** `kb/curated/recheck.json`, the build watch hook, the readers' cut-off and
   the weekly sample.
8. **MCP tool `coverage`**, timed with the next directory submission.
9. **Optional: `EverlootWanted`** slot addon and the tooltip line, with an addon release.

## 7. Open questions for Carlos

1. **Public counts from the baseline.** May the coverage page, API and MCP tool show counts and
   percentages whose denominator comes from the local pfQuest baseline (never its names or rows)? If yes,
   `docs/DATA_POLICY.md` gets one sentence saying so. If no, public coverage uses only game-file and
   observed denominators, and the baseline stays in the internal report.
2. **Where the denominator lives.** A counts-only file uploaded by the maintainer (recommended), or
   baseline ids in the private bucket so the server computes it exactly?
3. **Tallies instead of rows** for settled facts: acceptable that past settling the extra agreement is a
   published count rather than individual records?
4. **N, the window, the plateau thresholds and the spot-check rate**: 2 extra voters, 14 days, 90% and
   75%, 0.5% in 28 days, 2% a week. Any you would set differently?
5. **Rare drops.** Should a source with drops under 3% stay open until those settle too (much longer for
   world drops), or settle on its common drops as proposed?
6. **Maintainer votes.** Proposed: Carlos's installs count as one voter each, like anyone's, with no extra
   weight. Agreed?

## 8. Out of scope

- Auction prices, the market, gold per hour, census, completion and player pages: these are live data
  that never settle, and they keep their own rules.
- Changing the addon's collection, its row cap or its events (only the optional step 9 adds a tooltip line).
- Publishing any baseline row, name or id; Wowhead in any form.
- Locale: names arrive in the client's language and records carry no locale, so a group of localized
  clients can block a title or name from settling, and today can hide it (`agreedLabel` returns null on two
  winning groups). That is a separate problem.
- A per-record client build in the protocol; `capturedAt` is enough for the recheck cut-off.
- Weighting voters by trust or history.
