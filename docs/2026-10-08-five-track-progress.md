# Everloot — five-track continuation, 2026-10-08

Carlos authorized driving all five tracks, with Chrome access when needed. The
free-services-only restriction remains: no Fly machine or Supabase upgrade. The
existing R21 Vercel team is paid Pro; this work adds no new subscription. GitHub
Actions/Packages account budgets were inspected: $0 budgets with Stop usage Yes.
No budget setting was changed.

## Collection and profession correctness

Addon 0.2.1 uses loot API GUID/quantity pairs, splits area-loot sources, retains
corpse identities across reopen/reload, and marks only successful stores seen.
It never guesses loot from the target or infers an empty-window kill. Player map
positions are explicit and missing coordinates are skipped. Guild roster getters
now preserve multiple Lua returns. Old target-guessed loot stays out of source
rollups; player/unknown coordinates cannot become NPC pins. Install/source labels
remain client assertions. Counts retain legacy `kills` field names for API
compatibility but display observed loot windows, not kill probabilities.

First-window-per-GUID suppression cannot distinguish pickpocket/corpse/skinning.
Source API compatibility and collection completeness require the real beta
client. [Client checklist](2026-10-08-beta-client-checklist.md). A reproducible
TOC-only zip is prepared at `web/public/downloads/Everloot-0.2.1.zip`, SHA-256
`50ddbf9c64340391029a69c823b67c2b338a45528d165f207449d3c0eb75ce99`.

Profession routing compares total observed craft costs across skill unlocks,
handles multi-point crafts, gaps and unknown costs, and resolves ties consistently.
Its price samples lack realm/build/time scope; it promises estimated routes,
not a current realm minimum or independently verified contributors.

## Web utility and discovery

Direct database/upload paths, responsive keyboard menu, actual feature states,
legacy redirects, unknown-entity noindex, home canonical/Website JSON-LD,
canonical sitemap and llms documentation. Calculator controls have labels,
16px inputs and touch targets. Advertising loads only on acceptance; preferences
can reopen. Failed rejection writes use a session veto or fragment before clean
reload. When all storage writes fail, retaining that fragment is necessary on
reload; withdrawal is not synchronized across tabs. Production ads remain off
pending provider consent-platform requirements.

Worker browser checks passed at 390/768/1440 without horizontal overflow and
for keyboard focus, calculator and intercepted ad requests. Evidence is in the
Brain scratch `tmp/everloot-web-validation-2026-10-08.json`; no real ad requests
or production upload fixtures were sent. Emulation is not a real phone trial.

## Login, sharing and free MCP hosting

Chrome access to Battle.net worked. Existing WoWCollectorTracker client renamed
Everloot; service URL and callback `https://everloot.app/api/auth/bnet/callback`
saved and verified. Historical secret was documented exposed; Carlos was asked
to perform Generate New Secret. Fresh Vercel secret configuration, real sign-in,
logout and actual owner/officer publication/revocation remain pending.

Carlos asked for managed free hosting rather than an always-online machine.
Render Free is a beta candidate: 15-minute idle sleep, about one-minute wake,
750 shared free hours, ephemeral filesystem and usage suspension/overage rules.
Require no payment method and inspect usage before provisioning. No Render
service is deployed yet; its Chrome sign-in page is handed off. A knowledge-only
GHCR build workflow and Render free-plan draft are prepared. Immutable knowledge
is included in the image; gameplay comes only from Everloot's sanitized public
API. Never put web Supabase/R2 credentials or raw uploads on the MCP host.

New image starts non-root with a read-only root, writable /tmp, 512MiB/0.5CPU;
steady observation ~72MiB. Knowledge hash remains
`d21bb3c414db9f5f40a3146fe78d0ba3e7071eb083c59003fbf6062bd8ab41eb`.
Local container proof does not establish Render deployment or real MCP client
connectivity. Pin a registry digest and configure its generated bearer privately.

## Monitoring and verification

Signed R2 HEAD-based snapshot age endpoint `/api/health` reports fresh/stale/
missing/unavailable, fails closed and caches 60 seconds per process. This observes
object age, not coverage, validity, authority or actual quota-prune success.
GitHub release checks and image publishing workflows are prepared, bounded to
ten-minute jobs. [Release checklist](2026-10-08-release-checklist.md).

Local verification: 178 KB tests pass with two workers and typecheck passes;
127 web tests/typecheck/build pass, three pre-existing lint warnings; Lua 5.1
identity and collection execution pass. Full-parallel KB startup once exceeded
its existing three-second wait; isolated and bounded-worker suites pass.
Independent review found one consent-write failure bug; fixed and re-reviewed,
with no remaining blockers in the bounded reviewed code. This is not a full
launch closure. CI and deployments remain unverified until explicitly recorded.
