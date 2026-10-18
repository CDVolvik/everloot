"""Run with: uv run --with lupa --with jsonschema python addon/tests/mapbounds_contract.py"""
from pathlib import Path
from lupa.lua51 import LuaRuntime

root = Path(__file__).parents[1]
toc = (root / "Everloot.toc").read_text(encoding="utf-8")
assert "modules\\mapbounds.lua" in toc, "mapbounds module must be in the TOC"

STUBS = """
date = function() return '2026-10-17T00:00:00Z' end
time = function() return 123456 end
print = function() end
SlashCmdList = {}
CreateFrame = function() return {
 RegisterEvent=function() end,
 SetScript=function(self, _, f) self.onEvent=f end,
 HookScript=function(self, _, f) self.hooks=self.hooks or {}; table.insert(self.hooks,f) end
} end
BUILD = { '1.60.1', '70450', 'Oct 1 2026', 11508 }
GetBuildInfo = function() return unpack(BUILD) end
-- Like Vector2DMixin: the API takes a vector, so a bare {x, y} table fails the stub below.
CreateVector2D = function(x, y) return { x = x, y = y, GetXY = function(self) return self.x, self.y end } end
-- World x runs north and y runs west: (0,0) is the north-west corner.
zones = {
 [1429] = { continent = 0, [0] = { x = -7939.6, y = 1535.4 }, [1] = { x = -10254.2, y = -1599.6 } },
 [1411] = { continent = 1, [0] = { x = 1007.8, y = -3245.1 }, [1] = { x = -2500.0, y = -6489.4 } },
 [9001] = { continent = 0 },  -- the client knows no corners for this map
 [9002] = 'broken',
}
here = 1429
C_Map = {
 GetBestMapForUnit = function(unit) assert(unit == 'player'); return here end,
 GetWorldPosFromMapPos = function(mapId, pos)
  local zone = zones[mapId]
  assert(type(pos.GetXY) == 'function', 'GetWorldPosFromMapPos takes a vector from CreateVector2D')
  if zone == 'broken' then error('bad map') end
  local corner = zone and zone[pos.x]
  if not corner or pos.x ~= pos.y then return nil end
  return zone.continent, { x = corner.x, y = corner.y }
 end,
}
"""


def fresh(extra: str = ""):
    lua = LuaRuntime()
    lua.execute(STUBS)
    lua.execute(extra)
    for file in ["core.lua", "modules/mapbounds.lua"]:
        lua.execute((root / file).read_text(encoding="utf-8"))
    lua.execute("""
Everloot.frame.onEvent(nil,'ADDON_LOADED','Everloot')
function event(name) for _, hook in ipairs(Everloot.frame.hooks or {}) do hook(nil, name) end end
function reload() Everloot.frame.hooks = nil; Everloot.frame.onEvent(nil,'ADDON_LOADED','Everloot'); event('PLAYER_ENTERING_WORLD') end
""")
    return lua


lua = fresh()
lua.execute("""
assert(EverlootDB.clientBuild == '1.60.1.70450', 'the client build is version.build from GetBuildInfo')
event('PLAYER_ENTERING_WORLD')
local rows = EverlootDB.records.map_bounds
assert(rows and #rows == 1, 'entering a zone records its bounds')
local r = rows[1]
assert(r.mapId == 1429 and r.continentId == 0, 'the zone and its continent')
assert(r.top == -7939.6 and r.left == 1535.4 and r.bottom == -10254.2 and r.right == -1599.6,
 'top and left from (0,0), bottom and right from (1,1)')
assert(r.installId == EverlootDB.installId and r.capturedAt == '2026-10-17T00:00:00Z')
for key in pairs(r) do
 assert(({installId=1, capturedAt=1, mapId=1, continentId=1, left=1, top=1, right=1, bottom=1, eventId=1, kindLoggedAt=1})[key], 'unexpected field ' .. key)
end

-- Once per zone per build.
event('ZONE_CHANGED_NEW_AREA'); event('PLAYER_ENTERING_WORLD')
assert(Everloot:Count('map_bounds') == 1, 'the same zone on the same build is recorded once')
here = 1411
event('ZONE_CHANGED_NEW_AREA')
assert(Everloot:Count('map_bounds') == 2 and EverlootDB.records.map_bounds[2].continentId == 1, 'a new zone is recorded')
reload()
assert(Everloot:Count('map_bounds') == 2, 'a reload on the same build adds nothing')
BUILD = { '1.60.2', '70611', 'Oct 15 2026', 11508 }
reload()
assert(EverlootDB.clientBuild == '1.60.2.70611')
assert(Everloot:Count('map_bounds') == 3, 'a new build records the zone again')

-- Maps without corners, a failing call and no map at all never error and store nothing.
here = 9001; event('ZONE_CHANGED_NEW_AREA')
here = 9002; event('ZONE_CHANGED_NEW_AREA')
here = nil; event('ZONE_CHANGED_NEW_AREA')
assert(Everloot:Count('map_bounds') == 3)
assert(string.find(Everloot:Status(), 'rows map_bounds: 3', 1, true))
""")

# A build string the intake would refuse is left out instead.
lua = fresh("BUILD = { '1.60.1 beta', '70450' }")
lua.execute("assert(EverlootDB.clientBuild == nil, 'an unreadable build is left out')")
lua = fresh("GetBuildInfo = nil")
lua.execute("""
assert(EverlootDB.clientBuild == nil, 'no GetBuildInfo, no build')
event('PLAYER_ENTERING_WORLD')
assert(Everloot:Count('map_bounds') == 1, 'bounds are still recorded once without a build')
""")

# No C_Map: the module disables itself.
lua = fresh("C_Map = nil")
lua.execute("""
event('PLAYER_ENTERING_WORLD')
assert(Everloot:Count('map_bounds') == 0)
assert(string.find(Everloot:Status(), 'mapbounds: disabled', 1, true), 'a client without C_Map disables the module')
""")
# Every row the addon wrote is a record the site would accept (packages/protocol/schema).
from protocol_schema import check_all  # noqa: E402
check_all(lua)
print("Lua 5.1 map bounds: corners from (0,0) and (1,1), once per zone per build, client build, guarded calls")
