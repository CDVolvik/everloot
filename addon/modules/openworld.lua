-- Everloot open-world collector: NPC sightings, loot windows, quests, vendors, items seen.
-- Anonymous by design: no character or guild names, no chat. Matches the intake contract
-- (web/src/lib/intake.ts kinds: npc_sighting, loot, quest, vendor, item_seen).

local E = Everloot

local function mapPosition()
  if C_Map and C_Map.GetPlayerMapPosition and C_Map.GetBestMapForUnit then
    local mapId = C_Map.GetBestMapForUnit("player")
    if not mapId then return nil end
    local pos = C_Map.GetPlayerMapPosition(mapId, "player")
    if not pos then return { mapId = mapId } end
    return { mapId = mapId, x = pos.x * 100, y = pos.y * 100 }
  end
  return nil
end

local function npcIdFromGuid(guid)
  if type(guid) ~= "string" then return nil end
  -- Creature GUID: 0x...-CreatureType-...-NPCID-... — the 6th segment is the NPC id.
  local parts = {}
  for p in guid:gmatch("[^-]+") do parts[#parts + 1] = p end
  if parts[1] == "Creature" or parts[1] == "Vehicle" then
    return tonumber(parts[6])
  end
  return nil
end

local function targetSighting(unit)
  local guid = UnitGUID(unit)
  local npcId = npcIdFromGuid(guid)
  if not npcId then return end
  local name = UnitName(unit)
  local level = UnitLevel(unit)
  if not name or not level or level < 1 then return end
  local where = mapPosition() or {}
  local reaction = "neutral"
  if UnitIsFriend("player", unit) then reaction = "friendly"
  elseif UnitCanAttack("player", unit) then reaction = "hostile" end
  E:Store("npc_sighting", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    npcId = npcId, name = name,
    mapId = where.mapId or 0, x = where.x or 0, y = where.y or 0,
    level = level, reaction = reaction,
  })
end

local QUALITY = {
  [0] = "poor", [1] = "common", [2] = "uncommon", [3] = "rare",
  [4] = "epic", [5] = "legendary", [6] = "artifact", [7] = "heirloom",
}

local function rememberItem(itemId)
  if not GetItemInfo then return end
  local name, _, quality = GetItemInfo(itemId)
  local label = QUALITY[quality]
  if not name or not label then return end
  E:Store("item_seen", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    itemId = itemId, name = name, quality = label,
  })
end

local function lootCapture()
  local items = {}
  local n = GetNumLootItems and GetNumLootItems() or 0
  for i = 1, math.min(n, 50) do
    local link = GetLootSlotLink and GetLootSlotLink(i)
    local _, _, count = GetLootSlotInfo and GetLootSlotInfo(i)
    local itemId = link and tonumber(link:match("item:(%d+)"))
    if itemId then
      items[#items + 1] = { itemId = itemId, count = count or 1 }
      rememberItem(itemId)
    end
  end
  local sourceNpcId = npcIdFromGuid(UnitGUID("target"))
  -- No source and no items is not a kill. An empty window with a source is a measured 0.
  if #items == 0 and not sourceNpcId then return end
  E:Store("loot", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    sourceNpcId = sourceNpcId,
    items = items,
  })
end

local function vendorCapture()
  if not GetMerchantNumItems or not GetMerchantItemLink or not GetMerchantItemInfo then return end
  local vendorNpcId = npcIdFromGuid(UnitGUID("npc")) or npcIdFromGuid(UnitGUID("target"))
  if not vendorNpcId then return end
  local okCount, count = pcall(GetMerchantNumItems)
  if not okCount or type(count) ~= "number" or count < 1 then return end
  local items = {}
  for i = 1, math.min(count, 200) do
    local okLink, link = pcall(GetMerchantItemLink, i)
    local itemId = okLink and type(link) == "string" and tonumber(link:match("item:(%d+)"))
    if itemId then
      local okInfo, _, _, price, _, stock = pcall(GetMerchantItemInfo, i)
      if okInfo and type(price) == "number" and price >= 0 and price == math.floor(price) then
        local row = { itemId = itemId, priceCopper = price }
        if type(stock) == "number" and stock > 0 and stock == math.floor(stock) then
          row.limitedStock = stock
        end
        items[#items + 1] = row
        rememberItem(itemId)
      end
    end
  end
  if #items == 0 then return end
  E:Store("vendor", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    vendorNpcId = vendorNpcId,
    items = items,
  })
end

E:RegisterModule("openworld", function()
  local f = E.frame
  f:RegisterEvent("PLAYER_TARGET_CHANGED")
  f:RegisterEvent("UPDATE_MOUSEOVER_UNIT")
  f:RegisterEvent("LOOT_OPENED")
  -- MERCHANT_SHOW is an old client event. A missing event disables the hook.
  pcall(function() f:RegisterEvent("MERCHANT_SHOW") end)
  f:HookScript("OnEvent", function(_, event, ...)
    if event == "PLAYER_TARGET_CHANGED" then targetSighting("target")
    elseif event == "UPDATE_MOUSEOVER_UNIT" then targetSighting("mouseover")
    elseif event == "LOOT_OPENED" then lootCapture()
    elseif event == "MERCHANT_SHOW" then vendorCapture() end
  end)
  -- Quest capture stays off. The intake requires a real level, and this client has no honest level call to store.
  return "ready (target/mouseover/loot/merchant; quest capture still waits on a real level)"
end)
