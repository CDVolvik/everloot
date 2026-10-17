# Starter issues to open at the flip

Open each with `gh issue create --repo CDVolvik/everloot --title "<title>" --label "<labels>" --body "<body>"`,
then delete `scripts/flip/`.

---

## 1. Test `audit-sources` from the command line
Labels: good first issue, kb

`npm run kb -- audit-sources <file...>` prints one line per database and exits 1 when a file holds
anything that may not be published. `kb/test/audit-sources.test.ts` covers the function but not the
command. Add a case to `kb/test/cli-readiness.test.ts` (it already spawns the CLI) that checks the
line format and both exit codes.

## 2. Silence the unused `anyRecord` lint warning
Labels: good first issue, web

`npm run lint` in `web/` warns: `src/lib/intake.ts:239:7 'anyRecord' is assigned a value but only
used as a type`. Make it a type-only declaration (or derive the type another way) so lint is clean.

## 3. Link the data policy from the site
Labels: good first issue, web, data

`docs/DATA_POLICY.md` explains what Everloot publishes and refuses, but the site never links to it.
Add a "Data policy" link to the footer (`web/src/components/Footer.tsx`) and a sentence on the
upload page (`web/src/app/upload/page.tsx`) pointing to it on GitHub, with tests like
`web/src/components/footer.test.tsx`.

## 4. Let the internal-paths check read lockfiles too
Labels: good first issue

`scripts/check_internal_paths.py` skips every `package-lock.json`. Lockfiles are exactly where a
`file:` dependency would leak a local path, and none match today, so the skip buys nothing. Remove
it and keep `python scripts/test_check_internal_paths.py` passing.

## 5. Put the licence in the addon's `.toc`
Labels: good first issue, addon

Add `## X-License: AGPL-3.0` to `addon/Everloot.toc` together with the next addon version bump
(version in both `Everloot.toc` and `core.lua`), and rebuild the zip with
`python scripts/package-addon.py`. Not before the next version: the released 0.2.5 zip must keep
its bytes.

## 6. Record auction deposits that are lost
Labels: help wanted, addon

The gold module (`addon/modules/gold.lua`) leaves deposits out on purpose: a deposit comes back when
the auction sells, so paying it is not yet a cost. It is lost when an auction expires or is
cancelled. Find how the Forever client tells an expired or cancelled auction apart in the mailbox,
record the lost deposit as a money event, and cover it in `addon/tests/gold_contract.py`. Read the
module's header comment first, and plan to check it in the live client.

## 7. Fewer damaged lore pages
Labels: help wanted, lore

About 3,260 of 260,000 lore pages still show template damage after import (the release manifest
counts them as `damaged`). Pick a template that breaks often, find it in
`kb/src/importers/wiki-templates.ts`, render it properly, and add a case to
`kb/test/wiki-templates.test.ts`. A page link in the issue is enough to start.

## 8. Wrong data reports from the first week
Labels: help wanted, data

After launch, check the newest uploads against what you see in the game and report anything off
with the **Wrong data** form. No code needed; a zone, a name and what you saw is enough.

## 9. Share observed data with Polestar
Labels: help wanted, data

Polestar's guide tools could use what Everloot players observe (quest givers, drop sources, vendor
items) under CC BY-SA 4.0. Sketch an export format both projects can read. Start from the Polestar
data docs at https://github.com/fitzforge/polestar/tree/next/docs and the public corpus reader in
`kb/src/corpus.ts`. Discussion first, code second.
