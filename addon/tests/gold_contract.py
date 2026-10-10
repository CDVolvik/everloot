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
TakeInboxMoney = function() end
AutoLootMailItem = function() end
hooksecurefunc = function(name, after)
 local original = _G[name]
 _G[name] = function(...) original(...); after(...) end
end
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

-- Auction sales arrive by mail. The invoice type says seller; the money change has to match the letter.
inbox = {
 { invoice = 'seller', copper = 3000, buyer = 'Jaina' },
 { invoice = nil, copper = 700 },
 { invoice = 'seller', copper = 900, buyer = 'Jaina' },
}
GetInboxInvoiceInfo = function(i) local m = inbox[i]; return m and m.invoice, 'Silk', m and m.buyer end
GetInboxHeaderInfo = function(i) local m = inbox[i]; return 'icon', 'paper', 'Auction House', 'Auction successful', m and m.copper end
TakeInboxMoney(1)
money = money + 3000; event('PLAYER_MONEY')
assert(#events('auction') == 1 and events('auction')[1].copper == 3000, 'one auction sale of 3000')
-- A letter that is not an auction invoice stays unrecorded.
TakeInboxMoney(2)
money = money + 700; event('PLAYER_MONEY')
-- A money change that does not match the letter is not attributed, and neither is the next one.
AutoLootMailItem(3)
money = money + 899; event('PLAYER_MONEY')
money = money + 900; event('PLAYER_MONEY')
-- Closing the mailbox drops a letter whose money never arrived.
AutoLootMailItem(3)
event('MAIL_CLOSED')
money = money + 900; event('PLAYER_MONEY')
assert(#events('auction') == 1, 'non-invoice, unmatched or stale mail money unrecorded, got ' .. #events('auction'))
assert(#events() == 4, 'only the auction sale was added, got ' .. #events())
for _, row in ipairs(events()) do
 for _, value in pairs(row) do assert(value ~= 'Jaina', 'the buyer is another player and is never stored') end
end
""")
print("Lua 5.1 gold: vendor sales, flights, quest rewards and mailed auction sales attributed; purchases and unknown income unrecorded")
