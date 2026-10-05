# Everloot — resume after 2026-10-05 assessment

## Objective and current state

Make the data trustworthy, then enrich it and put the knowledge server on a public host. Keep the full-launch scope already recorded; this closeout did not authorize a scope reduction or provision a new host.

Read in order: `_STATUS.md` current cursor → `docs/2026-10-05-full-assessment.md` → `docs/architecture.md` → `docs/sources/source-catalog.md` and only the relevant specs. Historical Retail/iOS plans are superseded.

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

1. Create `fix/intake-trust-boundary` from the documentation branch, after checking checkout ownership and uncommitted changes.
2. Write failing boundary tests: mixed valid/invalid payload, unknown fields, repeated whole-file upload, old-plus-one-new event, mixed install IDs, partial persistence/retry, and 2,001+ multi-kind rows.
3. Implement parsed-accepted-record-only persistence and stable event identity/deduplication across intake, snapshot/rebuild and rollups. Rejected/raw submissions must not become public facts.
4. Add resumable batches; align the addon's per-kind cap with intake's aggregate cap. Preserve unsent records and show real persistence failure as a retryable failure.
5. Next slice: verified guild claims, revocation/opt-out and explicit sharing of named character/gold data. Placeholder claims must never publish. Add shared abuse limits and production-config fail-closed behavior.
6. Upgrade vulnerable web dependencies on a reviewable branch, configure noninteractive lint/CI, rerun tests/build and preview the affected flows. Resolve advisory applicability rather than treating every audit entry as a reachable exploit.

Done means actual accepted-only/deduplicated corpus behavior, not just a green pure-function suite. Production test upload/waitlist deletion remains **declined**; do not delete or rebuild them during testing.

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

Run from `D:\R21-Brain\projects\wowvault\kb`. The direct Node invocation preserves `--db`; this PowerShell/npm combination swallowed it during this check.

```powershell
node ./node_modules/tsx/dist/cli.mjs src/cli.ts stats --db data/wowvault-kb.sqlite
node ./node_modules/tsx/dist/cli.mjs src/cli.ts validate --db data/wowvault-kb.sqlite
node ./node_modules/tsx/dist/cli.mjs src/cli.ts snapshot data/release/<new-dated-name>.sqlite --db data/wowvault-kb.sqlite
```

Before running a local HTTP server, set `EVERLOOT_MCP_TOKEN` through the local secret mechanism; do not print/paste it or pass it on the command line. Keep uploads unset until a sanitized shared reader is implemented; pointing MCP at a random empty directory hides a missing data connection.

```powershell
node ./node_modules/tsx/dist/cli.mjs src/cli.ts serve-mcp-http --db data/release/2026-10-05-everloot-public.sqlite --port 8787
```

This binds loopback only. Stop the foreground process when the test ends. The current CLI opens DBs in read/write mode even for serving; harden service open/paths and missing/empty DB behavior under F20 before hosting it.

## Owner-dependent evidence before launch

Recorded beta cutoff 10/21 → in-client addon load and two raid nights. CurseForge target ~10/24 → reviewed package and metadata. Recorded launch 11/04 → signing, public MCP, companion/uploader, privacy/share controls, billing/plan confirmation and recovery evidence. Hero screenshot, officer authority, trademark and wiki permission remain owner/external inputs.

Resume prompt: **“Read NEXT_SESSION.md and architecture.md; implement the accepted-only ingestion and idempotency slice with failing boundary tests first. Do not deploy or delete production test data.”**
