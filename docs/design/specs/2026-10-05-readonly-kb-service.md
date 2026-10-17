# Read-only KB service startup — proposed specification

Status: prepared 2026-10-05 for review before implementation. Scope: F20 service startup and explicit path safety; public hosting remains separate.

## Required behavior

`serve-mcp` and `serve-mcp-http` require an explicit nonblank `--db` path to an existing, populated, filtered snapshot with its adjacent `.manifest.json`. They never call `openDb`, create a DB/parent directory, initialize schema, sync sources, or alter the served DB. Missing file/manifest, empty corpus, malformed manifest, hash/count mismatch, disallowed source/cache, extra schema or invalid database fails before binding/connecting.

Manifest parsing checks its exported shape (`createdAt`, `licence`, `notice`, `sha256`, source counts). Compare licence/notice to the exporter constants, source keys to the code registry's publishable IDs, nonnegative integer counts to actual DB counts, and SHA-256 to the file. A matching self-supplied manifest is an integrity check, not source authorization; service operators mount only an approved exporter release, never an untrusted uploaded DB.

Runtime checks use read-only SQL. The existing exporter `verifyOutput` and `validate` issue an FTS5 integrity-check INSERT; **do not call either unchanged from a read-only service**. Extract the existing read-only publication checks for reuse without weakening the exporter's separate writable FTS check. Export-time FTS verification plus the unchanged approved file hash establishes the service artifact; do not advertise a new read-only FTS integrity check that SQLite cannot perform.

The serve handle uses better-sqlite3 read-only/fileMustExist options. It rejects uncheckpointed `-wal`/`-journal` artifacts and requires an inactive immutable release. Test whether serving creates transient sidecars on this runtime; mount/write behavior must be reported before claiming the filesystem is fully read-only. The DB file's bytes/hash must remain unchanged in every startup test.

`stats` and `search` require explicit paths and use a read-only existing-populated opener. `validate` requires an explicit existing populated DB; its present writable FTS verification remains a diagnostic and must be documented as such. Imports/Blizzard cache writes/snapshot export retain their write behavior; their default-path redesign is outside this patch. Do not redirect an absent rebranded filename to the old source DB silently.

## Contracts

```ts
// kb/src/db.ts
export function openExistingReadOnlyDb(path: string): DB;
// Requires the current core schema and at least one entity; closes before throwing.

// kb/src/snapshot.ts
export function checkPublishedDb(db: DB): Record<string, number>;
// Existing schema/allowlist/cache/licence/integrity/freelist checks, read-only SQL only.

// kb/src/public-snapshot.ts
export interface PublicSnapshot { db: DB; manifest: Manifest }
export function openPublicSnapshot(path: string): PublicSnapshot;
// Validates file, sidecars, manifest/hash/counts; closes on every failure.

// kb/src/mcp-server.ts
export async function serveStdio(db: DB): Promise<never>;
// CLI owns the handle; transport startup performs no DB open/write.
```

Keep `startHttpBridge(db, port, opts)` unchanged; no new public bind/auth contract is introduced. Readiness runs before stdio transport connection or HTTP listening. Diagnostics go to stderr for stdio; tokens must not enter logs. Close the CLI-owned DB if transport startup fails.

## Global constraints

- Both serve commands require explicit `--db` and an approved populated snapshot/manifest.
- No served DB creation, schema/source mutation or writable FTS check.
- Preserve loopback binding and current bearer behavior; no public host or main push.
- Node >=22; existing better-sqlite3 and MCP SDK; no new dependencies.
- Raw named gameplay uploads and waitlist data stay outside the service.

## Completion and limits

Tests prove absent paths are not created, empty/private/tampered/schema-expanded artifacts fail before service startup, genuine exporter output returns sourced answers, and DB hashes remain identical. Existing snapshot security tests and auth tests must still pass; KB suite/typecheck pass. Source DB remains preserved.

Body/time/concurrency limits, fail-closed auth deployment configuration, client OAuth/subscriptions, freshness policy, shared public gameplay reader, public HTTPS compatibility, supervision/backup/restore and native-binary host validation remain open. Readiness is not a public server deployment or consent check.
