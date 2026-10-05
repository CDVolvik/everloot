# Read-only KB Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegation is not requested for this preparation.

**Goal:** Refuse missing/unready KB artifacts and serve an explicit approved snapshot through a read-only DB handle.

**Architecture:** Keep the writer opener for imports. Add a read-only existing-populated opener and a public snapshot readiness function; share read-only publication checks with the exporter while retaining its writable FTS verification. Both transports receive the validated handle from the CLI.

**Tech Stack:** Node >=22, TypeScript, better-sqlite3, MCP SDK, existing Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-05-readonly-kb-service.md` (review before implementation).

## Global Constraints

- Both serve commands require explicit `--db` and an approved populated snapshot/manifest.
- No served DB creation, schema/source mutation or writable FTS check.
- Preserve loopback binding and current bearer behavior; no public host or main push.
- Node >=22; existing better-sqlite3 and MCP SDK; no new dependencies.
- Raw named gameplay uploads and waitlist data stay outside the service.

## Review Focus

- Absent/blank DB flag: fail with useful stderr and create nothing; Tasks 1/3 pin this.
- Existing empty DB: refuse startup rather than report a healthy empty KB; Tasks 1/2 pin this.
- Forged DB source flags/private cache/extra tables: code registry and schema checks fail; Task 2 pins this.
- Broken or mismatched manifest/database: refuse before binding and close handles; Tasks 2/3 pin this.
- Runtime FTS checks/sidecars/shutdown: no writable checker and unchanged DB hash; Tasks 2/3 pin this.

---

## Files and sequence

Own `kb/src/db.ts`, `kb/src/snapshot.ts`, new `kb/src/public-snapshot.ts`, `kb/src/cli.ts`, `kb/src/mcp-server.ts`, the named tests, and relevant KB startup docs. Do not change HTTP auth semantics or gameplay readers. Commands below run from `kb/`.

### Task 1: Open existing populated DBs read-only

**Files:** Modify `src/db.ts`, `test/db.test.ts`.

**Interfaces:** Produce `openExistingReadOnlyDb(path: string): DB`. It requires a nonblank existing path, core `sources`/`entities`/`entities_fts` tables and at least one entity; closes on check failure. Keep `openDb(path: string): DB` writer behavior unchanged.

- [ ] Add failing tests for a nonexistent parent+file, blank path, empty initialized DB, non-SQLite bytes, missing core tables and a populated valid DB. Tests use fresh temp paths and explicitly close every fixture handle.

```ts
expect(() => openExistingReadOnlyDb(missing)).toThrow();
expect(existsSync(missing)).toBe(false);
expect(existsSync(dirname(missing))).toBe(false);
const before = sha256File(populated);
const ro = openExistingReadOnlyDb(populated);
expect(() => ro.exec("DELETE FROM entities")).toThrow();
ro.close();
expect(sha256File(populated)).toBe(before);
```

`sha256File` here is a small test helper using node:crypto on fixture bytes; don't export an unrelated utility solely for tests.

- [ ] Run `npm test -- test/db.test.ts`; record missing API/creation-safety failures.
- [ ] Implement with `new Database(path, { readonly: true, fileMustExist: true })`, readiness queries and close-on-failure. Never call schema init, source sync or journal-mode writes.
- [ ] Run targeted tests; require read queries succeed and write/creation checks pass.
- [ ] Commit `[Everloot] Fix: open existing knowledge DBs read-only`.

### Task 2: Validate an approved public release without writing it

**Files:** Modify `src/snapshot.ts`, `test/snapshot.test.ts`; create `src/public-snapshot.ts`, `test/public-snapshot.test.ts`.

**Interfaces:** Export `checkPublishedDb(db: DB): Record<string, number>` from snapshot code. Produce `PublicSnapshot { db: DB; manifest: Manifest }` and `openPublicSnapshot(path: string): PublicSnapshot`; caller owns the returned handle. Reuse the streaming file hash internally; avoid loading a large release into memory. Runtime manifest validation uses existing Zod or equivalent explicit guards.

- [ ] Add failing readiness tests using genuine exporter fixtures plus deliberately changed files/manifests: missing/malformed manifest, wrong hash/counts/licence/notice/source keys, empty release, disallowed entity/source/cache despite modified DB publishable flags, extra table/view/column, and active WAL/journal sidecar. Regenerate test hash where needed to prove DB checks are not bypassed by a self-consistent manifest.
- [ ] Add assertions that all success/failure paths preserve DB hash, readonly queries work, no handle remains locked after failure, and the serving opener does not invoke writable FTS verification. Record transient sidecar behavior rather than assuming readonly means no filesystem writes.
- [ ] Run `npm test -- test/public-snapshot.test.ts test/snapshot.test.ts`; record readiness failures before implementation.
- [ ] Extract the existing publication/schema/cache/licence/integrity/freelist checks into `checkPublishedDb`; keep exporter FTS integrity INSERT in its existing export-only writable phase. Do not weaken existing extra-schema/private-data tests. The temporary in-memory schema reference is allowed; the served artifact must not be writable.
- [ ] Implement `openPublicSnapshot`: require inactive release/manifest, validate manifest shape/constants and streaming hash, open existing readonly DB, compare publication counts and require nonempty. Close on all errors; report useful stderr upstream without credentials. Counts are keyed by current registry IDs, not arbitrary database flags.
- [ ] Run both targeted suites plus `npm run typecheck`. Require genuine exporter output passes and every mutation fails without DB byte changes. Report export-time FTS/hash assurance accurately.
- [ ] Commit `[Everloot] Fix: verify public KB snapshots before serving`.

### Task 3: Route CLI/stdio startup through readiness and prove transport behavior

**Files:** Modify `src/cli.ts`, `src/mcp-server.ts`, `test/mcp-server.test.ts`; create `test/cli-readiness.test.ts`; modify `README.md` and `../NEXT_SESSION.md` startup instructions.

**Interfaces:** Change `serveStdio(dbPath: string)` to `serveStdio(db: DB): Promise<never>` and keep `createKnowledgeServer(db: DB)`/`startHttpBridge(db, port, opts)` unchanged. CLI creates/owns the validated handle. Inspect all `serveStdio` call sites before changing the signature.

- [ ] Add failing child-process tests invoking Node with `node_modules/tsx/dist/cli.mjs src/cli.ts`: both serve commands without/blank `--db`, nonexistent/empty/tampered release and `stats`/`search`/`validate` without an explicit path. Expect nonzero exit, stderr explains the path/readiness failure, and no default DB/parents created. For HTTP reserve a test port and verify invalid startup never listens; for stdio verify no successful initialization response.
- [ ] Add valid-artifact HTTP and stdio SDK initialization/list/search tests with ephemeral port/token through environment (never command-line secrets). Expect existing tools/sourced answers, bearerless HTTP POST 401, correct token succeeds, and DB hash unchanged after stop. Spawn test children with bounded startup/exit timeouts and clean them in `finally`; stdio logs must not contaminate protocol stdout.
- [ ] Run `npm test -- test/cli-readiness.test.ts test/mcp-server.test.ts`; record default-path and writable-startup failures.
- [ ] Implement explicit path gates before the lazy writer opener can run. `stats`/`search` use the readonly opener; `validate` requires an existing populated explicit file but retains its documented writable FTS diagnostic. Imports/cache writes/export keep existing behavior. Both serve commands use `openPublicSnapshot` before connecting/listening; close the handle on startup failure and on CLI shutdown without changing bearer/loopback behavior.
- [ ] Update usage/docs to show direct Node `--db` invocation, filtered manifest requirement, source-versus-release roles and validate's writable FTS check. Do not suggest a source DB is an approved public release or advertise generic bearer auth as proof of ChatGPT compatibility.
- [ ] Run `npm test` and `npm run typecheck`. Inspect final `git diff --check`/diff. Record hashes and fixture transport results; rerun the large local snapshot only if a new failure or native/runtime concern needs it, preserving its original bytes.
- [ ] Commit `[Everloot] Fix: require ready snapshots for MCP startup`.

## Completion gate

F20 service-startup safety is complete only when real transport tests and negative CLI creation tests pass. Writer-command implicit defaults remain explicitly outside this patch. Public hosting/auth compatibility, request budgets, freshness, sanitized gameplay views, backup/restore and source permission are separate unfulfilled acceptance gates.
