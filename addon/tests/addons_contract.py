"""Run with: uv run --with lupa python addon/tests/addons_contract.py"""
from pathlib import Path
from lupa.lua51 import LuaRuntime

root = Path(__file__).parents[1]
toc = (root / "Everloot.toc").read_text(encoding="utf-8")
assert "modules\\addons.lua" in toc, "addons module must be in the TOC"

STUBS = """
NOW = '2026-10-17T00:00:00Z'
date = function() return NOW end
time = function() return 123456 end
printed = {}
print = function(text) table.insert(printed, text) end
SlashCmdList = {}
CreateFrame = function() return {
 RegisterEvent=function() end,
 SetScript=function(self, _, f) self.onEvent=f end,
 HookScript=function(self, _, f) self.hooks=self.hooks or {}; table.insert(self.hooks,f) end
} end
-- name, title, notes, loadable, reason, security; titles carry colour codes and textures.
addons = {
 {'Everloot', 'Everloot', '1', true},
 {'Questie', '|cff00ff00Questie|r', '9.5.1', true},
 {'Bagnon', '|TInterface\\\\Icons\\\\INV_Misc_Bag_08:16|t Bagnon', nil, true},
 {'OldMap', '', '1.0', false},
}
local function find(name) for _, a in ipairs(addons) do if a[1] == name then return a end end end
API = {
 GetNumAddOns = function() return #addons end,
 GetAddOnInfo = function(i) local a = addons[i]; return a[1], a[2], 'notes', true, nil, 'INSECURE' end,
 GetAddOnMetadata = function(name, field) if field == 'Version' then return find(name)[3] end end,
 IsAddOnLoaded = function(name) return find(name)[4] end,
}
"""


def fresh(api: str, saved: str = "nil"):
    lua = LuaRuntime()
    lua.execute(STUBS)
    lua.execute(api)
    lua.execute(f"EverlootDB = {saved}")
    for file in ["core.lua", "modules/addons.lua"]:
        lua.execute((root / file).read_text(encoding="utf-8"))
    lua.execute("""
Everloot.frame.onEvent(nil,'ADDON_LOADED','Everloot')
function event(name) for _, hook in ipairs(Everloot.frame.hooks or {}) do hook(nil, name) end end
function reload() Everloot.frame.hooks = nil; Everloot.frame.onEvent(nil,'ADDON_LOADED','Everloot'); event('PLAYER_LOGIN') end
""")
    return lua


# C_AddOns client: off by default, on after /everloot addons on and a reload.
lua = fresh("C_AddOns = API")
lua.execute("""
assert(EverlootDB.toggles.addons == false, 'the addon list is off by default')
event('PLAYER_LOGIN')
assert(Everloot:Count('addon_seen') == 0, 'nothing is recorded while the addon list is off')
assert(string.find(Everloot:Status(), 'addons: off by toggle', 1, true), 'status shows the addon list is off')

SlashCmdList.EVERLOOT('addons on')
assert(EverlootDB.toggles.addons == true, '/everloot addons on turns it on')
reload()
local rows = EverlootDB.records.addon_seen
assert(rows and #rows == 4, 'one row per installed addon; got ' .. tostring(rows and #rows))
local byName = {}
for _, r in ipairs(rows) do byName[r.name] = r end
assert(byName.Questie.title == 'Questie' and byName.Questie.version == '9.5.1' and byName.Questie.loaded == true,
 'colour codes leave the title; version comes from the .toc')
assert(byName.Bagnon.title == 'Bagnon' and byName.Bagnon.version == nil, 'textures leave the title; no version stays nil')
assert(byName.OldMap.title == 'OldMap' and byName.OldMap.loaded == false, 'an empty title falls back to the folder name')
assert(byName.Questie.installId == EverlootDB.installId and byName.Questie.capturedAt == NOW)
for _, r in ipairs(rows) do
 for key in pairs(r) do
  assert(({installId=1, capturedAt=1, name=1, title=1, version=1, loaded=1, eventId=1, kindLoggedAt=1})[key], 'unexpected field ' .. key)
 end
end
assert(string.find(Everloot:Status(), 'rows addon_seen: 4', 1, true))

-- Another login the same day adds nothing; a new version is a new row; a new day records each again.
reload()
assert(Everloot:Count('addon_seen') == 4, 'the same day and version adds nothing')
addons[2][3] = '9.6.0'
reload()
assert(Everloot:Count('addon_seen') == 5 and EverlootDB.records.addon_seen[5].version == '9.6.0', 'a new version is recorded')
NOW = '2026-10-18T00:00:00Z'
reload()
assert(Everloot:Count('addon_seen') == 9, 'a new day records each addon again')

-- Off deletes the rows not yet uploaded and stops recording.
SlashCmdList.EVERLOOT('addons off')
assert(EverlootDB.toggles.addons == false and Everloot:Count('addon_seen') == 0, 'off deletes retained addon rows')
NOW = '2026-10-19T00:00:00Z'
reload()
assert(Everloot:Count('addon_seen') == 0, 'nothing is recorded after off')
""")

# Upgrading from 0.2.5: an existing file has no addons toggle, and the list stays off.
lua = fresh("C_AddOns = API", "{ installId = 'abcd-1234', toggles = { openworld = true, auctions = true }, records = {} }")
lua.execute("""
assert(EverlootDB.toggles.addons == false, 'an upgraded install starts with the addon list off')
assert(EverlootDB.toggles.auctions == true, 'existing toggles are kept')
event('PLAYER_LOGIN')
assert(Everloot:Count('addon_seen') == 0)
""")

# Legacy globals work the same way.
lua = fresh("GetNumAddOns, GetAddOnInfo, GetAddOnMetadata, IsAddOnLoaded = API.GetNumAddOns, API.GetAddOnInfo, API.GetAddOnMetadata, API.IsAddOnLoaded",
            "{ installId = 'abcd-1234', toggles = { addons = true }, records = {} }")
lua.execute("""
event('PLAYER_LOGIN')
assert(Everloot:Count('addon_seen') == 4, 'the legacy AddOns API records the same rows')
""")

# Neither API: the module disables itself and never errors.
lua = fresh("", "{ installId = 'abcd-1234', toggles = { addons = true }, records = {} }")
lua.execute("""
event('PLAYER_LOGIN')
assert(Everloot:Count('addon_seen') == 0)
assert(string.find(Everloot:Status(), 'addons: disabled', 1, true), 'a client without the AddOns API disables the module')
""")

# A broken API call skips that addon instead of raising.
lua = fresh("C_AddOns = API; local info = API.GetAddOnInfo; API.GetAddOnInfo = function(i) if i == 2 then error('boom') end return info(i) end",
            "{ installId = 'abcd-1234', toggles = { addons = true }, records = {} }")
lua.execute("""
event('PLAYER_LOGIN')
assert(Everloot:Count('addon_seen') == 3, 'one failing addon is skipped')
""")
print("Lua 5.1 addons: off by default and after upgrade, C_AddOns and legacy API, plain titles, once a day per version, off deletes")
