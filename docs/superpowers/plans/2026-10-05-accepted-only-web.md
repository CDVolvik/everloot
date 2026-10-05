# Accepted-only Web Corpus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegation is not requested for this preparation.

**Goal:** Ensure web persistence and corpus readers use parsed accepted records, with truthful failure receipts.

**Architecture:** Keep the current schemas and storage split. Add parsing results alongside receipt-only validation, normalize every web read/write boundary, and send only canonical envelopes from the route. Keep historical raw files unchanged.

**Tech Stack:** Next.js 14/React 18, TypeScript, Zod 4, Vitest 3, existing R2/Supabase store.

**Spec:** `docs/superpowers/specs/2026-10-05-accepted-only-web.md` (review before implementation).

## Global Constraints

- Request record count remains 1..2,000; corpus normalization has no aggregate cap.
- Keep 17 kind schemas and original receipt indices.
- Do not delete production test data, rebuild production snapshots or push main.
- No new dependencies, new raw quarantine bucket or duplicate schema implementation.
- Names/claims passing a schema are not consent or officer authority.

## Review Focus

- Rejected first row with a different identity: accepted rows own attribution; Task 2 pins this.
- Schema defaults and nested unknown fields: parsed values survive and extras disappear; Task 1 pins this.
- Old snapshots/raw objects contain invalid rows: exclude them before calculations; Task 3 pins this.
- A corpus exceeds 2,000 rows: normalize all valid records without the request cap; Task 3 pins this.
- R2 succeeds but indexing fails: return failure and preserve retry input; Tasks 2/4 pin this.

---

## Files and sequence

Own `web/src/lib/intake.ts`, `web/src/lib/upload-store.ts`, `web/src/app/api/intake/route.ts`, `web/src/app/upload/UploadClient.tsx`, their named tests below, and a minimal `web/vitest.config.ts` if the route test needs the existing `@` alias. Do not modify addon/KB engines here. Test commands below run from `web/`.

### Task 1: Preserve schema-parsed records

**Files:** Modify `src/lib/intake.ts`, `src/lib/intake.test.ts`.

**Interfaces:** Produce `CanonicalUpload`, `ParsedRecords`, `ParsedUpload`, `parseRecords(records: readonly unknown[]): ParsedRecords`, `parseUpload(payload: unknown): ParsedUpload` exactly as specified. Keep `validateUpload(payload: unknown): ValidationResult` as the receipt wrapper. Consume the existing `recordSchemas`; do not rebuild schemas or weaken refinements.

- [ ] Add failing tests for mixed valid/invalid rows, original indices after rejection, envelope invalidity, all-rejected valid envelope, defaults, top-level/nested extra fields, and an actual 2,001-row request. Include `kind:"constructor"`, `kind:"toString"`, `kind:"__proto__"` and primitive/null rows: all are ordinary rejected rows, never exceptions.

```ts
const valid = { kind: "loot", installId: "install-1234",
  capturedAt: "2026-10-05T00:00:00.000Z", sourceNpcId: 123,
  items: [{ itemId: 456, count: 1, secret: "strip" }], extra: "strip" };
const result = parseUpload({ addonVersion: "0.1.0",
  records: [{ ...valid, installId: "" }, valid] });
expect(result.ok).toBe(true);
if (!result.ok) throw new Error("expected parsed envelope");
expect(result.upload.records).toEqual([{ kind: "loot", installId: "install-1234",
  capturedAt: valid.capturedAt, sourceNpcId: 123, items: [{ itemId: 456, count: 1 }] }]);
expect(result.receipt.accepted).toEqual([{ index: 1, kind: "loot" }]);
expect(result.receipt.rejected[0].index).toBe(0);
```

- [ ] Run `npm test -- src/lib/intake.test.ts`; record failure because parsing APIs are absent.
- [ ] Implement the specified parsing APIs using the existing per-kind safeParse results. Look up only own recognized schema keys; inherited object properties are not record kinds. Preserve the current error receipt for bad envelopes and map original indices. Make the old validator a thin wrapper.
- [ ] Run the targeted suite; require all previous validation assertions plus new parser assertions to pass.
- [ ] Commit only Task 1 files: `[Everloot] Fix: retain canonical intake records`.

### Task 2: Persist the canonical route payload and report storage failure

**Files:** Modify `src/app/api/intake/route.ts`; create `src/app/api/intake/route.test.ts`; create `vitest.config.ts` only to resolve `@` to `src` if necessary.

**Interfaces:** Consume `parseUpload` and `uploadStore.putUpload(uploadId: string, installId: string, payload: CanonicalUpload): Promise<boolean>`. HTTP response includes only receipt fields, never parsed/raw records. Keep the exported `POST(req: Request)` route signature and current quotas.

- [ ] Add failing route tests using `vi.mock` for the singleton store and `vi.resetModules` between cases to isolate the quota map. If alias resolution is absent, use `defineConfig` with `resolve.alias` mapping `@` to the absolute `src` path; add no test framework dependencies.
- [ ] Assert valid+invalid → 200, spy payload equals Task 1's canonical envelope, invalid-first ID does not own the store call, mixed accepted IDs → 422/no store, all-invalid → 422/no store, malformed JSON → 400/no store, and store false/throw → 503/`ok:false,persisted:false`. Assert no response `records` property. Keep quota 429 coverage with unique install IDs.

```ts
expect(response.status).toBe(503);
expect(await response.json()).toMatchObject({ ok: false, persisted: false });
expect(storeSpy).toHaveBeenCalledWith(expect.any(String), "install-1234",
  { addonVersion: "0.1.0", records: [canonicalLoot] });
```

- [ ] Run `npm test -- src/app/api/intake/route.test.ts`; confirm raw-payload and false-success assertions fail.
- [ ] Implement canonical persistence, accepted-install set checking and 503 handling. Keep the 2,000-count envelope behavior (422); batching/413 byte limits belong to later packages. Receipt `accepted` means validated; `persisted` means indexed/stored.
- [ ] Run the route and intake test files; require each no-write/status/body assertion to pass.
- [ ] Commit Task 2 files: `[Everloot] Fix: store accepted uploads and truthful receipts`.

### Task 3: Normalize historical web reads and snapshot writes

**Files:** Modify `src/lib/upload-store.ts`, `src/lib/upload-store.test.ts`; create `src/lib/intake-corpus.test.ts`.

**Interfaces:** Consume `parseRecords(records: readonly unknown[]): ParsedRecords` and `CanonicalUpload`. Narrow `putUpload`'s payload type. Preserve `loadCorpus(): Promise<Corpus>` and `writeSnapshot(opts?: { rebuild?: boolean }): Promise<{ uploads: number; added: number }>` public shapes. `Corpus.records` can narrow to `IntakeRecord[]` once every return path is normalized. Upload counts still count objects/index rows.

- [ ] Repair schema-incomplete existing store fixtures into valid records with real fields/timestamps; do not weaken the parser to satisfy kind-only fixtures. Add failing tests for local mixed raw files, cloud fallback objects, existing mixed snapshots, prior+fresh snapshot normalization and a valid 2,001-row corpus. Exercise cache hits as well as fresh reads.
- [ ] Assert invalid/nested-extra records are absent from `loadCorpus().records` and the written `snapshots/corpus.json`; preserve upload counts, cursor ties and failure state. A snapshot with `records` missing/non-array must yield `unreachable:true`, not an empty healthy corpus. Keep existing R2/index partial-failure tests.
- [ ] Add integration tests using a temporary local directory and existing mocked cloud-fetch pattern: submit a mixed payload through `POST`, read stored bytes, load corpus, then use `lootWindowsFromRecords` from `./rollups`. Mock the route singleton with the real test store; cloud path also writes/reads a snapshot.

```ts
expect(corpus.records).toEqual([canonicalLoot]);
expect(lootWindowsFromRecords(corpus.records)).toHaveLength(1);
expect(corpus.unreachable).not.toBe(true);
```

- [ ] Run `npm test -- src/lib/upload-store.test.ts src/lib/intake-corpus.test.ts`; record invalid historical/snapshot records entering facts before the fix.
- [ ] Normalize records at local/object extraction, snapshot reads and combined snapshot writes. Do not use capped `parseUpload` for a whole corpus. Reject the specified malformed snapshot record shape while preserving other existing metadata/failure behavior. Retain raw files and perform no production rebuild.
- [ ] Run intake, route, store and corpus tests; verify counts/cursors/failure cases as well as exactly one valid loot window.
- [ ] Commit Task 3 files: `[Everloot] Fix: normalize web corpus boundaries`.

### Task 4: Truthful upload feedback and final verification

**Files:** Modify `src/app/upload/UploadClient.tsx`, `_STATUS.md`, `NEXT_SESSION.md`.

**Interfaces:** Consume the existing `Receipt` with Task 2's status/`ok`/`persisted` behavior. No receipt helper abstraction is necessary.

- [ ] Use Task 2's partial-persistence test as the server regression; inspect the uploader's failure rendering and retry behavior before editing. A browser interaction check is the appropriate client check, not a source-text test.
- [ ] Remove obsolete “storage connects with launch”/“validated and counted” copy. Show a retryable persistence failure and retain loaded text/preview; thank only successful stored receipts. Include non-OK receipts in error handling even when `rejected` is present.
- [ ] Run `npm test` then `npm run build`; report exact results. Do not claim lint passed. Review `git diff --check` and the final diff for out-of-scope changes.
- [ ] Using T3 preview if available, verify a local/preview failed persistence response shows failure without thanks, file input remains retryable, and a successful response shows the receipt. Do not send test submissions to production. If preview execution is unavailable, record that client check as unverified, not passed.
- [ ] Update status/handoff with web boundary repair, evidence and remaining MCP/dedup/privacy gaps. Commit `[Everloot] Fix: show retryable upload failures`.

## Completion gate

Review the two real-store integration paths and historical snapshot tests before marking the web slice complete. F01 across MCP, F02/F03/F04/F07/F13/F14 and production rollout remain open. No claim of event uniqueness, verified people, consent, or complete launch readiness follows from this patch.
