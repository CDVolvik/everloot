"""Run with: uv run --with lupa --with jsonschema python addon/tests/market_contract.py

The Forever auction house (C_AuctionHouse): a full scan the player starts, read in chunks, summarised
per item, stored as auction_snapshot parts; prices in tooltips from the player's own scan and from
the companion's checksummed EverlootPrices file.
"""
from pathlib import Path
from lupa.lua51 import LuaRuntime


lua = LuaRuntime()
lua.execute("""
now = 1000000
time = function() return now end
date = function() return '2026-10-20T10:00:00Z' end
printed = {}
print = function(msg) printed[#printed + 1] = tostring(msg) end
function said(pattern) for _, p in ipairs(printed) do if string.find(p, pattern) then return true end end return false end
SlashCmdList = {}
local function newFrame(kind, name, parent)
  return {
    kind = kind, name = name, parent = parent,
    RegisterEvent = function() end,
    SetScript = function(self, script, f) self.scripts = self.scripts or {}; self.scripts[script] = f; if script == 'OnEvent' then self.onEvent = f end end,
    HookScript = function(self, _, f) self.hooks = self.hooks or {}; table.insert(self.hooks, f) end,
    SetSize = function() end, SetPoint = function() end,
    SetText = function(self, t) self.text = t end,
  }
end
CreateFrame = newFrame
function fire(event, arg1) for _, hook in ipairs(Everloot.frame.hooks or {}) do hook(nil, event, arg1) end end

-- C_Timer runs nothing by itself: the test drains it, so chunking is visible.
timers = {}
C_Timer = { After = function(seconds, f) table.insert(timers, { seconds = seconds, f = f }) end }
-- Counts the chunk and retry steps; the scan's own give-up timer (30 s) fires too but is not a step.
function drain() local n = 0; while #timers > 0 do local t = table.remove(timers, 1); if t.seconds < 30 then n = n + 1 end; t.f() end return n end
function stepsPending() local n = 0; for _, t in ipairs(timers) do if t.seconds < 30 then n = n + 1 end end return n end

-- Nothing may ever buy, bid or post: every such API is a trap that records the call.
forbidden = {}
local function trap(name) return function() forbidden[#forbidden + 1] = name end end
for _, name in ipairs({ 'PostItem', 'PostCommodity', 'PlaceBid', 'StartCommoditiesPurchase', 'ConfirmCommoditiesPurchase', 'CancelAuction', 'CancelCommoditiesPurchase', 'BuyoutItem' }) do
  _G['trapped_' .. name] = trap(name)
end
for _, name in ipairs({ 'PlaceAuctionBid', 'StartAuction', 'PostAuction', 'CancelAuction', 'ClickAuctionSellItemButton' }) do
  _G[name] = trap(name)
end

GetRealmName = function() return 'Forever' end

-- Replicate rows: name, texture, count, quality, usable, level, levelType, minBid, minIncrement,
-- buyoutPrice, bidAmount, highBidder, bidderFullName, owner, ownerFullName, saleStatus, itemID, hasAllInfo
rows = {}
function row(itemID, count, buyout, hasAllInfo) table.insert(rows, { itemID = itemID, count = count, buyout = buyout, hasAllInfo = hasAllInfo }) end
-- Linen: 20 @100, 10 @150, 30 @200, 40 @300 -> 100 units; a quarter is 25 units: 20@100 + 5@150 = 110 each.
row(2589, 20, 2000, true); row(2589, 10, 1500, true); row(2589, 30, 6000, true); row(2589, 40, 12000, true)
row(2592, 5, 0, true)        -- bid-only: no buyout
row(765, 0, 100, true)       -- bad stack size
row(777, 5, 3, true)         -- buyout below the stack size: under 1 copper a unit, not a price
row(nil, nil, nil, true)     -- no item, complete: skipped
row(nil, nil, nil, false)    -- not loaded yet: read again later
for id = 10001, 11200 do row(id, 1, 50, true) end   -- 1,200 more items: two snapshot parts
loadedLater = false
replicateCalls = 0
C_AuctionHouse = {
  PostItem = trap('C_AuctionHouse.PostItem'), PostCommodity = trap('C_AuctionHouse.PostCommodity'),
  PlaceBid = trap('C_AuctionHouse.PlaceBid'), StartCommoditiesPurchase = trap('C_AuctionHouse.StartCommoditiesPurchase'),
  ConfirmCommoditiesPurchase = trap('C_AuctionHouse.ConfirmCommoditiesPurchase'), CancelAuction = trap('C_AuctionHouse.CancelAuction'),
  ReplicateItems = function() replicateCalls = replicateCalls + 1 end,
  GetNumReplicateItems = function() return #rows end,
  GetReplicateItemInfo = function(i)
    local r = rows[i]
    if r.hasAllInfo == false and loadedLater then return 'Silk', 1, 2, 1, true, 1, 0, 0, 0, 900, 0, false, nil, nil, nil, 0, 4306, true end
    return nil, 1, r.count, 1, true, 1, 0, 0, 0, r.buyout, 0, false, nil, nil, nil, 0, r.itemID, r.hasAllInfo
  end,
}

tooltipCalls = {}
Enum = { TooltipDataType = { Item = 0 } }
TooltipDataProcessor = { AddTooltipPostCall = function(kind, f) table.insert(tooltipCalls, { kind = kind, f = f }) end }
function tooltipFor(itemId)
  local tip = { lines = {} }
  tip.AddLine = function(self, text) table.insert(self.lines, text) end
  for _, c in ipairs(tooltipCalls) do c.f(tip, { id = itemId }) end
  return table.concat(tip.lines, '\\n')
end
""")
root = Path(__file__).parents[1]
toc = (root / "Everloot.toc").read_text(encoding="utf-8")
assert "modules\\prices.lua" in toc, "prices module must be in the TOC"
assert "EverlootPrices" in toc, "the companion's prices addon must load first"
for file in ["core.lua", "modules/auctions.lua", "modules/prices.lua"]:
    lua.execute((root / file).read_text(encoding="utf-8"))

lua.execute("""
Everloot.frame.onEvent(nil, 'ADDON_LOADED', 'Everloot')
EverlootDB.toggles.auctions = true
Everloot:InitModules()
Everloot:InitModules()
assert(#tooltipCalls == 1, 'tooltips are hooked once, however often modules start')

-- Nothing scans without the auction house open.
SlashCmdList.EVERLOOT('scan')
assert(replicateCalls == 0 and said('open the auction house'), 'scan needs the auction house open')

-- The button appears on the auction house frame once Blizzard's UI loads.
AuctionHouseFrame = CreateFrame('Frame', 'AuctionHouseFrame')
fire('ADDON_LOADED', 'Blizzard_AuctionHouseUI')
fire('AUCTION_HOUSE_SHOW')
local button = Everloot.scanButton
assert(button and button.parent == AuctionHouseFrame and button.text == 'Everloot scan', 'scan button on the auction house frame')

button.scripts.OnClick()
assert(replicateCalls == 1, 'a click starts one full scan')
button.scripts.OnClick()
assert(replicateCalls == 1 and said('already running'), 'one scan at a time')

fire('REPLICATE_ITEM_LIST_UPDATE')
assert(stepsPending() == 1, 'rows are read in chunks across frames')
loadedLater = true
local steps = drain()
assert(steps == 2, 'two more steps (rows 1001-1208, then the retry of the unloaded row); got ' .. steps)

local parts = EverlootDB.records.auction_snapshot
assert(parts and #parts == 2, 'a 1,202-item scan is stored as 2 parts; got ' .. tostring(parts and #parts))
assert(parts[1].part == 1 and parts[2].part == 2 and parts[1].parts == 2 and parts[1].scanId == parts[2].scanId)
assert(parts[1].realm == 'Forever' and parts[1].capturedAt == '2026-10-20T10:00:00Z' and parts[1].eventId)
assert(#parts[1].items == 1000 and #parts[2].items == 202, 'parts hold at most 1,000 items')
local found = {}
for _, p in ipairs(parts) do for _, t in ipairs(p.items) do found[t[1]] = t end end
local linen = found[2589]
assert(linen[2] == 4 and linen[3] == 100 and linen[4] == 100 and linen[5] == 110,
  'linen: 4 auctions, 100 units, min 100, value 110; got ' .. table.concat(linen, ','))
assert(found[4306] and found[4306][4] == 450, 'the unloaded row is read on retry, per unit (900 / 2)')
assert(not found[2592] and not found[765], 'bid-only and zero-count rows are skipped')
assert(not found[777], 'a buyout below its stack size (0 copper a unit) is dropped, never stored')
assert(said('1202 items'), 'the scan reports what it stored')

-- The cooldown: no second scan until 15 minutes have passed.
SlashCmdList.EVERLOOT('scan')
assert(replicateCalls == 1 and said('next full scan in 15 min'), 'cooldown blocks a second scan')

-- Closing the auction house stops a scan in progress, and the next one can run after the cooldown.
now = now + 901
local lastBefore = EverlootDB.lastScanAt
SlashCmdList.EVERLOOT('scan')
assert(replicateCalls == 2)
fire('AUCTION_HOUSE_CLOSED')
assert(said('auction house closed'))
assert(EverlootDB.lastScanAt == lastBefore, 'a scan that never got data gives the cooldown back')
fire('REPLICATE_ITEM_LIST_UPDATE')
assert(stepsPending() == 0, 'a stopped scan reads nothing')

-- Only the last 3 scans per realm stay in SavedVariables.
for k = 1, 3 do
  now = now + 901
  fire('AUCTION_HOUSE_SHOW')
  SlashCmdList.EVERLOOT('scan')
  fire('REPLICATE_ITEM_LIST_UPDATE')
  drain()
end
local scans = {}
for _, p in ipairs(EverlootDB.records.auction_snapshot) do scans[p.scanId] = true end
local count = 0
for _ in pairs(scans) do count = count + 1 end
assert(count == 3, 'three scans kept; got ' .. count)
assert(Everloot:Status():find('auction_snapshot'), 'status counts the snapshot rows')
""")

# The player's own latest scan shows in tooltips; community prices come from the companion's golden
# file (addon/tests/fixtures/EverlootPrices.lua, regenerated by companion/scripts/write-prices-fixture.ts)
# and show only with a valid checksum.
lua.execute("""
local own = tooltipFor(2589)
assert(own:find('Your scan: min 1s 0c') and own:find('value 1s 10c') and own:find('100 up'), own)
assert(tooltipFor(424242) == '', 'no line for an item with no price')
tripped = false
os = { execute = function() tripped = true end }
""")
lua.execute((Path(__file__).parent / "fixtures" / "EverlootPrices.lua").read_text(encoding="utf-8"))
lua.execute("""
assert(not tripped, 'loading prices must never run code')
Everloot:ResetPrices()
local both = tooltipFor(2589)
assert(both:find('Everloot market 2s 5c') and both:find('min 2s 0c') and both:find('historical 1s 90c'), both)
assert(both:find('3 reporters'), both)
local herb = tooltipFor(765)
assert(herb:find('market unrecorded'), 'a null market value is unrecorded, never zero: ' .. herb)

EverlootPricesDB.realms.forever.sum = 1
Everloot:ResetPrices()
printed = {}
local tampered = tooltipFor(2589)
assert(not tampered:find('Everloot market') and tampered:find('Your scan'), 'a failed checksum hides community prices only')
assert(said('checksum'), 'a failed checksum is reported')
""")
# A scan whose REPLICATE_ITEM_LIST_UPDATE never fires does not stay stuck: it times out, clears, and
# gives the cooldown back.
lua.execute("""
fire('AUCTION_HOUSE_SHOW')
now = now + 901
local before = replicateCalls
local lastScanAt = EverlootDB.lastScanAt
SlashCmdList.EVERLOOT('scan')
assert(replicateCalls == before + 1)
SlashCmdList.EVERLOOT('scan')
assert(said('already running'), 'while waiting, a scan is running')
local giveUp
for _, t in ipairs(timers) do if t.seconds == Everloot.SCAN_WAIT_SECONDS then giveUp = t end end
assert(giveUp and giveUp.seconds == 30, 'a give-up timer is set when the scan starts')
printed = {}
drain()
assert(said('sent no data'), 'the timeout says what happened')
assert(EverlootDB.lastScanAt == lastScanAt, 'the cooldown is refunded')
SlashCmdList.EVERLOOT('scan')
assert(replicateCalls == before + 2, 'the player can scan again at once')
-- Data that arrives in time is not cut off by the old timer.
fire('REPLICATE_ITEM_LIST_UPDATE')
drain()
assert(EverlootDB.lastScans.Forever.at == now, 'the second scan finished and was recorded')
""")

# Community prices: a stale file is marked, thin items say so, and a large file is checked a slice per frame.
lua.execute((Path(__file__).parent / "fixtures" / "EverlootPrices.lua").read_text(encoding="utf-8"))
lua.execute("""
Everloot:ResetPrices()
date = function() return '2026-10-30T10:00:00Z' end
local stale = tooltipFor(2589)
assert(stale:find('STALE') and stale:find('2026%-10%-20'), 'prices ten days old are marked stale: ' .. stale)
date = function() return '2026-10-21T10:00:00Z' end
local fresh = tooltipFor(2589)
assert(fresh:find('prices fetched 2026%-10%-20') and not fresh:find('STALE'), 'prices from yesterday are not stale: ' .. fresh)
date = function() return '2026-10-20T10:00:00Z' end
assert(Everloot.DayNumber('1970-01-01') == 0 and Everloot.DayNumber('2000-03-01') == 11017 and Everloot.DayNumber('2026-10-20') - Everloot.DayNumber('2026-10-19') == 1)
assert(Everloot.DayNumber('nope') == nil)

-- A thin item with no market value says so.
local rowsText = {}
for id = 1, 3000 do rowsText[#rowsText + 1] = string.format('%d,%s,%d,%d,%d,2026-10-20,3', id, (id == 2 and '' or '500'), 400, 450, (id == 2 and 2 or 50)) end
local data = table.concat(rowsText, ';')
EverlootPricesDB.realms.bigrealm = { dataAsOf = '2026-10-20T06:30:00.000Z', data = data, sum = Everloot.Adler32(data) }
GetRealmName = function() return 'Bigrealm' end
Everloot:ResetPrices()
timers = {}
assert(#data > 40000, 'the file is large enough to need several frames: ' .. #data)
local first = tooltipFor(7)
assert(first == '', 'until the checksum has passed nothing is shown')
assert(#timers >= 1 and timers[1].seconds == 0, 'the checksum continues on the next frame')
local frames = drain()
assert(frames == math.ceil(#data / 20000) - 1, 'one slice per frame: ' .. frames)
local ready = tooltipFor(7)
assert(ready:find('Everloot market 5s 0c') and ready:find('50 up'), ready)
assert(tooltipFor(3001) == '', 'an id that is not in the file shows nothing, and 7 does not match 70 or 17')
local thin = tooltipFor(2)
assert(thin:find('unrecorded %(thin%)'), thin)

-- A tampered large file never shows, and is reported once checked.
EverlootPricesDB.realms.bigrealm.sum = 5
Everloot:ResetPrices()
printed = {}
tooltipFor(7); drain()
assert(said('checksum') and tooltipFor(7) == '', 'a large file with a bad checksum is refused')
GetRealmName = function() return 'Forever' end
Everloot:ResetPrices()
""")

# Nothing in this addon buys, bids or posts: no trapped API was called by a scan, a timeout, a
# tooltip or any slash command above, and no source file names one.
lua.execute("""
SlashCmdList.EVERLOOT('status')
SlashCmdList.EVERLOOT('scan')
assert(#forbidden == 0, 'forbidden call: ' .. table.concat(forbidden, ','))
""")
import re
names = r"PostItem|PostCommodity|PlaceBid|PlaceAuctionBid|StartAuction|PostAuction|StartCommoditiesPurchase|ConfirmCommoditiesPurchase|BuyoutItem|CancelAuction|CancelCommoditiesPurchase|ClickAuctionSellItemButton"
for source in sorted(root.rglob("*.lua")):
    if "tests" in source.parts:
        continue
    code = "\n".join(line.split("--")[0] for line in source.read_text(encoding="utf-8").splitlines())
    # gold.lua only watches PlaceAuctionBid with hooksecurefunc to record the player's own spending;
    # what must never appear is a call, directly or through pcall.
    called = re.search(rf"\b({names})\s*\(|pcall\(\s*(?:C_AuctionHouse\.)?({names})\b", code)
    assert not called, f"{source.name} calls a buy, bid or post API: {called.group(0)}"
# Every row the addon wrote is a record the site would accept (packages/protocol/schema).
from protocol_schema import check_all  # noqa: E402
check_all(lua)
print("Lua 5.1 market: clicked full scan, chunked reads, retry, parts, cooldown, 3 scans kept, scan timeout, tooltips with sliced checksums, stale and thin labels, no buy or post call")
