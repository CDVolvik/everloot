# Launch recovery — 2026-10-07

The interrupted continuation overstated E/H/I readiness. This repair restores a working web deployment and prepares a knowledge-only MCP container. It does not close the full-launch assessment.

## Changes and reasons

- Battle.net now uses one custom session path: an opaque 32-byte cookie, only its SHA-256 hash stored in Supabase, expiry checked on reads, explicit logout revocation. Provider access tokens are used once and never saved. `/api/auth/me` returns only account fields and entitlements, with `private, no-store`.
- Eight private auth tables have RLS enabled and no browser-role grants. Server routes use the existing service-role credential. The schema is idempotent; the maintenance job refuses incompatible existing session schemas.
- Next.js is 15.5.27 with React 19.2.8 and the required async request API migration. The web runtime audit reports zero vulnerabilities; development dependencies still have findings.
- Conflict tombstones now survive object-level, cross-object, snapshot-read and incremental boundaries. Replaying a conflicting event cannot resurrect it. Legacy rows without event IDs remain excluded.
- Guild token syntax grants no authority. Named guild, gear and gold records remain private at all web read boundaries until verified sharing and persistent suppression are implemented. Raw accepted uploads remain private and recoverable.
- Public MCP uses a fresh stateless transport per request, connects it before handling, checks bearer auth/origin/quota before consuming the bounded request stream, preserves Unicode across TCP chunks, and limits concurrent requests/timeouts. Gameplay tools explicitly report disconnected.
- The container includes only the approved public SQLite release and manifest, runs as `node`, and validates the release at startup. No raw contributor data, source database, Supabase key or R2 credential goes to Fly. The immutable release survives restarts as part of the image; upgrades deploy a new image rather than an empty volume.

## Production work performed

Vercel CLI access works in scope `r21digital`, project `everloot-web`, root `web`. Sensitive provider variables are not exportable through `env pull`; maintenance ran within staged production builds, without printing credentials or introducing an administrative HTTP route.

- Initial read-only preflight stopped on missing CA trust before SQL execution. The Supabase root CA was downloaded over HTTPS from the exact URL in [Supabase's dashboard source](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json). TLS retains hostname/certificate verification. Public CA SHA-256: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.
- Successful preflight found only `uploads` and `waitlist` tables.
- Maintenance deployment `https://everloot-19zvd3rxw-r21digital.vercel.app` applied and verified eight private auth tables.
- Exact e2e upload `1d694078-785b-4812-8466-69fcf7c8670b` / install `e2e-test-20261004`, item `999999001`, and waitlist `e2e-test@everloot.app` / `e2e-test` were backed up before deletion. The object key came from the index, not a guessed date. First backup is preserved with conditional PUT at private R2 key `maintenance-backups/2026-10-07/1d694078-785b-4812-8466-69fcf7c8670b.json`.
- Deletions and rebuilt corpus were checked: zero uploads, zero records, storage reachable. This is fixture cleanup, not real-user adoption or data improvement.
- Normal web build (without maintenance) deployed and promoted: `dpl_9T7XVpPS95YwkExhj4Vmr1NGbcJ2`, `https://everloot-fo4ekgc08-r21digital.vercel.app`. The configured ten-minute snapshot cron remains in `web/vercel.json`.

## Verification

- Web: 82 tests pass and production build passes.
- KB: 158 tests pass and typecheck passes. Native HTTP test exercises unfinished unauthorized requests and a split multibyte name.
- PostgreSQL 17 container: schema applies twice; all eight tables use RLS; anon/authenticated cannot select auth data; service role can insert sessions.
- Docker image builds and starts the actual approved 338 MB release under a 1 GB limit, as non-root. `/health` is healthy with 257,110 approved 2023 lore rows and one curated row; gameplay remains disconnected.
- Independent GPT-6 Astra review found pre-auth body buffering and chunk-decoding bugs; both fixed and regression checked. Claude review could not run because its API rate limit was reached.
- Staged web checks: `/api/auth/me` → anonymous 200 with no-store; `/api/rollups/drops` → reachable empty corpus; `/api/auth/bnet` → explicit 503 pending credentials.

## Hosting and next actions

User preference: use Fly.io if account access is available. No local Fly session/CLI credential or authenticated browser account was found. Do not invent an account or claim deployment. Ready configuration: `kb/Dockerfile`, `kb/fly.toml`; proposed app `everloot-kb-mcp`, region `iad`, one shared CPU / 1 GB, always running. Verify app-name availability and organization after authentication. Run from repo root:

```powershell
docker build -f kb/Dockerfile -t everloot-mcp .
fly deploy --config kb/fly.toml
```

Set only a generated `EVERLOOT_MCP_TOKEN` privately on Fly. Set allowed origins as configuration. Verify HTTPS `/health`, unauthorized rejection and initialized MCP search/tool calls before connecting a client. No persistent volume is required for this immutable knowledge release.

User says a fresh Battle.net OAuth client is already registered with `https://everloot.app/api/auth/bnet/callback` and will provide its local storage location. Await that location, configure `BNET_CLIENT_ID` / `BNET_CLIENT_SECRET` in Vercel without printing values, redeploy, then verify a real owner sign-in and logout. Do not reuse historical credentials that required rotation. Subscription billing and enforcement are not implemented merely because entitlement tables exist.

Still required for full launch: verified guild claims/ownership, persistent opt-out/revocation, a sanitized shared gameplay service, distributed intake abuse limits, real client collection/denominator tests and remaining emitters, profession cost correctness, navigation/accessibility/discovery/consent fixes, desktop uploader and in-game companion, signing/distribution, AI-client connectivity, CI and release-owner evidence. The 10/05 assessment remains the baseline; no scope reduction is authorized by this repair.
