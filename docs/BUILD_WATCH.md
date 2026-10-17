# Build watch

When Blizzard ships a new WoW: Forever build, a GitHub Actions workflow
(`.github/workflows/build-watch.yml`) notices within about half an hour, regenerates the game data in
[`web/src/data/game-data/`](../web/src/data/game-data/changes/README.md) and opens a pull request titled "Game build <version>: data update".
A maintainer reviews it. Nothing merges itself.

## What it does

1. Asks Blizzard's public version service for each product in `kb/lists/build-watch.yaml` (one small
   request each). If the build's config hash matches `web/src/data/game-data/<product>/manifest.json` on `main`, it
   stops. Most runs end here.
2. Looks at existing pull requests on `game-build/<product>-<buildId>-<config>` branches. One open
   already: nothing to do. Merged: nothing. Closed without merging: it is not reopened (see `--redo`).
3. Otherwise reads the tables from Blizzard's CDN (the code behind `client-extract` and
   `client-catalog`), writes the talent catalog without tooltip text, and compares it with what is on
   `main`: talents added, removed, moved, rank changes, row-gate and prerequisite changes, talents
   swapped for another spell, spell number changes (effect values, duration, a hash of the tooltip),
   talent point levels. It also compares the raid buff table with the committed one: scope changes
   (per rank too), and spells added or removed and changes to an effect's aura, targets or radius.
4. Writes a changelog entry (`web/src/data/game-data/changes/<product>-<buildId>.json`, shape in
   `kb/src/build-watch/changes.ts`) and a pull request body. The workflow commits, pushes and opens or
   updates the pull request.

Every item from a product with `live: false` carries `spoiler: true` and the body says so. The body
also states the encrypted block count. No decryption keys are loaded; encrypted blocks are skipped.
Never auto-merge: the workflow has no merge step.

Hotfixes that change no build are not in the game files and never show up here. The blue tracker covers
them.

## Schedule

`7,37 * * * *`: twice an hour. Blizzard lists a build on its version service when it is ready to
download; a half-hour poll finds it within the hour even when GitHub delays a scheduled run by
10 to 15 minutes. Hourly would not guarantee that. The cost is tiny: the common run is one HTTP
request plus installing dependencies. The CDN is read only when a build is new, and the downloaded
index is kept in the Actions cache (about 300 MB; the only thing cached) so a second new build does not fetch it again.
GitHub switches off scheduled runs in a repository with no activity for 60 days, which would only
matter if the repository goes quiet.

## Tokens

The workflow has three jobs so that no secret shares a job with code that installs packages or parses
downloaded files. `watch` has a read-only token and no credentials left in the checkout. `publish` runs
no npm and no parser; it alone has write access, and `BUILD_WATCH_TOKEN` appears only in its push step,
passed to git for that call. `report` can only write issues. Branches are replaced with `--force-with-lease`.

## Repeated failure

A failed run is red and GitHub notifies the usual way. When two scheduled runs in a row fail, the
workflow opens one issue, "Game build watch is failing". While it is open no more are opened, and the
next successful scheduled run closes it.

## Setup a maintainer has to do once

- Settings, Actions, General: allow GitHub Actions to create pull requests.
- Optional but recommended: a repository secret `BUILD_WATCH_TOKEN` (a fine-grained token with
  contents and pull requests write on this repository). Pull requests opened with the built-in token
  do not start other workflows, so the release checks would not run on them.
- The first run opens a baseline pull request (no comparison). Merge game data only once PR #29 (which
  allows build changes, beta included, the talent catalog and the raid buff table in git) is merged.
- When Blizzard lists the live product, add it to `kb/lists/build-watch.yaml` with `live: true`.

## Running it locally

```
npm run kb -- build-watch --dry-run
```

Reads the current build from the CDN and writes the files it would commit under
`kb/data/build-watch/out/dry-run/`, plus `pr-body.md` and `plan.json`. It changes nothing else and
needs no GitHub access (it assumes no pull requests exist if `gh` is not signed in).

Other flags: `--product a,b` (instead of the config list), `--check` (only decide, read no game files),
`--redo` (refresh an open pull request, or reopen a declined one), `--game-data <dir>` (default `../web/src/data/game-data`), `--out <dir>`.

## Politeness

One request to the version service per product per run. Game files only when a build is new, only the
tables listed in `kb/src/client-snapshot.ts`, cached between runs. No parallel downloads.
