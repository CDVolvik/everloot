# Everloot — data recovery runbook (2026-10-09)

What to do when stored data goes wrong. Every step that deletes or rewrites production
data needs Carlos's authorization first. Nothing here has been rehearsed against
production; the restore section is a plan, not evidence.

## Where data lives

| Store | Key / table | Role |
|---|---|---|
| R2 `everloot-uploads` | `uploads/YYYY-MM-DD/<uploadId>.json` | Raw accepted upload. The record of truth. |
| Supabase `everloot` | `uploads` (id, install_id, record_count, bytes, object_key, received_at) | Index. Readers only see objects that have a row here. |
| R2 `everloot-uploads` | `snapshots/corpus.json` | What pages read: `generatedAt`, `uploads`, public `records`, `corpusState` (events, conflict tombstones, legacy count), `seenUploadIds`, `lastReceivedAt`, `lastIds`. |
| Supabase `everloot` | `waitlist`, `intake_quota_buckets`, auth and publication tables | Signups, hashed quota counters, sessions, grants. |

The cron (`/api/cron/snapshot`, every 10 minutes, `Authorization: Bearer $CRON_SECRET`)
extends the snapshot with uploads it has not seen and prunes expired quota buckets.
`?rebuild=1` rebuilds the snapshot from every indexed object and keeps known conflict
tombstones.

## Symptoms and responses

**`/api/health` returns 503 `stale`** (snapshot older than 30 minutes). The cron stopped
or keeps failing. Pages still serve the last snapshot. Check the Vercel cron logs, then run
the cron once by hand with the bearer secret. A 412 on the snapshot PUT means the ETag
check failed: another writer won, or the read came back with a weak `W/` validator. The
store requests `Accept-Encoding: identity` for that reason. Never remove the
`If-Match` / `If-None-Match` guard to force a write.

**Pages say "Storage unreachable".** A read failed: snapshot missing records, R2 or the
index unavailable, or production configuration incomplete. Readers never treat that as an
empty corpus. Fix the store or configuration first. If the snapshot object itself is
corrupt, run `?rebuild=1`; a rebuild that cannot read an indexed object fails without
writing.

**An upload was stored in R2 but has no index row (orphan).** `putUpload` writes the
object, then the index row. If the index insert fails, the request reports not persisted,
logs `R2 object stored but index insert failed`, and the player keeps their file to retry.
The orphan is invisible to every reader, so it never reaches public data. To find orphans,
list the `uploads/` prefix and compare it with the index's `object_key` column. Deleting
one is a production deletion: get authorization, back it up first (below), then delete it.

**An upload must be removed** (a player request, test data, abuse):
1. Read the exact index row to get its `object_key`. Do not guess the date.
2. Back up the object to `maintenance-backups/<date>/<uploadId>.json` with a conditional
   PUT, as the 2026-10-07 cleanup did (`web/scripts/launch-maintenance.mjs`).
3. Delete the index row, then the object.
4. Run the cron with `?rebuild=1`. The rebuild reads every indexed object again and keeps
   conflict tombstones, so a removed upload cannot bring back a conflicted event.

A character who opts out through a verified grant needs none of this: suppression is
applied at read time and persists for later uploads.

## Backup and restore

Not configured. There is no independent copy of the R2 bucket or the Supabase tables.
The Supabase project is on the free plan, which has no point-in-time recovery. Whether
R21's nightly Supabase dump covers `everloot` is unverified. Owner decision needed:

- Back up R2 with any S3-compatible sync against
  `https://<account>.r2.cloudflarestorage.com`, bucket `everloot-uploads`, to storage
  that is not the same bucket.
- Export the `uploads` index rows; the waitlist only if retention allows it.

Restore order: objects first, then index rows, then `?rebuild=1`. Confirm the
snapshot's upload count matches the index and `/api/health` is fresh. Rehearse once
before launch on a scratch bucket and database, never on production.

## Scale limits measured

`web/scripts/corpus-load.mts` builds synthetic loot rows in memory and measures the
cron merge, snapshot size, a cold page read (parse + replay) and the drop rollup. It
reads and writes no store. Dev machine, 2026-10-09, after the batched replay fix (#7):

| records | merge | snapshot | cold read | public API body | rollup |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 15 ms | 0.4 MB | 33 ms | 0.2 MB | 3 ms |
| 10,000 | 22 ms | 3.7 MB | 54 ms | 1.7 MB | 14 ms |
| 50,000 | 115 ms | 18.7 MB | 273 ms | 8.8 MB | 53 ms |

Before #7, a cold read replayed events one by one: 1,000 records took 171 ms, 5,000 took
3.3 s and 10,000 took 15.2 s, growing quadratically.

Still limiting:
- The MCP gameplay reader refuses a public corpus body over 2,000,000 bytes
  (`kb/src/mcp-server.ts`). Synthetic rows reach that at about 11,000 records; real rows
  are larger. Gameplay answers over MCP fail past it until the reader gets a smaller,
  pre-aggregated view or a reviewed higher cap.
- The snapshot is one object, read whole into memory by each cold page. 18.7 MB at 50,000
  synthetic records is workable; measure again with real uploads before raising the cap
  or redesigning storage.
