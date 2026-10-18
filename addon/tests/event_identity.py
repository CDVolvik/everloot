"""Run with: uv run --with lupa python addon/tests/event_identity.py"""
from pathlib import Path
from lupa.lua51 import LuaRuntime

lua = LuaRuntime()
lua.execute("""
date = function() return '2026-10-07T00:00:00Z' end
time = function() return 123456 end
print = function() end
SlashCmdList = {}
CreateFrame = function() return {RegisterEvent=function() end, SetScript=function(self, _, f) self.onEvent=f end} end
""")
lua.execute((Path(__file__).parents[1] / "core.lua").read_text(encoding="utf-8"))
lua.execute("""
Everloot.frame.onEvent(nil, 'ADDON_LOADED', 'Everloot')
Everloot:Store('loot', {capturedAt='2026-10-07T00:00:00Z'})
local first = EverlootDB.records.loot[1].eventId
Everloot:Store('loot', {capturedAt='2026-10-07T00:00:00Z'})
assert(first ~= EverlootDB.records.loot[2].eventId)
assert(first == EverlootDB.records.loot[1].eventId)
Everloot.frame.onEvent(nil, 'ADDON_LOADED', 'Everloot')
Everloot:Store('loot', {})
assert(first ~= EverlootDB.records.loot[3].eventId)
assert(EverlootDB.nextEvent == 3)
EverlootDB.nextEvent = nil
Everloot:Store('loot', {})
assert(first ~= EverlootDB.records.loot[4].eventId)
Everloot.MAX_ROWS_PER_KIND = 4
assert(Everloot:Store('loot', {}) == false)
assert(#EverlootDB.records.loot == 4)
assert(first == EverlootDB.records.loot[1].eventId)
assert(string.find(Everloot:Status(), 'paused') ~= nil)
""")
# The loot rows above are stand-ins with no fields: this test checks ids, so the protocol schema check
# (protocol_schema.check_all) runs in the module tests, not here.
print("Lua 5.1 event identity: same-second events, reload, reset and retained IDs passed")
