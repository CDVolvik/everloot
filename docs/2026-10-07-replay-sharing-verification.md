# Replay, batching and named sharing — local verification

Carlos authorized review/preview, event identity, resumable batches and verified sharing in
the previous chat. Continued its interrupted isolated checkout on `fix/replay-sharing-2026-10-07`.
The shared checkout remains on `fix/readonly-kb-service`. No main push, production SQL,
test-row deletion, production snapshot rebuild or public hosting.

## Implemented locally

- A/B review requires complete manifest source counts (`4a56ac7`). Accepted-only ingestion and
  explicit read-only KB startup regressions pass. No source DB was recreated or imported.
- Addon 0.2.0 allocates event IDs once in SavedVariables. Capacity pauses collection with a
  warning instead of discarding retained rows. Lua execution verifies reload/reset identity.
- Shared parsed reducer: equal install/event IDs count once; conflicts leave permanent
  tombstones. Legacy rows without IDs are withheld publicly; raw files remain, with no guessed
  backfill or production rewrite. Conditional snapshot writes reject races; incremental and
  full rebuild regressions agree, including conflicting events replayed after rebuild.
- Browser batches at 2,000 rows and 600 KB. Confirmed receipts advance progress; failure retains
  the exact unsent batch. Reload/reselection safely replays. Withheld legacy/named/invalid rows
  are reported; original files remain on the player's computer.
- Operator-issued random grants require evidence, are install/realm/subject/category scoped,
  expiring, hash-stored and revocable. Explicit sharing plus current matching authority is
  required. Placeholder addon tokens confer none. Character suppression reaches cached guild
  roster/attendance/loot and character views, including future replays.
- `/api/corpus/public` returns the current authorized view with no-store caching. MCP's new
  `EVERLOOT_PUBLIC_CORPUS_URL` connects to this view; uncached schema-checked reads time out
  after 10 seconds and report unavailable, not zero. Local `EVERLOOT_UPLOADS` raw files supply
  anonymous facts only. Private local grant/upload files under `web/data/` are gitignored.

## Evidence

| Check | Result |
|---|---|
| Web `npm test` | 68 passing |
| Web `node node_modules/typescript/bin/tsc --noEmit` | Passed |
| Web `npm run build` | Passed, including new API routes |
| KB `npm test` / `npm run typecheck` | 163 passing / passed |
| `uv run --with lupa python addon/tests/event_identity.py` | Lua 5.1 passed: same-second IDs, reload, reset, retained capacity rows |
| Migration + `supabase/tests/verified_publication.sql`, disposable PostgreSQL 16 | Passed: RLS on; anon/authenticated denied; server role can issue/read/revoke/suppress |
| Browser actual storage failure then recovery | 503 retained file with retry; recovery confirmed durable success |
| Browser 4,500 anonymous + 1 named row | Three batches confirmed, 4,500 saved, named row withheld |
| Named checkbox without grant | Actionable preparation failure |
| Same file uploaded again | Corpus stayed 4,502 anonymous rows, including two sample rows |
| Synthetic grant issue/upload/public read/revoke/read | Persisted true; named rows 1 before, 0 after revocation |

The browser tested the production build at `http://localhost:3017/upload`, with no cloud
environment file. Disposable DB container stopped afterward. Inputs and screenshot are in
the brain worktree's ignored `tmp/`; bearer values were never printed. This is synthetic
authority testing, not verification of a real character or officer. R2 conditional requests
were mocked; provider rollout remains unverified. No standalone lint success is claimed.

## Private operator command

Run from `web/` only after verifying owner/officer evidence outside the software:

```powershell
node ../kb/node_modules/tsx/dist/cli.mjs ../scripts/issue-publication-grant.ts <verified-input.json> <private-output.json>
```

Input fields: `installId`, `realm`, `subjectType` (`guild`, `character`, `install`), `subject`,
`categories` (`guild`, `gear`, `gold`, `collection`), future ISO `expiresAt`, `verifiedBy`, `evidence`.
Guild grants allow guild only; character grants gear/gold only; install grants collection only.
Use private output outside git. Existing output is refused and the bearer token is not printed.
Deliver grants only through an authorized channel; this session sent none. Configured cloud
credentials select production storage, so issuance there is a separate approved action.

## Remaining work and release checks

1. E is partial: distributed quotas/contributor abuse protection remain open. Current 20
   uploads/hour is process-local; install IDs are client-provided. Large files may need later
   retries. Event IDs prevent replay inflation, not forged independent contributors.
2. F: dependency advisory repair and standalone noninteractive lint/CI gate remain pending.
3. Partial-cloud-config fallback, corruption/freshness/recovery handling and other baseline
   assessment findings remain open. No approval for existing production test-row deletion.
4. Before approved deployment: apply migration, configure the sanctioned corpus URL, verify
   grant/suppression behavior and actual provider conditional writes. Mock R2 and local SQL
   results do not prove production success. Legacy production migration/rebuild is held.
5. Real beta-client load, SavedVariables round-trip, raid nights, independent contributors,
   actual officer/owner evidence and signing/CurseForge remain unverified. Capacity warning
   still needs an archival/reset workflow after confirmed upload; game files are never cleared.
6. Full-launch companion, desktop uploader, public HTTPS MCP/client auth, supervision/restore,
   enrichment/source permissions and other assessment findings remain. No full-launch or full
   assessment completion claim. Recorded beta cutoff 10/21 and launch 11/04 remain targets.

Primary references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Next 14 route handlers](https://nextjs.org/docs/14/app/building-your-application/routing/route-handlers),
[R2 conditional operations](https://developers.cloudflare.com/r2/api/s3/extensions/),
[Webpack extension aliases](https://webpack.js.org/configuration/resolve/#resolveextensionalias).
