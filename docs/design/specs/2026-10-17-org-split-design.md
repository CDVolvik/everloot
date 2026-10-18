# Everloot as a GitHub organization, one repository per platform

**Date:** 2026-10-17
**Status:** design approved by Carlos (owner) on 2026-10-17. Phase 1 is partly done (see below).
The steps are in [`../plans/2026-10-17-org-split-plan.md`](../plans/2026-10-17-org-split-plan.md).

## Purpose

Everloot competes with Wowhead and MMO-Champion. It should look and run like a platform: a clean
organization, one repository per platform, clear connections between them, open edges and a private
core. Four reasons, all of them required:

1. **Look like a platform.** A visitor to `github.com/Everloot` sees what Everloot is made of and how
   the parts connect.
2. **Keep the data core private.** The pipeline that turns uploads into published facts (rollups,
   anti-spam, quotas, storage) is where the work is. New work on it should not be public.
3. **Ship each app on its own.** The addon, the desktop helper, the SDK and the site release on their
   own schedules, with their own versions.
4. **Let separate teams or contractors own separate repositories,** with access to only what they
   work on.

## The design

### Repositories at the end of Phase 3

| Repository | Visibility | Holds | Comes from | Release |
|---|---|---|---|---|
| `Everloot/.github` | public | Organization profile, default community files, data policy and trademark notice | new | none |
| `Everloot/protocol` | public | Upload record kinds and limits, API response shapes with attribution, MCP tool schemas | `packages/protocol/` with history | `protocol-vX.Y.Z`, npm `@everloot/protocol` |
| `Everloot/sdk` | public | TypeScript client, SavedVariables parser and upload batching, local stdio MCP server | new (first built as `packages/sdk/`) | `sdk-vX.Y.Z`, npm `@everloot/sdk` |
| `Everloot/desktop` | public | Today's `companion/`: uploader, `/ask` bridge, price writer | `companion/` with history | `desktop-vX.Y.Z` |
| `Everloot/addon` | public | The in-game addon | this repository, renamed and cleaned | `addon-vX.Y.Z` (already in use) |
| `Everloot/web` | private | everloot.app (Next.js on Vercel) | `web/` with history | deploys on merge to `main` |
| `Everloot/platform` | private | Knowledge-base pipeline, rollups, anti-spam, quotas, Supabase migrations, MCP engine | `kb/` and `supabase/` with history | GitHub Packages `@everloot/platform` |
| `Everloot/ios` | private | The iOS app | new, when iOS work starts | set when iOS work starts |

### Phase 1, now: the organization

Carlos creates the `Everloot` organization on the free plan and transfers the repository into it.
Issues, pull requests, stars and releases move; old URLs redirect. The Vercel GitHub app is
installed on the organization and `everloot-web` is relinked. Branch protection, secrets,
Dependabot, `release.yml`, the upload page's download links, `llms.txt`, `/connect`, repository links
in README and docs, and the addon metadata are rechecked. A new `Everloot/.github` repository carries
`profile/README.md`: a connection diagram (addon → upload → platform → web, API and MCP → AI
assistants, with desktop and iOS beside them), one line per repository marked public or private, and
the trademark disclaimer.

**Done on 2026-10-17:** the organization exists as `Everloot` (free plan, owned by Carlos's personal
account). The repository is `Everloot/everloot`; `github.com/CDVolvik/everloot` answers 301 to it.
Branch protection survived (`guards` and `verify` required, no force push, no deletion), and the six
open pull requests moved with it. The Vercel GitHub app is installed on the organization for all
repositories, and `everloot-web` shows `Everloot/everloot` as connected.

### Phase 2, before the Forever launch on 2026-11-04: `packages/protocol`

A package inside this repository, published to npm as `@everloot/protocol` (npm organization
`everloot`). It is the single source of truth for:

- the upload record kinds and their limits;
- the public API response shapes, including the attribution block;
- the MCP tool input and output schemas.

It ships JSON Schema files and TypeScript types generated from the same definitions. The addon's
contract tests read the same JSON Schema files as fixtures, because Lua cannot import an npm package.

Versioning follows semver. A new record kind, field or tool is a minor release. Removing or renaming
anything, making a field required, or tightening a limit is a major release. The server accepts the
current major and the previous one.

### Phase 3, after launch, in this order

1. **protocol** moves to its own repository, with history (`git filter-repo`).
2. **desktop** (from `companion/`, with history) and **sdk** (new: the TypeScript client and the
   local stdio MCP server, extracted from `kb`).
3. **web** (private) and **platform** (private: the kb pipeline, rollups, anti-spam, quotas and
   Supabase migrations), delivered to web as a private package through GitHub Packages.
4. **addon**: this repository renamed to `Everloot/addon`, keeping its stars, history and issues,
   cleaned to the addon only.

Issues are transferred to the repository that owns them. everloot.app is cut over to the web
repository only after a preview of the new setup passes, with no downtime. `Everloot/ios` is created
when iOS work starts.

### Licence

Every commit so far is by the owner, R21 Media Group, LLC, so new code may be private. Code already
published stays under AGPL-3.0-only. The README wording becomes "open protocol, addon and SDK;
private platform". The data licence is a separate decision that is still open; this design does not
decide it.

### Standards for every repository

- Organization defaults in `Everloot/.github`: issue and pull request templates, CONTRIBUTING,
  CODE_OF_CONDUCT, SECURITY, and one label set.
- The same branch protection on every repository.
- One README layout: what it is, status, install, how it connects, licence.
- One public roadmap Project across repositories.
- Release tags per app (`addon-vX.Y.Z`, `desktop-vX.Y.Z`, `protocol-vX.Y.Z`, `sdk-vX.Y.Z`) and a
  CHANGELOG in each repository.
- Dependabot, code scanning and CODEOWNERS on every repository.

## The real dependency map (2026-10-17, `main` at `079c96e`)

What couples the parts today, and what each coupling means for the split.

| # | Coupling | Where | Consequence |
|---|---|---|---|
| 1 | **One record contract, in web.** 31 kinds as zod schemas, the `recordSchemas` registry, `ALL_RECORD_KINDS`, `PUBLIC_RECORD_KINDS` (20-kind allowlist), the completion kind lists and the envelope (`addonVersion` 1–20 chars, `records` 1–2000) | `web/src/lib/intake.ts:11-474`; parsing at `:476-578` | This file is the core of `packages/protocol` |
| 2 | **kb imports web for the contract** | `kb/src/corpus.ts:1`, `completion-rollup.ts:20-21`, `publication.ts:1`, `mcp-server.ts:17`, four kb tests; `kb/Dockerfile` copies `web/src/lib/intake.ts` | Removed when both import the package |
| 3 | **web imports kb back for the contract**, a cycle | `intake.ts:2` takes `validRealm` from `kb/src/market.ts:53-58`; `upload-batches.ts:2` takes `sharingCategory` from `kb/src/publication.ts:20-26` | Both move into protocol; they describe records, not the pipeline |
| 4 | **Limits outside the schema** | Body over 1,000,000 bytes is refused (`api/intake/route.ts:44`); at most 4 grant tokens (`:62`); scans from at most 3 realms per upload (`MARKET_LIMITS.realmsPerUpload`, `kb/src/market.ts:39-47`); client batches of 600,000 bytes and 2,000 rows, at most 100,000 records per file (`upload-batches.ts:12-16`) | Move to one `UPLOAD_LIMITS` constant. Hourly quotas (`intake-quota.ts:58-61`) stay server policy |
| 5 | **A client and server limit disagree.** The client accepts `addonVersion` up to 32 characters, the server up to 20 | `upload-batches.ts:14` vs `intake.ts:471` | The protocol states 20, the limit that is actually enforced |
| 6 | **A second, stricter `auction_snapshot` schema** (unit price at least 1, an added `reporter`) | `kb/src/market.ts:126-135` | Stays in the platform: it is the rollup's input filter, not the upload contract |
| 7 | **The addon follows the contract by hand.** It writes 26 of the 31 kinds; caps live in `core.lua:9` and the modules; the only link to the schema is comments | `addon/core.lua`, `addon/modules/*.lua` | Contract tests start reading the generated JSON Schema |
| 8 | **Addon tests check fields with hand-written lists** and never read web or kb. They run the real Lua under `lupa` | `addon/tests/*_contract.py`, run by `checks.yml:66-69`, `nightly.yml`, `release.yml` | One helper validates the rows each test already produces |
| 9 | **The companion imports web code**: the SavedVariables parser and upload batching, and through them kb's `publication.ts` and `market.ts`. It borrows zod from `web/node_modules` | `companion/src/uploader.ts:2-3`, `prices.ts:3`, `bridge/asks.ts:1`; `companion/tsconfig.json:12` | The parser and batching move to the SDK before desktop can leave |
| 10 | **The companion is a command-line tool** run through `tsx`, with no build, installer or release | `companion/package.json` (`bin` is `src/cli.ts`) | `Everloot/desktop` starts as this CLI; a desktop app is later work |
| 11 | **Fixtures cross from companion to addon.** Companion scripts write `EverlootAnswers.lua` and `EverlootPrices.lua`, which addon tests read | `companion/scripts/write-{answers,prices}-fixture.ts`, `addon/tests/fixtures/` | A file format between two future repositories |
| 12 | **web imports kb in about 40 non-test files** (rollups, corpus, market, publication, lore database, world map, changes, ecosystem, attribution, MCP server) and reads kb data files (`kb/changes/*.json`, `kb/curated/ecosystem.json`). `next.config.js:61-71` compiles kb's TypeScript | `web/src/lib/*`, `web/src/app/*` | The platform must become a package with an export map before it can leave |
| 13 | **kb writes into web and the addon.** Build watch writes `web/src/data/game-data/*` and `addon/modules/raid_data.lua`; `client-map` writes `map.json`. kb tests read `web/.../map.json`, `docs/TRACKER.md` and `addon/Everloot.toc` | `kb/src/build-watch/*`, `kb/src/cli.ts:373` | After the split these become pull requests opened in other repositories |
| 14 | **Server-side rules live in web**: quotas, the data guard and API keys, upload storage and budgets, rollup computation, sharing grants, usage counters | `web/src/lib/{intake-quota,data-guard,api-keys,upload-store,rollup-compute,rollups,completion-store,sharing-store,usage-metrics}.ts` | "Anti-spam and quotas" in the platform means moving these out of web |
| 15 | **MCP: 19 tools** with zod input shapes and **no output schemas** (every tool returns text). One engine, three transports (stdio, loopback HTTP, the site's `/mcp` and `/mcp/public`). The names are copied in `connect-data.ts:10` and checked by tests that read `mcp-server.ts` as text. The README says 16 tools | `kb/src/mcp-server.ts:332-672`, `web/src/lib/mcp-mount.ts`, `web/src/app/connect/connect.test.tsx:28`, `web/src/lib/llms.test.ts:8` | Input schemas move to protocol. Output schemas must be written; see below |
| 16 | **Public API shapes are written inline** in each route. Attribution comes from `kb/src/attribution.ts` through `web/src/lib/data-guard.ts:32-43` | `web/src/app/api/{corpus/public,market/prices,rollups/drops,intake,health}/route.ts` | Protocol describes them; route tests assert them |
| 17 | **Supabase is used by web only.** kb never calls it. Migrations are applied by hand; no workflow runs them | `supabase/migrations/*`, `web/src/lib/*` | Low risk to move |
| 18 | **The upload page serves a committed zip.** `package-addon.py` writes `web/public/downloads/Everloot-<v>.zip`, `addon-release.ts` lists that folder, and `release.yml` fails if the zip is not committed | `scripts/package-addon.py:16`, `web/src/lib/addon-release.ts:10` | web must fetch the zip from addon releases before the addon leaves |
| 19 | **The repository name is hard-coded.** Six workflow guards `github.repository == 'CDVolvik/everloot'` in `build-watch.yml`, `changes.yml` and `ecosystem.yml`; counting those, 44 lines naming `CDVolvik/everloot` in 28 files outside `docs/design/` | see plan tasks 1.4 and 1.6 | The guarded bot jobs are skipped since the transfer |
| 20 | **Release and image tied to this repository.** `mcp-image.yml` downloads release asset `mcp-knowledge-2026-10-05` from its own repository and pushes `ghcr.io/<owner>/everloot-mcp`; `kb/render.yaml:8` pins `ghcr.io/cdvolvik/everloot-mcp` | `.github/workflows/mcp-image.yml`, `kb/render.yaml` | The next image goes to `ghcr.io/everloot/...`; the release asset moves with the platform |
| 21 | **Scheduled bots cost Actions minutes once private.** Build watch and change refresh each run every 30 minutes; GitHub bills each job rounded up to a minute, so each costs about 2,900 minutes a month | `build-watch.yml`, `changes.yml` | Free in a public repository; over the free plan's private allowance in a private one |

## Where reality changes the approved design

These are the points where the design cannot be built exactly as written. Each has the resolution the
plan uses; the ones marked **decision** need Carlos.

1. **MCP output schemas do not exist.** Every tool returns plain text with a credit line. Protocol
   1.0.0 publishes all 19 input schemas and states the output as text content ending in the credit
   line. Structured output (`outputSchema` plus `structuredContent`) is added tool by tool in later
   minor releases.
2. **The schemas cannot be authored as JSON Schema without changing what the server accepts.** About
   ten rules compare two fields or call a function (`criteria` never outnumbers `criteriaCount`,
   `floor <= ceiling`, `part <= parts`, `validRealm`, real calendar dates). JSON Schema cannot express
   them. The definitions stay in zod inside `packages/protocol`; JSON Schema (`z.toJSONSchema`) and the
   TypeScript types are generated from them, and each cross-field rule is written out in the
   generated schema's description. The JSON Schema is the language-neutral contract; the server stays
   at least as strict.
3. **The local stdio MCP server is the private engine.** It answers from the knowledge release and the
   upload corpus through the rollups. Extracting it into a public SDK would publish the core. The SDK's
   stdio server is therefore a thin proxy: the same tool list and input schemas from protocol,
   forwarding each call to `https://everloot.app/mcp/public` (or `/mcp` with a key). It no longer works
   offline.
4. **The desktop app does not exist yet.** `Everloot/desktop` starts as today's CLI. Its upload code
   is web code (`sv-parse.ts`, `upload-batches.ts`), so the SDK must exist before desktop can build on
   its own. That is why sdk is built inside this repository first.
5. **Quotas and anti-spam are in web, not kb** (row 14). Moving them into the platform is part of the
   platform step, not a by-product of moving `kb/`.
6. **One npm scope on two registries.** Public packages go to npm as `@everloot/*`. GitHub Packages
   requires a private package in the organization to be `@everloot/platform`. An `.npmrc` maps a scope
   to one registry, so web cannot install `@everloot/protocol` from npm and `@everloot/platform` from
   GitHub in the same project. Resolution: the protocol and SDK release workflows publish each version
   to both registries, and the private repositories read the whole `@everloot` scope from GitHub
   Packages.
7. **GitHub's free plan for organizations does not protect private repositories.** Branch protection
   and rulesets on private repositories, and code scanning on private repositories, need a paid plan.
   Private repositories also share 2,000 Actions minutes a month, and the two 30-minute bots alone use
   about 5,800 (row 21). **Decision:** stay on the free plan and accept unprotected, unscanned private
   repositories (CI still runs; the plan uses a pre-merge checklist), with the scheduled bots on a
   self-hosted runner that the owner operates; or move the organization to GitHub Team, which is paid
   per seat and conflicts with the 2026-10-07 "free services only" rule. The plan assumes the free
   plan until Carlos chooses.
8. **A public Project hides items from private repositories** from anyone without access. The public
   roadmap tracks private work as draft items or as issues in `Everloot/.github`.
9. **Already-published code stays published.** The addon repository keeps this repository's history,
   so the web and kb code as of the split stays readable there, and in any fork, under AGPL-3.0-only.
   "Private core" applies to work after the split. Rewriting the addon history would break the
   release tags and is not planned.
10. **Community entry points for private parts.** The wrong-data form, site bug reports and the good
    first issues for kb and web would vanish into private repositories. They move to `Everloot/.github`
    (issues enabled), and maintainers transfer an issue to a private repository when it becomes work.
    GitHub allows a transfer from public to private, not the reverse.
11. **The site links policy documents in this repository** (`docs/DATA_POLICY.md` from `map.json` and
    the pull request template). They move to `Everloot/.github`, with a stub at the old path.
12. **Copies outside the organization.** `CDVolvik/everloot-private` (the old private history, pull
    requests #1–#63) and a GitLab mirror of the old history exist. Neither moves into the organization,
    and neither is a source for any split: every `git filter-repo` runs on a fresh clone of
    `Everloot/everloot`. What to do with them is already an open owner decision.
13. **Never flip a public repository to private.** GitHub erases stars and watchers when a public
    repository becomes private. web and platform are created private from filtered history; nothing
    changes visibility.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Bots skipped since the transfer (row 19) | Phase 1 task 1.4 fixes the six guards first; verified by a manual run |
| The bots have no token: the repository has no Actions secrets, so their pull requests start no checks and `changes.yml` will not auto-merge | Owner creates a fine-grained token owned by the organization (Phase 1); a GitHub App replaces it in Phase 3 |
| Moving the contract changes what the server accepts | The zod definitions move unchanged; `web/src/lib/intake.test.ts` moves with them and must pass unchanged; every web, kb and addon test runs in the same pull request |
| Two zod copies once protocol is a package | Protocol takes zod as a peer dependency; consumers install it with `install-links=true` so it resolves the consumer's zod; `npm ls zod` is checked |
| Vercel builds miss `packages/protocol` | The project already builds files outside `web/` (it compiles `kb/`); the pull request's preview deployment is the check |
| A protocol release breaks old addons | Semver check in CI against the last published schema; the server keeps the previous major |
| Two Vercel projects both run the crons during the cutover | The new project deploys previews only (crons run on production deployments only) until the domain moves; the old project's crons are disabled right after |
| Site outage at cutover | Domains move between two projects in the same Vercel team; the old project stays intact for 30 days for a move back |
| Contractors see more than their repository | Organization base permission set to "No permission"; access per repository or team |
| A future repository named `everloot` breaks old links | After the rename, no repository in the organization may take the name `everloot` |
| Private package token leaks | Read-only token (`read:packages`) stored only in Vercel and repository secrets, rotated yearly |

## Verification per phase

- **Phase 1:** a push to `main` deploys everloot.app from `Everloot/everloot`;
  `github.com/CDVolvik/everloot` answers 301; the three bot workflows run their jobs (not skipped); a
  forced nightly publishes a pre-release; `guards` and `verify` are green; no `CDVolvik/everloot`
  remains outside `docs/design/`; the organization profile renders at `github.com/Everloot`.
- **Phase 2:** `npm view @everloot/protocol version` prints the released version; web, kb and
  companion import only the package for the contract (no `web/src/lib/intake` imports remain); the
  addon contract tests validate their rows against `packages/protocol/schema/`; a real file shows
  the same counts on the preview's upload step as on production; the generated files match the
  source in CI.
- **Phase 3:** each new repository builds and tests on its own; everloot.app serves from
  `Everloot/web` with every route in the preview checklist answering as before; the addon repository
  holds only the addon and still releases; every old URL (`CDVolvik/everloot`, `Everloot/everloot`)
  redirects to `Everloot/addon`; every open issue sits in the repository that owns it.

## Open decisions for Carlos

1. Free plan or GitHub Team for private repositories (point 7).
2. Whether protocol and the SDK stay AGPL-3.0-only or take a permissive licence to ease third-party use.
   The plan keeps AGPL-3.0-only, as published.
3. The data licence (pending, not part of this design).
4. `CDVolvik/everloot-private` and the GitLab mirror (point 12).
