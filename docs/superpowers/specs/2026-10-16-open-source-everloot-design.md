# Open-sourcing Everloot

**Date:** 2026-10-16
**Status:** design approved section by section in conversation with Carlos; this document awaits his review.
**Target:** repository public around 2026-10-24, together with the CurseForge upload, and well before the
WoW: Forever launch on 2026-11-04.

## Why

Carlos wants Everloot to be an open project that anyone can take part in, to the standard
[Polestar](https://github.com/fitzforge/polestar) sets for a WoW: Forever addon. All four goals count:

1. **Contributors.** Players and developers send data, fixes and features through issues and PRs.
2. **Transparency.** Anyone can read what the addon collects, what the site publishes and why.
3. **Portfolio.** The repository holds up when a developer reads it closely.
4. **Open data.** What players observe becomes a public CC BY-SA dataset that others can build on.

everloot.app stays a commercial site: it will carry AdSense. An open license does not conflict with
that. The protection against a competing copy is the trademark, not the license.

## Decisions

| Question | Decision |
|---|---|
| What goes public | The whole monorepo, `CDVolvik/everloot`: addon, kb, web, companion, MCP server |
| Code license | AGPL-3.0-only |
| Copyright holder | R21 Media Group, LLC and Everloot contributors |
| Contributions | Developer Certificate of Origin (`git commit -s`); no CLA |
| Data license | CC BY-SA 4.0 for everything published, including what players upload |
| Channels | GitHub Issues with forms, GitHub Discussions, an Everloot Discord, a public roadmap |
| Git history | Kept, after a secret scan; internal files leave at HEAD |
| Sequence | Make it ready while private, in three PRs, then flip it public |

**What DCO costs, recorded so nobody rediscovers it later:** R21 cannot relicense contributed code (no
proprietary edition, no paid non-AGPL license) without each contributor's consent. Once outside code is
merged, everything production runs must be published, which already holds because production deploys
from `main`. Anyone may run a fork of the site, ads included, if they publish their source and use
another name; a CLA would not prevent that either.

## 1. Safety and cleanup (PR a)

**Secrets.** A gitleaks scan of the current branch's history on 2026-10-16 (243 commits, merges
skipped) found nothing. Before the flip, scan every branch (`gitleaks git --log-opts=--all`). A gitleaks
step joins CI so every PR is scanned. Production secrets stay in Vercel; `.env.example` lists names only.

**Moved to the maintainer's notes, outside the repository** (removed at HEAD; they remain in history):

- Working notes: `_STATUS.md`, `NEXT_SESSION.md`, `BUILD_PLAN.md`, `design-run.md`, `docs/TRACKER.md`.
- Dated status logs: `docs/2026-10-05-full-assessment.md`, `docs/2026-10-05-next-sprint.md`,
  `docs/2026-10-07-intake-quota-verification.md`, `docs/2026-10-07-launch-recovery.md`,
  `docs/2026-10-07-replay-sharing-verification.md`, `docs/2026-10-08-five-track-progress.md`,
  `docs/2026-10-09-recovery-runbook.md`.
- Business files: `docs/WoWCollectorTracker_Architecture_and_Strategy.docx`,
  `docs/WoWCollectorTracker_Competitive_Matrix.xlsx`, `docs/2026-10-16-polestar-outreach-draft.md`.

**Kept public:** `docs/superpowers/specs` and `plans`, `docs/architecture.md`,
`docs/sources/source-catalog.md`, `docs/LEGACY_DATA_POLICY.md`, `docs/references.md`, the beta and
release checklists, the MCP hosting options and the recipe design notes. In every kept file, lines
naming the maintainer's private workspace, a secrets folder or file location, or a personal machine path are rewritten
generically ("the maintainer's secrets store").

**Known and accepted:** commit author emails become public with the history. Infrastructure
identifiers in history (the Supabase project ref, the R2 bucket name) become visible; they are not
credentials.

**Handoffs:** agents read and write Everloot status in the maintainer's notes from now on. The repository README
tells maintainers where it lives without naming private paths.

### Provenance audit

Nothing Everloot publishes may have come from scraping, and every external source we have touched is
on record. The audit produces `docs/sources/LEDGER.md`, one row per source:

| Column | Meaning |
|---|---|
| Source | Name and URL |
| Terms | License, or the terms and robots.txt reading, with the date read |
| Use | `published data`, `local only`, `link only` or `research only` |
| Evidence | Commit, file or release that shows how it was used |
| In releases | Whether any of its data is in a knowledge release or the public corpus |

**Inputs to reconcile:** `docs/sources/source-catalog.md`, `docs/references.md`, the specs, the
Everloot research notes in the maintainer's notes, Carlos's GitHub stars related to WoW, every URL cited in code
and curated entries, and the importers and fetchers in code and in history.

**Checks the audit runs and records:**

- Every knowledge database and release built so far holds only `warcraft-wiki-2023` and `curated`
  rows. A first look on 2026-10-16 confirmed this for the 09-27, 10-05 and 10-16 releases and the
  10-16 source database; the audit repeats it for every file under `kb/data`, including the working
  database and `raw/`.
- The public corpus (Supabase) holds only addon uploads.
- The downloadable addon zip contains only Everloot's own code.
- The single curated row and every curated `source_url` are cited and allowed by the data policy.

**Known history, disclosed rather than erased:** on 2026-09-27 a `wago.tools` importer
(`kb/src/importers/wago.ts`) was written and removed the same morning in `ca185a6`, after a robots.txt
check showed `/db2` is disallowed. It ran before the first real build and no wago data exists in any
database. The ledger states this plainly.


`THIRD_PARTY.md` (section 3) summarizes the ledger's `published data` rows. The flip waits until the
ledger covers every source found.

## 2. Data sources and collection policy (PR b)

Published as `docs/DATA_POLICY.md`, linked from the README, CONTRIBUTING and the site.

**Primary source: what players observe.** The addon's drops, vendors, auctions, recipes and trainers,
corroborated before the site shows them, as today. Blizzard hides Forever item stats until an item
drops, so observation in play is how anyone, Wowhead included, learns this data.

**Open sources.** The Warcraft Wiki 2023 dump (CC BY-SA 4.0) and, if needed, MIT-licensed datasets
such as pfQuest and wowsims. Each is listed in `THIRD_PARTY.md` with its license and exact revision.

**Wowhead facts, with guardrails.** Wowhead's robots.txt (read 2026-10-16) blocks AI crawlers and
Scrapy from the whole site and has no rule for other agents. Its Terms of Use were not read: search did
not surface them and our AI tools do not fetch Wowhead. So:

1. **Gate.** Nothing is built until Carlos reads Wowhead's Terms of Use and confirms that automated
   per-page lookups are not prohibited, or Wowhead grants permission. If the terms forbid it, the
   feature is dropped.
2. **Facts only:** ids, levels, coordinates, looted counts. No text, images or guides.
3. **Gaps only:** a lookup runs for an entity our own data lacks or disputes. No crawling, and never
   the `list` or `random` pages.
4. **Honest and slow:** user agent `EverlootFacts/1.0 (+https://everloot.app/contact)`, never a browser
   string or a blocked bot name; at most one request every few seconds; every response cached.
5. **Local only:** stored under a `wowhead-facts` source with `publishable: false`, like the Battle.net
   API cache. It is used to check and fill gaps in our observations and is never republished in the
   CC BY-SA dataset or shown on the site, unless Wowhead gives written permission.
6. **Run by the maintainer**, not from an AI agent's shell. The script is in the public repository.

**Refused, and said so publicly:** bulk scraping of any site; reading the game client's files or
memory, which the Blizzard EULA forbids (tolerated tools read only files the client writes, such as
SavedVariables, and published APIs); and **spoilers**: Everloot publishes only what players have
actually seen drop or happen in the game.

This is our reading of the rules, not legal advice.

## 3. Licensing (PR b)

- **`LICENSE`**: the full AGPL-3.0 text, with the copyright line `© 2026 R21 Media Group, LLC and
  Everloot contributors`. Every `package.json` gets `"license": "AGPL-3.0-only"`, and the addon's
  `.toc` gets `## X-License: AGPL-3.0`. No per-file headers.
- **Why `-only`:** future license versions apply only if R21 chooses them. AGPL-3.0 and GPL-3.0 combine
  under AGPL section 13, so code can move between Everloot and Polestar in either direction.
- **Source offer (AGPL section 13).** The site footer links "Source" to the GitHub commit in
  production, from `VERCEL_GIT_COMMIT_SHA`. The MCP server's `serverInfo` and the companion's About
  screen carry the repository URL.
- **Data.** Published observations, corpus exports and MCP answers are CC BY-SA 4.0, credited to
  "Everloot contributors". Lore keeps its Warcraft Wiki credit. The existing upload consent copy in
  the addon and companion gains one plain sentence: uploaded observations are published under
  CC BY-SA 4.0. Local-only sources stay `publishable: false`, and the release build already refuses them.
- **`TRADEMARKS.md`.** "Everloot", its logo and everloot.app are not licensed by the AGPL. Forks are
  welcome under another name.
- **`THIRD_PARTY.md`**, as Polestar does: one row per input with its license and where it is used
  (Warcraft Wiki dump, Blizzard trademark notice and game facts, the Battle.net API cache, fonts and
  icons). The PR runs a dependency license check and records that every npm dependency is compatible.

## 4. Contributor experience (PR c)

CI (`checks.yml`) already needs no secrets: kb, web, companion and the Lua contract tests pass on a
fresh clone. What a newcomer still hits, and the fix for each:

1. **Local lore pages are empty without the R2 release.** `npm run sample-release` in `web/` builds a
   small release (the test rows plus a few dozen sample pages) into `web/.data/` and prints the
   `KB_SNAPSHOT_PATH` line for `.env.local`.
2. **The README is out of date** (it says pnpm and "Sessions 0–2"). Rewrite it for players and
   contributors: what Everloot is, its four parts, installing the addon, running each part, links to
   CONTRIBUTING, the data policy, the license and Discord.
3. **`CONTRIBUTING.md`** leads with ways to help without code: play with the addon and upload; report
   wrong data; fix a lore page. Then code: DCO sign-off, running and testing each part, the PR
   checklist, how releases and data publishing work.
4. **DCO check:** an Action that fails a PR whose commits lack `Signed-off-by` and explains the fix.
5. **gitleaks** in CI (section 1).
6. **Issue forms:** bug report (addon version, debug output), wrong data (entity link, what you saw,
   where), feature idea; `config.yml` sends questions to Discussions and Discord.
7. **PR template:** what changed, how it was tested, DCO reminder, a data-policy checkbox (no scraped
   or spoiler data).
8. **`SECURITY.md`** (report privately through GitHub security advisories or the contact address) and
   **`CODE_OF_CONDUCT.md`** (Contributor Covenant 2.1).
9. **Labels:** `good first issue`, `help wanted`, `data`, `addon`, `web`, `lore`; 8 to 10 real starter
   issues opened at the flip.
10. **Per-part READMEs** for `addon/`, `kb/`, `web/` and `companion/` (run, test, where things live),
    with `docs/architecture.md` as the shared map.

Every public document passes the craft-ownership gate and a humanizer pass before the flip.

## 5. Community and going public

| When | What | Who |
|---|---|---|
| 10/17 | PR a: cleanup and provenance audit | Agent; Carlos merges |
| 10/18–19 | PR b: data policy, licensing, footer Source link, consent sentence | Agent; Carlos merges |
| 10/19–22 | PR c: contributor experience | Agent; Carlos merges |
| 10/23 | Pre-flip check (below) | Agent |
| ~10/24 | Flip public with the CurseForge upload | Carlos |
| 10/24–11/03 | Starter issues, roadmap board, Discord, announcements | Both |

**Pre-flip check (agent):** the provenance ledger covers every source found, and every release's
sources are `warcraft-wiki-2023` and `curated` only; gitleaks across all branches is clean; searching HEAD for internal paths
(`scripts/check_internal_paths.py`) finds nothing; a fresh clone in an empty folder, following
only the README, runs the tests and shows lore pages from the sample release; no workflow uses
`pull_request_target`, and no workflow exposes secrets to pull requests from forks (`mcp-image.yml`
included).

**Carlos at the flip:**

- GitHub: make the repository public; enable Discussions and private vulnerability reporting; protect
  `main` (required checks including DCO, no force pushes).
- Install the DCO GitHub App (github.com/apps/dco) and make its check required. The repository's own
  `check_dco.py` gives contributors the fix, but a pull request can edit it; the app cannot be edited.
- Vercel: confirm Git Fork Protection is on, so pull requests from forks never build with production
  secrets without approval.
- GitLab mirror: decide whether it goes public too or stays a private backup.
- Create the Discord server from the agent's draft (channels #announcements, #help, #data-reports,
  #addon-dev, #site-dev, #lore; rules pointing to the code of conduct; a welcome message).

**Roadmap:** a GitHub Project board (Planned, In progress, Up for grabs, Done) and a short
`ROADMAP.md` that links to it and names the near-term goals: launch, the data export, data sharing
with Polestar.

**Announcements**, drafted by the agent and posted only by Carlos: the CurseForge description, a
Polestar Discussion (updating the existing outreach draft), a Reddit post and an X post. The message:
open source, open data, observed in play, no spoilers.

## Done when

A stranger can find the repository, understand it, run it locally and send a signed-off PR without
asking anyone, and the site, the MCP server and the published data all carry the right licenses and
the source link.

## Out of scope

- Building the Wowhead facts lookup (it waits on the terms gate in section 2).
- The CC BY-SA data export itself and the Polestar data feed; they follow launch and get their own spec.
- Rewriting commit author emails or any history rewrite.
- Copyright headers in every file.
