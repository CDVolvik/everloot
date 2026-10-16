# Everloot — resume after 2026-10-05 assessment

## START HERE — 2026-10-16 close (production at `309b600`; no open PRs)

Merged on 2026-10-16 at Carlos's request, production verified after the last merge:
- #49: vendor-only reagent prices restored in `profession_path` and `recipe_thresholds`.
- #50, #51, #52: lore archive, its sharpening pass, and punctuation-normalized exact names.
- #55: lore types, facets, template repair and `/lore/coverage`.
- #54: addons hub and the Polestar pages.

Production check at `309b600`:
- 200: `/`, `/lore` (3.0 s cold), `/search?q=thrall` (4.1 s cold), `/search?q=thrall&type=npc`, `/lore/npcs`, `/lore/coverage`.
- 200: `/addons`, `/addons/polestar`, `/addons/polestar/packs`, `/addons/polestar/wanted`.
- 200: `/sitemap.xml` (lists the four addons pages), `/lore-sitemap.xml`, `/api/health`, `/api/rollups/drops`.
- `/lore/browse/npcs` → 308 to `/lore/npcs`.
- `/mcp/public` initialize 200.
- The lore browse pages say "This release predates classification." until the new release is published (by design).
- The Polestar page shows live GitHub data (Polestar v0.2.4 came out on 2026-10-16).

Program: slice 1 (lore pages) live. Slice 2 (types and coverage) is live in code; its release waits on A1
below. Slice 3 (addons hub around Polestar) live. Slice 4 (sharpening pass) is next.

### Carlos (owner steps, in priority order)

1. **In-game beta checklist for 0.2.5** (`docs/2026-10-08-beta-client-checklist.md`), unchanged: gates
   option C, the CurseForge upload (~10/24; beta closes 10/21) and the Polestar data export.
2. **Polestar outreach:** review and send `docs/2026-10-16-polestar-outreach-draft.md` (GitHub Discussion on
   `fitzforge/polestar` or the Polestar Discord). Its facts were re-checked and corrected on 2026-10-16.
3. **Optional `GITHUB_TOKEN`** in Vercel Production: a fine-grained token with read access to public
   repositories only. Without it the Polestar page's hourly refresh uses GitHub's anonymous 60 requests an
   hour per IP, which Vercel's shared egress can exhaust; a failed refresh keeps the last good page, so
   nothing breaks either way.
4. **Publish the 2026-10-16 knowledge release, only after agent task A1 lands** (it rebuilds the snapshot).
   Upload the rebuilt release and manifest to R2 under `knowledge/<name>` (create-only), set
   `EVERLOOT_KB_RELEASE_KEY=knowledge/<name>` in Vercel Production, redeploy. Check `/lore/coverage` shows
   type counts, `/lore/npcs` lists pages, `/mcp/public` initializes. If the deploy fails on function size,
   Vercel keeps the previous deployment live; see A2.
5. ChatGPT apps directory submission, MCP quota scope migration + flag, the two backup env files, officer
   grant trial, raid nights, signing/AdSense/trademark: unchanged, details in the section below.

### Agent (next session, in order)

- **A1. Facets into the manifest (blocks publishing the new release).** Serving the 2026-10-16 release
  locally: `/lore/coverage` takes 9.7 s on a cold process (six `json_each` facet scans over 260k rows) and
  `/lore/npcs` 6.2 s (per-type `DISTINCT` scans in `facetValues`); both are milliseconds once cached. Have the
  snapshot write `facets` (top ten per key) and per-type facet values into the manifest, have
  `web/src/lib/lore.ts` read them when present and keep today's queries for older manifests. Tests first.
  Then re-run only the snapshot (about 30 s) from the kept source database:
  `node ./node_modules/tsx/dist/cli.mjs src/cli.ts snapshot data/release/<date>-everloot-public.sqlite --db D:\R21-Brain\projects\everloot\kb\data\wowvault-kb-2026-10-16.sqlite`
  and re-time cold `/lore/coverage` and `/lore/npcs` with `KB_SNAPSHOT_PATH` set.
- **A2. Release size (decide at publish).** The new release is 495 MB against 338 MB live; `data` grew
  from 23 to 124 MB (infobox fields, types, facets). Whether the large-function deploy takes it is known only
  at publish. If it does not, trim infobox fields to the ones the lore page shows (it renders some) rather
  than dropping them all.
- **A3. Slice 4, sharpening pass** across lore and addons once A1 is done.
- **A4. Polestar:** re-check the Polestar Guides listing (`web/src/data/polestar.ts`, version and
  counts) when Polestar releases; the CC BY-SA data export for Polestar's `data build` waits on real
  collection (Carlos step 1).
- **Option C (`craft_result`)**, auction deposits, request-scoped `loadCorpus`: unchanged, see below.

Built artifacts kept (gitignored), `D:\R21-Brain\projects\everloot\kb\data\`:
- `release/2026-10-16-everloot-public.sqlite` + `.manifest.json`: sha256 `13eb0b3d…`, 260,572 lore pages,
  types item 104,308 / npc 72,073 / other 40,076 / quest 32,659 / spell 8,864 / zone 2,593, damaged 3,260
  (the live 2026-10-05 release measures 5,887 with the same patterns).
- `wowvault-kb-2026-10-16.sqlite`: the source database the release was built from.

## Resume — 2026-10-15 loop (superseded by the 2026-10-16 close above)

Everything agent-doable that doesn't depend on an owner step was merged and verified on
everloot.app. PRs #1–#47 merged: #44 contact page, #45 vendor reagent prices,
#46 shared corpus aggregates, #47 pre-aggregated per-tool MCP facts (all live:
health 200, `/contact` 200, `/api/rollups/drops` 200 with fresh timestamps).
Merging to `main` deploys production. Free services only.
Addon 0.2.5 is live (zip sha `3999cbd6…` matches the repo).

### Carlos (owner steps, in priority order)

1. **In-game beta checklist for 0.2.5** (`docs/2026-10-08-beta-client-checklist.md`). Nothing since
   0.2.2 has run in the Forever client: collection, auctions, gold (mail sales, postage, buyouts),
   `/ask`, recipe colours, trainers, and one route step checked orange. This gates option C and the
   CurseForge upload (~10/24; beta closes 10/21).
2. **ChatGPT apps directory:** submit `https://everloot.app/mcp/public`, auth None. It needs your
   OpenAI account, so an agent can't submit it.
3. **MCP quota scope:** run `supabase/migrations/20261010120000_mcp_quota_scope.sql` in the Everloot
   Supabase SQL editor (`uinmowrmyckklpbwzqhn`), set `EVERLOOT_MCP_QUOTA_SCOPE=mcp` in Vercel
   Production, redeploy. Check: `/mcp/public` initialize returns 200 and an `mcp_global` row appears.
4. **Backups:** create `%USERPROFILE%\.r21\everloot-backup.env` (`SUPABASE_URL`,
   `SUPABASE_SECRET_KEY`) and `everloot-r2-backup.env` (read-only R2 token). The nightly runner
   already handles both.
5. Officer grant trial (issue, use, revoke); two raid nights; three-contributor loop; real phone.
6. Signing for the companion build, AdSense with a certified consent platform, trademark check.

### Lore archive (PR #50, branch `feat/lore-archive`, 2026-10-15) — program slice 1 of 4

Carlos chose to build data and site structure before the addon push: (1) lore pages, (2) knowledge-base
growth, (3) `/guides`, (4) sharpening pass. Slice 1 is built and reviewed: `/lore`, `/search`,
`/lore/<extId>-<slug>`, `/lore-sitemap.xml` + chunks, shared `web/src/lib/release.ts`, Lore in the nav.
Spec `docs/superpowers/specs/2026-10-15-lore-archive-web-design.md`, plan
`docs/superpowers/plans/2026-10-15-lore-archive-web.md`. Web 233 + kb 221 tests, tsc clean, build green.

**Blocked on Carlos before merge:** the preview build has no knowledge release
(`[release] no knowledge release configured`), because `EVERLOOT_KB_RELEASE_KEY`, the `R2_*` variables and
`VERCEL_SUPPORT_LARGE_FUNCTIONS` are Production-only in Vercel. Every lore route on the preview answers
"Lore archive unavailable", which is the designed behaviour, but it means cold start, function size and
a real search cannot be measured on a preview. Options: add those variables to Preview scoped to the
`feat/lore-archive` branch (the #17 trial did this), or accept measuring on production after merge.
Measured locally against the real release (`next start`): lore page 2.4 s cold / 15 ms warm, search 35 ms,
`q=the` 0.31 s, sitemap chunks 2.6 s each (78,221 URLs in two files), 308 and 404 behave. A fresh review's
two Important findings are fixed in `f13b52c`; five minors are deferred (listed in the PR thread's ledger
summary: sitemap full-table count per cache miss, curated-id collisions, search re-rank paging, bad-release
re-hash per request, double lookup per lore page).

**Sharpening pass (PR #51, `feat/lore-sharpen`, stacked on #50):** the review's deferred minors fixed with tests
(count memo, bullet-first descriptions, Open Graph, stable paging, 60 s bad-release backoff, "No more results",
curated-id rule). Web 241 + kb 223 tests. Retarget to `main` after #50 merges.

**Slice 2 built (`feat/lore-types`, stacked on #51):** infobox capture, category/infobox types and facets, template
repair, browse pages (`/lore/npcs` … `/lore/spells`), search type chips, `/lore/coverage`, a sitemap chunk. Spec
`docs/superpowers/specs/2026-10-15-lore-types-and-coverage-design.md`, plan
`docs/superpowers/plans/2026-10-15-lore-types-and-coverage.md`. Against the current 2026-10-05 release the new pages
say "This release predates classification." and link to search; nothing on production changes until a new release
is published.

**Carlos: publish the new knowledge release (after the PR merges)**
1. The release and manifest are built locally at `kb/data/release/<YYYY-MM-DD>-everloot-public.sqlite(.manifest.json)`
   (see the PR for the exact name and the `types`/`damaged` numbers in its manifest).
2. Upload both to the R2 bucket the site uses under `knowledge/<name>` and `knowledge/<name>.manifest.json`
   (create-only, like the first release).
3. In Vercel Production set `EVERLOOT_KB_RELEASE_KEY=knowledge/<name>` and redeploy.
4. Check: `/lore/coverage` shows type counts; `/lore/npcs` lists pages; `/mcp/public` still initializes.
Measured on the trial and full builds: see the PR body (filled in before the PR opens).

**Slice 3 redefined (Carlos, 2026-10-16): Addons and tools hub around Polestar.** `fitzforge/polestar` (GPL-3 leveling-guide
addon with community guide packs; Carlos has a fork and merged PRs there) does not host or list packs, so Everloot adds
`/addons`, `/addons/polestar` (details, links, needs from its open issues), `/addons/polestar/packs` (an independent pack
registry on the `pack.json` fields plus coverage, PR-based listings first) and `/addons/polestar/wanted` (routes and guides
people can build). A CC BY-SA export of corroborated NPC/quest/trainer/vendor facts for Polestar's `data build` is the
follow-up once real collection runs. Outreach draft for Carlos to send: `docs/2026-10-16-polestar-outreach-draft.md`.
Guardrail: link to Polestar's GPL code and guide text, never copy it into this repo.

### Agent (next session, no owner step needed)

- **Option C (`craft_result`, yellow skill-up chance):** only after the in-game checklist
  proves the 0.2.3–0.2.5 captures in game. Design: `docs/2026-10-10-recipe-windows-design.md`.
- Auction deposits stay unrecorded: there's no `money_event` category for them. Adding one is a
  schema change, so do it only if the ledger needs it.
- Done 2026-10-15: vendor prices (#45) and corpus pre-aggregation per tool — web shared
  aggregates (#46) plus MCP per-tool fact memo (#47). Request-scoped load sharing
  (one `loadCorpus` per render instead of per answer) is the remaining optional
  follow-up; it saves duplicate store reads, not aggregations.

## Resume — 2026-10-10 fifth round: #37–#39 merged (live at `ba01307`); #40 open

Carlos approved option B from the #39 design note and the merge of #37–#39 (and Brain #353).
Production checked after the merges: health 200, `/mcp/public` 200, the recipe cost copy is live.
#38's quota scope is merged but **off**: it switches on only after Carlos applies its migration
and sets `EVERLOOT_MCP_QUOTA_SCOPE=mcp`.

| PR | Unit | Notes |
|---|---|---|
| #40 | Option B: addon 0.2.5 `trainer_seen` + orange-only steps derived from colours and trainer ranks | zip sha `3999cbd6…`; the planner takes derived steps; `TOOL_KINDS.profession_path` adds `recipe_observed`, `trainer_seen`. Not merged: new release, left for Carlos's review |

Next agent-doable units after #40: training cost in the route's gold (rows already carry
`costCopper`); then option C (`craft_result`, the yellow skill-up chance) only after the beta
checklist proves 0.2.3–0.2.5 in the Forever client.

## Resume — 2026-10-10 fourth round: #31–#35 merged and live at `1e975c8`; #37–#39 open

Merged on Carlos's say-so and verified on everloot.app: `/mcp/public` initializes with no token and
lists 14 tools (#31); recipe ranges section live (#32); auction-priced profession path (#33); tracker
rows (#34); addon 0.2.4 zip live, sha `6f031160…`, matching the repo (#35). #33's one-line
`TOOL_KINDS` conflict with #32 was resolved by keeping both.

#35 changed during review: `auction_spend` is **auction purchases** (buyouts only; plain bids can be
refunded), not deposits. Auction sales are recorded **net**: invoice `bid − consignment`, because the
letter also returns the deposit. Deposits stay unrecorded (no category).

| PR | Unit | Notes |
|---|---|---|
| #37 | Recipe ranges: reagents 3 installs agree on + estimated cost per craft | shares the path's `agreePrices`; tool reads price/auction/item kinds |
| #38 | Public MCP quota scope (`mcp_global` 5,000/h, `mcp:<ip>` 200/h) | flag-gated by `EVERLOOT_MCP_QUOTA_SCOPE=mcp`; Carlos applies the migration first. Integration-tested on local Postgres 16 |
| #39 | Design note: recipe windows and points | **Carlos picks A/B/C**; B (orange-only steps + `trainer_seen`) recommended |

Next agent-doable unit: whichever option #39 settles on. Nothing else open is agent-doable without
an owner step.

## Resume — 2026-10-09 loop, second round: PRs #14–#21 (still nothing merged or deployed)

Carlos's decisions on 10/09: the companion is a **Node/TypeScript core**, and public MCP is **option A** (a route on the existing `everloot-web` Vercel project), trialed on a preview.

| PR | Unit | Notes |
|---|---|---|
| #14 | `/api/corpus/public?kinds=`; each MCP tool fetches only its kinds | postpones the 2 MB cap; item/NPC answers still need pre-aggregation |
| #15 | Memos: public MCP hosting options, recipe capture options | docs |
| #16 | Render tests for unrecorded / empty / corroborated database pages | test-only |
| #17 | **`/mcp` route on the site deployment, preview trial passed** | cold 4.7 s, warm ~0.3 s, 13 tools, official SDK client connected. Before prod: the release must reach git builds (R2 prebuild download, needs OK), production env vars |
| #18 | Companion core: uploader (`companion/`) | smoke-tested against local dev |
| #19 | Companion `/ask` file bridge (stacked on #18) | Lua-safe answers + Adler-32, proven in real Lua 5.1; live run against the #17 preview |
| #20 | Addon `/ask` (stacked on #10 → #1) | answers show after `/reload` when the checksum verifies |
| #21 | KB search: "Who is Thrall?" → Thrall, not "Find Thrall!" | found by the live bridge run |

Trial resources to clean up after #17 review: three branch-scoped Preview env vars on `feat/mcp-vercel-route`, and the preview token in `D:\R21-Brain\_secrets\everloot\mcp-preview-token.txt`.

Stacks: #1 → #10 → #20 (addon 0.2.2) and #18 → #19 (companion). Retarget each child to `main` after its parent merges.

## Resume — 2026-10-09 autonomous loop: 12 PRs open, nothing merged or deployed

Every unit is its own PR into `main` (merging deploys everloot.app, so every merge is Carlos's). Free services only; no production data touched.

| PR | Unit | Notes |
|---|---|---|
| #1 | Addon 0.2.2: per-unit auction prices, skip bid-only, `/everloot auctions on\|off` | carries the 10/09 `_STATUS.md` cursor |
| #10 | Addon 0.2.2: quest rewards, vendor sales, flight costs | **stacked on #1**; retarget to `main` after #1 |
| #2 | KB CLI: `validate`/`snapshot` refuse a missing or empty DB; startup test wait | F20 |
| #3 | Copy: no perk / recipe-flow / routes / open opt-out / guild score claims | F09/F11/F13 |
| #4 | "Data as of" on pages and `/api/rollups/drops` | F14; touches `upload-store.ts` like #7 |
| #12 | MCP answers state data age | F14; safe before or after #4 |
| #5 | Tracker: Proven column, stale rows, missing tracks; CRLF-safe tracker test | F19; merge early, it fixes a Windows-only local test failure |
| #6 | Waitlist on the shared request quota; dead `guild-authority` / `public-rollups` removed | F04 |
| #7 | **Batched snapshot replay**: cold read 15.2 s → 54 ms at 10k records | merge early; quadratic before |
| #8 | Recovery runbook + `web/scripts/corpus-load.mts` | F14 |
| #9 | Deterministic ids in the flaky 2001-record test | CI flake |
| #11 | Calculator polite status region | F17 |

Suggested merge order: #9, #5, #7, #2, then the rest; #1 then #10 (retarget). Whichever of #4/#7 lands second may need a rebase.

After merges: add the `_STATUS.md` scope header (F19), owner/artifact/result columns in the release checklist (F15), and update the `tool.gold_ledger` tracker row for #10.

Owner-blocked: in-game beta trial with 0.2.2 (checklist now has auction and gold steps); real officer publish/revoke; Render (public MCP); AdSense + certified consent platform; backup/restore setup and rehearsal (runbook); MCP 2 MB public-corpus cap (pre-aggregated view or reviewed higher cap, about 11k synthetic records today); recipe emitter design (the trade-skill API gives difficulty colors, not the schema's skill thresholds); social preview image; real screen-reader and phone checks.

## Resume — 2026-10-08 OAuth verified (current)

Visible Sign in/Sign out controls, retryable errors, pending logout and compact accessible mobile menu are implemented at `4030303`. All 133 web tests/build pass; independent review approved; complete release-check run 37847388745 succeeded. Carlos generated a zero-duration Battle.net secret rotation. Its first Vercel replacement did not persist; corrected privately and metadata confirms update 2026-10-08 21:35:33Z. No credential value is in this handoff or a local file. Production `dpl_7z2SmKRhrPhHfYiYLXPHNy29e9oe` is Ready on everloot.app/www at this code SHA, cron intact. Actual visible Sign in with the latest secret, authenticated `/me`, signed-in open menu at 320px and visible Sign out returning `/me` anonymous passed. Earlier revoked-cookie replay passed; browser left signed out and viewport restored. Next: real beta-client collection/upload and owner/officer publication/revocation evidence; see the current status and five-track progress. The former authenticator prompt is cleared, not evidence of MFA being configured. Render remains deferred to the free-host pipeline; public MCP and other full-launch scope remain open.

## Resume — 2026-10-08 five-track work (earlier checkpoint)

Read [five-track progress](docs/2026-10-08-five-track-progress.md) first. Collection/profession/web repairs, beta zip, snapshot health and CI/image drafts are implemented and locally tested. 178 KB and 127 web tests pass, typechecks/build pass, independent review resolved consent persistence failure. GitHub $0 Actions/Packages stop-usage budgets verified. No paid upgrade/resource authorized.

Chrome handoffs: Battle.net Everloot client saved with correct callback, historical secret still requires Carlos's rotation; Vercel env page reached authenticator setup (not submitted), owner handoff requested. Render stays in the free-beta pipeline per Carlos, with no account access/resource yet. Do not assume these owner steps finished without a reply. Local MCP 512MiB/0.5CPU test initializes 13 tools, sourced knowledge/live empty item data and restart healthy with matching hash/no OOM; temporary container removed. Code `912a465` is on main/recovery and Ready production `dpl_7UUDzRjQmeKe2jkwGUtYyTADP2Dp` aliased to everloot.app/www with ten-minute cron; health, robots/llms and revised beta zip verified. Release-check CI 37813002820 succeeded on this exact code SHA. Knowledge prerelease assets uploaded and image workflow 37812526741 succeeded; `kb/render.yaml` pins the resulting digest. Verify registry pull access when provisioning later. Real client/phone/officer and remaining full-launch work stay open.

## Resume — 2026-10-07 integrated recovery

Read the current `_STATUS.md` cursor, [quota verification](docs/2026-10-07-intake-quota-verification.md) and [launch recovery](docs/2026-10-07-launch-recovery.md) first. Actual checkout `D:\R21-Brain\projects\everloot`, branch `fix/launch-recovery`. Recovery integration `74df978` and shared quotas `fe67af2` are now pushed to GitHub main and recovery; automatic main deployment `dpl_4ThhXjHzduzQ8eSsiqJePjLMEPCt` is Ready on everloot.app. Earlier documentation overstated the main push: main was still `7fd2daf` until this continuation, while the corrected code was live through CLI deployments. Corrected web, private auth/publication/quota schema and guarded corpus rebuild are deployed. Exact e2e cleanup is complete. Earlier held deployment/cleanup instructions below are historical and superseded by this thread's instruction to proceed with all necessary steps and push.

Pending owner input: the storage location of the fresh registered Battle.net OAuth client's credentials. Never paste secrets or reuse old rotated credentials. Configure Vercel privately, redeploy, then verify actual sign-in/logout. Any selected free MCP host uses only a generated service token, the immutable approved knowledge image and `EVERLOOT_PUBLIC_CORPUS_URL=https://everloot.app/api/corpus/public`; no Supabase/R2 credentials or raw uploads on that host. No public MCP deployment or real OAuth login is claimed.

Latest access and budget update (10/07): Fly login is confirmed in Chrome, but Carlos explicitly requires free services. Fly offers a [short trial](https://docs.fly.io/about/free-trial), followed by [paid hosting](https://docs.fly.io/about/pricing), so provisioning remains held. No machines or billing were enabled by the agent. The earlier planned Supabase Pro upgrade is superseded by this free-only constraint. Continue on existing services without paid upgrades; research a suitable free public MCP host separately. Fresh OAuth credentials still await their local storage location.

Final verification: 95 web tests/build; 170 KB tests/typecheck; Lua 5.1 identity/capacity; reviewed native HTTP regressions; R2 strong-ETag conditional write in production; non-root 1 GB Docker, 13 initialized tools, sourced knowledge and live sanitized gameplay read. Release hash remains `d21bb3c414db9f5f40a3146fe78d0ba3e7071eb083c59003fbf6062bd8ab41eb`. Web runtime/KB audit zero; development findings remain.

Named sharing/revocation/suppression are implemented with private operator grants and current read checks, with synthetic local evidence only. Shared quotas are now deployed (107 web tests plus real local SQL concurrency checks); contributor independence, freshness/recovery/scale, real officer policy/evidence and other assessment tracks remain. Subscription billing/enforcement and ChatGPT directory registration remain separate work. Preserve full launch scope and targets; do not revive obsolete Retail/iOS plans or E/H/I completion claims.

## Historical resume — 2026-10-07 (superseded)

**C: Event identity and replay migration IMPLEMENTED on `fix/readonly-kb-service` at `356aec7`.**
**D: Resumable batch uploads IMPLEMENTED on `fix/readonly-kb-service` at `1847c89`.**
**E: Guild authority, claim tokens, revocation, quotas, opt-out IMPLEMENTED on `fix/readonly-kb-service` at `075e872`.**
**F: Dependency/lint repair + preview regression IMPLEMENTED on `fix/readonly-kb-service` at `fde2aff`.**

**C — Event identity & replay dedup:**
- `eventId` field added to all 17 record kinds (`intake.ts`)
- Addon `core.lua`: `NextEventId()` counter in SavedVariables, `Store()` auto-attaches eventId
- Upload store: dedup by `(installId, eventId)` with conflict tombstones
  - Identical replays → one record
  - Conflicting payloads same eventId → excluded, tombstone retained
  - Snapshot carries `dedupVersion` + `conflictTombstones` for incremental/rebuild agreement
- 66 web tests (10 new dedup), 152 KB, both typechecks, web build pass
- Fixtures updated with `eventId` across test files

**D — Resumable batches:**
- Addon `core.lua`: `GetNextBatch()` / `AdvanceBatchCursor()` / `ResetBatchCursor()` with persisted cursor per kind; `/everloot batch` command
- Web `UploadClient.tsx`: chunked upload (500 records/batch), progress bar, retry on failure, sequential send with rate-limit delay
- Stays under 2000 aggregate cap per request; preserves unsent rows for exact retry progress

**E — Guild authority & sharing control:**
- `guild-authority.ts`: server-issued claim tokens (`evt_` format), validation, revocation lists (token/guild/character), opt-out/suppression
- Guild record kinds (`guild_snapshot`, `raid_lockout`, `attendance`, `loot_award`) now require valid `claimToken`
- Per-install rate limiting + shared abuse config (IP/global/bytes)
- `intake.ts`: `claimToken` schema (`evt_` prefix), `publicProfile` opt-in for roster members

**F — Dependency/lint repair + preview regression:**
- Next.js `14.2.5` → `14.2.28` (patched security advisory)
- `vitest` `3.x` → `5.0.3` (fixed path traversal CVE)
- ESLint + `@typescript-eslint` config; lint passes (warnings only)
- All 66 web tests, 152 KB tests, typechecks, build pass

**Verified locally:** web `npm test` **66/66**, KB `npm test` **152/152**, KB `npm run typecheck`, web `npm run build`, `npm run lint` pass.

**Next:** Review C/D/E/F diffs on preview; legacy-data policy review needed before C's migration is complete (historical rows have no stable IDs). Production test-data deletion remains declined. Beta cutoff 10/21, CurseForge ~10/24, launch 11/04 targets unchanged. Ready for main push after preview verification.

## Resume correction — 2026-10-06

Start from the existing clean `fix/readonly-kb-service` branch (`eaa29c8`), which already integrates A and B; do not repeat the first two implementation slices below. This session reverified 56 web tests, 152 KB tests and KB typecheck. The fixes remain local and undeployed (`origin/main` is `6accdb6`). Review their final diff and preview acceptance before release; this session did not run a new web build or browser check.

Next implementation is C's stable event identity/replay protection, after reviewing the legacy-data policy in `docs/2026-10-05-next-sprint.md`. Then resumable batches, verified guild authority/named sharing and dependency/lint repair. Public collection/enrichment/hosting still depend on the remaining trust-boundary work. No production test-data deletion, snapshot rebuild, host provisioning or main push was performed or newly authorized here. The assessment's original 20 findings are a baseline, not a claim that all remain untouched or that all are now closed.

## Objective and current state

Make the data trustworthy, then enrich it and put the knowledge server on a public host. Keep the full-launch scope already recorded; this closeout did not authorize a scope reduction or provision a new host.

Read in order: `_STATUS.md` current cursor → [`docs/2026-10-05-next-sprint.md`](docs/2026-10-05-next-sprint.md) → `docs/2026-10-05-full-assessment.md` → `docs/architecture.md` → `docs/sources/source-catalog.md` and the relevant linked spec/plan. Historical Retail/iOS plans are superseded.

The assessment and this handoff are on **`docs/assessment-handoff-2026-10-05`** in `CDVolvik/everloot`, published to GitHub at closeout. Start the next implementation branch from that branch, retaining these documents. `main` pushes deploy everloot.app; no main push in this session. GitLab is not a push target for Everloot.

## Verified preparation

- 154 existing tests, KB typecheck and web production build passed in this work block. Lint is unconfigured. Assessment F01–F20 remain open; no application fixes shipped.
- Populated source DB: `kb/data/wowvault-kb.sqlite`, **257,110 Warcraft Wiki 2023 lore rows + 1 curated row**. Explicit-path stats and provenance/FTS validation pass. That does not establish current Forever mechanics or legal clearance for new sources.
- Default CLI path is `data/everloot-kb.sqlite`, which was absent before this check and creates an empty DB. The empty diagnostic DB and its sidecars were removed; the populated DB was preserved. Do not start a server or import against the implicit default. F20 covers the durable fix.
- Prepared local, filtered snapshot: `kb/data/release/2026-10-05-everloot-public.sqlite` (**338,112,512 bytes**) plus `.manifest.json`.
- SHA-256: `d21bb3c414db9f5f40a3146fe78d0ba3e7071eb083c59003fbf6062bd8ab41eb`. Manifest counts match the populated source; snapshot export's validation/filtering completed. Independent file hash matches. Blizzard API cache is excluded by the exporter.
- Local HTTP MCP smoke test against that snapshot: bearerless POST 401; authenticated initialization/list returned **13 tools**; `search_knowledge` returned a source/licence/date-bearing answer; `profession_path` reported uploads disconnected. Ephemeral test server stopped cleanly; no persistent service was installed.
- Snapshot and source DB are gitignored local data, **not included in the GitHub documentation push**. On another machine, confirm/rebuild the approved corpus or transfer the filtered artifact through approved storage and verify its manifest/hash. Do not copy a live SQLite file while writes are active; use the snapshot exporter.

## First implementation slice — fix before collecting more player data

1. Read/review the sprint brief and its two scoped specs. Start `fix/accepted-only-web` from the documentation branch after checking ownership/uncommitted changes. Execute the linked A plan with failing tests: canonical persistence, historical web read normalization, mixed accepted identities and truthful storage failures.
2. Independently start `fix/readonly-kb-service` from the same docs branch once the checkout is clean. Execute B: explicit existing populated release, manifest/hash/publication checks and read-only service handles. The existing validator writes FTS; do not call it unchanged during serving.
3. Review the historical event-identity policy in the sprint brief before writing/executing C's dedup migration. Cover repeated files, old-plus-new, conflicting IDs, conflict replay, incremental/full rebuild agreement and web/MCP consistency. Stable IDs do not establish contributor or officer authority.
4. After deduplication, add resumable batches above 2,000 aggregate records; preserve unsent rows and exact retry progress. A normalizer's corpus must not use the per-request cap.
5. Next: verified guild claims, revocation/opt-out and explicit named sharing, shared abuse limits, and production-config fail-closed behavior. Placeholder claims must never publish.
6. Separately upgrade vulnerable web dependencies with current official advisory review, noninteractive lint/CI, tests/build and affected preview flows.

Next session's minimum outcome is two reviewable A/B patches, not all 20 findings closed. Public collection/enrichment/hosting remain gated on deduplication, verified sharing and the sanitized shared reader. Production test upload/waitlist deletion remains **declined**; do not delete or rebuild them during testing.

## Enrichment work after the trust boundary

- **Existing lore:** keep the approved 2023 dump, source dates and `lore` version. Start with coverage/search quality and useful entity extraction from that existing source; do not relabel old lore as Forever item stats.
- **Curated facts:** write original, source-linked entries from permitted evidence; record game version, source, retrieval date and licence. Test a small batch in a scratch DB and inspect search output before merging it into the live corpus.
- **Player observations:** test source attribution, loot denominator, map/distance semantics, quest/recipe/price emitters and file batching in the beta client. Obtain actual independent contributors and verified officer publication. Replays and forged identities cannot count as corroboration.
- **New feeds:** catalogue rows marked `fetch?`, unknown, pending permission or no confirmed version are candidates only. Reverify current primary terms/access and version coverage before writing an adapter. Wowhead remains link-only; wiki.gg live sync awaits permission; wago.tools and foreverdiff remain blocked. Blizzard API responses stay user-local and outside the public/ad-supported data path.
- **Coverage report:** report real agreed records by type and version, unresolved gaps, independent contributors and data age. Preserve unrecorded versus measured zero. No invented facts to fill an empty page.

Do not run a limited wiki import on the populated DB: it replaces that source's rows. Use an explicit scratch `--db` for trials.

## Server organization work after the trust boundary

Use `docs/architecture.md` as the service/data-boundary map. Keep the existing web/R2/Supabase split; add a separately supervised Node MCP service rather than moving the public site or exposing a workstation.

Before choosing/provisioning a host, verify runtime/native SQLite compatibility, persistent disk, backups/restore, region, current cost/quota and the target client's authentication requirements. Use a public filtered KB snapshot and sanitized public gameplay views; never mount raw named uploads or waitlist data to an anonymous server. Source and generated snapshots need explicit paths, build IDs and freshness checks.

Acceptance: real public HTTPS MCP client connection, appropriate auth, least-privilege data access, body/concurrency limits, source-bearing answers, the same public facts as the web, stale/unreachable status, successful restart and documented restore. Local `/health` or listing tools is not this acceptance test. Subscription sign-in and in-game `/ask`/desktop release are separate launch tracks, not automatically supplied by public MCP.

## Exact local preflight commands

Run from `D:\R21-Brain\projects\everloot\kb`. The direct Node invocation preserves `--db`; this PowerShell/npm combination swallowed it during this check.

```powershell
node ./node_modules/tsx/dist/cli.mjs src/cli.ts stats --db data/wowvault-kb.sqlite
node ./node_modules/tsx/dist/cli.mjs src/cli.ts validate --db data/wowvault-kb.sqlite
node ./node_modules/tsx/dist/cli.mjs src/cli.ts snapshot data/release/<new-dated-name>.sqlite --db data/wowvault-kb.sqlite
```

`stats`, `search`, `validate` and both `serve-mcp*` commands require an explicit `--db` and refuse
without it; they never fall back to a default path and never create a database to answer a question.
The importers keep their existing default.

Before running a local HTTP server, set `EVERLOOT_MCP_TOKEN` through the local secret mechanism; do not print/paste it or pass it on the command line. Keep uploads unset until a sanitized shared reader is implemented; pointing MCP at a random empty directory hides a missing data connection.

```powershell
node ./node_modules/tsx/dist/cli.mjs src/cli.ts serve-mcp-http --db data/release/2026-10-05-everloot-public.sqlite --port 8787
```

Both `serve-mcp` commands now accept only an approved public release: an existing file **and** its
`.manifest.json`, opened read-only and checked against that manifest (licence, notice, sha256,
registry sources only, empty `api_cache`, exact schema, zero free pages, at least one row, no active
`-wal`/`-shm`/`-journal` sidecar). A missing, empty or tampered release exits non-zero with the reason
on stderr and never opens a port. `validate` is still the documented writable diagnostic (it rebuilds
the fts5 index) and must never be pointed at a release you are serving. A bearer token is transport
auth only — it is not proof that a client such as ChatGPT can connect.

## Owner-dependent evidence before launch

Recorded beta cutoff 10/21 → in-client addon load and two raid nights. CurseForge target ~10/24 → reviewed package and metadata. Recorded launch 11/04 → signing, public MCP, companion/uploader, privacy/share controls, billing/plan confirmation and recovery evidence. Hero screenshot, officer authority, trademark and wiki permission remain owner/external inputs.

Resume prompt: **“Read NEXT_SESSION.md and docs/2026-10-05-next-sprint.md. Review and execute A's accepted-only web plan, then B's read-only KB startup plan with failing tests first. Resolve the historical replay policy before C. Do not deploy or delete production test data.”**
