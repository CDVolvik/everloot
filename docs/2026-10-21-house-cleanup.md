# House cleanup, 2026-10-21

Wave 2, lane E. The worktrees and local branches left by the closed lanes, cleaned so the
next terminal reads a short list. Nothing here changed a file's content, deleted a remote
branch or touched the main checkout.

## The rule

A worktree was removed only when all of these held:

- `git status --porcelain` was empty;
- its HEAD was an ancestor of `origin/main` (merged);
- no running thread was working in it (lanes A to E of wave 2 and lane 5, the model catalogue);
- no open pull request was made from its branch (#303, #302, #280, #248 at the time).

Removal was `git worktree remove` without `--force`, so git itself refused anything dirty.

A local branch was deleted only when it was merged into `origin/main`, had no copy on
`origin`, was not checked out anywhere, and was not a running lane's or an open pull
request's branch. Deletion was `git branch -d`, never `-D`.

## Disk freed

About **34.4 GiB** (35,184 MiB), almost all of it `node_modules` and build output in the
removed worktrees. The branch deletions free nothing worth counting.

## Before and after

| | Before | After |
|---|---:|---:|
| Worktrees (main checkout included) | 60 | 19 |
| Local branches | 392 | 99 |
| Remote branches on `origin` | 9 | 9 (none touched) |

## One mistake, and what it cost

`t3-2c59d9e5` (`feat/name-every-item`) was meant to be kept and was removed by a filter bug
in the cleanup script. Its branch was merged and clean, so no committed work was lost. What
was lost is the ignored output of a local game-client extraction in its `kb/data/` and
`kb/cache/` folders, about 360 MB written this morning that the main checkout does not hold:
`client-layer.json`, `coverage.md`, `map.json`, `name-gaps.json`, `name-gaps.md`,
`extract.log`, a newer `builds.json`, a newer extraction of client build 70450
(`.sqlite`, manifest and scan) and two cache index files.

None of it is the shipped result. The committed client layer
(`web/src/data/game-data/client-layer.json`) is on main. The lost files come back by running
the extraction again (`npm run kb`, see `docs/ASSETS.md`) against the game client. The main
checkout still has an older extraction of the same build.

## Removed worktrees (41)

All clean and merged; none had a running thread or an open pull request.

T3 worktrees (12):

| Worktree | Branch |
|---|---|
| `feat-addon-records-the-game` | `feat/addon-records-the-game` |
| `feat-fact-states` | `feat/fact-states` |
| `feat-launch-surfaces` | `feat/launch-surfaces` |
| `feat-public-install-pseudonym` | `feat/public-install-pseudonym` |
| `fix-guid-flake` | `fix/intake-guid-test-flake` |
| `t3-02caabce` | `t3/polestar-player-data-ingest` |
| `t3-0c41b4dc` | `feat/account-shell` |
| `t3-2c59d9e5` | `feat/name-every-item` (see the mistake above) |
| `t3-9a18d21a` | `chore/desktop-release-0.1.5` |
| `t3-a3deb22e` | `fix/players-status-line` |
| `t3-a7a96cc8` | `t3/wowhead-mcp-bridge` |
| `t3-d31447b2` | `kb/contested-quest-titles` |

`feat-fact-states` and `feat-launch-surfaces` stopped on "Permission denied" after all their
files were gone; git dropped both registrations. The empty folder of `feat-fact-states` was
then removed. The empty folder of `feat-launch-surfaces` is still there, held by a running
process; it holds no files and can be deleted once that process closes.

Agent worktrees under `.claude/worktrees/` (29), by branch:
`content/wiki-batch-a-dungeons`, `content/wiki-batch-a-forever`, `feat/account-keys`,
`feat/account-overview`, `feat/addon-map-positions`, `feat/addons-leaderboard`,
`feat/auction-house`, `feat/blue-post-pages`, `feat/changes-sharpen`, `feat/character-links`,
`feat/chat-immersive`, `feat/farming-structure`, `feat/footer-glint`, `feat/map-categories`,
`feat/map-fullscreen`, `feat/motion-movement`, `feat/object-names-on-pages`,
`feat/raid-planner-drag`, `feat/rankings-hub`, `feat/site-hover-cards`,
`feat/wiki-content-model`, `feat/wiki-pages`, `fix/account-keys-review`,
`fix/changes-regional-duplicates`, `fix/design-review`, `fix/docs-review`,
`fix/item-tooltip-damage`, `fix/motion-a`, `fix/seo-geo-technical`.

## Kept worktrees (19), and why

| Worktree | Branch | Why it stays |
|---|---|---|
| main checkout | `main` | Never removed. Two untracked research notes under `research/`. |
| `chore-house-cleanup` | `chore/house-cleanup` | This lane. |
| `feat-coverage-engine-2` | `feat/coverage-engine-2` | Lane A running; PR #303 open. |
| `feat-map-instances` | `feat/map-instances` | Lane B running; 24 uncommitted files (instances pages and map work). |
| `feat-loot-tables` | `feat/loot-tables` | Lane C running; 3 commits not on main. |
| `feat-addon-value-loop` | `feat/addon-value-loop` | Lane D running; 1 commit not on main. |
| `feat-model-catalogue` | `feat/model-catalogue` | Lane 5 running; PR #302 open. |
| `agent-a08149f481ee46b66` | `content/blue-writeups-1` | PR #280 open; 2 commits not on main; `kb/curated/blue-writeups.json` modified. |
| `agent-a89898753c0f7ad79` | `feat/addon-object-names` | 1 commit not on main (game object names in the addon). |
| `agent-abd14270a7f437db3` | `feat/web-cohesion-database` | Merged, but 22 uncommitted files: a database-page refactor (`EntityRelations` renamed to `RelationTabs`, `ItemCard` deleted, new `EntityLayout`, `FactList`, `FilterTabs`, `SearchBox`, `EntityIcon`, `NpcPins`, `database-trail`). |
| `desktop-characters` | `chore/desktop-release-0.1.6` | 1 commit not on main (a merge of main, committed today). |
| `docs-gold-guide-plan` | `docs/gold-guide-plan` | 243 commits not on main; the gold guide plan. |
| `everloot-accounts` | `feat/accounts-better-auth` | Merged, but `web/package-lock.json` is modified. |
| `t3-191dd868` | `feat/lore-types` | 170 commits not on main; untracked tool folders. |
| `t3-318b4e74` | `feat/legal-footer` | 7 commits not on main. |
| `t3-31dac94a` | `fix/lockfile-install-script` | 220 commits not on main; `web/src/app/upload/page.tsx` modified, an untracked `kb/test/builds.test.ts` and design screenshots. |
| `t3-5ca3a51f` | `t3/chatgpt-plugin-submission-fix` | 1 commit not on main (ChatGPT listing category). |
| `t3-9211bf0d` | `feat/accounts-email` | Merged, but an untracked `players_contract.py`. |
| `R21-Brain` T3 worktree `t3-248c1b60/tmp/everloot` | `fix/replay-sharing-2026-10-07` | Its `.git` file points at the repository's old `wowvault` path, so git cannot read its status. The branch is merged; the folder needs a person to look before it goes. |

Several "commits not on main" counts above run into the hundreds. Those branches probably
predate a history rewrite around 2026-10-16 (an `old-main-2026-10-16` branch exists), so
their work may already be on main under other hashes. That was not checked here; it is for a
person to decide.

## Branches

Deleted, locally only: **293** branches, merged into `origin/main` with no remote copy.
`git branch -d` refused none.

Kept: **99**.

- **9 protected:** `main`, the five running lanes' branches (`feat/coverage-engine-2`,
  `feat/map-instances`, `feat/loot-tables`, `feat/addon-value-loop`, `feat/model-catalogue`),
  this lane's branch, and the open pull requests' branches `content/blue-writeups-1` (#280) and
  `docs/mcp-descriptions` (#248).
- **11 checked out** in a kept worktree: see the table above.
- **79 with commits not on `origin/main`.** Most date from 2026-10-08 to 2026-10-16: handoff and status notes (`docs/handoff-*`, `docs/loop-handoff-*`,
  `docs/post-merge-*`, `docs/production-state-*`), early MCP, companion, recipe and gold
  features, `old-main-2026-10-16` and `backup-zones-pre-rework`. The newer ones a person
  should look at first:
  - `feat/recorder-rares-dungeons` (1 commit, 2026-10-21): Recorder rares, dungeons, bosses
    and treasures in the protocol.
  - `t3/everloot-post-release` (1, 2026-10-20): item page copy on what players saw.
  - `feat/web-information-design-2`, `feat/web-spell-pages` (1 each, 2026-10-20): merges of main.
  - `pr208` (1, 2026-10-20): a merge of main into `feat/db-achievements-factions`.
  - `wip/g3-talent-raid-snapshot` (1, 2026-10-19, also on `origin`): talent and raid redesign snapshot.
  - `worktree-agent-a4ce94d13a8de4465` (2, 2026-10-19): dev page spacing.
  - `t3/wow-game-data-connectors` (1, 2026-10-18): MCP response validation.
  - `feat/mcp-answer-sources`, `feat/mcp-resources`, `feat/mcp-structured-output`,
    `feat/mcp-registry-listing`, `feat/developer-docs`, `feat/protocol-schemas`,
    `feat/protocol-package`, `fix/main-guards` (2 to 8 commits each, 2026-10-18).

Remote branches: 9 on `origin`, none deleted.

## Left for a person

1. The `wowvault`-pointing worktree: look inside, then remove it by hand or repair it with
   `git worktree repair`.
2. The 79 unmerged branches: check each against main and delete the ones already in.
3. The four dirty, merged worktrees (`feat/web-cohesion-database`, `feat/accounts-better-auth`,
   `feat/accounts-email`, and the main checkout's research notes): keep or throw away the
   uncommitted files.
4. The empty `feat-launch-surfaces` folder, once the process holding it closes.
5. Rerun the client extraction if the lost `kb/data` files from `feat/name-every-item` are wanted.
