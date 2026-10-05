# docs/

Reference material for the build. Not source-of-truth for the product (that's `_STATUS.md` and `BUILD_PLAN.md` at the project root).

**Current entry points (2026-10-05):** [`../NEXT_SESSION.md`](../NEXT_SESSION.md) for the ordered trust-boundary → enrichment → server setup handoff; [`architecture.md`](architecture.md) for current/proposed services; [`2026-10-05-full-assessment.md`](2026-10-05-full-assessment.md) for 20 open findings. Retail/iOS references below are historical where superseded.

**Next work session:** [`2026-10-05-next-sprint.md`](2026-10-05-next-sprint.md) has the work order, dependencies and migration decisions, plus scoped specs and task-by-task plans for accepted-only web boundaries and read-only KB service startup. Prepared only; no implementation completed.

## What's here

| File | Type | Read when |
|---|---|---|
| `WoWCollectorTracker_Architecture_and_Strategy.docx` | Historical strategy artifact (2026-05-02, 35 pages) | Once for context. Reread before Phase 2 GTM work. |
| `WoWCollectorTracker_Competitive_Matrix.xlsx` | Historical competitive matrix (30 tools × 50+ features) | When deciding which APIs to integrate or which feature niches to attack. |
| `architecture.md` | Current service/data map and proposed public MCP setup; verified 2026-10-05 | Before enrichment, server provisioning or changing data boundaries. |
| `references.md` | Product-shape references Carlos sent 2026-09-29. Access rules stay in `sources/source-catalog.md`. | Before borrowing a page layout from another WoW site. |

## The two historical docs

The `.docx` and `.xlsx` came out of a Cowork strategy session on 2026-05-02. They're thorough but they assume Carlos would have a co-founder (Angel) and a real marketing org. Carlos dropped that on 2026-05-16 — it's a solo build now.

So: the architectural sections of the .docx (data sources, AI/RAG pipeline, infrastructure stack, push architecture) are still load-bearing. The founder/legal/marketing/monetization sections are deferred to "later, when there's a product."

The matrix is still useful for the "where's the gap" question and the API columns.

## What `architecture.md` should cover (when written)

- Data model (entities + relationships)
- API contracts (BNet → backend → iOS/web)
- Auth flow (BNet OAuth across surfaces)
- Sync strategy (when/how character data refreshes)
- AI prompt structure (what the LLM sees on every request)
- Caching policy (what's hot, what's cold, what's per-user)
- Decisions and dates (when something changed and why)

Write it in Session 0 or Session 1. Keep it under 5 pages. Update it as decisions land.
