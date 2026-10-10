-- Everloot recipe observations. The trade-skill and craft windows report, per recipe, a difficulty
-- colour at the player's current rank, not the skill thresholds themselves. Each row records what
-- the window showed (profession, rank, recipe, colour, product, reagents); the server infers
-- threshold ranges from many installs. One row per recipe, rank and colour; reopening adds nothing.
-- Reads windows the player opened. Never crafts, clicks or plays.

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

E:RegisterModule("professions", function()
  local f = E.frame
  for _, name in ipairs({ "TRADE_SKILL_SHOW", "TRADE_SKILL_UPDATE", "CRAFT_SHOW", "CRAFT_UPDATE" }) do
    pcall(function() f:RegisterEvent(name) end)
  end
  f:HookScript("OnEvent", function(_, event)
    if event == "TRADE_SKILL_SHOW" or event == "TRADE_SKILL_UPDATE" then pcall(tradeSkills)
    elseif event == "CRAFT_SHOW" or event == "CRAFT_UPDATE" then pcall(crafts) end
  end)
  return "ready (recipe colours from open trade-skill and craft windows)"
end)
