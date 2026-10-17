# game-data

Files here are read from the game files of one build. They are Blizzard's data, not under our CC BY-SA
licence, and `docs/DATA_POLICY.md` says that data is not published until a maintainer approves it. Do not
merge a change here without that approval.

Rules for every file:

- **Generated, never hand-edited.** Each file names the script that wrote it, and the script's command.
- **Stamped with the build** it came from, and labelled "Found in game files, unconfirmed".
- **Trimmed to what a page needs:** ids, names and the facts we compute (for example reach). No tooltip
  text, no descriptions, no icons.
- **Only unencrypted data** from our own extract (`npm run kb -- client-extract`, then `client-catalog`).
  Nothing from another site or from patch notes. Where the file data does not settle a fact, the value is
  `unknown` or `mixed`, and the page says so.

## raid-1.60.1.70450.json

Raid buffs and debuffs with their reach (`self`, `single`, `party`, `raid`, `area`, `enemy`, `mixed`,
`unknown`), plus the talent tree names per class. Source: `raid-buffs.json` (`everloot.raid-buffs/2`) and
`talents/<class>.json` from `client-catalog`, with the spell list in `kb/lists/raid-buffs.yaml`.

    npm run kb -- client-extract --product wow_classic_beta
    npm run kb -- client-catalog data/client/<snapshot>.sqlite
    cd web && npx tsx scripts/build-raid-game-data.ts ../kb/data/catalog/<product>-<build>-<config>

The script also writes `addon/modules/raid_data.lua` from the same data, and `src/lib/raid.test.ts` fails if
the two differ.

What the file leaves out: entries whose spells are not in the build (`notFound`, for example Blessing of
Sanctuary). The only thing here that is ours is `family`, which groups a group cast (Gift of the Wild) with
its single-target cast (Mark of the Wild) because they do not stack.
