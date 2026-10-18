# Plan: client coverage tables

**Spec:** `docs/design/specs/2026-10-18-client-coverage-tables-design.md`.
**Out of scope:** edges, taxonomy, objects and icons (steps 2 to 5), and publishing any of it.

Each task is test-first: the test fails, then the change makes it pass.

## 1. File data ids

- Read `manifest.json` of WoWDBDefs at `b9a63096cdd9`; take `db2FileDataID` for each table.
- `kb/test/client-extract.test.ts`: pin the twenty ids.
- `kb/src/client-snapshot.ts`: add them to `CLIENT_TABLES`, with a comment naming the commit.

## 2. Missing tables in the manifest

- `writeClientSnapshot(path, meta, tables, missing = [])` writes `missing` into the manifest.
- `kb/src/cli.ts` (`client-extract`) and `kb/src/build-watch/cdn-extract.ts` pass it.

## 3. Coverage report

- `kb/test/client-coverage.test.ts`: every client table appears; read, absent, failed and
  not-extracted statuses; rows, encrypted blocks; needed fields present or missing, and filled counts;
  the markdown carries the build stamp.
- `kb/src/client-coverage.ts`: `NEEDED_FIELDS`, `clientCoverage`, `formatCoverage`.
- `kb/src/cli.ts`: `client-coverage <snapshot> [--out file]`.

## 4. Run it

- `npm run kb -- client-extract --product wow_classic_beta --refresh`, then
  `npm run kb -- client-coverage data/client/<snapshot>.sqlite`. The report goes in the pull
  request; the snapshot stays in `kb/data/`.

## 5. Docs

- `docs/sources/LEDGER.md`: the new tables and the command.
- `THIRD_PARTY.md`: point at `CLIENT_TABLES` instead of listing four tables.

## Checks

`npm test -- --maxWorkers=2 && npm run typecheck` in `kb/`.
