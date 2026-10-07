# Everloot — next work session

Prepared 2026-10-05 for the next session, expected 2026-10-06 in America/Phoenix. This is a proposed execution brief, not evidence that repairs have shipped. All 20 assessment findings remain open. Tonight's work is documentation only.

## Target outcome

Produce two reviewable implementation patches with regression evidence: **A: accepted-only web ingestion/read boundaries** and **B: explicit, read-only, populated KB service startup**. These are the minimum useful outcome; the remaining launch work is not promised in one day. Review the linked specs before implementation, then use sequential execution unless Carlos explicitly requests delegated work.

| Order | Package and ownership | Dependencies | Evidence required |
|---|---|---|---|
| 1 | A: web intake, upload store, receipt copy and their tests | None | A mixed submission survives local/cloud/snapshot reads with exactly one valid canonical record; failed persistence returns retryable failure |
| 2 | B: KB DB opener, snapshot readiness, CLI/stdio and their tests | None; separate files from A | Missing/empty/private/tampered DB fails before listening; a valid snapshot serves without changing its bytes |
| 3 | C: event identity and replay migration; addon, parser, shared corpus reader, loot/gold consumers | A; reviewed historical-data policy | Replays and old-plus-one-new events are invariant across full reads, incremental snapshots and rebuilds |
| 4 | D: resumable upload batches | C | More than 2,000 multi-kind rows; partial failure resumes without double counting |
| 5 | E: guild authority, named sharing, revocation and quotas | A; owner/client auth decisions | Forged/expired/wrong-guild claims fail; private data stays private; suppression reaches snapshots |
| 6 | F: dependency/lint repair and preview regression | Can be a separate branch after A/B verification | Current official advisories reviewed, noninteractive lint, suites/build, upload/database/calculator preview |
| 7 | Enrichment pilot and supervised MCP hosting | C/E plus sanitized web/MCP reader, source permission and client auth verification | Source-bearing facts, real HTTPS client connection, freshness, limits, restart and restore |

A and B can be implemented separately but neither makes public collection or hosting safe by itself. A closes a **web** validation boundary; MCP's existing file loader remains outside that patch. B proves safe local service startup; authentication compatibility, request limits, supervision and public deployment remain separate.

## Ready-to-use documents

- [A specification](superpowers/specs/2026-10-05-accepted-only-web.md) and [A implementation plan](superpowers/plans/2026-10-05-accepted-only-web.md).
- [B specification](superpowers/specs/2026-10-05-readonly-kb-service.md) and [B implementation plan](superpowers/plans/2026-10-05-readonly-kb-service.md).
- [Assessment](2026-10-05-full-assessment.md), [service/data map](architecture.md), and [resume handoff](../NEXT_SESSION.md).

## C: replay policy to resolve before writing its plan

Proposed direction: add an install-scoped event ID allocated once in addon storage, retained through export/retry, and never reused after reinstall/identity reset. New records must preserve this ID through Zod parsing. An ID is event identity, not proof of a person or officer authority.

For equal `(installId, eventId)`, equal canonical payloads count once. Unequal payloads conflict: exclude both from public facts and retain a conflict tombstone so replay cannot restore the first copy. Order must not choose a winner. Keep a versioned dedup/suppression state with the corpus so incremental updates and a full rebuild agree; concurrency cannot silently discard that state.

**Historical policy is not approved:** old rows have no stable IDs. A content hash can collapse retries but can also collapse legitimate identical same-second events. Do not invent IDs from timestamps or promise precise historical kill/income counts. Review a conservative legacy-data policy, report uncertain coverage, and test it on copies. Do not backfill or rebuild production while planning this migration. Preserve the production test record whose deletion was declined.

Required C fixtures: identical file twice; old file plus one new event; two distinct events with identical contents/time; same ID with conflicting contents in both orders; conflict then replay; local/cloud/MCP agreement; incremental snapshot versus rebuild; interrupted persistence then retry; revoked/suppressed records after replay. Addon Lua syntax tests do not substitute for in-client SavedVariables proof.

## Session opening and execution checkpoints

1. Read current status, this brief, assessment and relevant decisions. Inspect the nested repo branch/dirty state; do not assume the shared checkout stayed idle overnight.
2. Start A from `docs/assessment-handoff-2026-10-05` on `fix/accepted-only-web`. Start B from the same docs branch on `fix/readonly-kb-service` after A is committed and the checkout is clean. Do not put both patches in one unreviewable commit. Carry A when integrating the patches.
3. Use failing tests first. Save exact commands/results with each patch. Run package suites and typecheck/build once at the appropriate final boundary. No successful lint claim until F establishes a gate.
4. Review the final diff and remaining findings. Preview and production deployment are separate checkpoints; a main push deploys production. No main push is included in this preparation.
5. Update `_STATUS.md`, `NEXT_SESSION.md` and the brain pointer with implemented versus tested versus deployed results. Use `/end` again.

## Enrichment and server preparation

The approved starting corpus is 257,110 old lore rows plus one curated row, not Forever mechanics coverage. The local filtered snapshot/hash is recorded in `NEXT_SESSION.md`; it is gitignored and unavailable merely by fetching the branch. Recheck its hash before using it. For a pilot, select a small source-linked corpus from already permitted material, import into an explicit scratch DB, and inspect provenance/search before any promotion.

Keep Wowhead link-only, live wiki sync pending permission, wago.tools/foreverdiff blocked, and Blizzard API responses user-local/nonpublic. Reverify current source permissions before any new adapter. Do not run a limited wiki import against the populated DB.

Organize the future server into configuration/secrets, a read-only filtered KB release, sanitized public gameplay views, a supervised Node process, HTTPS/auth, and monitoring/backups. Keep R2 raw named uploads, Supabase service keys and waitlist data outside its public mounts. Select the host only after current runtime/disk/cost and target-client auth checks. No host, domain, subscription or public service was created tonight.

Owner evidence still needed: beta-client addon load and raids, officer authority/share policy, public-client auth requirements, release signing/distribution, watched email, trademark and pending source permissions. The recorded 10/21, ~10/24 and 11/04 milestones remain targets, not verified announcements.

## Preparation review

Self-reviewed against the scoped specs and actual call sites on 10/05. Corrected the read-only/FTS-write conflict, specified route-test alias setup, required valid store fixtures, separated request caps from corpus size, and added inherited-kind rejection cases. Both plans have exact interfaces, file ownership, negative tests, targeted/final commands and completion limits. This is a documentation review; no plan task was executed and no owner design approval or new regression result is claimed.
