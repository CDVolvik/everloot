# Lane closeout: instance pages in search, the quest filter, the name count (2026-10-22)

Wave 3, lane 4. The instance pages that the map lane built are now listed in the sitemap and linked from
`/database`; the pfQuest importer drops the developers' test quests it was letting through; and the name gap
report has the number a maintainer sizes the gap by.

## Why

The map and instances closeout (2026-10-21) named two things nobody owned: "The instance pages are not in the
database sitemap, and the `/database` landing page does not link the instance index yet." The Classic baseline
(`kb/src/importers/pfquest.ts`) still imported `The "Chow" Quest (123)aa`, a quest the junk rule was written to
drop. And `name-gaps` said which ids had no name but not how many had one.

## 1. The instance pages are in the sitemap and on the hub

- `/database/instances` and `/database/instances/<id>-<slug>` are in `sitemap.xml`: the index always, and each
  instance page the way zone pages are listed (below). With the site's data a local dev server lists the index and
  25 instance pages, one per row the index shows.
- **The rule for a listed instance page** is the page's own: it asks to be indexed unless upload storage cannot be
  read (`robots.index = !unreachable`), and it does not exist for an instance known only from a held-back zone
  (`instanceRows` leaves it out). `instancePaths` (`web/src/lib/database-sitemap.ts`) states both. Storage down: no
  instance page is listed, the index still is (it shows the files' entrances without storage).
- `/database` has the row "Dungeons and raids" beside Zones, in the same list, with the number of instances the
  game files place in a released zone (25, as the Zones row counts the zones it knows: from the files, not the
  uploads).

## 2. The quest filter

`JUNK_NAME` matches only capitalised markers, so `The "Chow" Quest (123)aa` (quest ids 1 and 9065 in pfQuest)
matched none of its rules. A second rule, `JUNK_QUEST_TITLE`, applies to quest titles only: a build number glued on
the end (`(123)aa`), any all-capitals marker in angle brackets (`<CHANGE TO GOSSIP>`), a `DND` prefix, and a title
that says it is a test quest (`Hunter test quest2`, `Test Kill Quest`). "Test of Faith", "The Test of
Righteousness", "The Gordok Taste Test", `The "Seam" Report` and a title with a quoted word all stay.

Against the pinned pfQuest checkout the rule drops exactly 10 of 4,319 quests: 1 and 9065 (the "Chow" quest),
1263, 1281 and 1283 (`<CHANGE TO GOSSIP>`), 5101, 7681, 7682 and 8274 (test quests) and 9378 (`DND FLAG …`); 4,309
remain. The baseline stays local; nothing it holds was added to anything that is published.

## 3. The name report has the number

`npm run kb -- name-gaps <snapshot> --wiki <kb> --baseline-db <source db> [--out …] [--json …]` now opens with
"Names today": per kind, how many ids each source names, out of the ids the game files list plus the ids the
baseline lists ("In either"), and the date and the method of every count.

- **Sources, counted separately:** the game files' own names, the Warcraft Wiki's (the site's source for quest
  titles and half the item names; the game files hold no quest title), the local pfQuest baseline's names, and the
  names 3 installs agree on (read from `EVERLOOT_PUBLIC_CORPUS_URL` or `EVERLOOT_UPLOADS`, as `baseline-report`
  does). "Any source" counts an id once; "No name" is what is left.
- **A name counts when the site may show it**, under the same rule functions the pages use (`mayShowName`,
  `mayShowQuestTitle`, `mayShowSetName`, `mayShowSpellName`), so a contested quest title is not "named".
- **A source that was not read prints `[?]`, never 0.** Without `--baseline-db` the baseline columns are `[?]`;
  with no upload source connected the Players column is.
- Ids and counts only. No name is printed and nothing is written inside the repository; the baseline database, the
  snapshot and the wiki file are read by path argument.

### The counts, measured 2026-10-22

Build 1.60.1.70450, client snapshot extracted 2026-10-18; Warcraft Wiki dump 2023-11-13; baseline pfQuest commit
104f3567, imported 2026-10-22 with the new quest rule; players: the public corpus as of 2026-10-22 01:10 UTC (10
uploads; no `item_seen` or `quest` record yet, so the Players column is a measured 0, not unread). Every share is
of "In either".

| Kind | In game files | In baseline | In either | Game files | Wiki | Baseline | Players | Any source | No name |
|---|---|---|---|---|---|---|---|---|---|
| Items | 31,849 | 17,484 | 31,863 | 19,231 (60.4%) | 13,405 (42.1%) | 17,484 (54.9%) | 0 (0.0%) | 24,352 (76.4%) | 7,511 (23.6%) |
| Quests | 6,614 | 4,309 | 7,359 | 0 (0.0%) | 3,229 (43.9%) | 4,309 (58.6%) | 0 (0.0%) | 4,350 (59.1%) | 3,009 (40.9%) |
| Item sets | 536 | 0 | 536 | 536 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 536 (100.0%) | 0 (0.0%) |
| Spells | 31,939 | 0 | 31,939 | 31,926 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 31,926 (100.0%) | 13 (<0.1%) |

Reading it: counting the local baseline, 24,352 of 31,863 items and 4,350 of 7,359 quests carry a name from some
source; 7,511 items and 3,009 quests carry none, and 13 spells. The baseline is never published, so the site itself
shows less: from the game files and the wiki alone it names 23,096 of the files' 31,849 items and 3,229 of their
6,614 quests (the report's route table, "Shown"). The baseline lists 14 items and 745 quests the game files do not;
those ids are in the denominator. The baseline and Players columns for item sets and spells are 0 by construction:
pfQuest has none, and uploads carry no names for them.

## 4. The last cross-links and the sitemap's rule

- **One list of hubs.** `web/src/lib/database-hubs.ts` is the list of rows under "Seen by players". `/database`
  renders it and the sitemap lists it, so a hub added once is linked and listed together; a hub with no count of its
  own prints no count; a page that asks for noindex is added with `unlisted: true` and is linked, not listed.
  Nothing names the coverage page.
- **Zone pages and their sitemap rule.** The zone page is indexed when `zoneContents(…, seen)` has content, and
  `seen` carries the players' treasures and entrances. The sitemap called `zoneContents(world)` without it, so a
  zone whose only content was a pinned treasure, or a players' entrance, was indexed but not listed. It now asks
  with the same sightings (tested: a zone with a treasure three installs pinned is listed, one with two is not).
- **`/database/spells`** was linked from the hub but not listed. It is in the list now, with the other hubs.
- **Loot tables** are panels on the item and NPC pages, not pages of their own, and those pages are already in the
  database sitemap by the existing `itemIndexable` and `npcIndexable` rule. A loot table does not make a page
  indexable on its own; that is deliberate and unchanged.

## How it was verified

- `kb/test/pfquest.test.ts`: the rule keeps and drops the titles above; the fixture imports one more junk entry
  (quest 303, the "Chow" title) and the importer's skip count is 5, with `The "Seam" Report` kept.
- `kb/test/name-gaps.test.ts`: `kindCoverage` counts each source over the two lists and ignores ids neither holds;
  an unread source is `[?]`, never 0; the report prints each count with its share, the dates and the method and no
  name or id sample in the coverage table; `baselineNames` reads only the baseline's item and quest rows;
  `playerNames` keeps names 3 installs agree on and not 2.
- `web/src/app/sitemap.test.ts`: every hub is listed unless it asks to be left out (a hub added later is covered by
  a mocked row); the listed instance pages are exactly the index's rows; a players' instance in a held-back zone has
  none, one in a released zone has; none while storage is down; a treasure-only zone is listed at 3 installs and not
  at 2. The treasure test failed before the sitemap change and passes after.
- `web/src/app/database/hubs.test.tsx`: `/database` links every hub in the list with its label, the instance count
  is the files' count, a hub with no count prints none, and storage down does not turn the count into 0.
- Five existing tests mock `@/lib/rollup-compute` (and one `@/lib/names`) without the loaders the sitemap now reads;
  each gets the one export it lacked. No assertion in them changed.
- Rendered with the dev server: `/database` shows "Dungeons and raids 25" in the browse list; `/sitemap.xml` lists
  `/database/instances`, 25 instance pages (for example `/database/instances/36-deadmines`) and `/database/spells`.
- Full suites: kb 1,116 passed (106 files); web 2,080 passed, 3 skipped (212 files, 1 skipped); kb and web
  typechecks clean; `next lint` has no warning in a file this lane changed; `scripts/check_internal_paths.py` passes.

## Decisions to review

1. **Two quest rules, not one.** The general rule is shared by units, objects, items and quests; widening it would
   change what the baseline holds for every kind. The new rule is quest-only, as the brief asked for the quest
   filter. It is case-sensitive in its markers, so a real quest cannot lose its name to the word "Test".
2. **The wiki is a fourth column.** The brief names three sources (the game files, the baseline, 3 installs). For
   quests the game files hold no title, so without the wiki the quest row would read 0 for every shown title; the
   wiki is a source the site actually uses, so it is counted on its own.
3. **The denominator is the union of the two lists.** "Out of how many the game files and the baseline list" is
   read as the ids either list holds. The game files' own list and the baseline's are printed beside it.
4. **`/database/spells` is now listed.** It was a hub linked from `/database` but absent from the sitemap, which
   the shared list makes visible. Spell detail pages are not listed, as before.
5. **The hub's instance count is the game files' (25), not the uploads'.** It matches how the Zones row counts, and
   avoids two more loads on the landing page. The index's own heading counts with the uploads.
6. **A new file**, `web/src/lib/database-hubs.ts`, holds the hub list. The brief listed the files this lane owns and
   not this one; no other lane touches it.

## Noticed, not changed

- **The baseline's other kinds still carry the developers' test entries.** The same case-sensitivity leaves, in the
  17,484 baseline items, 398 whose name contains "Deprecated" (the rule knows only the capitals `DEPRECATED`) and 377
  that contain the word "test" (`Leather Helmet A (test)`); units include `Unkillable Test Dummy 60 Mage` and
  `[NOT USED] Neltharion`, and objects `… Spell Focus (DND)`. The counts are of name matches, and some of them are
  real ("Old Ironbark"), so they need a rule of their own and a look at each. The baseline column of the name
  report counts them as named. They are local only.
- **`docs/ASSETS.md` and `CHANGELOG.md`** do not mention `--baseline-db` or the coverage table; they belong to other
  lanes' files this wave. The flag and the table are in the command's usage text and this document.
- `/llms.txt` (`web/src/lib/llms.ts`) and the "Find" docs guide list the zone page and the other database pages, not
  the instance page.

## For the other lanes

- **Lane 2 (coverage page):** when `/database/coverage` merges, add one row to `DATABASE_HUBS` in
  `web/src/lib/database-hubs.ts` (`{ href: "/database/coverage", label: "Coverage" }`, with `unlisted: true` if the
  page says noindex) and the hub, the sitemap and their tests handle it; a row with no count prints none, and a
  count goes in the `counts` record in `web/src/app/database/page.tsx` if wanted.
- **Lane 3 (items):** no file of theirs was touched. The sitemap still reads `/database/items` and the item pages by
  the unchanged `itemIndexable` rule.
- **Lane 1:** nothing shared.
