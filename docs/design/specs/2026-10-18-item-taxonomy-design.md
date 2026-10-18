# Item taxonomy

**Date:** 2026-10-18
**Status:** step 3 of 5 from the [database taxonomy research](../../2026-10-18-database-taxonomy-research.md).
Publishing item categories from the game files was decided 2026-10-18 by the maintainer
(`docs/DATA_POLICY.md`, "The client layer").
**Depends on:** relation edges (step 2), which added the client layer file this extends.

## Why

Wowhead's Weapons → One-Handed Swords is the game's own `ItemClass` 2, `ItemSubClass` 7. With those
tables read, every item in the build gets a category before any player has seen it, and the site
can be browsed the way players think about items.

## What gets built

- **`kb/src/item-taxonomy.ts`**: classes and subclasses with the client's English names
  (`ItemClass.ClassName_lang`; `ItemSubClass.VerboseName_lang`, else `DisplayName_lang`, because
  "Axe" names both one- and two-handed axes), slugs made from those names, item counts, and one row
  per item: id, class, subclass, `InventoryType`, quality (`ItemSparse.OverallQualityID`, null when
  the item has no readable sparse row).
- **Keys.** Numeric ids are the key; a slug is per build. When two subclasses of one class would
  get the same slug, the later one keeps its number in it (`idol-9`). A class/subclass pair with no
  subclass row is named by its number.
- **Slot and quality** are enums with no table, so their labels are ours, keyed on the game's
  numbers. Robes (20) and chest pieces (5) share the slot "chest", as do the two ranged types.
- **The client layer** (`web/src/data/game-data/client-layer.json`) becomes `everloot.client-layer/2`:
  `categories` (classes, subclasses) and `items`, one row per line. 2.7 MB for build 1.60.1.70450.

## Routes

- `/database/items`: every class with its subclasses and counts, and an item id lookup.
- `/database/items/<class>` and `/database/items/<class>/<subclass>`, for example
  `/database/items/weapons/one-handed-swords`. Filters `?slot=`, `?quality=`, `?page=` (100 per
  page). An unknown slug or filter is a 404. Only the plain category page is indexed and in the
  sitemap; filtered and later pages are not.
- The first segment is shared with item ids: a number is an item, a word is a class
  (`/database/items/19019` vs `/database/items/weapons`).
- Each item page shows its path (Items › Armor › Cloth · Chest · Epic) with the label and build.

The class slugs were first the client's singular names (`weapon`). Changed 2026-10-18 by the
maintainer: classes carry a `label` in the plural, as item databases have long listed them
(`Weapons`, `Trade Goods`, `Recipes`; `CLASS_LABELS` in `kb/src/item-taxonomy.ts`, by class id), and
the slug is made from the label (`weapons`), so the URLs read as players expect. The client's own
`name` stays in the row. The old singular URLs redirect for good to the plural ones, filters kept,
and `/api/items` and the MCP tool still answer the old slug. Subclass slugs were already plural.

## Open data

- MCP `item_categories`: the tree, one item's path, or a filtered list.
- `/api/items` (filters `item`, `class`, `subclass`, `slot`, `quality`; paged through the data
  guard) and `/api/items/categories` (the tree with slugs and counts). Both carry the `gameData`
  notice and build, not the CC BY-SA line. `/api/edges/client-layer` now carries the categories too.

## Findings (build 1.60.1.70450)

17 classes, 100 subclasses, 31,849 items. 12,618 items have no readable quality. 12,614 have
inventory type 0 (not equipped). Class 18 ("WoW Token") has items but no subclass row. Several
subclasses are named `(OBSOLETE)` by the client and hold no items; empty subclasses are not listed.

## Not in this step

Item names from the game files: the decision covers categories and relations, so list pages show
"Item 19019" until players agree on a name (then the name).
