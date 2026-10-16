# Everloot

Mobile-first WoW companion. Tracks your collection, sends smart alerts, answers character-aware questions with AI.

**Status**: in beta for WoW: Forever. This README is being rewritten for contributors.
**Phase 1 scope**: collection tracker + character profile + Battle.net OAuth + push + basic AI chat.

## Repo layout

```
everloot/
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

## Maintainers

Project status and handoff notes are kept outside this repository. Design specs and plans are in
`docs/superpowers/`, and every external source is recorded in `docs/sources/LEDGER.md`.

## Local dev setup (once Sessions 0–2 are done)

```bash
# clone
git clone git@github.com:CDVolvik/everloot.git
cd everloot

# backend
cd supabase && supabase start && supabase db reset

# web
cd ../web && pnpm install && pnpm dev

# iOS (Mac only)
open ios/Everloot.xcodeproj
```

Each surface has its own `.env.local` (gitignored). Copy from the secrets file after rotating the keys.
