# Everloot — release checks

## Automated and local checks

- `cd kb; npm ci; npm test -- --maxWorkers=2; npm run typecheck`
- `cd web; npm ci; npm test; npm run lint; npm run build`
- From the repo root: `uv run --with lupa python addon/tests/event_identity.py`
  `uv run --with lupa python addon/tests/collection_contract.py` and
  `uv run --with lupa python addon/tests/auction_contract.py`.
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

- Ready deployment, correct main SHA/custom aliases, and ten-minute snapshot cron.
- `/api/health`: snapshot object Last-Modified age, fresh within 30 minutes.
  Missing, stale, malformed/future metadata and storage failures return 503.
  Metadata age is not proof of complete indexing or successful quota pruning.
  The endpoint reads only signed R2 HEAD metadata, cached per instance for 60s.
- Reachable `/api/corpus/public`, correct sharing suppression, and unauthorized
  cron rejection. No synthetic fixtures in the public production corpus.
- Battle.net real sign-in, `/api/auth/me`, logout and expired/revoked sessions.
- Actual owner/officer authority review, scoped publication, revoke and member
  suppression. Synthetic grants are not real authority evidence.
- Public MCP HTTPS, unauthorized rejection, initialized tools, sourced knowledge,
  sanitized live gameplay read, restart recovery and a real client connection.
  A health response alone does not prove ChatGPT directory compatibility.

## Recovery and scale

- Follow the [recovery runbook](2026-10-09-recovery-runbook.md) for stale snapshots,
  orphans, upload removal and restore. Backup and restore are not configured or rehearsed.
- `cd web; npx tsx scripts/corpus-load.mts` measures merge, snapshot size, cold read and
  rollup on synthetic rows. Rerun it after storage changes.

## Held release evidence

Run the [beta client checklist](2026-10-08-beta-client-checklist.md), real phone,
two raid nights and three-contributor upload loop. Signing/distribution, companion,
desktop uploader, directory integration and remaining full-assessment findings
retain their existing scope. Do not declare full launch complete on this checklist.
