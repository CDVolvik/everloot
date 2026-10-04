-- Own character only. Records current gold, the peak this install has seen,
-- and copper taken from a loot window. Other income, spending, and gameplay
-- stay unrecorded until an event is actually seen. No other player's name.

local E = Everloot

local peak = 0
local lastSnapshot = 0

local function playerMoney()
  if not GetMoney then return nil end
  local ok, copper = pcall(GetMoney)
  if not ok or type(copper) ~= "number" or copper < 0 or copper ~= math.floor(copper) then return nil end
  return copper
end

local function identity()
  local name = UnitName and UnitName("player")
  local realm = GetRealmName and GetRealmName()
  if type(name) ~= "string" or name == "" then return nil end
  if type(realm) ~= "string" or #realm < 2 then return nil end
  return name, realm
end

local function rememberPeak(copper)
  if copper > peak then peak = copper end
  EverlootDB.goldPeak = peak
end

local function writeSnapshot(force)
  local now = time()
  if not force and now - lastSnapshot < 60 then return end
  local copper = playerMoney()
  local name, realm = identity()
  if not copper or not name then return end
  rememberPeak(copper)
  lastSnapshot = now
  E:Store("gold_snapshot", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    character = name,
    realm = realm,
    currentCopper = copper,
    peakCopper = peak,
  })
end

local function lootMoney()
  if not GetNumLootItems or not GetLootSlotType or not GetLootSlotInfo then return end
  local name, realm = identity()
  if not name then return end
  local okCount, count = pcall(GetNumLootItems)
  if not okCount or type(count) ~= "number" then return end
  for i = 1, math.min(count, 50) do
    local okType, slotType = pcall(GetLootSlotType, i)
    -- 2 is the money slot. An item slot is not income.
    if okType and slotType == 2 then
      local okInfo, _, _, copper = pcall(GetLootSlotInfo, i)
      if okInfo and type(copper) == "number" and copper >= 1 and copper == math.floor(copper) then
        E:Store("money_event", {
          installId = EverlootDB.installId,
          capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
          character = name,
          realm = realm,
          category = "loot",
          copper = copper,
        })
        writeSnapshot(true)
      end
    end
  end
end

E:RegisterModule("gold", function()
  if type(EverlootDB.goldPeak) == "number" and EverlootDB.goldPeak >= 0 then peak = EverlootDB.goldPeak end
  local f = E.frame
  f:RegisterEvent("PLAYER_ENTERING_WORLD")
  f:RegisterEvent("LOOT_OPENED")
  pcall(function() f:RegisterEvent("PLAYER_MONEY") end)
  f:HookScript("OnEvent", function(_, event)
    if event == "PLAYER_ENTERING_WORLD" then writeSnapshot(true)
    elseif event == "PLAYER_MONEY" then
      local copper = playerMoney()
      if copper then rememberPeak(copper) end
      writeSnapshot(false)
    elseif event == "LOOT_OPENED" then lootMoney() end
  end)
  return "ready (peak, current, loot copper)"
end)
