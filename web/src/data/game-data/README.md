# Game data

Everything in this folder is **Blizzard's data**, read from the WoW: Forever game files by our own
extractor. It is not under Everloot's licence (CC BY-SA 4.0 for data, AGPL for code). It is labelled
*found in game files, unconfirmed*: a record here does not mean it is, or will be, in the live game.

`talents/<class>.json`: one file per class from game build **1.60.1.70450**
(`wow_classic_beta`, build config `84bea4233331e390fda8724c6f91ffa5`, read 2026-10-17).

- Source: the trait tables of that build, read from the public Blizzard CDN files every player
  downloads. Encrypted blocks are skipped, never decrypted. Column names come from
  [WoWDBDefs](https://github.com/wowdev/WoWDBDefs) (CC BY-SA 4.0).
- Shape: `everloot.talent-catalog/1`, defined in `kb/src/talents/catalog.ts`, documented in
  `docs/TALENT_CATALOG.md`.
- Kept: node ids, positions, ranks, prerequisites, unlock gates, point levels, spell ids and talent
  names.
- Not kept: spell descriptions, effect numbers and icon ids. No tooltip text and no icons are
  published yet.

Regenerate it, on a maintainer's machine:

```
cd kb
npm run kb -- client-extract --product wow_classic_beta
npm run kb -- client-catalog data/client/wow_classic_beta-<build>-<config>.sqlite
cd ../web
node scripts/trim-talent-catalog.mjs ../kb/data/catalog/<product>-<build>-<config>/talents
```

World of Warcraft and its talent names are trademarks and copyright of Blizzard Entertainment, Inc.
