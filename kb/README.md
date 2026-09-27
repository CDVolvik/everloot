# kb — the WoWVault knowledge base

A local SQLite database of WoW knowledge in which every row carries its source, licence, retrieval
date and URL. Design: `../docs/superpowers/specs/2026-09-27-forever-ai-addon-design.md` §2 and §4.

## Build it

    npm install
    npm run kb -- import-wiki data/raw/warcraft.wiki.gg-20231113-history.xml.zst
    npm run kb -- import-curated
    npm run kb -- validate

The wiki dump is at https://archive.org/details/wiki-warcraft.wiki.gg-20231113 (637 MB). It is a
WikiTeam export, so each page's history is split across many blocks; the importer reads the file
twice and keeps each page's newest revision. Its zstd frame declares a 2 GB window, so decoding needs
about 2 GB of RAM (handled by `zstd-napi`).

First build (2026-09-27): 261,656 lore pages, 14,167 skipped, 48,341 redirects dropped, 239,941 other-namespace, 0 empty; 1 curated; import took ~16 minutes with peak memory ~2.3 GB. Skipped pages are template-only (item tooltips, TCG cards, disambiguation stubs); importing item tooltips as structured item rows is the next task.

## Sources and what may be published

| Source | Licence | In the public snapshot |
|---|---|---|
| Warcraft Wiki, Internet Archive dump 2023-11-13 | CC BY-SA 4.0 | yes |
| Curated entries (`curated/*.yaml`) | CC BY-SA 4.0 | yes |
| Blizzard Battle.net API | Blizzard Developer API Terms | no — local cache only |

wago.tools is not used: its robots.txt disallows everything but its home page.

`npm run kb -- snapshot data/release/<name>.sqlite` writes the publishable copy (outside the
database's own folder) and a `.manifest.json` with its sha256. The file is built and verified in a
work file next to the live database, filtered by the code's source registry, and only then moved
into place.

## Blizzard API

Create a free client at https://develop.battle.net/access/clients and put it in `kb/.env`:

    BLIZZARD_CLIENT_ID=...
    BLIZZARD_CLIENT_SECRET=...

Then, in Git Bash or PowerShell (no leading slash — Git Bash rewrites paths that start with `/`):

    npm run kb -- blizzard-get data/wow/playable-class/index --game classic1x --kind static

WoW: Forever has no API namespace yet; `--game forever` answers "not published yet".

## Rules

Read the legal charter (spec §2) before adding a source. Blocked, paid or unlicensed sources go on
the gaps backlog in `../docs/sources/source-catalog.md`, never into an importer.

## Code licence

MIT. Data licence: CC BY-SA 4.0.
