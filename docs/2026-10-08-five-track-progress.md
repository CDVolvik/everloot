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
`46b6ed6d2fae81a63fb5aaaa5a38619a664caf7b6ab28cf7e20b0feb000ac9f5`.

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
saved and verified. Carlos subsequently confirmed Generate New Secret. The fresh
secret was transferred privately to Vercel Production as Secret; client ID and
exact callback are Production Config. Chrome control recovered and environment
entry no longer shows the authenticator prompt. No account MFA completion is
claimed. Production redeployment `dpl_FHL1nVLjHQzXUQmfJzqybTP5B6Tb` is Ready
at `509abb5` on everloot.app/www with ten-minute cron. Live browser sign-in reaches
Battle.net OAuth Approval for Account ID/BattleTag and WoW profile. Carlos gave
action-time approval and completed the provider approval. Actual callback created
an authenticated session; `/api/auth/me` returned 200 with Battle.net identity
and BattleTag present. No private account values are in this evidence.

Logout returned 200/ok; `/me` returned 200/anonymous afterward. Replaying the old
session cookie also returned anonymous, establishing revocation for the real
session. Cookie flags were HttpOnly/Secure/SameSite=Lax. Temporary replay cookie
was removed and the browser left signed out of Everloot. Checks used same-origin
browser developer HTTP calls; direct JSON navigation was blocked by the browser.
Visible site login/logout controls are absent and remain a user-flow gap. Real
owner/officer publication/revocation and expired-session trials remain open.
Latest checked production `dpl_DDMy4BwkmVRUk9ZV8mbG6Ui7ShJx` is Ready at
`8eee50a` on everloot.app/www with ten-minute cron. Configuration screenshot is
Brain scratch `tmp/everloot-oauth-env-2026-10-08.jpg`, with all values masked.

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

Carlos's later steering keeps Render in the pipeline for a future free beta
deployment. Its account access is not supplied yet; do not provision under an
assumption that the login is complete. The earlier Vercel authenticator prompt
and Chrome timeouts were cleared on the later access check. Rotation was done by
the owner; no credential setup/rotation or account MFA submission was performed
by the agent.

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
launch closure. Remote CI and deployment evidence are recorded below.

## Published release evidence

Code `d2cf28f36d7c086f37ca8e23a06a93d9e2a5ea9a` pushed atomically to GitHub
main/recovery. Production `dpl_FS3w5YN7DwXo9QU1q4Q8fMTjNYQ5` /
`https://everloot-oi18j0zpc-r21digital.vercel.app` is Ready and aliased to
everloot.app/www, with `*/10` snapshot cron. The newer-listed deployment
`dpl_GQj8bLKLxRXwiB4mxbR6fNqiXbMg` is the branch preview, not production.
Live `/api/health` returned fresh/200 with snapshot last-modified
2026-10-08T16:50:28Z. Anonymous auth and empty public corpus returned 200.
Robots/llms are live; public beta zip downloads with the exact recorded SHA-256.
Live upload UI renders the beta download and sharing controls at 390px without
console errors. No synthetic public upload was created.

The private GitHub prerelease `mcp-knowledge-2026-10-05` contains both the exact
338,112,512-byte SQLite and 765-byte manifest. First abbreviated target SHA was
rejected without a release; retry used the full reviewed commit successfully.
Remote release-check run 37812194665 was the first check; its packaging failure
and successful replacement are recorded below. Image publishing was dispatched
after both assets were confirmed uploaded.
Local MCP restart returned healthy with matching hash and no OOM; test container
then stopped/removed. Read-only root requires a small writable /tmp for tsx.

First remote release-check run passed installs, KB/web suites/types/lint/build and
Lua execution, but found cross-OS zip metadata/compression differences. Packaging
now pins Unix file attributes and uses stored entries to avoid zlib differences.
The revised source-only zip hash above supersedes the first compressed zip
`50ddbf9c64340391029a69c823b67c2b338a45528d165f207449d3c0eb75ce99`;
addon source content is unchanged. Complete remote release-check run
[37813002820](https://github.com/CDVolvik/everloot/actions/runs/37813002820)
succeeded on `912a465b3f3d13ad20083b2fe333c11e52a21881`, including all KB/web,
type/build/lint, Lua and zip reproducibility checks. Production
`dpl_7UUDzRjQmeKe2jkwGUtYyTADP2Dp` is Ready on that exact code SHA, aliased to
everloot.app/www, with the ten-minute cron intact. Live beta download hash is the
revised hash above. The companion branch deployment is a preview.

MCP image publishing run 37812526741 completed successfully for reviewed commit
`d2cf28f`. Both commit/beta tags resolve to digest
`sha256:921c21c6d0f143de645779e4ca31c490f186044b8c6b696021b2ec2e88fb1448`.
The Render draft pins this digest. The package is not asserted anonymously
accessible; registry pull access must be verified/configured at deployment.
Private knowledge prerelease/assets and registry publishing do not mean public
MCP hosting is complete. Follow Carlos's pipeline deferral.
