# The world map

**Date:** 2026-10-17
**Status:** design for Carlos's review.
**Depends on:** addon 0.2.6 zone bounds (`2026-10-17-addon-0.2.6-addons-and-map-bounds-design.md`).

## Why

Spawn pins today sit on one zone at a time. Players think in the whole world: where is that rare
from here, which flight gets me closer, which dungeon is on the way. One continuous map, built from
open data and our own observations, answers that, and nobody else has it for WoW: Forever on the web.

## Sources

| Data | From | Licence | Use |
|---|---|---|---|
| Dungeon and raid entrances, level ranges, bosses, boats and zeppelins | OpenMap `Data/Places.lua` | MIT (OpenMap contributors; the positions are game data used as facts) | Published, credited |
| Flight masters and flight paths | OpenMap `Data/FlightData.lua` | MIT (same) | Published, credited |
| Zone level ranges | OpenMap `Data/Levels.lua` | Taken from the Warcraft Wiki, CC BY-SA 4.0 | Published, credited to both |
| Zone rectangles in world units | Our addon (`map_bounds`) | CC BY-SA 4.0 | Published |
| NPC pins | Our corroborated sightings | CC BY-SA 4.0 | Published, as today |

OpenMap's map art, minimap tiles and dungeon map tiles are Blizzard's and are not used. The site
draws its own map: zone rectangles as parchment-toned shapes with names, no game art.

The importer reads the fitzforge mirror of OpenMap at a pinned commit (`849bac4`, v0.4.0-beta), parses the Lua tables, and
records the source in `docs/sources/LEDGER.md` and `THIRD_PARTY.md` with the MIT notice.

## What gets built

- `kb/src/importers/openmap.ts`: parses the three files at the pinned commit into rows of a new
  publishable source `openmap` (kinds `instance_entrance`, `flight_node`, `flight_path`,
  `transport`, `zone_levels`). Tests use small fixture copies of each file.
- `kb/src/world-map.ts`: joins zone rectangles, OpenMap places and corroborated pins into one
  payload per continent (Eastern Kingdoms, Kalimdor), with every item carrying its source.
- `/map` on the site: a pan-and-zoom SVG of a continent with layers (zones, dungeons, flights,
  boats, NPC pins), a level filter, and a link from each NPC and dungeon to its page. It works
  with keyboard and screen readers (a list view of the same layer beside the map).
- An MCP tool `world_map_near` for "what is near this place": the nearest dungeons, flight
  masters and corroborated NPCs to a zone and point.

## Until zone bounds are corroborated

The map shows OpenMap's world-placed items (dungeons, flights, boats) from day one; zones and NPC
pins appear as their bounds reach three agreeing installs. The page says which zones are still
waiting.

## Out of scope

Game art of any kind; quest objectives on the map; routing.
