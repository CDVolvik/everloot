# Releasing

Three things ship from this repository, each differently.

| What | How it ships | Version |
|---|---|---|
| The site (`web/`) | Every merge to `main` deploys production on Vercel | none |
| The addon, stable | A `addon-v*` tag runs `.github/workflows/release.yml` and creates a GitHub release | `0.3.x` |
| The addon, nightly | `.github/workflows/nightly.yml` makes a pre-release from `main` when it has changed | `0.3.x-nightly.<date>.<run>` |

The site's download link (`web/public/downloads/`) always points at the stable zip committed to the
repository. A nightly never changes it.

## Pull request titles

Title every pull request `type(scope): plain sentence`. The title becomes a line in the release
notes. `.github/workflows/pr-title.yml` rejects a title that does not fit, and
[`scripts/check_pr_title.py`](../scripts/check_pr_title.py) holds the rules.

- Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `chore`, `data`
- Scopes: `addon`, `web`, `kb`, `companion`, `protocol`, `mcp`, `game-data`, `infra`, `docs`
- Example: `feat(web): the raid builder shows which tree each buff needs`

Dependabot pull requests and the rolling `data/changes` pull request are exempt; both already use the
convention. GitHub groups the generated notes by the pull request's area label (`addon`, `web`, `kb`,
`mcp`, `game-data`, `security` and so on) as set in `.github/release.yml`, so label a pull request
with its area before it merges.

## Stable release

1. On a branch, bump the version in `addon/Everloot.toc` (`## Version:`) and `addon/core.lua`
   (`E.VERSION`). Both must carry the same number.
2. Run `python scripts/package-addon.py` and commit the new
   `web/public/downloads/Everloot-<version>.zip`. Update the download link and its label in
   `web/src/app/upload/page.tsx`.
3. In `CHANGELOG.md`, move the entries from `[Unreleased]` to a new `## [<version>] - <date>`
   section. The release uses this section as the top of its notes, so write it for players.
4. Open a pull request titled `chore(addon): release <version>`, wait for checks, merge it.
5. Tag the merge commit and push the tag:

   ```bash
   git fetch origin && git checkout main && git pull
   git tag -a addon-v<version> -m "Everloot addon <version>"
   git push origin addon-v<version>
   ```

The workflow then:

1. checks that the tag matches the version in the TOC and that `CHANGELOG.md` has a section for it;
2. runs the addon tests;
3. rebuilds the zip with `scripts/package-addon.py` and fails if it differs from the committed one;
4. creates the GitHub release with the zip and a `SHA256SUMS` file attached. The notes are the
   changelog section followed by GitHub's generated list of pull requests since the previous
   `addon-v*` tag.

Only the last job holds `contents: write`; the build and test job is read only. If a run fails,
fix the cause, delete the tag (`git push --delete origin addon-v<version>` and `git tag -d`), and tag
again. Then upload the same zip to CurseForge by hand.

## Nightly

The nightly workflow runs daily at 06:17 UTC and on demand (Actions, Nightly, Run workflow; tick
"force" to build with no new commits).

- It skips the day when `main` has no commits since the last `nightly-*` tag.
- The version is the next patch version with a suffix, for example `0.3.1-nightly.20261018.57`. The
  tag is `nightly-20261018.57` and the release is named `Everloot Nightly <version> (<short sha>)`,
  marked pre-release.
- It runs the addon tests on `main` as committed, then stamps the version into the TOC and
  `core.lua` of the runner's copy only. Nothing is committed. `core.lua` gets the short form
  (`0.3.1-nightly`) because the upload intake accepts at most 20 characters in `addonVersion`.
- Assets: the addon zip and `SHA256SUMS`. A knowledge-base release is not attached: building one
  needs the 600 MB wiki dump, which is not cheap in CI.
- The notes are GitHub's generated list since the previous nightly (or the last stable tag).
- It keeps the newest 14 nightly pre-releases and deletes older ones with their tags.

A nightly is untested in the live client. Treat it as a way to try what is merged, and report problems
with the version from `/everloot version`.

## Protocol (`@everloot/protocol`)

The package in `packages/protocol` is versioned on its own (semver: a new kind, field or tool is a
minor release; removing or renaming anything, making a field required or tightening a limit is a major
release). `scripts/check-semver.ts` holds every pull request to that rule by comparing the committed
`schema/` folder with the latest published tarball; until the first publish it only says so and passes.

To release:

1. Bump `version` in `packages/protocol/package.json`.
2. In `packages/protocol/CHANGELOG.md`, move the `[Unreleased]` entries under `## [<version>] - <date>`.
3. Merge. Then, on `main`:

   ```
   git tag -a protocol-v<version> -m "Everloot protocol <version>"
   git push origin protocol-v<version>
   ```

`protocol-publish.yml` checks that the tag, `package.json` and the changelog agree, runs the tests, the
build, the committed-files check and the semver check, publishes to npm with provenance (skipped when
that version is already there) and opens a GitHub release named after the tag.

The first version goes out by hand, because npm's trusted publishing is configured on an existing
package: on a clean checkout of `main`, `cd packages/protocol && npm ci && npm run build && git diff
--exit-code && npm publish --access public`. Then, on npmjs.com, set the package's trusted publisher to
GitHub Actions, organization `Everloot`, repository `everloot`, workflow `protocol-publish.yml`. From then
on a tag is enough.

## Knowledge release (lore archive)

Unchanged: a maintainer builds it with `npm run kb -- snapshot`, checks it with
`npm run kb -- audit-sources` and publishes it to the site's storage. See
[`kb/README.md`](../kb/README.md).

## One-time repository settings

These are not in the repository:

- Upload a social preview image in Settings, General, Social preview. `web/` already generates a
  1200x630 card for the site itself; the repository card is separate.
- Make the `PR title` check a required status check on `main` if you want it to block merging.
