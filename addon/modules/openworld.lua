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

local function lootCapture()
  local items = {}
  local n = GetNumLootItems and GetNumLootItems() or 0
  for i = 1, math.min(n, 50) do
    local link = GetLootSlotLink and GetLootSlotLink(i)
    local _, _, count = GetLootSlotInfo and GetLootSlotInfo(i)
    local itemId = link and tonumber(link:match("item:(%d+)"))
    if itemId then items[#items + 1] = { itemId = itemId, count = count or 1 } end
  end
  if #items == 0 then return end
  local sourceNpcId = npcIdFromGuid(UnitGUID("target"))
  E:Store("loot", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    sourceNpcId = sourceNpcId,
    items = items,
  })
end

E:RegisterModule("openworld", function()
  local f = E.frame
  f:RegisterEvent("PLAYER_TARGET_CHANGED")
  f:RegisterEvent("UPDATE_MOUSEOVER_UNIT")
  f:RegisterEvent("LOOT_OPENED")
  f:HookScript("OnEvent", function(_, event, ...)
    if event == "PLAYER_TARGET_CHANGED" then targetSighting("target")
    elseif event == "UPDATE_MOUSEOVER_UNIT" then targetSighting("mouseover")
    elseif event == "LOOT_OPENED" then lootCapture() end
  end)
  -- Quest + merchant capture lands once the beta quest/merchant event names are confirmed
  -- in-client (MUST stay guarded: missing events disable, never error).
  return "ready (target/mouseover/loot; quest+merchant pending beta confirm)"
end)
