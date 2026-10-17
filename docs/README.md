# docs/

The index to everything written down about Everloot. Start with the data policy and the
architecture map.

## Guides

| File | What it is |
|---|---|
| [`RELEASING.md`](RELEASING.md) | Stable and nightly releases, and the pull request title convention |
| [`2026-10-08-beta-client-checklist.md`](2026-10-08-beta-client-checklist.md) | What gets checked in the live client before an addon release |
| [`2026-10-08-release-checklist.md`](2026-10-08-release-checklist.md) | What gets checked before a site release |
| [`TRACKER.md`](TRACKER.md) | The build list, generated from `kb/src/bridge-plan.ts` (a test keeps it in sync) |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md), [`../ROADMAP.md`](../ROADMAP.md), [`../CHANGELOG.md`](../CHANGELOG.md) | How to contribute, what is planned, what has shipped |

## Data policy

| File | What it is |
|---|---|
| [`DATA_POLICY.md`](DATA_POLICY.md) | What we publish, what we refuse, and why |
| [`LEGACY_DATA_POLICY.md`](LEGACY_DATA_POLICY.md) | How older uploads are handled |
| [`TALENT_CATALOG.md`](TALENT_CATALOG.md) | The talent catalog read from the game files |

## Architecture

| File | What it is |
|---|---|
| [`architecture.md`](architecture.md) | The service and data map |
| [`everloot-wow-architecture-audit.md`](everloot-wow-architecture-audit.md) | The datamining and community-data audit that led to the game-file layer |
| [`2026-10-09-public-mcp-hosting-options.md`](2026-10-09-public-mcp-hosting-options.md) | Where the public MCP endpoint can run |
| [`2026-10-09-recipe-capture-options.md`](2026-10-09-recipe-capture-options.md), [`2026-10-10-recipe-windows-design.md`](2026-10-10-recipe-windows-design.md) | How recipe difficulty is captured |
| [`2026-10-17-talent-share-code.md`](2026-10-17-talent-share-code.md), [`2026-10-18-raid-share-code.md`](2026-10-18-raid-share-code.md) | The talent and raid share link formats |

## Design specs and plans

[`design/specs/`](design/specs/) holds the design for each feature, and [`design/plans/`](design/plans/)
the plans that built them, both named by date. Recent ones:

- [Platform expansion](design/specs/2026-10-18-platform-expansion-design.md)
- [Agent chat (site, companion, addon)](design/specs/2026-10-18-agent-chat-design.md)
- [World map](design/specs/2026-10-17-world-map-design.md)
- [Visual identity](design/specs/2026-10-17-visual-identity-design.md)
- [Sourced answers](design/specs/2026-10-17-sourced-answers-design.md)
- [Open-sourcing Everloot](design/specs/2026-10-16-open-source-everloot-design.md)

## Sources

| File | What it is |
|---|---|
| [`sources/LEDGER.md`](sources/LEDGER.md) | Every external source Everloot has used, linked or read, and how |
| [`sources/source-catalog.md`](sources/source-catalog.md) | The research list of candidate sources and their terms |
| [`references.md`](references.md) | Sites whose page shape we learned from, and what we do not take from them |
