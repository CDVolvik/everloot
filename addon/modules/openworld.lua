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

local npcIdFromGuid = E.NpcIdFromGuid

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

-- Each share of a kind has its own cap, so targeting and corpses cannot use up the room that NPC windows
-- and object positions need. Rows keep their kind and shape; the share is read from the row.
local function sightingShare(row) return row.positionKind == "interaction" and "interaction" or "targeting" end
local function lootShare(row) return row.sourceObjectId and "objects" or "creatures" end
local TARGETING = { name = "targeting", of = sightingShare }
local INTERACTION = { name = "interaction", of = sightingShare }
local OBJECTS = { name = "objects", of = lootShare }
local CREATURES = { name = "creatures", of = lootShare }

local function targetSighting(unit)
  local guid = UnitGUID(unit)
  local npcId = npcIdFromGuid(guid)
  if not npcId then return end
  local name = UnitName(unit)
  local level = UnitLevel(unit)
  if not name or not level or level < 1 then return end
  local where = mapPosition()
  if not where or not where.x or not where.y then return end
  -- One row per NPC, zone and spot (rounded to 1 on the 0..100 scale): retargeting the same NPC adds nothing.
  EverlootDB.targetSeen = EverlootDB.targetSeen or {}
  local seenKey = npcId .. ":" .. where.mapId .. ":" .. math.floor(where.x + 0.5) .. ":" .. math.floor(where.y + 0.5)
  if EverlootDB.targetSeen[seenKey] then return end
  local reaction = "neutral"
  if UnitIsFriend("player", unit) then reaction = "friendly"
  elseif UnitCanAttack("player", unit) then reaction = "hostile" end
  local creatureType, rank = creatureTraits(unit)
  local stored = E:Store("npc_sighting", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    npcId = npcId, name = name,
    mapId = where.mapId, x = where.x, y = where.y, positionKind = "player",
    level = level, reaction = reaction,
    creatureType = creatureType, rank = rank,
  }, nil, TARGETING)
  if stored then EverlootDB.targetSeen[seenKey] = true end
end

-- NPC windows. While one is open the player stands within a few yards of the NPC that opened it, so the
-- player's position is recorded as the NPC's (positionKind "interaction") with the window's role. A gossip
-- window names no service; its role comes from the old gossip option types when the client has them.
-- Event names that were not checked on the Forever client are registered under pcall: one that never
-- fires records nothing.
local WINDOW_ROLES = {
  MERCHANT_SHOW = "vendor", TRAINER_SHOW = "trainer", QUEST_DETAIL = "questgiver", QUEST_GREETING = "questgiver",
  TAXIMAP_OPENED = "flightmaster", BANKFRAME_OPENED = "banker", AUCTION_HOUSE_SHOW = "auctioneer",
  PET_STABLE_SHOW = "stablemaster", CONFIRM_BINDER = "innkeeper", GOSSIP_SHOW = false,
}
-- The newer clients' PLAYER_INTERACTION_MANAGER_FRAME_SHOW, by Enum.PlayerInteractionType name.
local INTERACTION_ROLES = {
  Merchant = "vendor", Trainer = "trainer", QuestGiver = "questgiver", TaxiNode = "flightmaster", Banker = "banker",
  Auctioneer = "auctioneer", StableMaster = "stablemaster", Binder = "innkeeper", Gossip = false,
}

local function interactionRole(kind)
  local types = Enum and Enum.PlayerInteractionType
  if type(types) ~= "table" or kind == nil then return nil end
  for name, role in pairs(INTERACTION_ROLES) do
    if types[name] == kind then return role end
  end
  return nil
end

local function gossipRole()
  if not GetGossipOptions then return false end
  local options = { pcall(GetGossipOptions) }
  if not options[1] then return false end
  -- Old clients return text, type, text, type: "binder" is an innkeeper.
  for i = 3, #options, 2 do
    if options[i] == "binder" then return "innkeeper" end
  end
  return false
end

local function interactionSighting(role)
  local unit = "npc"
  local npcId = npcIdFromGuid(UnitGUID(unit))
  if not npcId and role == "questgiver" then
    unit = "questnpc"
    npcId = npcIdFromGuid(UnitGUID(unit))
  end
  if not npcId then return end
  if role == "vendor" and CanMerchantRepair then
    local ok, repairs = pcall(CanMerchantRepair)
    if ok and repairs then role = "repair" end
  end
  local name, level = UnitName(unit), UnitLevel(unit)
  if type(name) ~= "string" or name == "" or type(level) ~= "number" or level < 1 or level > 100 then return end
  local where = mapPosition()
  if not where or not where.x or not where.y then return end
  EverlootDB.interactionSeen = EverlootDB.interactionSeen or {}
  local seenKey = npcId .. ":" .. (role or "") .. ":" .. where.mapId
  if EverlootDB.interactionSeen[seenKey] then return end
  local reaction = "neutral"
  if UnitIsFriend("player", unit) then reaction = "friendly"
  elseif UnitCanAttack("player", unit) then reaction = "hostile" end
  local creatureType, rank = creatureTraits(unit)
  local stored = E:Store("npc_sighting", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    npcId = npcId, name = name:sub(1, 120),
    mapId = where.mapId, x = where.x, y = where.y, positionKind = "interaction", role = role or nil,
    level = level, reaction = reaction,
    creatureType = creatureType, rank = rank,
  }, nil, INTERACTION)
  if stored then EverlootDB.interactionSeen[seenKey] = true end
end

-- The spell cast on an object, read at UNIT_SPELLCAST_SENT just before its loot window opens. English names
-- and the Classic spell ids; any other spell is "other". The cast's target is the object's name, kept only for
-- herb, ore and chest casts: any other spell's target may be a player, and a player's name never goes on a row.
local GATHER_BY_NAME = {
  ["Herb Gathering"] = "herb", ["Mining"] = "ore", ["Opening"] = "chest", ["Opening - No Text"] = "chest",
  ["Fishing"] = "fishing",
}
local GATHER_BY_ID = {
  [2366] = "herb", [2368] = "herb", [3570] = "herb", [11993] = "herb",
  [2575] = "ore", [2576] = "ore", [3564] = "ore", [10248] = "ore",
  [3365] = "chest", [6247] = "chest", [6477] = "chest", [6478] = "chest", [21651] = "chest", [22810] = "chest",
  [7620] = "fishing", [7731] = "fishing", [7732] = "fishing", [18248] = "fishing",
}
-- A loot window more than this many seconds after the cast is not that cast's. A fish can take longer to bite.
local GATHER_WINDOW, FISHING_WINDOW = 8, 30
local NAMED_KINDS = { herb = true, ore = true, chest = true }
local lastCast

-- True when the name is the targeted player's: such a cast target is never kept.
local function targetPlayerNamed(name)
  if not (UnitName and UnitIsPlayer) then return false end
  local okPlayer, isPlayer = pcall(UnitIsPlayer, "target")
  if not okPlayer or not isPlayer then return false end
  local okName, targetName = pcall(UnitName, "target")
  return okName and targetName == name
end

local function now()
  if not GetTime then return nil end
  local ok, t = pcall(GetTime)
  return ok and type(t) == "number" and t or nil
end

local function spellName(spellId)
  if C_Spell and C_Spell.GetSpellName then
    local ok, name = pcall(C_Spell.GetSpellName, spellId)
    if ok and type(name) == "string" then return name end
  end
  if GetSpellInfo then
    local ok, info = pcall(GetSpellInfo, spellId)
    if ok and type(info) == "table" then info = info.name end
    if ok and type(info) == "string" then return info end
  end
  return nil
end

-- Newer clients send unit, target, castGUID, spellID; old ones unit, spell name, rank, target.
local function castSent(unit, a2, a3, a4)
  if unit ~= "player" then return end
  local spellId, name, target
  if type(a4) == "number" then spellId, target = a4, a2
  elseif type(a2) == "string" then name, target = a2, a4 end
  local kind = (spellId and GATHER_BY_ID[spellId]) or GATHER_BY_NAME[name or (spellId and spellName(spellId)) or ""] or "other"
  if not NAMED_KINDS[kind] or type(target) ~= "string" or target == "" or #target > 120 or targetPlayerNamed(target) then
    target = nil
  end
  lastCast = { gatherKind = kind, name = target, at = now() }
end

local function gatherContext()
  local cast = lastCast
  lastCast = nil
  if not cast then return nil end
  local t = now()
  local window = cast.gatherKind == "fishing" and FISHING_WINDOW or GATHER_WINDOW
  if cast.at and t and t - cast.at > window then return nil end
  return cast
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
  local cast = gatherContext()
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
  local where
  for guid, group in pairs(groups) do
    if not EverlootDB.lootSources[guid] then
      -- An object stays where it is: the player's position, how it was opened and its name go with it.
      if group.sourceObjectId then
        if where == nil then
          local ok, pos = pcall(mapPosition)
          where = ok and pos and pos.x and pos.y and pos or false
        end
        if where then group.mapId, group.x, group.y = where.mapId, where.x, where.y end
        if cast then group.gatherKind, group.sourceObjectName = cast.gatherKind, cast.name end
      end
      group.installId = EverlootDB.installId
      group.capturedAt = date("!%Y-%m-%dT%H:%M:%SZ")
      group.sourceEvidence = "loot-api"
      if E:Store("loot", group, nil, group.sourceObjectId and OBJECTS or CREATURES) then
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
  -- 0.3.7 and earlier paused a whole kind; these kinds now pause one share at a time.
  if EverlootDB.paused then EverlootDB.paused.npc_sighting, EverlootDB.paused.loot = nil, nil end
  for event in pairs(WINDOW_ROLES) do pcall(function() f:RegisterEvent(event) end) end
  for _, event in ipairs({ "PLAYER_INTERACTION_MANAGER_FRAME_SHOW", "UNIT_SPELLCAST_SENT", "UNIT_SPELLCAST_FAILED",
    "UNIT_SPELLCAST_INTERRUPTED", "LOOT_CLOSED" }) do
    pcall(function() f:RegisterEvent(event) end)
  end
  f:HookScript("OnEvent", function(_, event, arg1, arg2, arg3, arg4)
    if event == "PLAYER_TARGET_CHANGED" then targetSighting("target")
    elseif event == "UPDATE_MOUSEOVER_UNIT" then targetSighting("mouseover")
    elseif event == "LOOT_OPENED" then lootCapture()
    elseif event == "QUEST_ACCEPTED" then questCapture(arg1, arg2)
    elseif event == "UNIT_SPELLCAST_SENT" then pcall(castSent, arg1, arg2, arg3, arg4)
    elseif (event == "UNIT_SPELLCAST_FAILED" or event == "UNIT_SPELLCAST_INTERRUPTED") and arg1 == "player" then lastCast = nil
    elseif event == "LOOT_CLOSED" then lastCast = nil
    elseif event == "PLAYER_INTERACTION_MANAGER_FRAME_SHOW" then
      local role = interactionRole(arg1)
      if role ~= nil then pcall(interactionSighting, role or nil) end
    end
    if event == "MERCHANT_SHOW" then vendorCapture() end
    local role = WINDOW_ROLES[event]
    if role == false then
      local ok, found = pcall(gossipRole)
      role = ok and found or false
    end
    if role ~= nil then pcall(interactionSighting, role or nil) end
  end)
  if not GetQuestLogTitle then
    return "ready (target/mouseover/loot/merchant/NPC windows; quests off, this client has no GetQuestLogTitle)"
  end
  return "ready (target/mouseover/loot/merchant/NPC windows/quest accept)"
end)
