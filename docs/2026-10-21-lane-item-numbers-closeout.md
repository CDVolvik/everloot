# Lane closeout: item numbers players report (2026-10-21)

Wave 4, lane D. The item pages print `[?]` for an item's stat amounts, armor and damage per second, because the
client works them out from tables our extract does not read. A player standing in the game sees the real numbers
on the tooltip. This lane records them: the addon reports the numbers a player's tooltip shows, the protocol
carries them as a new record kind, and the site shows a number once three installs agree, as it does everything
else. Nothing here has run in the Forever client. The launch-day check is in
`docs/2026-10-21-addon-0.3.10-launch-checklist.md` (steps 18 to 22).

Review: the pull request against `main` that carries this file.

## The record kind

`item_fact`, protocol package 1.15.0, record protocol 1.8.0 (`packages/protocol/src/records.ts`):

| Field | Shape |
| --- | --- |
| `kind` | `"item_fact"` |
| `installId`, `eventId`, `capturedAt` | as every record (`base`) |
| `itemId` | positive whole number |
| `fact` | one of `ITEM_FACTS`: `armor`, `block`, `damage_per_second`, `health`, `mana`, the five base stats, the 12 ratings and powers the site already names, and the six resistances |
| `value` | number from -10,000 to 10,000; a whole number except `damage_per_second` (one decimal), checked by the server (`RULES.item_fact`) |
| `clientBuild` | required, `CLIENT_BUILD` (`1.60.1.70450`), because a patch can change an item's numbers |

It is in `PUBLIC_RECORD_KINDS`: anonymous, like `item_seen`. `schema/records/item_fact.json` is new;
`schema/index.json`, `schema/api/intakeRequest.json` and `schema/api/corpusPublicResponse.json` gain the kind.
No file under `schema/mcp/` changed. `check-semver` passes (the package is not on npm yet, so it has nothing to
compare). The kb, web and companion lockfiles move to 1.15.0, as the last protocol change did. Lane E's `coverage` tool took 1.14.0 on `main` while this lane was open, so this change is 1.15.0; the record protocol (1.8.0) is this lane's alone, as `coverage` left it at 1.7.0. The numbers below are from the branch rebased on that `main`.

**What the docs pages must show.** `/docs/api/schemas` counts `ALL_RECORD_KINDS` and links the schema files, so it
shows 39 kinds and `item_fact.json` with no edit. `/docs/api`'s feed table lists only the kinds a Polestar Recorder
file adds, so it is unchanged. The site serves the new schema at `/schema/records/item_fact.json` once deployed.

## The addon

`addon/modules/itemfacts.lua`, listed in the TOC after `openworld.lua`. When the game shows an item's tooltip
(`TooltipDataProcessor.AddTooltipPostCall` on `Enum.TooltipDataType.Item`, the call the prices module already
uses), it takes the plain item's link from `GetItemInfo(id)` and reads `GetItemStats` (or `C_Item.GetItemStats`).
The stat keys are the game's global string names, so they do not depend on the client's language; a key the module
does not list records nothing. Reading the plain item means an enchant or a random suffix on the hovered copy never
counts.

- One row per known line, through `E:Store` (2,000 rows, then the kind pauses and says so in `/everloot status`).
- Once per item and client build (`EverlootDB.itemFactSeen`); an item with no numbers is read once per session and
  not kept in the file. An item cut short by the cap is not marked, so nothing is lost silently.
- A tooltip whose `guid` is not an `Item-` GUID (a unit, a creature, an object) records nothing.
- Follows the open-world toggle. Off when `GetBuildInfo` gives no build; disabled, with the reason in
  `/everloot status`, when the tooltip call or `GetItemStats` is missing.
- `## Version` stays 0.3.10. `web/public/downloads/Everloot-0.3.10.zip` is rebuilt from the source (26 files).

## The site

- `kb/src/item-facts.ts`: `itemFactRowsFromRecords` (well-formed rows by item) and `reportedItemFacts` (one item's
  agreed and contested lines). A number is shown when 3 installs report the same value for a line and no other
  value has 3. Each install votes once, with its latest row. The line is decided within the newest build that 3
  installs reported, so after a patch the old number does not contest the new one. A line installs report without
  3 agreeing on one value is contested. Each agreed number carries its installs, its build and when it was last
  seen (the latest `capturedAt`, leaving out a time after the corpus).
- `web/src/lib/rollup-compute.ts`: the rows are indexed once per corpus version; `loadReportedItemFacts(itemId)`.
- `web/src/lib/item-names.ts`: `withReported` fills the files' placeholders (`[?] Armor`, `+[?] Stamina`,
  `([?] damage per second)`) and adds a line the files did not print (block, a resistance) where the game prints
  it. Under the lines, one line per number: `+5 Stamina: reported by 3 installs, last seen 2026-11-05, build
  1.60.1.70450.` A contested line keeps its `[?]` and says `installs disagree on the number`. The reasons for the
  stat and armor placeholders go once none is left; the damage range keeps its reason.
- Applied on the item page's tooltip box (and its open-data text), the site's hover card (`/database/card`) and
  the embeddable card (`/api/tooltip`). The tooltip response shape is unchanged: these are more `lines`.
- `docs/DATA_POLICY.md`: a paragraph, "Item numbers players report", marked proposed with this pull request as the
  maintainer review.

## MCP: unchanged, and a wave-5 item

The tool schemas are frozen, so no tool carries the numbers. `kb/src/item-page.ts`, which feeds `item_page`, is
unchanged. **Wave 5:** `item_page` could carry an optional `reported` list (fact, value, reporters, build,
lastSeen); that is a new optional output field, a minor protocol release, and the MCP tools' page would say so.

## Verified

- Protocol: `npm run build` rebuilt `dist/` and `schema/`; 6 files, 82 tests passed (one new: the kind parses,
  refuses an unknown line, a missing or malformed build, a fraction on a whole-number line, an out-of-range value
  and a text value); typecheck passed; `check-semver` passed (not on npm yet).
- Addon: `addon/tests/item_facts_contract.py`, new, in CI: a number that is there (armor, a negative stat, damage
  per second to one decimal, a resistance, the build, nothing else on the row), a number that is not there (no
  numbers, not cached, an unknown key, text, a fraction, zero, out of range, NaN, bad tooltip data, missing or
  failing calls), a repeat (the session, a reload on the same build, a new build that records again), a refused
  GUID (player, creature, object, empty, wrong types), the open-world toggle, the cap and its pause, and no local
  path, link or advertisement in the module's text. Every row is checked against the protocol's JSON Schema.
  Four mutations (the GUID check, the decimal rounding, the per-build check, the per-build mark) each fail it.
  All 26 runnable files in `addon/tests/` pass, `no_ads_contract.py` and `protocol_contract.py` among them.
  `python scripts/package-addon.py` rebuilt the 0.3.10 zip (26 source files).
- kb: 113 files, 1,182 tests passed (9 new in `kb/test/item-facts.test.ts`; `tool-kinds.test.ts` gains the kind in
  its every-kind fixture, read by no tool). Typecheck and `wiki-check` passed.
- web: 214 files passed, one skipped; 2,110 tests passed, three skipped (3 new in `web/src/lib/item-names.test.ts`,
  one new each in the embeddable card and hover card route tests). Typecheck, lint (no warnings in the touched
  files) and `npm run build` passed.
- companion: 5 files, 41 tests passed; typecheck passed.
- The internal-path guard and the Markdown link check passed locally.

## Decisions a reviewer should look at

1. **`GetItemStats` on the plain item, not the tooltip's text.** The brief says "reads the item tooltip". Parsing
   the text would depend on the client's language and pick up enchants and suffixes. The tooltip is the trigger;
   the numbers come from the stats call for the same item. Weapon damage ranges are not in `GetItemStats`, so
   only damage per second is recorded; the range stays `[?]`.
2. **The newest build with 3 installs decides.** Without it, a patch that changes an item would leave the line
   contested for good. Older reports never outvote the newest build's; a newer build with fewer than 3 installs
   does not hide an older agreement.
3. **One dissenting install does not hide an agreed number**, as with names everywhere else: the line is
   contested only when no value has 3 installs or two values each have 3.
4. **`clientBuild` is required on this kind**, unlike `talent_snapshot`'s optional one: a number without a build
   cannot be placed after a patch.
5. **Public in the corpus**, as `item_seen` is. The rows hold an item id, a line, a number and a build.
6. **Files outside the listed ownership**, each small: `web/src/lib/rollup-compute.ts` (the index and loader),
   `web/src/lib/site-card.ts` and `web/src/lib/tooltip.ts` (the hover cards apply the numbers),
   `.github/workflows/checks.yml` (runs `item_facts_contract.py`), the kb, web and companion lockfiles (the
   protocol's version line), the root `CHANGELOG.md`, `addon/README.md` and the 0.3.10 launch checklist.
7. **A card without the game files** (storage down) still prints `Stats: [?]`; reported numbers are shown only
   in the files' tooltip, where the lines they fill exist.

## Not done, and what remains

- MCP `item_page` carrying the numbers (wave 5, above).
- The item lists' small hover cards (`ItemTip` on the drops, vendor, quest and category pages) still show the
  files' `[?]`: they load tips in bulk and do not read the corpus per item.
- No version change, no tag, no release. The Desktop App build that carries protocol 1.15.0 is [?]; until then,
  the website upload page is the only way the rows reach the site.

## Only the live client can settle (launch day, 2026-11-04)

- That `TooltipDataProcessor.AddTooltipPostCall` fires on Forever with `data.id` and an `Item-` GUID or none.
- That `GetItemStats` exists and returns the keys listed in the checklist, armor as `RESISTANCE0_NAME`, block as
  `ITEM_MOD_BLOCK_VALUE_SHORT`, resistances as `RESISTANCE1_NAME` to `RESISTANCE6_NAME` (the newer
  `ITEM_MOD_<SCHOOL>_RESISTANCE_SHORT` names are listed too).
- That each number equals the tooltip's line, damage per second to one decimal.
- That a suffix or enchanted copy gives the plain item's numbers.
- Steps 18 to 22 of the launch checklist.
