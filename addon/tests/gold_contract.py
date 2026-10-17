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
SendMail = function() end
PlaceAuctionBid = function() end
sendPrice = 30
GetSendMailPrice = function() return sendPrice end
-- hooksecurefunc(name, after) or hooksecurefunc(table, name, after); the hook runs once the original has run.
hooksecurefunc = function(a, b, c)
 local target, name, after = _G, a, b
 if type(a) == 'table' then target, name, after = a, b, c end
 local original = target[name]
 target[name] = function(...) original(...); after(...) end
end
-- Forever's auction house, with the signatures in the client's API documentation. Owner and bidder fields exist
-- in the data and are never read.
listings = { [901] = { buyoutAmount = 7000, bidAmount = 0, bidder = 'Player-1-AAAA' }, [902] = { buyoutAmount = nil } }
C_AuctionHouse = {
 PlaceBid = function(auctionID, bidAmount) end,
 StartCommoditiesPurchase = function(itemID, quantity) end,
 ConfirmCommoditiesPurchase = function(itemID, quantity) end,
 GetAuctionInfoByID = function(auctionID) return listings[auctionID] end,
}
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
-- The letter pays the sale price minus the house cut plus the returned deposit; only the sale is income.
inbox = {
 { invoice = 'seller', copper = 3000, buyer = 'Jaina', bid = 2900, deposit = 250, cut = 150 },
 { invoice = nil, copper = 700 },
 { invoice = 'seller', copper = 900, buyer = 'Jaina', bid = 900, deposit = 45, cut = 45 },
}
GetInboxInvoiceInfo = function(i)
 local m = inbox[i]
 if not m then return nil end
 return m.invoice, 'Silk', m.buyer, m.bid, m.bid, m.deposit, m.cut
end
GetInboxHeaderInfo = function(i) local m = inbox[i]; return 'icon', 'paper', 'Auction House', 'Auction successful', m and m.copper end
TakeInboxMoney(1)
money = money + 3000; event('PLAYER_MONEY')
assert(#events('auction') == 1 and events('auction')[1].copper == 2750, 'one auction sale of 2750 net, deposit not income')
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

-- Postage is the price the send window quoted, stored once the server confirms the letter left.
SendMail('Jaina', 'Hi', '')
sendPrice = 0
event('MAIL_SEND_SUCCESS')
SendMail('Jaina', 'Again', '')
event('MAIL_FAILED')
event('MAIL_SEND_SUCCESS')
assert(#events('postage') == 1 and events('postage')[1].copper == 30, 'one postage of 30; a failed send costs nothing')
assert(#events() == 5, 'postage added once, got ' .. #events())

-- A buyout is an auction purchase once the money leaves. A plain bid can be refunded, so it is not.
listing = { { buyout = 5000, owner = 'Jaina' }, { buyout = 0, owner = 'Jaina' } }
GetAuctionItemInfo = function(_, i)
 local l = listing[i]
 return 'Silk', 'icon', 1, 1, true, 1, nil, 100, 10, l.buyout, 0, false, nil, l.owner
end
PlaceAuctionBid('list', 1, 5000)
money = money - 5000; event('PLAYER_MONEY')
PlaceAuctionBid('list', 1, 4000)
money = money - 4000; event('PLAYER_MONEY')
PlaceAuctionBid('list', 2, 300)
money = money - 300; event('PLAYER_MONEY')
PlaceAuctionBid('list', 1, 5000)
event('AUCTION_HOUSE_CLOSED')
money = money - 5000; event('PLAYER_MONEY')
assert(#events('auction_spend') == 1 and events('auction_spend')[1].copper == 5000, 'one buyout of 5000; bids and stale buyouts unrecorded')

-- Forever, items: a bid at the listing's buyout is a purchase once the money leaves; a lower bid, a bid on a
-- listing without a buyout, and a listing the house no longer reports are not.
money = money + 50000; event('PLAYER_MONEY')  -- unattributed income, so the purse can pay
C_AuctionHouse.PlaceBid(901, 7000)
money = money - 7000; event('PLAYER_MONEY')
C_AuctionHouse.PlaceBid(901, 6000)
money = money - 6000; event('PLAYER_MONEY')
C_AuctionHouse.PlaceBid(902, 300)
money = money - 300; event('PLAYER_MONEY')
C_AuctionHouse.PlaceBid(999, 7000)
money = money - 7000; event('PLAYER_MONEY')
assert(#events('auction_spend') == 2 and events('auction_spend')[2].copper == 7000, 'one item buyout of 7000; got ' .. #events('auction_spend'))

-- Forever, commodities: the purchase pays the total the house last quoted, and only when the money matches.
C_AuctionHouse.StartCommoditiesPurchase(2589, 200)
event('COMMODITY_PRICE_UPDATED', 10, 1900)
event('COMMODITY_PRICE_UPDATED', 10, 2000)
C_AuctionHouse.ConfirmCommoditiesPurchase(2589, 200)
money = money - 2000; event('PLAYER_MONEY')
assert(#events('auction_spend') == 3 and events('auction_spend')[3].copper == 2000, 'one commodity purchase at the last quote')
-- A new purchase forgets the old quote: with no quote yet the confirm attributes nothing.
C_AuctionHouse.StartCommoditiesPurchase(2589, 200)
C_AuctionHouse.ConfirmCommoditiesPurchase(2589, 200)
money = money - 2000; event('PLAYER_MONEY')
-- A price that moved: the money that left is not the quote, so nothing is recorded.
C_AuctionHouse.StartCommoditiesPurchase(2589, 200)
event('COMMODITY_PRICE_UPDATED', 10, 2000)
C_AuctionHouse.ConfirmCommoditiesPurchase(2589, 200)
money = money - 2100; event('PLAYER_MONEY')
-- A failed purchase and a closed house drop the quote.
C_AuctionHouse.StartCommoditiesPurchase(2589, 200)
event('COMMODITY_PRICE_UPDATED', 10, 2000)
event('COMMODITY_PURCHASE_FAILED')
C_AuctionHouse.ConfirmCommoditiesPurchase(2589, 200)
money = money - 2000; event('PLAYER_MONEY')
event('COMMODITY_PRICE_UPDATED', 10, 2000)
event('AUCTION_HOUSE_CLOSED')
C_AuctionHouse.ConfirmCommoditiesPurchase(2589, 200)
money = money - 2000; event('PLAYER_MONEY')
assert(#events('auction_spend') == 3, 'unquoted, mismatched, failed and stale purchases are unrecorded; got ' .. #events('auction_spend'))

for _, row in ipairs(events()) do
 for _, value in pairs(row) do assert(value ~= 'Jaina' and value ~= 'Player-1-AAAA', 'buyers, sellers and recipients are other players and are never stored') end
end
""")
print("Lua 5.1 gold: vendor sales, flights, quest rewards, net auction sales, postage and buyouts (legacy and C_AuctionHouse, items and commodities) attributed; other purchases and unknown income unrecorded")
