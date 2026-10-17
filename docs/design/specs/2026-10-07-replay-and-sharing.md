# Replay-safe collection and explicit publication

Authorized scope: Carlos's instruction to proceed with review/preview, event identity,
resumable batches and verified guild permissions/named sharing. Keep production untouched.

## Decisions for this implementation

- A/B review found and fixed incomplete manifest counts. Local browser proved actual
  persistence failure keeps the file retryable without thanks, then success after recovery.
- The addon assigns an event ID once, from a persisted random epoch and monotonic sequence.
  Existing rows remain legacy: preserve their raw files, exclude them from public facts.
  A hash alone cannot tell retries from legitimate identical events. No historical backfill.
- One shared schema parser and replay reducer supplies web and MCP. Equal install/event
  IDs and equal canonical payloads count once; unequal payloads permanently conflict.
  Conflict tombstones survive snapshots, retries and rebuilds. Distinct IDs may carry equal
  payloads/timestamps. Incremental snapshots use conditional R2 writes; a race fails/retries.
- Uploads are chunked below 2,000 rows and a byte budget. The browser retains exact batches
  and confirmed receipts in memory, resumes at the first unconfirmed batch, and never
  acknowledges a failed request. Reloading/reselecting the same file safely replays its IDs.
- Anonymous kinds can be submitted without a named-publication grant. Guild, character,
  gear, collection ownership and gold default to withheld. Operator-issued random bearer
  grants are hashed at rest, install/realm/subject/category scoped, expiring and revocable.
  Operators issue guild grants only after verifying officer authority out of band; the
  software does not pretend a client token or install ID proves identity. Verified named
  scopes plus explicit per-category upload choices are both necessary.
- Reads check current grant state even for cached snapshots. Expired/revoked grants never
  authorize replay. Suppression of a guild member or character is authoritative and applies
  to previously cached facts, snapshot reads, rebuilds and new uploads. Privileged operator
  controls are local/server-only; the public revocation endpoint accepts only the holder's
  bearer grant. No browser service-role key. MCP cannot publish raw named file uploads.

## Verification and release boundary

Regression fixtures cover mixed/legacy/replayed/conflicting records, conflict replay,
incremental versus rebuild, concurrent snapshot writers, partial upload failures and retry,
forged/expired/wrong-subject grants, unchecked publication choices and suppression/revocation.
Run package suites, KB typecheck, web build, and local browser states. Schema migrations are
prepared and tested locally; production apply/deploy and real in-client/real-officer proof
are separate release evidence. No production test-data deletion or snapshot rebuild.

## Primary implementation references

- [R2 conditional operations](https://developers.cloudflare.com/r2/api/s3/extensions/)
- [PostgreSQL INSERT and ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html)
- [Supabase RLS and service roles](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Next.js 14 Route Handlers](https://nextjs.org/docs/14/app/building-your-application/routing/route-handlers)

## Execution ledger

- Review A/B: complete, commit `4a56ac7`; manifest regression 13/13; browser actual 503/retry/200.
- Replay reducer/event IDs: implemented locally; stable IDs and permanent conflicts covered by regressions.
- Store/MCP snapshot integration and race protection: implemented locally. Conditional snapshot writes and rebuild agreement pass. MCP can read the current sanitized web view; local raw files expose anonymous facts only.
- Resumable batches: implemented locally. 4,500-record browser upload completed in three batches. Unit regression resumes after partial failure at the first unconfirmed batch.
- Verified publication, revocation and suppression: implemented locally with operator-issued scoped grants. Local API issue/upload/read/revoke/read showed one named row before revocation and zero afterward, including cached reads. Real owner/officer verification remains external evidence.
- Final verification: 68 web tests, 163 KB tests, both typechecks, web production build and Lua 5.1 executable test pass. Disposable PostgreSQL 16 migration/permission tests pass. Browser actual storage failure/recovery, unchecked sharing and 4,500-record replay pass; public count remained 4,502 (4,500 fixture observations plus two sample observations).
- Found/fixed during continuation: header typing, widened test discriminants, shared NodeNext import resolution, reserved SQL column name, missing sanitized MCP connection, completed-upload button copy and ignored local private grant/upload files.
- Handoff: `_STATUS.md`, `NEXT_SESSION.md` and `docs/2026-10-07-replay-sharing-verification.md`. No production migration, snapshot rewrite, deletion, main push, public host or deployment.
