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

-- Community prices per realm, parsed on first use: a table, or false after a failed checksum.
local community = {}

function E:ResetPrices()
  community = {}
end

--- One realm's rows from EverlootPricesDB: "itemId,market,min,historical,quantity,day,reporters;..."
--- with an Adler-32 `sum` over that string. A blank market is unrecorded.
local function communityFor(realm)
  local key = realm:lower()
  if community[key] ~= nil then return community[key] or nil end
  local realms = type(EverlootPricesDB) == "table" and EverlootPricesDB.realms
  local db = type(realms) == "table" and realms[key]
  local parsed = false
  if type(db) == "table" and type(db.data) == "string" and db.sum == E.Adler32(db.data) then
    parsed = {}
    for entry in db.data:gmatch("[^;]+") do
      local id, market, min, historical, quantity, day, reporters =
        entry:match("^(%d+),(%d*),(%d+),(%d+),(%d+),([%d%-]+),(%d+)$")
      if id then
        parsed[tonumber(id)] = {
          market = tonumber(market), min = tonumber(min), historical = tonumber(historical),
          quantity = tonumber(quantity), day = day, reporters = tonumber(reporters),
        }
      end
    end
  elseif type(db) == "table" then
    print("Everloot: community prices for " .. realm .. " failed their checksum and are not shown.")
  end
  community[key] = parsed
  return parsed or nil
end

local function addLines(tooltip, itemId)
  local realm = GetRealmName and GetRealmName()
  if type(realm) ~= "string" or realm == "" then return end
  local row = (communityFor(realm) or {})[itemId]
  if row then
    tooltip:AddLine(string.format("Everloot market %s · min %s · historical %s",
      row.market and E.Coins(row.market) or "unrecorded", E.Coins(row.min), E.Coins(row.historical)), 0.9, 0.8, 0.5)
    tooltip:AddLine(string.format("  %d up · %d reporters · %s", row.quantity, row.reporters, row.day), 0.6, 0.6, 0.6)
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
