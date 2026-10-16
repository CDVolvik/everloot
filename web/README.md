# web/

Next.js 15 (App Router) + TypeScript + Tailwind. Public web surface for Everloot. Use `.env.example` for current server-side variables; the historical client-key setup below does not configure custom Battle.net sessions.

**History**: this folder started life as **GoldGoblin.gg** — a standalone Next.js project for a WoW tools site with AdSense monetization. Merged into Everloot on 2026-05-16 as the public web surface (per the "everything under one brand" decision). The existing Gold/Hour calculator stays as a public tool.

## What's already built (from GoldGoblin)

| Page | Status | Notes |
|------|--------|-------|
| `/` | Working | Landing with tool cards. Needs WoWVault rebrand. |
| `/tools/gold-per-hour` | Working | Full calculator with URL share. Keep as-is. |
| `/tools/profession-planner` | Stub | Email-capture coming-soon page. Phase 2 build. |
| `/tools/completionist` | Stub | Email-capture coming-soon page. Folds into iOS profile, but keep as web entry point. |
| `/about`, `/privacy` | Working | Rewrite for WoWVault when domain locks. |
| `sitemap.xml`, `robots.txt`, `ads.txt` | Working | AdSense approval kit — reuse. |

## What gets added in Phase 1

Planned at the start (some of it is now built):
- `/u/[character-slug]` — public character profile pages (server-rendered, OpenGraph share cards)
- Auth-aware "Sign in" header (Battle.net OAuth, same flow as iOS)
- Mobile-responsive: this is the public-share surface, mobile views drive viral acquisition

## Run locally

```bash
cd projects/everloot/web
npm install
npm run dev
# http://localhost:3000
```

## Deploy

Vercel auto-detects Next.js. Connect the GitHub repo, set env vars:

```
NEXT_PUBLIC_SITE_URL=https://everloot.app
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_ADSENSE_CLIENT=     # empty until AdSense approves
```

Older commits mention a separate GoldGoblin deploy folder. It no longer exists; this folder is the only copy.

## Rebrand TODO before first push

- [ ] Replace "GoldGoblin" references in `src/data/tools.ts` and metadata
- [ ] Swap colors/logo when WoWVault branding exists
- [ ] Update `/about` + `/privacy` for WoWVault
- [ ] Decide: keep AdSense path (Gold/Hour calc earns ads) OR drop ads (monetize purely via Premium subs on the iOS side)
