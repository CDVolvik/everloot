# Lane closeout: the addon records vignettes, entrances and encounters (2026-10-21)

Lane 3 of 4. The site read rares at their own position, treasures, dungeon entrances and boss encounters only
from a player's Polestar Recorder file (#290, #291). Everloot's own addon now records the same protocol kinds in
game, so a player who runs only Everloot contributes them too. Nothing here has run in the Forever client: the
beta's servers are down. The launch-day check is in `docs/2026-10-21-addon-0.3.10-launch-checklist.md`.

## What changed

All in `addon/modules/openworld.lua`, plus the three new kinds in `/everloot status` (`addon/core.lua`).

| Game source | Row | Notes |
| --- | --- | --- |
| `VIGNETTE_MINIMAP_UPDATED` (when on the minimap), `VIGNETTES_UPDATED`; `C_VignetteInfo.GetVignettes`, `GetVignetteInfo`, `GetVignettePosition` | `npc_sighting` with `positionKind = "vignette"` for a `Creature-` GUID; `object_sighting` for a `GameObject-` GUID | The vignette's own position on the player's map, never the player's. Once per vignette, map and spot. Vignette sightings have their own 2,000-row share, apart from targeting and windows. An object inside an instance carries `instanceMapId`. |
| `PLAYER_LEAVING_WORLD` outdoors, then `PLAYER_ENTERING_WORLD` in a `party` or `raid` instance; `GetInstanceInfo` | `instance_entrance` | The outdoor position where the loading screen started. Once per instance and outdoor map. A dungeon finder teleport (a 10th return above 0) records nothing. |
| `ENCOUNTER_END` inside a `party` or `raid` instance | `encounter` | `success` from 1 or 0, `difficulty`, `size`, and `npcIds` (at most 40, each once) from the 6th argument when the client sends it. |

Every call and event is guarded: a missing API, an event that never fires or an argument of the wrong type
records nothing and never errors. Calls and payloads were read from the Warcraft Wiki API pages, which list each
of them for the Forever build 1.60.1, not from memory.

## A deliberate narrowing

The brief asked for "an object you opened (the chest, herb or vein you looted)" as an `object_sighting`. The
protocol's `object_sighting.x` reads "The object's own x on that map, 0 to 100, from the vignette: not the
player's", and `docs/DATA_POLICY.md` says the same. A looted object's place is where the player stood, so it
is not recorded as an `object_sighting`. It is already on the object's `loot` row (`mapId`, `x`, `y`,
`gatherKind`, `sourceObjectName`, addon 0.3.10). A chest the minimap marks becomes an `object_sighting` through
its vignette. Herbs and veins are not vignettes, so they stay on loot rows only.

## Tested

- `addon/tests/map_positions_contract.py` gains two sections: vignettes (rare, treasure, inside an instance,
  repeats, refused GUIDs, names and positions, a broken or missing API) and entrances and encounters (zoning in,
  repeats, reload and login inside, dungeon finder, battleground, no position, missing or failing
  `GetInstanceInfo`, kill, wipe, 40-id cap, odd arguments, outdoors). Every row is checked against the
  protocol's JSON Schema (`check_all`). Two mutations (the dungeon finder guard, the `vignette` position kind)
  fail the test.
- All 24 runnable files in `addon/tests/` pass: the 23 CI runs plus `minimap_contract.py`.
- `python scripts/package-addon.py` rebuilt `web/public/downloads/Everloot-0.3.10.zip` (0.3.10 is not tagged,
  so CI compares it byte for byte).

## Not done, and for someone else

- `openworld.lua` has no API allowlist like `census.lua`'s `C.API` or `players.lua`'s `P.API`, so there is no
  list to add the new calls to. Every new call is a game-fact call (vignettes, instance info, the player's own
  map position) and reads nothing about another player. Adding a list and a test is a separate change.
- `docs/DATA_POLICY.md` describes vignette, entrance and encounter rows as coming from Polestar Recorder files,
  and its addon paragraph says places come "at two moments (addon 0.3.10)". It should name the addon as a
  source too. It is outside this lane, so it is left to its owner.
- No version change: `## Version` stays 0.3.10 for the release lane.
- Which Desktop App build bundles protocol package 1.12.0, needed to send these kinds: [?].

## Only the live client can settle (launch day, 2026-11-04)

- Event names: `VIGNETTE_MINIMAP_UPDATED`, `VIGNETTES_UPDATED`, `PLAYER_LEAVING_WORLD`, `PLAYER_ENTERING_WORLD`,
  `ENCOUNTER_END` fire on Forever.
- Arguments: `VIGNETTE_MINIMAP_UPDATED` sends vignetteGUID, onMinimap; `ENCOUNTER_END` sends encounterID,
  encounterName, difficultyID, groupSize, success as 1 or 0, and whether the 6th (boss units with
  `creatureID`, added in 12.0.7 per the docs) exists; `GetInstanceInfo`'s 2nd, 3rd, 8th and 10th returns.
- Vignettes: whether Forever marks rares and treasures with vignettes at all; that `objectGUID` is the
  creature's or object's GUID; that `name` is its name; that `GetVignettePosition` gives `x`, `y` from 0 to 1
  on the player's map.
- Distances: the vignette position against `/way` on the spot (within 1); the entrance position against the
  portal, which depends on `PLAYER_LEAVING_WORLD` firing before the outdoor position is gone.
- Roles: vignette rows carry no role, level, reaction or rank (the vignette gives none), so a vignette rare
  shows no rank unless a targeting row adds one.
- Summons into an instance record where the player was summoned from; how often that happens is unknown.
