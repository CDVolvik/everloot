# Upload index insert closeout — 2026-10-22

Wave 5, lane B: the upload that answers 503 "storage could not be confirmed" while its object is already in R2.
Reported on 2026-10-21 as the corpus store's index insert into `public.uploads` coming back 400 on a re-upload.

## What was proved, without touching production

A throwaway Postgres 16 with the Supabase roles and default privileges, every migration in `supabase/migrations/`
applied in order, and a real PostgREST (v12.2.3) in front of it. The intake ran unchanged against it: the real route,
the real store, the real quota RPCs; only R2 was an in-memory stand-in. Both containers, the network and the
PostgREST image were removed afterwards.

1. **The table and the code agree.** The table has the five columns the store writes plus `received_at`, all
   not-null, with the types the store sends. An ordinary upload, and the same file sent again, are both indexed
   (201, 201). The code has sent the same row shape since 2026-10-04 (`git log` on `upload-store.ts`), and production
   indexed eight uploads with it, so a missing or mistyped column in production would have refused all of them.
   It is not a missing migration.
2. **The code can still send a row the table refuses.** The protocol accepts any install id of 8 to 64 characters
   (`INSTALL_ID` in `packages/protocol/src/records.ts`). Postgres text cannot hold a NUL or half of a UTF-16 pair:

   | `install_id` sent | PostgREST answer |
   |---|---|
   | `install-1234`, `ps-…`, accented and emoji ids | 201 |
   | containing `\u0000` | 400 `22P05` "unsupported Unicode escape sequence" |
   | containing a lone surrogate (`\ud800`) | 400 `PGRST102` "Empty or invalid json" |

   Through the real route, an upload with a NUL in its install id answered **503 on the first send and 503 on the
   re-send**, with its object written to R2 both times and this in the log:
   `R2 object stored but index insert failed (400): {"code":"22P05",…}`. That is the reported symptom, and no
   retry can get out of it.
3. **It is not proved to be Carlos's 503.** His install had uploads accepted under the same install id before
   the failing re-upload, so his id holds neither character. The 2026-10-21 notes also say the log tail "did not
   cover the intake". The 400 was read from the code, not from a log line. And before this change the R2 PUT
   failed silently: an R2 refusal produced the same 503 and no log at all.

Root cause, as far as the repository can show it: **the code sends a row the table refuses** when the install id
holds a NUL or a lone surrogate, and the table says nothing the code does not know. Which of the two halves failed
on 2026-10-21 can only be read from production's log.

## What changed

- `web/src/app/api/intake/route.ts`: an install id holding a NUL or a lone surrogate gets **422** with a reason
  ("This install id holds a character the store cannot keep."). This happens before the install quota and before
  anything is written. A 422 tells the sender not to retry, where the 503 told them to retry forever.
- `web/src/lib/upload-store.ts`, the store's write:
  - An R2 PUT failure is logged with its status and body (`R2 put failed (403): …`), so each half of a failed store
    names itself in the log.
  - The index insert is tried **once more** after a network error or a 5xx. On that second try a 409 means the
    first try landed, so the upload counts as stored. A 4xx is not retried: the same row would be refused again.
    The body of a refusal is still logged.
- No migration: the schema is right.

**Fail-safe choice: retry and log, not accept without an index.** Every reader finds objects through
`public.uploads`. Nothing lists the bucket. An object with no index row is never read, so answering 200 for it would
tell the player their data landed when no page will ever show it, and the player's file could be thrown away. So
the store retries a failure that can pass. When the index still cannot be written, it answers 503 so the player
keeps the file and the app sends it again. The orphaned object costs storage, and no data is lost.

## Tests

- `web/src/app/api/intake/route.test.ts`: install ids with a NUL and with half a character pair are refused with 422,
  with no quota call and no write.
- `web/src/lib/upload-store.test.ts`: the R2 failure is logged with its body; a refused row is tried once and its
  `22P05` body is logged; a 5xx and a dropped connection are each retried once with the same row; a 409 on the
  retry counts as stored; two failures are not persisted.
- `supabase/tests/uploads_index.sql` (disposable database only): the table has the store's columns, types and
  nullability; the store's rows go in the way PostgREST reads them (`json_populate_record`); a repeated row is a
  unique violation; a NUL install id cannot become text; a negative count is refused. It passed on the throwaway
  database.
- The 7 new web tests fail on the previous code and pass on this one.
- **web: 2,149 passed, 3 skipped (223 files). kb: 1,211 passed (115 files).** Typecheck clean. Lint has no errors
  (its warnings are in files this lane did not touch).

## What only Carlos can do

- **Nothing to apply.** There is no migration in this change.
- **The `information_schema` query is no longer needed.** The same row shape was indexed eight times in production,
  and the query lists columns only, so it cannot show why one row is refused. What answers the question is **the
  log line of the next 503** in the Vercel runtime log. It now reads either `R2 put failed (…)` or `index insert
  failed (…)`, with the body that says why. If the logs from 2026-10-21 around 12:40 UTC are still retained, the
  `upload <id>:` line there tells which half failed, but only the index half was logged at that time.
- **Still his decision, unchanged here:** whether a file that is already stored should answer "already stored"
  instead of being stored a second time.

## Follow-up for another lane

The player write has the same exposure. `rpc/upsert_players` with a NUL anywhere in a row answered 400 `22P05` on
the throwaway database, and the route turns that into a 503 for the whole upload. It is behind
`EVERLOOT_PLAYER_PAGES`, which is off. The check belongs in `playerStoreProblem` (`web/src/lib/player-pages.ts`),
which this lane does not own.
