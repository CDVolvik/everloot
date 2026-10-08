# Launch recovery — 2026-10-07

The interrupted continuation overstated E/H/I readiness. This recovery restores the web deployment, integrates the preserved replay/sharing branch and connects a tested MCP container to the sanitized live gameplay view. It does not close the full-launch assessment or establish public MCP/client connectivity.

## Changes and reasons

- Battle.net now uses one custom session path: an opaque 32-byte cookie, only its SHA-256 hash stored in Supabase, expiry checked on reads, explicit logout revocation. Provider access tokens are used once and never saved. `/api/auth/me` returns only account fields and entitlements, with `private, no-store`.
- Eight auth tables plus two publication/suppression tables have RLS enabled and no browser-role grants. Server routes use the existing service-role credential. Migrations are idempotent; maintenance refuses incompatible existing session schemas.
- Next.js is 15.5.27 with React 19.2.8 and the required async request API migration. The web runtime audit reports zero vulnerabilities; development dependencies still have findings.
- Stable addon identities and the shared reducer retain conflicts across replay, snapshots and rebuilds. Existing pipe-delimited tombstones migrate conservatively; ambiguous identities fail closed. Legacy rows without event IDs remain excluded. Two consecutive legacy watermark updates no longer double-count historical uploads. Snapshot writes require a strong ETag; missing/weak validators and failed preconditions stop the write.
- Resumable browser batches respect both 2,000-record and 600 KB limits; only confirmed receipts advance progress. Addon capacity stops collection with a warning rather than deleting retained rows.
- Named categories default unchecked and require a matching current operator-issued grant backed by reviewed officer/owner evidence. Grants are random, hash-stored, scoped, expiring and revocable. Persistent character suppression and grant revocation are rechecked even on cached corpus reads. Placeholder addon tokens confer no authority. Raw uploads remain private; publication grants never enter the public response.
- Production with incomplete cloud configuration refuses local persistence and reports corpus unavailable instead of measured zero. Local storage remains available for development.
- Public MCP uses a fresh stateless transport per request, connects it before handling, checks bearer auth/origin/quota before consuming the bounded request stream, preserves Unicode across TCP chunks, and limits concurrent requests/timeouts. Gameplay reads the current authorized web view with no-store, a ten-second timeout and an actual two-megabyte response ceiling; failed reads report unavailable.
- The container includes only the approved public SQLite release and manifest, runs as `node`, and validates the release at startup. No raw contributor data, source database, Supabase key or R2 credential goes to Fly. The immutable release survives restarts as part of the image; upgrades deploy a new image rather than an empty volume.

## Production work performed

Vercel CLI access works in scope `r21digital`, project `everloot-web`, root `web`. Sensitive provider variables are not exportable through `env pull`; maintenance ran within staged production builds, without printing credentials or introducing an administrative HTTP route.

- Initial read-only preflight stopped on missing CA trust before SQL execution. The Supabase root CA was downloaded over HTTPS from the exact URL in [Supabase's dashboard source](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json). TLS retains hostname/certificate verification. Public CA SHA-256: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.
- Successful preflight found only `uploads` and `waitlist` tables.
- Maintenance deployment `https://everloot-19zvd3rxw-r21digital.vercel.app` applied and verified eight private auth tables.
- Exact e2e upload `1d694078-785b-4812-8466-69fcf7c8670b` / install `e2e-test-20261004`, item `999999001`, and waitlist `e2e-test@everloot.app` / `e2e-test` were backed up before deletion. The object key came from the index, not a guessed date. First backup is preserved with conditional PUT at private R2 key `maintenance-backups/2026-10-07/1d694078-785b-4812-8466-69fcf7c8670b.json`.
- Deletions and rebuilt corpus were checked: zero uploads, zero records, storage reachable. This is fixture cleanup, not real-user adoption or data improvement.
- Normal web build (without maintenance) deployed and promoted: `dpl_9T7XVpPS95YwkExhj4Vmr1NGbcJ2`, `https://everloot-fo4ekgc08-r21digital.vercel.app`. The configured ten-minute snapshot cron remains in `web/vercel.json`.
- Integrated the preserved branch `9076773` / implementation `7e9d9f7` with recovery `ea5b4a1`. Publication migration was applied and all ten private tables/RLS/browser-role grants verified. Real officer/character grant issuance was not performed.
- Two staged rebuilds stopped with R2 412 responses. GET returned a weak ETag (`W/`); requesting `Accept-Encoding: identity` returned the corresponding strong validator, and the conditional PUT succeeded. Protection was preserved, never bypassed. This matches [Cloudflare's documented ETag/compression behavior](https://developers.cloudflare.com/cache/reference/etag-headers/). Regression tests cover validator negotiation and legacy update counts.
- Successful integrated maintenance: `dpl_HPFgEZVkWtj1BUQgZv9cUydy5X7a`, `https://everloot-pojsetrpj-r21digital.vercel.app`; zero uploads/records, reachable. Final normal release: `dpl_8wEA6A2xqSsYXvFGkWMpmfgASSDR`, `https://everloot-exww9h3hn-r21digital.vercel.app`, promoted to everloot.app with `*/10` cron restored.
- Integration `74df978` was then pushed atomically to GitHub main and `fix/launch-recovery`. Automatic production deployment `dpl_388xNMg1rZPBCfg2WgfezGpZZ7R3` / `https://everloot-p2hgdi31b-r21digital.vercel.app` is Ready and aliased to everloot.app. Rechecked public corpus 200/no-store and unconfigured Battle.net 503. No GitLab push. Final local test container stopped/removed and its temporary test token deleted.

## Verification

- Web: 95 tests pass; Vercel production build, lint and type validation pass. Three nonblocking lint warnings remain.
- KB: 170 tests pass and typecheck passes. Native HTTP test exercises unfinished unauthorized requests and a split multibyte name. All 14 focused MCP checks pass after updating connection descriptions.
- Lua 5.1 event/capacity execution passes: same-second identities, reload, reset and retained rows. This is not an actual beta-client run.
- PostgreSQL 17 container: schema applies twice; all eight tables use RLS; anon/authenticated cannot select auth data; service role can insert sessions.
- Docker starts the actual approved 338 MB release as non-root under 1 GB, healthy, about 84 MiB steady memory. It initializes 13 tools, rejects unauthenticated/untrusted-origin requests, returns sourced/licensed knowledge and reads the live sanitized empty corpus. `/health` says gameplay `configured`, not a connectivity measurement. Knowledge contains 257,110 approved 2023 lore rows plus one curated row; release hash remains `d21bb3c414db9f5f40a3146fe78d0ba3e7071eb083c59003fbf6062bd8ab41eb`.
- Independent GPT-6 Astra reviews found pre-auth buffering, chunk-decoding, production local fallback and legacy snapshot double-counting; all fixed with regression evidence. Claude review could not run because its API rate limit was reached. Review does not establish real authority or full-launch readiness.
- Live web checks: `/api/corpus/public` → 200/no-store, reachable empty corpus; `/api/auth/me` → anonymous 200/private,no-store; `/api/rollups/drops` → reachable empty; `/api/auth/bnet` → explicit 503 pending credentials. Browser renders named sharing choices with no console errors; no synthetic production uploads were added.
- Historical feature-branch browser/SQL evidence (including synthetic grant/revoke/suppression) is in [replay/sharing verification](2026-10-07-replay-sharing-verification.md). Mock provider calls and synthetic authority are distinguished from the actual guarded R2 update and real owner/officer evidence.

## Hosting and next actions

Budget update (10/07): Carlos requires free services. Fly login is confirmed in Chrome, but its [trial](https://docs.fly.io/about/free-trial) is temporary and ongoing [hosting is paid](https://docs.fly.io/about/pricing). No Fly machines or billing were enabled. Fly deployment and the earlier planned Supabase Pro upgrade are held. Keep the tested Docker image for a suitable free host; `kb/fly.toml` is a historical provider draft, not the current deployment instruction. Local container verification remains available:

```powershell
docker build -f kb/Dockerfile -t everloot-mcp .
```

On the selected free host, set only a generated `EVERLOOT_MCP_TOKEN` privately. Allowed origins and `EVERLOOT_PUBLIC_CORPUS_URL=https://everloot.app/api/corpus/public` are configuration. Verify HTTPS health, unauthorized rejection, initialized search/gameplay calls and restart/restore before connecting a real client. No persistent volume is required for the immutable release. Bearer transport support does not establish ChatGPT directory authentication compatibility or submission.

User says a fresh Battle.net OAuth client is already registered with `https://everloot.app/api/auth/bnet/callback` and will provide its local storage location. Await that location, configure `BNET_CLIENT_ID` / `BNET_CLIENT_SECRET` in Vercel without printing values, redeploy, then verify a real owner sign-in and logout. Do not reuse historical credentials that required rotation. Subscription billing and enforcement are not implemented merely because entitlement tables exist.

Still required: actual officer/owner verification policy and trials, operator UX, distributed intake limits/contributor independence, snapshot freshness/scale/recovery and orphan handling, real client collection/denominator tests and missing emitters, profession cost correctness, navigation/accessibility/discovery/consent fixes, uploader/companion, signing/distribution, public hosting and AI-client authentication, directory integration, billing enforcement, CI and owner evidence. Entitlement tables do not implement paid subscriptions. The 10/05 assessment remains the baseline; no scope reduction is authorized.
