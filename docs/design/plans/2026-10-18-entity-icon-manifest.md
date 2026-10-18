# Plan: icons on the database pages

**Spec:** `docs/design/specs/2026-10-18-entity-icon-manifest-design.md`.
**Out of scope:** the bucket uploads and the Vercel variables (the maintainer's steps in
`docs/ASSETS.md`); icons in any API, MCP answer or download (never).

Each task is test-first: the test fails, then the change makes it pass.

## 1. kb

- `kb/test/client-assets.test.ts`: relation spells get icons (an encrypted one and one with no icon
  row get none); pet family icons by id.
- `kb/src/client-assets.ts`: `relationSpells` in `AssetScope`, `familyIcons` in the manifest.
- `kb/src/cli.ts`: pass the client layer's spells.

## 2. Web

- `lib/game-assets.ts`: parse `familyIcons`.
- `components/EntityRelations.tsx`: a spell icon beside spell targets.
- Item page: spell icons, the manifest read only with something to show, the credit.
- Category page: icons and game file names for reported items only.
- `icons.test.tsx`: an unreported item gets spell icons but no tooltip read; no manifest, no icons;
  a list asks the private store only for reported items. `game-visuals.test.tsx` and
  `talents/assets.test.ts` keep passing.

## 3. Docs

- Data policy, ledger, `docs/ASSETS.md`, tracker.

## Checks

`kb`: `npm test -- --maxWorkers=2 && npm run typecheck`. `web`: `npm test && npm run lint && npm run build`.
