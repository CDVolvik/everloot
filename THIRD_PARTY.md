# Third-party material

What Everloot ships or publishes that is not our own work, its licence, and where it is used. The
full record of every source we have used, linked or only read is
[`docs/sources/LEDGER.md`](docs/sources/LEDGER.md).

## Data

| Component | Used for | Licence | Where |
|---|---|---|---|
| [Warcraft Wiki dump, 2023-11-13](https://archive.org/details/wiki-warcraft.wiki.gg-20231113) (Internet Archive) | The lore archive: `/lore`, `/search` and the MCP lore answers | CC BY-SA 4.0; each page credits and links its source article | Imported by `kb/src/importers/wiki-*.ts` into the knowledge release |
| Battle.net API (Blizzard) | Sign-in identity, and a local cache on a maintainer's machine | Blizzard Developer API terms: no redistribution | Sign-in: `web/src/app/api/auth/bnet/`. Cache: `kb/src/blizzard/`, marked not publishable; the release build refuses it |
| [Polestar](https://github.com/fitzforge/polestar) by fitzforge | Facts about Polestar on the addons pages; we copy no code or guide text | GPL-3.0-only with a guide-pack exception | `web/src/data/polestar.ts`, and live release and issue data from the GitHub API (`web/src/lib/polestar-github.ts`) |
| Blizzard game files (client tables `ItemSparse`, `Item`, `SpellName`, `Spell`) from Blizzard's CDN | Per-build snapshots and diffs on a maintainer machine; published only after review, labelled unconfirmed | Game data © Blizzard Entertainment; facts, not under our CC BY-SA licence | `kb/src/client-extract.ts`, `kb/src/client-snapshot.ts`, `kb/src/client-diff.ts` |
| [WoWDBDefs](https://github.com/wowdev/WoWDBDefs) by the wowdev contributors | Table layouts used to read the client tables | CC BY-SA 4.0 (definitions) | Fetched at extraction by `@rhyster/wow-casc-dbc`; the commit is in each snapshot manifest |
| Public pages cited for guild-family facts | One fact each, in our own words, with its link and date | Facts only; no text copied | `web/src/data/families.ts` |

World of Warcraft, Warcraft and Blizzard Entertainment are trademarks of Blizzard Entertainment, Inc.
Everloot is a fan project and is not affiliated with or endorsed by Blizzard.

## Media

The site uses the visitor's system fonts and ships no third-party fonts. The favicon
(`web/src/app/icon.svg`) and the social card (`web/src/app/opengraph-image.tsx`) are our own. The
addon uses an icon from the game client (`Interface\Icons\INV_Misc_Coin_02`) by path; no game art
is included in this repository.

## Dependencies

npm packages, production dependencies only, checked with `license-checker-rseidelsohn --production`
on 2026-10-16 from a Windows install (each platform installs its own prebuilt binaries):

| Package | Licences |
|---|---|
| `kb` | MIT 126 (including `@rhyster/wow-casc-dbc`, added 2026-10-17), ISC 11, Apache-2.0 3, BSD-3-Clause 3, BSD-2-Clause 2, Python-2.0 1 (`argparse`), BlueOak-1.0.0 1 (`sax`), MIT OR WTFPL 1 (`expand-template`, used under MIT), MIT OR Apache-2.0 OR BSD-2-Clause 1 |
| `web` | MIT 96, ISC 9, Apache-2.0 3, BSD-3-Clause 3, BSD-2-Clause 1, CC-BY-4.0 1 (`caniuse-lite` data), 0BSD 1 (`tslib`), Apache-2.0 AND LGPL-3.0-or-later 1 (`@img/sharp-win32-x64`: sharp's prebuilt libvips image library; every platform gets its own LGPL-3.0-or-later libvips binary, such as `@img/sharp-libvips-linux-x64` on Vercel) |
| `companion` | MIT 88, ISC 7, BSD-3-Clause 2, BSD-2-Clause 1, Unlicense 1 (`fast-sha256`) |

The checker lists each of our own three packages as `UNLICENSED` because they are marked
`private` in `package.json`; they are AGPL-3.0-only like the rest of the repository. Every other
licence above can be combined with the AGPL-3.0.

The addon is plain Lua with no third-party libraries.
