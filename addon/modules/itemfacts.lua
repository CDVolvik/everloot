-- Everloot item facts: the numbers an item's tooltip shows that the game files do not hold (armour, block, damage
-- per second, stats, resistances), recorded when the player's own tooltip shows the item.
-- Read with GetItemStats on the plain item from GetItemInfo, so an enchant or a random suffix on the copy the player
-- hovered never counts, and the stat keys do not depend on the client's language.
-- Anonymous: the item id, the line, the number and the client build, as the protocol's item_fact kind. Nothing
-- about the character, and nothing from a tooltip that shows anything other than an item.
-- Follows the open-world toggle: off there, off here.

local E = Everloot
local F = {}
E.ItemFacts = F

-- GetItemStats keys, as the game's global strings name them, to the protocol's ITEM_FACTS. A key not listed here
-- records nothing. Resistances have an older key and a newer one; both are listed.
F.KEYS = {
  RESISTANCE0_NAME = "armor",
  ITEM_MOD_BLOCK_VALUE_SHORT = "block",
  ITEM_MOD_DAMAGE_PER_SECOND_SHORT = "damage_per_second",
  ITEM_MOD_HEALTH_SHORT = "health",
  ITEM_MOD_MANA_SHORT = "mana",
  ITEM_MOD_AGILITY_SHORT = "agility",
  ITEM_MOD_STRENGTH_SHORT = "strength",
  ITEM_MOD_INTELLECT_SHORT = "intellect",
  ITEM_MOD_SPIRIT_SHORT = "spirit",
  ITEM_MOD_STAMINA_SHORT = "stamina",
  ITEM_MOD_DEFENSE_SKILL_RATING_SHORT = "defense_rating",
  ITEM_MOD_DODGE_RATING_SHORT = "dodge_rating",
  ITEM_MOD_PARRY_RATING_SHORT = "parry_rating",
  ITEM_MOD_BLOCK_RATING_SHORT = "block_rating",
  ITEM_MOD_HIT_RATING_SHORT = "hit_rating",
  ITEM_MOD_CRIT_RATING_SHORT = "crit_rating",
  ITEM_MOD_HASTE_RATING_SHORT = "haste_rating",
  ITEM_MOD_EXPERTISE_RATING_SHORT = "expertise_rating",
  ITEM_MOD_RESILIENCE_RATING_SHORT = "resilience_rating",
  ITEM_MOD_ATTACK_POWER_SHORT = "attack_power",
  ITEM_MOD_MANA_REGENERATION_SHORT = "mana_regeneration",
  ITEM_MOD_SPELL_POWER_SHORT = "spell_power",
  RESISTANCE1_NAME = "holy_resistance", ITEM_MOD_HOLY_RESISTANCE_SHORT = "holy_resistance",
  RESISTANCE2_NAME = "fire_resistance", ITEM_MOD_FIRE_RESISTANCE_SHORT = "fire_resistance",
  RESISTANCE3_NAME = "nature_resistance", ITEM_MOD_NATURE_RESISTANCE_SHORT = "nature_resistance",
  RESISTANCE4_NAME = "frost_resistance", ITEM_MOD_FROST_RESISTANCE_SHORT = "frost_resistance",
  RESISTANCE5_NAME = "shadow_resistance", ITEM_MOD_SHADOW_RESISTANCE_SHORT = "shadow_resistance",
  RESISTANCE6_NAME = "arcane_resistance", ITEM_MOD_ARCANE_RESISTANCE_SHORT = "arcane_resistance",
}

local MAX_ID = 9007199254740991
-- Items this session already read, kept out of the file: an item with no numbers is read once per session.
local readThisSession = {}

local function itemStats(link)
  local get = (C_Item and C_Item.GetItemStats) or GetItemStats
  if not get then return nil end
  local ok, stats = pcall(get, link)
  return ok and type(stats) == "table" and stats or nil
end

-- The number for a fact, as the tooltip prints it, or nil: damage per second to one decimal, the rest whole.
local function factValue(fact, v)
  if type(v) ~= "number" or v ~= v or v == 0 then return nil end
  if fact == "damage_per_second" then v = math.floor(v * 10 + 0.5) / 10
  elseif v ~= math.floor(v) then return nil end
  if v < -10000 or v > 10000 or v == 0 then return nil end
  return v
end

--- Record the facts of one item, once per item and client build. True when its rows are in the file.
function F.Record(itemId)
  if type(itemId) ~= "number" or itemId < 1 or itemId > MAX_ID or itemId ~= math.floor(itemId) then return false end
  local build = EverlootDB.clientBuild
  if type(build) ~= "string" or not GetItemInfo then return false end
  EverlootDB.itemFactSeen = EverlootDB.itemFactSeen or {}
  if EverlootDB.itemFactSeen[itemId] == build or readThisSession[itemId] then return false end
  local okInfo, _, link = pcall(GetItemInfo, itemId)
  -- Not in the client's cache yet: the next tooltip of it tries again.
  if not okInfo or type(link) ~= "string" then return false end
  readThisSession[itemId] = true
  local stats = itemStats(link)
  if not stats then return false end
  local rows, seen = {}, {}
  for key, raw in pairs(stats) do
    local fact = F.KEYS[key]
    local value = fact and factValue(fact, raw)
    if value and not seen[fact] then
      seen[fact] = true
      rows[#rows + 1] = { fact = fact, value = value }
    end
  end
  if #rows == 0 then return false end
  table.sort(rows, function(a, b) return a.fact < b.fact end)
  local capturedAt = date("!%Y-%m-%dT%H:%M:%SZ")
  for _, row in ipairs(rows) do
    if not E:Store("item_fact", {
      installId = EverlootDB.installId,
      capturedAt = capturedAt,
      itemId = itemId, fact = row.fact, value = row.value, clientBuild = build,
    }) then return false end
  end
  EverlootDB.itemFactSeen[itemId] = build
  return true
end

-- A tooltip's data: an item by its id, with an item GUID when it is a copy in a bag or worn. Any other GUID is not an
-- item's, so nothing is read from it.
local function tooltipShown(data)
  if type(data) ~= "table" or type(data.id) ~= "number" then return end
  if data.guid ~= nil and (type(data.guid) ~= "string" or not data.guid:find("^Item%-")) then return end
  F.Record(data.id)
end

E:RegisterModule("itemfacts", function()
  if not E:IsEnabled("openworld") then return "off (follows open-world collection)" end
  if type(EverlootDB.clientBuild) ~= "string" then return "off (this client gives no build)" end
  if not (TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType) then
    error("tooltip API unavailable", 0)
  end
  if not ((C_Item and C_Item.GetItemStats) or GetItemStats) then error("GetItemStats unavailable", 0) end
  if not E.itemFactsHooked then
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(_, data) pcall(tooltipShown, data) end)
    E.itemFactsHooked = true
  end
  return "ready (armor, stats and resistances from item tooltips)"
end)
