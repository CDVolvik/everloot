# Game data

Files read from World of Warcraft: Forever's game files, kept here by the build watch
([docs/BUILD_WATCH.md](../docs/BUILD_WATCH.md)).

**This data is Blizzard's. It is not under Everloot's licence** (not CC BY-SA 4.0, not AGPL-3.0). It is
labelled *found in game files, unconfirmed*: a record here does not mean it is, or will be, in the game.
Anything from a build players cannot play yet is marked `spoiler`. The files come from what Blizzard's
launcher downloads from its public CDN for every player; encrypted blocks are skipped and counted,
never decrypted. Column names come from [WoWDBDefs](https://github.com/wowdev/WoWDBDefs) by the
WoWDBDefs contributors, CC BY-SA 4.0. See [docs/DATA_POLICY.md](../docs/DATA_POLICY.md). If Blizzard asks
us to remove it, we will: hello@everloot.app.

Tooltip text, icons and frame art are never committed. The talent files keep a short hash of each
tooltip, so a change is visible without the text.

## Layout

```
game-data/
  <product>/manifest.json            build stamp, class list, rows read and encrypted blocks per table
  <product>/talents/<class>.json     the talent catalog (kb/src/build-watch/game-data.ts, CommittedClass)
  changes/<product>-<buildId>.json   one changelog entry per build
```

`<product>` is Blizzard's product id, for example `wow_classic_beta`. A pull request from the build
watch replaces a product's `manifest.json` and `talents/` and adds one file to `changes/`.

## Changelog entries

Shape: `ChangeEntry` in `kb/src/build-watch/changes.ts` (zod; schema string `everloot.game-changes/1`,
bumped when the shape changes). The site's `/changes` timeline reads the files in `changes/`: sort by
`detectedAt`, hide entries and items with `spoiler: true` unless the reader turned spoilers on.

```
ChangeEntry {
  schema, label, id ("<product>-<buildId>"), product
  live             false for a beta; then every item below is a spoiler
  spoiler          same as !live
  detectedAt       ISO time the build was read
  build, previous  { version, buildId, buildConfig }; previous is null for the first entry
  initial          first entry of a product: a baseline, no changes listed
  encryptedBlocks  { total, tables: [{ table, blocks }] }
  talents          null when initial; otherwise lists of
                     classesAdded, classesRemoved (classId, className, spoiler), added, removed, moved, ranks, gates, prereqs,
                     replaced, spellValues, pointLevels
                   each item: classId, className, tree, nodeId, name, spoiler, and the before/after
  raidBuffs        { comparedTo, scopeChanges: [{ id, label, before, after, spoiler }] }
  warnings
}
```

A hotfix that changes no build does not change the game files, so it never appears here. The blue
tracker covers hotfixes.
