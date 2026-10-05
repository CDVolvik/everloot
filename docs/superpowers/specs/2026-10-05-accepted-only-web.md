# Accepted-only web corpus — proposed specification

Status: prepared 2026-10-05 for review before implementation. Scope derives from assessment F01 and the persistence failure in F14; it provides only a small part of F04. No repair has been implemented.

## Required behavior

Retain the existing 17 kind schemas, receipt indices, `addonVersion` length 1..20 and request record count 1..2,000. Every persisted new upload contains only the parsed Zod records, including defaults and excluding unknown extra fields. The route derives its install ID from accepted records, never the first raw row. Multiple accepted install IDs reject the entire request with 422 and no write. An invalid row with another ID does not reject an otherwise valid single-install submission.

Malformed JSON returns 400; invalid envelope/all rejected returns 422; existing quota rejection returns 429. Successful storage returns 200 with `ok:true,persisted:true`. Storage false/throw returns 503 with `ok:false,persisted:false`, an actionable retry message and the validation receipt. Parsed acceptance is not a persistence receipt. Do not claim durable receipt, counted data or thanks when storage failed.

Local files, indexed cloud objects, cached snapshot reads and snapshot writes must normalize records through the same kind schemas. This includes already stored mixed payloads and prior snapshot records. The corpus normalizer has no aggregate 2,000-row cap: this is a per-request cap. Unknown kinds and invalid records are excluded; extra fields are stripped. Upload counts remain counts of files/index entries, not valid events. Retain raw historical files; no deletion or production rebuild is part of this patch.

Malformed snapshot structure must produce the existing unreachable state, never silently advertise zero. Valid snapshot metadata/cursors remain intact. Corrupt-object recovery and complete schema/freshness validation are separate F14 work; this patch must preserve existing failure behavior while closing record validation bypasses.

## Contracts

In `web/src/lib/intake.ts`:

```ts
export interface CanonicalUpload { addonVersion: string; records: IntakeRecord[] }
export interface ParsedRecords { records: IntakeRecord[]; receipt: ValidationResult }
export type ParsedUpload =
  | { ok: true; upload: CanonicalUpload; receipt: ValidationResult }
  | { ok: false; receipt: ValidationResult };
export function parseRecords(records: readonly unknown[]): ParsedRecords;
export function parseUpload(payload: unknown): ParsedUpload;
export function validateUpload(payload: unknown): ValidationResult; // compatibility wrapper
```

`parseUpload.ok` means the envelope parsed, even when all rows are rejected; the route still checks accepted count. `parseRecords` records original input indices in the receipt. Zod kind-specific schemas stay authoritative. Store writes consume `CanonicalUpload`; corpus reads expose normalized records. Do not echo those records in HTTP receipts.

## Global constraints

- Request record count remains 1..2,000; corpus normalization has no aggregate cap.
- Keep 17 kind schemas and original receipt indices.
- Do not delete production test data, rebuild production snapshots or push main.
- No new dependencies, new raw quarantine bucket or duplicate schema implementation.
- Names/claims passing a schema are not consent or officer authority.

## Completion and limits

Mixed-payload route-to-storage-to-public-rollup tests cover both local and mocked cloud/snapshot paths. Exactly one valid loot window remains from one valid and one invalid row. The uploader shows storage failure and can retry the retained file. Full web suite and build pass; diff contains only the listed boundary/receipt files and tests.

Replay deduplication, stable addon IDs, shared MCP normalization, verified claims/sharing, byte limits, distributed quotas, orphan cleanup and production-config/freshness controls remain open. This scoped patch alone does not close F01 across every consumer or authorize public named publication. No automatic production rewrite is permitted to make the tests pass.
