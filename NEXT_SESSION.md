# Everloot — resume after 2026-10-05 assessment

## Resume correction — 2026-10-07 continuation complete locally

**C: Event identity and replay migration IMPLEMENTED on `fix/readonly-kb-service` at `356aec7`.**
**D: Resumable batch uploads IMPLEMENTED on `fix/readonly-kb-service` at `1847c89`.**
**E: Guild authority, claim tokens, revocation, quotas, opt-out IMPLEMENTED on `fix/readonly-kb-service` at `075e872`.**

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

**Verified locally:** web `npm test` **66/66**, KB `npm test` **152/152**, KB `npm run typecheck`, web `npm run build` pass.

**Next:** F (dependency/lint repair + preview regression). Legacy-data policy review needed before C's migration is complete — historical rows have no stable IDs. Production test-data deletion remains declined. Beta cutoff 10/21, CurseForge ~10/24, launch 11/04 targets unchanged.

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
