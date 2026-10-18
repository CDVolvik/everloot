# Icons on the database pages

**Date:** 2026-10-18
**Status:** step 5 of 5 from the [database taxonomy research](../../2026-10-18-database-taxonomy-research.md).
Item and spell icons on `/database` pages were decided 2026-10-18 by the maintainer (recorded in
`docs/DATA_POLICY.md` and `docs/sources/LEDGER.md`).
**Depends on:** object pages (step 4).

## What changed from the research note

The note proposed rewriting the asset manifest as one entity map
(`{ "item:<id>": fileDataID, "spell:<id>": fileDataID }` plus `files`), with talents as one consumer.
While this stack was being built, #51 landed on `main` with a site-wide asset system on the same
manifest: spell icons (`spellIcons`), class, tree and profession icons, map pictures, and item icons
and tooltip facts kept in a private bucket and shown only for items 3 installs reported. A second
manifest shape would break that reader and its upload script, and publishing every item's icon by id
would go against its rule that an id typed into a URL reads nothing.

So this step builds on `main`'s manifest instead of replacing it. Entity-keyed icons exist there
already: `spellIcons` by spell id, item icons by item id inside the private records, and now
`familyIcons` by pet family id.

## What gets built

- **kb:** `spellIcons` also covers every spell the committed client layer says an item is created by
  or used in (`relationSpells`, from the CLI). New `familyIcons` from `CreatureFamily.IconFileID`.
- **Item page:** the icon of each spell under "Created by" and "Reagent for". The manifest is read
  only when there is something to show: a reported item's tooltip or a linked spell's icon. An id
  nobody reported and no spell links to reads nothing, as before.
- **Category pages:** for the listed items players reported, the icon and the game file name from
  the private records (the players' agreed name wins). Other rows stay "Item 19019".
- The credit line, with the build, wherever an icon shows; nothing without the manifest.
- `familyIcons` has no page yet: there are no pet family pages. It is in the manifest for when there are.

## Pages only

`talents/assets.test.ts` keeps both of `main`'s checks: only listed files read the asset modules
(the category page is added), and API, MCP and exporter code never do.
