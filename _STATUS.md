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

## What this file is NOT

The historical 35-page strategy doc covers Angel as co-founder, founder paperwork, monetization tiers, GTM viral loops, influencer strategy, the 24-month phased plan. None of that matters until there's a product. Read it once for context, then ignore it. We rewrite that material when there's 1K beta users and revenue to defend.
