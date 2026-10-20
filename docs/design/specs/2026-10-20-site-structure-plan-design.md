# Site structure: one connected database, a real map, tooltips, players

**Date:** 2026-10-20
**Status:** approved by Carlos ("full go on 1 through 5"), built in the PRs listed under each part.
**Builds on:** the design system and header in #160, the relation edges (`2026-10-18-relation-edges-design.md`),
the item taxonomy (`2026-10-18-item-taxonomy-design.md`), the world map (`2026-10-17-world-map-design.md`)
and the lore archive (`2026-10-15-lore-archive-web-design.md`).

## Why

Players already know how a WoW database works: Wowhead taught them. We do not invent a new way to browse; we
connect what Everloot already has the way they expect, and win where the big sites are weak for WoW: Forever.

Today the database, the lore archive and the map are three islands. Lore and database pages never link to
each other, NPC pages list drops as "Item 1234", the one search box covers only lore, zones and spells have no
page, and the map is a stack of zone rectangles with no continent, no flights and no click-through.

Traffic estimates (Semrush, September 2026, order of magnitude only; they swing widely month to month):
Wowhead about 57M visits, Icy Veins about 16M (shared with Diablo), Raider.IO about 7M, ironforge.pro about 0.6M.
Their lead is years of history; WoW: Forever starts on 4 November 2026 with none. Competitors' Forever pages
are still placeholders (Icy Veins) or static zone images (Guild Order). Wowhead's own team says ads and
browser load are its longest-running complaint.

Other sites are reference only. Nothing of theirs ships: no data, text, images or filters (`docs/2026-10-18-database-taxonomy-research.md`).

## Order

1. **Design system and header (#160).** Merged first; every part below uses its components and its header search.
2. **Connected database.** Item names everywhere, lore on entity pages, one search.
3. **Zone pages and the map, version 1.**
4. **Embeddable tooltips.**
5. **Player and guild pages** (privacy first, then build, behind a switch).

Each part is its own pull request. Parts 2–5 can be built in parallel once 1 is on main.

## 2. Connected database

- **Names, not ids.** Every list of items, NPCs, quests or objects shows the name and icon where we have one,
  falling back to "Item N" only when no name is known.
- **Lore on entity pages.** An NPC, item, quest or zone page with a matching lore page (same game id where the
  archive has one, otherwise an exact name match within the type) shows a "Lore" section with the first paragraph
  and a link. The lore page links back. The lore archive keeps its own browse pages; most people reach it from
  the entity pages, as guides hang off Wowhead's.
- **One search.** The header search finds items, NPCs, quests, objects, zones, lore pages and tools, grouped by
  type, with exact id and exact name first. Works without JavaScript (GET `/search?q=`).
- **Every fact says which game it is for.** Pages keep the build stamp; when rulesets differ (Normal, PvP, RP,
  Hardcore) the fact names the ruleset. Season of Discovery overwriting Classic Era on Wowhead is the failure to avoid.

## 3. Zone pages and the map, version 1

**Zone pages** (`/database/zones/<id>-<slug>`): the zone's map with its pins, level range when a table gives it,
the NPCs, quests, objects, vendors and dungeons in it, flight masters, and its lore. Zones become the main way
to browse, the way players think about the world.

**The map** uses a standard library (Leaflet with a flat, non-geographic coordinate system), not hand-built SVG:

- Continent view with every zone; click a zone to zoom to it; a breadcrumb (Azeroth › Eastern Kingdoms › Westfall).
- The map fills the screen; the explanations and lists move below it or into a side panel.
- Layers: zones, dungeon and raid entrances, flight masters and the flight network (when the game tables give
  them), vendors and trainers, quest givers, player-observed NPCs (the 3-install rule stays).
- Coordinates on hover in the game's 0–100 zone scale, and a button that copies `/way X Y Name`.
- Search on the map: a zone or NPC jumps the map there.
- The address keeps the continent, zone, zoom and selected pin, so a link opens the same view.
- Every database page with a position has "Show on map".
- Touch: pinch to zoom, tap a pin for a bottom card.

Map pictures: only our own extraction from the game files, as today. Whether game art may be shown on an
ad-supported site is part of the pending legal review; the map must still work as shapes with names if the
art has to come off.

Version 2: flight path travel times, zone level ranges and faction colouring, herb and ore nodes with clustering,
a right-click "what is near here".

## 4. Embeddable tooltips

A small script any site can load (`https://everloot.app/tooltips.js`). Links to everloot.app items, NPCs,
quests, objects, zones and spells show Everloot's game tooltip on hover. Data comes from a cached, read-only
endpoint; the card links back to the page. No cookies, no tracking in the script. Documented on `/connect`
with a copy-paste snippet for Reddit-linked blogs, guild sites and Discord bots.

## 5. Player and guild pages

Carlos chose open player search: any character seen by uploads can be found by name. This changes the current
privacy promise (census is anonymous counts only; named records need a sharing grant), so it ships behind a
switch, off, with:

- A privacy and terms update, and the pending legal review, before the switch goes on.
- An opt-out that works without an account, using the existing suppression tables, and owners who claim a
  character through Battle.net can hide it.
- One current row per character (name, realm/ruleset, race, class, level, guild, last seen). No history, no
  positions, no gear in the first version.
- Light on players and on us: rows come from the uploads the addon already makes, written in batches; the pages
  are cached; search uses an index; nothing new runs in the game.

## Not in this plan

Comments, screenshots, news, forums, guides written by us. They can come later; the connected database and the
map come first.
