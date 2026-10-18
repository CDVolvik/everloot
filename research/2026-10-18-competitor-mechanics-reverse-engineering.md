# Competitor mechanics, reverse-engineered — how the Forever sites actually work

**Date:** 2026-10-18
**Purpose:** so Everloot adopts proven mechanics instead of reinventing them. Companion to `2026-10-18-source-maximization-deep-research.md` (sources and legal verdicts); this document is about *mechanics* — page structure, evidence systems, APIs, pipelines, trust models.
**Method:** public pages and machine-readable files only; every site fetched is robots-permissive for this (basis per site below). Wowhead and wago.tools were not touched. Fetched artifacts listed in section 11.

## 0. Headline

Every serious site converged on the same skeleton — **build-stamped, source-labelled records behind a per-claim evidence chip** — and differentiated on one axis each: wow-forever.gg on evidence UX, ForeverDB on datamine breadth, wclbox on a public read API, wow-forever.top on editorial labelling. Everloot's design already matches the skeleton (`/methodology`, `/changes` build stamps, "found in game files, unconfirmed" labels, three-install agreement). The mechanics worth copying are in the parity matrix (section 8). None of this is import material — mechanics are not the copyable asset, their data and text are, and those stay citation-only.

## 1. wow-forever.gg — the evidence-first site

**Platform.** Astro static site (`/_astro/*.js` islands; component names in the bundle: Base, ClassStrip, ConsentBanner, ContactModal, HomeCountdown, SessionNav, ShareSheet, SupportPrompt). Pages are plain HTML; the JSON behind on-page filters lives under `/api/` and is deliberately kept out of crawl scope.

**AI posture (the most quotable policy in the ecosystem).** `robots.txt`, policy dated 2026-09-20: "search engines, AI search and answer crawlers, user-triggered AI fetchers AND the major assistants' training crawlers are all welcome, because the owner wants assistants to know the site and cite it. Only SEO-tool crawlers are asked to stay out." Every named AI agent gets `Allow: /` plus `Disallow: /api/`; `sitemap-index.xml`; and every database record is also linked in plain HTML from `/db/items/browse/` and `/db/spells/browse/`. Contrast: Wowhead bans those same crawlers — being the citable source is a deliberate niche.

**URLs.** `/db/items/{id}-{slug}/`, `/db/spells/...`, `/db/achievements/{id}-{slug}/`, `/classes/{class}/...` — numeric ID first (stable), slug after (SEO), both in one path.

**Item page anatomy.** Title pattern `Name - WoW Forever: Where to Get It`; sections in order: **Model → Where to get it → Changed in Forever → History → Similar items → Comments → Effects**. JSON-LD: `WebPage` + `Thing` + `PropertyValue` pairs.

**The claims system (their best mechanic).** From `/about/`: "Every claim wears where it came from" — three chips: **Source: Blizzard** (the post is linked) / **Reported** (the community said it, Blizzard has not) / **Coming soon** (we do not have it, and the gap says so). Records additionally carry **"Checked in game"** vs **"From the beta build"**. Every page with numbers carries a **"Wrong number?" link you can sign**, and they publish their own corrections ("Hall of catches … we showed the wrong talent trees for a day"). They keep an explicit **"What we do not know"** list: drop tables ("not enough kills yet"), trainer and vendor prices ("not enough visits yet"), quest text ("not recorded yet"). Community loop: an AI sorts public discussion into *asked most / fixed / added*; posts are never copied, contributors never named. Credits: "Players who record what they saw is the database."

**Tool side (for context, mostly out of scope).** Player census 1,698; simulator being built from 16 recorded play sessions; dressing room 10,150 items; AH prices for 3,265 items.

**What to take:** the three-chip source label per claim, the "Wrong number?" intake plus public corrections log, the explicit unknowns section, and the crawlability stance (welcome answer engines, keep filter JSON out of scope).

## 2. foreverdb.net — the datamine-first site

**URLs.** Stable numeric IDs, no slug: `/item/{id}`, `/spell/{id}`, `/dungeon/{mapId}`, `/profession/{slug}`, `/guide/{slug}`, `/lore/{topic}`, plus `/datamine` and filtered lists like `/items?cls=2`. JSON-LD `BreadcrumbList` whose crumbs include the active filter (`ForeverDB → Items → Weapon (?cls=2) → item`) — filter-aware breadcrumbs, a nice touch on top of ours.

**Labels.** "Classic data" (the baseline-era value), "Speculation" **with a reason** (e.g. "learned at level 42, above the beta level cap of 30"), "extracted" plus a build stamp (`Build 1.60.1.70450`, extracted 2026-10-17). Q&A content carries "checked" dates.

**`llms.txt` + `llms-full.txt` (121 KB Q&A digest)** — the single best structural checklist of the whole game state. Sections: launch/beta Q&A (launch 4 Nov 2026 15:00 PST; name reservation 27 Oct–3 Nov) → classes and new abilities (spell ID, spec, level) → **client in numbers** (spells 31,926; items 22,318; 5,542 new spells; 5,557 new items; 3,336 changed items; 1,247 changed class spells; 60 maps; 47 dungeons and raids) → dungeons and raids (name, type, size, group-finder level range, zone, boss list from encounter data) → a labelled **"Other instances in the client (Speculation)"** leftover list (Season-of-Discovery maps in the Forever client, not announced) → professions (**recipes total + new-in-Forever + rank brackets Apprentice 75 / Journeyman 150 / Expert 225 / Artisan 300** per profession — e.g. Alchemy 195 recipes / 71 new) → guides with updated dates → lore.

**Tables their page formats imply:** dungeon = `Map` + `LFGDungeons` (ranges) + `DungeonEncounter` (bosses); professions = `SkillLineAbility`-family counts; vs-Classic "new/changed" = diff of the Forever client against the Classic Era client.

**Also:** own addon records player data; "Journey" character timelines; armory; group finder and guild tools; Discord bot.

**What to take:** the dungeon format (Map + group ranges + bosses), the recipe-count + bracket profession format, the labelled speculation-of-leftovers section, and llms-full as the coverage checklist we measure ourselves against.

## 3. wowforever.wclbox.com — the API-first site

**OpenAPI 3.1** published at `/api/open/v1` (the spec itself is JSON; robots allows `/api/open/`). Read-only, **no login, CORS allowed** (只读、免登录、允许跨域), **5 requests/second per IP**, 429 beyond that. Operations: `/items` (search + filter + paginate), `/items/{id}` (detail), `/facets` (selectable values **and counts** per filter — their filter taxonomy is served as data).

**Search params:** `q` (Chinese or English name; multiple words are AND), `ids` (comma-separated, ≤100), `status`, `quality` (0–7), `slot`, `type`, `classId`, `setId`, `min/maxItemLevel`, `min/maxRequiredLevel`, `sort` (id, ilvl, req, quality, name), `order`, `limit`, `offset`. Response `{total, limit, offset, items[]}`.

**`status` enum:** `new | rebuilt | changed | same | missing` — explicitly "relative to Classic Era" (相对经典怀旧服). The vs-Classic classification as a first-class filter field.

**ItemDetail extras:** `classes[]` (class restrictions), `formerName` (the name in Classic), `tooltip[]` + `tooltipEn[]` (the tooltip as an array of lines, one per element), `classicTooltip` + `classicTooltipEn` **only for changed/rebuilt items** — the diff view is generated from the comparison, not hand-written. The `url` field is the citation requirement ("引用时请给出" — cite the page URL when quoting).

**What to take:** the facets-with-counts endpoint, the status enum as canonical change vocabulary, and the citation field in payloads — the closest published analogue of Everloot's own corpus API surface.

## 4. wow-forever.top — the five-label editorial system

**Platform.** PHP pages (`about.php`, `contact.php`…), versioned CSS/JS assets, GA4 + AdSense. An engagement layer (`engagement.js`) richer than the others: like/dislike reactions (one per browser), views, "reading now", comments with honeypot + CSRF token, share buttons — with the moderation burden to match.

**Editorial policy (8 rules), condensed:** player usefulness first → **source hierarchy** (Blizzard official > current beta evidence: client records, in-game observations, reproducible builds > specialist references like Wowhead Forever for cross-checks > Classic data labelled as historical, not assumed unchanged) → beta data is temporary → **datamining is not an announcement** → guides and database pages have different roles, with **thin database records deliberately kept out of search indexing** → corrections replace the wrong text on the page itself → ads never decide recommendations → external references linked.

**Source labels (the mechanic):** five labels — **Official / Live beta (Beta verified) / Datamined (Client data) / Classic reference / Unverified (Pending)**. When sources disagree: "newer and more direct evidence wins", and category mismatches (entry level vs recommended range) are *explained, never silently resolved*; uncertain details get "an uncertainty label rather than replacing one guess with another". Corrections intake: page URL + first-party link + IDs + build + screenshot.

**Breadth:** class guides and talent calculators for all 9 classes; datamined tier-set models; dungeon loot; maps & coordinates; PvP rank rewards; guild directory with submissions; raid planner; name generator; an interactive ("Forever Siege"); news RSS.

**Attribution find worth filing:** some early class/talent reference data was adapted from **Talents Forever (talentsforever.com) by Chris Baldwin under CC BY 4.0** — a new candidate source (site robots allows reads; verify the licence on the site itself before any use).

**What to take:** the five-label vocabulary (richer than our current two-label split), the noindex-thin-pages stance, and the corrections intake format.

## 5. wow-professions.com/forever — the guide anatomy

Alchemy guide skeleton: **Shopping List → 1–225 → 225–300 → Trainer Locations (capital cities, starting zones) → Apprentice (1–55) → Journeyman (55–150) → Expert (150–225) → Artisan (225–300) → 290–300 → Recipes from Auction House / Vendors / Merchant's Favor**. Coverage: 10 profession guides plus camping and Merchants' Favor. Role for us: a **coverage checklist** for the professions lane, never a text source.

## 6. TylerAkins/wow-database — the pipeline architecture

- **Every adapter writes one versioned snapshot** under `data/forever/sources/<source>/`; adapters run offline against a local checkout or cache; **no automation ever downloads DB2 definitions or scrapes Wowhead itself**.
- Their official-database fetches (the Wowhead Forever cache) are **local, manual, browser-driven, rate-limited** (`--delay 5 --batch-size 10 --batch-pause 15`), and CI **imports the existing cache only** — the scheduled workflow never contacts the site.
- One daily GitHub Actions PR contains the generated snapshots and compiled products — an "automation proposes, humans merge" pattern.
- **Client extraction is local-only**: a Go extractor against an installed client plus a pinned WoWDBDefs checkout; the extraction manifest records the **WoWDBDefs revision and each selected definition's hash**; the committed snapshot came from `wow_classic_beta` build `1.60.1.70338`.

**What to take:** per-definition hash recording in our extraction manifest (one field, big provenance win), the source-snapshot directory convention, and the CI-compiles-committed-data-only rule (we hold the same line; worth stating in docs).

## 7. Forever-Hunter-Pets — the community-data trust model

Collected **only in game**; runtime client APIs provide names, icons, maps, models; every hand-entered fact needs a `beleg` (evidence) and the data build **aborts without it**. Collection modules: Survey (trainer window → abilities, ranks, prices), Sightings (~28 m), Tame observations, Places (location pinned to a **2% grid cell, 50×50**), manual corrections with source + date. SavedVariables → importer → generator.

**Trust ladder (their core mechanic):** *belegt* (proven: own character saw it, or **3 distinct other players** did) / *unsicher* (<3 reporters, shown with "?") / *unbelegt* (estimated, shown with "!", never authoritative) / *widerlegt* (refuted — **never shown**). Own observations outrank foreign; among foreign, seen beats refuted. Gaps are shown **as tasks** in the UI ("unentdeckt", "Fundort unbekannt", "Unbekanntes Tier (#ID)") instead of fabricated data.

**What to take:** the 3-reporter threshold (Everloot already uses three-install agreement — the same number, arrived at independently), the evidence-required build gate, and the gap-as-task UX for our uploads/census surfaces.

## 8. Parity matrix — mechanic → where seen → Everloot status

| Mechanic | Where seen | Everloot status |
|---|---|---|
| Per-claim source chips (Blizzard / Reported / Gap) | wow-forever.gg; wow-forever.top (5 labels) | **Partial** — labels live in copy (`/methodology`, llms LIMITATIONS); make them visible per record |
| "Wrong number?" corrections intake + public corrections log | wow-forever.gg | **Adopt** — contact page exists; add per-record intake + a public log |
| "What we do not know" gap list | wow-forever.gg | **Partial** — llms.txt LIMITATIONS carries some; add a site page |
| Build + extracted stamps per page | foreverdb; wclbox; ours (`/changes`) | **Have** — extend stamps to entity pages |
| Speculation label (with reason) | foreverdb; wow-forever.top | **Adopt** — add vocabulary to `DATA_POLICY.md` |
| vs-Classic diff (new / changed / same) | foreverdb; wclbox `status` | **Adopt** — extraction diff wow_classic_beta vs wow_classic_era; "changed in Forever" as a page section |
| Per-build "History" section on entities | wow-forever.gg | **Adopt** — per-entity history from build-to-build diffs |
| Numeric URL + slug (`/db/items/{id}-{slug}/`) | wow-forever.gg | **Not ours** — we use `/database/items/[id]`; slug is optional future SEO; numeric stays canonical |
| BreadcrumbList JSON-LD | foreverdb; we have `breadcrumbJsonLd` | **Have** (ours matches the visible trail; theirs adds the filter crumb) |
| `llms.txt` + `llms-full.txt` generated from live lists | foreverdb; wclbox; we have `web/src/lib/llms.ts` | **Have** — keep expanding with digest-style sections |
| Facets endpoint (values + counts) | wclbox | **Adopt later** — corpus API / search upgrade |
| Rate limit + CORS + no-login public API | wclbox; ours (corpus API + MCP, `data-guard`) | **Have** — surface the limits plainly like wclbox does |
| Citation field in API payloads | wclbox | **Adopt** — credit line exists (`kb/src/attribution`); surface in payloads |
| Dungeon pages: Map + LFGDungeons + DungeonEncounter | foreverdb (implied by format) | **Adopt** — needs the new tables (section 9) |
| Profession pages: recipe counts + rank brackets | foreverdb; wow-professions | **Partial** — recipe catalog machinery exists; page format to build |
| Achievements database | wow-forever.gg; already in backlog | **Planned** |
| Census from uploads | wow-forever.gg; design spec done | **Specced** (`docs/design/specs/2026-10-18-census-design.md`) |
| Trust ladder with public thresholds | pets; our three-install agreement | **Have** (same threshold, independently chosen) |
| Evidence-required build gate | pets | **Adopt** — uploads pipeline gate keeps the same spirit |
| Gap-as-task UX (unknowns shown as tasks) | pets; wow-forever.gg unknowns | **Adopt** — render unknowns as tasks, never fabricate |
| Thin pages noindex | wow-forever.top | **Consider** — for entity pages under a fact-count threshold |
| Engagement layer (reactions / comments) | wow-forever.top; wow-forever.gg | **Skip for now** — moderation burden; we run Discord |
| Model / 3D viewer section | wow-forever.gg ("Model"); wftop tier models | **Later** — `CreatureModelData` / `ItemAppearance` feed it; game visuals shipped icons, tooltips, map art |
| Welcome answer engines, stated in robots.txt | wow-forever.gg | **Adopt** — state our AI-crawler policy explicitly on the site |
| One-PR-per-day data automation | TylerAkins | **Pattern note** for future CI |
| Per-definition hash in extraction manifest | TylerAkins | **Adopt** — one field in `client-extract` |

## 9. New client tables this pass (parity backlog additions)

| Table | fileDataID | Unlocks |
|---|---|---|
| LFGDungeons | 1361033 | group-finder level ranges and dungeon/raid names |
| DungeonEncounter | 1347279 | per-dungeon boss lists |
| JournalInstance / JournalEncounter / JournalTier | 1237438 / 1240336 / 1349056 | encounter journal data |
| CreatureModelData | 1365368 | model fileDataIDs (Model section, later 3D) |
| QuestSort / QuestInfo | 1134585 / 1120960 | quest taxonomy |
| SpellCategory | 1280619 | spell categories |
| ContentTuning | 1962930 | level-scaling metadata behind group content |
| Phase / AreaGroupMember / WMOAreaTable / WorldMapOverlay / ZoneMusic | 1348558 / 1093406 / 1355528 / 1134579 / 1310254 | map and zone enrichment |

Caveat: manifest IDs are cross-product; a build that does not ship a table records it missing at extraction time (existing behavior).

## 10. Deliberately not copied

- No competitor text (guides, Q&A digests, tooltip arrays) into Everloot — citation only, per their rules and ours.
- No engagement/comment systems (moderation cost); no encrypted-content reveal tracking (policy); no simulator from recorded sessions (out of scope); no Astro/PHP rewrites (Next.js stack stands).
- wclbox's `status` vocabulary (new/rebuilt/changed/same/missing) is a published enum, fine to align with; their data itself stays theirs.

## 11. Artifacts fetched (2026-10-18, all robots-permissive)

- `wf-gg-home.html`, `wf-item.html`, `wf-about.html` — wow-forever.gg (robots: welcome; `/api/` excluded)
- `fdb-llms-full.txt`, `fdb-item.html` — foreverdb.net (robots: AI welcome; `/api/` excluded)
- `wclbox-openapi.json`, `wclbox-openapi-digest.txt` — wclbox (robots: `/api/open/` allowed)
- `wftop-home.html`, `wftop-editorial.html`, `wftop-sources.html` — wow-forever.top (robots: allow; SEO bots excluded)
- `wp-alchemy.html` — wow-professions.com (robots: allow reads)
- `tf-home.html` — talentsforever.com (robots: allow)
- Raw docs: TylerAkins/wow-database `docs/INGESTION.md` and `docs/CLIENT_EXTRACTION.md`; Jazzman1976/Forever-Hunter-Pets `docs/technik/quellen.md` (raw.githubusercontent)
- All fetched into a scratch folder on the operator's machine, not committed
