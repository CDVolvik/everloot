# Changelog

All notable changes to Everloot, in the style of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The addon is versioned (`0.2.x`, tagged `addon-vX.Y.Z`). The site and the knowledge base deploy from
`main` and have no version number, so their milestones are listed by date at the bottom.

This file was written on 2026-10-17 from the merged pull requests and commit history. The first
tagged release will be the first one to have a GitHub release page; `0.2.1` is the first addon build
that has a zip in the repository. Earlier builds have none.

## [Unreleased]

Pull requests merged to `main` are listed in the nightly pre-releases until the next tagged release.

### Added
- **Everloot Desktop** (`desktop/`): the companion as a tray app with a sidebar window. First run
  shows what leaves the computer and finds the game folder; then it uploads after every logout,
  refreshes market prices after each upload and hourly, and answers `/ask` when turned on. Pages
  for each thing to manage: what each account file holds, realm picks for the prices file (your
  scans plus the realms you follow), the `/ask` setup and recent answers, addon install and update
  checked against the release's `SHA256SUMS`, the change tracker, the log. Electron, built on
  `companion/src`, same data folder as the command line. Tagged `desktop-vX.Y.Z`; the first
  release is not code-signed.

## [0.3.3] - 2026-10-19

### Added
- A **completion tracker** module for achievements, reputation, titles and quest chains. It is off until
  `/everloot completion on` (`/everloot completion` reads now, `/everloot completion off` deletes every
  row it wrote). It reads with the calls Forever's own windows use (the achievement globals the Legacy
  Challenges window calls, `C_Reputation`, the title functions, `C_QuestLog.GetAllCompletedQuestIDs`,
  `C_QuestLine`), in chunks across frames, waits out combat and never acts: no tracking, no expanding
  headers, no window changes. A missing call records nothing for that part and `/everloot status` names it.
- Eight intake kinds. Catalog rows (`achievement_catalog`, `reputation_catalog`, `title_catalog`,
  `quest_chain_catalog`) are game facts with no player data, listed on the site after 3 reporters (distinct
  upload addresses) report the same entry. Owned rows (`achievement_owned`, `reputation_owned`, `title_owned`, `quest_owned`) are one
  character's progress under an opaque key, not the name. They are named data in the collection sharing
  category, like `collection_owned`. A changed achievement or standing replaces its earlier row, so the
  file does not grow with each point of reputation, and the module's rows have hard caps reported in
  `/everloot status`. None of the eight kinds is in the public corpus: the site folds them into a separate
  completion rollup, so pages that do not show completion never read them.
- `/tools/collections` shows, per character, what is done and what is closest to done (achievements with
  the most criteria met, reputations nearest the next standing, quest chains with the fewest quests left),
  with an empty state that says when the data is unrecorded rather than zero.
- MCP tool `completion_progress`, read-only, taking an install id and an optional character key.
- [`docs/2026-10-19-addon-0.3.3-beta-checklist.md`](docs/2026-10-19-addon-0.3.3-beta-checklist.md): the
  calls confirmed in the build's own files, and the in-client check to run.

Forever opens achievements as Legacy Challenges, so the catalog is the list the game gives those calls.
The module has passed the automated tests against a mock of the documented calls; it has not run in the
Forever client.

## [0.3.2] - 2026-10-18

### Fixed
- Recipes now read from Forever's own profession window (`C_TradeSkillUI`). The old trade-skill and
  craft calls the addon used are not in the client's API documentation for build 1.60.1.70450, so no
  `recipe_observed` rows could be written. Each row keeps its shape: profession, rank, recipe, colour,
  product item and reagents. The product and reagents come from the recipe schematic; a reagent slot
  that accepts several items is written without reagents instead of a guess. The read is chunked across
  frames and debounced.
- Trainer rows read the trainer window's values in the order Forever returns them. The old addon read
  the texture as a category, and now also skips the window's "next profession step" row.
- Auction buyouts and commodity purchases are read with `C_AuctionHouse` (the item bid at its buyout,
  and the total the house quoted for a commodity), watched from the player's own click and never called.
  The old `GetAuctionItemInfo` and `PlaceAuctionBid` path stays for older clients.
- A pending buyout is dropped after 5 seconds, on `AUCTION_HOUSE_SHOW_ERROR`, on
  `COMMODITY_PURCHASE_FAILED` and on `COMMODITY_PRICE_UNAVAILABLE`, so a rejected bid cannot later
  label a same-sized money change (a repair) as a purchase. Ranks above 500 are not written.
- `/everloot status` names any call this client lacks and says the module records nothing, and reports
  what the last profession window held.

### Added
- [`docs/2026-10-18-addon-0.3.2-beta-checklist.md`](docs/2026-10-18-addon-0.3.2-beta-checklist.md): the
  calls confirmed in the build's own files, and the in-client check to run.

The profession and purchase paths have passed the automated tests against a mock of the documented API;
they have not run in the Forever client. This release also contains everything in 0.3.1.

## [0.3.1] - 2026-10-18

### Fixed
- The TOC declared interface 70058, an old build number, so the client listed the addon as out of
  date. It now declares 16001, derived from build 1.60.1. The companion's `EverlootAnswers` addon
  declares the same number.

## [0.3.0] - 2026-10-17

### Added
- An **Everloot scan** button on the auction house, or `/everloot scan`, reads the full auction
  listing with `C_AuctionHouse.ReplicateItems()`. It runs only when you click, with the auction house
  open, at most once every 15 minutes, and never buys, bids or posts. The result is summarised per
  item and stored as `auction_snapshot` records. The last three scans per realm are kept.
- Item tooltips show your own latest scan and the community prices the companion wrote. The tooltip
  shows the date the prices were fetched and marks them stale after two days.
- The companion's `prices --game` (and `watch --game`) writes the checksummed `EverlootPrices` addon
  the tooltips read, after the next `/reload`.
- `auction_snapshot` records are accepted by the upload intake. They stay out of the public corpus.

### Fixed
- A scan that gets no answer from the game within 30 seconds clears itself and gives the cooldown
  back. Closing the auction house while waiting does the same.

This release also contains everything in 0.2.8. It has passed the automated tests; the in-client
checks are still open.

## [0.2.8] - 2026-10-17

### Added
- `/everloot raid` lists the raid buffs missing in each group of your current group. It is display
  only and records nothing.
- `/everloot raid code` prints a link that opens your raid in the site's raid builder.

### Changed
- The raid builder's buff rules come from a committed file generated from our own game-file
  extract for the current beta build, instead of a hand-written table.

This release also contains everything in 0.2.7.

## [0.2.7] - 2026-10-17

### Added
- Talents module: reads your build through `C_Traits` and `C_ClassTalents` for the active spec
  group, and the second one once dual spec is unlocked. A row is saved only when the build changes.
  Talent rows are not in the public corpus.
- `/everloot selftest` checks each talent API and whether the loadout export and import functions
  exist, and writes the result to chat and the saved variables file.
- `/everloot plan <share code>` shows the next point to spend and where your build differs from a
  plan made in the site's talent calculator. It never spends a point, clicks or imports a loadout.

## [0.2.6] - 2026-10-16

### Added
- An opt-in list of your installed addons (`/everloot addons on`). It leaves the addon only from the
  upload page, after the preview. `/everloot addons off` stops it and deletes the recorded rows.
- The bounds of each zone you enter, recorded as a position, for the world map.
- The game client build is stored with every upload.

## [0.2.5] - 2026-10-10

### Added
- Trainer rows: the required skill rank and cost of each recipe a trainer offers
  (`trainer_seen`), read when the trainer window opens.

## [0.2.4] - 2026-10-10

### Added
- Auction sales taken from the mailbox are recorded in the gold ledger, net of the auction house's
  cut. The buyer's name is never read.
- Buyouts you pay are recorded as auction purchases. Plain bids are not, since they can be refunded.
- Postage for letters the server confirmed sent. The recipient and text are not read.

## [0.2.3] - 2026-10-10

### Added
- Recipe colour observations: one row per profession, recipe, skill rank and colour as the
  profession window shows them (`recipe_observed`). The site infers difficulty ranges from them once
  three installs agree.

## [0.2.2] - 2026-10-09

### Added
- `/ask <question>` stores your question. The companion answers it and the answer shows in chat
  after `/reload`, with its source, once its checksum verifies.
- Quest rewards, vendor sales and flight costs in the gold ledger.
- `/everloot auctions on|off` to switch auction capture in game (it applies after `/reload`).

### Fixed
- Auction rows stored a whole stack's buyout as one item's price. Rows now carry the stack count
  and a per-unit price, and bid-only listings are skipped instead of being saved as free.

## [0.2.1] - 2026-10-08

### Fixed
- Collection repairs in the open-world and guild modules. This is the first addon zip built by
  `scripts/package-addon.py`.

## [Site and knowledge base milestones]

Dated by the pull request or commit that landed them.

### 2026-10-17
- Forever market (#15): scans players start are folded into daily prices. A day is published once
  three reporters agree, and a thin or outlying day is labelled or trimmed instead of averaged in.
  `/tools/auctions` shows a realm table and an item view with a 60-day chart, `/api/market/prices`
  serves the prices without install ids, and the `market_value` MCP tool brings the server to 16 tools.
- Build watch (#34): a scheduled workflow notices a new WoW: Forever build within about half an hour,
  regenerates the talent, raid and map data with the site's own generators, and opens a reviewed pull
  request titled `data(game-data): build <version>` with a list of what changed. Nothing merges itself.
  See `docs/BUILD_WATCH.md`.
- Talent calculator at `/tools/talents` (#27), reading our own catalog extracted from the game
  files (#30).
- Raid group builder at `/tools/raid` (#32).
- World map at `/map`, drawn from zone and entrance positions in the game files (#28).
- Blizzard change tracker at `/changes` with an RSS feed, and the `recent_changes` MCP tool (#37).
- Addon leaderboard at `/addons/popular` (#22) and addon profile pages at `/addons/<name>` (#26).
  Counts, titles and dates appear only when three installs report them.
- `/connect`: how to use the open data from an AI assistant or your own code (#31).
- Opt-in analytics with consent categories (#33).
- Data policy extended to game-file data: talents, the raid buff table and the map (#14, #29, #30).
- CI rejects AI tool credits in commits and pull request descriptions (#38).
- Lore pages are cached instead of running a function per view (#35).

### 2026-10-16
- Open-sourced under AGPL-3.0-only, with the data under CC BY-SA 4.0: contributing guide, code of
  conduct, security policy, issue forms, DCO sign-off check, secret and private-path guards,
  third-party notices, a provenance ledger of every source, and the data and no-spoiler policy.
- New visual identity: colour tokens for light and dark, Geist, outline pill buttons, bracket
  navigation.
- Addons hub and Polestar pages.
- Public corpus no longer carries install ids.
- Client table snapshots and field-level diffs in the knowledge base tooling (#16), and a build
  registry from Blizzard's public version service (#13).

### 2026-10-15
- Lore archive: `/lore` pages, `/search`, browsing by type, letter and facet, a coverage page, and
  sitemaps, built from the Warcraft Wiki dump (CC BY-SA 4.0).

### 2026-10-10
- Public read-only MCP endpoint at `everloot.app/mcp` for AI assistants, rate limited.
- Recipe difficulty ranges (`recipe_thresholds` tool and profession page section), and profession
  paths that price reagents from per-unit auction scans.
- Generated social preview card.

### 2026-10-07 to 2026-10-09
- Replay-safe, resumable uploads with event identity and de-duplication.
- Guild authority, claim tokens, quotas and opt-out.
- Battle.net sign-in.
- Public MCP HTTP server with authentication, rate limiting and CORS.
- Public rollups that state a fact only when three installs agree, with opt-out and suppression.
- Pages show the age of the data.

### 2026-09-29 to 2026-10-04
- everloot.app live (2026-10-03). Upload page and intake contract, drop-rate rollups, database
  pages for items, NPCs, quests and vendors, profession and farming route pages, guild pages.
- Uploads stored in object storage with a Supabase index; pages read one corpus snapshot, extended
  every ten minutes.
- First MCP knowledge server over stdio (3 tools). The server now has 16.
- Knowledge base (`kb/`): lore import from the Warcraft Wiki dump, provenance on every row,
  publishable-only snapshots with a licence manifest.
