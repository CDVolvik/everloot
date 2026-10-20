-- Everloot open-world collector: NPC sightings, loot windows, quests, vendors, items seen.
-- Anonymous by design: no character or guild names, no chat. Matches the intake contract
-- (web/src/lib/intake.ts kinds: npc_sighting, loot, quest, vendor, item_seen).
-- NPC type, rank and a quest's category, group size, tag and faction are game facts about the NPC or quest.
-- The faction is the accepting character's side only; no character name is read or stored.

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

-- The English creature types the protocol accepts. A localized client names them in its own language and
-- they do not match, so no type is recorded there rather than a guess.
local CREATURE_TYPES = {}
for _, t in ipairs({ "Beast", "Dragonkin", "Demon", "Elemental", "Giant", "Undead", "Humanoid", "Critter",
  "Mechanical", "Not specified", "Totem", "Non-combat Pet", "Gas Cloud" }) do CREATURE_TYPES[t] = true end

-- UnitClassification: trivial and minus are left out, they are not ranks a player looks up.
local RANKS = { normal = "normal", elite = "elite", rare = "rare", rareelite = "rare_elite", worldboss = "boss" }

local function creatureTraits(unit)
  local creatureType, rank
  if UnitCreatureType then
    local ok, t = pcall(UnitCreatureType, unit)
    if ok and type(t) == "string" and CREATURE_TYPES[t] then creatureType = t end
  end
  if UnitClassification then
    local ok, c = pcall(UnitClassification, unit)
    if ok and type(c) == "string" then rank = RANKS[c] end
  end
  return creatureType, rank
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
  local creatureType, rank = creatureTraits(unit)
  E:Store("npc_sighting", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    npcId = npcId, name = name,
    mapId = where.mapId, x = where.x, y = where.y, positionKind = "player",
    level = level, reaction = reaction,
    creatureType = creatureType, rank = rank,
  })
end

-- Quest tags by the game's own Enum.QuestTag names; a client without the enum records no tag.
local function questTag(questId)
  local info = C_QuestLog and C_QuestLog.GetQuestTagInfo
  local tags = Enum and Enum.QuestTag
  if not info or not tags then return nil end
  local ok, tagInfo = pcall(info, questId)
  local id = ok and type(tagInfo) == "table" and tagInfo.tagID
  if not id then return nil end
  if id == tags.Dungeon then return "dungeon" end
  if id == tags.Raid then return "raid" end
  if id == tags.PvP then return "pvp" end
  if id == tags.Group then return "group" end
  return nil
end

-- A quest the character just accepted, read from its own quest log row. Level is the quest's level as the log
-- shows it; a row that is not this quest, or has no real level, records nothing.
local function questCapture(index, questId)
  if not GetQuestLogTitle or type(index) ~= "number" or type(questId) ~= "number" then return end
  local faction = UnitFactionGroup and UnitFactionGroup("player")
  faction = faction == "Alliance" and "alliance" or faction == "Horde" and "horde" or nil
  EverlootDB.questSeen = EverlootDB.questSeen or {}
  local seenKey = tostring(questId) .. ":" .. tostring(faction)
  if EverlootDB.questSeen[seenKey] then return end
  local ok, title, level, group, isHeader, _, _, _, logId = pcall(GetQuestLogTitle, index)
  if not ok or isHeader or logId ~= questId or type(title) ~= "string" or title == "" then return end
  if type(level) ~= "number" or level < 1 or level ~= math.floor(level) then return end
  -- The category is the nearest header above the quest in the log.
  local category
  for i = index - 1, 1, -1 do
    local okRow, name, _, _, header = pcall(GetQuestLogTitle, i)
    if okRow and header and type(name) == "string" and name ~= "" then category = name:sub(1, 60); break end
  end
  local row = {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    questId = questId, title = title:sub(1, 200), level = level, rewardItemIds = {},
    category = category, faction = faction, tag = questTag(questId),
  }
  -- A number here is the suggested group size; some clients return a tag string in this place.
  if type(group) == "number" and group >= 2 and group <= 40 and group == math.floor(group) then row.suggestedGroup = group end
  -- The giver is the NPC whose window is open; nothing is recorded for an item, an object or a shared quest.
  row.giverNpcId = npcIdFromGuid(UnitGUID("npc")) or npcIdFromGuid(UnitGUID("questnpc"))
  if E:Store("quest", row) then EverlootDB.questSeen[seenKey] = true end
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
  pcall(function() f:RegisterEvent("QUEST_ACCEPTED") end)
  -- MERCHANT_SHOW is an old client event. A missing event disables the hook.
  pcall(function() f:RegisterEvent("MERCHANT_SHOW") end)
  f:HookScript("OnEvent", function(_, event, arg1, arg2)
    if event == "PLAYER_TARGET_CHANGED" then targetSighting("target")
    elseif event == "UPDATE_MOUSEOVER_UNIT" then targetSighting("mouseover")
    elseif event == "LOOT_OPENED" then lootCapture()
    elseif event == "MERCHANT_SHOW" then vendorCapture()
    elseif event == "QUEST_ACCEPTED" then questCapture(arg1, arg2) end
  end)
  if not GetQuestLogTitle then
    return "ready (target/mouseover/loot/merchant; quests off, this client has no GetQuestLogTitle)"
  end
  return "ready (target/mouseover/loot/merchant/quest accept)"
end)
