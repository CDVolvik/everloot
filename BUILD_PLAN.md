# WoWVault — Phase 1 Build Plan

**Goal**: Ship a working iOS + web MVP where Carlos can log in with Battle.net, see his mount/pet/toy collection on Volvainz, see what's missing, get a push when a weekly reset is approaching, and ask the AI "what should I farm tonight."

**Realistic timeline solo**: 8–12 weeks of focused sessions. Less if Carlos can put 15+ hrs/wk on it, more if 5 hrs/wk.

**Definition of done for Phase 1**:
- Carlos and 5–10 friends can install the app via TestFlight
- They log in with their Battle.net account
- They see their actual character data
- They get one useful push notification
- They can ask the AI one useful question

---

## Where each piece is built

| Surface | Machine | Why |
|---|---|---|
| iOS app (Swift + SwiftUI) | MacBook Air (Xcode required) | No way around it |
| Supabase backend (Edge Functions + migrations) | Either — both have Node | Mac is easier for end-to-end testing with the iOS simulator |
| Next.js web (profile pages) | Either | Windows is fine |
| Scripts (BNet ingestion, data seeding) | Either | TypeScript or Python, your call |

If you want to start tonight on Windows: do Session 0 (scaffolding the backend + web folder structure) here, then move to Mac for Session 1.

---

## The sequence

Each session is one focused chunk. Don't combine; don't skip ahead. Mark done as you go.

### Session 0 — Repo + git init ✅ DONE 2026-05-16
- [x] Folder consolidation: `world-of-warcraft/` → `wowvault/`, GoldGoblin merged into `web/`, subfolder placeholders in place
- [x] Option A chosen: standalone repo, parent workspace `.gitignore` has `/projects/wowvault/`
- [x] `.gitignore` at wowvault root (Swift, Node, Python, Supabase, scratch)
- [x] `git init -b main` + initial commit (39 files, 2149 lines)
- [x] Remote `github.com/CDVolvik/wowvault` connected, rebased on top of GitHub's initial README commit, pushed to `main`
- [ ] **Carlos**: on the Mac, clone the new repo to `~/Code/wowvault` (or `~/R21-Brain/projects/wowvault/` if you prefer to keep it inside the workspace path on Mac too). `git clone git@github.com:CDVolvik/wowvault.git` if SSH is set up, else HTTPS.

### Session 1 — Battle.net OAuth proof of concept (CLI)
**Goal**: A Node script that does the BNet OAuth flow, gets an access token, and prints Volvainz's character data as JSON. No UI, no database. Just prove the auth works and we can read the data.
- [ ] `scripts/bnet-cli.ts` — BNet OAuth (authorization-code flow with a local callback server on port 4000)
- [ ] Hit `/profile/wow/character/{realm}/{name}` for Volvainz
- [ ] Hit `/profile/wow/character/{realm}/{name}/collections/mounts` and `/pets` and `/toys` and `/transmog`
- [ ] Print the raw JSON to disk in `/scratch/volvainz.json` (gitignored)
- [ ] Commit "bnet OAuth working, raw character data in hand"

This is the single most important session. Until you've seen Volvainz's data in JSON, nothing else matters.

### Session 2 — Supabase project + schema v1
**Goal**: Database that can store users, characters, and what they own.
- [ ] Create Supabase project `wowvault-dev`
- [ ] Migration 001: tables `users` (extends auth.users), `characters`, `realms`, `collection_items` (owned mounts/pets/toys/transmog, with timestamp)
- [ ] Migration 002: reference tables `mount_library`, `pet_library`, `toy_library`, `transmog_library` (seeded later)
- [ ] Row-Level Security policies so users only see their own data
- [ ] Commit migrations + a `supabase/README.md` documenting how to run them locally
- [ ] Verify with `supabase db reset` + a couple of test inserts

### Session 3 — Static reference data seeded from wow.tools
**Goal**: Every mount, pet, and toy in the game lives in your DB. This is the "what exists" baseline.
- [ ] `scripts/seed-mounts.ts` — pull from wow.tools or static export, normalize, upsert into `mount_library`
- [ ] Same for pets, toys, transmog appearances
- [ ] Smoke test: `select count(*) from mount_library` ≥ ~700
- [ ] Commit "static reference data seeded — N mounts / M pets / K toys / J transmog"

### Session 4 — BNet → Supabase sync (server-side, scheduled)
**Goal**: When a user logs in, their character data lands in your DB. When they log in again, it refreshes.
- [ ] Supabase Edge Function `sync-character` — takes a BNet access token + character name + realm, pulls all 4 collection endpoints, writes to `collection_items` with a sync timestamp
- [ ] Tested with Volvainz's token from Session 1
- [ ] Commit "character sync working"

### Session 5 — Auth on iOS (Battle.net OAuth)
**Goal**: User taps "Sign in with Battle.net" in the iOS app, Safari opens, they auth, the app receives the token.
- [ ] `ASWebAuthenticationSession` for the OAuth flow
- [ ] Token storage in iOS Keychain (never `UserDefaults`)
- [ ] Test on simulator + your real iPhone
- [ ] Commit "iOS BNet auth working"

### Session 6 — First screen: "Missing mounts"
**Goal**: SwiftUI list. Shows every mount you don't own, with name + icon + source tag. Server-rendered diff (`mount_library` LEFT JOIN `collection_items` where owned IS NULL).
- [ ] Supabase function `get-missing-mounts(character_id)` returns the diff
- [ ] iOS view `MissingMountsView` displays it
- [ ] No fancy UI — list rows, image, name. Polish later.
- [ ] Commit "first screen lives"

This is the moment the product exists. Everything before was infrastructure; this is the feature.

### Session 7 — Character profile screen (owned mounts/pets/toys)
- [ ] Tab bar: Profile / Missing / (Settings later)
- [ ] Profile shows owned collections, sorted by recency or alphabetically
- [ ] Pull-to-refresh triggers `sync-character`
- [ ] Commit "profile screen lives"

### Session 8 — Public web profile pages (Next.js, extends existing GoldGoblin code)
**Goal**: `wowvault.app/u/volvainz` works on Twitter/Discord — server-rendered HTML with an OpenGraph share card showing mount count, recent acquisition, profile pic.

The `web/` folder already has a Next.js 14 App Router scaffold from the merged GoldGoblin project. You extend it, you don't start fresh.
- [ ] WoWVault rebrand pass (see TODO list in `web/README.md`): swap GoldGoblin name/colors/logo in `src/data/tools.ts` and the layout
- [ ] Add Next.js route `/u/[character-slug]`
- [ ] Fetches from Supabase (read-only, RLS allows public read of profile pages)
- [ ] OpenGraph meta tags with dynamic image (use `@vercel/og` or Next.js built-in)
- [ ] Add a "Sign in with Battle.net" entry in the header (auth flow shared with iOS via Supabase Auth)
- [ ] Test share preview in Discord + Twitter
- [ ] Commit "shareable profile pages live"

### Session 9 — Push notification scaffolding
- [ ] APNs cert in Apple Developer Console
- [ ] OneSignal or direct APNs — pick one. OneSignal at MVP for speed.
- [ ] Supabase function `send-push(user_id, title, body)` works end-to-end
- [ ] Test: trigger from a SQL editor, get push on phone
- [ ] Commit "push infra works"

### Session 10 — First real push: weekly reset reminder
- [ ] Edge Function runs on a Supabase cron (Tuesday 06:00 UTC each week, server time)
- [ ] For every user, check vault progress (M+ runs this week / 9) and queue a push if < 4 with reset < 6hr away
- [ ] Skip if user has push disabled
- [ ] Commit "first real alert lives"

### Session 11 — Basic AI chat
**Goal**: A chat screen where the system prompt includes the user's current character JSON, so the AI can answer "what should I farm tonight" with real context.
- [ ] iOS view `AIChatView` — simple message list + input
- [ ] Supabase function `chat-with-ai(user_id, message, conversation_id)` calls Anthropic API with character context as system prompt
- [ ] Free tier: rate limit 10 messages/day per user (Postgres counter)
- [ ] Commit "AI chat lives"

### Session 12 — TestFlight cut
- [ ] App icon (placeholder OK — solid color + "WV" letters fine for MVP)
- [ ] Privacy policy + terms (Termly generates these in 5 min)
- [ ] App Store Connect listing (private, internal testers only)
- [ ] Upload build, invite 5–10 friends
- [ ] Commit "TF1 shipped"

---

## Cuts to take when behind schedule

If you're at week 8 and only 6 sessions deep, drop in this order:
1. **Drop Session 11 (AI chat)** — the collection tracker alone justifies a TF1. AI chat becomes "Phase 1.5."
2. **Drop Session 10 (real push)** — having the push infra (Session 9) is enough for TF1. Real alerts later.
3. **Drop Session 8 (public web)** — share via screenshot instead, build the web in Phase 2.

What you **don't** drop: Sessions 1, 2, 4, 5, 6, 7, 12. That's the irreducible product.

---

## Conventions

- **Branches**: `feat/bnet-oauth`, `feat/missing-mounts`, etc. Merge to `main` when working.
- **Migrations**: never edit a migration after it's been pulled to another machine. Always create a new one.
- **Secrets**: `.env.local` per surface (`ios/.env.local` for build-time iOS vars, `supabase/.env.local`, `web/.env.local`). Never commit. Source of truth is `D:\R21-Brain\_secrets\2026-05-16-wowvault\credentials.md` until rotated.
- **Sessions log**: keep a one-liner in this file under "Done" as each session closes. Acts as a build journal.

---

## Done

- **2026-05-16 — Session 0**: scattered WoW workstreams consolidated into `projects/wowvault/`, GoldGoblin merged in at `web/`, standalone git repo created and pushed to `github.com/CDVolvik/wowvault`. Mac clone is the only step left at the organizational layer before Session 1.

---

## When to come back to the big strategy doc

When Phase 1 is shipped to TestFlight and you're starting Phase 2 (social feed + AH module + Premium tier). At that point reread the `.docx` for the GTM viral loops + monetization architecture and we redo a new BUILD_PLAN for Phase 2. Until then it's noise.
