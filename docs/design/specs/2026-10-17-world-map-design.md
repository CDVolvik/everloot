# The world map

**Date:** 2026-10-17
**Status:** design for Carlos's review.
**Depends on:** addon 0.2.6 zone bounds (`2026-10-17-addon-0.2.6-addons-and-map-bounds-design.md`).

## Why

Spawn pins today sit on one zone at a time. Players think in the whole world: where is that rare
from here, which flight gets me closer, which dungeon is on the way. One continuous map, built from
the game files and our own observations, answers that, and nobody else has it for WoW: Forever on the web.

## Sources

Other projects are reference and cross-checks only. Nothing third-party ships: no imported dataset and no
third-party credit on the page. Everything on the map is read by us.

| Data | From | Licence | Use |
|---|---|---|---|
| Zone rectangles in world units, continents | Game files: `UiMap`, `UiMapAssignment` (our `client-extract` path) | Blizzard's data, found in game files, unconfirmed | Published as a marked layer (`web/src/data/game-data/map.json`), with the build |
| Dungeon and raid entrances | Game files: `Map` (`Corpse` position: where a ghost returns) | Same | Same |
| Zone rectangles seen in play | Our addon (`map_bounds`) | CC BY-SA 4.0 | Cross-check only: names zones where 3 agreeing installs differ from the files |
| NPC pins | Our corroborated sightings | CC BY-SA 4.0 | Published, as today |

Not available in the tables of build 1.60.1.70450: level ranges (only a content tuning id) and usable boat and
zeppelin routes (they are taxi paths between "Transport" stand-in nodes). Flight masters and flight lines are
there (`TaxiNodes`, `TaxiPath`, `TaxiPathNode`, added to the map data on 2026-10-20). The rest stays off the map until a table gives it. Zones added after the
original world (`UiMap` ids above 1458) are held back as possibly unreleased. The site draws its own
map: zone rectangles as shapes with names, no game art.

## What gets built

- `kb/src/world-map-data.ts`: reads the map tables out of a client snapshot into `web/src/data/game-data/map.json`
  (`npm run kb -- client-map`), with the build stamp. Tests use synthetic rows.
- `kb/src/world-coords.ts`: converts zone x/y to world yards and to the stitched continent map, and back;
  later it joins corroborated pins to the same frame, with every item carrying its source.
- Phase 2 (built): pan and zoom with mouse, touch pinch and keyboard; toggleable layers for zones, entrances and player-observed
  NPCs and vendors (3-install rule, public kinds only); a spoiler switch (off by default) for the held-back zones; deep links
  `/map?zone=<UiMap id>&x=&y=` from the NPC, vendor, quest and item pages; and `world_map_near`. Game objects are not drawn:
  no public record kind gives an object a position. Flights, boats and the level filter below still wait on data.
- `/map` on the site: a pan-and-zoom SVG of a continent with layers (zones, dungeons, flights,
  boats, NPC pins), a level filter, and a link from each NPC and dungeon to its page. It works
  with keyboard and screen readers (a list view of the same layer beside the map).
- An MCP tool `world_map_near` for "what is near this place": the nearest dungeons, flight
  masters and corroborated NPCs to a zone and point.

## Zones from the files, installs as a check

Every zone is placed from day one, exactly, from the game files. Our installs do not gate placement;
where 3 agreeing installs report corners that differ from the files, the page names the zone and calls
its outline unconfirmed. NPC pins appear as their sightings reach three agreeing installs.

## Out of scope

Game art of any kind; quest objectives on the map; routing.
