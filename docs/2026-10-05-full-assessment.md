# Everloot assessment — 2026-10-05

## Verdict

Everloot has a working web shell, tested data engines, and a storage-backed public read path. It is **not ready for the full launch promised in the current scope**. The immediate problem is trustworthy collection and publication: rejected records can enter rollups, replayed observations are counted twice, and officer publication has no verified officer authority. More frontend polish cannot close those gaps.

Keep the recorded direction: a player-collected Forever database, guild tools, and AI bridge. Fix the collection pipeline and expose it clearly before adding more tool landing pages. This assessment changes no application code, production data, DNS, provider settings, or launch scope.

## Evidence and limits

- Code inspected at `6accdb6`, `main`, in `D:\R21-Brain\projects\wowvault`; fetched origin and confirmed `main...origin/main` with no ahead/behind indication before documentation edits.
- Live checks against `https://everloot.app`: 21 public routes returned 200; unknown URL and `/llms.txt` returned 404. The fake, uncorroborated item URL `/database/items/999999001` returned 200 and `index, follow`.
- Live `/api/rollups/drops`: 1 upload, 1 record, 0 loot windows, no public rates, no queued drop rates, `unreachable:false`. This is consistent with the previously documented test upload, not evidence of real player adoption. A successful snapshot read does not prove the raw index and every raw object are healthy.
- Unauthenticated `/api/cron/snapshot` returned 401. No authenticated cron invocation, production upload, waitlist signup, or destructive probe performed.
- Existing suites: web **33/33**, KB **121/121**. KB `npm run typecheck` passed. Web `npm run build` passed; home first-load JS **94.3 kB**, calculator **90.2 kB**. Build output is not a Core Web Vitals measurement.
- Web `npm run lint` exited 1 at the interactive ESLint configuration prompt. There is no executable lint gate yet; a successful build did not establish lint clearance.
- `npm audit --json`: web **16 affected packages** (1 critical, 13 high, 2 moderate); KB **0**. Counts include development and transitive packages, not 16 independently proven production exploits. App pins Next.js `14.2.5`; evaluate each advisory against the deployed platform and features.
- Browser CSS viewport checks: **390, 768, 1440px**. At 390px, only the logo is visible in the header; at 768px, document/header scroll width is **899px** against a **753px** client area; at 1440px, no horizontal overflow in this check. At 390px, home scroll width was **393px** against a **375px** client area.
- Live calculator share-state test: 1 hour, 2 items at 10g each, 5g extra, 5% AH cut → **19g item subtotal / 24g total / 24g per hour**, as expected.
- Four read-only local probes reproduced rejected-record ingestion, replay counting, placeholder guild publication, and non-cheapest profession selection. An additional probe confirmed that 2,001 aggregate records are rejected.
- T3 navigation, JavaScript inspection and viewport resizing worked; screenshot snapshots failed twice. No screenshot-based visual verdict, composited contrast measurement, physical phone test, screen-reader test, in-client addon execution, load test, provider-account audit, delivery test, billing verification, or trademark/legal clearance is claimed. Motion quality remains unreviewed; Carlos's `/review-animations` gate is still separate.
- Beta close 10/21, CurseForge target around 10/24 and launch 11/04 are the **workspace's recorded milestones**, not independently verified release announcements in this assessment.

## What is already useful

- One shared implementation supplies web and MCP answers; this reduces divergent calculations.
- Drop publication uses distinct install counts rather than requiring every install to see the item. Missing facts and storage failures generally read as unrecorded; this is an important trust foundation.
- Item, NPC, quest, vendor, guild, collection, profession, auction and gold views exist beyond the homepage's old tool registry.
- R2 raw storage + Supabase index + a single corpus snapshot is a sensible early storage split. Migration enables RLS without public policies. This is source evidence; live RLS was not re-probed here.
- The MCP HTTP handler binds loopback and supports a bearer token; the cron fails closed without authorization.
- The calculator works with share links. Public pages return rendered content with meaningful titles and most inspected pages have canonicals.
- Gold reporting explicitly avoids accusing a player of buying gold or implying a ban. Preserve that distinction.

## Findings, ordered by impact

P0 = repair before inviting public submissions or named-data publication. P1 = required for a credible launch. P2 = follow after the collection loop is reliable. Priorities are assessment judgments; reproduced behavior is distinguished from source-only risks below.

### P0 — publication and data integrity

**F01 — Rejected rows still enter the trusted corpus (reproduced).** `web/src/app/api/intake/route.ts:50` passes the original payload to `putUpload` whenever at least one record is accepted. Storage serializes that payload; downstream readers do weaker structural checks. A payload with one valid loot row and one rejected row with empty install ID produced **2 kills, 2 drops, 2 reporters** downstream. This also retains unknown extra properties that schema parsing would normally strip.

Acceptance: only parsed, accepted records enter the public corpus. Quarantine raw submissions separately if needed. Regression test a mixed payload through intake → persistence → snapshot → public rollup; rejected rows and extra fields must never influence public facts.

**F02 — Officer claims are placeholders, not authority (reproduced).** Intake accepts any `claimToken` of length 16+. The addon uses `pending-officer-claim`; `kb/src/guild-board.ts:265` checks length rather than ownership. Two local records with that placeholder published one roster member. Progression, attendance and loot records also lack verified publication authority. The privacy and upload pages promise officer-only publication.

Acceptance: a server-issued, validated guild/realm-scoped claim authorizes named publication, with revocation and opt-out handling. Placeholder, invented, expired and wrong-guild claims must fail; two arbitrary install strings must not publish a roster. Keep named data held until this is enforced.

**F03 — Reuploads inflate observations and gold income (loot replay reproduced).** No event identity or idempotency key is enforced. Every upload gets a new UUID; snapshots append all records. `rollupDrops` counts every window, including the same row twice. The addon retains rolling history and the upload page sends the whole file again, so overlap is normal, not just hostile behavior. Gold income also sums event rows.

Acceptance: stable event IDs plus deduplication across files, retries and snapshots. Replaying a whole file changes neither kills, drops nor income; uploading the old file plus one new event increments only once. Deletion/rebuild must preserve those guarantees.

**F04 — Public contributor independence and rate limiting are not established (source-only).** `installId` is client-controlled, mixed IDs are allowed in one payload, and rate limiting keys off the first raw record. Limits live in process-local maps, so they reset and do not coordinate across Vercel instances; waitlist uses a similarly local, raw-email key. Three strings do not establish three independent contributors. There is no route-level byte budget before JSON parsing.

Acceptance: define the trust model honestly; enforce shared quotas by registered contributor and network source, bind accepted records to that identity, limit bytes and counts, and add duplicate/anomaly quarantine. Preserve anonymous play data without advertising fabricated independence as verified.

**F05 — Next.js is substantially behind security fixes (dependency audit + official advisory).** `web/package.json` pins `14.2.5`. Audit labels the `next` package critical and lists multiple advisories. This does not prove that every listed vulnerability is reachable on this Vercel deployment. Next.js's [official December security update](https://nextjs.org/blog/security-update-2025-12-11) already required a newer 14.x patch; consult current advisories and support policy before selecting the remediation version.

Acceptance: update Next.js and compatible lint tooling on a branch, assess all remaining runtime advisories, rerun suites/build, and verify upload, database and calculator flows on preview before deploying. Do not blindly use `npm audit fix --force` across major versions.

### P1 — the collection loop and launch promise

**F06 — The addon cannot yet substantiate drop-rate or spawn accuracy (source-only, needs client tests).** `addon/modules/openworld.lua:78` attributes a loot window to the current target, not a verified loot-source GUID. Reopening a window is another observation; no-loot kills may never create a window. Coordinates are the **player's position**, and missing position becomes map/x/y zero. It does not collect object-source loot even though the server supports it. Thus “one window = one kill” and NPC-position claims need validation. Lua guarded-call expressions such as `GetGuildRosterInfo and GetGuildRosterInfo(i)` also need a runtime test of their multiple return values; roster fields should not be assumed populated from a syntax pass.

Acceptance: in-client fixtures for changed/no target, multi-source loot, reopened loot, no-drop kills, chest/node loot, missing maps, and NPC distance; explicit source/distance/unknown semantics. Test exact quantities and guild roster fields against SavedVariables and intake. Report loot-window frequency rather than kill probability until a valid denominator is collected.

**F07 — A normal SavedVariables file can exceed intake's aggregate cap (reproduced contract mismatch).** Addon permits **2,000 rows per kind**; parser flattens all kinds; API allows **2,000 total**; uploader submits the entire file. A 2,001-record upload is rejected before the route's intended 413 branch.

Acceptance: bounded batches with resumable receipts and deduplication; show progress and preserve unsent events. Test a real multi-kind file above the cap, partial failure and retry.

**F08 — Full-launch components are still missing (repo/tracker evidence).** Public HTTPS MCP is pending; tools depend on `EVERLOOT_UPLOADS` while web reads the cloud store. No desktop auto-uploader or in-game `/ask` companion implementation was found in this repo. Subscription sign-in remains a tracker requirement, not shipped behavior. Addon README explicitly says it has not yet loaded in the beta client. Those are part of the recorded full-launch promise.

Acceptance: implement each required track with an end-to-end demo against the same production corpus, or record an explicit owner-approved scope change. A local MCP test is not ChatGPT connectivity; a webpage is not an in-game answer or signed desktop installer.

**F09 — Important datasets cannot currently be collected by the shipped addon (source inspection).** There is no recipe/price, collection-catalog/owned or quest-record emitter; raid loot awards also remain pending. Profession, collection and quest engines accept manually constructed payloads, but that does not make a player data supply pipeline. Farming routes is a descriptive/waitlist page, with no route map, loop optimizer or respawn implementation shown.

Acceptance: trace every advertised dataset from an in-client event to an upload, corroborated fact and usable page. Mark genuinely unavailable tools “collecting data” or “planned,” rather than claiming route/respawn features already work.

**F10 — “Cheapest profession path” is false for the current algorithm (reproduced).** `kb/src/profession-path.ts` chooses points per reagent unit, not copper cost or a globally optimal route. With three agreeing installs, the probe chose one Rare reagent costing **100,000 copper**, over two Common reagents costing **200 copper** for the same skill gain. Realm/build/time price scope is also absent from `price_seen`.

Acceptance: either implement price-aware optimization with appropriate realm/time context and gap handling, or describe the actual heuristic. Cover this counterexample, future bracket boundaries and missing prices in tests.

**F11 — Homepage and navigation conceal the working product (live + source).** Header cards route Database to `/tools/database` and Guilds to `/tools/guild-tracker` waitlist pages, while `/database` and `/tools/guild-board` exist. Upload has no home/header/footer path. Four old “soon” cards dominate the toolkit; the primary CTA remains the calculator. Profession pages expose `EVERLOOT_UPLOADS` implementation details to players. Guild-score promises persist despite deliberately unpublished weights.

Acceptance: one authoritative capability registry; database/search, contribute/install and guild workflows are reachable. Preserve useful existing URLs or redirect deliberately. Explain data coverage and launch state in player language; show no score promise until its rule is published.

**F12 — Mobile navigation is absent; tablet header overflows (live).** At 390px the header exposes only the home logo. At 768px, the eight-link navigation needs **899px** and creates document overflow. Home also has a small overflow at phone width.

Acceptance: usable keyboard/touch navigation at 390 and 768px; no horizontal document overflow at 390/768/1440px; database and upload remain reachable from interior pages. Verify on a physical phone separately.

**F13 — Privacy promises exceed implementation; named gold publication needs an explicit choice (live + source).** Privacy page is dated April 2026 and says any character can opt out; no server-side opt-out/suppression flow was found. Gold defaults on, stores character/realm/current/peak, and the public gold page looks up by character/realm without authentication. Upload preview summarizes kind counts and does not provide a per-category publication choice. The raw JSON can be inspected, but that is not a clear consent workflow.

Acceptance: separate anonymous contributions from named guild/character/gold sharing, default private where appropriate, explain recipients/storage/retention, and implement revoke/delete/suppress → snapshot rebuild. Verify `hello@everloot.app` reaches a watched inbox; delivery was not tested here. This is an implementation and trust finding, not legal clearance.

**F14 — Snapshot freshness, recovery and scale are not observable (source-only).** Reads discard `generatedAt`, never enforce a maximum snapshot age, and use a five-minute process cache. A stalled cron can serve old facts while the API prints a fresh response-generation time. Every dynamic page loads the full raw corpus object and computes its view. Concurrent writers have no conditional-write guard. Partial cloud configuration silently chooses local storage; R2 success followed by index failure can leave an orphan.

Acceptance: surface corpus age/status, monitor cron success and ingestion lag, fail closed on partial production config, document orphan/deletion/rebuild recovery, and restore from independent backup. Add indexed/materialized reads when measured corpus size and latency justify them; do not prematurely redesign storage. Run a representative load/rebuild test before launch.

**F15 — Launch and distribution evidence is still incomplete (status/tracker).** Beta load/raid tests, actual addon packaging, Windows signing, public MCP connection, directory/subscription integration, trademark check, wiki permission and Supabase plan readiness remain unresolved or unverified. Existing test data cleanup was declined twice; it is not authorized by this assessment.

Acceptance: a release checklist with owner, artifact and actual result for each item; code freeze and in-client evidence before the recorded 10/21 beta cutoff. Verify plan/billing and backups before the recorded 11/04 launch. Keep wiki import restrictions and the prohibition on gameplay automation.

### P2 — discoverability, accessibility and quality gates

**F16 — Search discovery retains the old brand and empty duplicate destinations (live).** `/robots.txt` advertises `https://goldgoblin.gg/sitemap.xml`. Home lacks a canonical; most inspected inner pages have one. Sitemap includes the four waitlist destinations alongside actual data/tool URLs. Arbitrary uncorroborated item pages return 200/indexable. No JSON-LD on inspected home; `/llms.txt` is 404; social metadata requests a large image but layout defines none.

Acceptance: correct robots sitemap URL, canonical home, intentional indexing policy for placeholders and unrecorded entities, coherent sitemap, useful social preview and structured data matching visible facts. Verify GSC/Bing ownership separately. `llms.txt` is optional documentation, not a ranking guarantee or substitute for the pending public MCP.

**F17 — Calculator accessibility has concrete gaps (live DOM).** Item name, quantity and price inputs have neither associated labels nor ARIA names; each renders at **14px**. Several buttons measure only **28–38px** high. The shared focus-visible rule is a useful starting point, but it does not supply input names or comfortable touch targets.

Acceptance: meaningful accessible names for each repeated row, 16px phone inputs, suitable touch target spacing/size, accessible errors/status, and keyboard/screen-reader verification. The 14px observation suggests an iOS zoom risk, not a reproduced physical-device bug.

**F18 — Consent banner does not gate ad loading (source-only conditional defect).** `CookieConsent` stores a local choice; layout loads AdSense whenever `NEXT_PUBLIC_ADSENSE_CLIENT` exists, irrespective of Accept/Reject. No active ad request is asserted here; this becomes a defect when ads are enabled. There is no preferences-reopen control.

Acceptance: loading and configuration respect the saved choice and supported consent requirements; reject/accept/change-choice tests inspect actual network requests before enabling ads. Establish the applicable consent mechanism using current provider guidance.

**F19 — Test coverage is strong on pure engines, weak at system boundaries (verification).** Suites pass, but none prevent F01/F02/F03/F07/F10. No `.github` CI workflow was found; lint asks for configuration. Status begins with obsolete Retail/iOS scope and only later supersedes it; tracker calls the untested addon “Live” while engine-backed pages remain “Next.” The workspace's next-task pointer still names gap marking even though repo status marks it done.

Acceptance: noninteractive lint/typecheck/test/build CI, focused boundary regressions for P0/P1 findings, a concise current-scope status header, and tracker states distinguishing implemented / deployed / tested in client / publicly connected / useful with real data.

### Closeout follow-up — F20 (P1): implicit DB path opens an empty KB

Verified during 10/05 server preparation: populated data lives at `kb/data/wowvault-kb.sqlite`, while CLI default is `data/everloot-kb.sqlite`. A default invocation created an empty DB and validation reported `ok`; the empty diagnostic DB was removed. Explicit-path stats on the populated DB returned 257,110 lore rows and 1 curated row, and validation passed. Missing files should fail closed when serving, and a structurally valid empty KB is not a ready knowledge server. Pin explicit paths and expected coverage in deployment checks; do not silently rename or replace the live DB. See `NEXT_SESSION.md` for exact commands and the validated filtered snapshot.

The assessment now has **20 open findings**. No application remediation occurred during closeout. A filtered public snapshot and authenticated local MCP smoke test were prepared; public hosting and the gameplay-data connection remain pending.

## Product and design judgment

The recorded gold/dark Leonardo-influenced direction and dials **7/7/4** belong to Carlos; this assessment does not reopen that choice. The main weakness supported by current evidence is **proof and utility**: no real public rates, no obvious contribution/download path, technical prose in player flows, and repeated feature claims for pages that collect interest rather than answer a question. A real beta screenshot and real corroborated item/route will communicate the product better than another ambient effect. Screenshot-based aesthetics, contrast and motion quality were not assessed successfully in this pass.

The most important launch loop is: **install → play → preview/share → receipt → see a trustworthy fact → return next session**. Test that whole sequence with three real independent contributors and a guild with authorized publication. A calculator proves a useful utility; it does not prove that loop. No acquisition, retention, email delivery or revenue evidence was available, so business viability is unmeasured.

## Recommended execution order

1. **Trust boundary:** F01–F05, plus explicit named-data sharing from F13. Verify hostile/mixed/replayed payloads locally and on preview without polluting production. Do not expand collection until authority and deduplication work.
2. **Playable data loop before beta closes:** F06–F09 and F07 batching; publish in-client logs, actual SavedVariables fixtures, receipt and corroborated page evidence. Carlos supplies client access/test play and the officer authority decision.
3. **Make the existing product usable:** F10–F12, F16–F18. Repair navigation, feature-state copy, accessibility and discovery; retain approved visual identity. Validate at phone/tablet/desktop widths and on a real phone.
4. **Finish the promised launch tracks:** F08/F14/F15/F19. Public MCP and shared data path, companion, uploader/signing, CI, freshness monitoring, recovery and a release checklist. Any reduction in the recorded full launch requires a new scope decision.

First implementation slice: canonical accepted-record ingestion + event idempotency, with regression tests through storage and rollups. It prevents future beta data from becoming corrupted and gives every later feature a reliable base. Next slice: verified guild claims and sharing controls.

## Remaining owner inputs and held work

- Beta client run, guild/officer publication authorization, two raid nights, and real screenshot.
- Signing/distribution credentials or approved alternative, trademark check, wiki permission, hosting plan confirmation and AI-client authentication decision.
- Existing production test-row deletion remains declined. Do not delete the index/object/waitlist or rebuild merely to make this assessment's counts look clean.
- No deploy, PR, account change, package upgrade or remediation implemented in this assessment. Documentation is the only saved change.
