# Coverage MCP tool closeout — 2026-10-22

Wave 4, lane E: build step 8 of the [coverage and plateau design](design/specs/2026-10-21-coverage-plateau-design.md).

## Built

`coverage` is a read-only, text-only MCP tool. Its optional `zone` is a positive UiMap id;
its optional `type` is one of quests, npcs, pins, vendors, drops, rares, entrances, bosses or treasures.
Without filters it covers every released zone and type. It states its scope and excludes unplaced facts
and held-back zones, just as the public page does.

The site's MCP mount lends it `loadCoverage`, the same memoized score reader used by `/database/coverage`.
This checkout has no `web/src/mcp/` directory: registration lives in `kb/src/mcp-server.ts`, and the
host's wiring in `web/src/lib/mcp-mount.ts`. The handler and formatter are in `kb/src/coverage-tool.ts`.
The standalone server explicitly answers “not connected” without this reader; an unreadable store is
“unavailable”, with unknown figures rather than zero. The shared handler also makes the tool available
through the existing GET `/api/tools/coverage` endpoint.

Each answer carries the measurement method, exact corpus timestamp, client build, overall and per-zone
distinct folded install counts, and the expected file's timestamp. The overall install count includes
unplaced facts and is not filtered; zone install counts cover all types. Each type and field reports settled
and confirmed numerators over the same denominator, percentages rounded down as on the page, plus
reported, recheck, expected and observed counts. Unknowns are `[?]`; zero denominators have unknown shares.
The denominator remains `max(expected, observed)`, at entity-field grain, and confirmed includes settled.

The reported-fields list uses only the score's public identifier labels, field keys, links and agreeing
install counts. It prints no raw record, unconfirmed value, install identifier, player name, or baseline
row, name or id. A field needing votes is identified without asserting its value. The tool preserves
the page's per-zone cap and states both the shown count and full all-type count. A type filter is applied
after that cap, so it does not claim to provide an exhaustive filtered list.

The protocol package becomes `1.14.0` (record protocol unchanged), with its CHANGELOG, generated schema
and dist rebuilt. The generated tool catalogue, MCP overview and tool reference document the optional
filters and text-only answer. Existing structured tools keep their output schemas.

## Verification

- Protocol: 6 files, 81 tests pass; typecheck and `npm run build` pass.
- `npx tsx scripts/check-semver.ts` passes: the package is not yet published on npm, so there is no
  published tarball to compare; adding a tool follows the documented minor-version rule.
- KB: 110 files, 1,158 tests pass; typecheck passes. The six coverage-tool tests cover optional inputs,
  safe output, field counts, independent filters, settled and game-file counts, unknowns and failures.
  The in-memory MCP test checks one text block and no structured content.
- Web: 213 files pass, 1 skipped; 2,103 tests pass, 3 skipped. Typecheck and lint pass (existing warnings).
  Tests cover the shared score reader, catalogue and reference text, and text-only schema documentation.
- Web production build passes, including the generated coverage tool reference. No local knowledge
  release was configured, so local hosted MCP availability was not claimed; the in-memory MCP test
  exercises registration and calls without that deployment prerequisite.
- Wiki check: 28 pages, 0 problems.
- Private-path, Markdown-link and whitespace checks pass.
- Live POST `tools/list` at `https://everloot.app/mcp/public`, no key, returned **28 tools** on
  2026-10-22 at 04:49 UTC. Adding `coverage` makes **29 public tools**. The next directory submission
  should say **29**, replacing the old listing's 27. This check measured the existing deployment,
  not this branch deployed to production.

## Reviewer decisions

1. Reuse the page's live score reader rather than the cron-written R2 score, so the MCP tool and page
   cannot disagree after a failed cron write. No coverage formula or score reader changed.
2. Use a numeric UiMap id for `zone`, documented with Elwynn Forest's 1429; use the page's plural type keys.
3. Keep output text only as requested. The generated docs and existing tests now recognize that exception.
4. Keep the reported list's existing cap, explicitly labelled before filtering by type.

## Not built and remaining

No directory submission, protocol publication, server version cut, release, tag, migration, switch,
secret, score change, coverage page change, export, uploader filter, intake, snapshot cron, addon or item
page change. No other wave's implementation was edited. The coordinator owns review and merge;
Carlos owns release timing and the next directory update. This tool is to ship with that submission,
not as a separate directory submission from this lane.
