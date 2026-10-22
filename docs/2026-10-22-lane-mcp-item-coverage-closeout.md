# Wave 5 lane E: MCP item numbers and settled counts (2026-10-22)

## Built

`item_page` reads `item_fact` through the existing `reportedItemFacts` reader. Its input is unchanged.
The optional `page.reported` output holds `shown` numbers (fact, value, reporters, build, lastSeen) and
`contested` line keys without values. Text carries armor, block, damage per second, stats and resistances
in the game's order, with agreeing installs, exact last-seen timestamp and build for each shown number.
Every missing or contested line prints `[?]` with a reason. The corpus date and agreement method accompany
the answer. A missing corpus also gives explicit unknowns; structured unknown times remain null.

Each install's latest vote counts once in the newest build with at least three reporting installs.
One value must have three agreeing installs and no competing value may have three. This reuses the
page's rules rather than maintaining a second agreement implementation. Item numbers also reach the
existing item resource template and HTTP tool handler. Neither the item reader nor game assets changed.

`coverage` remains text only, with optional zone and type. It adds totals over the selected released
zones and types: settled, confirmed (including settled), reported and recheck entity fields. The count
needing one or two installs uses the score's full needsTotal before the page cap; with a type filter,
it counts only when every selected zone's list is complete, otherwise `[?]` with a reason.

A separate host loader reduces the persisted settled list to build, snapshot date and whole-fact count.
The tool never receives its identifiers or values. This number covers the entire build before filters,
counts whole upload facts, and is distinct from entity-field coverage. The list has no install count,
so that metadata is `[?]`, not inferred from the current corpus. Undated, wrong-build and unavailable
lists are unknown; a dated empty list is measured zero. Existing coverage method and corpus/zone install
counts remain labelled with their original scope.

The protocol package is 1.17.0 for the additive optional output. Record protocol remains 1.8.0.
Generated dist and schemas, tool reference, MCP overview and listing handoff are updated.
This checkout's MCP implementation lives in `kb/src/mcp-server.ts`, `kb/src/coverage-tool.ts` and
`web/src/lib/mcp-mount.ts`; there is no `web/src/mcp/`. The item-numbers handoff is
`docs/2026-10-21-lane-item-numbers-closeout.md`, rather than the October 22 filename in the brief.

## Verification

- Protocol: 6 files, 82 tests passed; typecheck, build and semver check passed. The package is not on npm,
  so the semver check reports no published tarball to compare. Generated dist and schemas are committed.
- KB: 116 files, 1,219 tests passed; typecheck passed. Eight new tests cover evidence, withheld contested
  values, thin reports, distinct/latest votes, build selection, unknown timestamps, disconnected reads,
  scoped counts, list dates, build mismatch, empty lists, failures and capped filtered counts.
  Existing in-memory MCP/resource tests now prove the numbers survive registration and resource reads.
- Web: 222 files passed, 1 skipped; 2,143 tests passed, 3 skipped. Typecheck and lint passed (existing
  warnings). The new mount test proves only settled-list count/date/build cross into the tool.
- Web production build passed, including the generated tool reference pages. No local knowledge release
  was configured; hosted MCP availability is not claimed from that build.
- Wiki check: 28 pages, 0 problems. Private-path, Markdown-link and whitespace checks passed.
- All generated MCP input schemas compare equal to the starting commit. Exactly two tool descriptions
  changed: `item_page` and `coverage`. No tool added or removed: **29 public tools**.
- Read-only live POST on 2026-10-22 UTC: `tools/list` returned 29 tools with the older descriptions;
  `coverage` with zone 1429/type npcs returned its explicit not-connected answer. This measures the
  existing deployment, not this branch. Local tests exercise the new answers with fixture data.

## Exact public description replacements

Only these two tool descriptions change. Titles, inputs and the resource-template descriptions do not.

### item_page

One Forever item: agreed name, observed loot-window drop frequency, agreed map pins, and player-reported armor, block, damage per second, stats and resistances. Each item number needs one value with 3 agreeing installs in the newest build with 3 reporting installs, and no competing value with 3; contested values are withheld. Each number states its agreeing installs, build and last seen, with the corpus date and method. Missing numbers are [?] with a reason. No baseline rows or player names. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.

### coverage

How much of WoW: Forever's database is settled or confirmed, and which reported fields need more agreeing installs. The same counts and reported lists as https://everloot.app/database/coverage, as text, per zone, per type and per field, plus scoped totals and the current build's whole-fact settled-list size, separately dated and measured. Coverage = settled / expected, with confirmed / expected beside it; the denominator is max(expected, observed). Confirmed includes settled. Reported fields needing one or two more installs are counted without their values. A player-reported fact needs three agreeing installs to be public. Only public report identifiers and game-file facts are listed, never unconfirmed values, baseline rows, names or ids, or player names. Every answer states its scope, measurement method, data date and install counts; unknown values are [?]. Zone and type are optional; omitted filters cover all released zones and all types.

## Next listing, prepared only

When the owner next submits, the listing must say **29 public read-only tools**, describe player-reported
item numbers with their agreement evidence and describe coverage's scoped field totals plus separately
dated whole-fact settled-list count. Use the exact replacements above from the protocol's tool list.
ChatGPT 1.0.1 and Claude are In review with the older list. No submission or review edit was made here.

## Reviewer decisions

1. The agreement reader stays authoritative, including newest qualifying build, latest vote per install,
   and withholding both split votes and competing winners. Missing stats do not become measured zeros.
2. The additive output is optional for compatibility; the tool always supplies it after a successful read.
   Text lists every reportable line so an absent value has an explicit reason. No game-file guesses.
3. Whole-fact settled-list size is global to its own build/date. It is never added to field coverage,
   relabelled as filtered, or assigned installs from a different snapshot.
4. A type-filtered needs count cannot be reconstructed beyond the existing page cap. It stays unknown
   rather than silently undercounting; the unfiltered needsTotal remains exact.
5. The new adapter and formatter are MCP-specific. Existing readers, coverage formula and persisted list
   format remain owned by their original lanes.

## Not built and remaining

No directory submission, publication, release, tag, migration, switch, addon, record kind, secret,
baseline export or data-policy edit. No baseline rows, baseline names/ids, player names or unconfirmed
item values are included in these answers. No changes to the other lanes' readers, intake, corpus
writes, migrations, version layer, beta/ptr routes or asset build.

The coordinator reviews and merges; this lane does not merge its PR. The owner controls deployment,
protocol publication and the next directory submission. Launch-day client validation of item numbers
remains the wave-4 checklist's work. A persisted list's agreeing-install total is not available from
its current schema, and exhaustive filtered needs totals beyond the page cap would require reader work.
