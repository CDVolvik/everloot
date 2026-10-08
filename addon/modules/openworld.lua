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
  local where = mapPosition()
  if not where or not where.x or not where.y then return end
  local reaction = "neutral"
  if UnitIsFriend("player", unit) then reaction = "friendly"
  elseif UnitCanAttack("player", unit) then reaction = "hostile" end
  E:Store("npc_sighting", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    npcId = npcId, name = name,
    mapId = where.mapId, x = where.x, y = where.y, positionKind = "player",
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
  -- Source pairs are GUID, quantity, GUID, quantity. Never infer loot from the target.
  if not (GetLootSourceInfo and GetLootSlotInfo and GetLootSlotLink) then return end
  EverlootDB.lootSources = EverlootDB.lootSources or {}
  local groups = {}
  local n = GetNumLootItems and GetNumLootItems() or 0
  for i = 1, math.min(n, 50) do
    local okLink, link = pcall(GetLootSlotLink, i)
    local okInfo, _, _, count = pcall(GetLootSlotInfo, i)
    if not okLink or not okInfo or type(link) ~= "string" then link = nil end
    local itemId = link and tonumber(link:match("item:(%d+)"))
    if itemId and type(count) == "number" and count > 0 then
      local sources = { pcall(GetLootSourceInfo, i) }
      if sources[1] then
        for j = 2, #sources, 2 do
          local guid, quantity = sources[j], sources[j + 1]
          local npcId = npcIdFromGuid(guid)
          local objectId = type(guid) == "string" and guid:match("^GameObject%-%d+%-%d+%-%d+%-%d+%-(%d+)%-")
          if (npcId or objectId) and type(quantity) == "number" and quantity >= 1
            and quantity <= 1000 and quantity == math.floor(quantity) then
            local group = groups[guid] or { sourceNpcId = npcId, sourceObjectId = tonumber(objectId), items = {} }
            group.items[#group.items + 1] = { itemId = itemId, count = quantity }
            groups[guid] = group
          end
        end
      end
      rememberItem(itemId)
    end
  end
  for guid, group in pairs(groups) do
    if not EverlootDB.lootSources[guid] then
      group.installId = EverlootDB.installId
      group.capturedAt = date("!%Y-%m-%dT%H:%M:%SZ")
      group.sourceEvidence = "loot-api"
      if E:Store("loot", group) then
        -- Local-only corpse identity: retained across reloads, never exported as a row.
        -- Bounded by the same retained loot-row capacity; failures do not mark seen.
        EverlootDB.lootSources[guid] = true
      end
    end
  end
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
