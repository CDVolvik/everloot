# Relation edges

**Date:** 2026-10-18
**Status:** step 2 of 5 from the [database taxonomy research](../../2026-10-18-database-taxonomy-research.md).
Publishing game-file relations was decided 2026-10-18 by the maintainer (recorded in
`docs/DATA_POLICY.md`, "The client layer").
**Depends on:** client coverage tables (step 1).

## Why

A database page is a header plus its relations: where an item drops, who sells it, what makes it,
what it is used for. Today each page joins its own rollup. One edge table, with the evidence on
every row, gives the pages, the MCP server, the API and the bulk download the same answer.

## The table

```
edge(fromKind, fromId, rel, toKind, toId, evidence, build, installs, firstSeen, lastSeen)
evidence: 'observed' (players' uploads, 3 installs) | 'client' (found in game files, unconfirmed)
```

| rel | from → to | Evidence | Source |
|---|---|---|---|
| dropped_by | item → npc / object | observed | the public drop rates (`rollupDrops`), so the edge and the drop table agree |
| sold_by | item → npc | observed | vendor records; the price most installs agree on, at 3 or more |
| reward_from | item → quest | observed | quest records, 3 installs per reward |
| located_in | npc → zone (UiMap id) | observed | NPC sightings with NPC positions, 3 installs per map |
| created_by | item → spell | client | `SpellEffect`, effect 24 (create item), `EffectItemType` |
| reagent_for | item → spell | client | `SpellReagents.Reagent` |
| part_of_set | item → item set | client | `ItemSet.ItemID` |
| same_icon | item → icon file | client | `Item.IconFileDataID`, only icons two or more items share |

- **Same icon is one row per item, not one per pair.** In build 1.60.1.70450 one icon is shared by
  1,141 items; pairs would be 3.2 million rows, against 29,010 this way. "Other items with this
  icon" is the reverse lookup.
- **Installs on a drop edge** is the number of installs that looted the source, the count the item
  page already shows, not the number that saw this item.
- **First and last seen** for observed edges are the earliest and latest `capturedAt` of the
  records behind them, ignoring times after the data was current. Client edges carry the
  extraction time and the build.
- **Zones** use UiMap ids, the id space of sightings and `map.json`, not `AreaTable` ids.

## Where it lives

- `kb/src/edges.ts`: the types, `clientEdges` (from snapshot tables), `observedEdges` (from upload
  records), grouping, and the MCP text answer.
- `kb/src/client-layer.ts` writes `web/src/data/game-data/client-layer.json` (`npm run kb --
  client-layer <snapshot>`): build-stamped, labelled, one edge per line so a new build reads as a
  line diff. The build watch regenerates it with the other game-data files.
- Observed edges are computed with the other rollups, once per corpus version
  (`web/src/lib/rollup-compute.ts`).

## Readers

- **Item page:** a Relations section grouped by relation, links where a page exists (items, NPCs,
  vendors, quests, zones on `/map`). Game-file rows say *found in game files, unconfirmed* and the
  build, and the section ends with Blizzard's notice. Drops stay in their own table above.
- **MCP:** `entity_relations` (kind, id, optional rel and direction), both directions by default,
  so an NPC lists what it drops and a spell what it creates.
- **API:** `/api/edges`, filterable and paged through the data guard like the corpus feed; with no
  filter it is the bulk path. Observed rows come with our `attribution`; game-file rows bring a
  `gameData` notice instead. `/api/edges/client-layer` returns the build's whole game-file layer.

## Known gaps

- `reward_from` and `located_in` are built and tested but empty in production: the addon sends no
  `quest` records yet, and its sightings carry the player's position, not the NPC's.
- No names for spells, item sets or icons: the layer is ids and relations only.
- Item pages are still indexed only when players gave them a name, drops or a pin. Thirty
  thousand id-only pages would be thin.
- No per-entry spoiler marking (see the data policy).
