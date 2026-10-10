# Everloot — release checks

## Automated and local checks

- `cd kb; npm ci; npm test -- --maxWorkers=2; npm run typecheck`
- `cd web; npm ci; npm test; npm run lint; npm run build`
- From the repo root: `uv run --with lupa python addon/tests/event_identity.py`,
  `uv run --with lupa python addon/tests/collection_contract.py`,
  `uv run --with lupa python addon/tests/auction_contract.py` and
  `uv run --with lupa python addon/tests/gold_contract.py`,
  `uv run --with lupa python addon/tests/ask_contract.py`,
  `uv run --with lupa python addon/tests/recipes_contract.py` and
  `uv run --with lupa python addon/tests/answers_contract.py`.
- `cd companion; npm ci; npm test; npm run typecheck` (needs `web` installed).
- Review every changed file and independent review findings before release.
- Check 390/768/1440px layout, keyboard menu, calculator and empty entity `noindex`.
- With advertising intercepted, inspect absent/reject/accept/withdraw network
  behavior and storage-write failure. These checks do not certify an advertising
  provider's required consent platform. Google's current [publisher requirements](https://support.google.com/adsense/answer/13554116?hl=en)
  require a certified CMP integrated with IAB TCF for personalized ads served in
  the EEA, UK and Switzerland. The local preferences control is not a certified
  CMP. Establish the provider setup before enabling those ads.

The GitHub workflow runs code/Lua checks and verifies reproducible packaging with
a ten-minute job cap; concurrent runs are superseded. Existing GitHub Actions and
Packages $0 stop-usage budgets were inspected on 10/08, without changing them.
No paid runner or upgrade is configured. Keep those controls when rerunning.

## Production checks

`/api/health` reads only signed R2 HEAD metadata (cached 60 s per instance): fresh within
30 minutes; missing, stale, malformed or future metadata and storage failures return 503.
Metadata age is not proof of complete indexing or successful quota pruning. A health
response alone does not prove ChatGPT directory compatibility.

| Check | Owner | Artifact | Result |
|---|---|---|---|
| Ready deployment on the main SHA, custom aliases, ten-minute snapshot cron | agent | `vercel api /v13/deployments/everloot.app` | 2026-10-10: `b5ab8ae` READY production |
| `/api/health` fresh | agent | live response | 2026-10-10: 200, fresh (343 s) |
| `/api/corpus/public` reachable; `?kinds=` filters; unknown kind 400 | agent | live responses | 2026-10-10: 200 / 200 / 400 |
| `/upload` serves the 0.2.2 zip with the built hash | agent | download sha256 | 2026-10-10: `2b9c3ff7…` matches the build |
| Pages show data age | agent | `/database` | 2026-10-10: "Data as of 2026-10-10 06:30 UTC" |
| Sharing suppression and unauthorized cron rejection | agent | route tests + live 401 | tests pass; live cron check open |
| No synthetic fixtures in the public production corpus | agent | live corpus | 2026-10-10: 0 records |
| Battle.net real sign-in, `/api/auth/me`, logout, revoked session | Carlos + agent | 10/08 browser evidence | passed 2026-10-08; expired-session trial open |
| Owner/officer authority review, scoped publication, revoke, member suppression | Carlos | real grant trial | open (synthetic grants are not evidence) |
| Public MCP: HTTPS, 401/403, tools, sourced answer, real client | agent | #17 preview trial | preview passed 2026-10-09; production 503 until the release reaches the build (Carlos: R2 upload) |
| MCP restart recovery on production | agent | — | open |

## Recovery and scale

- Follow the [recovery runbook](2026-10-09-recovery-runbook.md) for stale snapshots,
  orphans, upload removal and restore. Backup and restore are not configured or rehearsed.
- `cd web; npx tsx scripts/corpus-load.mts` measures merge, snapshot size, cold read and
  rollup on synthetic rows. Rerun it after storage changes.

## Held release evidence

| Evidence | Owner | Artifact | Result |
|---|---|---|---|
| [Beta client checklist](2026-10-08-beta-client-checklist.md) with addon 0.2.2 (collection, auctions, gold, `/ask`) | Carlos | build, module notes, receipts, redacted screenshots | open |
| Two raid nights in a guild | Carlos | attendance and lockout rows | open (beta closes 10/21) |
| Three-contributor upload loop | Carlos + testers | receipts, agreed public fact | open |
| Real phone check | Carlos | screenshots at phone width | open |
| Companion uploader and `/ask` bridge on a real Forever install | Carlos | `WTF` path, answers shown after `/reload` | open (code tested 2026-10-09) |
| Signed companion build | Carlos | signing credentials (`ops.signing`) | open |
| ChatGPT directory / subscription sign-in | agent, after hosting | — | open |
| Backup and restore rehearsal | Carlos decides, agent runs | [runbook](2026-10-09-recovery-runbook.md) | not configured |

Do not declare full launch complete on this checklist.
