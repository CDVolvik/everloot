# Contributing to Everloot

Everloot is built from what players see, so you can help without touching any code.

## Ways to help

- **Play with the addon and upload.** Every upload adds to the data, and the site states a fact
  once three installs have reported it, so your upload can be the one that confirms it. Install the addon from
  [everloot.app/upload](https://everloot.app/upload), play, log out, upload your
  `SavedVariables/Everloot.lua`. You preview everything before it is sent.
- **Report wrong data.** A drop that never drops, a vendor price that is off, a recipe colour that
  does not match your window: open an issue with the **Wrong data** form. Say what the page shows,
  what you saw in the game, and where (zone and coordinates if you have them).
- **Report a bug.** Use the **Bug report** form. For addon problems, paste the output of
  `/everloot status`.
- **Fix the lore archive.** The lore pages come from the 2023 Warcraft Wiki dump. If the importer
  turns a page into nonsense (broken templates, missing text), an issue with the page link helps us
  fix the importer for every page like it.
- **Write code.** See below.

Questions and ideas go in [Discussions](https://github.com/CDVolvik/everloot/discussions).

## Data rules

Read [`docs/DATA_POLICY.md`](docs/DATA_POLICY.md) before adding any data. In short: no scraping, no
reading the game client's memory or files beyond the addon's own save file, no spoilers. A new source goes in
[`docs/sources/LEDGER.md`](docs/sources/LEDGER.md) in the same pull request, and only sources
whose licence allows republishing under CC BY-SA 4.0 can reach a release.

## Code

### Set up

You need Node 22, Python 3.12 and Git. Each part's README says how to run and test it:

- [`addon/`](addon/README.md): Lua 5.1, tested through `lupa`
- [`web/`](web/README.md): Next.js; `npm run sample-release` gives you local lore pages
- [`kb/`](kb/README.md): the knowledge base and MCP server
- [`companion/`](companion/README.md): needs `web` installed

### Sign your commits (DCO)

Every commit needs a `Signed-off-by:` line. It certifies that you wrote the change, or have the right
to submit it, under the project's licence ([Developer Certificate of Origin](https://developercertificate.org/)).
Add it with `-s`:

    git commit -s -m "Fix the vendor price rounding"

If CI says a commit is not signed off, fix the last commit with `git commit --amend -s --no-edit`,
or several with `git rebase --signoff main`, then force-push your branch.

Commits and pull requests name people only. Leave out co-author lines and "generated with"
footers that credit an AI tool; CI rejects them.

### Before you open a pull request

- The tests for the parts you touched pass (see `.github/workflows/checks.yml` for the exact commands
  CI runs).
- An addon change rebuilds the zip with `python scripts/package-addon.py` and commits it; CI fails if
  the zip does not match the source.
- Data changes follow the data rules above.
- Keep a pull request to one change. Say what changed and how you tested it.

CI also scans every pull request for leaked secrets and for private file paths.

## How releases work

- **The site** deploys from `main`: a merged pull request is live a few minutes later.
- **The addon** gets a new version number in `addon/Everloot.toc` and `addon/core.lua`, a rebuilt zip
  in `web/public/downloads/`, and an upload to CurseForge by a maintainer.
- **The knowledge release** (the lore archive) is rebuilt by a maintainer from the wiki dump with
  `npm run kb -- snapshot`, checked with `npm run kb -- audit-sources`, and published to the site's
  storage. The site refuses a release that does not match its manifest.

## Licence

By contributing you agree that your code is licensed under the [AGPL-3.0-only](LICENSE) and any data
under CC BY-SA 4.0, like the rest of the project. Everyone here follows the
[code of conduct](CODE_OF_CONDUCT.md).
