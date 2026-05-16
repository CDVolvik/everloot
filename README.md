# WoWVault

Mobile-first WoW companion. Tracks your collection, sends smart alerts, answers character-aware questions with AI.

**Status**: pre-MVP. Folder structure consolidated 2026-05-16, code scaffolding pending (`BUILD_PLAN.md` Session 0).
**Phase 1 scope**: collection tracker + character profile + Battle.net OAuth + push + basic AI chat.

## Repo layout

```
wowvault/
├── _STATUS.md            Working state — read this first
├── BUILD_PLAN.md         Session-by-session build sequence (Phase 1)
├── README.md             This file
├── docs/                 Historical strategy + future architecture.md
├── ios/                  Swift + SwiftUI iOS app (Sessions 5+)
├── web/                  Next.js public surface (merged from GoldGoblin; Sessions 8+ add profile pages)
├── supabase/             Postgres + Edge Functions (Sessions 2+)
├── scripts/              BNet CLI tools, data seeders (Sessions 1+)
├── addon/                Future Lua in-game addon (Phase 4)
└── bot/                  Future Discord bot (Phase 3)
```

Each subfolder has its own `README.md` explaining what lives there and when it gets populated.

## Stack

- **iOS**: Swift + SwiftUI (MacBook Air with Xcode)
- **Backend**: Supabase (Postgres + Auth + Edge Functions + pgvector)
- **Web**: Next.js + TypeScript + Tailwind
- **AI**: Anthropic Claude API (Haiku for batch, Sonnet for chat)
- **Push**: OneSignal at MVP

## Reading order

1. `_STATUS.md` — what state we're in
2. `BUILD_PLAN.md` — what session we're working on next
3. The specific session's task in BUILD_PLAN → start coding

The 35-page strategy doc and competitive matrix in `docs/` are historical reference, not load-bearing. Don't drag them into every session.

## Local dev setup (once Sessions 0–2 are done)

```bash
# clone
git clone git@github.com:CDVolvik/wowvault.git
cd wowvault

# backend
cd supabase && supabase start && supabase db reset

# web
cd ../web && pnpm install && pnpm dev

# iOS (Mac only)
open ios/WoWVault.xcodeproj
```

Each surface has its own `.env.local` (gitignored). Copy from the secrets file after rotating the keys.
