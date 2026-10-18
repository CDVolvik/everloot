# Org split implementation plan

**Goal:** move Everloot into the `Everloot` GitHub organization (Phase 1), extract `@everloot/protocol`
before the Forever launch on 2026-11-04 (Phase 2), and split into one repository per platform after
launch (Phase 3).

**Spec:** [`../specs/2026-10-17-org-split-design.md`](../specs/2026-10-17-org-split-design.md). Its
dependency map explains why each task below exists.

## How to read this plan

- **[OWNER]** marks a step only Carlos can do, usually in a browser: organization settings, Vercel,
  npm, secrets, renames, merges. Everything else is an agent or contributor step.
- Every commit is signed off (`git commit -s`, with the author's own email) and names no AI tool.
  Pull request titles follow `type(scope): plain sentence` (`scripts/check_pr_title.py`).
- Agents open pull requests; Carlos merges. A merge to `main` deploys everloot.app.
- Line numbers are as of `main` at `079c96e` (2026-10-17). Re-check them with `git grep` before
  editing.
- "Repository" below means `Everloot/everloot` unless another is named.

---

## Phase 1: the organization

### Done on 2026-10-17

- [x] **1.1 [OWNER]** Organization `Everloot` created on the free plan, owned by Carlos's personal
  account.
- [x] **1.2 [OWNER]** `CDVolvik/everloot` transferred to `Everloot/everloot`. The old URL answers 301
  to the new one. Branch protection survived: `guards` and `verify` required, no force push, no
  deletion. The six open pull requests moved.
- [x] **1.3 [OWNER]** Vercel GitHub app installed on the organization (all repositories);
  `everloot-web` shows `Everloot/everloot` as its connected repository.

Local clones still point at the old URL. Redirects work, but update them:
`git remote set-url origin https://github.com/Everloot/everloot.git`.

### Task 1.4: Re-enable the bot workflows (do first)

Since the transfer, `github.repository` is `Everloot/everloot`, so every job guarded by
`github.repository == 'CDVolvik/everloot'` is skipped: build watch, change refresh and ecosystem
refresh have stopped.

**Files:** `.github/workflows/build-watch.yml:32,199`, `.github/workflows/changes.yml:19,76`,
`.github/workflows/ecosystem.yml:17,51`.

- [ ] Replace `'CDVolvik/everloot'` with `'Everloot/everloot'` on those six lines. This ships in the
  same pull request as Task 1.6 if that one is ready the same day; otherwise on its own as
  `fix(infra): the bot workflows run again in the organization`.
- [ ] **Verify** after merge: `gh workflow run changes.yml -R Everloot/everloot`, then
  `gh run view <id> -R Everloot/everloot --json jobs --jq '.jobs[] | "\(.name) \(.conclusion)"'`
  shows `collect` with a conclusion other than `skipped`. Same for `build-watch.yml` and
  `ecosystem.yml`.

### Task 1.5: A token for the bots [OWNER]

The repository has no Actions secrets (`gh api repos/Everloot/everloot/actions/secrets` returns
`total_count: 0` on 2026-10-17). The three bots fall back to `github.token`, so the pull requests they
open start no checks, and `changes.yml` refuses to auto-merge without a token (`changes.yml:139`).

- [ ] **[OWNER]** Organization settings → Personal access tokens → allow fine-grained tokens.
- [ ] **[OWNER]** Create a fine-grained token: resource owner `Everloot`, repository
  `Everloot/everloot` only, permissions Contents read and write, Pull requests read and write,
  expiry one year. Save it as the repository secret `BUILD_WATCH_TOKEN`.
- [ ] **Verify:** the next scheduled `changes.yml` run opens or updates the `data/changes` pull
  request and its checks start.

Phase 3 replaces this token with a GitHub App (Task 3.6).

### Task 1.6: Repository links

**Branch:** `chore/org-links`. **Title:** `chore(infra): every link points at Everloot/everloot`.

- [ ] Replace the name in every tracked file except the historical design records and the lockfiles:

  ```bash
  git grep -l "CDVolvik/everloot" -- ':!docs/design' ':!*package-lock.json' \
    | xargs sed -i 's#CDVolvik/everloot#Everloot/everloot#g'
  ```

  That touches 28 files (44 lines) as of `079c96e`:

  | Area | Files |
  |---|---|
  | Workflows (Task 1.4) | `build-watch.yml`, `changes.yml`, `ecosystem.yml` |
  | Community files | `README.md` (7), `CONTRIBUTING.md` (4), `ROADMAP.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/config.yml` (2), `.github/PULL_REQUEST_TEMPLATE.md` |
  | Docs | `docs/SEO.md`, `docs/TRACKER.md`, `docs/everloot-wow-architecture-audit.md` |
  | Site | `web/src/lib/source.ts` (`REPO_URL`, also the footer Source link), `web/src/lib/llms.ts` (llms.txt), `web/src/app/connect/page.tsx`, `web/src/app/connect/connect-data.ts` (`git clone` line), `web/src/data/game-data/map.json` |
  | Knowledge base | `kb/src/mcp-server.ts` (`SOURCE_URL`, the MCP `websiteUrl`), `kb/src/http.ts` (User-Agent), `kb/src/sources.ts`, `kb/src/world-map-data.ts`, `kb/src/bridge-plan.ts`, `kb/curated/ecosystem.json` (2) |
  | Companion | `companion/src/cli.ts` |
  | Tests | `web/src/components/footer.test.tsx` (3), `web/src/lib/jsonld.test.tsx`, `kb/test/mcp-public-http.test.ts`, `companion/test/cli.test.ts` |

- [ ] Leave these alone on purpose:
  - `docs/design/**`: dated records of past work.
  - `web/src/data/polestar.ts:22` and `web/src/app/addons/addons.test.tsx:44` (`author:CDVolvik`):
    Carlos's own pull requests on Polestar, which stay under his account.
  - `.github/CODEOWNERS` (`* @CDVolvik`): a user handle, still valid in an organization repository.
    Task 3.1 moves it to a team.
  - `kb/render.yaml:8`: pins an image digest that exists only under `ghcr.io/cdvolvik`. Task 1.9.
- [ ] `map.json` is generated by `npm run kb -- client-map`, which needs a game-client snapshot. Edit
  it by hand together with `kb/src/world-map-data.ts:150` so `kb/test/world-map-data.test.ts`
  still matches.
- [ ] In `docs/SEO.md`, the MCP registry name becomes `io.github.Everloot/everloot`. Publishing under
  that namespace needs a GitHub login with access to the organization.
- [ ] `docs/TRACKER.md` and `kb/src/bridge-plan.ts:71` carry the same sentence about the Vercel
  connection; `kb/test/bridge-plan.test.ts` reads the tracker, so change both identically.
- [ ] **Verify:** `git grep -n "CDVolvik/everloot" -- ':!docs/design'` prints nothing;
  `python scripts/check_md_links.py` and `python scripts/check_internal_paths.py` pass; CI
  (`guards`, `verify`) is green.
- [ ] **Verify after merge:** `https://everloot.app/llms.txt` and `/connect` show
  `github.com/Everloot/everloot`; the footer's Source link opens `Everloot/everloot/tree/<sha>`.

### Task 1.7: Organization settings [OWNER]

The organization's base permission is `read` today (`gh api orgs/Everloot`), which would let every
future member read every private repository. That defeats reason 4 of the spec.

- [ ] Settings → Member privileges → Base permissions: **No permission**.
- [ ] Settings → Member privileges → Repository creation: owners only.
- [ ] Settings → Authentication security → Require two-factor authentication.
- [ ] Settings → Code security → for new repositories: Dependabot alerts and security updates on,
  secret scanning and push protection on (free for public repositories).
- [ ] Repository `Everloot/everloot` → Settings → Security: private vulnerability reporting still on
  (`SECURITY.md` links to it); General: Discussions still on.
- [ ] Settings → Teams: create `maintainers` with Carlos in it (used by CODEOWNERS in Task 3.1).

### Task 1.8: Organization front page

- [ ] **[OWNER]** Create the public repository `Everloot/.github` with no template.
- [ ] Add `profile/README.md` with this content, then sign off and push it on a branch and open a pull
  request in that repository (`docs(docs): organization front page`):

  ````markdown
  # Everloot

  An open, player-built database for World of Warcraft: Forever. The addon records what players see,
  and [everloot.app](https://everloot.app) states a fact once three installs agree.

  ```mermaid
  flowchart LR
    addon["addon<br/>in-game collector"] --> upload["upload<br/>everloot.app/upload"]
    desktop["desktop<br/>uploader and /ask bridge"] --> upload
    upload --> platform["platform<br/>intake, rollups, knowledge base"]
    platform --> web["web<br/>everloot.app"]
    platform --> api["public API"]
    platform --> mcp["MCP server"]
    api --> sdk["sdk<br/>TypeScript client"]
    mcp --> ai["AI assistants"]
    ios["ios<br/>iPhone app, planned"] --> api
    protocol["protocol<br/>the shared contract"] -.-> addon
    protocol -.-> platform
    protocol -.-> sdk
  ```

  | Repository | | What it is |
  |---|---|---|
  | [everloot](https://github.com/Everloot/everloot) | public | Everything today: addon, site, knowledge base, companion. Becomes `addon` after the split |
  | protocol | public, planned | Record kinds, API shapes and MCP tool schemas, on npm as `@everloot/protocol` |
  | sdk | public, planned | TypeScript client and a local MCP server |
  | desktop | public, planned | Uploads your file and answers `/ask` in game |
  | web | private, planned | everloot.app |
  | platform | private, planned | Intake, rollups and the knowledge base |
  | ios | private, planned | The iPhone app |

  Code in the public repositories is AGPL-3.0-only. Published data is CC BY-SA 4.0, credited to
  Everloot contributors.

  "Everloot" and its logo belong to R21 Media Group, LLC and are not covered by these licences.
  World of Warcraft is a trademark of Blizzard Entertainment, Inc. Everloot is a fan project and is
  not affiliated with or endorsed by Blizzard.
  ````

  Each later phase updates the table as a repository goes live (Tasks 2.14, 3.4 to 3.8).
- [ ] **[OWNER]** Pin `Everloot/everloot` on the organization page.
- [ ] **Verify:** `https://github.com/Everloot` shows the README and the diagram renders.

### Task 1.9: Recheck what the transfer could have broken

Each item: check, record the result in the Phase 1 pull request body, fix only if broken.

- [ ] **Release workflow.** `gh workflow run nightly.yml -R Everloot/everloot -f force=true`; a
  `nightly-*` pre-release appears under `Everloot/everloot/releases` with the zip and `SHA256SUMS`.
  The next stable `addon-v*` tag uses the same token path (`release.yml`, `github.token`).
- [ ] **Upload page downloads.** `/upload` links `/downloads/Everloot-<version>.zip`, served by the
  site from `web/public/downloads/` (`web/src/lib/addon-release.ts`). Nothing in it names the
  repository. Check that the link answers 200.
- [ ] **Addon metadata.** `addon/Everloot.toc` has no repository or website field and the addon's
  only URL is `https://everloot.app/tools/raid#raid=` (`addon/modules/raid.lua:23`). No change.
  When the CurseForge project is created (~2026-10-24), its source link is
  `https://github.com/Everloot/everloot` **[OWNER]**.
- [ ] **Dependabot.** Insights → Dependency graph → Dependabot shows the four update jobs
  (`/web`, `/kb`, `/companion`, actions) on the new repository.
- [ ] **Branch protection.** `gh api repos/Everloot/everloot/branches/main/protection` still lists
  `guards` and `verify`.
- [ ] **Container image.** `mcp-image.yml` derives the owner, so its next run pushes
  `ghcr.io/everloot/everloot-mcp`. The site does not use the image; only `kb/render.yaml` pins it.
  When the image is next built, replace the digest line in `kb/render.yaml` with the new one.
  The old image stays under the personal account.
- [ ] **Vercel.** Open the newest production deployment of `everloot-web`: its Git source reads
  `Everloot/everloot`, branch `main`.

### Task 1.10: Phase 1 verification

- [ ] A merge to `main` deploys everloot.app (Vercel deployment from `Everloot/everloot`).
- [ ] `curl -sI https://github.com/CDVolvik/everloot` answers `301` with
  `location: https://github.com/Everloot/everloot`.
- [ ] Task 1.4's three workflows ran their jobs; Task 1.9's nightly published.
- [ ] `guards` and `verify` green on `main`.
- [ ] Record the result in the project's status file.

### Rollback for Phase 1

- **Transfer.** **[OWNER]** `Everloot/everloot` → Settings → Transfer → `CDVolvik`. The name
  `CDVolvik/everloot` is free (it only redirects), so the repository returns to its old URL and the
  organization URL starts redirecting instead. Revert Task 1.4 and 1.6 with `git revert`.
- **Vercel relink.** **[OWNER]** Vercel → `everloot-web` → Settings → Git → Disconnect, then connect
  `CDVolvik/everloot` (root directory `web`, production branch `main`). If a production deployment
  is broken in the meantime, use Instant Rollback to the last good deployment first. Domains and
  environment variables are untouched by either step.

---

## Phase 2: `packages/protocol` (before 2026-11-04)

Three pull requests, in order. No addon release is needed: the addon's behaviour does not change.

- **PR A** `feat(protocol): one package holds the upload record contract` (Tasks 2.1 to 2.9).
  Moving the source of truth must be atomic, so the package, the consumers and the addon tests change
  together.
- **PR B** `feat(protocol): API response shapes and MCP tool schemas` (Tasks 2.10, 2.11).
- **PR C** `chore(protocol): publish to npm on a protocol tag` (Tasks 2.12, 2.13), then the owner
  publishes (Task 2.14).

PR A first adds `protocol` to the allowed scopes, or its title fails `pr-title.yml` (Task 2.1).

### Task 2.1: Scope, label and npm organization

- [ ] `scripts/check_pr_title.py:8`: add `protocol` to `SCOPES`; add a passing case to
  `scripts/test_check_pr_title.py`.
- [ ] `docs/RELEASING.md` and `CONTRIBUTING.md`: add `protocol` to the scope lists.
- [ ] `.github/release.yml`: add a category `Protocol` with labels `[protocol]`, above
  "Other changes".
- [ ] `gh label create protocol -R Everloot/everloot --description "packages/protocol" --color 5319e7`
  (needs write access; **[OWNER]** if the agent's token cannot).
- [ ] **[OWNER]** Create the npm organization `everloot` (free, public packages) under an npm account
  with two-factor authentication. If the name is taken, stop: the scope is decided again before
  anything is published.

### Task 2.2: Scaffold the package

Create `packages/protocol/` with:

- `package.json`:

  ```json
  {
    "name": "@everloot/protocol",
    "version": "1.0.0",
    "description": "Everloot's upload record kinds, API response shapes and MCP tool schemas.",
    "license": "AGPL-3.0-only",
    "type": "module",
    "repository": { "type": "git", "url": "git+https://github.com/Everloot/everloot.git", "directory": "packages/protocol" },
    "homepage": "https://everloot.app/connect",
    "engines": { "node": ">=22" },
    "exports": {
      ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "./schema/*": "./schema/*"
    },
    "files": ["dist", "schema", "README.md", "CHANGELOG.md", "LICENSE"],
    "publishConfig": { "access": "public" },
    "scripts": {
      "clean": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
      "build": "npm run clean && tsc -p tsconfig.build.json && tsx scripts/emit-schema.ts",
      "test": "vitest run",
      "typecheck": "tsc --noEmit"
    },
    "peerDependencies": { "zod": "^4.6.5" },
    "devDependencies": {
      "@types/node": "^22.20.4",
      "tsx": "4.23.15",
      "typescript": "^5.6.3",
      "vitest": "^5.0.3",
      "zod": "^4.6.5"
    }
  }
  ```

- `tsconfig.json` (`module`/`moduleResolution` `NodeNext`, `strict`, `noEmit`, includes `src`,
  `test`, `scripts`) and `tsconfig.build.json` (extends it; `noEmit: false`, `declaration: true`,
  `outDir: dist`, includes `src` only).
- `LICENSE`: a copy of the root `LICENSE`.
- `CHANGELOG.md` with an empty `## [Unreleased]` section. Task 2.14 turns it into
  `## [1.0.0] - YYYY-MM-DD` with the day of the first publish, which the publish workflow requires.
- `README.md` in the template of Task 3.1: what it is, status (1.0.0, used by everloot.app), install
  (`npm install @everloot/protocol zod`), how it connects (addon writes, uploaders send, the site
  validates, the SDK and MCP clients read), the semver rule from the spec, licence.
- Root `.gitattributes` (new file): `packages/protocol/dist/** linguist-generated eol=lf` and
  `packages/protocol/schema/** linguist-generated eol=lf`.
- `npm install` inside `packages/protocol` to create its `package-lock.json`. Use Node 22.23.2, the
  version CI uses, so the lockfile format matches the others.

### Task 2.3: Move the record contract

| New file | Moved from | What |
|---|---|---|
| `src/records.ts` | `web/src/lib/intake.ts:11-474` | `INSTALL_ID`, `base`, every kind schema, `CHARACTER_KEY`, `CALENDAR_DATE`, `CLIENT_BUILD`, the completion kind lists, `recordSchemas`, `RecordKind`, `ALL_RECORD_KINDS`, `PUBLIC_RECORD_KINDS`, `anyRecord`, `IntakeRecord`, `uploadPayload` |
| `src/parse.ts` | `web/src/lib/intake.ts:476-578` | `AcceptedRecord`, `RejectedRecord`, `ValidationResult`, `CanonicalUpload`, `ParsedRecords`, `ParsedUpload`, `parseRecords`, `parseUpload`, `validateUpload`, `summarizeKinds` |
| `src/realm.ts` | `kb/src/market.ts:53-58` | `validRealm` |
| `src/sharing.ts` | `kb/src/publication.ts:3,20-26` | `SharingCategory`, `sharingCategory` |
| `src/limits.ts` | see below | `UPLOAD_LIMITS` |
| `src/index.ts` | new | re-exports everything above plus `PROTOCOL_VERSION` and `ACCEPTED_MAJORS` |
| `test/records.test.ts` | `web/src/lib/intake.test.ts` (whole file) | unchanged assertions, imports from `../src/index.js` |

- [ ] Move the code without changing any schema. `test/records.test.ts` must pass with its
  assertions untouched; that is the proof the contract did not move.
- [ ] Cross-field rules: keep each `.refine`/`.superRefine`, and take its message from one exported
  `RULES` object (`RULES.loot`, `RULES.achievement_catalog`, and so on) so the emit script can
  write the same sentences into the JSON Schema descriptions (Task 2.5). The rules today are at
  `intake.ts:40, 168, 193, 214, 228, 271, 276, 330, 364, 399`.
- [ ] `src/limits.ts`:

  ```ts
  export const UPLOAD_LIMITS = {
    /** A request body above this is refused with 413 (web/src/app/api/intake/route.ts:44). */
    maxBodyBytes: 1_000_000,
    /** What an uploader puts in one request (web/src/lib/upload-batches.ts). */
    batchBytes: 600_000,
    recordsPerBatch: 2000,
    recordsPerFile: 100_000,
    /** The server's limit (intake.ts:471). The client allowed 32, which the server then refused. */
    addonVersionMax: 20,
    grantTokensMax: 4,
    /** Auction scans from more realms than this in one upload are refused (MARKET_LIMITS.realmsPerUpload). */
    realmsPerUpload: 3,
  } as const;
  ```

  `uploadPayload` uses `UPLOAD_LIMITS.addonVersionMax` and `recordsPerBatch`.
- [ ] Protocol version on the envelope: `uploadPayload` gains
  `protocol: z.string().regex(/^\d+\.\d+\.\d+$/).optional()`. `PROTOCOL_VERSION = "1.0.0"`,
  `ACCEPTED_MAJORS = [1]` (the current major, plus the previous one once there is one).
  `parseUpload` rejects an envelope whose major is not in `ACCEPTED_MAJORS` with the reason
  `protocol <v> is not supported; update the addon or uploader`; a missing `protocol` means 1.
  New tests: missing, `1.4.0` accepted, `2.0.0` rejected.
  Every addon today speaks major 1, so the uploaders stamp `PROTOCOL_VERSION` (Task 2.4). Before the
  first 2.0.0, the addon must write its own protocol major into `EverlootDB` and the uploaders must
  forward that instead, or a new uploader would label an old addon's rows as 2.x. The server then
  keeps the previous major through an npm alias
  (`"@everloot/protocol-v1": "npm:@everloot/protocol@^1"`) and parses each envelope with the
  package that matches its major.
- [ ] `market.ts`'s own `auction_snapshot` schema (`kb/src/market.ts:126-135`) stays where it is: it
  is the rollup's stricter input filter, not the upload contract (spec, dependency map row 6).

### Task 2.4: Consumers import the package

All three Node parts install the package from the folder, packed rather than linked, so the package
resolves `zod` from the consumer's own `node_modules`:

- [ ] `web/package.json`, `kb/package.json`, `companion/package.json`: add
  `"@everloot/protocol": "file:../packages/protocol"` to `dependencies`.
- [ ] `web/.npmrc`, `kb/.npmrc`, `companion/.npmrc` (new): `install-links=true`.
- [ ] `web/tsconfig.json` `paths`: add `"@everloot/protocol": ["./node_modules/@everloot/protocol"]`,
  next to the existing `zod` pin, so kb sources type-check against the same copy in web.
- [ ] Re-run `npm install` in each part with Node 22.23.2 and commit the three lockfiles.

Imports to change (`git grep -n -E "(lib/|\./)intake(\.js)?\"" -- web kb companion scripts` lists
all 22 of them):

| Part | Files | Change |
|---|---|---|
| kb | `src/corpus.ts:1`, `src/completion-rollup.ts:20-21`, `src/publication.ts:1`, `src/mcp-server.ts:17`, `test/completion.test.ts:10`, `test/corpus.test.ts:3`, `test/publication.test.ts:3`, `test/tool-kinds.test.ts:11` | `"../../web/src/lib/intake.js"` → `"@everloot/protocol"` |
| kb | `src/market.ts:53-58` | delete `validRealm`, `export { validRealm } from "@everloot/protocol"`; `MARKET_LIMITS.realmsPerUpload` reads `UPLOAD_LIMITS.realmsPerUpload` |
| kb | `src/publication.ts:3,20-26` | delete `SharingCategory` and `sharingCategory`, re-export them from `@everloot/protocol` |
| web | `app/api/corpus/public/route.ts:2` and `route.test.ts:8`, `app/api/intake/route.ts:3`, `app/connect/page.tsx:9`, `app/connect/connect.test.tsx:17`, `lib/llms.ts:4`, `lib/world-map.ts:6`, `lib/world-map.test.ts:6`, `lib/upload-store.ts:4`, `lib/upload-batches.ts:1`, `lib/dedup.test.ts:3`, `lib/sharing-store.test.ts:9` | `"@/lib/intake"` or `"./intake"` → `"@everloot/protocol"` |
| web | `lib/upload-batches.ts:2` | `sharingCategory` from `@everloot/protocol` instead of `kb/src/publication` |
| web | `app/api/intake/route.ts:44,62,81` and `lib/upload-batches.ts:12-16` | literal limits → `UPLOAD_LIMITS` fields |
| web | `lib/upload-batches.ts` (`prepareUpload`) | put `protocol: PROTOCOL_VERSION` in each batch envelope |
| companion | `src/uploader.ts:23` | type the `"addon_seen"` comparison as `RecordKind` from `@everloot/protocol` |

- [ ] Delete `web/src/lib/intake.ts` and `web/src/lib/intake.test.ts`.
- [ ] `kb/Dockerfile` and the root `.dockerignore`: stop copying `web/src/lib/intake.ts`; copy
  `packages/protocol/{package.json,package-lock.json,dist,schema}` to `/app/packages/protocol` and
  `kb/.npmrc` before `npm ci`. (The image already misses `web/src/data/game-data/map.json`, which
  `kb/src/world-map-file.ts` imports; that is a separate, existing bug, not part of this task.)
- [ ] Addon comments that name the old file (`addon/modules/completion.lua:36`,
  `addon/modules/professions.lua:26`, and any other `web/src/lib/intake.ts` mention under `addon/`)
  are not changed in this pull request: they are inside the zipped Lua, so editing them changes the
  committed zip and needs an addon release. Note them in `CHANGELOG.md` under `[Unreleased]` and
  change them in the next addon release.
- [ ] **Verify:**
  - `git grep -n -E "(lib/|\./)intake(\.js)?\"" -- web kb companion scripts` prints nothing.
  - `ls -la web/node_modules/@everloot/` shows `protocol` as a directory, not a symlink.
  - `cd web && npm ls zod` shows one deduplicated `zod` under the package.
  - kb: `npm test -- --maxWorkers=2 && npm run typecheck`; web: `npm test && npm run lint && npm run
    build`; companion: `npm test && npm run typecheck`. All pass.
  - `docker build -f kb/Dockerfile .` gets past `npm run typecheck`.

### Task 2.5: Generated files and their freshness check

- [ ] `packages/protocol/scripts/emit-schema.ts` writes, with `JSON.stringify(value, null, 2) + "\n"`
  and kinds sorted, after clearing `schema/`:
  - `schema/records/<kind>.json` for each of the 31 kinds:
    `z.toJSONSchema(recordSchemas[kind], { io: "input" })` (draft 2020-12; input mode leaves extra
    properties allowed, as the server strips them), with the kind's `RULES` sentences appended to
    `description`.
  - `schema/upload.json`: the envelope.
  - `schema/limits.json`: `UPLOAD_LIMITS`.
  - `schema/index.json`: `{ "protocol": PROTOCOL_VERSION, "kinds": [...], "publicKinds": [...] }`.
  - PR B adds `schema/api/*.json` and `schema/mcp/*.json` (Tasks 2.10, 2.11).
- [ ] `test/schema.test.ts`: every kind in `ALL_RECORD_KINDS` has a file, and each file's
  `properties` keys and `required` list match the zod shape of that kind. Validating records against
  the JSON Schema itself is the addon tests' job (Task 2.6), so the package needs no JSON Schema
  validator.
- [ ] Commit `dist/` and `schema/`. CI rebuilds them and fails on any difference (Task 2.8), the same
  pattern as the committed addon zip.

### Task 2.6: The addon tests read the schema

- [ ] New `addon/tests/protocol_schema.py` (a helper, not a test):
  - `SCHEMA_DIR` = environment variable `EVERLOOT_PROTOCOL_SCHEMA`, else
    `<repo>/packages/protocol/schema`.
  - `to_plain(lua_value)`: converts a `lupa` table the way `web/src/lib/sv-parse.ts` `toPlain` does
    (keys exactly 1..n become a list, other tables a dict, recursively).
  - `check_rows(kind, rows, install_id)`: builds each record as the uploader does
    (`{"kind": kind, "installId": install_id, **row}`, see `sv-parse.ts:176`) and validates it with
    `jsonschema.Draft202012Validator` against `records/<kind>.json`; raises `AssertionError` naming the
    kind, row index and failing path.
- [ ] In each contract test that reads `EverlootDB.records` (`addons`, `auction`, `collection`,
  `completion`, `event_identity`, `gold`, `mapbounds`, `market`, `recipes`, `talents` as of today),
  call `check_rows` on every kind it produced, after its existing assertions. Keep the existing
  hand-written field lists; they check things the schema does not (forbidden fields, caps).
- [ ] New `addon/tests/protocol_contract.py`: every kind the addon can write has a schema file. The
  kinds are the string literals in `Store("<kind>"` / `Store('<kind>'` across `addon/**/*.lua`, plus
  the eight completion kinds that `addon/modules/completion.lua` stores through a variable.
- [ ] `.github/workflows/checks.yml:66`, `nightly.yml` and `release.yml` addon steps:
  `python -m pip install lupa==2.6 jsonschema==4.25.1`, and add `python addon/tests/protocol_contract.py`
  to each test chain.
- [ ] Update the test docstrings' local command to `uv run --with lupa --with jsonschema python ...`.
- [ ] **Verify:** break one schema on purpose locally (for example make `money_event`'s
  `copper` a string in `records.ts`, rebuild) and see `gold_contract.py` fail on it; restore.

### Task 2.7: Docs for PR A

- [ ] `README.md` parts table and `docs/architecture.md` "Where each thing lives": add
  `packages/protocol/`.
- [ ] `CONTRIBUTING.md` "Set up": protocol changes need `npm run build` in `packages/protocol`, then
  `npm install` in each consumer (the packed copy does not follow edits).
- [ ] `CHANGELOG.md` `[Unreleased]`: the contract moved; uploads now carry `protocol`.

### Task 2.8: CI for the package

In `.github/workflows/checks.yml`, job `verify`, before the kb install:

```yaml
      - run: npm ci && npm test && npm run typecheck && npm run build && git diff --exit-code -- dist schema
        working-directory: packages/protocol
```

and add `packages/protocol/package-lock.json` to `cache-dependency-path`.

- [ ] `.github/dependabot.yml`: an npm entry for `/packages/protocol`, group `protocol-dependencies`,
  prefix `chore(protocol)`, limit 3.

### Task 2.9: Verify PR A on a preview

- [ ] The pull request's Vercel preview builds (it installs `../packages/protocol` from inside `web/`).
- [ ] Load a real `Everloot.lua` on the preview's `/upload` and on production's, and stop at the
  preview step without sending: both show the same counts and held rows. (Do not send from a preview;
  it may share production storage.)
- [ ] `/api/corpus/public`, `/api/market/prices`, `/mcp/public` answer as on production.

### Task 2.10: API response shapes (PR B)

- [ ] `packages/protocol/src/attribution.ts`: move `kb/src/attribution.ts` whole (`SITE`, `LICENCE`,
  `LICENCE_URL`, `CREDIT_LINE`, `TERMS_URL`, `MCP_CREDIT`); delete the kb file; update its importers:
  `kb/src/mcp-server.ts:4`, `kb/test/{market-tool,mcp-server,tool-facts,tool-kinds}.test.ts`,
  `web/src/lib/data-guard.ts:1`, `web/src/lib/llms.ts:9`, `web/src/app/connect/connect-data.ts:1`.
- [ ] `packages/protocol/src/api.ts`, zod schemas written from the current routes:

  | Schema | Shape source |
  |---|---|
  | `attributionSchema` | `web/src/lib/data-guard.ts:41-43` (`licence`, `licenceUrl`, `credit`, `source`, `terms`) |
  | `apiErrorSchema` | `{ ok: false, error, getAKey? }` (`data-guard.ts:46-48`, every route) |
  | `pageSchema` | `offset`, `limit`, `total`, `next` from `pageOf` in `data-guard.ts` |
  | `corpusPublicResponse` | `web/src/app/api/corpus/public/route.ts:40` (read `uploadStore.loadCorpus()`'s return type for the spread fields) |
  | `marketRealmsResponse`, `marketPricesResponse` | `web/src/app/api/market/prices/route.ts:33-37` and `kb/src/market.ts` `marketPrices` |
  | `dropsResponse` | `web/src/app/api/rollups/drops/route.ts:28-46` |
  | `intakeReceipt` | `web/src/app/api/intake/route.ts` responses and `BatchReceipt` (`web/src/lib/upload-batches.ts:5`) |
  | `healthResponse` | `web/src/app/api/health/route.ts` |

- [ ] One test per route (in each route's existing `route.test.ts`) parses a real response body with
  the matching schema, so a route that drifts from the protocol fails.
- [ ] The routes keep building their bodies as they do; add `satisfies z.input<typeof ...>` where it
  type-checks without changing the body.
- [ ] Emit `schema/api/<name>.json` for each.

### Task 2.11: MCP tool schemas (PR B)

- [ ] `packages/protocol/src/mcp.ts`:
  - `TOOLS`: an ordered array of `{ name, title, description, inputSchema, annotations }` for the 19
    tools, moved from the `registerTool` calls in `kb/src/mcp-server.ts:377-672`, with `searchArgs`,
    `KINDS` and `VERSIONS` (`:332-340`).
  - The input constants they use move with them: `CHANGE_FILTERS` (`kb/src/changes.ts:12`),
    `BOARD_IDS` and `ECOSYSTEM_BOARD_FILTERS` (`kb/src/ecosystem.ts:414,466`), `NEAR_DEFAULT_RADIUS`,
    `NEAR_MAX_RADIUS`, `NEAR_DEFAULT_LIMIT`, `NEAR_MAX_LIMIT` (`kb/src/world-map-near.ts:85-88`).
    The kb files import and re-export them.
  - `TOOL_NAMES = TOOLS.map((t) => t.name)`.
  - `TOOL_OUTPUT`: `{ type: "text", endsWith: MCP_CREDIT }` for the tools built on player data, as a
    documented constant. Structured output is a later minor release (spec, point 1).
- [ ] `kb/src/mcp-server.ts`: register from `TOOLS` in a loop, with a `handlers` map keyed by tool
  name holding today's handler bodies. `TOOL_KINDS` stays in kb (it is how the engine reads, not the
  contract).
- [ ] `web/src/app/connect/connect-data.ts:10`: keep each tool's short `text`, keyed by tool name;
  replace the regex checks that read `kb/src/mcp-server.ts` as text (`connect.test.tsx:28`,
  `llms.test.ts:8`) with an equality check against `TOOL_NAMES`.
- [ ] `kb/test/mcp-server.test.ts`: `tools/list` returns exactly `TOOL_NAMES`, in order, and each
  tool's `inputSchema` has the same property names and `required` list as the protocol's shape.
- [ ] Emit `schema/mcp/<tool>.json` (input schema plus `"x-everloot-output": "text"`).
- [ ] `README.md:68,92` say 16 tools; correct to 19.

### Task 2.12: Semver check (PR C)

- [ ] `packages/protocol/scripts/check-semver.ts`: download the latest published tarball
  (`npm pack @everloot/protocol@latest`, skip with a notice if none exists), unpack its `schema/`, and
  compare with the working tree. Fail if any of these happen without a major bump in
  `package.json`: a kind, property, API field or tool disappears; a property becomes required; a
  `maxLength`, `maxItems`, `maximum` goes down or a `minLength`, `minItems`, `minimum` goes up; an
  `enum` loses a value. Fail if anything is added without at least a minor bump. When
  `package.json` holds the version that is already the latest on npm, compare nothing and pass.
- [ ] Run it in `checks.yml` after the protocol build, and in the publish workflow.

### Task 2.13: Publish workflow (PR C)

`.github/workflows/protocol-publish.yml`:

```yaml
name: Protocol release
on:
  push:
    tags: ['protocol-v*']
permissions:
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write   # the GitHub release
      id-token: write   # npm trusted publishing and provenance
    defaults:
      run:
        working-directory: packages/protocol
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.23.2'
          registry-url: 'https://registry.npmjs.org'
      - run: npm install -g npm@11
      - name: The tag matches package.json and the changelog
        run: |
          VERSION="${GITHUB_REF_NAME#protocol-v}"
          test "$VERSION" = "$(node -p "require('./package.json').version")"
          grep -q "^## \[$VERSION\]" CHANGELOG.md
      - run: npm ci && npm test && npm run build && git diff --exit-code -- dist schema
      - run: npx tsx scripts/check-semver.ts
      - name: Publish, unless this version is already on npm (the hand-published 1.0.0)
        run: |
          VERSION="${GITHUB_REF_NAME#protocol-v}"
          if npm view "@everloot/protocol@$VERSION" version >/dev/null 2>&1; then
            echo "@everloot/protocol@$VERSION is already published"
          else
            npm publish --provenance --access public
          fi
      - run: gh release create "$GITHUB_REF_NAME" --title "Everloot protocol ${GITHUB_REF_NAME#protocol-v}" --generate-notes --verify-tag
        env:
          GH_TOKEN: ${{ github.token }}
```

- [ ] `docs/RELEASING.md`: a "Protocol" section: bump `packages/protocol/package.json`, move the
  changelog entries, merge, then
  `git tag -a protocol-v<version> -m "Everloot protocol <version>" && git push origin protocol-v<version>`.

### Task 2.14: First publish [OWNER]

Trusted publishing is configured on an existing package, so 1.0.0 goes out by hand once.

- [ ] PR C's last commit moves `packages/protocol/CHANGELOG.md`'s entries from `[Unreleased]` to
  `## [1.0.0] - YYYY-MM-DD` (the planned publish day), so `main` carries the section the workflow
  checks.
- [ ] **[OWNER]** On a clean checkout of `main` after PR C merges:
  `cd packages/protocol && npm ci && npm run build && git diff --exit-code && npm publish --access public`
  (npm asks for the two-factor code).
- [ ] **[OWNER]** npmjs.com → `@everloot/protocol` → Settings → Trusted publisher: GitHub Actions,
  organization `Everloot`, repository `everloot`, workflow `protocol-publish.yml`. Then set
  "Require two-factor authentication and disallow tokens".
- [ ] Tag `protocol-v1.0.0` on the merge commit. The workflow sees 1.0.0 on npm, skips the publish
  and creates the GitHub release. Every later version publishes only through the workflow.
- [ ] Update the organization front page: `protocol` is "public, on npm".

### Phase 2 verification

- [ ] `npm view @everloot/protocol version` prints `1.0.0`.
- [ ] No file imports `web/src/lib/intake` or `kb/src/attribution`.
- [ ] Every addon contract test validates its rows against `packages/protocol/schema/`.
- [ ] After the merge, a new upload from Carlos's own client is accepted on production, and its
  envelope carries `"protocol": "1.0.0"`.
- [ ] CI's freshness and semver checks pass on `main`.

### Rollback for Phase 2

Each PR reverts cleanly with `git revert -m 1 <merge sha>`; PR A restores `web/src/lib/intake.ts`
and the old imports in one step. A published npm version is never unpublished: if a version is wrong,
`npm deprecate @everloot/protocol@<version> "<reason>"` and publish a fixed patch.

---

## Phase 3: one repository per platform (after launch)

Order, from the spec: protocol, then desktop and sdk, then web and platform, then addon. Two
rehearsals inside this repository come first, so each split is a move of code that already builds
on its own.

Rules for the whole phase:

- Every `git filter-repo` runs on a **fresh clone of `Everloot/everloot`** with
  `git clone --no-local`, never on a working checkout and never on `CDVolvik/everloot-private` or the
  GitLab mirror (spec, point 12). Install it with `pip install git-filter-repo`.
- After a filter, delete the tags that do not belong to the new repository before pushing
  (`git tag -l | grep -v '^<prefix>-v' | xargs -r git tag -d`); filtered history otherwise keeps
  `addon-v*` and `nightly-*` tags on unrelated commits.
- New private repositories are created private and empty **[OWNER]**. No repository ever changes
  visibility (spec, point 13).
- From the moment a part's history is filtered out until its cutover is verified, no pull request in
  this repository touches that part's folder. Add the folder to a temporary `guards` step that fails
  on changes to it, and remove the step when the folder is deleted.

### Task 3.1: Organization standards (before the first new repository)

In `Everloot/.github`:

- [ ] Default community files, generalized from this repository's: `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md` (private vulnerability reporting per repository, or
  hello@everloot.app), `.github/ISSUE_TEMPLATE/` (bug, feature, wrong data, config pointing at
  Discussions), `.github/PULL_REQUEST_TEMPLATE.md`. A repository's own file overrides the default.
- [ ] `DATA_POLICY.md` and `TRADEMARKS.md` move here (from `docs/DATA_POLICY.md` and `TRADEMARKS.md`),
  because the site, `map.json` and every repository link them. The old files become one-line stubs
  pointing here, so old links keep working.
- [ ] Issues enabled on `Everloot/.github`, with the wrong-data and site bug forms: the public front
  door for parts whose repositories are private (spec, point 10).
- [ ] Labels: `Everloot/everloot`'s label set is the source. Copy it to each new repository with
  `gh label clone Everloot/everloot -R Everloot/<repo>` (after the rename in Task 3.8, the source is
  `Everloot/addon`).
- [ ] `rulesets/main.json`, the protection `main` has today, for public repositories:

  ```json
  {
    "name": "main",
    "target": "branch",
    "enforcement": "active",
    "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
    "rules": [
      { "type": "deletion" },
      { "type": "non_fast_forward" },
      { "type": "required_status_checks", "parameters": {
          "strict_required_status_checks_policy": false,
          "required_status_checks": [ { "context": "guards" }, { "context": "verify" } ] } }
    ]
  }
  ```

  Apply with `gh api -X POST repos/Everloot/<repo>/rulesets --input rulesets/main.json`, changing
  the check names to that repository's jobs. On the free plan this does not work on private
  repositories (spec, point 7); until Carlos decides, web and platform rely on CI plus the pull
  request template's checklist.
- [ ] `README-TEMPLATE.md`, used by every repository:

  ```markdown
  # Everloot <part>

  One sentence: what this is and who uses it.

  ## Status
  Version, what works today, what does not yet.

  ## Install
  The shortest working install or run command.

  ## How it connects
  What it reads from and writes to, naming the other Everloot repositories. Link the diagram at
  https://github.com/Everloot.

  ## Licence
  AGPL-3.0-only (public repositories) or "Private. All rights reserved." Data: see DATA_POLICY.md.
  ```

- [ ] `CODEOWNERS` in every repository: `* @Everloot/maintainers` (team from Task 1.7).
- [ ] **[OWNER]** Create the organization Project "Everloot roadmap", visibility public. Add the open
  issues of public repositories; track private work as draft items (spec, point 8).
- [ ] Every new repository gets: Dependabot (`.github/dependabot.yml` for its ecosystem plus
  `github-actions`), code scanning default setup (public repositories; private ones need a paid plan),
  `CODEOWNERS`, a `CHANGELOG.md`, the ruleset, the labels, the DCO, no-AI-credit and PR-title checks
  copied from `scripts/`.

### Task 3.2: Rehearsal A, `packages/sdk` inside this repository

- [ ] `packages/sdk/` (`@everloot/sdk`, AGPL-3.0-only), depending on `@everloot/protocol`:
  - `savedvariables`: move `web/src/lib/sv-parse.ts` here.
  - `upload`: move `prepareUpload`, `sendBatches` and `BatchReceipt` from
    `web/src/lib/upload-batches.ts`.
  - `client`: typed `fetch` wrappers for `/api/corpus/public`, `/api/market/prices`,
    `/api/rollups/drops`, validating responses with the protocol's API schemas, sending a key when
    given.
  - `mcp`: a stdio MCP server, binary `everloot-mcp`, that registers `TOOLS` from protocol and forwards
    each call to `https://everloot.app/mcp/public`, or `/mcp` with `EVERLOOT_API_KEY` (spec, point 3).
- [ ] web (`app/upload/UploadClient.tsx`, `scripts/issue-publication-grant.ts`) and companion
  (`uploader.ts`, `prices.ts`, `bridge/asks.ts`) import `@everloot/sdk` instead of web files; the
  companion's `zod` path mapping to `../web/node_modules` goes away.
- [ ] Publishing: `sdk-publish.yml`, a copy of Task 2.13's workflow for `sdk-v*` tags. Both
  workflows also publish each version to GitHub Packages, so private repositories can read the whole
  `@everloot` scope from one registry (spec, point 6): add `packages: write` to the job and a step
  `npm publish --registry=https://npm.pkg.github.com` with `NODE_AUTH_TOKEN: ${{ github.token }}`,
  skipped like the npm step when the version is already there.
- [ ] **Verify:** `git grep -n "\.\./web/src" -- companion` prints nothing; a real upload through the
  companion and through `/upload` gets the same receipt as before.

### Task 3.3: Rehearsal B, the platform as a package inside this repository

- [ ] `kb/package.json` becomes `@everloot/platform` with an `exports` map for every module web imports
  (list them with `git grep -h -o "kb/src/[a-z/-]*" -- web | sort -u`), a `build` script (`tsc` to
  `dist/`), and `files` that include the data files web reads (`changes/*.json`,
  `curated/ecosystem.json`).
- [ ] Server-side rules move from web into the platform (spec, dependency map row 14): the modules in
  `web/src/lib/` that read or write R2 or Supabase or enforce a limit (today `intake-quota`,
  `data-guard`, `api-keys`, `upload-store`, `rollup-compute`, `rollups`, `completion-store`,
  `sharing-store`, `usage-metrics` and `supabase/`). Routes, pages and components stay in web.
- [ ] web imports `@everloot/platform/<module>` instead of relative `kb/src` paths; drop the
  `extensionAlias` and `resolve.modules` workarounds in `web/next.config.js:61-71` once web consumes
  the built package; keep `better-sqlite3` external.
- [ ] Tests that read other parts' files get their own copies or read the package: `web` tests reading
  `kb/src/mcp-server.ts` were removed in Task 2.11; `web/src/lib/data-guard.test.ts:154` reads a
  migration, which now ships in the platform package; `kb/test/ecosystem.test.ts:43` reads
  `addon/Everloot.toc` and gets a fixture copy.
- [ ] **Verify:** `git grep -n "kb/src" -- web` prints nothing; the Vercel preview passes the
  checklist in Task 3.7.

### Task 3.4: `Everloot/protocol`

- [ ] **[OWNER]** Create the public, empty repository `Everloot/protocol`.
- [ ] Filter and push:

  ```bash
  git clone --no-local https://github.com/Everloot/everloot.git protocol-split && cd protocol-split
  git filter-repo --path packages/protocol/ --path .github/workflows/protocol-publish.yml \
    --path-rename packages/protocol/:
  git tag -l | grep -v '^protocol-v' | xargs -r git tag -d
  git remote add origin https://github.com/Everloot/protocol.git
  git push -u origin main --tags
  ```

- [ ] In the new repository: move the workflow's `working-directory` to the root, add the CI from
  Task 2.8 as its own `checks.yml` (jobs `guards`, `verify`), and the standards of Task 3.1.
- [ ] **[OWNER]** npm trusted publisher: change the repository to `protocol`.
- [ ] In `Everloot/everloot`: consumers depend on `"@everloot/protocol": "^1.<current minor>.0"` from
  npm; delete `packages/protocol/`, the three `.npmrc` files' `install-links` line, and its CI and
  Dependabot entries.
- [ ] Addon tests: `scripts/sync-protocol.py <version>` runs `npm pack @everloot/protocol@<version>`
  and unpacks `schema/` into `addon/tests/protocol/` with a `VERSION` file; `protocol_schema.py`'s
  default `SCHEMA_DIR` becomes that folder. A weekly workflow opens a pull request when a newer minor
  exists.
- [ ] **Verify:** a `protocol-v` tag in the new repository publishes to npm and GitHub Packages; this
  repository's CI passes against the registry version.

### Task 3.5: `Everloot/sdk` and `Everloot/desktop`

- [ ] **[OWNER]** Create the public, empty repositories `Everloot/sdk` and `Everloot/desktop`.
- [ ] sdk: as Task 3.4 with `--path packages/sdk/ --path-rename packages/sdk/:`, keeping only `sdk-v*`
  tags.
- [ ] desktop:

  ```bash
  git clone --no-local https://github.com/Everloot/everloot.git desktop-split && cd desktop-split
  git filter-repo --path companion/ --path-rename companion/:
  git tag -l | xargs -r git tag -d
  git remote add origin https://github.com/Everloot/desktop.git
  git push -u origin main
  ```

  It depends on `@everloot/sdk` from npm. CI runs `npm ci && npm test && npm run typecheck`. Releases
  are `desktop-vX.Y.Z` GitHub releases with CHANGELOG notes; an installer and signing are later work
  (spec, point 4).
- [ ] The answers and prices fixtures (spec, dependency map row 11): the generators stay in desktop and
  write `test/fixtures/`; the addon keeps its copies in `addon/tests/fixtures/`. Desktop CI compares
  its generated files with the addon's copies at `main`
  (`https://raw.githubusercontent.com/Everloot/addon/main/tests/fixtures/<file>`) and fails on a
  difference, so a format change needs a pull request in both.
- [ ] Delete `companion/` and `packages/sdk/` from this repository.

### Task 3.6: `Everloot/platform` (private)

- [ ] **[OWNER]** Create the private, empty repository `Everloot/platform`.
- [ ] **[OWNER]** Create a GitHub App `everloot-bot` owned by the organization (Contents and Pull
  requests read and write; Packages read), install it on `platform`, `web` and `addon`, and store its
  app id and private key as `BOT_APP_ID` and `BOT_APP_KEY` in `platform`. It replaces
  `BUILD_WATCH_TOKEN`.
- [ ] Filter and push:

  ```bash
  git clone --no-local https://github.com/Everloot/everloot.git platform-split && cd platform-split
  git filter-repo --path kb/ --path supabase/ --path docs/ \
    --path .github/workflows/build-watch.yml --path .github/workflows/changes.yml \
    --path .github/workflows/ecosystem.yml --path .github/workflows/mcp-image.yml \
    --path scripts/generate-snapshot.ps1 --path scripts/check_changes_files.py \
    --path scripts/test_check_changes_files.py
  git tag -l | xargs -r git tag -d
  git remote add origin https://github.com/Everloot/platform.git
  git push -u origin main
  ```

  Keep the `kb/` and `supabase/` folders as they are; prune `docs/` to the platform's design records.
- [ ] Workflows: guards become `github.repository == 'Everloot/platform'`; they mint a token with
  `actions/create-github-app-token` and check out `Everloot/web` (and `Everloot/addon` for
  `raid_data.lua`) to open their pull requests there, with the same file allowlists as today
  (`build-watch.yml:165`, `check_changes_files.py`).
- [ ] Knowledge release: `gh release download mcp-knowledge-2026-10-05 -R Everloot/everloot` and
  re-create it in `platform`; `mcp-image.yml` reads it from there.
- [ ] Publish `@everloot/platform` to GitHub Packages on `platform-vX.Y.Z` tags (an internal tag, not
  one of the app tags in the spec); grant `Everloot/web` read access in the package settings.
- [ ] Scheduled bots and Actions minutes (spec, point 7): until Carlos decides, register a
  self-hosted runner for `platform` on a machine the owner runs and set the scheduled workflows to
  `runs-on: self-hosted`; pull-request CI stays on GitHub's runners.
- [ ] `LICENSE`: replace with "Copyright (C) 2026 R21 Media Group, LLC. All rights reserved." and a line
  saying that versions published in `Everloot/everloot` before the split remain available under
  AGPL-3.0-only.

### Task 3.7: `Everloot/web` (private) and the cutover

- [ ] **[OWNER]** Create the private, empty repository `Everloot/web`.
- [ ] Filter and push:

  ```bash
  git clone --no-local https://github.com/Everloot/everloot.git web-split && cd web-split
  git filter-repo --path web/ --path .vercelignore --path scripts/cleanup-test-data.ps1 \
    --path scripts/issue-publication-grant.ts --path-rename web/:
  git tag -l | xargs -r git tag -d
  git remote add origin https://github.com/Everloot/web.git
  git push -u origin main
  ```

- [ ] `.npmrc`: `@everloot:registry=https://npm.pkg.github.com` and
  `//npm.pkg.github.com/:_authToken=${NPM_TOKEN}`. Dependencies `@everloot/platform`,
  `@everloot/protocol`, `@everloot/sdk` by version.
- [ ] **[OWNER]** A classic personal access token with only `read:packages` (GitHub Packages' npm
  registry takes classic tokens; check the current GitHub docs when creating it), one-year expiry,
  stored as `NPM_TOKEN` in Vercel (build) and as a repository secret in `web`.
- [ ] Addon download: `scripts/fetch-addon.mjs` in `prebuild` downloads the latest `addon-v*` release's
  `Everloot-<v>.zip` and `SHA256SUMS` from `Everloot/addon` (public, no token), checks the hash and
  writes `public/downloads/`. `src/lib/addon-release.ts` is unchanged. `web/public/downloads/*.zip`
  are no longer committed. The addon release workflow calls a Vercel deploy hook (`VERCEL_DEPLOY_HOOK`
  secret in `addon`) so a release reaches `/upload` without a code change.
- [ ] Wording: footer Source link (`src/lib/source.ts`), `llms.ts:153`, `/connect`, and the MCP
  `websiteUrl` (`SOURCE_URL`, now in the platform) point at `https://github.com/Everloot` and say
  "open protocol, addon and SDK; private platform".
- [ ] **Cutover, no downtime:**
  1. **[OWNER]** Vercel: create project `everloot-site` from `Everloot/web`, root directory `.`, the
     same environment variables as `everloot-web` (import them per environment), production branch
     set to an unused branch name such as `cutover-hold`, so only preview deployments exist and no
     cron runs (Vercel runs crons only for production deployments).
  2. Preview checklist on the new project's preview of `main`, compared with production:
     `/`, `/database`, `/tools/talents`, `/tools/raid`, `/tools/auctions`, `/map`, `/changes`,
     `/lore`, `/search`, `/addons/popular`, `/connect`, `/upload` (download link answers 200),
     `/llms.txt`, `/api/health`, `/api/corpus/public`, `/api/market/prices`, `/api/rollups/drops`,
     `/mcp/public` (`tools/list` returns `TOOL_NAMES`), and a real `Everloot.lua` loaded on `/upload`
     up to the preview step, not sent.
  3. **[OWNER]** Set the new project's production branch to `main`, promote the checked deployment,
     then move `everloot.app` and `www.everloot.app` from `everloot-web` to `everloot-site`
     (same team, so DNS does not change).
  4. **[OWNER]** Immediately: `everloot-web` → Settings → Cron Jobs → disable, and Settings → Git →
     disconnect, so the old repository no longer deploys and the snapshot cron runs once.
  5. Verify production: the checklist again on everloot.app, this time sending one upload from
     Carlos's own client; `/api/health` fresh after the next 10-minute cron.
- [ ] Delete `web/`, `kb/` and `supabase/` from `Everloot/everloot` only after step 5 holds for 7 days.

### Task 3.8: `Everloot/addon`

- [ ] **[OWNER]** Rename `Everloot/everloot` to `Everloot/addon` (Settings → General). After that, no
  repository in the organization may be named `everloot`, or the old links stop redirecting.
- [ ] Clean-up pull request `chore(addon): this repository holds the addon only`:
  - Keep `addon/`, the addon tests and fixtures, `scripts/package-addon.py` and the guard scripts,
    `LICENSE`, `CHANGELOG.md` (addon entries), `README.md` (template, Task 3.1), `SECURITY.md`,
    `CONTRIBUTING.md`, `docs/` addon checklists, `.github/` (addon workflows, Dependabot for actions).
  - Remove everything already moved: `web/`, `kb/`, `supabase/`, `companion/`, `packages/`,
    `docs/` records that went to platform or web, the bot and image workflows.
  - `scripts/package-addon.py` writes `dist/Everloot-<v>.zip` (not committed); `release.yml` builds
    it in CI and attaches it instead of checking a committed zip; `nightly.yml` keeps working.
  - `checks.yml` keeps `guards` and a `verify` that runs only the addon tests, so the required check
    names stay valid.
  - Leave stubs for `docs/DATA_POLICY.md` and `TRADEMARKS.md` pointing to `Everloot/.github`.
- [ ] **Verify:** `curl -sI https://github.com/CDVolvik/everloot` and
  `curl -sI https://github.com/Everloot/everloot` both end at `https://github.com/Everloot/addon`;
  an `addon-v` tag publishes a release with the zip, and the site's `/upload` shows it after the
  deploy hook runs.

### Task 3.9: Issue transfers

Transfers go from public to private repositories, never back. Before moving an issue into a private
repository, comment that work continues privately and that updates appear on the roadmap Project.
The open issues on 2026-10-17, and where each goes:

| Issue | Title | To |
|---|---|---|
| #1 | Test `audit-sources` from the command line | platform |
| #2 | Silence the unused `anyRecord` lint warning | protocol |
| #3 | Link the data policy from the site | web |
| #4 | Let the internal-paths check read lockfiles too | stays in addon |
| #6 | Record auction deposits that are lost | stays in addon |
| #7 | Fewer damaged lore pages | platform |
| #8 | Wrong data reports from the first week | `.github` |
| #9 | Share observed data with Polestar | `.github` (cross-repo) |
| #10 | kb search: indexed `name_norm` column | platform |

- [ ] Re-list open issues on the day (`gh issue list -R Everloot/addon --state open`), extend the table,
  then `gh issue transfer <n> Everloot/<repo> -R Everloot/addon` per row. Remove `good first issue`
  from issues that move to private repositories.

### Task 3.10: `Everloot/ios`

- [ ] **[OWNER]** When iOS work starts: create the private repository from the README template, apply
  Task 3.1's standards, and add it to the front page.

### Phase 3 verification

- [ ] Each repository's CI passes on its own `main`.
- [ ] everloot.app serves from `Everloot/web`; the Task 3.7 checklist holds; the snapshot cron runs
  once per 10 minutes (one project).
- [ ] `Everloot/addon` holds only the addon and releases; old URLs redirect to it.
- [ ] `npm view @everloot/protocol` and `npm view @everloot/sdk` show the repositories' latest tags.
- [ ] Every open issue is in the repository that owns it; the front page lists each repository with
  its visibility.

### Rollback for the risky Phase 3 steps

- **Privatising (creating web and platform).** Nothing public changes until the folders are deleted
  from this repository. Before that, delete the private repositories and continue in the monorepo.
  After the clean-up, `git revert` the clean-up merge restores the folders.
- **Web cutover.** Move `everloot.app` and `www.everloot.app` back to `everloot-web`, re-enable its
  crons and reconnect it to the monorepo; disable crons on `everloot-site`. Keep `everloot-web`
  untouched for 30 days after the cutover for this purpose.
- **Rename.** Rename `Everloot/addon` back to `Everloot/everloot`; redirects follow.
- **A split repository is wrong.** Delete it, fix the filter command here, run it again on a fresh
  clone.
