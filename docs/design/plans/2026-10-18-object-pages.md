# Plan: object pages

**Spec:** `docs/design/specs/2026-10-18-object-pages-design.md`.
**Out of scope:** object names and positions (the addon sends neither), icons (step 5).

Each task is test-first: the test fails, then the change makes it pass.

## 1. kb

- `kb/test/object-page.test.ts`: public drops with agreed item names; under 3 installs is queued;
  a measured zero; the list; the text answer.
- `kb/src/object-page.ts`; `object` in `Kind`, `ALL_KINDS` and the search filter.
- MCP `object_page` after `npc_page`: `TOOL_KINDS` (loot, item_seen), the fact builder,
  `tool-kinds.test.ts`, `connect-data.ts`, usage metrics, tracker entry.

## 2. Web

- `lib/objects.ts` builds object facts from the shared aggregates (no second scan).
- `/database/objects`, `/database/objects/[id]` (`objects.test.tsx`: public, queued, unreachable,
  bad id, the item page link back).
- Item page drop sources link to NPC or object pages; `EntityRelations` links objects;
  `IdLookup`, the `/database` section, the sitemap and llms.txt.

## Checks

`kb`: `npm test -- --maxWorkers=2 && npm run typecheck`. `web`: `npm test && npm run lint && npm run build`.
