# Platform expansion: data, builders, guides, accounts and addon pages

**Date:** 2026-10-18
**Status:** design for Carlos's review. Parts 1 to 8 are in scope (approved by Carlos on
2026-10-17 and 2026-10-18). Nothing here is built. The money model in part 7 has tiers proposed for
his decision.

## Why

Everloot has an open MCP endpoint, a corroborated player-data corpus, a lore archive, a build
registry and a new visual identity. What it lacks is what players open a WoW: Forever site for on
launch day: a talent calculator, a raid builder, guides, and a place to find addons. Competitors
have most of these. None of them publishes where its data comes from, how it handles a patch, or an
API. Everloot can match the tools and be the only one with sources, build stamps and open access.

Eight parts, written the same way. For each: how others do it today, where they fall short, how
Everloot does it, what ships by launch on 2026-11-04 and what waits, the data and its licence, and
what is still open.

## Ground rules for every part

- **Clean-room.** We describe how other sites work in our own words. No code, text, data, icons or
  layouts are copied.
- **No scraping of Wowhead, wago.tools or warcraft.wiki.gg.** Wowhead's `robots.txt` bans ClaudeBot
  and about 30 other named AI crawlers. wago.tools disallows everything but its home page.
  warcraft.wiki.gg bans the same crawlers and declares `ai-train=no`. We link to all three and read
  none of them from the product. The 2023 Warcraft Wiki dump already in the knowledge base stays
  (CC BY-SA 4.0).
- **Do not import wowsims `db_inputs`.** The folder holds files derived from Wowhead and
  wago.tools. Its MIT licence does not clean them.
- **No game-client decryption and nothing that drives a character.** Encrypted blocks stay
  skipped. The addon only reads.
- **Blizzard's data stays Blizzard's.** Game-file data is a separate, labelled layer under
  `docs/DATA_POLICY.md`, not under our CC BY-SA licence.
- **In game and on the site, same data.** Every tool exists in the Everloot addon and on the website,
  reading the same build-stamped data and the same share codes. The addon only displays. It never
  clicks, spends a talent point, targets, casts or acts for the player, and it never shows ads, plans
  or donation requests (Blizzard's addon policy). Each in-game feature below is marked unverified
  until the beta session checks it.
- **Build-stamped.** Every rule, number and share link names the game build it came from.
- **Unverified is marked.** Where the research could not see a competitor's tool (many are
  built in the browser and show only navigation to a page fetch), this spec says "not visible" or
  "unverified". Carlos should open those tools by hand before we borrow any layout idea.

Research files, all dated 2026-10-17, are cited as **landscape**, **builders study**, **data
inventory** and **platform analysis** (in the R21 Brain wiki, `projects/everloot/`). The ops queue
board is cited as **board**.

## What exists today

| Area | State on `main` |
|---|---|
| Site | Next.js on Vercel. Pages: database (items, NPCs, quests, vendors, drops), lore, addons (`/addons`, `/addons/popular`, `/addons/polestar`), tools (auctions, collections, completionist, farming routes, gold ledger, gold per hour, guild board, profession planner and others), `/mcp`, `/upload`, `/about`, `/privacy` |
| API and MCP | `/mcp` (bearer) and `/mcp/public` (no sign-in, per-IP quota; the quota code sets 200 per IP and 5,000 global per window, hourly by its comment). 14 tools, each with a `title` and `readOnlyHint` |
| Accounts | Battle.net OAuth sessions, used only for named sharing. Uploads are anonymous, keyed by a random install id |
| Data | Immutable SQLite knowledge releases; Supabase Postgres for sessions, grants, quotas; R2 for uploads and the public corpus |
| Game files | Build registry and client extract (`kb/src/builds.ts`, `client-extract.ts`, `client-diff.ts`) read four tables on a maintainer machine: `Item`, `ItemSparse`, `SpellName`, `Spell`. Nothing is published yet |
| Ads | The consent banner and an AdSense loader exist behind `NEXT_PUBLIC_ADSENSE_CLIENT`. `/about` and `/privacy` still say the site is supported by AdSense ads |
| Addon | 0.2.6 records `addon_seen` (name, title, version, loaded) only after `/everloot addons on` |

---

## Part 1. Data foundation

### How others do it

- **Wowhead:** one big database of items, spells, NPCs, quests and objects, with a Forever section.
  The method for Forever rows is unstated (landscape, Wowhead entry). No API or MCP found.
  Not read by us.
- **talentsforever.com:** talents, racials, Legacy perks and spellbook, "read from the beta client
  files, trees checked in game class by class", re-read on each build, with a JSON export
  (landscape, talentsforever entry).
- **wowforevertools.com:** broad coverage, "built from the beta's own game data" for build
  1.60.1.70425, no licence on the content, no export (landscape).
- **Questie and pfQuest:** both say Forever quest and NPC data is incomplete. pfQuest's data comes from
  emulator databases (landscape, Questie and pfQuest entry).
- **Nobody** publishes per-row provenance or install counts (landscape, "What this means" item 3).

### Where they fall short

Data origin is not stated. A row does not say whether it came from game files, a player or an
editor. Builds are mostly invisible: a page does not say which build it describes. Reuse is closed
except talentsforever's CC BY 4.0 export.

### How Everloot does it better

Every row carries a layer and a build:

| Layer | Meaning | Label on the page |
|---|---|---|
| Observed | Players' uploads, public once at least three installs agree | `observed in play`, with count and date |
| Game files | Read from unencrypted client tables, reviewed by a maintainer | `in game files, unconfirmed`, hidden behind the spoiler switch where it could spoil |
| Curated | Facts we wrote, with the page they came from | `curated` |
| Reference | Open datasets (OpenMap, the 2023 wiki dump) | name and licence |

The interface uses the visual identity's evidence tags, citation chips and tooltip frames. The MCP
`answer_sources` tool returns the same fields (claim, kind, source, licence, asOf, support), so an
assistant can cite them. The API and MCP are open with rate limits, not walls.

**Keys.** Forever has one "mega-realm" per ruleset per region (Normal, PvP, RP, Hardcore later),
per the Warcraft Wiki page read on 2026-10-17. Market, population and character-linked data is keyed
by ruleset and region, not realm. That `GetRealmName()` returns something useful is unverified and
needs one in-game check. The same open item blocks the market PR (#15, draft).

**Build stamp.** Each record stores the `clientBuild` the addon reported (addon 0.2.6). Each
snapshot stores product, build id and the first 8 characters of the BuildConfig hash. A page shows
"as of build X, read on date". A data change between builds is a diff, not an overwrite.

### The ten pieces (inventory backlog)

| # | Piece | Ships for 11/04 | Notes |
|---|---|---|---|
| 1 | Extractor: trait tables (`TraitTree`, `TraitNode`, `TraitNodeEntry`, `TraitEdge`, `TraitCond`, `TraitNodeGroup`) | Yes. **In progress** (parallel PR, with the spell-effect tables) | Unblocks parts 2 and 3. Encrypted rows skipped |
| 2 | `talents` addon module, selftest and in-game planner | Yes. **In progress** (parallel PR). Needs Carlos's beta session | Turns inferences into facts, gives test strings |
| 3 | Talent builder | Yes. **In progress** (parallel PR, web calculator) | Part 2 |
| 4 | talentsforever seed and cross-check | Yes. **In progress** (inside the web calculator PR) | Ledger entry first |
| 5 | Spell effects table with scope per build | Yes. **In progress** (with piece 1) | Under part 3 |
| 6 | Raid builder | Yes | Part 3 |
| 7 | Modern-API port of `professions.lua` and `auctions.lua`, plus the #15 market merge | Stretch | Legacy calls are likely dead on Forever (platform analysis). Recipes and prices stay empty without it |
| 8 | Zones and map ids (OpenMap MIT offsets, addon bounds) | Later | Pins need a shared coordinate system |
| 9 | Addon completion module (achievements, reputation, titles, quest completion) | Later | Needs the beta session and a catalog |
| 10 | Addon profile pages and the `object_seen` upload kind | Page: launch week. `object_seen`: later | Part 8 |

Not in the ten: BiS lists and guides. They need observed drops and writing, so BiS starts after
launch week from `loot` rows, with "unrecorded" kept distinct from zero.

### Data sources and licences

| Source | Licence | Use |
|---|---|---|
| Client tables from Blizzard's CDN | Blizzard's, not ours | Separate labelled layer, reviewed, no decryption |
| WoWDBDefs | CC BY-SA 4.0 (definitions) | Column names; credited on every page that shows them |
| `@rhyster/wow-casc-dbc` | MIT | Reads the CDN. Never `loadRemoteTACTKeys()` |
| Player uploads | CC BY-SA 4.0 | Public after 3 installs |
| OpenMap | MIT (art is Blizzard's, excluded) | Offsets and entrances |
| Warcraft Wiki 2023 dump | CC BY-SA 4.0 | Already in |

### Open questions

- Does `GetRealmName()` on Forever return a ruleset, a region or a fixed name? In-game check.
- Which realm-like key does the market use (PR #15 section 9)?
- The first review queue (DATA_POLICY says a maintainer reviews every game-file entry): who reviews
  and how fast, with 10 days to launch?

---

## Part 2. Talent builder (`/tools/talents/<class>`)

### How others do it

| Site | Seen | Source |
|---|---|---|
| talentsforever.com | Nine classes, level slider, "compare to Classic", leveling order, popular builds, per-class change log, "copy build for AI", saved builds in the browser, "copy link" with the full build in it (format not documented) | builders study section 1 |
| wowforevertools.com | `/talents/<class>`, Legacy trees, saved builds in the browser, share as a link | builders study section 1 |
| Mobalytics, SeeMeta, Icy Veins | Calculators exist; a 0/51 counter (Mobalytics) and "51 points at level 60, one per level from 10" (SeeMeta) come from search snippets. Layout and share format unverified | builders study section 1 |
| WoWDB | Page showed navigation only. Dual spec, URL format and mobile layout unverified | builders study section 1 |
| Wowhead, Method, Warcraft Tavern, Zockify | Not read | builders study section 1 |

Rules every site shares: three Classic-style trees per class, 51 points at level 60, a row opens
after points are spent above it (builders study section 1).

### Where they fall short

None of the sites we could read offers a Blizzard-format import string, a share link that survives a
patch, or a build stamp on a saved link (builders study, "Not offered anywhere I could read").
talentsforever's own terms say its links hold the whole build. Dual spec and mobile behaviour could
not be verified for anyone.

### How Everloot does it better

- **Interface.** The identity's tooltip frames for every talent, class colours as taxonomy, mono
  numbers for points, bracket labels for tree names, outline-pill controls, 2 px focus ring. Keyboard
  operable. No emoji, no glow.
- **Dual spec at level 40.** Two builds per page, matching the client: two tabs, the second locked
  below 40. The Warcraft Wiki says dual spec unlocks at 40, costs 10 gold at a class trainer, swaps
  outside combat or battlegrounds, and the respec fee falls to 1 gold (read 2026-10-17). A "plan
  ahead" switch shows the second tab early. Whether the in-game gold amounts are right is not ours to
  claim; the page links the wiki.
- **Undo.** Every click is a step. Undo and redo (Ctrl+Z and Ctrl+Shift+Z, plus buttons), reset per
  tree, reset all. Removing a talent that a lower-row talent depends on is refused with the reason
  shown.
- **Mobile.** One tree at a time, tabs or swipe, a sticky points bar, 44 px targets. Tested by hand
  on a phone against two competitors before launch (their mobile behaviour is unverified).
- **Max level is a setting.** Beta level cap was 30 on 2026-10-01 (Blizzard forum snippet); launch is
  60. Point rules come from extracted gates (`spentAmountRequired`) and level conditions, not from
  code.
- **Versioned share links that survive tree changes.** The link stores the build id and node ids,
  not row and column positions, in a compact versioned encoding. Opening it later loads the tree of
  the build it was made on and shows a diff against the current build: "built on build A; build B
  moved or changed these talents." One click migrates the build to the current tree where every node
  still exists, and lists nodes that no longer do. Old link versions always keep a reader.
- **Blizzard loadout string, only after the in-game check.** The format is in Blizzard's UI code
  (read for study only, never copied): bit-packed, least-significant bit first, base64 alphabet, a
  header of version, spec id and a 128-bit tree hash, then one record per node in ascending node id.
  Forever's own UI hides the import and export menu, but the machinery is loaded (builders study
  3.2). So the string is an adapter, not the canonical link, and ships only after the selftest shows
  that `GetLoadoutSerializationVersion()` returns what we write, that a string from
  `C_Traits.GenerateImportString` decodes with our reader, and what node order the live tree gives.
  If any check fails on launch day, the builder ships without it.
- **Open data and MCP.** `talents.get` and `talents.decode` tools, and a JSON endpoint per class,
  each stamped with build and licence. "Copy build as text" for chat or an assistant.
- **What changed.** A per-build change log from client-diff, each entry with build number and date,
  labelled "in game files, unconfirmed" until a player or the in-game check confirms it.

### In game and on the site

One build, one share code, two places. The Everloot share code from the website opens in the addon
and the addon's code opens on the site. Both read the same build-stamped tree data.

- **Planned build over the talent frame.** The player pastes an Everloot share code into the addon.
  The addon marks that build on Blizzard's own talent frame: the planned talents are outlined and
  the next point to take is highlighted. Display only: the addon never spends a point, never clicks
  a talent and never confirms the player's choice.
- **Both specs.** The addon holds the planned primary and secondary builds and shows the one for the
  tab that is open. It exports both to the site as one share code, plus the player's current spent
  points, so the site can show "planned versus taken".
- **Build mismatch.** If the code's build differs from the client's build, the addon says so and the
  overlay marks nodes that moved or no longer exist, the same diff as the site.
- **Status.** The `talents` module, selftest and in-game planner are in progress in a parallel PR.
  Unverified until the beta session: that an overlay on the Forever frame stays untainted, where
  the frame exposes node positions, and how the second spec tab is addressed.

### Ships for 11/04, and later

| Launch | Later |
|---|---|
| Nine classes, three trees, level slider, dual spec, undo, mobile layout, versioned share link, saved builds in the browser, text export, per-build change log, JSON and MCP tools | Blizzard string import and export (after the check; may still make launch), compare with Classic view, leveling order, popular builds from player uploads, Legacy trees, a short-link option |

### Data sources and licences

- **Primary:** our own extraction of the trait tables (part 1, piece 1). Client data is Blizzard's,
  labelled, never decrypted.
- **Seed and cross-check: talentsforever.com `/data.json` and `/export/<class>.json`, CC BY 4.0**
  (terms updated 2026-10-07). Credit "Talents Forever" with a link on the page, in
  `THIRD_PARTY.md` and in a new `docs/sources/LEDGER.md` entry that lands before any of it ships.
  The licence covers their reading, checking and arranging. It does not cover Blizzard's names,
  tooltips, icons or art, and the tooltip text inside the export is Blizzard's. So their text is a
  cross-check and a seed for positions and ranks, not the master, and no icons are taken. Their
  model is row and column; ours is node id. Their terms say heavy automated access is unwelcome and
  give no rate, so we fetch it by hand once per build, and store it.
- **Combining licences:** our site is CC BY-SA 4.0. Their CC BY 4.0 data can sit inside it with
  credit. Blizzard's text stays labelled as Blizzard's. One check for Carlos below.

### Open questions

- Will we show Blizzard's tooltip text from the files (labelled, as Blizzard's), or write our own
  rank text and link to the in-game source? The builders study gives both options.
- Does `talentbuild` chat-link open a read-only view on Forever (inference only)?
- Is the string version Forever's actual value? The wiki example uses 2, unverified for Forever.
- Does the plain talentsforever seed need written permission for the arrangement of its data into
  our CC BY-SA release, or is CC BY 4.0 enough? Carlos or a lawyer to say.

---

## Part 3. Raid group builder (`/tools/raid`)

### How others do it

| Tool | Seen | Source |
|---|---|---|
| wowtbc.gg raid comp | Five group panels, specs for nine classes added by drag or click, buff and debuff lists, Save, Share, Reset. A TBC tool; Forever is only in its footer | builders study section 2 |
| KamiLabs Forever planner | Tanks, healers and specs per group, coverage checked live, save and share by link. Tool did not load; account need unclear | builders study section 2 |
| wowforevertools roster | 10, 20 or 40 players, kept in the browser, shared as a link. Coverage not described | builders study section 2 |
| Wowhead raid composition | Not read (barred to AI agents). Search snippet only: plan and share a comp with buffs, debuffs and utility; the URL carries the state | builders study section 2 |
| Raidstrats | Pages returned 403 and 404. A fight planner with a share link. No source showed buff tracking; the encoding of its URL fragment is unverified | builders study section 2 |

### Where they fall short

No page we could read says which game build its buff rules follow. That matters now: build
1.60.1.70425 (2026-10-16, per SeeMeta patch notes) widened Battle Shout, Trueshot Aura and the
Fire Resistance, Flametongue, Grace of Air, Strength of Earth and Windfury totems from party to
party or raid. An earlier build stopped Tranquil Air, Windfury and Grace of Air totems stacking
across different shamans (Blizzard forum snippet). The board dates the widening 2026-10-15 and
SeeMeta dates it 2026-10-16. One of them is off by a day. All three planners are TBC or unverified
for Forever.

### How Everloot does it better

- **Rules are data, per build.** Tables: `providers` (class, talent or ability, rank needed),
  `effects` (name, scope of self, party or raid, stacking family, value) and optional `bosses`
  (debuffs wanted). Scope is stored per build, never in code, so the next change is a new row.
- **Scoped per build in the interface.** The builder opens on the current build and names it. A
  build picker lets you see an older raid under older rules. An old share link says "built on build
  A; the rules changed in build B" and shows the diff, the same way part 2 does.
- **Layout.** Groups of five in a grid, 10, 20 and 40 slots (sizes seen on wowforevertools). A slot is
  a class plus main tree, or "any". Forever has no specializations, so the picker is class plus the
  tree with the most points.
- **Coverage view.** Per group: buffs received and missing. For the raid: debuffs and utility. Each
  conflict names its stacking family, so "Windfury and Grace of Air do not stack together" is
  explained, not just flagged.
- **Share links.** A compact, versioned string with the build id in it. Fragment or query: a fragment
  never reaches our server, which is better for privacy and worse for a server-rendered preview card.
  Default is the fragment. A short link is a later option.
- **Open data and MCP.** `raid.coverage(composition, build)` returns the same coverage as the page.
- **Interface.** Class colours as taxonomy, tooltip frames for each buff, mono counts, mobile layout
  that shows one group at a time with a coverage sheet.

### In game and on the site

- **Live coverage in game.** The addon reads the player's group or raid, and the auras on each
  member that the game's API lets an addon see, and matches them against the per-build buff table
  from the site (the same `providers` and `effects` rows). It shows what the current group has and
  what is missing, with the stacking family named. Display only.
- **Same build rules.** The buff table is stamped with the build it was made on. If the client build
  is newer than the table, the addon says the table may be out of date.
- **Out to the planner.** A button copies an Everloot raid share code for the current group, so the
  full planner opens on the site with the same composition.
- **Status.** Not started; it waits on the spell-effect table (in progress). Unverified: which aura
  and group details an addon can read in the Forever client, what it can see for other players'
  buffs out of range, and the cost of scanning a 40-player raid.

### Ships for 11/04, and later

| Launch | Later |
|---|---|
| 10, 20, 40 layouts, class and tree picker, coverage per group and raid, per-build rules, share link, old-link diff | Roster import from an officer's guild upload (existing grant rule only), boss debuff targets, raid unlock dates (Barrow Deeps, Hyjal Summit and Onyxia's Lair open 2026-12-09 per the wiki), short links |

### Data sources and licences

- **Provider and effect rows:** from the extracted spell tables (Blizzard's, labelled "in game files,
  unconfirmed") and from our own observation.
- **Scope changes:** read by a person from build notes (SeeMeta, Blizzard forum notes) as a
  cross-check. Not fetched by the product, not stored.
- **Not used:** Wowhead, wowtbc.gg and KamiLabs lists (all rights reserved or unlicensed).

### Open questions

- Which provider and scope is correct for each buff on Forever? Needs an in-game pass; do not claim
  parity with any competitor until then.
- The one-day date mismatch for the party to raid change: which date is right?
- Does the extracted spell data hold scope, or only the tooltip text? If only text, scope comes from
  observation and carries the unconfirmed label.

---

## Part 4. Guides

### How others do it

Icy Veins, Method, Wowhead, Mobalytics and Warcraft Tavern write class, leveling and raid guides by
staff (data inventory, Guides row). Icy Veins announced a Forever talent calculator; its pages were
not readable (landscape). Their guide text is all-rights-reserved and none of it is read by us.

### Where they fall short

Guides do not show their sources or the build they describe, they go stale after a patch without a
visible mark, and they are not machine-readable. This is the gap named in the landscape's Icy Veins
entry.

### How Everloot does it better

**Data-built pages first, written guides second.** A page is assembled from our data where the
facts are, so it stays correct when the build changes:

- **Class pages (`/guides/classes/<class>`)**: the three trees (linked to the builder), abilities by
  level, what changed in the last builds, and what players run (talent builds from uploads, once
  three installs agree).
- **Raid pages (`/guides/raids/<raid>`)**: bosses, drops with sample size and denominator, the buffs
  a raid wants (from the raid builder's rules), and the lockout. These come after the raids open on
  2026-12-09.
- Each fact carries its layer label, build and a citation chip. Sentences are in our words. Where
  a page has editor-written prose, it ends with the sources list and "last checked on build X".
- A page whose build is no longer current says so at the top and links the current page.
- Each guide has an MCP resource and a `guide.get(id)` tool so an assistant can cite it.

### In game and on the site

The addon answers guide and data questions through the existing `ask` module: the player types a
question, the companion's file bridge returns an answer built from `answer_sources` and the guide
pages, with sources and the build. The addon shows the answer and its citation chips as text. The
site links to the same guide page. No model runs inside the addon. Answers appear after `/reload`,
as the bridge works today. Unverified: how long a guide fits in the chat frame, and whether a
shorter "summary" field is worth adding to `guide.get`.

### Ships for 11/04, and later

| Launch | Later |
|---|---|
| Nine class pages built from talent and spell data, plus three hand-written launch guides (the inventory recommends three; topics for Carlos to choose) | Raid pages (after 2026-12-09), BiS from `loot` rows after launch week, leveling and profession guides, Warcraft Wiki pages with CC BY-SA credit and share-alike |

### Data sources and licences

Our own data (parts 1 to 3), our own writing, and the 2023 Warcraft Wiki dump under CC BY-SA 4.0
with credit and share-alike. Live wiki pages are links only.

### Open questions

- Which three hand-written launch guides? Candidate topics are not in the research; Carlos picks.
- Who writes and who reviews? The org rule is that nothing is published without his approval.
- How much of a class page may be written by a model from data? Proposal: never published without a
  human read, and the page says it is built from data.

---

## Part 5. Footer

### How others do it

Carlos asked for a Wowhead-style footer. Wowhead's pages were not read (robots.txt bars AI
agents), so the research files say nothing about its footer. **What a Wowhead footer contains is
unverified.** The brief, as we understand it, is the common database-site pattern: a wide footer in
link columns, not a single line.

### Where we are

The current footer (`web/src/components/Footer.tsx`) is one row of nine links, a copyright line and a
Blizzard disclaimer.

### How Everloot does it better

A footer in the visual identity, built from our own pages, so it works as a map of the site for
people and for crawlers:

| Column | Links |
|---|---|
| Database | Items, NPCs, quests, vendors, drops, lore, builds |
| Tools | Talents, raid, completionist, gold ledger, gold per hour, professions, auctions, collections |
| Guides | Classes, raids, launch guides |
| Addons | Everloot addon, popular addons, Polestar, your addon |
| Developers | Connect your AI, MCP, API, data and licence, status, Source |
| Everloot | About, contact, privacy, cookie preferences |

Under the columns: the data licence line (code AGPL-3.0, data CC BY-SA 4.0), the data credits
(Warcraft Wiki, WoWDBDefs, OpenMap, Talents Forever) and the Blizzard disclaimer. The columns
collapse to accordions on a phone. Hairline dividers, no card shadows, 44 px targets, bracket labels
for column headings. Columns appear only when their pages exist: no dead links.

### Ships for 11/04

Yes, with only the columns whose pages are live. Part of R2 (the identity components slice).

### Data and licences

None. Credits are required by the licences of what we show, so the credit line grows with each
source added to the ledger.

### Open questions

- Which link groups does Carlos want from the Wowhead footer? He should list them, since we cannot
  read it.
- A site-wide "status" page: wanted at launch?

---

## Part 6. Official MCP directory listings

### How others do it

No competitor offers a Forever MCP server. The landscape finds no MCP at Wowhead and none from the
other sites; the only machine access is talentsforever's JSON export. Community MCP servers that wrap
Blizzard's API for Retail and Classic exist (sourced-answers spec) but they do not cover Forever.

### Where they fall short

The big databases keep data behind heavy pages. An assistant cannot cite them cleanly and their
robots.txt files bar the named AI crawlers.

### How Everloot does it better

`/mcp/public` is a no-sign-in MCP endpoint with 14 read-only tools, each with a `title` and
`readOnlyHint: true`, rate-limited per IP. Listing it in the official directories puts Everloot
where players already ask questions.

- **Claude directory.** From the board: a public MCP with no authentication is accepted, any paid
  plan can use a listed server, and every tool needs a `title` and `readOnlyHint`. Our tools already
  have both (checked in `kb/src/mcp-server.ts`: 14 tools, 14 annotations). Before submitting we run a
  checklist against the directory's current requirements, which this spec has not re-read. Anything
  we have not read is unverified.
- **Other directories** (ChatGPT apps or others): not researched. Marked unverified. Research
  before submitting.
- **Tool quality.** Each description says what it returns and its source and licence. New tools from
  this spec (`answer_sources`, `talents.get`, `talents.decode`, `raid.coverage`, `guide.get`) follow
  the same rule. All read-only.
- **`/connect` page.** For players: how to add Everloot in each assistant. For developers: the
  endpoint, tool list, rate limits, how to get a key (part 7), the licence and the credit line.
- **No tool changes data or drives a character.** There is no write tool.

### Ships for 11/04, and later

| Launch | Later |
|---|---|
| Submit to the Claude directory once the new tools and `/connect` are live (submission timing is the directory's, not ours) | Other directories after research; keyed MCP (part 7) for higher limits |

### Data sources and licences

Same as the underlying data. Every tool response carries its licence field. Game-file data keeps its
"Blizzard's, unconfirmed" label inside tool answers.

### Open questions

- Who owns the directory submission, and which account and contact email does it use?
- What are the directory's current review rules and timing? Check the live listing page first.
- Do we want a privacy policy URL, support contact and logo on the listing? Likely required; unverified.

---

## Part 7. Free accounts, API keys and the money model

### Decision on record

Carlos, 2026-10-18 ("C, later"). Long term, the competitors' model: ads plus a paid, ad-free
membership. At launch and for the first months: no ads, no paywall, nothing about paid plans on the
site. Later, ads. The earlier "no ads" pitch becomes "free, open data, no sign-in". Public copy must
never promise "no ads ever". The open MCP and API stay free either way, with rate limits, not walls.

### How others do it

Raider.IO runs on Patreon and ads, Warcraft Logs on Patreon (platform analysis, section 5.3). TSM
keeps price history and alerts behind a paid tier (platform analysis, section 3.3). Wowhead's
model is not verified, because it is barred to us. foreveraddons.net sells paid "featured"
slots (landscape). Not researched: Wowhead's or any other site's membership prices. We do not quote
any.

### Where they fall short

TSM gates price history and alerts behind a paid tier. No Forever site offers an open API or MCP
(landscape). How the other sites treat free accounts was not checked.

### How Everloot does it

**Tiers, proposed for Carlos's review.** Nothing below is announced.

| Tier | Ads | Tools and data | Extras |
|---|---|---|---|
| Visitor | Standard ads (later) | All tools, all data | None |
| Free account | Lighter ads (later) | The same tools, the same data | Saved builds synced across devices, share-link management, an API key with higher limits |
| Member (later) | No ads | The same tools, the same data | Supporter extras: a supporter badge, early access to cosmetic options and new pages. Never extra data |

The rule that holds each tier up: **an account or a membership never unlocks data or a tool**. It
changes ads and convenience. The same rule fits the platform constraints in the platform analysis:
no paid or premium addon features, no in-game ads, no selling data, no premium tier for Blizzard API
data. The addon never shows a plan, an ad or a donation request. Game-file data, which is Blizzard's,
is never behind a tier.

**Why this split.** It keeps the free site a complete reference, which is the product (platform
analysis: "most valuable asset: being the reference for Forever"). Free accounts give people a reason
to sign in without taking anything from visitors. It is also what the big sites do, so the later
switch is not a surprise.

**Launch behaviour.** No ad slots render. `NEXT_PUBLIC_ADSENSE_CLIENT` stays unset on production. The
consent banner stays, since the site still uses optional cookies and storage choices. Before 11/04,
fix `/about` and `/privacy`, which say the site is supported by AdSense ads: reword to the facts at
launch ("no ads today") without a promise about the future. No page mentions paid plans.

**Accounts.**

- **Sign-in:** Battle.net (exists), and GitHub (needed for part 8). Email sign-in is not proposed:
  more to run, and nothing needs it yet.
- **Schema.** One `accounts` table keyed by an internal id, with provider identities in a second
  table (`provider`, `provider_user_id`), and a `flags jsonb not null default '{}'` column. Nothing
  reads `flags` at launch. A later membership is a new key in that object, so there is no migration
  and no table change. The repository is public, so the column has a neutral name, not `member`.
- **Stored:** provider id, a display handle, created date. No email unless a provider's flow needs
  it. No character names are added by this part. Named sharing keeps its current rules.
- **API keys.** A signed-in user creates keys on `/account`. A key is shown once and stored as a hash.
  A key can be revoked. A key has a label and raises the per-key rate limit above the anonymous
  per-IP limit. Keys are read-only like the public MCP. Limits are set by Carlos; today's anonymous
  values are in the quota code. No invented numbers here.
- **Open MCP and API stay open.** Anonymous access never goes away. A key gives a higher limit and a
  way to contact a heavy user. The same key works for REST and for the keyed MCP.
- **Saved builds.** Browser storage first (parts 2 and 3). An account syncs them. A guest keeps
  working without an account.
- **Privacy.** The privacy page lists what accounts store and how to delete the account and its keys.

### Ships for 11/04, and later

| Launch | Later |
|---|---|
| Free accounts with Battle.net and GitHub sign-in, saved-build sync, API keys, `flags` column in the schema, copy fixes on `/about` and `/privacy`, no ads | Ads on the visitor and free tiers, the member tier, a payment provider, supporter extras |

Not before launch, and not in public copy yet: any price, any tier name beyond "account", any
mention of a paid plan.

### Data sources and licences

No new data. Payment is not part of this spec. When it comes, it needs its own spec and a check
against Blizzard's addon policy and the API terms.

### Open questions

- **Tiers (Carlos).** Does he approve visitor, free account and member as proposed? Is "lighter
  ads" defined by number of slots, by placement, or by both? Not decided here.
- Per-key and anonymous rate limits: what values?
- Does a free account need an email at all (for example for key abuse contact)?
- First "months" without ads: a fixed date, or a traffic condition?
- AdSense approval and policy requirements for a site of this kind: not researched; unverified.

---

## Part 8. Addon profile pages (`/addons/<name>`)

### How others do it

- **foreveraddons.net:** a hand-curated directory with links to CurseForge, starter packs, gear picks,
  paid featured slots and a submit form. No profile pages, rankings or API visible. No licence
  (landscape, foreveraddons.net entry).
- **CurseForge, Wago, WoWInterface:** the hosts of the files. CurseForge's API terms forbid caching
  and competing use (ledger, board), so it is link only. Wago's API is publish-only. WoWInterface
  blocks download handlers and `s=` URLs in robots.txt, and its terms are unread (landscape).
- **Polestar:** its own pages exist already on `/addons/polestar`, built from the GitHub public API
  and our own words (addons-polestar-hub spec).

### Where they fall short

Nobody shows what players actually run (landscape, "Gap" under foreveraddons.net, CurseForge, Wago,
WoWInterface). Directories do not show structure, licence or release cadence at a glance.

### How Everloot does it better

One page per addon, `/addons/<name>`, server-rendered, canonical, in the sitemap.

**1. Our own usage numbers.** From `addon_seen` uploads by installs that turned the addon list on.
An addon is listed once at least three installs report it, so a rare setup cannot be picked out
(`/addons/popular` rule, shipped in #22). The page shows installs reporting, the share (out of
installs that reported any addon list), versions seen, and the date. An install is one copy of the
Everloot addon, not proof of one person. Below three: "waiting for three installs".

**2. GitHub public API data, when the author published one.** Repository structure (top folders,
the `.toc` files, packaged libraries), licence (SPDX id from the API), latest release and date,
release count, open issues, last push. All through the GitHub REST API under its terms, public data
only, shown with links, behind an hourly cache like `polestar-github.ts` (5 s timeout, `revalidate:
3600`, `null` on failure, last good page kept). `GITHUB_TOKEN` read-only and optional. Without one,
GitHub allows 60 requests an hour per IP, so a shared host can run out: with many profiles the token
is required, and refreshes are staggered. We do not copy README text; we write one line of
description from the `.toc` `## Notes` field, shown as the author's words with attribution, or
omit it. The `.toc` text is the author's and we mark it so.

**3. Download links to where the author publishes. No file hosting.** The page links to the
author's GitHub Releases and to the author's CurseForge, Wago or WoWInterface page when we know
it. CurseForge is a link only: nothing from its API or pages is read or stored, and we use no
search scraping. Today's `/addons/popular` link opens a CurseForge search, and that stays a link.

**4. Author claim via GitHub sign-in.** The author signs in with GitHub (part 7). Everloot checks
that the signed-in account has push access to, or owns, the repository the page points to (a
GitHub API check, `permissions` on the repo). A claim lets the author: confirm or change the
repository and download links, add a short description, add links (Discord, donation page they
choose), and hide the page's third-party fields. A claim never changes the usage numbers. An
unclaimed page says so. One claim per page, revoked if the GitHub permission goes.

**5. `## X-Website` from `.toc`, through the addon-list opt-in.** The 0.2.6 `addon_seen` record holds
name, title, version and loaded. It does not hold `X-Website`. To find a page's repository, the
addon would add the `X-Website` field (and, if present, `X-Curse-Project-ID`, `X-Wago-ID` and
`X-WoWI-ID`) to the same opt-in record, read through `GetAddOnMetadata`, trimmed to a safe length
and shown in the upload preview with the other addon fields. Nothing is sent without the existing
`/everloot addons on` and the preview. Because the field is the author's declared website, it is a
public link already. The page shows a repository only when three installs agree on the same value,
or when the author claims it. `DATA_POLICY.md` is updated in the same change. This is an addon
change, so it needs an addon release (0.2.7 or later). Which field names authors really use on
Forever is unverified.

**6. "Use Everloot data in your addon".** A section on every page, and a developer page under
`/connect`, that says: what we publish (CC BY-SA 4.0 corpus with the licence, credit and share-alike
rule in plain words), the corpus API and keyed limits, and a sample of a data file an addon can
bundle, stamped with its build. It states the licence consequence in one line: a data file built from
Everloot data must carry the credit and the same licence, while the author's addon code can stay under
its own licence. Whether that holds for every addon licence is a legal question for Carlos (below).
Polestar's practice (its pack exception) is the model: its compiler's output may carry any terms,
which is a position Polestar's authors took for their code, not ours.

**In game and on the site.** The addon list is what feeds these pages. The opt-in `addon_seen` record
(and the `X-Website` field once added) builds the usage numbers and finds each page's repository.
In game, `/everloot addons` shows the player's own list with the site's install count for each
addon and a link code to its page, so the player can see what the community runs and open the
profile. Display only: the addon never installs, enables, disables or updates another addon. The
site uses the same record, so nothing extra is collected. Unverified: whether `/everloot addons` can
show counts offline (it would need a small data file shipped with the addon, stamped with its date).

**Interface.** The identity's tooltip frame for the title block, mono for numbers, evidence tags,
outline pills for "Download from the author" and "View on GitHub". A "not tested by Everloot" line
on every page, as `/addons/polestar/packs` has: neither Everloot nor the author of another addon
vouches for it.

### Ships for 11/04, and later

| Launch week | Later |
|---|---|
| Pages for addons with three installs reporting; usage numbers; GitHub facts for pages whose repository is known (Polestar first, then any addon whose repo we can confirm by hand); download links; "use Everloot data" section | Author claim, `X-Website` and the other id fields (needs the addon release), repository detection from installs, rankings and trends, an "Addons for your class" view |

### Data sources and licences

| Source | Licence or terms | Use |
|---|---|---|
| Our `addon_seen` uploads | CC BY-SA 4.0, 3-install rule | Usage counts |
| GitHub REST API | GitHub API terms; public metadata | Structure, licence, releases, issues; hourly cache |
| `.toc` fields the player's own client reports | The author's declared metadata | Opt-in, shown in the preview |
| CurseForge | API terms forbid caching and competing use | Link only |
| Wago, WoWInterface | Not read | Link only |

### Open questions

- Does the licence line about data files hold for addons under GPL and other licences? Needs
  Carlos or a lawyer.
- Is a GitHub permission check on an addon with several maintainers the right claim test?
- May we show a link from `X-Website` that points off GitHub and off the known hosts?
  Proposal: show it as plain text with a "not checked" note.
- Unclaimed pages at launch: indexed, or noindex until three installs?
- Names: `/addons/<name>` collides with `/addons/popular` and `/addons/polestar`. Proposal: reserve
  those two, and 301 nothing.

---

## Build order

Dates: the Forever beta closes on 2026-10-22 per the Warcraft Wiki (talentsforever says 2026-10-21;
unverified which is right). Launch is 2026-11-04. The visual identity R2 to R4 and addon 0.2.6 to
CurseForge (around 10/24) run in the same window.

| Order | Work | Part | Needs | Beta session? |
|---|---|---|---|---|
| 1 | Beta session: addon `talents` module and selftest on each class | 1, 2 | The module and selftest build (stacked on PR #15) | **Yes, Carlos, before 10/22** |
| 2 | Trait tables in the extractor; talentsforever ledger entry | 1, 2 | PR #16 merged | No |
| 3 | Spell effects table with scope per build | 1, 3 | Spell data; order 1 for confirmation | Partly |
| 4 | Accounts schema, GitHub sign-in, API keys, `/about` and `/privacy` copy | 7, 8 | Nothing | No |
| 5 | Talent builder | 2 | 1, 2, R2 components | Blizzard string waits on 1 |
| 6 | Raid builder | 3 | 3, R2 components | Scope facts wait on 1 |
| 7 | Class pages and three launch guides | 4 | 2 and 5 | No |
| 8 | Footer | 5 | R2; pages from 5 to 7 | No |
| 9 | `/connect`, new MCP tools, directory submission | 6 | 5, 6, 4 | No |
| 10 | Addon profile pages (launch week) | 8 | `/addons/popular` (merged), GitHub cache | No |
| After launch | Ads, member tier, claim, `X-Website`, raid pages (12-09), BiS | 7, 8, 4 | Addon release for X-Website | No |

**Risks to the 11/04 window.** The beta session is the single point: without it, the Blizzard
string, scope confirmation and tree order stay unverified, and those items ship without the
feature or with unconfirmed labels. Extractor review of game-file entries needs a named reviewer.
`answer_sources` is not built yet (specified on 2026-10-17); `/connect` and the directory submission
depend on it.

## Acceptance

- Every page states its build and its source layer for every rule or number.
- A share link made on one build opens on a later build with a visible diff and loses nothing silently.
- No scraping of Wowhead, wago.tools or warcraft.wiki.gg exists anywhere; the ledger shows each as
  link only.
- No ad slot renders and no page mentions a paid plan at launch; no page promises "no ads ever".
- An account or API key never unlocks data or a tool; the anonymous MCP stays open.
- Every new MCP tool has a `title`, `readOnlyHint: true` and a licence field.
- `docs/sources/LEDGER.md` has an entry for each new source before any of it ships.

## Out of scope

Payment processing and prices; ad network choice; a mobile app; server-side model calls; any tool
that acts on a character; Warcraft Logs, Raider.IO and Blizzard Game Data API connectors (they wait
on their terms and a Forever namespace); character databases beyond today's opt-in and officer-grant
rules.
