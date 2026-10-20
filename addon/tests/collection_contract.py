"""Run with: uv run --with lupa --with jsonschema python addon/tests/collection_contract.py"""
from pathlib import Path
from lupa.lua51 import LuaRuntime

lua = LuaRuntime()
lua.execute("""
date = function() return '2026-10-08T00:00:00Z' end
time = function() return 123456 end
print = function() end
SlashCmdList = {}
CreateFrame = function() return {
 RegisterEvent=function() end,
 SetScript=function(self, _, f) self.onEvent=f end,
 HookScript=function(self, _, f) self.hooks=self.hooks or {}; table.insert(self.hooks,f) end
} end
UnitGUID = function() return 'Creature-0-1-2-3-999-0000001' end
UnitName = function() return 'Forest Spider' end
UnitLevel = function() return 60 end
UnitIsFriend = function() return false end
UnitCanAttack = function() return true end
UnitCreatureType = function() return 'Beast' end
UnitClassification = function() return 'rareelite' end
questLog = {
 {'Elwynn Forest', 0, 0, true},
 {'Wanted: Hogger', 11, 5, false, nil, nil, nil, 176},
 {'Mage', 0, 0, true},
 {'Arcane Missive', 12, 'Elite', false, nil, nil, nil, 177},
 {'Bad Level', 0, 0, false, nil, nil, nil, 178},
}
GetQuestLogTitle = function(i)
 local r = questLog[i]
 if not r then return nil end
 return r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]
end
Enum = {QuestTag = {Group = 1, PvP = 41, Raid = 62, Dungeon = 81}}
C_QuestLog = {GetQuestTagInfo = function(id) if id == 176 then return {tagID = 81} end end}
C_Map = {GetBestMapForUnit=function() return 141 end,
 GetPlayerMapPosition=function() return {x=.42,y=.61} end}
GetNumLootItems = function() return 1 end
GetLootSlotLink = function() return 'item:1234' end
GetLootSlotInfo = function() return 'icon','Cloth',5 end
local corpse = 'Creature-0-1-2-3-42-0000002'
GetLootSourceInfo = function() return corpse,2,'Creature-0-1-2-3-43-0000003',3 end
GetGuildInfo = function() return 'Test Guild' end
GetRealmName = function() return 'Test Realm' end
UnitFactionGroup = function() return 'Alliance' end
C_GuildInfo = {GuildRoster=function() end}
GetNumGuildMembers = function() return 1 end
GetGuildRosterInfo = function() return 'Player-Realm','Officer',1,60,nil,nil,nil,nil,true,nil,'MAGE' end
""")
root = Path(__file__).parents[1]
for file in ["core.lua", "modules/openworld.lua", "modules/guild.lua"]:
    lua.execute((root / file).read_text(encoding="utf-8"))
lua.execute("""
Everloot.frame.onEvent(nil,'ADDON_LOADED','Everloot')
local function event(name)
 for _, hook in ipairs(Everloot.frame.hooks) do hook(nil,name) end
end
event('LOOT_OPENED')
assert(#EverlootDB.records.loot == 2, 'area loot must split physical sources')
local counts = {}
for _, row in ipairs(EverlootDB.records.loot) do
 counts[row.sourceNpcId] = row.items[1].count
 assert(row.sourceEvidence == 'loot-api')
end
assert(counts[42] == 2 and counts[43] == 3, 'source quantities must survive Lua returns')
event('LOOT_OPENED')
assert(#EverlootDB.records.loot == 2, 'reopening cannot add observations')
-- Reload the module against the same SavedVariables: retained corpse identities persist.
""")
lua.execute((root / "modules/openworld.lua").read_text(encoding="utf-8"))
lua.execute("""
Everloot:InitModules()
for _, hook in ipairs(Everloot.frame.hooks) do hook(nil,'LOOT_OPENED') end
assert(#EverlootDB.records.loot == 2, 'reload cannot duplicate retained corpses')
GetLootSourceInfo = nil
for _, hook in ipairs(Everloot.frame.hooks) do hook(nil,'LOOT_OPENED') end
assert(#EverlootDB.records.loot == 2, 'missing source API must not guess the target')
GetNumLootItems = function() return 0 end
for _, hook in ipairs(Everloot.frame.hooks) do hook(nil,'LOOT_OPENED') end
assert(#EverlootDB.records.loot == 2, 'empty window must not invent a kill')
for _, hook in ipairs(Everloot.frame.hooks) do hook(nil,'PLAYER_TARGET_CHANGED') end
assert(EverlootDB.records.npc_sighting[1].positionKind == 'player')
local sighting = EverlootDB.records.npc_sighting[1]
assert(sighting.creatureType == 'Beast' and sighting.rank == 'rare_elite', 'type and rank come from the unit')
UnitCreatureType = function() return 'Bestie' end
UnitClassification = function() return 'trivial' end
for _, hook in ipairs(Everloot.frame.hooks) do hook(nil,'PLAYER_TARGET_CHANGED') end
local last = EverlootDB.records.npc_sighting[#EverlootDB.records.npc_sighting]
assert(last.creatureType == nil and last.rank == nil, 'a localized type and a minor rank record nothing')
UnitCreatureType = nil
UnitClassification = nil
for _, hook in ipairs(Everloot.frame.hooks) do hook(nil,'PLAYER_TARGET_CHANGED') end
assert(EverlootDB.records.npc_sighting[#EverlootDB.records.npc_sighting].creatureType == nil, 'missing APIs leave the fields out')
local n = #EverlootDB.records.npc_sighting
-- Quest accept: level, category (nearest header above), group size, tag, faction and giver.
local function accept(index, id) for _, hook in ipairs(Everloot.frame.hooks) do hook(nil, 'QUEST_ACCEPTED', index, id) end end
accept(2, 176)
local quest = EverlootDB.records.quest[1]
assert(quest.questId == 176 and quest.title == 'Wanted: Hogger' and quest.level == 11, 'quest title and level come from the log row')
assert(quest.category == 'Elwynn Forest' and quest.suggestedGroup == 5 and quest.tag == 'dungeon' and quest.faction == 'alliance')
assert(quest.giverNpcId == 999, 'giver is the NPC whose window is open')
accept(2, 176)
assert(#EverlootDB.records.quest == 1, 'accepting it again on the same side adds nothing')
accept(4, 177)
local second = EverlootDB.records.quest[2]
assert(second.category == 'Mage' and second.suggestedGroup == nil and second.tag == nil, 'a tag string is not a group size')
accept(3, 177)
accept(5, 178)
accept(2, 999)
assert(#EverlootDB.records.quest == 2, 'a header, a level of zero and a different quest id record nothing')
GetQuestLogTitle = nil
accept(2, 176)
assert(#EverlootDB.records.quest == 2, 'no quest log call, no quest row')
C_Map.GetPlayerMapPosition = function() return nil end
for _, hook in ipairs(Everloot.frame.hooks) do hook(nil,'PLAYER_TARGET_CHANGED') end
assert(#EverlootDB.records.npc_sighting == n, 'missing coordinates must not become zero')
for _, hook in ipairs(Everloot.frame.hooks) do hook(nil,'GUILD_ROSTER_UPDATE') end
local member = EverlootDB.records.guild_snapshot[1].members[1]
assert(member.rank == 'Officer' and member.level == 60 and member.class == 'MAGE')
assert(member.lastOnlineDays == 0)
""")
# Every row the addon wrote is a record the site would accept (packages/protocol/schema).
from protocol_schema import check_all  # noqa: E402
check_all(lua)
print("Lua 5.1 collection: physical sources, quantities, reopen/reload, missing APIs, position provenance, NPC type and rank, quest accept and roster passed")
