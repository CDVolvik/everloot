-- Everloot auction collector. Off unless the player enables the auctions toggle.
-- Forever (C_AuctionHouse): a full scan the player starts with the "Everloot scan" button or
-- /everloot scan while the auction house is open. Clients with the older API: buyouts from the
-- list the player already opened. No external price feed. Nothing here posts, bids or buys.
-- Copper is per unit: a stack's buyout divided by its size. Bid-only listings have no price.

local E = Everloot

E.SCAN_CHUNK = 1000       -- replicate rows read per frame, so a large house does not stall the client
E.SCAN_COOLDOWN = 900     -- seconds between full scans: Retail's limit; Forever's is unverified
E.SCAN_PART_ITEMS = 1000  -- items per auction_snapshot record, the intake maximum
E.SCANS_KEPT = 3          -- full scans kept per realm in SavedVariables
E.SCAN_WAIT_SECONDS = 30  -- how long a scan waits for REPLICATE_ITEM_LIST_UPDATE before giving up
local RETRY_SECONDS = 2   -- one more read for rows whose item data had not loaded

local function say(msg)
  print("Everloot: " .. msg)
  return msg
end

-- Older clients: the 50 rows of the list the player opened.
local function scanList()
  if not (GetNumAuctionItems and GetAuctionItemLink and GetAuctionItemInfo and GetRealmName) then
    return "auction API unavailable"
  end
  local realm = GetRealmName()
  if type(realm) ~= "string" or #realm < 2 then return "no realm" end
  local n = GetNumAuctionItems("list")
  if type(n) ~= "number" or n < 1 then return "empty list" end
  local stored = 0
  for i = 1, math.min(n, 50) do
    local link = GetAuctionItemLink("list", i)
    local itemId = link and tonumber(link:match("item:(%d+)"))
    local _, _, count, _, _, _, _, _, _, buyout = GetAuctionItemInfo("list", i)
    if itemId and type(count) == "number" and count >= 1 and type(buyout) == "number" and buyout > 0 then
      count = math.floor(count)
      E:Store("auction_scan", {
        installId = EverlootDB.installId,
        capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
        realm = realm, itemId = itemId, count = count,
        copper = math.floor(buyout / count), priceBasis = "unit",
      })
      stored = stored + 1
    end
  end
  return "stored " .. stored
end

--- Scan value for one item: the unit-weighted mean price of the cheapest quarter of its units,
--- and never less than the whole cheapest listing. `listings` is { {unitCopper, count}, ... }.
--- Returns auctions, quantity, minUnit, marketUnit.
function E.ScanSummary(listings)
  table.sort(listings, function(a, b) return a[1] < b[1] end)
  local quantity = 0
  for _, l in ipairs(listings) do quantity = quantity + l[2] end
  local target = math.max(listings[1][2], math.ceil(quantity / 4))
  local units, spent = 0, 0
  for _, l in ipairs(listings) do
    if units >= target then break end
    local take = math.min(l[2], target - units)
    units, spent = units + take, spent + take * l[1]
  end
  return #listings, quantity, listings[1][1], math.floor(spent / units + 0.5)
end

local scan -- the full scan in progress, or nil

--- Clears a scan that never got its data and gives the cooldown back.
local function refundWaitingScan()
  EverlootDB.lastScanAt = scan.previousScanAt
  scan = nil
end

--- One replicate row into the scan: "ok", "skip" (no price, bad size) or "incomplete" (data not loaded).
local function readRow(i)
  local _, _, count, _, _, _, _, _, _, buyout, _, _, _, _, _, _, itemId, hasAllInfo = C_AuctionHouse.GetReplicateItemInfo(i)
  if type(itemId) ~= "number" or type(count) ~= "number" or type(buyout) ~= "number" then
    return hasAllInfo == false and "incomplete" or "skip"
  end
  if count < 1 or buyout <= 0 then return "skip" end
  count = math.floor(count)
  -- A buyout below its stack size is under 1 copper a unit: not a price.
  local unitPrice = math.floor(buyout / count)
  if unitPrice < 1 then return "skip" end
  local list = scan.byItem[itemId]
  if not list then list = {}; scan.byItem[itemId] = list end
  list[#list + 1] = { unitPrice, count }
  return "ok"
end

--- Keep the newest E.SCANS_KEPT scans of this realm; older parts leave SavedVariables.
local function pruneScans(realm)
  local rows = EverlootDB.records.auction_snapshot or {}
  local order, seen = {}, {}
  for _, r in ipairs(rows) do
    if r.realm == realm and not seen[r.scanId] then seen[r.scanId] = true; order[#order + 1] = r.scanId end
  end
  if #order <= E.SCANS_KEPT then return end
  local drop = {}
  for i = 1, #order - E.SCANS_KEPT do drop[order[i]] = true end
  local kept = {}
  for _, r in ipairs(rows) do if not drop[r.scanId] then kept[#kept + 1] = r end end
  EverlootDB.records.auction_snapshot = kept
end

local function finish()
  local s = scan
  scan = nil
  local ids = {}
  for id in pairs(s.byItem) do ids[#ids + 1] = id end
  table.sort(ids)
  if #ids == 0 then return say("the scan found no buyouts.") end
  local parts = math.ceil(#ids / E.SCAN_PART_ITEMS)
  local scanId = EverlootDB.installId .. "-" .. string.format("%.0f", s.startedAt)
  for p = 1, parts do
    local items = {}
    for k = (p - 1) * E.SCAN_PART_ITEMS + 1, math.min(#ids, p * E.SCAN_PART_ITEMS) do
      local auctions, quantity, minUnit, marketUnit = E.ScanSummary(s.byItem[ids[k]])
      items[#items + 1] = { ids[k], auctions, quantity, minUnit, marketUnit }
    end
    if not E:Store("auction_snapshot", {
      installId = EverlootDB.installId, capturedAt = s.at, realm = s.realm,
      scanId = scanId, part = p, parts = parts, items = items,
    }) then
      return say("the scan could not be stored. Upload your file with the companion, then scan again.")
    end
  end
  pruneScans(s.realm)
  EverlootDB.lastScans = EverlootDB.lastScans or {}
  EverlootDB.lastScans[s.realm] = { scanId = scanId, at = s.startedAt }
  E.ownScanCache = nil
  return say(string.format("scanned %d items on %s (%d rows skipped, %d not loaded). Upload with the companion.",
    #ids, s.realm, s.skipped, s.incomplete))
end

--- An unexpected row shape stops the scan with a message instead of a Lua error.
local function guarded(fn)
  return function()
    local ok, err = pcall(fn)
    if not ok then
      scan = nil
      say("the scan stopped on an unexpected row (" .. tostring(err) .. ").")
    end
  end
end

local retryIncomplete = guarded(function()
  if not scan then return end
  for _, i in ipairs(scan.retry) do
    if readRow(i) ~= "ok" then scan.incomplete = scan.incomplete + 1 end
  end
  finish()
end)

local safeStep
safeStep = guarded(function()
  if not scan then return end
  local last = math.min(scan.total, scan.next + E.SCAN_CHUNK - 1)
  for i = scan.next, last do
    local result = readRow(i)
    if result == "incomplete" then scan.retry[#scan.retry + 1] = i
    elseif result == "skip" then scan.skipped = scan.skipped + 1 end
  end
  scan.next = last + 1
  if scan.next <= scan.total then C_Timer.After(0, safeStep)
  elseif #scan.retry > 0 then C_Timer.After(RETRY_SECONDS, retryIncomplete)
  else finish() end
end)

function E:StartScan()
  if not (C_AuctionHouse and C_AuctionHouse.ReplicateItems and C_Timer) then return say("full scans need the auction house API.") end
  if not E:IsEnabled("auctions") then return say("auction scans are off. /everloot auctions on, then /reload.") end
  if not E.auctionHouseOpen then return say("open the auction house first.") end
  if scan then return say("a scan is already running.") end
  local wait = (EverlootDB.lastScanAt or 0) + E.SCAN_COOLDOWN - time()
  if wait > 0 then return say(string.format("next full scan in %d min.", math.ceil(wait / 60))) end
  local realm = GetRealmName and GetRealmName()
  if type(realm) ~= "string" or #realm < 2 then return say("no realm name.") end
  local started = {
    realm = realm, startedAt = time(), at = date("!%Y-%m-%dT%H:%M:%SZ"), waiting = true,
    byItem = {}, retry = {}, skipped = 0, incomplete = 0, next = 1, total = 0,
    previousScanAt = EverlootDB.lastScanAt,
  }
  scan = started
  EverlootDB.lastScanAt = time()
  C_AuctionHouse.ReplicateItems()
  -- If the house never answers, the scan must not stay "running" and the cooldown is not spent.
  C_Timer.After(E.SCAN_WAIT_SECONDS, function()
    if scan == started and started.waiting then
      refundWaitingScan()
      say("the auction house sent no data. Try the scan again.")
    end
  end)
  return say("scanning the auction house. Keep it open until the scan reports.")
end

local function addButton()
  if E.scanButton or not AuctionHouseFrame then return end
  local button = CreateFrame("Button", "EverlootScanButton", AuctionHouseFrame, "UIPanelButtonTemplate")
  button:SetSize(120, 22)
  -- Placement still needs checking in the Forever client.
  button:SetPoint("TOPRIGHT", AuctionHouseFrame, "TOPRIGHT", -30, -28)
  button:SetText("Everloot scan")
  button:SetScript("OnClick", function() E:StartScan() end)
  E.scanButton = button
end

local function onFullScanEvent(event, arg1)
  if event == "AUCTION_HOUSE_SHOW" then
    E.auctionHouseOpen = true
    addButton()
  elseif event == "AUCTION_HOUSE_CLOSED" then
    E.auctionHouseOpen = false
    if scan then
      if scan.waiting then refundWaitingScan() else scan = nil end
      say("scan stopped: the auction house closed.")
    end
  elseif event == "ADDON_LOADED" and arg1 == "Blizzard_AuctionHouseUI" then
    addButton()
  elseif event == "REPLICATE_ITEM_LIST_UPDATE" and scan and scan.waiting then
    scan.waiting = false
    scan.total = C_AuctionHouse.GetNumReplicateItems() or 0
    safeStep()
  end
end

E:RegisterModule("auctions", function()
  local f = E.frame
  if C_AuctionHouse and C_AuctionHouse.ReplicateItems then
    if not E.fullScanHooked then
      for _, event in ipairs({ "AUCTION_HOUSE_SHOW", "AUCTION_HOUSE_CLOSED", "ADDON_LOADED", "REPLICATE_ITEM_LIST_UPDATE" }) do
        f:RegisterEvent(event)
      end
      f:HookScript("OnEvent", function(_, event, arg1) onFullScanEvent(event, arg1) end)
      E.fullScanHooked = true
    end
    addButton()
    return "ready (full scan: the Everloot scan button or /everloot scan at the auction house)"
  end
  if not GetNumAuctionItems then error("auction API unavailable", 0) end
  f:RegisterEvent("AUCTION_ITEM_LIST_UPDATE")
  f:HookScript("OnEvent", function(_, event)
    if event == "AUCTION_ITEM_LIST_UPDATE" then pcall(scanList) end
  end)
  return "ready (buyouts from the list the player opened)"
end)
