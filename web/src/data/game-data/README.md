# Game data

Files in this folder are Blizzard's data, read from the WoW: Forever game files by `kb/src/client-extract.ts`
and cut down to the fields a page needs. They are **not under Everloot's licence** (CC BY-SA 4.0 covers our own
data, not these), and everything in them is **found in game files, unconfirmed**: being here does not mean
it is, or will be, in the game. Each file names the build it came from. Encrypted blocks were skipped, never
decrypted. Column names come from [WoWDBDefs](https://github.com/wowdev/WoWDBDefs) (CC BY-SA 4.0). See
[docs/DATA_POLICY.md](../../../../docs/DATA_POLICY.md).

| File | What | Made by | Build |
|---|---|---|---|
| `map.json` | Continents and zones with their rectangles in world yards, and dungeon and raid entrance positions | `npm run kb -- client-map <snapshot>` (tables `Map`, `UiMap`, `UiMapAssignment`) | in the file's `source` |
| `talents/<class>.json` | One talent tree set per class (`everloot.talent-catalog/2`, see `docs/TALENT_CATALOG.md`): node ids, positions, ranks, prerequisites, unlock gates, point levels, spell ids and talent names. No descriptions, icons or tooltip text | `npm run kb -- client-catalog <snapshot>`, then `node scripts/trim-talent-catalog.mjs ../kb/data/catalog/<product>-<build>-<config>/talents` in `web/` | in each file's `build` (1.60.1.70450 today) |
| `raid-<build>.json` | Raid buffs and debuffs with their reach (`self`, `single`, `party`, `raid`, `area`, `enemy`, `mixed`, `unknown`), the talent tree each needs where the files prove it (`tree`, `treeProof`), and the class talent tree names. No tooltip text | `npx tsx scripts/build-raid-game-data.ts ../kb/data/catalog/<product>-<build>-<config> ../kb/data/client/<snapshot>.sqlite` in `web/`, which also writes `addon/modules/raid_data.lua`; `src/lib/raid.test.ts` fails if the two differ | in the file name and its `build` |

Do not edit these files by hand. Regenerate them from a new snapshot (`client-extract`, then the commands
above) and commit the result with the build in the message. Nothing from another project belongs here.

In the raid file, the only thing that is ours is `family`, which groups a group cast (Gift of the Wild)
with its single-target cast (Mark of the Wild) because they do not stack. Entries whose spells are not in
the build are left out.

World of Warcraft and its names are trademarks and copyright of Blizzard Entertainment, Inc.
