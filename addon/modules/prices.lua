-- Everloot prices in item tooltips: the player's own latest full scan, and community market values
-- the companion wrote into the EverlootPrices slot addon (checksummed; they show after /reload).
-- Display only: nothing here talks to the network or acts on the auction house.

local E = Everloot

--- The player's latest full scan on this realm: { at, items = { [itemId] = {id, auctions, quantity, min, value} } }.
function E:OwnScan(realm)
  local last = EverlootDB.lastScans and EverlootDB.lastScans[realm]
  if not last then return nil end
  if E.ownScanCache and E.ownScanCache.scanId == last.scanId then return E.ownScanCache end
  local items = {}
  for _, row in ipairs(EverlootDB.records.auction_snapshot or {}) do
    if row.scanId == last.scanId then
      for _, item in ipairs(row.items) do items[item[1]] = item end
    end
  end
  E.ownScanCache = { scanId = last.scanId, at = last.at, items = items }
  return E.ownScanCache
end

E.THIN_UNITS = 5          -- as kb/src/market.ts: this many units listed or fewer is a thin market
E.STALE_DAYS = 2          -- community prices older than this show a stale marker
local VERIFY_SLICE = 20000 -- checksum characters per frame, so a large price file never stalls the client

--- Days since 1970-01-01 for a "YYYY-MM-DD..." string, or nil. Civil-date arithmetic, no os library.
function E.DayNumber(text)
  local y, m, d = tostring(text):match("^(%d%d%d%d)-(%d%d)-(%d%d)")
  if not y then return nil end
  y, m, d = tonumber(y), tonumber(m), tonumber(d)
  if m <= 2 then y = y - 1 end
  local era = math.floor(y / 400)
  local yoe = y - era * 400
  local doy = math.floor((153 * ((m + 9) % 12) + 2) / 5) + d - 1
  local doe = yoe * 365 + math.floor(yoe / 4) - math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
end

-- Community prices per realm: { status = "verifying" | "ready" | "bad", data, asOf }.
local community = {}

function E:ResetPrices()
  community = {}
end

--- Adler-32 of `data` in slices of VERIFY_SLICE characters, one per frame; `done(ok)` gets the verdict.
--- Same arithmetic as E.Adler32 (the companion's checksum), split so it can pause between frames.
local function verify(data, sum, done)
  local a, b, i, n = 1, 0, 1, #data
  local function slice()
    local last = math.min(n, i + VERIFY_SLICE - 1)
    for k = i, last do
      a = (a + data:byte(k)) % 65521
      b = (b + a) % 65521
    end
    i = last + 1
    if i <= n and C_Timer and C_Timer.After then
      C_Timer.After(0, slice)
    elseif i <= n then
      return slice()
    else
      done(b * 65536 + a == sum)
    end
  end
  slice()
end

--- One realm's price file entry from EverlootPricesDB: "itemId,market,min,historical,quantity,day,reporters;..."
--- with an Adler-32 `sum` over that string. A blank market is unrecorded. The string is searched, not
--- parsed: a tooltip finds its one row, so a large file costs nothing until its checksum has passed.
local function communityFor(realm)
  local key = realm:lower()
  local entry = community[key]
  if entry == nil then
    local realms = type(EverlootPricesDB) == "table" and EverlootPricesDB.realms
    local db = type(realms) == "table" and realms[key]
    if type(db) ~= "table" then
      entry = { status = "bad", silent = true }
    elseif type(db.data) ~= "string" or type(db.sum) ~= "number" then
      entry = { status = "bad" }
      print("Everloot: community prices for " .. realm .. " failed their checksum and are not shown.")
    else
      entry = { status = "verifying", data = ";" .. db.data .. ";", asOf = db.dataAsOf }
      community[key] = entry
      verify(db.data, db.sum, function(ok)
        if community[key] ~= entry then return end -- reset while checking
        entry.status = ok and "ready" or "bad"
        if not ok then
          entry.data = nil
          print("Everloot: community prices for " .. realm .. " failed their checksum and are not shown.")
        end
      end)
    end
    community[key] = entry
  end
  return entry
end

local function communityRow(entry, itemId)
  if entry.status ~= "ready" then return nil end
  local from = entry.data:find(";" .. itemId .. ",", 1, true)
  if not from then return nil end
  local text = entry.data:match("^;([^;]+)", from)
  local id, market, min, historical, quantity, day, reporters =
    text:match("^(%d+),(%d*),(%d+),(%d+),(%d+),([%d%-]+),(%d+)$")
  if not id then return nil end
  return {
    market = tonumber(market), min = tonumber(min), historical = tonumber(historical),
    quantity = tonumber(quantity), day = day, reporters = tonumber(reporters),
  }
end

local function addLines(tooltip, itemId)
  local realm = GetRealmName and GetRealmName()
  if type(realm) ~= "string" or realm == "" then return end
  local entry = communityFor(realm)
  local row = communityRow(entry, itemId)
  if row then
    local market = row.market and E.Coins(row.market)
      or (row.quantity <= E.THIN_UNITS and "unrecorded (thin)" or "unrecorded")
    tooltip:AddLine(string.format("Everloot market %s · min %s · historical %s",
      market, E.Coins(row.min), E.Coins(row.historical)), 0.9, 0.8, 0.5)
    tooltip:AddLine(string.format("  %d up · %d reporters · %s", row.quantity, row.reporters, row.day), 0.6, 0.6, 0.6)
    -- The file is only as fresh as the companion's last run: show its date, and flag it when old.
    local fetched, today = E.DayNumber(entry.asOf or ""), E.DayNumber(date("!%Y-%m-%d"))
    if not fetched or not today then
      tooltip:AddLine("  price data age unknown (stale?)", 1, 0.4, 0.4)
    elseif today - fetched > E.STALE_DAYS then
      tooltip:AddLine(string.format("  STALE: prices from %s; run the companion to refresh", entry.asOf:sub(1, 10)), 1, 0.4, 0.4)
    else
      tooltip:AddLine("  prices fetched " .. entry.asOf:sub(1, 10), 0.6, 0.6, 0.6)
    end
  end
  local own = E:OwnScan(realm)
  local item = own and own.items[itemId]
  if item then
    local hours = math.floor((time() - own.at) / 3600)
    tooltip:AddLine(string.format("Your scan: min %s · value %s · %d up · %s", E.Coins(item[4]), E.Coins(item[5]), item[3],
      hours < 1 and "under 1 h ago" or (hours .. " h ago")), 0.6, 0.8, 1)
  end
end

E:RegisterModule("prices", function()
  if not (TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType) then
    error("tooltip API unavailable", 0)
  end
  if not E.pricesHooked then
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, data)
      if tooltip and tooltip.AddLine and type(data) == "table" and type(data.id) == "number" then
        pcall(addLines, tooltip, data.id)
      end
    end)
    E.pricesHooked = true
  end
  return "ready (prices in item tooltips; community prices after the companion writes them and /reload)"
end)
