# Warcraft Tavern and Raider.IO Forever — competitor analysis

**Research date:** 2026-10-18  
**Scope:** public pages and official documentation only; no bulk crawl or data import.  
**Question:** what these products cover, how users navigate and contribute, what freshness signals they expose, and where an open-source Everloot can differentiate.

## Executive view

Warcraft Tavern is the stronger **editorial discovery layer**: a structured Forever hub, guide taxonomy, talent calculator, news stream, forum/community links, and frequent beta news. Its product is human-authored content and navigation, not a public player-data platform.

Raider.IO is the stronger **identity/progression platform in principle**: profiles, guilds, rankings/search, recruitment, addon/desktop distribution, and a documented API. The Forever property is currently visibly pre-launch: the public home page is a countdown/landing page, `/search` exposes an advanced character/guild search shell with no matches, `/guilds` returns an invalid-query error, and the Forever metadata currently has empty raids, dungeons, and arenas arrays. That is a launch-stage opportunity, not evidence that the underlying Raider.IO product will remain empty.

Everloot should not try to beat Tavern at general guides or Raider.IO at a closed ranking network. Its defensible lane is an **open, provenance-first Forever data commons**: player-observed facts collected through the addon, explicit game-file-vs-in-play labels, build and observation timestamps, transparent confidence thresholds, reusable CC BY-SA data, and an AGPL addon/site/MCP workflow that turns each observation into useful in-game and web tools.

## Source inventory

Primary public pages checked:

- Warcraft Tavern Forever hub: <https://www.warcrafttavern.com/forever/>
- Tavern Forever guides index: <https://www.warcrafttavern.com/forever/guides>
- Tavern Forever news index: <https://www.warcrafttavern.com/forever/news>
- Tavern Forever talent calculator: <https://www.warcrafttavern.com/forever/tools/talent-calculator>
- Tavern About/history/team: <https://www.warcrafttavern.com/about/>
- Tavern community/forum: <https://www.warcrafttavern.com/community/>
- Tavern community guidelines: <https://www.warcrafttavern.com/community-guidelines/>
- Tavern terms: <https://www.warcrafttavern.com/terms-of-use/>
- Raider.IO Forever landing: <https://forever.raider.io/>
- Raider.IO Forever search: <https://forever.raider.io/search>
- Raider.IO Forever guild directory route: <https://forever.raider.io/guilds>
- Raider.IO Forever public metadata loaded by the site: <https://cdn-forever.raiderio.net/assets/data/siteMeta-8b6029681bbd02d7c84905ca5263b8a0.json>
- Raider.IO API docs: <https://raider.io/api>
- Raider.IO machine-readable OpenAPI: <https://raider.io/openapi.json>
- Raider.IO addon source/docs: <https://github.com/RaiderIO/raiderio-addon>
- Raider.IO support home: <https://support.raider.io/>
- Raider.IO “What is Raider.IO?”: <https://support.raider.io/kb/general/what-is-raider-dot-io>
- Raider.IO addon freshness explanation: <https://support.raider.io/kb/raider-dot-io-mythic-plus-addon/why-is-this-addon-updated-so-frequently>
- Raider.IO client installation/features: <https://support.raider.io/kb/raider-dot-io-mythic-plus-addon/how-do-i-install-the-raiderio-client>

## 1. Coverage and navigation

### Warcraft Tavern — facts

- The Forever hub presents a countdown to **November 4, 2026**, a large Forever landing section, and icon-led links into a talent calculator and guide categories.
- Hub categories observed: beta/level caps, classes/specs/roles, races, race/class combinations, racial abilities, dungeons, cozy sleeping bag, raids, professions, stats/attributes, legacy system, camping, library books, transmog/appearances, and weapon-skill trainers.
- The guides index is a conventional editorial catalogue with featured cards and short descriptions. Concrete examples include class guides, leveling guides, dungeon overviews, dungeon quests, professions, class trainers, and fishing.
- The news index is chronological/editorial. On the checked page it showed entries dated October 8–16, 2026, including class changes, subscription rewards, PvP, dungeons, RMT enforcement, beta stress testing, and mysteries/legacy content.
- Footer navigation links to the broader Tavern network, community forums, Discord, YouTube, and a blue-post tracker. The forum is branded Barrens Chat and advertises profiles, avatars, race/class, levels, likes, forums, news, and tools.
- The About page says the project began as a 2017/2018 passion project and has grown into thousands of guides, news posts, and tools, with administrators, editors, and authors.

### Raider.IO Forever — facts

- The landing page exposes a product switcher for Retail, Forever, Classic Era, and Mists; a launch countdown; login/sign-up; policies; and a “Live Now!” count. It does not currently expose a full Forever navigation tree on the landing page.
- `/search` redirects to an advanced-search view with **Characters** and **Guilds** tabs and filters including location, level, class, character, guild, talents, and item level. In the checked logged-out state it showed “No matches found” and a loading/no-results state.
- `/guilds` loaded the shared application shell but displayed **“Something Went Wrong — Error: Invalid request query input”** without a query.
- The public Forever metadata currently enumerates 10 races (including High Order Skyborne and Windshaper Skyborne), 9 classes, and 9 specs. It currently reports `raids: []`, `dungeons: []`, and `arenas: []`; recruitment tags are present, including family-friendly, mature, inclusive, role-playing, pet collector, mount collector, achievement hunter, casual/midcore/hardcore, leadership experience, and PvP tags.
- The shared Raider.IO product documentation describes character profiles, guild profiles, raid progression, Mythic+ scores/runs, rankings, recruitment, and advanced search. The Forever shell appears designed to reuse that ecosystem, but its checked public data is not yet populated for raid/dungeon/arena entities.

### Inferences / implications

- Tavern is optimized for **browse → read → use a tool → join community**. Its category pages are a strong SEO/editorial funnel but not a queryable fact graph.
- Raider.IO is optimized for **search a person/guild → inspect measurable progression → use the addon/client to carry a compact snapshot in-game**. Forever is currently a platform-in-waiting, so its launch timing creates a short window for Everloot to establish the open data substrate before profiles and rankings become the default.
- Tavern's broad Classic network gives it distribution and editorial velocity; Raider.IO's shared infrastructure gives it identity and ranking-network advantages. Neither checked Forever surface visibly offers a transparent, open observation ledger.

## 2. Content and data products

### Warcraft Tavern — facts

- Content products are guides, news, blue-post tracking, a talent calculator, and community/forum tooling.
- The Forever hub includes practical structured guide topics such as dungeons, professions, class/race combinations, stats, trainers, and special systems. The individual pages are primarily human-written prose with images and internal links.
- The talent-calculator page is a tool entry point; the extracted public text did not expose a machine-readable data contract or downloadable Forever dataset.
- Tavern’s Terms say the materials are protected by copyright; the use-license section is terse in the extracted rendering, while the site’s research record and terms page state the site is for personal, non-commercial transitory viewing and prohibit copying, public display, and mirroring. Treat it as a link/reference competitor, not a source to reproduce.

### Raider.IO — facts

- Raider.IO’s official API page links both `/swagger.json` and `/openapi.json` and documents a machine-readable OpenAPI 3.0 specification.
- API categories include character, guild, raiding, Mythic+, and live tracking. The documented products include character/guild profiles, rankings, progression, boss kills, runs, score tiers, season cutoffs, raid compositions, loot feeds, pull tracking, gear/loadout snapshots, and activity contributions.
- The API documentation says data comes from Blizzard’s API, Raider.IO live tracking, and community contributions; it also disclaims completeness, accuracy, and timeliness.
- Official API rules require attribution, prohibit building competing services/reselling data, prohibit scraping outside published endpoints, and reserve access revocation. This matters directly to Everloot: do not use Raider.IO’s API as an Everloot data source or imitate its data dump.
- The RaiderIO addon repository is publicly readable on GitHub but is not open source — its LICENSE reserves all rights — and it documents the addon as a snapshot viewer for scores/progression/recruitment. Its README says qualifying data is selected by rules such as recent login/activity and score/progression thresholds, and that the addon is updated multiple times daily. It also documents a developer-facing Lua API, but says some APIs may be removed.

### Inferences / implications

- Tavern’s advantage is **interpretation and editorial packaging**. Raider.IO’s advantage is **normalized entities, identity, scoring, and distribution into the game**.
- Everloot can occupy the missing middle: structured item/NPC/quest/recipe/drop/spawn/auction observations that are queryable like a database but retain raw evidence and uncertainty rather than collapsing everything into a proprietary score.

## 3. Contribution model

### Warcraft Tavern — facts

- The About page identifies administrators, editors, and authors and describes “dozens of team members”; this is an editorial production model.
- Community contribution is primarily participation through comments/forums/Discord and feedback channels. The guidelines apply to comments, usernames, avatars, and posts; they prohibit harassment, hate speech, PII, illegal/unethical content, spam, and unsolicited self-promotion.
- No checked Tavern Forever page exposed a public schema, pull-request workflow, open data license, or anonymous observation-upload mechanism.

### Raider.IO — facts

- Raider.IO’s API description explicitly identifies community contributions as one input, alongside Blizzard API and live tracking.
- Its addon/client model is opt-in operational contribution: the desktop app powers automatic character scanning and other features; the addon carries snapshots and the client/app keeps data synchronized.
- Recruitment profiles are user-created and can be public; the support site documents character and guild recruitment workflows, profile selection, privacy, and update behavior.
- Guild/character data can have privacy controls. The API schema includes guild privacy fields for raid pulls, percentages, compositions, and share-until dates.

### Inferences / implications

- Tavern asks contributors to become writers/community members; Raider.IO asks contributors to become profiled players, guilds, recruiters, or app users.
- Everloot’s open-source differentiator should make contribution **small, inspectable, and useful to the contributor immediately**: the addon observes a drop or tooltip, previews it, lets the player upload, then returns better local search, prices, routes, or completion data.

## 4. Freshness signals

### Warcraft Tavern — facts

- The Forever hub displays the launch countdown and recent guide/news cards.
- News cards expose dates and authors; the checked page showed a dense run of October 2026 posts, which is a clear editorial recency signal.
- Tavern’s Terms expressly say it does not warrant that materials are accurate, complete, or current, may change materials without notice, and makes no commitment to update.
- No checked guide page exposed a structured build ID, observation timestamp, confidence score, or “verified in game” field in the extracted content.

### Raider.IO — facts

- The Forever landing page exposes a version string (`v2.0.39` plus a build hash) and a live-user/count signal in the rendered footer/hero.
- Raider.IO support says the addon must be updated every night with freshly extracted data; its addon README says the latest scores/top runs are updated multiple times each day and recommends the desktop client for automatic updates.
- Raider.IO’s API documentation says Blizzard-sourced profile/ranking data is updated periodically and live-tracking data is real-time when the app uploads combat logs.
- The Forever metadata includes a spec build stamp (`1.60.1.70009`) for the enumerated specs.

### Inferences / implications

- Tavern’s freshness is **human/editorial**: dates, authors, and post cadence. Raider.IO’s is **pipeline/software**: version/build, periodic API updates, nightly snapshots, and live-tracking paths.
- Everloot can make freshness more granular and auditable than either: `observed_at`, `first_seen`, `last_seen`, game build, addon version, number of distinct reporters, evidence type, and a visible stale-after policy on every data page.

## 5. Community features

### Warcraft Tavern — facts

- Barrens Chat provides forums, user profiles, avatars, race/class identity, level-ups, likes, latest topics, and a search box.
- Tavern links Discord, YouTube, forums, and a blue-post tracker; its Discord page documents a bot that tracks Blue Posts by game version and region with `/track` and `/untrack` commands.
- The guidelines provide centralized moderation rules and enforcement (editing/deleting comments and possible bans).

### Raider.IO — facts

- Raider.IO provides character and guild profiles, recruitment profiles, guild/team discovery, advanced search, Discord support, and an addon tooltip that exposes relevant data in-game.
- Its addon supports copying Raider.IO URLs, group search, in-game search, main/alt relationships, and recruitment display. The support site has dedicated categories for recruitment, guilds, privacy, account linking, addon/client, and API discussions.
- The API and schema expose privacy settings and user-controlled profile visibility in parts of the system.

### Inferences / implications

- Tavern’s community is conversation/editorial-community-first; Raider.IO’s is identity/recruitment/performance-network-first.
- Everloot should avoid manufacturing a generic forum. A better open-source community loop is **evidence discussion attached to data**: report disagreement, attach a screenshot/tooltip context locally or via a privacy-safe hash, vote “seen in game,” and preserve revision history without turning players into a public popularity leaderboard.

## 6. Gaps and opportunities for Everloot

These are strategic inferences, not claims that either competitor promised to implement them.

1. **Transparent observation ledger.** Show the anonymized observation count, distinct reporter threshold, first/last seen dates, build, and evidence type behind each item/drop/recipe/spawn/price claim.
2. **Forever-native economy.** Neither checked Forever surface presents a visible public player-scan auction history. Everloot can own the clean-room loop: addon scan → server aggregate → companion/in-game query → market page. Keep raw scans private and publish only thresholded aggregates.
3. **Evidence-aware facts.** Separate “found in game files, unconfirmed” from “observed in play,” and show when the two converge. This is especially important because Forever hides some item details until drops and has no public PTR.
4. **Build diff and launch churn.** Publish reviewed build changes with build stamps, spoiler controls, and a human-readable diff. Tavern can explain changes; Everloot can make the underlying structured change set reusable.
5. **Open data and open tooling.** Offer CC BY-SA data, AGPL code, bulk/API/MCP access with attribution, schemas, fixtures, and reproducible aggregation code. This is a direct differentiator from editorial pages and Raider.IO’s API non-compete terms.
6. **Addon-first contribution UX.** Make one observation useful immediately: personal drop history, vendor/recipe lookup, tooltip capture, local completion, price context, and optional upload preview. No account should be required for local use; public upload should be explicit.
7. **Confidence and disagreement tools.** Do not present a single authoritative row when the game is changing. Show competing observations, report counts, outliers, build boundaries, and “needs confirmation” queues.
8. **Neutral community utility rather than score gatekeeping.** Provide raid/group preparation, loot history, recipe/reagent relationships, guild officer uploads, and shareable evidence pages without a single opaque player score. If leaderboards are added, make methodology and source records public.
9. **Interoperability.** Stable JSON schemas, downloadable snapshots, MCP tools, webhooks/feeds for build and market changes, and import/export formats let guild tools and addons build on Everloot without Everloot becoming the only client.
10. **Privacy by design.** Preserve the useful parts of Raider.IO’s opt-in/privacy model but go further for anonymous observations: no character names/install IDs in public rows, explicit officer consent for guild data, private named collections, deletion/rebuild semantics, and clear retention rules.

## Recommended Everloot positioning

> **Everloot is the open, evidence-backed data layer for WoW: Forever: player-observed facts and clean-room game-file facts, versioned by build, confidence, and provenance, usable in the addon, on the web, through APIs, and by AI assistants.**

Lead with three launch differentiators:

- **“Know what is real.”** Every claim says whether it came from game files or live play and how many independent reports support it.
- **“See the economy no closed service owns.”** Community auction scans become thresholded, privacy-safe price history and market context.
- **“Build on it.”** Public schemas, reproducible aggregation, CC BY-SA data, AGPL code, bulk downloads/MCP, and no copied Tavern/Raider.IO rows or guides.

## Limits and cautions

- This was a small public-page inspection, not an exhaustive feature inventory. Raider.IO Forever is pre-launch and its data will change after November 4, 2026.
- “No matches,” empty metadata arrays, and the guild-directory error are observations of the checked public state, not proof that Raider.IO has no backend or that those features will not ship.
- Do not scrape or import Tavern or Raider.IO data. Tavern’s terms prohibit copying/mirroring; Raider.IO’s API rules prohibit competing services and scraping beyond published endpoints. Use only public pages for competitor understanding and build Everloot from its own addon observations, permitted game-file facts, and clearly licensed sources.
