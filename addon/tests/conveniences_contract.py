"""Run with: uv run --with lupa --with jsonschema python addon/tests/conveniences_contract.py

Two chores, both off until switched on. At a merchant: sell grey items only and repair with the player's
own gold (never the guild bank). At the mailbox: Collect all takes money and items from auction invoices,
skipping cash on delivery and every letter without an auction invoice, one take at a time, and stops when
the bags are full. The gold module's vendor and auction-sale records stay correct, repairs stay unrecorded,
and no other player's name reaches a record.
"""
import re
from pathlib import Path
from lupa.lua51 import LuaRuntime

root = Path(__file__).parents[1]

WORLD = """
date = function() return '2026-10-23T00:00:00Z' end
time = function() return 1000 end
printed = {}
print = function(msg) printed[#printed + 1] = tostring(msg) end
SlashCmdList = {}
local Frame = {}
Frame.__index = function(self, key) return rawget(Frame, key) or function() end end
function Frame.SetScript(self, name, f) self.scripts[name] = f; if name == 'OnEvent' then self.onEvent = f end end
function Frame.HookScript(self, _, f) table.insert(self.hooks, f) end
function Frame.SetText(self, t) self.text = t end
function Frame.Show(self) self.shown = true end
function Frame.Hide(self) self.shown = false end
CreateFrame = function(kind, name)
  return setmetatable({ kind = kind, name = name, scripts = {}, hooks = {} }, Frame)
end
InboxFrame = CreateFrame('Frame', 'InboxFrame')
UnitName = function() return 'Thrall' end
GetRealmName = function() return 'Test Realm' end
NUM_BAG_SLOTS = 1
money = 100000
GetMoney = function() return money end
hooksecurefunc = function(name, after)
  local original = _G[name]
  _G[name] = function(...) original(...); after(...) end
end
-- Timers run only when the test says so; the server's replies (gold changes) only when it flushes them.
timers = {}
C_Timer = { After = function(seconds, f) table.insert(timers, f) end }
function runTimers() local list = timers; timers = {}; for _, f in ipairs(list) do f() end end
server = {}
function flush()
  local list = server; server = {}
  for _, f in ipairs(list) do f() end
end
function fire(name, ...)
  for _, hook in ipairs(Everloot.frame.hooks) do hook(nil, name, ...) end
end
function drive() for _ = 1, 60 do flush(); runTimers() end end
-- A change in the purse reaches the addon later, as an event.
function pay(delta) server[#server + 1] = function() money = money + delta; fire('PLAYER_MONEY') end end
"""

VENDOR = """
-- bag -> slot -> item. A grey is quality 0.
bags = {
  [0] = {
    { quality = 0, count = 3, link = 'grey-a', price = 10 },
    { quality = 1, count = 1, link = 'white', price = 50 },
    { quality = 0, count = 1, link = 'grey-novalue', price = 0, noValue = true },
    { quality = 2, count = 1, link = 'green', price = 90 },
  },
  [1] = { { quality = 0, count = 1, link = 'grey-b', price = 5 } },
}
prices = {}
for _, bag in pairs(bags) do for _, item in pairs(bag) do prices[item.link] = item.price end end
GetItemInfo = function(link) return 'n', link, 0, 1, 1, 't', 'st', 1, '', 1, prices[link] end
sold = {}
local function use(bag, slot)
  local item = bags[bag] and bags[bag][slot]
  sold[#sold + 1] = item and item.link or '?'
  if item then pay(item.price * item.count); bags[bag][slot] = nil end
end
if MODERN then
  C_Container = {
    GetContainerNumSlots = function(bag) return 4 end,
    GetContainerItemInfo = function(bag, slot)
      local i = bags[bag] and bags[bag][slot]
      if not i then return nil end
      return { quality = i.quality, stackCount = i.count, hyperlink = i.link, hasNoValue = i.noValue }
    end,
    UseContainerItem = use,
  }
else
  GetContainerNumSlots = function() return 4 end
  GetContainerItemInfo = function(bag, slot)
    local i = bags[bag] and bags[bag][slot]
    if not i then return nil end
    return 'icon', i.count, false, i.quality, false, false, i.link, false, i.noValue
  end
  UseContainerItem = use
end
repairCost = 400
repairCalls = {}
CanMerchantRepair = function() return true end
GetRepairAllCost = function() return repairCost, true end
RepairAllItems = function(guild)
  repairCalls[#repairCalls + 1] = guild
  pay(-repairCost)
end
"""

MAIL = """
inbox = {
  -- 1: a sold auction (the letter pays sale minus cut plus the returned deposit)
  { invoice = 'seller', buyer = 'Jaina', money = 3000, bid = 2900, deposit = 250, cut = 150, sender = 'Auction House' },
  -- 2: a player's letter with gold, no invoice
  { money = 700, sender = 'Jaina' },
  -- 3: cash on delivery, an item
  { cod = 500, item = true, sender = 'Jaina' },
  -- 4: a won auction: an item, an invoice
  { invoice = 'buyer', buyer = 'Jaina', item = true, sender = 'Auction House' },
  -- 5: another sold auction
  { invoice = 'seller', buyer = 'Jaina', money = 900, bid = 900, deposit = 45, cut = 45, sender = 'Auction House' },
  -- 6: an auction invoice that also demands cash on delivery: not taken either
  { invoice = 'buyer', cod = 100, item = true, sender = 'Auction House' },
}
free = 5
taken = {}
GetInboxNumItems = function() return #inbox end
GetInboxHeaderInfo = function(i)
  local m = inbox[i]
  if not m then return nil end
  return 'icon', 'paper', m.sender, 'subject', m.money or 0, m.cod or 0, 20, m.item and 1 or nil
end
GetInboxInvoiceInfo = function(i)
  local m = inbox[i]
  if not m or not m.invoice then return nil end
  return m.invoice, 'Silk', m.buyer, m.bid, m.bid, m.deposit, m.cut
end
GetContainerNumFreeSlots = function(bag) if bag == 0 then return free, 0 end return 0, 0 end
TakeInboxMoney = function(i)
  taken[#taken + 1] = 'money' .. i
  local m = inbox[i]
  -- The letter keeps showing its money until the server answers, as the client does.
  local amount = m.money
  server[#server + 1] = function() m.money = nil; money = money + amount; fire('PLAYER_MONEY') end
end
AutoLootMailItem = function(i)
  taken[#taken + 1] = 'item' .. i
  inbox[i].item = nil
  free = free - 1
end
"""


def fresh(modern=True, extra=""):
    lua = LuaRuntime()
    lua.execute(WORLD)
    lua.execute(f"MODERN = {'true' if modern else 'false'}")
    lua.execute(VENDOR)
    lua.execute(MAIL)
    lua.execute(extra)
    for file in ["core.lua", "modules/gold.lua", "modules/conveniences.lua"]:
        lua.execute((root / file).read_text(encoding="utf-8"))
    lua.execute("Everloot.frame.onEvent(nil, 'ADDON_LOADED', 'Everloot'); fire('PLAYER_ENTERING_WORLD')")
    return lua


COMMON = """
function events(category)
  local list = {}
  for _, row in ipairs(EverlootDB.records.money_event or {}) do
    if category == nil or row.category == category then list[#list + 1] = row end
  end
  return list
end
function said(text)
  for _, line in ipairs(printed) do if string.find(line, text, 1, true) then return true end end
  return false
end
"""

for modern in (True, False):
    lua = fresh(modern)
    lua.execute(COMMON)
    lua.execute("""
    -- Both chores are off in a new install: a merchant and a mailbox change nothing, the button is hidden.
    assert(EverlootDB.autoVendor ~= true and EverlootDB.mailCollect ~= true, 'both off by default')
    fire('MERCHANT_SHOW'); drive(); fire('MERCHANT_CLOSED')
    assert(#sold == 0 and #repairCalls == 0, 'off: nothing sold, nothing repaired')
    fire('MAIL_SHOW')
    assert(InboxFrame ~= nil and Everloot.Conveniences.button.shown == false, 'off: the button is hidden')
    Everloot.Conveniences.button.scripts.OnClick(); drive()
    assert(#taken == 0, 'off: a click takes nothing')

    -- On: only greys with a vendor price are sold, in every bag.
    SlashCmdList.EVERLOOT('vendor on')
    assert(EverlootDB.autoVendor == true)
    fire('MERCHANT_SHOW')
    runTimers()
    table.sort(sold)
    assert(table.concat(sold, ',') == 'grey-a,grey-b', 'greys only, got ' .. table.concat(sold, ','))
    assert(bags[0][2] and bags[0][4] and bags[0][3], 'white, green and the no-value grey stay')
    -- The repair waits for the sales' gold change, so one change cannot hide the other.
    assert(#repairCalls == 0, 'repair waits for the sale to reach the ledger')
    flush(); runTimers()
    assert(#repairCalls == 1 and repairCalls[1] == false, 'repair once, never from the guild bank')
    flush()
    -- The ledger: the sales are vendor income (35 copper); the repair is not recorded at all.
    local vendor = events('vendor')
    local total = 0
    for _, row in ipairs(vendor) do total = total + row.copper end
    assert(total == 35, 'vendor sales recorded in full, got ' .. total)
    assert(#events() == #vendor, 'the repair is not recorded as anything')
    assert(said('sold 2 grey items for 35c') and said('repaired for 4s 0c'), 'one summary line: ' .. table.concat(printed, ' | '))
    fire('MERCHANT_CLOSED')

    -- Nothing to sell: the repair runs at once. A repair the purse cannot pay is not attempted.
    printed = {}
    fire('MERCHANT_SHOW'); runTimers(); flush()
    assert(#repairCalls == 2 and #events() == #vendor, 'repair alone, still unrecorded')
    fire('MERCHANT_CLOSED')
    repairCost = money + 1
    fire('MERCHANT_SHOW'); runTimers(); flush()
    assert(#repairCalls == 2, 'no repair above the purse')
    fire('MERCHANT_CLOSED')

    -- A merchant closed before the timer runs: nothing happens.
    repairCost = 400
    SlashCmdList.EVERLOOT('vendor off')
    assert(EverlootDB.autoVendor == false)
    fire('MERCHANT_SHOW'); fire('MERCHANT_CLOSED'); runTimers(); flush()
    assert(#repairCalls == 2)
    """)

# --- Mailbox ---
lua = fresh(True)
lua.execute(COMMON)
lua.execute("""
SlashCmdList.EVERLOOT('mail on')
assert(EverlootDB.mailCollect == true)
fire('MAIL_SHOW')
local button = Everloot.Conveniences.button
assert(button.shown == true and button.text == 'Collect all')
button.scripts.OnClick()
assert(button.text == 'Stop', 'a run can be stopped')
-- One take, then it waits: the next take does not happen until the gold change arrived.
assert(#taken == 1 and taken[1] == 'money5', 'last letter first, one take at a time, got ' .. table.concat(taken, ','))
runTimers()
assert(#taken == 1, 'it waits for the gold change')
flush()
drive()
assert(table.concat(taken, ',') == 'money5,item4,money1', 'only auction invoices without cash on delivery: ' .. table.concat(taken, ','))
assert(inbox[2].money == 700 and inbox[3].item and inbox[6].item, 'player mail and COD letters untouched')
assert(button.text == 'Collect all', 'finished')
assert(said('3 skipped') and said('from 3 letters') and said('39s 0c'), table.concat(printed, ' | '))

-- The ledger: each sale is the invoice's price minus the house cut; the deposit is not income.
local sales = events('auction')
assert(#sales == 2 and sales[1].copper == 855 and sales[2].copper == 2750, 'two auction sales net of the cut, got ' .. #sales)
assert(#events() == 2, 'nothing else recorded')
-- Other players: no sender or buyer name is stored anywhere.
local function scan(value)
  if type(value) == 'table' then for _, v in pairs(value) do scan(v) end
  else assert(value ~= 'Jaina' and value ~= 'Auction House', 'a mail name reached the file') end
end
scan(EverlootDB.records)

-- Bags full: it stops before taking an item, and says so.
printed = {}
inbox = { { invoice = 'buyer', buyer = 'Jaina', item = true, sender = 'Auction House' } }
taken = {}
free = 0
button.scripts.OnClick(); drive()
assert(#taken == 0 and said('bags full'), 'no item taken with the bags full: ' .. table.concat(printed, ' | '))

-- A letter whose invoice cannot be read is skipped, never guessed at.
printed = {}
free = 5
inbox = { { money = 50, sender = 'Auction House' } }
button.scripts.OnClick(); drive()
assert(#taken == 0 and said('1 skipped'))

-- The mailbox closing stops a run.
inbox = { { invoice = 'seller', buyer = 'Jaina', money = 500, bid = 500, deposit = 0, cut = 0 }, { invoice = 'seller', buyer = 'Jaina', money = 600, bid = 600, deposit = 0, cut = 0 } }
taken = {}
button.scripts.OnClick()
assert(#taken == 1)
fire('MAIL_CLOSED'); flush(); drive()
assert(#taken == 1 and button.text == 'Collect all', 'closing the mailbox stops it')
""")

from protocol_schema import check_all  # noqa: E402
check_all(lua)

# The source never takes the guild bank's side, never writes a record, never reads a letter's text or sender.
code = "\n".join(line.split("--")[0] for line in (root / "modules" / "conveniences.lua").read_text(encoding="utf-8").splitlines())
for pattern in [r"RepairAllItems\(\s*(true|1)\b", r"E:Store|\.records", r"GetInboxText", r"GuildBank|guildBank", r"TakeInboxItem"]:
    assert not re.search(pattern, code), f"conveniences.lua has {pattern}"
print("Lua 5.1 conveniences: both off by default; greys only sold; own-gold repair after the sales are recorded; "
      "mail takes auction invoices only, skips COD, one take at a time, stops on full bags; gold ledger and privacy intact")
