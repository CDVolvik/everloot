# Everloot — release checks

## Automated and local checks

- `cd kb; npm ci; npm test -- --maxWorkers=2; npm run typecheck`
- `cd web; npm ci; npm test; npm run lint; npm run build`
- From the repo root: `uv run --with lupa python addon/tests/event_identity.py`
  and `uv run --with lupa python addon/tests/collection_contract.py`.
- Review every changed file and independent review findings before release.
- Check 390/768/1440px layout, keyboard menu, calculator and empty entity `noindex`.
- With advertising intercepted, inspect absent/reject/accept/withdraw network
  behavior and storage-write failure. These checks do not certify an advertising
  provider's required consent platform; do not enable production ads until that
  setup is established.

The GitHub workflow runs the code and Lua checks with a ten-minute job cap and
supersedes concurrent runs. It uses existing Actions allowances; no paid runner or
upgrade is configured. Account-wide allowance/spend settings still need checking
before triggering it. Passing locally does not establish that CI has run remotely.

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

## Held release evidence

Run the [beta client checklist](2026-10-08-beta-client-checklist.md), real phone,
two raid nights and three-contributor upload loop. Signing/distribution, companion,
desktop uploader, directory integration and remaining full-assessment findings
retain their existing scope. Do not declare full launch complete on this checklist.
