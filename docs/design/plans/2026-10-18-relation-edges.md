# Plan: relation edges

**Spec:** `docs/design/specs/2026-10-18-relation-edges-design.md`.
**Out of scope:** item categories (step 3), object pages (step 4), icons (step 5).

Each task is test-first: the test fails, then the change makes it pass.

## 1. Edge table (kb)

- `kb/test/edges.test.ts`: client edges from synthetic tables; a missing table adds nothing;
  observed edges under the 3-install rule with installs and times; a future capture time does
  not move last seen; grouping order; the MCP answer in both directions with both credits.
- `kb/src/edges.ts`.

## 2. Client layer file

- `kb/test/client-layer.test.ts`: build stamp, label, credit, counts, one edge per line, round trip.
- `kb/src/client-layer.ts`, `kb/src/client-layer-file.ts`, `npm run kb -- client-layer`.
- Build watch: `cdn-extract.ts` writes it, `site-data.ts` lists it, the workflow allowlist accepts it.
- Generate `web/src/data/game-data/client-layer.json` from build 1.60.1.70450.

## 3. MCP

- `entity_relations` after `world_map_near`; `TOOL_KINDS` (loot, vendor, quest, npc_sighting) and
  the fact builder; `tool-kinds.test.ts`; `connect-data.ts`; usage metrics; tracker entry.

## 4. Web

- `rollup-compute.ts`: observed edges in the shared aggregate set (`rollup-compute.test.ts`).
- `lib/edges.ts`, `components/EntityRelations.tsx` (`EntityRelations.test.tsx`), the item page.
- `/api/edges` and `/api/edges/client-layer` (`route.test.ts`): filters, 400s, paging under the
  guard, unreadable storage, the game-data notice.
- `/connect`, llms.txt and llms-full.txt list the endpoints.

## 5. Policy

- `docs/DATA_POLICY.md` "The client layer" and `docs/sources/LEDGER.md`, decided 2026-10-18 by
  the maintainer; the game-data README row.

## Checks

`kb`: `npm test -- --maxWorkers=2 && npm run typecheck`. `web`: `npm test && npm run lint && npm run build`.
