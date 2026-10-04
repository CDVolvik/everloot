# WoWVault — Status

**You're building this solo with Claude Code.** No co-founder, no fundraise, no marketing-org thinking until there's a product. The 35-page strategy doc exists as historical reference in `docs/`; this file is the working state.

**One-liner**: Mobile-first WoW companion. Tracks your collection, hits you with smart alerts, answers "what should I do tonight" with character-aware AI.

**Phase 1 scope (the only thing that matters right now)**:
collection tracker (mounts/pets/toys/transmog) + character profile + Battle.net OAuth + push + basic AI chat.

**Stack** (locked, no debate until something breaks):
- iOS: Swift + SwiftUI (built on MacBook Air)
- Backend: Supabase (Postgres + Auth + Edge Functions + pgvector)
- Web (public profile + share cards): Next.js + TypeScript (the `web/` folder already has a Next.js scaffold from merged GoldGoblin code)
- AI: Anthropic Claude API (Haiku batch, Sonnet chat)
- Object storage: Cloudflare R2 (when needed)
- Push: OneSignal at MVP

Deferred to post-Phase-1: Lua addon, Electron desktop, Discord bot, Android, Apple Watch, AH module, social platform, housing. Don't build them yet.

---

## Repo layout (current)

```
projects/wowvault/
├── _STATUS.md             ← this file
├── BUILD_PLAN.md          ← 12-session Phase 1 sequence
├── README.md              ← eventual GitHub repo README
├── docs/
│   ├── README.md
│   ├── WoWCollectorTracker_Architecture_and_Strategy.docx  (historical)
│   └── WoWCollectorTracker_Competitive_Matrix.xlsx         (historical)
├── ios/                   ← empty, Session 5+
│   └── README.md
├── web/                   ← Next.js (merged from GoldGoblin), Sessions 8+ add profile pages
│   ├── README.md
│   ├── package.json
│   ├── src/, public/, ...
│   └── (rebrand TODO in web/README.md)
├── supabase/              ← empty, Session 2+
│   └── README.md
├── scripts/               ← empty, Session 1+
│   └── README.md
├── addon/                 ← empty placeholder, Phase 4
│   └── README.md
└── bot/                   ← empty placeholder, Phase 3
    └── README.md
```

**Credentials**: `D:\R21-Brain\_secrets\2026-05-16-wowvault\credentials.md` (gitignored). Rotate before production use.

---

## Three unblockers before charging money

These don't block coding the MVP — they block monetization. Work them in parallel.

1. **Battle.net commercial-use ToS** — email `dev@blizzard.com`: "Building a paid third-party WoW companion app using your API. What partnership or commercial terms apply?" The dev API works under non-commercial terms; the question is whether the paid product needs a partnership.
2. **Apple Developer enrollment** ($99/yr, 2-7 day verification) — needed for TestFlight beta, can wait until you have screens to show.
3. **Credential rotation** — BNet + TSM keys were in plaintext for 14 months and re-pasted in chat. Rotate before production.

---

## Consolidation done 2026-05-16

- ✅ Folder renamed `world-of-warcraft/` → `wowvault/`
- ✅ Subfolder structure scaffolded: `docs/`, `ios/`, `web/`, `supabase/`, `scripts/`, `addon/`, `bot/` — each has a placeholder README explaining what lives there and when it gets populated
- ✅ Historical strategy `.docx` + competitive matrix `.xlsx` moved into `docs/`
- ✅ **GoldGoblin.gg merged in** as `web/` (was `projects/google-adsense-builds/`). Existing Next.js code + Gold/Hour calculator preserved. Becomes WoWVault's public web surface; profile pages get added in Session 8. Rebrand TODO list lives in `web/README.md`.
- ✅ Duplicate copy at `docs/google-adsense-builds/` deleted
- ✅ Stale `WoW Collector/` subfolder deleted (creds previously copied to `_secrets/`)
- ✅ Stale LibreOffice lockfile deleted
- ✅ Workspace `.gitignore` updated for the new path + standard ignores for node_modules / .next / Xcode build artifacts / .env files
- ⏸ **Arcane Companion** (archived Lua addon at `docs/archive/2026-05-14-ggb-snapshot/projects/wow-addons/`) — left in archive. Documented in `addon/README.md`. Could become the first published WoWVault addon in Phase 4, but no rush.

---

## Working agreement (Carlos ↔ Claude)

- **Sessions are reviewable chunks**. End each one with something working that gets committed. No 6-hour epics with no checkpoint.
- **Commit aggressively**. After every working chunk, `git commit -am "..."`. Bad AI output is recoverable when previous commit was clean.
- **Feature branches even when solo**. `git checkout -b feat/oauth`, merge to `main` when working. Clean revert points.
- **Reference the docs**. When opening a Claude Code session, drop `BUILD_PLAN.md` + the current session's target into context.
- **Test what you can**. Integration tests for the BNet API surface, snapshot tests for SwiftUI screens. Skip unit tests for trivial wrappers.

---

## 2026-09-17 — Forever companion ideas parked (do not start a second repo)

Carlos asked about an autonomous Forever farmer after the BlizzCon announcement. **Refused.** Four legal leftovers live in the brain, not as a new project:

Wiki (canonical): `wiki/projects/wowvault/2026-09-17-forever-companion-ideas.md`

- Profession math / spawn notes / zone graph → already stubbed here as `web/tools/profession-planner`. Public Forever perk lists already exist (wowforevertools.com). Only interesting as *his* characters.
- Official Lua addon that *displays* notes → already the Phase 4 SavedVariables bridge. Not a player. Wait for Forever TOC.
- Talent / BiS sheets as a public product → skip. Wowhead, Icy Veins, and several fan calcs are live as of 9/17.
- Local wiki of videos/guides he used → maybe, private ingest only.

Phase 1 is still retail collection. Do not silently retarget the MVP at Forever.

**Still refused:** unattended client, HonorBuddy/MMOminion, VPN + burner account, "play as a human."

---

## 2026-09-27 — MVP replaced: WoW: Forever AI addon

Carlos's call: the Forever AI addon **replaces** the Retail collection-tracker MVP, in this repo (no
second repo). The collection tracker is parked, not deleted. The 9/17 refusals above still stand —
the addon answers, it never plays.

Spec: `docs/superpowers/specs/2026-09-27-forever-ai-addon-design.md`. Everything above this section
describing Phase 1 scope and stack is now historical until the build plan is rewritten.

**Part 1 (knowledge base) built** on branch `feat/kb-part1`: `kb/` package — two-pass Warcraft Wiki
dump importer, curated importer, Blizzard client (local cache, Forever gated), provenance validator,
leak-proof snapshot, CLI. First build: 257,110 lore pages from the 2023 wiki dump, 1 curated entry.
wago.tools dropped (robots.txt disallows /db2) — Forever item/spell/zone data now waits for the
player collector (Part 3). Blizzard API check pending a fresh client in `kb/.env`. Next: Part 2
(MCP server) plan. Search ranking (the exact-title article must rank first) is Part 2's first task.
Merged to `main` 2026-09-27 (`b4dd702`).

## 2026-09-28 — Direction: Forever data staple, full build at launch (brainstorm paused)

Carlos's calls: WoWVault becomes a **"Thottbot reborn"** — a public Forever database built from our
own opt-in addon data (not a Raider.IO clone; forever.raider.io already exists). **Full build live
at Forever launch, 2026-11-04**: collector + upload page + intake, public data site, AI in-game
(`/ask` + companion), desktop auto-uploader. Carlos has beta access; **beta closes 2026-10-21**, so
all addon work must be tested in the client by then.

**Name (Carlos, 2026-09-28): Everloot.** Not "Thottbot" (thottbot.com still 301s to Wowhead; the
name belongs to Wowhead's parent) and no "bot" (reads as botting). **Done 2026-09-29:** `everloot.app`
bought, repo renamed `wowvault` → [`everloot`](https://github.com/CDVolvik/everloot) (old URL redirects;
local remote updated). Still open: trademark check, `everloot.gg` (optional).

**Resume:** `docs/superpowers/specs/2026-09-28-forever-data-staple-brainstorm.md` — Sections 1–2
await approval, Section 3 not yet presented; then spec → per-track plans → build. **Waiting on
Carlos (calendar-bound):** trademark check, Windows code signing, Apple Developer (Mac,
optional), Supabase + Vercel projects, fresh Blizzard client in `kb/.env`, Forever fan-wiki pick,
wiki.gg's reply (email to support@indie.io, 2026-09-27). The domain is already bought (line above).
The web build on 2026-09-29 (home, upload, drops, profession hubs, waitlist) already ran past this
pause. Read `git log` and `docs/references.md` before treating the brainstorm as the current cursor.

## 2026-09-29 — Reference sites

Carlos sent a profession sheet plus collection, database, guide, and economy sites. Filed in
`docs/references.md`. Those are page shapes, not sources to copy. US / Moon Guard / Hakoovak is
his own character, sent so two of those pages could be opened on a real name. It is not a fixture
and not the Forever beta character. `everloot.app` is on Cloudflare nameservers and did not answer
HTTP at the start of that session.

Same night: one cohesive app that offers those tools, and a bridge so a ChatGPT subscription
(connected directly) and any other MCP client pull the data from our server. Their model reasons.
Our server holds the rows. The list that must not be dropped is `docs/TRACKER.md`
(`kb/src/bridge-plan.ts`, also the `everloot_plan` tool). Local HTTP MCP is `npm run kb -- serve-mcp-http`.
A bearer token (`--token` or `EVERLOOT_MCP_TOKEN`) locks `POST /mcp`. The public HTTPS host is still unmounted.
The profession path engine and the `profession_path` MCP tool are in. A step needs 3 agreeing uploads, and gold needs 3 prices. Intake accepts `recipe_seen` and `price_seen`. The tool reads `EVERLOOT_UPLOADS` when it is set. Page: `/tools/professions`.
An item page is `/database/items/[id]`. The name and the map pin need 3 agreeing sightings. The rate is the same drop rollup the drops table uses. The `item_page` tool reads `EVERLOOT_UPLOADS` when it is set. The addon records an item name when the client already knows it, and it records saved raid lockouts. Auction scans stay off until that toggle is on.
NPC, quest, and vendor pages are `/database/npcs/[id]`, `/database/quests/[id]`, and `/database/vendors/[id]`. Each fact needs 3 agreeing installs. The tools are `npc_page`, `quest_page`, and `vendor_page`, and they read `EVERLOOT_UPLOADS`. The addon stores a merchant window when the client opens it. It does not store a quest, because the intake requires a level and the addon must not guess one.
A collection gap is `/tools/collections`. A guild board is `/tools/guild-board`. Auction history is `/tools/auctions`. Each has the same MCP tool. Collection and auction rows need 3 agreeing installs. Guild figures need 2 officer uploads. `score_v1` has no published weights, so the board does not add a single score.
The guild-family page is the public reference an in-game census cannot be. `/guilds/olympus`
cites pages that already published a number, and it does not ask for an upload. Battle.net guild
profile answers for retail and Classic Era; guessed Forever namespaces were refused on 2026-09-30.
Row `tool.guild_census` on the tracker.


## 2026-10-03 — Git deploys on, stray project gone, Supabase created

- Vercel `everloot-web` root directory was `.`, so git builds could not find the app. Now `web`.
  Production had been the 9/29 CLI build; the first git deploy (`5891fac`) put the 9/30 pages live.
  A push to `main` now deploys production.
- Deleted the stray Vercel project `web` (created 9/29, same repo, 6 builds, all failed).
- Supabase project `everloot` created: ref `uinmowrmyckklpbwzqhn`, us-east-1, free plan, in the
  Vercel-managed org (now 2 of 2 free projects). Not connected to `everloot-web` yet; intake and
  waitlist still fail soft. Plan: raw uploads to Cloudflare R2, rollups + waitlist in Supabase, Pro
  ($25/mo) before 11/04.
- Same day, later: DNS added in Cloudflare (`A @ 76.76.21.21`, `CNAME www cname.vercel-dns.com`, both
  DNS only). https://everloot.app and www answer 200 with a Let's Encrypt cert (to 2027-01-02).
  Supabase `everloot` connected to `everloot-web` in Vercel Storage (no prefix: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL`, …; Production + Preview). Next: the intake/waitlist
  adapter that writes to it (raw uploads to R2).

---

## What this file is NOT

The historical 35-page strategy doc covers Angel as co-founder, founder paperwork, monetization tiers, GTM viral loops, influencer strategy, the 24-month phased plan. None of that matters until there's a product. Read it once for context, then ignore it. We rewrite that material when there's 1K beta users and revenue to defend.
