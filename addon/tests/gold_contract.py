"""Run with: uv run --with lupa python addon/tests/gold_contract.py"""
from pathlib import Path
from lupa.lua51 import LuaRuntime

lua = LuaRuntime()
lua.execute("""
date = function() return '2026-10-09T00:00:00Z' end
local clock = 1000
time = function() clock = clock + 1; return clock end
print = function() end
SlashCmdList = {}
CreateFrame = function() return {
 RegisterEvent=function() end,
 SetScript=function(self, _, f) self.onEvent=f end,
 HookScript=function(self, _, f) self.hooks=self.hooks or {}; table.insert(self.hooks,f) end
} end
UnitName = function() return 'Thrall' end
GetRealmName = function() return 'Test Realm' end
money = 1000
GetMoney = function() return money end
""")
root = Path(__file__).parents[1]
for file in ["core.lua", "modules/gold.lua"]:
    lua.execute((root / file).read_text(encoding="utf-8"))
lua.execute("""
Everloot.frame.onEvent(nil,'ADDON_LOADED','Everloot')
local function event(name, ...)
 for _, hook in ipairs(Everloot.frame.hooks) do hook(nil, name, ...) end
end
local function events(category)
 local list = {}
 for _, row in ipairs(EverlootDB.records.money_event or {}) do
  if category == nil or row.category == category then list[#list + 1] = row end
 end
 return list
end
event('PLAYER_ENTERING_WORLD')

-- A sale at an open merchant is vendor income; a purchase there is not recorded.
event('MERCHANT_SHOW')
money = 1500; event('PLAYER_MONEY')
money = 1200; event('PLAYER_MONEY')
event('MERCHANT_CLOSED')
assert(#events('vendor') == 1 and events('vendor')[1].copper == 500, 'one vendor sale of 500')

-- Money gained with no merchant open is not called a vendor sale.
money = 1300; event('PLAYER_MONEY')
assert(#events() == 1, 'unattributed income stays unrecorded')

-- A flight paid while the taxi map is open.
event('TAXIMAP_OPENED')
money = 1250; event('PLAYER_MONEY')
event('TAXIMAP_CLOSED')
money = 1200; event('PLAYER_MONEY')
assert(#events('flight') == 1 and events('flight')[1].copper == 50, 'one flight of 50, nothing after the map closed')

-- A quest turn-in reports its own money reward; the money change that follows is not counted again.
event('QUEST_TURNED_IN', 123, 450, 250)
money = 1450; event('PLAYER_MONEY')
event('QUEST_TURNED_IN', 124, 450, 0)
assert(#events('quest') == 1 and events('quest')[1].copper == 250, 'one quest reward of 250; none for a zero reward')
assert(#events() == 3, 'no double count, got ' .. #events())
for _, row in ipairs(events()) do
 assert(row.character == 'Thrall' and row.realm == 'Test Realm' and row.eventId, 'own character, stable event id')
end
""")
print("Lua 5.1 gold: vendor sales, flights and quest rewards attributed; purchases and unknown income unrecorded")
