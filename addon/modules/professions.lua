-- Everloot recipe observations. The trade-skill and craft windows report, per recipe, a difficulty
-- colour at the player's current rank, not the skill thresholds themselves. Each row records what
-- the window showed (profession, rank, recipe, colour, product, reagents); the server infers
-- threshold ranges from many installs. One row per recipe, rank and colour; reopening adds nothing.
-- A trainer window lists each profession recipe's required rank and training cost: one row per
-- recipe, rank and cost. Reads windows the player opened. Never crafts, clicks, trains or plays.

local E = Everloot
local COLOURS = { optimal = true, medium = true, easy = true, trivial = true }

local function itemId(link)
  return type(link) == "string" and tonumber(link:match("item:(%d+)")) or nil
end

local function observe(api)
  local okLine, profession, rank, maxRank = pcall(api.line)
  if not okLine or type(profession) ~= "string" or profession == "" or type(rank) ~= "number" then return end
  local okCount, count = pcall(api.count)
  if not okCount or type(count) ~= "number" then return end
  EverlootDB.recipeSeen = EverlootDB.recipeSeen or {}
  for i = 1, math.min(count, 500) do
    local ok, name, colour = pcall(api.info, i)
    if ok and type(name) == "string" and name ~= "" and COLOURS[colour] then
      local key = profession .. "|" .. name .. "|" .. rank .. "|" .. colour
      if not EverlootDB.recipeSeen[key] then
        local reagents = {}
        local okN, n = pcall(api.reagentCount, i)
        for j = 1, (okN and type(n) == "number") and math.min(n, 20) or 0 do
          local okR, reagent, _, needed = pcall(api.reagent, i, j)
          if okR and type(reagent) == "string" and type(needed) == "number" and needed >= 1 then
            reagents[#reagents + 1] = { item = reagent, count = needed }
          end
        end
        local okL, link = pcall(api.link, i)
        local stored = E:Store("recipe_observed", {
          installId = EverlootDB.installId,
          capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
          profession = profession,
          rank = rank,
          maxRank = type(maxRank) == "number" and maxRank or nil,
          recipe = name,
          difficulty = colour,
          productItemId = okL and itemId(link) or nil,
          reagents = reagents,
        })
        if stored then EverlootDB.recipeSeen[key] = true end
      end
    end
  end
end

local function tradeSkills()
  if not (GetTradeSkillLine and GetNumTradeSkills and GetTradeSkillInfo) then return end
  observe({
    line = GetTradeSkillLine, count = GetNumTradeSkills, info = GetTradeSkillInfo,
    link = GetTradeSkillItemLink or function() return nil end,
    reagentCount = GetTradeSkillNumReagents or function() return 0 end,
    reagent = GetTradeSkillReagentInfo or function() return nil end,
  })
end

local function crafts()
  if not (GetCraftDisplaySkillLine and GetNumCrafts and GetCraftInfo) then return end
  observe({
    line = GetCraftDisplaySkillLine, count = GetNumCrafts,
    -- GetCraftInfo returns name, subSpellName, difficulty, ...
    info = function(i) local name, _, colour = GetCraftInfo(i); return name, colour end,
    link = GetCraftItemLink or function() return nil end,
    reagentCount = GetCraftNumReagents or function() return 0 end,
    reagent = GetCraftReagentInfo or function() return nil end,
  })
end

--- Only services with a profession requirement are recipes; class spells and headers have none.
local function trainer()
  if not (GetNumTrainerServices and GetTrainerServiceInfo and GetTrainerServiceSkillReq) then return end
  local okCount, count = pcall(GetNumTrainerServices)
  if not okCount or type(count) ~= "number" then return end
  EverlootDB.trainerSeen = EverlootDB.trainerSeen or {}
  for i = 1, math.min(count, 500) do
    local okInfo, name, _, category = pcall(GetTrainerServiceInfo, i)
    local okReq, profession, rank = pcall(GetTrainerServiceSkillReq, i)
    if okInfo and okReq and category ~= "header" and type(name) == "string" and name ~= ""
      and type(profession) == "string" and profession ~= "" and type(rank) == "number" and rank >= 1 then
      local okCost, cost = false, nil
      if GetTrainerServiceCost then okCost, cost = pcall(GetTrainerServiceCost, i) end
      cost = (okCost and type(cost) == "number" and cost >= 0) and cost or nil
      local key = profession .. "|" .. name .. "|" .. rank .. "|" .. tostring(cost)
      if not EverlootDB.trainerSeen[key] then
        local stored = E:Store("trainer_seen", {
          installId = EverlootDB.installId,
          capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
          profession = profession,
          recipe = name,
          requiredRank = rank,
          costCopper = cost,
        })
        if stored then EverlootDB.trainerSeen[key] = true end
      end
    end
  end
end

E:RegisterModule("professions", function()
  local f = E.frame
  for _, name in ipairs({ "TRADE_SKILL_SHOW", "TRADE_SKILL_UPDATE", "CRAFT_SHOW", "CRAFT_UPDATE", "TRAINER_SHOW", "TRAINER_UPDATE" }) do
    pcall(function() f:RegisterEvent(name) end)
  end
  f:HookScript("OnEvent", function(_, event)
    if event == "TRADE_SKILL_SHOW" or event == "TRADE_SKILL_UPDATE" then pcall(tradeSkills)
    elseif event == "CRAFT_SHOW" or event == "CRAFT_UPDATE" then pcall(crafts)
    elseif event == "TRAINER_SHOW" or event == "TRAINER_UPDATE" then pcall(trainer) end
  end)
  return "ready (recipe colours from open trade-skill and craft windows, required ranks from trainers)"
end)
