# Open data export lane closeout — 2026-10-22

Wave 4, lane C: the roadmap's "an open data export: the published data as files anyone can download and build on,
under CC BY-SA 4.0". One command makes a folder, one page says what is in it, and the licence says plainly which
part is ours and which is Blizzard's. The runbook is [`OPEN_DATA.md`](OPEN_DATA.md).

## What was found first

A bulk export already existed (`web/src/lib/bulk-export.ts`, `npm run export-bulk`, the page
`/docs/api/data-files`). It writes what the JSON API serves, so its `corpus.ndjson` holds every anonymous record,
the one- and two-install ones too, as the data policy allows ("public as individual, anonymous records"). It has no
README, no licence text, no per-file schema in the folder, and no count that says out of how many. This lane did not
change it. The new export is a second, stricter thing: only what three installs agree on, with the game-file layer in
its own folder.

## What was built

**The command**, `npm run kb -- open-data <folder> [--records <file>]` (`kb/src/open-data/`). It reads the public
records of eight kinds (`npc_sighting`, `quest`, `vendor`, `loot`, `item_seen`, `instance_entrance`, `encounter`,
`object_sighting`) from the public corpus feed, a local uploads folder, or a saved copy of the feed, and writes:

- `observed/` (CC BY-SA 4.0), eleven NDJSON files: `npcs`, `quests`, `vendor-offers`, `drop-rates`,
  `drop-measured-zeros`, `relations`, `entrances`, `bosses`, `objects`, `object-pins`, `item-names`. Each row says how
  many installs agree (never fewer than 3) and carries no install id, no pseudonym and no player's name. A value no
  three installs agree on is `null`.
- `game-files/` (Blizzard's data, outside our licence), seven files: `item-categories` (31,849 items: class,
  subclass, slot, quality, the client's category names, no item names), `relations` (47,716), `zones` (46 released),
  `continents`, `entrances` (25), `flight-masters` (66) and `flight-paths` (134). Zones, flight masters and lines that
  may be unreleased (held back) are left out, and the file counts them in its denominator.
- `manifest.json`, `README.md`, `LICENCE.md` and a JSON Schema per file in `schema/` (39 files in all).

The rule is a type. Each `installs` field is an integer of at least 3, a fact and its count are both set or both
`null`, and the row objects are strict, so a row with fewer installs, or with a key the schema does not name, is
refused by `parse` before it is written. The writer adds three more refusals: an observed row holding a string equal
to an install id of the input; any file with a local filesystem path; a folder that is not new or empty. Nothing is
written when one fires.

**Counts always have a denominator, a date and a method.** Each file's manifest entry has `rows`, `candidates` (how
many of that kind of thing anyone reported, count only) and `candidatesAre` (what that counts, in words). The manifest
has `generatedAt`, `dataAsOf`, the game build, the method text, the number of records and installs read, the licence of
each folder, what is excluded and how to verify a count. With no records source the command stops instead of writing an
empty export, because "nothing was confirmed" would be a claim.

**The page**, `/database/download`. What the files are, the date they were made and the data was current, a dense
table of the files with rows, of how many, what that counts, size and hash and a link to each, the licence and the
credit line, the method, what is not in the files and how to verify a count. It reads the newest export from
`<NEXT_PUBLIC_BULK_URL>/open-data/latest.json` and prints only what that export's manifest says. No bucket, or no
export yet, says so and prints no number; an unreadable pointer or manifest reads `[?]`. Listed in `DATABASE_HUBS`, so
the database index links it and the sitemap lists it with the other hubs; it asks to be indexed.

**The upload**, `web/scripts/upload-open-data.mjs`, the owner step. Same bucket as the bulk export, under `open-data/`,
so the bulk export's `latest.json` is never touched. Create-only objects, the manifest last, then
`open-data/latest.json`; it checks every hash and byte count, refuses a path outside the export and a local path.

## What it contains and what it refuses

Contains: facts three or more installs agree on, as the site's own pages state them. The builders call the same
readers the pages use (`tallyVotes`, `npcPage`'s pins, `vendorPage`, `rollupDrops`, `observedEdges`,
`confirmedEntrances`, `instanceBosses`, `objectSpawns`), and a test compares the export's values with the page
functions' for the same records.

Refuses, by rule: facts under three installs or contested; the local Classic baseline (the exporter imports nothing from
it, and a test reads its source to keep it so); anything a player's name is attached to; named records, census rows and
addon lists (the kinds are not read); item, quest, spell and item set names read from the game files or the Warcraft
Wiki, and icons and art (the data policy keeps them on pages only); held-back zones.

## What differs from the brief

- **"Item and spell names the files carry" are not in the export.** The brief lists them among what the game files may
  publish, but `docs/DATA_POLICY.md` says the data downloads, the API and the MCP server "carry no item names and no
  tooltip facts" read from the game files, and that quest titles and item set and spell names are "pages only". The
  policy wins. An item name is in `observed/item-names` only when three installs reported the same one.
- **The export is smaller than the corpus on purpose.** The policy publishes raw anonymous records at any install
  count; this export publishes only agreed facts. The raw records stay at `/api/corpus/public` and in the bulk export.

## Verification

- `kb/test/open-data.test.ts`, 16 tests. A corpus with one fact of every kind held by one, two and three installs:
  only the three-install fact of each comes out, for all eleven observed files; every count under 3 is refused by the
  schema, and a value without a count too; a split or contested fact is `null` and its entity has no row; a player's
  own position makes no pin; the export's values equal the page functions' for the same records; three Polestar
  Recorder installs behind one address are one voter and confirm nothing; named records and census rows are never read;
  the game-file layer leaves out held-back zones, held-back flight masters and observed edges; the folder's manifest
  matches its files' bytes and hashes, with a denominator under every file and `[?]` for a missing date; no install id,
  pseudonym or `installId` key is in any file; the writer refuses a row under three installs, an extra key, an install
  id and a local path, and writes nothing; a non-empty folder is refused; no records gives zero rows of zero; the
  exporter's source reads nothing from the baseline or the name ledgers; the saved-feed reader.
- `web/src/app/database/download/download.test.tsx`, 4 tests: the page prints the manifest's dates, counts and
  denominators, `[?]` for a missing one, sizes and hashes; every state (export, none, unreadable) carries the licence,
  the credit line, the method, the exclusions and the verification steps, with no number when there is no export; the
  hub entry and the description length. `web/src/lib/open-data.test.ts`, 3 tests: none, ok, and a pointer to anything
  but its own folder's manifest, a manifest that does not parse or a failing fetch all read as unreachable.
  `web/scripts/upload-open-data.test.ts`, 6 tests, one of them over a folder the real exporter wrote.
- On the branch merged with `main` (after #319, #320, #321 and #324): full kb suite 114 files, 1,202 tests pass, kb
  typecheck passes; full web suite 221 files pass and 1 is skipped, 2,137 tests pass and 3 are skipped; web typecheck,
  lint (existing warnings only, none in this lane's files) and `next build` pass; protocol 81 tests, typecheck and
  `check-semver` pass, and the build leaves no diff beyond the committed `dist/` and `schema/`.
- A real run, `npm run kb -- open-data` against the live public feed (the only source available here): 81 records
  from 1 install (all `npc_sighting`), so every observed file is empty and says so (`npcs`: 0 rows of 18 NPCs reported;
  the rest 0 of 0), and the game-files folder carries the build 1.60.1.70450 layer. That is the true state of the feed
  today, not a failure. How many facts three real installs confirm is [?] until more players upload.
- A synthetic corpus of 55,000 records (4,000 NPCs, 3,000 quests, 30,000 loot windows) is built in about 0.45 s.
- Internal-path, Markdown-link, DCO and attribution guards pass.

## After the merge with `main`: the settled list's route in the protocol

Lane A left `/api/coverage/settled` out of the route catalogue, so the coordinator handed it to this lane.

- `packages/protocol` 1.15.0 (record protocol unchanged, 1.7.0): the route is in `API_ROUTES` (open, observed data, a
  required `build` query parameter, answers 200, 304, 400 and 503) and its answer has a schema, `settledListResponse`
  (`everloot.settled/1`: per upload row kind the delta-encoded ids, `dataAsOf` null for a build not yet looked at).
  `dist/` and `schema/` are regenerated (`schema/api/settledListResponse.json` is new), and the OpenAPI document and the
  API docs now list the route, under "Player data" in the docs navigation.
- `web/src/lib/settled-protocol.test.ts` keeps the protocol schema and the kb's `SettledList` in step: an empty list and
  a computed list with a settled NPC satisfy both. The protocol cannot import the kb, so the shape is written twice.
- `kb/src/cli.ts` conflicted with the `spot-check` command; every command is kept.
- The root `CHANGELOG.md` is not changed by this branch: the coordinator adds this lane's line when it merges. The
  protocol's own changelog has the 1.15.0 line.

## Policy sentence proposed (docs/DATA_POLICY.md is lane D's file)

For "Using our data: credit, limits and keys", after the credit paragraph:

> **The open data export.** `/database/download` lists a folder a maintainer makes with `npm run kb -- open-data`. Its
> `observed/` files hold only facts three installs agree on, each with the number of installs and with no install id,
> under CC BY-SA 4.0 and the credit line above. Its `game-files/` files hold the client layer's ids, relations and item
> categories and the map layer's released zone rectangles, continents, dungeon and raid entrances and flight masters
> and lines, each stamped with the build, as Blizzard's data outside our licence; held-back zones are left out. Item,
> quest, spell and item set names read from the game files or the Warcraft Wiki, tooltip facts, icons and art are not in
> it, and neither is anything from the local baseline.

The part about the map layer is the one new permission: "The map layer" paragraph today says the layer may be shown on
the site and committed, and does not mention the download. The client layer paragraph already allows the rest.

## Not built, and what remains

- **No export is uploaded.** Making one needs a free API key to read the whole feed, and uploading needs the public bucket
  (`BULK_BUCKET`, `NEXT_PUBLIC_BULK_URL`) that the bulk export is also waiting for. Both are the owner's. Until then the
  page says there is no export.
- The roadmap line still reads as planned. Changing it, and linking this page from `/docs/api/data-files`, is for after the
  first export exists.
- Not in the files yet: market prices, census counts, the achievement, faction, title and quest chain lists, recipe and
  trainer facts, zone bounds players measured, NPC reaction, and the loot windows behind each drop rate. Quest and NPC
  facts the site shows only on a page are in.
- Settled facts (5 installs and 14 days) are not marked apart from confirmed ones; every observed row is at least
  confirmed. The coverage lane's states could be added as a column later.
- No dataset-level JSON-LD on the page: it would need a real download URL, which exists only after the first upload.
- The `[?]` convention is `null` in the files and `[?]` on the page and in the README, stated in both.

Nothing here touches a migration, a switch (`EVERLOOT_*`), a secret, a record kind, an MCP tool schema, a release or a
tag. The protocol change is one route and its response schema. The coordinator reviews the diff and the checks and owns the merge.
