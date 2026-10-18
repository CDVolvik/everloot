# Plan: item taxonomy

**Spec:** `docs/design/specs/2026-10-18-item-taxonomy-design.md`.
**Out of scope:** object pages (step 4), icons (step 5), item names from the game files.

Each task is test-first: the test fails, then the change makes it pass.

## 1. Taxonomy (kb)

- `kb/test/item-taxonomy.test.ts`: slugs; classes and subclasses with counts; verbose names; a slug
  clash keeps the number; a pair with no subclass row; item rows; an item's path; resolving slugs
  and numbers; slot and quality filters; the MCP answer.
- `kb/src/item-taxonomy.ts`.

## 2. Client layer v2

- `kb/test/client-layer.test.ts`: categories and items in the file, one row per line.
- `kb/src/client-layer.ts` (schema `/2`), `kb/src/client-layer-file.ts` (`CLIENT_TAXONOMY`).
- Regenerate `web/src/data/game-data/client-layer.json` from build 1.60.1.70450.

## 3. MCP

- `item_categories` after `entity_relations`; `connect-data.ts`, usage metrics, tracker entry.

## 4. Web

- `lib/items.ts`; `/database/items`; `[id]/page.tsx` dispatches words to the class page;
  `[id]/[subclass]/page.tsx`; `category-page.tsx`; the item page breadcrumb
  (`category-page.test.tsx`).
- `/api/items`, `/api/items/categories` (`route.test.ts`).
- Sitemap, `/database` section, `/connect`, llms.txt.

## 5. Docs

- Ledger and game-data README rows.

## Checks

`kb`: `npm test -- --maxWorkers=2 && npm run typecheck`. `web`: `npm test && npm run lint && npm run build`.
