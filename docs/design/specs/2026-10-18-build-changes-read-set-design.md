# Build changes for the client read set

**Date:** 2026-10-18
**Status:** proposal, not started. Follows the [client data placement note](../../2026-10-18-client-data-placement.md),
whose W4 closed the mining waves: 321 tables read, 622 unread candidates.
**Next:** this section, then (separately) a site surface for build entries at all.

## Why

The build watch's changelog entry describes what changed in the *generated site data*: talents, spell
numbers, raid buffs and the map. The 321 tables `client-extract` reads are not tracked, so a new build
can change items, mounts, professions, customization, models, sound kits or any W0–W4 table and the
entry still says "No differences in the talents, spell numbers, raid buffs or map." At launch that is
backwards: the item and world tables are where most of a patch's real movement sits.

## What gets built

1. **A digest baseline**, `web/src/data/game-data/client-digests.json` (schema
   `everloot.client-digests/1`):

   ```
   { schema, label, hashVersion: 1,
     build: { version, buildId, buildConfig, definitions, extractedAt },
     tables: { "<table>": { rows, hash } } }
   ```

   `hash` is the first 12 hex characters of a sha256 over the table's rows in id order, one line per
   row: `<id>\t<canonical JSON>`, object keys sorted recursively. The file carries no ids, no values
   and no text — counts and hashes only, like the tooltip hash in `spell-values.json`. About 35 KB for
   all 321 read tables, empty ones included, so a table that gains rows later still reads as changed.
   Committed and overwritten per build: it is what `spell-values.json` is for spell numbers.

2. **The diff.** `cdn-extract.ts` computes the same digests from the snapshot it just extracted (one
   pass over `client_rows`, about 1.1M rows). `buildChangeEntry` compares them with the committed
   baseline and adds a `readSet` section to the entry, null on the first entry of a product:

   ```
   readSet {
     tables: { before, after },
     rows:   { before, after },
     addedTables:   [{ table, fileDataID, rows }],
     removedTables: [{ table, fileDataID }],
     changedTables: [{ table, rowsBefore, rowsAfter, changed }],
     layoutChanged:  boolean
   }
   ```

   `changed` is the content-hash difference for that table. A table read before but absent or failing
   in the new build is not "removed" — it goes to `warnings`, the way the extractor already reports it.
   `layoutChanged` is true when the pinned WoWDBDefs commit differs from the baseline's, because a
   layout rename flags every table as changed.

3. **Schema bump.** `CHANGE_SCHEMA` `everloot.game-changes/1` → `/2`. The reader accepts both; v1
   entries stay valid as committed. Only the build watch writes entries.

4. **Wiring.** `Extracted` gains `clientDigests`; `site-data.ts` gains the digest schema, a reader used
   by `readSiteData` and `writeClientDigests`; `watch.ts` passes before/after to `buildChangeEntry` and
   writes the baseline next to `writeSpellValues`; `render.ts` adds a "Client data" section (one line
   per changed table: `rowsBefore -> rowsAfter rows, content changed`), capped by `CAP` with the rest
   left to the JSON; the PR body review list gains a line. `hasChanges` counts the new section, or an
   entry with only table changes would claim "no differences".

5. **Docs.** `web/src/data/game-data/README.md` (new file row), `changes/README.md` (shape),
   `docs/BUILD_WATCH.md` (the files step 5 writes).

## What does not change

- No rows, ids, values, column data or text are published: counts, booleans and hashes only. TactKey
  and TactKeyLookup stay unread; encrypted blocks stay skipped and counted.
- No per-row id lists in this version. A committed baseline of 1.1M ids does not fit, and no surface
  displays entries yet. If a display later wants "new item ids", it can carry per-row hashes for a
  chosen table subset.
- The spoiler rules, the one-file-per-build layout and the extractor's failure handling stay as they
  are.
- Nothing new reaches visitors. Nothing in `web/src` or `web/scripts` reads
  `web/src/data/game-data/changes/` today: `/changes` builds its timeline from blue posts and
  `kb/changes/builds.json`. `changes/README.md`'s line that the timeline reads these files is ahead of
  the code; fixing that is a separate job.

## Findings that shaped it

- Read set today: 321 tables, 1,142,643 rows in 255 of them (66 read tables are empty in 1.60.1).
  The digest pass is one sequential scan of a snapshot the watch already produces.
- The watch has no access to a previous *snapshot* (gitignored, 357 MB), so the baseline has to be the
  committed digest file, not a retained snapshot.
- `hasChanges` today counts talents, raid buffs and maps only; a read-set-only change would otherwise
  render as a no-change entry and skip the interesting part of the PR body.

## Risks

- A WoWDBDefs layout change marks every table changed. `layoutChanged` records why and the PR body says
  so; honest and rare, accepted.
- The baseline file is a merge-conflict magnet if two build PRs are open at once. The watch keeps one
  PR per product and closes older ones, so this stays theoretical.
- Hashing about 1.1M rows adds seconds to the watch; measured before merge.
- Hash stability depends on the canonical JSON rule. Changing that rule silently invalidates one
  comparison, so the baseline carries `hashVersion`.

## Tests

- Digest: stable across two extractions of one build; changes when a value changes; independent of
  row insertion order (rows are sorted by id).
- Diff: added table, removed table, changed table, row delta without hash change, absent or failed
  table becomes a warning, no baseline means `readSet: null`.
- Schema: a v1 entry still parses; a v2 entry requires `readSet`.
- Watch: the dry-run fixture gains `clientDigests`; the run test asserts the baseline is written and
  the entry carries the section.
- Render: the section text, the `CAP` cut, the empty case and the terminal summary line.
