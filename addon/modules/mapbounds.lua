-- Everloot zone bounds: each zone's corners in world coordinates, so the site can place zone
-- coordinates on one continuous map. From the game's map API: C_Map.GetWorldPosFromMapPos at
-- (0,0) is the zone's top-left corner and at (1,1) its bottom-right. Once per zone per client build.

local E = Everloot

local function vector(x, y)
  if CreateVector2D then return CreateVector2D(x, y) end
  return { x = x, y = y }
end

local function worldUnits(v)
  return type(v) == "number" and v == v and math.abs(v) <= 100000
end

--- World x runs north and y runs west, so a corner's x is its top or bottom edge and y its left or right.
local function corner(mapId, x, y)
  local ok, continentId, pos = pcall(C_Map.GetWorldPosFromMapPos, mapId, vector(x, y))
  if not ok or type(continentId) ~= "number" or type(pos) ~= "table" then return nil end
  if not (worldUnits(pos.x) and worldUnits(pos.y)) then return nil end
  return continentId, pos.x, pos.y
end

local function record()
  local okMap, mapId = pcall(C_Map.GetBestMapForUnit, "player")
  if not okMap or type(mapId) ~= "number" or mapId < 1 or mapId ~= math.floor(mapId) then return "no zone" end
  -- The seen list belongs to one build: a new build records every zone again.
  local build = EverlootDB.clientBuild or "?"
  if EverlootDB.mapBoundsBuild ~= build or type(EverlootDB.mapBoundsSeen) ~= "table" then
    EverlootDB.mapBoundsBuild = build
    EverlootDB.mapBoundsSeen = {}
  end
  if EverlootDB.mapBoundsSeen[mapId] then return "recorded for this build" end
  local continentId, top, left = corner(mapId, 0, 0)
  local otherContinent, bottom, right = corner(mapId, 1, 1)
  if not continentId or continentId ~= otherContinent or continentId < 0 or continentId ~= math.floor(continentId) then
    return "no bounds for this map"
  end
  if left == right or top == bottom then return "no bounds for this map" end
  local stored = E:Store("map_bounds", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    mapId = mapId,
    continentId = continentId,
    left = left,
    top = top,
    right = right,
    bottom = bottom,
  })
  if stored then EverlootDB.mapBoundsSeen[mapId] = true end
  return stored and "stored" or "not stored"
end

E:RegisterModule("mapbounds", function()
  if not (C_Map and C_Map.GetBestMapForUnit and C_Map.GetWorldPosFromMapPos) then error("map API unavailable", 0) end
  local f = E.frame
  for _, name in ipairs({ "PLAYER_ENTERING_WORLD", "ZONE_CHANGED_NEW_AREA" }) do
    pcall(function() f:RegisterEvent(name) end)
  end
  f:HookScript("OnEvent", function(_, event)
    if event == "PLAYER_ENTERING_WORLD" or event == "ZONE_CHANGED_NEW_AREA" then pcall(record) end
  end)
  return "ready (zone corners once per zone per build)"
end)
