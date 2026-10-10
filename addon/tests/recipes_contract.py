"""Run with: uv run --with lupa python addon/tests/recipes_contract.py"""
from pathlib import Path
from lupa.lua51 import LuaRuntime

lua = LuaRuntime()
lua.execute("""
date = function() return '2026-10-10T00:00:00Z' end
time = function() return 123456 end
print = function() end
SlashCmdList = {}
CreateFrame = function() return {
 RegisterEvent=function() end,
 SetScript=function(self, _, f) self.onEvent=f end,
 HookScript=function(self, _, f) self.hooks=self.hooks or {}; table.insert(self.hooks,f) end
} end
-- Trade skill window: Alchemy at 60/75 with a header, an orange and a green recipe.
rank = 60
GetTradeSkillLine = function() return 'Alchemy', rank, 75 end
local skills = {
 {'Potions', 'header'},
 {'Minor Healing Potion', 'trivial', 'item:118', {{'Peacebloom', 1}, {'Empty Vial', 1}}},
 {'Lesser Healing Potion', 'optimal', 'item:858', {{'Briarthorn', 1}, {'Minor Healing Potion', 1}}},
}
GetNumTradeSkills = function() return #skills end
GetTradeSkillInfo = function(i) return skills[i][1], skills[i][2], 0, true end
GetTradeSkillItemLink = function(i) return skills[i][3] end
GetTradeSkillNumReagents = function(i) return #(skills[i][4] or {}) end
GetTradeSkillReagentInfo = function(i, j) local r = skills[i][4][j]; return r[1], 'icon', r[2], 0 end
-- Enchanting uses the craft window.
GetCraftDisplaySkillLine = function() return 'Enchanting', 40, 75 end
GetNumCrafts = function() return 1 end
GetCraftInfo = function(i) return 'Enchant Bracer - Minor Health', '', 'medium', 0, true end
GetCraftItemLink = function(i) return nil end
GetCraftNumReagents = function(i) return 1 end
GetCraftReagentInfo = function(i, j) return 'Strange Dust', 'icon', 1, 0 end
-- Trainer window: a header, two Alchemy recipes and a class spell with no skill requirement.
local services = {
 {'Potions', '', 'header'},
 {'Lesser Healing Potion', '', 'available', 'Alchemy', 55, 250},
 {'Elixir of Minor Agility', '', 'unavailable', 'Alchemy', 50, 300},
 {'Fireball', 'Rank 2', 'available', nil, nil, 100},
}
GetNumTrainerServices = function() return #services end
GetTrainerServiceInfo = function(i) local s = services[i]; return s[1], s[2], s[3], false end
GetTrainerServiceSkillReq = function(i) local s = services[i]; if s[4] then return s[4], s[5], true end end
GetTrainerServiceCost = function(i) return services[i][6] or 0, 0, 0 end
""")
root = Path(__file__).parents[1]
toc = (root / "Everloot.toc").read_text(encoding="utf-8")
assert "modules\\professions.lua" in toc, "professions module must be in the TOC"
for file in ["core.lua", "modules/professions.lua"]:
    lua.execute((root / file).read_text(encoding="utf-8"))
lua.execute("""
Everloot.frame.onEvent(nil,'ADDON_LOADED','Everloot')
local function event(name) for _, hook in ipairs(Everloot.frame.hooks) do hook(nil, name) end end
event('TRADE_SKILL_SHOW')
local rows = EverlootDB.records.recipe_observed
assert(rows and #rows == 2, 'two recipes observed, the header skipped; got ' .. tostring(rows and #rows))
local byName = {}
for _, r in ipairs(rows) do byName[r.recipe] = r end
local lesser = byName['Lesser Healing Potion']
assert(lesser.profession == 'Alchemy' and lesser.rank == 60 and lesser.maxRank == 75 and lesser.difficulty == 'optimal')
assert(lesser.productItemId == 858 and #lesser.reagents == 2 and lesser.reagents[1].item == 'Briarthorn' and lesser.reagents[1].count == 1)
assert(byName['Minor Healing Potion'].difficulty == 'trivial')

-- Reopening at the same rank adds nothing; a new rank is a new observation.
event('TRADE_SKILL_UPDATE'); event('TRADE_SKILL_SHOW')
assert(#EverlootDB.records.recipe_observed == 2, 'same rank and colour is not observed twice')
rank = 70
event('TRADE_SKILL_SHOW')
assert(#EverlootDB.records.recipe_observed == 4, 'a new rank records each recipe again')

event('CRAFT_SHOW')
local last = EverlootDB.records.recipe_observed[#EverlootDB.records.recipe_observed]
assert(last.profession == 'Enchanting' and last.difficulty == 'medium' and last.productItemId == nil)
assert(last.reagents[1].item == 'Strange Dust')

-- A client without the craft API (or a broken window) never errors.
GetCraftDisplaySkillLine = nil
event('CRAFT_SHOW')

-- A trainer lists each recipe's required rank and cost; headers and spells without a skill requirement are skipped.
event('TRAINER_SHOW')
local trained = EverlootDB.records.trainer_seen
assert(trained and #trained == 2, 'two trainer recipes; got ' .. tostring(trained and #trained))
assert(trained[1].profession == 'Alchemy' and trained[1].recipe == 'Lesser Healing Potion' and trained[1].requiredRank == 55 and trained[1].costCopper == 250)
assert(trained[2].recipe == 'Elixir of Minor Agility' and trained[2].requiredRank == 50, 'a recipe not yet learnable is still listed with its rank')
event('TRAINER_UPDATE'); event('TRAINER_SHOW')
assert(#EverlootDB.records.trainer_seen == 2, 'reopening the trainer adds nothing')
GetTrainerServiceSkillReq = nil
event('TRAINER_SHOW')
""")
print("Lua 5.1 recipes: trade skill, craft and trainer windows, headers skipped, colour per rank, required rank, deduplicated")
