# Legacy-data policy (C: event identity migration)

**Decision:** Conservative exclusion — pre-C uploads (no `eventId`) are normalized out of public facts.

## Rationale

- Sprint brief: "Do not invent IDs from timestamps or promise precise historical kill/income counts"
- Historical rows in R2/Supabase lack `eventId` field
- Adding synthetic IDs would collapse distinct same-second events or create false precision
- Content-hash dedup would also collapse legitimate identical same-second events

## Implementation

1. **Schema enforcement:** `eventId` is now required on all 17 record kinds in `intake.ts`
2. **Normalization:** `parseRecords` (used by `normalizedRecordsOf`) rejects records without `eventId`
3. **Result:** Pre-C uploads are parsed but produce 0 accepted records → excluded from public corpus
4. **Counts preserved:** Upload count (`uploads: N`) still includes legacy files; only `records` array is filtered

## What this means

| Aspect | Pre-C data | Post-C data |
|--------|------------|-------------|
| Upload count | ✅ Counted | ✅ Counted |
| Public rollups (drops, spawns, gold) | ❌ Excluded | ✅ Included |
| Deduplication | N/A | ✅ By `(installId, eventId)` |
| Conflict tombstones | N/A | ✅ Tracked |
| Snapshot inclusion | ❌ Filtered out | ✅ Included |

## Owner actions

- [ ] **Test-data cleanup:** Remove test upload `1d694078...` + waitlist `e2e-test@everloot.app` from R2/Supabase; run cron with `?rebuild=1`
- [ ] **Verify** `/api/rollups/drops` returns 0 uploads/records after cleanup (since test data is pre-C)
- [ ] **Document** in public FAQ: "Data before [date] is excluded from public rates — collection started fresh with stable event IDs"

## Future option (if Carlos wants)

Re-import pre-C data with synthetic `eventId` = `legacy-<uploadId>-<rowIndex>` and a `legacy: true` flag, but:
- Must not inflate public counts
- Must be clearly labeled in UI/API
- Requires explicit owner approval

**Status:** Implemented via schema enforcement. No code change needed beyond existing `eventId` requirement.