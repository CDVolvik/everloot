# Lane closeout: the map and the instances (2026-10-21)

Wave 2, lane B. Each dungeon and raid now has a page, `/map` draws treasure pins and the entrances players
confirmed, and the item hover card has its remaining lines. All three read the readers the zone and object pages
already used, so a marker on the map and a row on a page cannot disagree.

## Why

#291 left two follow-ups and nobody owned them: "An MCP tool or page per instance (bosses, kills, entrance).
Today bosses are on the zone page only" and "Treasure and confirmed-entrance markers on the world map (`/map`).
They are in `world_map_near` and on zone and object pages only." The item card also still lacked the stat
amounts, the restrictions, the set name and the Equip/Use lines. The data was merged in #291
(`kb/src/instances.ts`, `kb/src/object-spawns.ts`); the pages and markers were not built.

## Pages and markers, and what each reads

| Surface | What it shows | Reads |
| --- | --- | --- |
| `/database/instances` (new) | One row per instance: name, type, the zone it is entered from, whether players confirmed the entrance (installs), how many bosses players report | `instanceRows` (`web/src/lib/instances.ts`) |
| `/database/instances/<id>-<slug>` (new) | Type, difficulty, the files' entrance (zone and position, labelled unconfirmed), each confirmed entrance (outdoor map, position, installs, last seen), each boss (kills, installs, last seen, creature ids) | `instanceRows`, built on `placedEntrances`, `confirmedEntrances`, `instanceBosses`, `agreedDifficulties` |
| Zone page, Dungeons and raids tab | Each instance name links to its page; the source badge reads "Confirmed by N installs, last seen DATE"; each boss reads "Name (N kills) from N installs, last seen DATE" | `zoneContents`, now built on `placedEntrances` and `treasurePins` |
| `/map` entrances | Files entrances carry `confirmed` and `lastSeen` when players confirmed them; an instance the files place nowhere gets the players' entrance (id `p<instance>-<zone>`), only in a released zone. The card shows the confirmation and opens the instance page | `continentEntrances`, built on `placedEntrances` |
| `/map` treasure | A hollow-square marker per treasure pin, the "Chests and treasure" category's count, a Treasure section in the List tab, search hits, and a card that opens the object page. Spots seen by 1 or 2 installs are counted beside the category, never drawn | `continentTreasures` and `continentTreasureCandidates`, built on `treasurePins` and `objectSpawns` |
| Item hover card (`/api/tooltip/item/<id>`) | `Stats: [?]` when the files name no stats, `Restrictions: [?]`, `Set: [?]`, `Equip and Use: [?]` | `itemFactLines(NO_ITEM_FACTS, …)` in `web/src/lib/tooltip.ts` |

`placedEntrances` (`web/src/lib/zones.ts`) is the one entrance list: the zone pages, the instance pages and the map
all go through it. `treasurePins` is the one treasure list for the zone pages and the map.

## The rules

- **3 installs.** An entrance is confirmed when 3 installs zoned in from the same place; a boss is listed when 3
  report it; a treasure is drawn when 3 agree on the spot; a difficulty, a name and a type are shown when 3 agree.
  Fewer than 3 is a count (an instance page's "2 installs have zoned in", the map's "1 place seen by 1 or 2
  installs"), never a place.
- **Every count says its denominator, its date and its method.** `confirmedEntrances` and `instanceBosses` now
  return `lastSeen`: the latest `capturedAt` among the rows, leaving out any time after the corpus's own date, so
  one install with a clock set ahead cannot move it. Rows with no time still count; the date then reads `[?]`.
- **`[?]` for every unknown value**, never a blank: an unknown type, difficulty, date, creature list, or tooltip
  value.
- **No spoilers.** An instance entered only from a held-back zone has no row and no page; a player entrance or a
  treasure in a held-back zone is not drawn.
- **Nothing confirmed changes.** The files' entrances, their ids, positions and names, the zone page rows and the
  confirmed counts are as before. Existing tests that compare whole objects were changed only to add the new
  fields (`instanceMapIds`, `lastSeen`, `treasures: []`); no value in them changed.
- **MCP schemas untouched.** `world_map_near` reads `confirmedEntrances` for its reporter count only, which is
  unchanged.

## Decisions to review

1. **The tooltip lines today read `[?]` on every item card.** No upload record carries restrictions, a set or
   Equip/Use text, and the protocol is outside this lane, so there is no fact for 3 installs to agree on yet.
   `itemFactLines` takes the agreed values and writes them line for line once something supplies them. The lines
   were added to the hover card API only. The site's own item tooltip (`ItemTip`), the item page and the site card
   still print only the files' lines, because those belong to the item pages' lane.
2. **Difficulty names.** Every id in the Classic DifficultyID list (warcraft.wiki.gg) prints by its name, for
   example 1 "Normal", 9 "40 Player", 148 "20 Player", 174 "Heroic". Any other id prints as "Difficulty N". Nothing
   reports a difficulty today, so every page reads `[?]` until 3 installs agree on one.
3. **Treasure markers carry a last seen date** (part 2). Minimap sighting rows keep their `capturedAt`, and
   `objectSpawns` gives each pin a `lastSeen` only when it is passed the corpus date, so the object pages and
   `world_map_near`, which do not pass it, are unchanged.
4. **The page inlines no instance ids.** `/map` has a size budget (what the page inlines stays under half the
   pins answer). The entrance cards' instance ids come with `/api/map/pins`, and the new entrance fields are
   written only when they say something.

## Noticed, not changed

- **Blackfathom Deeps is listed as entered from Felwood.** A files entrance goes to the smallest zone rectangle
  around it (the existing `zoneContents` rule), and the Ashenvale and Felwood rectangles overlap there. The zone
  pages already showed it this way before this change.
- The instance pages are not in the database sitemap, and the `/database` landing page does not link the
  instance index yet. Both are someone else's files.

## Tests

- `kb/test/instances.test.ts` (new): an entrance's last seen is the latest time; a clock set ahead is left out;
  rows without a time still count with an unknown date; a boss's kills, installs and last seen (a wipe included);
  difficulty agreed at 3 installs and not at 2.
- `web/src/lib/instances.test.ts` (new):
  - an instance with a confirmed entrance and two bosses: the whole row, installs, kills and dates;
  - one with an entrance nobody confirmed: the files' entrance and no confirmed one; 2 installs give a count only;
  - an instance entered only from a held-back zone has no row;
  - the zone page's row and the instance page agree on the entrance and the bosses;
  - a treasure pin three installs agree on is drawn where the zone page lists it; one two installs report is not
    drawn, only counted;
  - a files entrance carries players' confirmation, and with none its map entry is the same as before;
  - a players-only entrance is drawn once 3 agree.
- `web/src/app/api/tooltip/[type]/[id]/route.test.ts`: a tooltip line with no fact reads `[?]`, never a blank,
  with and without the files' stat lines; agreed facts take the `[?]` places line for line.
- Full suites: kb 1,090 passed; web 2,063 passed (3 skipped); kb and web typechecks clean; lint has no new
  warnings; `scripts/check_internal_paths.py` passes.
- Rendered with the dev server: `/database/instances` lists 25 instances, `/database/instances/36` redirects to
  `/database/instances/36-deadmines`, which shows the files' entrance in Westfall and "No entrance is confirmed
  yet", the Westfall zone page links to it, `/api/map/pins?continent=0` carries `instanceMapIds` and `treasures`,
  and `/map/eastern-kingdoms` renders the Treasure list.

## What comes next

Part 2 adds the treasure dates and the full difficulty name list; part 3 lists the instance pages in the sitemap
and on `/database`. Still open: the tooltip facts. The client snapshot on disk already holds the class masks, the
set ids and the item effects, so they need no new extraction, only the item builder and the data policy's list of
approved tooltip facts.
