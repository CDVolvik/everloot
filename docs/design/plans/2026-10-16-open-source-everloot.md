# Open-sourcing Everloot Implementation Plan


**Goal:** Make `CDVolvik/everloot` ready to go public around 2026-10-24: no internal traces, every data source on record, correct licenses, and a repository a stranger can run and contribute to.

**Architecture:** Three PRs while the repository is still private: **a** cleanup and provenance audit, **b** data policy and licensing, **c** contributor experience. Then a pre-flip check, then Carlos flips visibility. Code changes are small (footer link, MCP URL, consent copy, a sample-release script, two CI checks). Most of the work is documents and an audit.

**Tech Stack:** Next.js 15 / React 19 / Vitest (web), TypeScript + better-sqlite3 + Vitest (kb, companion), Lua 5.1 addon with Python contract tests, GitHub Actions, gitleaks.

**Spec:** `docs/design/specs/2026-10-16-open-source-everloot-design.md`

## Global Constraints

- Code license: `AGPL-3.0-only`. Copyright line: `© 2026 R21 Media Group, LLC and Everloot contributors`.
- Data license: `CC BY-SA 4.0`, credited to "Everloot contributors"; lore keeps its Warcraft Wiki credit.
- Repository URL everywhere: `https://github.com/CDVolvik/everloot`.
- Every commit from now on is signed off (`git commit -s`).
- Publishable sources are exactly `warcraft-wiki-2023` and `curated`. Anything else in a release is a failure.
- No public file may name the maintainer's private workspace, secrets folder, user folder or agent worktrees. `scripts/check_internal_paths.py` holds the exact patterns.
- Public prose passes the craft-ownership gate and the humanizer pass; plain words, no AI phrasing.
- Branches: PR a `chore/oss-cleanup` (from `docs/open-source-spec`, so the spec and this plan ship in it), PR b `feat/oss-licensing` (from a), PR c `feat/oss-contributors` (from b). Carlos merges; merging `main` deploys production.
- Nothing is posted, published or made public by an agent. Visibility, Discord, Discussions and announcements are Carlos's.

## Review Focus

1. **Fork PRs and secrets.** After the flip, a stranger's PR must not run a workflow with secrets. Pinned by the workflow check in Task 15.
2. **Things that become public with the repository besides code.** The GitHub release `mcp-knowledge-2026-10-05` (a 338 MB knowledge DB that `mcp-image.yml` downloads) and the `ghcr.io/cdvolvik/everloot-mcp` image. Pinned by Task 15's release/package listing.
3. **Internal paths creeping back after the flip.** gitleaks does not catch them. Pinned by the `internal-paths` CI step in Task 4.
4. **DCO on real PR shapes:** merge commits, a commit whose body has `Co-Authored-By` but no sign-off, a sign-off in the middle of the body. Pinned by Task 12's tests.
5. **Windows contributors.** `npm run sample-release` must print a `KB_SNAPSHOT_PATH` line that works in `.env.local` on Windows (forward slashes). Pinned by Task 11's test.

---

## PR a: cleanup and provenance audit

### Task 1: Release source audit command

**Files:**
- Create: `kb/src/audit-sources.ts`
- Modify: `kb/src/cli.ts` (add an `audit-sources` command)
- Test: `kb/test/audit-sources.test.ts`

**Interfaces:**
- Produces: `auditSources(path: string): { path: string; sources: Record<string, number>; unexpected: string[] }` and CLI `audit-sources <file...>` that prints one line per file (`<path>: warcraft-wiki-2023=260572 curated=1`) and exits 1 if any file has `unexpected` sources. Used again in Task 15.

- [ ] **Step 1: Write the failing tests** in `kb/test/audit-sources.test.ts`, building databases with `openDb` and `replaceSourceRows` as `snapshot.test.ts` does:
  - `"a database with only wiki and curated rows passes"`: `expect(auditSources(p)).toEqual({ path: p, sources: { "warcraft-wiki-2023": 2, curated: 1 }, unexpected: [] })`.
  - `"any other source is reported"`: insert one `blizzard-api` row; `expect(auditSources(p).unexpected).toEqual(["blizzard-api"])`.
  - `"a file that is not a database throws"`: write `"x"` to a file; `expect(() => auditSources(p)).toThrow()`.
- [ ] **Step 2: Run** `cd kb && npx vitest run test/audit-sources.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `auditSources` in `kb/src/audit-sources.ts`: open read-only, `SELECT source_id, count(*) FROM entities GROUP BY source_id`, compare against the ids in `SOURCES` with `publishable: true`. Wire the CLI command next to `snapshot` in `kb/src/cli.ts`.
- [ ] **Step 4: Run** the test file, then `npx vitest run && npx tsc --noEmit` in `kb`. Expected: all pass.
- [ ] **Step 5: Run it on every built file:** `node ./node_modules/tsx/dist/cli.mjs src/cli.ts audit-sources <each .sqlite in the maintainer's kb data folder, including release/ and the working wowvault-kb.sqlite>`. Expected: exit 0. Paste the output into Task 2's ledger evidence. If anything is unexpected, stop and tell Carlos.
- [ ] **Step 6: Commit** `git commit -s -m "kb: audit-sources reports any non-publishable source in a database"`.

### Task 2: Provenance ledger

**Files:**
- Create: `docs/sources/LEDGER.md`
- Modify: `docs/sources/source-catalog.md` (top note pointing to the ledger as the record of what was used)

**Interfaces:**
- Consumes: Task 1 output.
- Produces: the ledger's `published data` rows, which Task 9 summarizes in `THIRD_PARTY.md`.

- [ ] **Step 1: Gather inputs** and keep the raw lists out of the repository (scratch in the maintainer's notes):
  - `docs/sources/source-catalog.md`, `docs/references.md`, every spec under `docs/design/specs`.
  - Everloot research notes in the maintainer's notes (pages that mention Everloot, Forever, Polestar or WoW data).
  - Carlos's WoW-related GitHub stars: `gh api user/starred --paginate --jq '.[] | [.full_name, .license.spdx_id // "none", .description] | @tsv'`, filtered to WoW, Warcraft, addon or Forever.
  - Every URL in code: `git grep -hoIE "https?://[a-zA-Z0-9./_-]+" -- ':!docs' ':!*.md' ':!*/package-lock.json'`, deduplicated by host.
  - Importers and fetchers now and in history: `git log --all --diff-filter=A --name-only --format= | grep -iE "import|fetch|scrap|crawl|wago|wowhead"`.
- [ ] **Step 2: Write `docs/sources/LEDGER.md`:** a short intro (what the ledger is, that it is complete as of its date), then the table with columns Source, Terms, Use, Evidence, In releases, as the spec defines. `Use` is one of `published data`, `local only`, `link only`, `research only`. Group rows under those four headings.
- [ ] **Step 3: Add the history section** in plain words: the `wago.tools` importer written and removed on 2026-09-27 in `ca185a6` after the robots.txt check, before the first real build, with no wago data in any database (cite the Task 1 output).
- [ ] **Step 4: Add the release evidence section:** the Task 1 output for each file, and the statement that the public corpus is written only by the intake API. Prove that by listing every insert into the corpus tables (`git grep -nE "insert|upsert" -- web/src supabase` filtered to corpus tables) and naming the only caller.
- [ ] **Step 5: Check** that every host from Step 1's URL list appears in the ledger: a one-off `comm` of the deduplicated host list against the hosts in `LEDGER.md` prints nothing. Hosts that are plainly infrastructure (`registry.npmjs.org`, `example.test`, `localhost`, `www.w3.org`, `www.sitemaps.org`) are listed together in one row named "Infrastructure and placeholders, not data sources".
- [ ] **Step 6: Commit** `git commit -s -m "docs: provenance ledger of every external source"`.

### Task 4: Move internal files out, scrub paths, guard with CI

**Files:**
- Remove from the repository (copy to the maintainer's notes, outside the repository, first, each into the same relative path): the files the spec lists under "Moved to".
- Modify: every kept file that `scripts/check_internal_paths.py` flags.
- Modify: `.github/workflows/checks.yml` (two new steps)
- Modify: `README.md` (one maintainer line; the full rewrite is Task 13)

- [ ] **Step 1: Copy, then confirm the copies:** for each moved file, `cmp` the copy in the maintainer's notes against the repository version. Expected: identical.
- [ ] **Step 2: Remove** them with `git rm`.
- [ ] **Step 3: Rewrite each matching line** in kept files generically: "the maintainer's secrets store", "the maintainer's notes", "a local data folder". Keep the sentence's meaning.
- [ ] **Step 4: Add to `checks.yml`:**
  - a gitleaks step (`gitleaks/gitleaks-action` pinned to a full commit SHA, or the gitleaks binary from its release with checksum verification) scanning the PR's commits;
  - an `internal-paths` step: `python scripts/test_check_internal_paths.py && python scripts/check_internal_paths.py`.
- [ ] **Step 5: Verify locally:** the `internal-paths` command exits 0, and `gitleaks git --redact --log-opts=--all .` reports no leaks.
- [ ] **Step 6: Add to `README.md`** under a "Maintainers" line: "Project status and handoff notes are kept outside this repository."
- [ ] **Step 7: Commit** `git commit -s -m "Move internal notes out of the repository; CI guards secrets and internal paths"`.
- [ ] **Step 8: Write progress to the maintainer's status file** (the moved `_STATUS.md`): PR a open, what moved, the ledger result. Then open PR a.

---

## PR b: data policy and licensing

### Task 5: Data policy

**Files:**
- Create: `docs/DATA_POLICY.md`

- [ ] **Step 1: Write it** from spec section 2, for players and contributors: what Everloot publishes (player observations, corroborated), the open sources, the Wowhead rule (all six guardrails, and that nothing is built until the terms gate passes), what is refused (bulk scraping, client file or memory reading, spoilers), and "this is our reading of the rules, not legal advice". Link `docs/sources/LEDGER.md`.
- [ ] **Step 2: Commit** `git commit -s -m "docs: data and no-spoiler policy"`.

### Task 6: License files and fields

**Files:**
- Create: `LICENSE` (verbatim AGPL-3.0 text from `https://www.gnu.org/licenses/agpl-3.0.txt`, preceded by the copyright line), `TRADEMARKS.md`
- Modify: `kb/package.json`, `web/package.json`, `companion/package.json` (`"license": "AGPL-3.0-only"`), `addon/Everloot.toc` (`## X-License: AGPL-3.0`)

- [ ] **Step 1: Fetch the license text** with `curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt`. Check that it begins with `GNU AFFERO GENERAL PUBLIC LICENSE` and contains `Version 3, 19 November 2007`.
- [ ] **Step 2: Write `TRADEMARKS.md`:** "Everloot", its logo and everloot.app are not licensed by the AGPL; forks are welcome under another name; contact for questions.
- [ ] **Step 3: Set the license fields.** Run `npm install --package-lock-only` in each package so the lockfiles agree.
- [ ] **Step 4: Run** `python scripts/package-addon.py && git diff --stat -- web/public/downloads`. If the zip changed because of the `.toc` line, keep it: the CI step `git diff --exit-code -- web/public/downloads` requires the committed zip to match.
- [ ] **Step 5: Run** all suites (kb, web, companion, addon contract tests, as in `checks.yml`). Expected: all pass.
- [ ] **Step 6: Commit** `git commit -s -m "License: AGPL-3.0-only, R21 Media Group, LLC and contributors; trademark note"`.

### Task 7: Source link in the footer and the MCP server

**Files:**
- Create: `web/src/lib/source.ts`, `web/src/components/footer.test.tsx`
- Modify: `web/src/components/Footer.tsx`, `kb/src/mcp-server.ts:252`
- Test: `kb/test/mcp-server.test.ts` (or the existing MCP server test file)

**Interfaces:**
- Produces: `REPO_URL = "https://github.com/CDVolvik/everloot"` and `sourceUrl(sha = process.env.VERCEL_GIT_COMMIT_SHA): string`, which returns `${REPO_URL}/tree/${sha}` when `sha` is 7–40 hex characters and `REPO_URL` otherwise.

- [ ] **Step 1: Write the failing tests:**
  - `footer.test.tsx`: `"links Source to the deployed commit"` stubs `VERCEL_GIT_COMMIT_SHA=abc1234`, renders `Footer`, and expects a link named `Source` with `href` `https://github.com/CDVolvik/everloot/tree/abc1234`. `"links Source to the repository when no commit is known"` expects `https://github.com/CDVolvik/everloot`. `"ignores a malformed sha"` uses `"../x"` and expects the repository URL.
  - MCP test: the `initialize` result's `serverInfo` carries `websiteUrl: "https://github.com/CDVolvik/everloot"`. If SDK 1.31's `Implementation` type has no `websiteUrl`, the test instead asserts that the `instructions` string contains the URL.
- [ ] **Step 2: Run** both. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `<a href={sourceUrl()}>Source</a>` to the footer's link row, styled like `About`. Add the next line under the Blizzard notice: "Code AGPL-3.0, data CC BY-SA 4.0." Pass `websiteUrl: REPO_URL` (kb keeps its own constant; kb does not import from web) to `new McpServer`.
- [ ] **Step 4: Run** the web and kb suites. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -s -m "Source link in the footer and the MCP server info (AGPL section 13)"`.

### Task 8: Upload consent sentence

**Files:**
- Modify: `web/src/app/upload/page.tsx:21-25`, `companion/src/cli.ts:105`
- Test: create `web/src/app/upload/page.test.tsx`; modify `companion/test/cli.test.ts`

**Exact copy (the same in both):** `Uploaded observations are published under CC BY-SA 4.0, credited to Everloot contributors.`

- [ ] **Step 1: Write the failing tests:** the upload page renders the exact sentence. In companion, the watch start-up output contains the exact sentence and `https://github.com/CDVolvik/everloot`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Add a sentence to the upload intro paragraph. In companion, print the sentence and `Source: https://github.com/CDVolvik/everloot` once, before `Watching N file(s)`.
- [ ] **Step 4: Run** the web and companion suites. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -s -m "Upload consent says the data license"`.

### Task 9: THIRD_PARTY.md and the dependency license check

**Files:**
- Create: `THIRD_PARTY.md`

- [ ] **Step 1: Run the license check** in `kb`, `web` and `companion`: `npx --yes license-checker-rseidelsohn --production --summary`. Any license outside MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, CC0-1.0, BlueOak-1.0.0, Python-2.0, MPL-2.0 or CC-BY-4.0 is listed by package and raised with Carlos before merging.
- [ ] **Step 2: Write `THIRD_PARTY.md`** in Polestar's format (Component | Used for | Licence | Where). One row per `published data` and `local only` ledger row, plus fonts and icons the site ships and the Blizzard trademark notice. The last section, "Dependencies", gives the Step 1 summary per package and its date.
- [ ] **Step 3: Commit** `git commit -s -m "THIRD_PARTY.md and dependency license check"`, then open PR b.

---

## PR c: contributor experience

### Task 10: Per-part READMEs and architecture map

**Files:**
- Modify: `addon/README.md`, `kb/README.md`, `web/README.md`, `companion/README.md`, `docs/architecture.md`, `bot/README.md` and `ios/README.md` (mark both "not started" in one line each)

- [ ] **Step 1: Make each README cover** the same four things in the same order: what this part is, how to run it, how to test it (the exact commands from `checks.yml`), where things live. Remove session numbers and stale plans.
- [ ] **Step 2: Check** that each command written in a README runs from a fresh shell in that folder. Record the results in the PR description.
- [ ] **Step 3: Commit** `git commit -s -m "docs: per-part READMEs and the architecture map"`.

### Task 11: Sample release for local development

**Files:**
- Modify: `web/src/test/lore-release.ts` (an optional `dir` option)
- Create: `web/scripts/sample-release.ts`, `web/scripts/sample-release.test.ts`
- Modify: `web/package.json` (`"sample-release": "tsx scripts/sample-release.ts"`; add `tsx` to devDependencies if missing), `.gitignore` (`web/.data/`)

**Interfaces:**
- Consumes: `buildLoreRelease(options: { typed?: boolean; facets?: boolean; dir?: string }): Promise<string>`.
- Produces: `sampleRelease(outDir: string): Promise<{ path: string; envLine: string }>`, where `envLine` is `KB_SNAPSHOT_PATH=<path with forward slashes>`.

- [ ] **Step 1: Write the failing tests:** `sampleRelease(tmp)` returns a `path` that exists under `tmp`, with a `.manifest.json` beside it. `envLine` has no backslashes and equals `KB_SNAPSHOT_PATH=` plus the path with `\` replaced by `/`. Opening it with `KB_SNAPSHOT_PATH` stubbed gives `hasTypes() === true`.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement.** `buildLoreRelease` writes into `dir` when given, otherwise a temporary folder as now. The script calls `sampleRelease("web/.data")` and prints `envLine` with one line of instructions.
- [ ] **Step 4: Run** the web suite, then `npm run sample-release`. Put the printed line in `web/.env.local` and run `npm run dev`. `/lore`, `/lore/zones?letter=z` and `/search?q=grommash` should answer 200 with content.
- [ ] **Step 5: Commit** `git commit -s -m "web: npm run sample-release for local lore pages"`.

### Task 12: DCO check

**Files:**
- Create: `scripts/check_dco.py`, `scripts/test_check_dco.py`
- Modify: `.github/workflows/checks.yml` (on `pull_request`: `python scripts/check_dco.py origin/${{ github.base_ref }} HEAD`, with `fetch-depth: 0` on checkout; and run `python scripts/test_check_dco.py`)

**Interfaces:**
- Produces: `missing_signoff(messages: list[tuple[str, str, int]]) -> list[str]`, taking `(sha, body, parent_count)` and returning the shas that need a sign-off. CLI `check_dco.py <base> <head>` exits 1 and prints each sha with the fix: `git commit --amend -s` for one commit, or `git rebase --signoff <base>` for several.

- [ ] **Step 1: Write the failing tests** (plain `assert`, run with `python`, like `addon/tests`):
  - a body with a `Signed-off-by: Name <email>` line passes;
  - a merge commit (`parent_count == 2`) passes without a sign-off;
  - a body with only `Co-Authored-By:` fails;
  - `Signed-off-by:` inside a sentence, not at the start of a line, fails.
- [ ] **Step 2: Run** `python scripts/test_check_dco.py`. Expected: FAIL, import error.
- [ ] **Step 3: Implement** with `git log --format=%H%x00%P%x00%B%x1e <base>..<head>`. A line matching `^Signed-off-by: .+ <.+>$` counts as a sign-off.
- [ ] **Step 4: Run** the tests, then `python scripts/check_dco.py origin/main HEAD` on this branch. Expected: exit 0, since every commit since PR a is signed off. If older commits are in range, rebase `--signoff`.
- [ ] **Step 5: Commit** `git commit -s -m "CI: DCO sign-off check"`.

### Task 13: README, CONTRIBUTING and the community files

**Files:**
- Modify: `README.md` (full rewrite)
- Create: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1 verbatim, with the contact address from `/contact`), `ROADMAP.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/bug-report.yml`, `.github/ISSUE_TEMPLATE/wrong-data.yml`, `.github/ISSUE_TEMPLATE/feature.yml`, `.github/ISSUE_TEMPLATE/config.yml`

- [ ] **Step 1: README:** what Everloot is (one paragraph), its four parts with links to their READMEs, installing the addon, running locally (Task 11), the links (CONTRIBUTING, DATA_POLICY, LEDGER, LICENSE, TRADEMARKS; Discord is written as "Discord: opening at launch" until Task 16 adds the invite), and the license line.
- [ ] **Step 2: CONTRIBUTING:** ways to help without code first (play and upload; report wrong data; fix a lore page), then code: setup, tests per part, DCO (`git commit -s`, and the rebase fix), the PR checklist, how releases and data publishing work, and the data policy rule.
- [ ] **Step 3: Issue forms:** bug report (addon version, `/everloot status` output, what happened, what you expected); wrong data (Everloot link, what you saw in the game, zone and coordinates); feature idea. `config.yml` sets `blank_issues_enabled: false` and links Discussions and Discord.
- [ ] **Step 4: PR template:** what changed, how it was tested, `- [ ] Commits are signed off (DCO)`, `- [ ] No scraped, datamined or spoiler data (docs/DATA_POLICY.md)`.
- [ ] **Step 5: SECURITY.md** (private reporting through GitHub security advisories or the contact address; never in public issues) and **ROADMAP.md** (link to the Project board, added at the flip; near-term goals: launch on 11/04, the data export, data sharing with Polestar).
- [ ] **Step 6: Run** the craft-ownership gate and the humanizer pass over every file written in Tasks 5, 6, 9, 10 and 13. Apply the fixes.
- [ ] **Step 7: Validate the YAML** of each issue form with `python -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/ISSUE_TEMPLATE/*.yml`. Expected: no error.
- [ ] **Step 8: Commit** `git commit -s -m "README, CONTRIBUTING, issue forms, PR template, security and conduct"`.

### Task 14: Labels and starter issues, drafted

**Files:**
- Create: `scripts/flip/labels.sh`, `scripts/flip/starter-issues.md` (dropped from the repository after the flip)

- [ ] **Step 1: Write `labels.sh`:** one `gh label create --force` per label: `good first issue`, `help wanted`, `data`, `addon`, `web`, `lore`, `kb`, `companion`.
- [ ] **Step 2: Draft 8 to 10 starter issues** from real gaps (the deferred lore minors in the old handoff, the auction deposit, docs typos found in Task 10). Each one gets a title, body, labels and the files to look at.
- [ ] **Step 3: Draft the Discord and the announcements in the maintainer's notes** (a `flip/` folder, not the repository): the channel layout, rules and welcome message from spec section 5; the CurseForge description, an update to the Polestar Discussion draft, a Reddit post and an X post. The message is open source, open data, observed in play, no spoilers. Run the humanizer on each. Nothing is posted.
- [ ] **Step 4: Commit** `git commit -s -m "Flip kit: labels and starter issues"`, then open PR c.

---

## Before the flip

### Task 15: Pre-flip check

Run after PRs a, b and c are merged and production is verified. Record the results in the maintainer's status file and report them to Carlos.

- [ ] **Step 1:** `gitleaks git --redact --log-opts=--all .`. Expected: no leaks.
- [ ] **Step 2:** `audit-sources` (Task 1) on every built release, plus the release named by `EVERLOOT_KB_RELEASE_KEY` if one was published since. Expected: exit 0.
- [ ] **Step 3:** run the `internal-paths` command from Task 4 at `main`. Expected: exit 0.
- [ ] **Step 4: Workflows.** `grep -n "pull_request_target" .github/workflows/*.yml` prints nothing. Every job that uses `secrets.` runs only on `push` to `main` or `workflow_dispatch`, never on `pull_request`.
- [ ] **Step 5: What else turns public.** `gh release list` and `gh api /user/packages?package_type=container`. For the release `mcp-knowledge-2026-10-05`, confirm with Task 1 that its DB holds only publishable sources; it becomes downloadable at the flip, which the CC BY-SA license allows. Ask Carlos whether the `everloot-mcp` image should be public or stay private, since package visibility is separate from repository visibility.
- [ ] **Step 6: Fresh clone.** In an empty folder outside every worktree, `git clone`, follow only the README: install, run the tests of each part, `npm run sample-release`, `npm run dev`, then open `/lore`. Write down every place the README was not enough, and fix them before the flip.
- [ ] **Step 7: Report** to Carlos with each step's result. Then hand him Task 16.

### Task 16: Carlos's steps at the flip (owner only)

- [ ] Make the repository public; enable Discussions and private vulnerability reporting; protect `main` (required checks including DCO, no force pushes).
- [ ] Install the DCO GitHub App (github.com/apps/dco) and make its check required on `main`; a pull request can edit the in-repo `check_dco.py`, but not the app.
- [ ] Vercel: confirm Git Fork Protection is on.
- [ ] GitLab mirror: public, or a private backup.
- [ ] `everloot-mcp` image visibility (from Task 15 Step 5).
- [ ] Create the Discord from the agent's draft (channels #announcements, #help, #data-reports, #addon-dev, #site-dev, #lore; rules point to the code of conduct). Put the invite in the README, `config.yml` and CONTRIBUTING; an agent can open that PR.
- [ ] Create the GitHub Project board (Planned, In progress, Up for grabs, Done) and link it in `ROADMAP.md`.
- [ ] Run `scripts/flip/labels.sh`, create the starter issues, and remove `scripts/flip/` afterwards.
- [ ] Review and post the announcements the agent drafts: the CurseForge description, a Polestar Discussion, a Reddit post, an X post.
- [ ] Separate from the flip: read Wowhead's Terms of Use before any Wowhead facts work is planned (spec section 2, gate).
