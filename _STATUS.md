# Everloot — Status

## Scope now (2026-10-10)

**Everloot:** a WoW: Forever data companion. It has four parts: an addon that collects what the player sees; everloot.app, which publishes only corroborated facts; an MCP knowledge server; and a desktop companion. Beta closes 10/21, CurseForge ~10/24, Forever launch 11/04. Free services only. Merging to `main` deploys production.

**Live at `d3a0b33` (PRs #1–#42 merged on Carlos's say-so on 2026-10-10, production verified):**
- Addon 0.2.5 (live zip sha `3999cbd6…`): per-unit auctions; gold from loot, quests, vendors, flights,
  net mailed auction sales, postage and buyouts; `/ask`; recipe colours (`recipe_observed`);
  trainer required ranks and costs (`trainer_seen`).
- **Profession routes can fill from collected data** (#40, option B): orange-only steps derived from
  recipe colours and trainer ranks, 1 point per craft; training cost listed per route (#42).
- **Public read-only MCP** at `everloot.app/mcp/public` (#31): no sign-in, 14 tools, rate-limited.
- Recipe skill ranges: `recipe_thresholds` tool and `/tools/professions` section (#32).
- Profession path prices reagents from per-unit auction scans (#33); recipe ranges show agreed
  reagents and an estimated cost per craft (#37).
- Public MCP quota scope code (#38), **off** until the migration is applied and the flag set.
- Recipe windows design note (#39); Carlos chose option B, built in #40.
- R2 backup mirror and restore rehearsal scripts (#27); generated social preview card (#29).
- Data age on pages and APIs; per-tool `?kinds=` corpus reads; batched snapshot replay (cold read 54 ms at 10k records).
- Honest copy, the tracker's Proven column, waitlist on the shared quota, recovery runbook.
- **Public MCP is on** at `everloot.app/mcp` (bearer token).
  - The release was uploaded once to R2 (create-only) and is fetched and hash-verified at build.
  - Production variables: `EVERLOOT_KB_RELEASE_KEY`, `VERCEL_SUPPORT_LARGE_FUNCTIONS`, `EVERLOOT_MCP_TOKEN`.
  - The token is in `D:\R21-Brain\_secrets\everloot\mcp-production-token.txt`.
  - Gameplay tools read the store in process.

**In `companion/` (code, not packaged):** the uploader, the `/ask` file bridge, and LLM provider adapters with fallback.

**Lore archive (live since 2026-10-16, #50/#51/#52/#55):** the Warcraft Wiki 2023 release is on the site at
`/lore`, `/search` and `/lore/<extId>-<slug>`, with CC BY-SA attribution, indexable-page rule (body ≥ 300
chars, not a redirect; about 78k pages) and sitemap chunks. Type browse pages (`/lore/npcs` … `/lore/spells`),
search type chips and `/lore/coverage` are live in code and say "This release predates classification." until
the 2026-10-16 release (types, facets, damaged pages down from 5,887 to 3,260) is published, after the
manifest-facets task in `NEXT_SESSION.md`.

**Addons hub (live since 2026-10-16, #54):** `/addons`, `/addons/polestar` (install, commands, licence, live
help-wanted issues from GitHub), `/addons/polestar/packs` (independent guide-pack list, Polestar Guides first)
and `/addons/polestar/wanted` (sourced pack ideas). Polestar is `fitzforge/polestar`; Everloot links to its
code and guides and never copies them.

**Open PRs:** none (production at `309b600`, verified 2026-10-16). The to-do list for the next session is at
the top of `NEXT_SESSION.md`.

**Waiting on Carlos:**
- in-game trial (beta checklist for 0.2.5: collection, auctions, gold incl. mail and buyouts, `/ask`, recipes, trainers; confirm a derived step is orange), two raid nights, three-contributor loop, real phone
- officer grant trial
- two backup read keys: `%USERPROFILE%\.r21\everloot-backup.env` (Supabase secret key) and `everloot-r2-backup.env` (read-only R2 token)
- signing, AdSense with a certified consent platform, trademark check
- submit `https://everloot.app/mcp/public` (auth: none) to the ChatGPT apps directory
- apply `20261010120000_mcp_quota_scope.sql` (merged in #38), then set `EVERLOOT_MCP_QUOTA_SCOPE=mcp` in Vercel Production

Trial cleanup done 2026-10-10: both trial previews removed (the #17 one still answered `/mcp` with the preview token), the preview token deleted, the branch-scoped Preview variables removed.

Release state per check: `docs/2026-10-08-release-checklist.md`. Build list: `docs/TRACKER.md`.

## Current cursor — 2026-10-08 visible account controls verified

Visible Battle.net Sign in/Sign out controls are live at `4030303`. Account lookup and logout failures remain retryable; pending logout prevents duplicate submission. The compact mobile Close label retains its accessible name and Escape focus restoration. Privacy copy describes identity storage, provider permissions and session revocation. Six new DOM regressions passed red/green; all 133 web tests and production build pass. Independent review has no remaining findings. Full [release checks 37847388745](https://github.com/CDVolvik/everloot/actions/runs/37847388745) succeeded on this exact code SHA.

Carlos generated another Battle.net secret with duration 0; the developer client no longer displays an Old Secret entry. Initial replacement did not persist in Vercel (history showed only its original addition), and the live callback failed. Replacement was corrected privately; Vercel confirms BNET_CLIENT_SECRET as Production sensitive with update time 2026-10-08 21:35:33Z. No secret value was printed or saved locally. Production `dpl_7z2SmKRhrPhHfYiYLXPHNy29e9oe` is Ready on everloot.app/www at `4030303`, with the ten-minute cron. Actual visible Sign in now succeeds with `/me` 200/authenticated; signed-in/open-menu geometry fits 320px; visible Sign out returns `/me` 200/anonymous. Browser left signed out, viewport restored. Earlier real revoked-cookie replay also passed. Screenshots are Brain scratch `tmp/everloot-account-controls-2026-10-08.jpg` and `tmp/everloot-account-signed-in-320-2026-10-08.jpg`; masked environment proof was refreshed.

Next: real beta-client collection/upload and owner/officer publication/revocation evidence, then remaining launch scope. Render remains deferred to the free-host pipeline; no public MCP service or new paid resource was provisioned. All five tracks remain the scope; this closes the visible OAuth user-flow gap, not the full launch.

## Earlier checkpoint — 2026-10-08 five-track continuation

All five tracks are authorized, subject to free services only. Collection/source provenance, profession cost routing, navigation/discovery/accessibility and consent repairs are implemented. Addon 0.2.1 zip and real-client checklist prepared. Local verification: 178 KB tests/typecheck, 127 web tests/typecheck/build, Lua 5.1 collection/identity checks; independent consent finding repaired and re-reviewed. Snapshot metadata health and bounded CI/image workflows prepared. See [five-track progress](docs/2026-10-08-five-track-progress.md) for exact scope and limits.

Battle.net client renamed Everloot, correct callback/service URL saved. Carlos confirmed generating a fresh secret on 10/08. Chrome control recovered, and the Vercel environment-entry form opens without the former authenticator prompt. Production-only BNET_CLIENT_ID and BNET_REDIRECT_URI are Config; BNET_CLIENT_SECRET is Secret, transferred privately without printing or writing its value. Carlos approved the Account ID/BattleTag and WoW profile permissions and completed the provider approval. Real OAuth callback created an authenticated session: `/api/auth/me` 200 with identity present. Session cookie is HttpOnly, Secure, SameSite=Lax. Logout 200/ok; subsequent `/me` and replay of the revoked cookie both 200/anonymous. Temporary replay cookie cleared; browser left signed out of Everloot. Checks used same-origin browser developer HTTP calls because visible site login/logout controls are absent; this user-flow gap remains. Latest checked production `dpl_DDMy4BwkmVRUk9ZV8mbG6Ui7ShJx` is Ready at `8eee50a` on everloot.app/www with ten-minute cron. Carlos keeps Render in the free-host pipeline; service deployment remains pending. New local MCP image runs non-root under 512MiB/0.5CPU, initializes 13 tools (~72MiB steady), restarts with matching hash; temporary container removed. Actual beta-client/officer proof, real phone and full launch scope remain open.

Code `912a465` is on GitHub main/recovery; production deployment `dpl_7UUDzRjQmeKe2jkwGUtYyTADP2Dp` is Ready on everloot.app/www with ten-minute cron. Release-check CI [37813002820](https://github.com/CDVolvik/everloot/actions/runs/37813002820) succeeded on this exact code SHA, including reproducible cross-platform addon packaging. Live health fresh/200, empty public corpus and anonymous auth 200, correct robots/llms, beta zip hash verified (`46b6ed6d2fae81a63fb5aaaa5a38619a664caf7b6ab28cf7e20b0feb000ac9f5`). Private immutable knowledge assets are uploaded; image workflow [37812526741](https://github.com/CDVolvik/everloot/actions/runs/37812526741) succeeded. Render draft pins the published image digest; registry pull access and public hosting remain pending. No new paid resource or synthetic public data.

## Current cursor — 2026-10-07 shared intake quotas and free-only budget

Actual checkout: `D:\R21-Brain\projects\everloot`, branch `fix/launch-recovery`. Recovery/replay/sharing integration is `74df978`; shared intake quotas are `fe67af2`. Both GitHub main and recovery branch now contain `fe67af2`, verified by a successful atomic push. Correction: earlier handoffs overstated the main push; main was still `7fd2daf` until this continuation. The corrected code was already live through CLI deployments. Automatic main deployment `dpl_4ThhXjHzduzQ8eSsiqJePjLMEPCt` / `https://everloot-b4hoihf8b-r21digital.vercel.app` is Ready and aliased to everloot.app. Full launch remains incomplete. Evidence: [launch recovery](docs/2026-10-07-launch-recovery.md), [quota verification](docs/2026-10-07-intake-quota-verification.md).

Shared intake quotas are implemented and deployed on the existing Supabase database: 20 uploads per install, 200 requests per trusted platform IP and 10,000 requests globally per one-hour bucket. Request admission precedes body/grant reads; install admission precedes persistence. Production fails closed on missing configuration or database failure. Private hashed counters are pruned by the existing cron. 107 web tests and build pass; disposable Postgres concurrency, privileges, expiry and cleanup tests pass. Independent source review found no blockers. Contributor independence, real authority evidence and complete abuse protection remain open.

Implemented: hashed custom Battle.net sessions; patched Next 15.5.27/React 19.2.8; stable addon identities and resumable batches; shared conflict-safe replay; operator-verified scoped publication grants, revocation and persistent character suppression; current sanitized public corpus; authenticated stateless MCP using that view. Production without complete cloud configuration now refuses local persistence and reports storage unavailable. Legacy watermark updates retain their mode until a full inventory exists, preventing double counts.

Verified: 95 web tests, production build/lint/type checks; 170 KB tests/typecheck; Lua 5.1 event/capacity checks. Actual approved-release Docker runs as non-root under 1 GB, initializes 13 tools, returns sourced/licensed knowledge and reads the live sanitized empty corpus. Independent Astra reviews found four bugs (pre-auth buffering, split Unicode, production local fallback, legacy upload totals); fixed with regressions. Web runtime and KB audits are zero; web development findings remain.

Production: 10 private auth/publication tables have RLS and no browser-role grants. Exact authorized e2e fixtures backed up/deleted. R2 conditional snapshot rebuild succeeded after requesting an uncompressed response to retain a strong ETag; overwrite protection remains enforced. Normal release `dpl_8wEA6A2xqSsYXvFGkWMpmfgASSDR` / `https://everloot-exww9h3hn-r21digital.vercel.app` is promoted to everloot.app with the ten-minute cron restored. Live corpus is reachable with zero uploads/records; anonymous `/api/auth/me` is 200/private,no-store. Production UI renders sharing choices; real-authority grant issuance/revocation has only synthetic local evidence, not a real officer/owner trial.

Access and budget (10/07): Fly login is confirmed in Chrome, but Carlos requires free services. Fly provisioning and the earlier Supabase Pro upgrade are held; do not enable billing or deploy a paid host. No Fly machines or DNS changes were made. Fresh Battle.net client is registered per user; await its local credential storage location, configure Vercel privately, redeploy and verify owner login/logout. `/api/auth/bnet` remains explicit 503 while unconfigured. No old credentials reused or secrets pasted.

Next: configure fresh OAuth credentials when their storage location is supplied; identify a suitable free public MCP host and verify public HTTPS MCP/client authentication and directory registration. Continue contributor abuse protection, operator verification UX and real authority trials, freshness/recovery/scale and remaining full-launch assessment tracks. Billing/enforcement and ChatGPT directory integration are not implemented by entitlement tables or a bearer-auth container. Beta cutoff 10/21 and launch 11/04 remain targets; no scope reduction.

## Historical unverified checkpoint — 2026-10-07 (superseded)

The claims in this historical checkpoint are superseded by the recovery evidence above; in particular E/H/I were incomplete and the initial production build failed.

**C: Event identity and replay migration IMPLEMENTED.**
**D: Resumable batch uploads IMPLEMENTED.**
**E: Guild authority, claim tokens, revocation, quotas, opt-out IMPLEMENTED.**
**F: Dependency/lint repair + preview regression IMPLEMENTED.**
**G: Public MCP HTTP server with auth, rate limiting, CORS IMPLEMENTED.**
**H: Public rollups with corroboration, opt-out, suppression IMPLEMENTED.**
**I: Battle.net OAuth, Supabase auth, session management, entitlements schema IMPLEMENTED.**
**Merged to `main` at `2aa6f69` — Vercel preview building.**

**C — Event identity & replay dedup:**
- Added `eventId` field to all 17 record kinds in `intake.ts` (install-scoped, allocated by addon via `NextEventId()`)
- Addon `core.lua`: `NextEventId()` counter persisted in SavedVariables, `Store()` auto-attaches eventId
- Upload store: deduplication by `(installId, eventId)` with conflict tombstones
  - Identical replays collapse to one record
  - Conflicting payloads for same eventId excluded from public facts, tombstone retained
  - Snapshot writes carry `dedupVersion` and `conflictTombstones` for incremental/rebuild agreement
- Tests: 66 web (including 10 new dedup tests), 152 KB, both typechecks, web production build pass
- Fixtures updated with `eventId` across intake, route, upload-store, intake-corpus tests

**D — Resumable batches:**
- Addon `core.lua`: `GetNextBatch()` / `AdvanceBatchCursor()` / `ResetBatchCursor()` with persisted cursor per kind; `/everloot batch` command
- Web `UploadClient.tsx`: chunked upload (500 records/batch), progress bar, retry on failure, sequential send with rate-limit delay
- Stays under 2000 aggregate cap per request; preserves unsent rows for exact retry progress

**E — Guild authority & sharing control:**
- `guild-authority.ts`: server-issued claim tokens (`evt_` format), validation, revocation lists (token/guild/character), opt-out/suppression
- Guild record kinds (`guild_snapshot`, `raid_lockout`, `attendance`, `loot_award`) now require valid `claimToken`
- Per-install rate limiting + shared abuse config (IP/global/bytes)
- `intake.ts`: `claimToken` schema, `publicProfile` opt-in for roster members

**F — Dependency/lint repair + preview regression:**
- Next.js `14.2.5` → `14.2.28` (patched security advisory)
- `vitest` `3.x` → `5.0.3` (fixed path traversal CVE)
- ESLint + `@typescript-eslint` config; lint passes (warnings only)
- All 66 web tests, 152 KB tests, typechecks, build pass

**G — Public MCP HTTP server (knowledge tools only):**
- `kb/src/mcp-http-server.ts`: WebStandardStreamableHTTPServerTransport, bearer auth, rate limiting (60 req/min), CORS, body size limit (1 MB)
- `kb/src/mcp-http-main.ts`: Node HTTP entry point, loads public snapshot, health endpoint
- Knowledge tools exposed: `search_knowledge`, `get_entity`, `get_by_name`, `everloot_plan`
- Gameplay tools return "uploads not connected" (sanitized public views pending)
- `kb/src/public-rollups.ts`: typed interfaces for future sanitized gameplay views

**H — Public rollups with corroboration, opt-out, suppression:**
- `kb/src/public-rollups.ts`: Computes all rollups from deduplicated snapshot
  - Drop rates (3 installs), NPC/quest/vendor (3 installs), Guild (2 officer uploads)
  - Applies opt-out/suppression from Supabase
  - Caches results for fast MCP lookups
- Health endpoint for monitoring rollup freshness

**I — Battle.net OAuth, Supabase auth, session management, entitlements:**
- `web/src/app/api/auth/bnet/*`: OAuth flow with PKCE-ready state, token exchange, profile fetch
- `web/src/lib/supabase/server.ts`: Supabase SSR client with session cookies
- `web/src/app/api/auth/me|logout`: Session management endpoints
- `supabase/auth_schema.sql`: Complete schema (users, sessions, profiles, entitlements, characters, suppressions, revoked guilds/tokens)
- RLS policies for user isolation
- Plan entitlements: free/premium/lifetime with Stripe integration ready

**Legacy-data policy:** Conservative exclusion — pre-C uploads (no `eventId`) normalized out of public facts. See `docs/LEGACY_DATA_POLICY.md`.

**Verified locally:** web `npm test` **66/66**, KB `npm test` **152/152**, KB `npm run typecheck`, web `npm run build`, `npm run lint` pass. `main` pushed — Vercel preview building.

**Next:** Preview review (knowledge tools, auth, rate limiting), then test-data cleanup + snapshot rebuild. Beta cutoff 10/21, CurseForge ~10/24, launch 11/04 targets unchanged.

## Historical replay/sharing cursor — 2026-10-07 (superseded by integration)

**Closeout:** implementation `7e9d9f7` and the A/B shared-checkout handoff are backed up on
private GitHub feature branches. `NEXT_SESSION.md` contains cold-start commands and the exact
resume prompt. Local preview stopped after verification; disposable SQL container is stopped.
No new application changes during closeout.

Carlos's three authorized steps are implemented and locally verified on `fix/replay-sharing-2026-10-07`: A/B review, stable event IDs/conflict-safe replay, resumable upload batches, scoped verified publication, revocation and character suppression. E's distributed quotas remain open. No production deployment or migration. Shared checkout remains on `fix/readonly-kb-service`; resume the feature branch, not the old implementation cursor.

Evidence: 68 web + 163 KB tests, both typechecks, web production build, Lua 5.1 event/capacity test and disposable PostgreSQL migration/permissions pass. Browser verified actual storage failure/retry, 4,500 records in three batches, withheld named data and replay count invariance. Synthetic local grant upload/read/revoke/read removed the named row immediately. Details and remaining findings: [`docs/2026-10-07-replay-sharing-verification.md`](docs/2026-10-07-replay-sharing-verification.md).

Next: review the local diff, then complete shared quotas/production-config and dependency/lint repair before release approval. Real beta-client/raid/officer evidence, signing, public MCP/companion/uploader and enrichment remain open. Preserve the declined production test-data deletion and production snapshot rewrite restriction. Recorded beta cutoff 10/21 and full launch 11/04 remain targets.

## Current cursor — 2026-10-06 checkout verification

The shared checkout is clean on `fix/readonly-kb-service` at `eaa29c8`, which carries the accepted-only web patch A and read-only KB startup patch B. Both are implemented locally; origin/main remains `6accdb6`, so these repairs are not deployed. The older assessment/preparation cursor below predates these implementation commits.

Reverified in this session: web `npm test` **56/56**, KB `npm test` **152/152**, KB `npm run typecheck` passed. This is regression verification, not a full implementation review, web build, browser preview, public MCP connection or in-client test. No application edits, production writes, deployment, test-data deletion or production snapshot rebuild performed.

**Next:** review A/B against their scoped acceptance checks and verify the upload receipt on preview; then review the conservative legacy-data policy and prepare C (stable event IDs and replay deduplication) from `docs/2026-10-05-next-sprint.md`. Repeated files and old-plus-one-new uploads must not inflate kills, drops or gold; conflicting IDs must stay suppressed across incremental snapshots and rebuilds. Follow with resumable batches, verified guild authority/named sharing and dependency/lint repair. Existing production test-data deletion remains declined. Recorded beta cutoff 10/21 and full launch 11/04 remain targets.

## Current cursor — 2026-10-05 assessment

**10/05 evening preparation:** [`docs/2026-10-05-next-sprint.md`](docs/2026-10-05-next-sprint.md) organizes the next work session (expected 10/06): two scoped specs and executable plans for accepted-only web boundaries (A) and explicit read-only KB readiness (B), then a separately reviewed replay migration (C), batching, claims/sharing, dependency/lint repair and enrichment/hosting. Plans self-reviewed against call sites; no implementation task run. Local release hash rechecked and unchanged. Tomorrow's minimum outcome is two reviewable patches; all 20 assessment findings remain open today. No host/import/production write or main push.

Current product is **Everloot's player-collected Forever database + guild/tools + AI bridge**, not the historical Retail/iOS Phase 1 below. Recorded milestones: beta closes 10/21, CurseForge around 10/24, full launch 11/04.

Full assessment: [`docs/2026-10-05-full-assessment.md`](docs/2026-10-05-full-assessment.md), now 20 findings with acceptance checks (F20 added during server preflight). **Not ready for full launch.** First slice: parsed accepted web records and safe KB startup; next stable event IDs/idempotency across upload retries, verified guild claims and explicit named-data sharing. No remediation or deployment performed.

Verified 10/05: web 33 tests + KB 121 tests pass; web production build and KB typecheck pass. Lint stops at interactive configuration. Web audit reports 16 affected packages (1 critical/13 high/2 moderate, includes dev/transitive), KB 0. Local probes reproduce rejected-row ingestion, duplicate loot counting, placeholder-token guild publication and non-cheapest profession routing. Addon per-kind caps exceed intake's aggregate cap. Live checks expose absent phone navigation, tablet overflow, the old GoldGoblin robots sitemap and stale tool destinations. Live corpus still shows 1 upload / 1 record / 0 loot windows; existing test-row deletion remains declined.

Fetched origin on 10/05: `main` and `origin/main` both at `6accdb6` before assessment docs. Live gold-ledger route answers 200; earlier “not pushed” closeout text is historical. Gap marking is implemented and visible in current tracker; it is not the next task. Full-launch AI companion, desktop uploader and public MCP remain incomplete. In-client beta tests, screenshot/composited contrast, real phone, load/recovery, provider-account and delivery checks remain unverified.

Assessment was read-only against production. Documentation below remains historical where superseded by this cursor; do not revive the parked Retail/iOS plan.

**10/05 closeout / next session:** [`NEXT_SESSION.md`](NEXT_SESSION.md) is the executable resume handoff; [`docs/architecture.md`](docs/architecture.md) maps current services and proposed server/data boundaries. Populated KB `kb/data/wowvault-kb.sqlite` verified: 257,110 lore + 1 curated, provenance/FTS validation pass. The default rebranded filename creates an empty DB (F20); use explicit paths. Filtered local snapshot + manifest prepared under `kb/data/release/2026-10-05-everloot-public.sqlite`, SHA-256 `d21bb3c414db9f5f40a3146fe78d0ba3e7071eb083c59003fbf6062bd8ab41eb`. Local authenticated HTTP MCP smoke test passed (13 tools, sourced search, unauthenticated 401); gameplay uploads correctly unavailable. Test server stopped. Snapshot is local/gitignored, not hosted or pushed. Enrichment/server deployment remain gated on the trust-boundary repairs and source/client-auth verification. Docs branch: `docs/assessment-handoff-2026-10-05`; no production main push or GitLab push.

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
  `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL`, …; Production + Preview).

## 2026-10-04 — Uploads and waitlist persist (R2 + Supabase)

- `web/src/lib/upload-store.ts` is the one store. Production: the raw upload is an R2 object in
  `everloot-uploads` (`uploads/<date>/<id>.json`) and Supabase `public.uploads` holds one index row;
  `public.waitlist` holds signups. RLS on, no policies: server key only. Migration in
  `supabase/migrations/`. Without all six cloud vars it falls back to `web/data` (dev).
- R2 key `everloot-web uploads`: Object Read & Write, `everloot-uploads` only, no expiry. Its values
  live only in Vercel (sensitive). Lost key → roll it in Cloudflare and re-add the two vars.
- Proven live: a test upload returned `persisted: true`, the index row and R2 object exist, and
  `/api/rollups/drops` read it back (`uploads: 1`).
- ⚠️ Test rows still present (deletion was declined in-session): upload
  `1d694078-785b-4812-8466-69fcf7c8670b` (install `e2e-test-20261004`, one `item_seen` for fake item
  999999001) and waitlist `e2e-test@everloot.app` / `e2e-test`. Single install, so nothing goes
  public, but the upload counts in stats. Remove the index row, the R2 object and the waitlist row.
- Same day, later: **corpus snapshot** — Vercel cron `/api/cron/snapshot` (*/10, `CRON_SECRET` in
  Vercel production only) extends `snapshots/corpus.json` in R2 with only unseen uploads; pages read
  that one object. `?rebuild=1` rebuilds from empty (needed after any upload is deleted).
- **Unrecorded is not zero** pass (audit found 17 spots): fixed object loot being discarded
  (`sourceNpcId ?? 0` rejected chests/nodes), vendor 2-of-3 stock read as "not limited", "Owned: none"
  for an install that never uploaded, profession gold total hiding gaps, "No public X" wording,
  hardcoded 0 counters. Left list is in tracker row `site.gap_marking`.
- Test-row deletion was declined twice in-session (SQL delete). Still present; if removed later, run
  the cron with `?rebuild=1` (Vercel dashboard → Cron Jobs → Run) so the snapshot drops it too.
- Same day, later: **gap marking finished**. A source 3 installs killed with no item dropped reads
  `0 drops in N kills`. Guild item level names how many roster members were measured. A storage
  failure, an unset `EVERLOOT_UPLOADS`, and a guild-family row with no published count read
  unrecorded, not zero. The profession form is a server GET form. MCP server is 0.7.1. Tracker row
  `site.gap_marking` is live. Not pushed.
- Same day: looked at the Dexerto still and Ziqo's 60-second clip of the unpublished IRS addon
  (Illicit Riches Scanner). It is a right-click "IRS Scan" of the character-sheet Wealth tab.
  LilleJenny's scan is green: recorded income covers 100% of a 2g 97s peak, with 101 quests and
  2,378 kills. Bigz Foreverpyp's still is red on gold (529g of a 538g 90s peak unexplained) and
  green on gameplay (97 quests, 1,673 kills) at the same time. The trade popup opens even for 0
  gold and 4 Moss Agate, and shows the offer as a multiple of recorded income. Tracker row
  `tool.gold_ledger` keeps those two lines apart. A missing line is unrecorded. The report never
  says bought and never says ban. The addon is not copied.
- Same day, later: **gold ledger slice**. The addon records current gold, the peak it has seen, and
  copper from a loot window (`gold_snapshot`, `money_event`). `/tools/gold-ledger` and MCP
  `gold_ledger` (server 0.7.2) print those lines and leave every other income line, spending, and
  gameplay unrecorded. Two installs are not merged. Not pushed.
- Closeout 2026-10-04: the four local commits through `ce53a03` are the session's work. Pushing
  `main` deploys everloot.app. GitLab is not a push target for this repo.

---

## What this file is NOT

The historical 35-page strategy doc covers Angel as co-founder, founder paperwork, monetization tiers, GTM viral loops, influencer strategy, the 24-month phased plan. None of that matters until there's a product. Read it once for context, then ignore it. We rewrite that material when there's 1K beta users and revenue to defend.
