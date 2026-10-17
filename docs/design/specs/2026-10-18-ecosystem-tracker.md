# Ecosystem tracker: Forever addons and open-source projects

Status: phase 1 built in the same pull request as this spec. Phases 2 and 3 are design only.
Sources and terms: `wiki/projects/everloot/2026-10-18-ecosystem-tracker-sources.md` (kept in the shared
Brain) and `docs/sources/LEDGER.md`. Data rules: `docs/DATA_POLICY.md`.

## What it is

One page, `/addons/ecosystem`, for every addon and open-source tool made for WoW: Forever. It ranks
**projects**, shows what a project's own repository says in public, and joins our install counts. The
owner's inspiration was the T3 tracker, a single-repo contributor scoreboard with XP, streaks and badges.
We start one level up (the ecosystem, not one repository) and leave room for community seasons later,
without ranking any person who did not ask to be ranked.

## Principles

1. Our own build. Third-party data appears only where the source's terms allow, with a link to the source.
2. Facts, not scores about people. Phase 1 stores no username, email or contributor list.
3. Never a zero for "unknown". A missing figure says "unknown" or "not counted".
4. A maintainer approves every listing.
5. Cheap and polite. Reads GitHub every few hours, never on a page view.

## Phase 1 (built)

### Registry

`kb/curated/ecosystem.json`, curated by hand, validated by `parseRegistry` in `kb/src/ecosystem.ts` (a test
parses the committed file). Per project: `id`, `name`, `kind` (addon or tool), `summary` (our words, at
most 160 characters), `repo` (`owner/name` on GitHub), optional `toc` path, `addonNames` (AddOns folder
names, for the install join), `verifiedAt` and `evidence` (the page that shows it is for Forever).

Seeded only with projects verified on 2026-10-18 against their own repositories: Everloot, Polestar
(fitzforge/polestar), Olympus (dnl-gentile/olympus-addon) and forever-ref (alcaras/forever-ref, a tool).
Each repository's description or `.toc` names WoW: Forever. Nothing else is guessed. Other addons that
the in-game lists show (Deadly Boss Mods and so on) are not Forever-specific and are not in the registry.

**Submission flow.** A GitHub issue form (`.github/ISSUE_TEMPLATE/ecosystem-project.yml`) takes the
repository link, the `.toc` path, the folder name and where it says the project is for Forever. A
maintainer reads it, opens the repository, adds the entry by pull request and merges it. The same form
handles "fix my listing" and "remove my project". No form writes to the repository by itself.

### Per-project metrics

Read from GitHub's public REST API by `npm run kb -- ecosystem-check` (`kb/src/ecosystem-fetch.ts`):

| Metric | How |
|---|---|
| Stars, archived, licence | `GET /repos/{repo}` |
| Latest release, date | `GET /repos/{repo}/releases/latest` (none is fine) |
| Last commit | `GET /repos/{repo}/commits?per_page=1` |
| Commits in 4 weeks | `commits?since=<28 days>&per_page=1`, page count from the `Link` header |
| Contributors | `contributors?per_page=1&anon=false`, page count; a number only |
| Open and closed issues | search `repo:x is:issue is:open` and `is:closed` |
| Median first reply | the 15 newest issues of the last 180 days that are not pull requests and not opened by the repo owner; hours to the first comment by someone else who is not a bot; an issue unanswered for 7 days counts as its age; fewer than 3 usable issues is "not measured". Token only |
| `.toc` interface | `contents/<toc path>`, `## Interface:` numbers |
| Installs | our own `addon_seen` rollup, joined at page time |

The statistics endpoints were tested and left on `202` for minutes on a cold cache, so they are not used.

**Installs and the 3-install rule.** `joinInstalls` takes the largest count among a project's folder
names (never the sum, since one install reports several folders) and returns nothing below 3 installs
(`INDEPENDENT_INSTALLS`). Everloot itself is not in `addon_seen` (the rollup leaves it out), so its card
says "not counted". A reader cannot tell "2 installs" from "none".

**Forever-ready.** A project is `yes` when its `.toc` lists an Interface number in `foreverInterfaces`,
`no` when it lists numbers and none match, `unknown` when no `.toc` was read. The list is data in the
registry, with a note. Open question 1 is that the right number is not settled.

### Snapshot and why it lives where it does

`kb/changes/ecosystem.json`, committed, with `refreshedAt`, each project's `fetchedAt`, and one star count per
UTC day for 35 days (only the Rising board reads it). Why under `kb/changes/` and not in the database or
fetched live:

- The site already bundles `kb/changes/*.json` (blue posts, builds). A refresh reaches visitors with the next
  deploy and needs no database, no Vercel cron, and no GitHub call during a page view.
- A pull request makes each refresh reviewable, and GitHub's limits are spent in CI, not by visitors.
- Cost: data is up to a few hours old plus review time. The page prints the refresh time.

The curated registry stays in `kb/curated/` because people edit it. Machine-written data stays in
`kb/changes/`, so the two never collide in a pull request.

### Boards

Five boards, all pure functions in `buildBoards`. Ties break on name. Archived projects and projects whose
repository is gone are on no board.

| Board | Rule |
|---|---|
| Most installed | installs from 3 up |
| Rising | stars gained over 7 days, from the newest daily point at least 6 days old, gains only. Empty until a week of history exists |
| Most active | commits in the last 4 weeks, ties by newest commit |
| Freshest release | newest GitHub release date |
| Best maintained | score below |

**Best-maintained score (0 to 100).** Points: commit within 30 days 30 (within 90 days 15); release within 180
days 20 (within 365 days 10); issues closed share of all issues, up to 20, only with at least 5 issues; median
first reply within 24 h 20, 72 h 15, 168 h 8, only when measured; a declared licence 10. A part we cannot
measure is removed from both earned and available points, so a project is never scored down for data that
does not exist (a release-free addon shipped through CurseForge, no token, few issues). At least 40 points must
be measurable. Archived projects have no score.

"Rising by installs" (week over week) needs install history we do not store. Phase 2 stores a weekly count
per project and switches Rising to installs, with stars as the fallback.

### Badges

For projects: Forever-ready, Active (commit in 30 days), Fresh release (release in 30 days), Responsive
(median first reply at most 48 h), Licensed, Archived. Each has a one-line definition shown on hover and
for screen readers. Badges describe facts about the repository; none is awarded by hand.

### Refresh

`ecosystem-check` skips a project read less than 3 hours ago (`--force` overrides), makes serial requests,
and follows GitHub's documented backoff: `retry-after`, then the reset time, then a minute doubling. A wait
over 2 minutes stops the run and keeps every earlier answer; a project that fails keeps its last answer and
its old timestamp. Without a token it uses 8 requests per project (60 an hour is about 7 projects); with a token
it also measures first-reply time. The workflow `.github/workflows/ecosystem.yml` runs every 6 hours, reads
with the default read-only `GITHUB_TOKEN`, and a second job with write permission pushes the branch
`data/ecosystem` and opens one rolling pull request. It never merges. A maintainer merges after reading the diff.
This differs from `changes.yml`, which auto-merges: this data comes from many third parties, and a
person should see a project change before the site does.

### MCP and surfaces

- `ecosystem_projects` (read-only): `board` (all, installed, rising, active, release, maintained), `forever_ready_only`,
  `limit` 1 to 25. Answers include the repository link, installs where counted, and the data age. Registered
  before `everloot_plan` and listed in `connect-data.ts` in the same order.
- `/addons` links to the page and the sitemap lists it. The header already has "Addons"; no new nav item.

## Phase 2: richer metrics and install history

- Weekly install counts per project, so Rising can use installs (the stronger signal, and costly to fake
  across real addon lists).
- Conditional requests with `ETag` and `if-none-match`, so unchanged repositories cost nothing against the
  primary limit.
- Project pages (`/addons/ecosystem/<id>`), with release history.
- Optional: a self-service claim ("this is my project") that opens a pull request, still approved by a maintainer.

## Phase 3: community seasons, contributor XP and badges (design only)

The T3 tracker scores a single repository's contributors. For an ecosystem the same idea needs care,
because the people are real, and many are volunteers.

**Consent first.**

- Nobody is ranked, named or badged unless they opted in. A contributor opts in by signing in with GitHub
  (read `read:user` only) and ticking a box on a profile page, or by a maintainer adding them at their request.
- Without opt-in, only the public facts of a repository appear (a project's contributor count). No
  per-person boards, no names pulled from commit history.
- Opt-out is one click and also by email; it removes the person from boards, badges and season history, and
  we keep nothing about them but the fact of the opt-out (so a re-scrape does not re-add them).
- GitHub's terms allow neither selling personal information nor using it beyond the purpose the person
  authorised. A leaderboard of people who did not opt in would breach both the spirit of that and our own policy.

**Scoring fairly.**

- XP comes from outcomes reviewers agreed on: merged pull requests, reviews, closed issues with a fix, releases.
  Not commits, lines, stars or comments, which can be inflated.
- Weighted by effort bands, capped per project per week, so one noisy repository cannot dominate and a
  one-line typo fix counts but cannot be farmed.
- Reviews and issue triage count, since maintenance work is most of the real work.
- Merge streaks are not used: they reward daily activity and punish people with jobs, children or time zones.
  Use a rolling 4-week participation count instead.
- Seasons are fixed windows (for example a Forever patch cycle) with a reset, and past seasons stay readable.
  Seasons rank within a project size tier, so a small addon's author is not buried by a large one's team.
- Maintainer-only actions (self-merging own pull requests) are down-weighted.
- Every person can see exactly how their score was computed.

**Badges for people.** Earned only from public facts the person opted in to, with a definition shown, such as
"first merged pull request", "reviewed 10 pull requests in a season", "fixed a bug reported by a player". No
badge for rank or for speed.

## Privacy and abuse

| Risk | Defence |
|---|---|
| Fake installs | An install is an upload through the existing intake. Counts need 3 distinct install ids, uploads are quota-limited per request source and per install id (see `intake-quota.ts`), and the page says an install is not a person. Phase 2 adds: ignore a project whose weekly growth is far beyond the median until a maintainer looks. One person cannot lift a project alone because each install id counts once |
| Star farming | Stars never decide a board alone. Rising uses a one-week gain, shown with the star count, and is the first thing we replace with installs. GitHub's rules ban automated starring. An outlier gain can be held back by a maintainer note in the registry |
| Submission spam | Issues only, with a template, a required repository link, and a required "where does it say Forever". Nothing is added automatically. GitHub already limits issue creation per account. A maintainer closes junk |
| Private or personal data | Only public repository facts; no emails, no usernames in phase 1, no commit authors. First-reply code reads logins in memory to exclude the author and bots and stores none |
| Takedown | Anyone can ask to be removed (issue form or hello@everloot.app); a maintainer removes the entry in the next pull request |
| Abused submissions of other people's projects | The listing is only public GitHub facts and a link, and the issue form states the owner may ask for removal. We do not list a project its author asks us not to |
| Rate-limit bans | Serial requests, 3-hour floor per project, a stop at long waits, no shared tokens, a descriptive user agent |
| Poisoned data | `parseSnapshot` and `parseRegistry` re-check every field on read; links must be http(s), counts are bounded, text is clamped |

## Open questions for the owner

1. **Which interface number is Forever's?** Our addon ships 70058; Polestar and Olympus ship 16001 for the same
   1.60.1 build. Phase 1 accepts both and says so on the page. Can you confirm in the client what
   `select(4, GetBuildInfo())` returns, so we trim the list?
2. **Everloot's own install count.** The rollup leaves Everloot out. Show it from the same `addon_seen` data
   (every reporting install has it, so it is a count of installs that turned the addon list on), or leave it as
   "not counted"?
3. **Listing consent.** Is listing a third party's public repository on a suggestion from anyone fine, or should we
   ask the author first (a comment on the repo)? Phase 1 lists seeded projects without asking; the issue form
   says authors may ask to be removed.
4. **Token.** Do we set `BUILD_WATCH_TOKEN` (used by `changes.yml`) for this workflow too? Without it CI does not run
   on the data pull request.
5. **Auto-merge.** Should data pull requests merge themselves like `changes.yml`, or stay manual (as built)?
6. **CurseForge.** Ask Overwolf in writing whether a daily public install count may be cached? Today it is link only.
7. **Seasons.** Do you want seasons at all, or only project boards? If seasons, what opt-in surface (GitHub
   sign-in, or a maintainer list) and which window (a Forever patch cycle, or a calendar quarter)?
8. **Scope of "ecosystem".** Beyond addons and tools: guild sites, weakauras collections, a Discord bot? We
   only list code that is public on GitHub for now.
9. **Contributor count wording.** GitHub counts anyone with a commit, including bots and one-time fixes. Show it
   as "people who committed", or drop it from the card?
