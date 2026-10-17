# Source ledger

Every external source Everloot has used, linked to or read while building it, and what we did with
each one. Complete as of 2026-10-16. A source joins this file before its data, link or code joins
the project. The rules behind it are in the [data policy](../DATA_POLICY.md).

`docs/sources/source-catalog.md` is the research list of candidates and their terms. This ledger
records what actually happened.

**Use** is one of:

- **published data**: some of it is on everloot.app, in a knowledge release or in the MCP answers.
- **local only**: read on a maintainer's machine; never published.
- **link only**: we link to it; nothing from it is stored.
- **research only**: read while designing; nothing from it is stored or linked from the product.

## Published data

| Source | Terms | Evidence | In releases |
|---|---|---|---|
| [Warcraft Wiki dump, 2023-11-13](https://archive.org/details/wiki-warcraft.wiki.gg-20231113) (Internet Archive) | CC BY-SA 4.0 | `kb/src/importers/wiki-*.ts`; source id `warcraft-wiki-2023` | Yes: 257,110 pages (2026-10-05 release), 260,572 (2026-10-16 build) |
| Curated entries, our own words | CC BY-SA 4.0 | `kb/curated/forever.yaml`; one entry, citing [Blizzard's announcement](https://news.blizzard.com/en-us/article/24302498/updated-9-24-pre-purchase-the-world-of-warcraft-forever-collectors-edition) | Yes: 1 row |
| Players' Everloot uploads | CC BY-SA 4.0 once the upload consent sentence ships (open-source PR b); until then, the upload page's existing terms | Written only by `web/src/app/api/intake/route.ts`, through `putUpload` in `web/src/lib/upload-store.ts` | Public corpus only, after corroboration |
| Guild-family facts: [olympus-viii.org](https://olympus-viii.org/), [olympus-viii.com](https://olympus-viii.com/), [Blizzard forums](https://us.forums.blizzard.com/en/wow/t/olympus-is-recruiting/2355270), [X / Prism](https://x.com/fwprism/status/2101809316382847172), [WoW Forever Outpost](https://wofwforever.com/en/guides/wow-forever-olympus-guild/), [Olympus Guild addon](https://github.com/dnl-gentile/olympus-addon), [YouTube](https://www.youtube.com/watch?v=fihRIfTwd5k), [Dexerto](https://www.dexerto.com/gaming/wow-forever-player-creates-mod-that-hides-asmongolds-entire-guild-3412321/) | Facts in our own words, each with its page and date; no text copied | `web/src/data/families.ts`; each page read once by hand | Site only |
| [Polestar](https://github.com/fitzforge/polestar) facts | GPL-3.0-only with a pack exception; we state facts and link, and copy no code or guide text | `web/src/data/polestar.ts`, read from the repository at `06c1c41` (v0.2.4) | Site only |
| GitHub REST API (`api.github.com`): Polestar's public releases and open issues | GitHub API terms; public metadata, shown with links | `web/src/lib/polestar-github.ts`, hourly, anonymous unless a read-only token is set | Site only |

## Local only

| Source | Terms | Evidence | In releases |
|---|---|---|---|
| [Blizzard Battle.net API](https://develop.battle.net/) (`us.api.blizzard.com`) | Blizzard Developer API terms: no redistribution, no monetising the data | `kb/src/blizzard/client.ts`; source id `blizzard-api`, `publishable: false` | No. The release build refuses it, and `audit-sources` found it in no file |
| Wowhead facts (not built) | Gated: Wowhead's Terms of Use must allow it first | [`docs/DATA_POLICY.md`](../DATA_POLICY.md), "Wowhead" | No |

## Link only

The site links to these and stores nothing from them: [warcraft.wiki.gg](https://warcraft.wiki.gg)
(each lore page links its live article), [CurseForge](https://www.curseforge.com/wow/addons/polestar-guides)
and the [Polestar Discord](https://discord.gg/vMbee6F2e9) from the addons pages,
[Blizzard news](https://news.blizzard.com) and [forums](https://us.forums.blizzard.com) as citations.

## Research only

Every other site in `docs/sources/source-catalog.md` and `docs/references.md` was read during the
research passes of 2026-09-27, 2026-09-29 and 2026-10-04, to check its terms, robots.txt and page
shape. Nothing from them is stored, imported or linked from the product. These include Wowhead,
Icy Veins, Method, Raider.IO, Warcraft Logs, Petopia, the Forever fan sites, the economy sites and
the product inspirations in `references.md`.

Open-source projects read as references, none of their code in this repository:

| Project | Licence | What we took |
|---|---|---|
| [Gethe/wow-ui-source](https://github.com/Gethe/wow-ui-source) | © Blizzard | API reference while writing the addon |
| [chelinho139/wow-ai](https://github.com/chelinho139/wow-ai) | MIT | The idea of a file bridge between the game and a local helper. See "History" for the live bridge |
| [simulationcraft/simc](https://github.com/simulationcraft/simc) | GPL-3.0 (addon: Unlicense) | Nothing yet; a possible separate process once its `forever` branch sims |
| [Marlamin/wow.tools.local](https://github.com/Marlamin/wow.tools.local) | MIT | Nothing; noted as a local tool, never an importer |
| [alcaras/forever-ref](https://github.com/alcaras/forever-ref) | — | Nothing; an example of a wago.tools consumer |

## Infrastructure and placeholders, not data sources

Services the site runs on or signs in with: Vercel (`openapi.vercel.sh` is its config schema),
Supabase (`uinmowrmyckklpbwzqhn.supabase.co`), Cloudflare R2 (`<account>.r2.cloudflarestorage.com`,
`acct.r2.cloudflarestorage.com` in tests), Battle.net OAuth (`oauth.battle.net`, sign-in identity only), Google AdSense (`pagead2.googlesyndication.com`), the MCP client origins
(`chatgpt.com`, `chat.openai.com`, `claude.ai`, `perplexity.ai`). Placeholders in tests and examples:
`example.test`, `example.supabase.co`, `everloot.example`, `api.example`, `sb.example`, `sb.test`,
`db.test`, `evil.test`, `localhost`, `127.0.0.1`. Standards and docs links:
`schema.org`, `www.w3.org`, `www.sitemaps.org`, `www.mediawiki.org`, `webpack.js.org`,
`developers.cloudflare.com`, `policies.google.com`, `www.google.com`, `registry.npmjs.org`.

## Release evidence

`npm run kb -- audit-sources` on every database built so far, 2026-10-16:

```
wowvault-kb.sqlite (working database): curated=1 warcraft-wiki-2023=257110 api_cache=0
wowvault-kb-2026-10-16.sqlite: curated=1 warcraft-wiki-2023=260572 api_cache=0
recovery-script-check.sqlite: curated=1 warcraft-wiki-2023=257110 api_cache=0
release/2026-10-05-everloot-public.sqlite: curated=1 warcraft-wiki-2023=257110 api_cache=0
release/2026-10-16-everloot-public.sqlite: curated=1 warcraft-wiki-2023=260572 api_cache=0
release/wowvault-kb-2026-09-27.sqlite: curated=1 warcraft-wiki-2023=257110 api_cache=0
```

Every file also has `api_cache=0`: no cached Battle.net responses. The raw input folder holds one
file, the Warcraft Wiki dump `warcraft.wiki.gg-20231113-history.xml.zst`.

**Public corpus writers.** Uploads are stored by one function, `putUpload` in
`web/src/lib/upload-store.ts`, and it has one caller, `web/src/app/api/intake/route.ts`. The cron
snapshot (`writeSnapshot`) only re-reads stored uploads. No script seeds the corpus:
`web/scripts/corpus-load.mts` works on synthetic rows in memory and writes to no store.

**Addon downloads.** Every zip in `web/public/downloads` contains only `Everloot/*.toc` and
`Everloot/*.lua`, built from `addon/` by `scripts/package-addon.py`.

**Secrets in history.** `gitleaks git --log-opts=--all` (8.30.1) over 250 commits on every branch,
2026-10-16: no leaks.

## History

- **wago.tools importer, 2026-09-27.** An importer for wago.tools' DB2 tables was written that
  morning. A robots.txt check then showed `/db2` is disallowed, and it was removed the same day in
  `ca185a6`, before the first real build. robots.txt then read `Allow: /$` and `Disallow: /`, which
  blocks everything but the home page. There is no record of the importer being run, and no
  wago.tools data exists in any database (see "Release evidence").
- **Live bridge, designed and dropped, 2026-09-27.** The first design
  (`docs/superpowers/specs/2026-09-27-forever-ai-addon-design.md`) described a private "live bridge"
  that would read pixels from the game window, built on wow-ai. It was never built: no screen- or
  memory-reading code exists in this repository or its history. Everloot uses only the file bridge,
  which reads the SavedVariables file the game writes.
