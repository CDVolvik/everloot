# WoWVault as a Forever data staple — brainstorm handoff (not yet a spec)

**Date:** 2026-09-28 · **Status:** brainstorm paused mid-design, resume in a new session with
`superpowers:brainstorming` · **Owner:** Carlos
**Builds on:** `2026-09-27-forever-ai-addon-design.md` (Parts 1–4) and the finished Part 1 (`kb/`).

## Decided (Carlos, 2026-09-28)

1. **Direction: "Thottbot reborn".** A public WoW: Forever database built from our own opt-in
   addon data: drop rates, NPC spawns, quest givers, vendors, item stats. Not a Raider.IO clone.
   - Why: [forever.raider.io](https://forever.raider.io/) is already live with a launch countdown,
     and Warcraft Logs and aotc.gg/forever cover logs and the armory.
   - Rankings run on Blizzard's Profile API, which has no Forever namespace and bans monetising
     the data.
   - Player-collected data is ours to publish (CC BY-SA, AdSense OK) and cannot be scraped. This
     is the same lesson as the SWGDB note in memory.
2. **Launch goal: public at Forever launch, 2026-11-04.**
3. **Upload path at launch:** drag-and-drop upload page (`<domain>/upload`) plus an intake API. The
   packaged desktop auto-uploader follows as part of the companion.
4. **"Full build" at launch = all four:**
   - collector + upload + intake
   - public data site
   - AI in-game (`/ask` + companion, file bridge, MCP server)
   - desktop auto-uploader
5. **Carlos has Forever beta access now.** The beta closes **2026-10-21**, and no client access
   exists between then and launch.

## Proposed, awaiting Carlos's approval

### Section 1: what the collector records (launch scope)

| Record | Captured when | Fields | Site use |
|---|---|---|---|
| NPC sighting | target / mouseover | NPC id (from GUID), name, map, x/y, level, reaction | spawn maps |
| Loot | loot window | source NPC/object id, item ids + counts; each window counts as one kill | drop rates |
| Quest | quest dialog / turn-in | quest id, title, level, giver/turn-in NPC ids, rewards, map | quest pages |
| Vendor | merchant window | vendor NPC id, item ids, prices, limited stock | "sold by" |
| Item seen | tooltip / loot | item id, name, quality, stat lines shown | item pages |

- **Later:** auction scans, professions and recipes, trainers, gathering nodes.
- **Privacy:** no character or guild names, no chat, nothing about other players. A random
  install id is used only to count independent uploaders. The upload page shows its contents
  before sending.
- **Trust:**
  - A fact goes public only after enough independent installs agree (e.g. 3+ for a spawn).
  - Drop rates are shown together with their kill count.
  - Implausible data is rejected.
  - Uploads are rate-limited per install and per IP.
- **Legal:** the addon uses only the game API and writes only to its own SavedVariables (as
  Questie and Wowhead's collectors do). Check Forever's API against `Gethe/wow-ui-source`
  (branch `forever`) before building; whether Forever uses the Retail or the Classic API is
  still unknown.

### Section 2: five parallel tracks

| Track | Scope | Due |
|---|---|---|
| 1 Addon | collector (5 records), `/ask`, file bridge; Carlos tests in beta every few days | **Oct 21** |
| 2 Intake + data | upload API, validation, independent-source counting, rollups (drops/spawns/vendors) | Oct 28 |
| 3 Public site | item/NPC/quest/drop pages, lore search + **ranking fix**, upload page, privacy + attribution pages, AdSense | Nov 1 |
| 4 Companion | one desktop app: auto-uploader + AI (MCP server, 4 adapters, fallback, memory, sessions) + file bridge; signed Windows build, Mac if signing is ready | Oct 31 |
| 5 Launch ops | domain, CurseForge submission (~Oct 24, moderation lag), craft gates, Codex review, legal checks | Oct 24 → Nov 4 |

- **Stack:** Vercel (intake API + the existing Next.js `web/`) and Supabase Postgres, with the
  project's own keys.
- **Drop order if a track slips:**
  1. subscription sign-in adapters (keep API keys)
  2. Mac build
  3. vendor and quest pages
  4. AdSense
- **Cannot slip:** collector, upload, intake, core site, Windows companion.
- **Launch day reality:** lore (257k pages) is live, and the item/NPC/drop pages fill in as
  uploads arrive.

### Section 3 (not yet presented)
Testing and quality gates for each track.

## Calendar-bound items only Carlos can start

1. **Domain.** `wowvault.app` was available at $9.99 for the first year on 2026-09-27.
2. **Windows code signing.** Either a cloud signing service (~$10/mo) or an OV certificate
   ($200+/yr). Validation takes days, and R21 Media Group LLC is the likely publisher. Verify
   current pricing and requirements before paying.
3. **Apple Developer Program** ($99/yr), only if a Mac build should ship at launch.
4. **Supabase and Vercel projects** under Carlos's accounts.
5. **Blizzard trademark / fan-content rules** for an ad-supported site with "WoW" in its name.
   The agent researches these, Carlos decides.

## Resume here

1. Get Carlos's approval (or changes) on Sections 1 and 2, then present Section 3.
2. Write the approved design as a spec: amend the 9/27 design, or add a new
   `2026-09-xx-forever-data-staple-design.md`.
3. Write one implementation plan per track, start with **Track 1** (the beta deadline), and run
   the tracks in parallel with subagent-driven development.
4. Known carry-overs from Part 1 (these also appear in `_STATUS.md` and `kb/README.md`):
   - search ranking: the exact-title article must rank first, and question words must not
     block matches;
   - turn wiki item-tooltip templates (~6,300 pages) into structured `item` rows;
   - add `gameVersion`/`retrievedAt` to search hits, plus kind/version filters and
     `getEntity`/get-by-name functions.
