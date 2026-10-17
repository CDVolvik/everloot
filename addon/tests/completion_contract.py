"""Run with: uv run --with lupa python addon/tests/completion_contract.py

The mock follows what Blizzard's own files for build 1.60.1.70450 say: C_Reputation (FactionData), the title
functions, C_QuestLog.GetAllCompletedQuestIDs and C_QuestLine from the API documentation, and the achievement
globals as Blizzard's window and Legacy Challenges code call them (GetAchievementInfo's 13 leading values).
"""
import re
from pathlib import Path
from lupa.lua51 import LuaRuntime

root = Path(__file__).parents[1]
toc = (root / "Everloot.toc").read_text(encoding="utf-8")
assert "modules\\completion.lua" in toc, "the completion module must be in the TOC"
assert toc.index("modules\\completion.lua") > toc.index("core.lua"), "core loads before the module"

WORLD = """
date = function() return '2026-10-19T00:00:00Z' end
time = function() return 123456 end
printed = {}
print = function(...) printed[#printed + 1] = table.concat({ ... }, ' ') end
SlashCmdList = {}
CreateFrame = function() return {
 RegisterEvent=function() end,
 SetScript=function(self, _, f) self.onEvent=f end,
 HookScript=function(self, _, f) self.hooks=self.hooks or {}; table.insert(self.hooks,f) end
} end

-- C_Timer runs nothing by itself: the test drains it, so chunking and debouncing are visible.
timers = {}
C_Timer = { After = function(seconds, f) table.insert(timers, { seconds = seconds, f = f }) end }
calls, maxPerFrame, frames = 0, 0, 0
function drain(limit)
 local n = 0
 while #timers > 0 and n < (limit or 100000) do
  local t = table.remove(timers, 1)
  n = n + 1; frames = frames + 1; calls = 0
  t.f()
  if calls > maxPerFrame then maxPerFrame = calls end
 end
 return n
end
local function counted(fn) return function(...) calls = calls + 1; return fn(...) end end

-- The player.
combat = false
guid = 'Player-4242-0ABCDEF1'
UnitGUID = function(unit) assert(unit == 'player'); return guid end
UnitClass = function() return 'Mage', 'MAGE', 8 end
UnitLevel = function() return 42 end
UnitName = function() forbidden[#forbidden + 1] = 'UnitName'; return 'Thrall' end
InCombatLockdown = function() return combat end
forbidden = {}

-- Achievements: a parent category, two with achievements, a guild one, and 300 filler to force several frames.
categories = { [1] = { 'General', -1 }, [10] = { 'Exploration', 1 }, [11] = { '|cff00ff00Quests|r', 1 }, [12] = { 'Guild', -1 }, [13] = { 'Filler', 1 } }
categoryList = { 1, 10, 11, 12, 13 }
local function crit(text, done, req) return { text, done, req or 1 } end
local tenQuests = {}
for i = 1, 10 do tenQuests[i] = crit('Quest ' .. i, i <= 8) end
achievements = {
 [10] = {
  { id = 101, name = 'Explore Elwynn', points = 10, completed = true, month = 3, day = 14, year = 26, byMe = true, crit = { crit('Goldshire', true), crit('Northshire', true) } },
  { id = 102, name = 'Explore Kalimdor', points = 25, completed = false, crit = { crit('Ashenvale', true), crit('Durotar', false), crit('Barrens', false), crit('Silithus', false) } },
  { id = 103, name = 'Account Only', points = 5, completed = true, month = 1, day = 2, year = 2025, byMe = false, crit = {} },
 },
 [11] = {
  { id = 201, name = 'Ten Quests', points = 5, completed = false, crit = tenQuests },
  { id = 202, name = 'Guild Quests', points = 5, completed = false, isGuild = true, crit = {} },
 },
 [13] = {},
}
for i = 1, 300 do achievements[13][i] = { id = 5000 + i, name = 'Filler ' .. i, points = 1, completed = false, crit = { crit('a', false), crit('b', false) } } end
API = {
 GetCategoryList = function() return categoryList end,
 GetCategoryInfo = function(id) local c = categories[id]; if not c then return nil end; return c[1], c[2], 0 end,
 GetCategoryNumAchievements = function(id) local l = achievements[id] or {}; return #l, 0, #l end,
 GetAchievementInfo = function(a, b)
  local row
  if b then row = (achievements[a] or {})[b] else for _, l in pairs(achievements) do for _, r in ipairs(l) do if r.id == a then row = r end end end end
  if not row then return nil end
  return row.id, row.name, row.points, row.completed, row.month, row.day, row.year, 'description', 0, 1, '', row.isGuild or false, row.byMe or false, nil, false
 end,
 GetAchievementNumCriteria = function(id) for _, l in pairs(achievements) do for _, r in ipairs(l) do if r.id == id then return #r.crit end end end return 0 end,
 GetAchievementCriteriaInfo = function(id, i)
  for _, l in pairs(achievements) do for _, r in ipairs(l) do if r.id == id then local c = r.crit[i]; return c[1], 0, c[2], 0, c[3], '', 0, 0, '', 1000 + i end end end
 end,
}
for name, fn in pairs(API) do _G[name] = counted(fn) end

-- Reputation: C_Reputation FactionData, header rows, one collapsed header, one renown faction.
factions = {
 { name = 'Alliance', isHeader = true, isHeaderWithRep = false, isChild = false, isCollapsed = false },
 { name = 'Stormwind', factionID = 72, reaction = 8, currentReactionThreshold = 42000, nextReactionThreshold = 42000, currentStanding = 42500, isChild = true },
 { name = 'Darnassus', factionID = 69, reaction = 5, currentReactionThreshold = 3000, nextReactionThreshold = 9000, currentStanding = 8500, isChild = true },
 { name = 'Horde', isHeader = true, isHeaderWithRep = false, isChild = false, isCollapsed = true },
 { name = 'Renown Guild', factionID = 2000, reaction = 3, currentReactionThreshold = 0, nextReactionThreshold = 2500, currentStanding = 100, isChild = true },
 { name = 'Guild Standing', factionID = 1168, reaction = 4, currentReactionThreshold = 0, nextReactionThreshold = 3000, currentStanding = 0, isHeader = true, isHeaderWithRep = true, isChild = false },
}
C_Reputation = {
 GetNumFactions = counted(function() return #factions end),
 GetFactionDataByIndex = counted(function(i) return factions[i] end),
 IsMajorFaction = function(id) return id == 2000 end,
}

-- Titles: the names carry colour codes and a trailing space; id 4 has no name.
titles = { 'Private ', '|cffffffffCorporal|r ', 'Sergeant ' }
known = { [1] = true, [3] = true }
GetNumTitles = counted(function() return 4 end)
GetTitleName = counted(function(id) if titles[id] then return titles[id], true end end)
IsTitleKnown = counted(function(id) return known[id] == true end)

-- Quests and chains.
completed = { 5, 6, 7, 100, 101 }
lines = { [5] = 900, [6] = 900, [7] = 900, [101] = 901 }
members = { [900] = { 5, 6, 7, 8 }, [901] = { 101, 102 } }
lineNames = { [900] = 'The Defias', [901] = 'Westfall Stories' }
C_QuestLog = { GetAllCompletedQuestIDs = counted(function() return completed end) }
C_QuestLine = {
 GetQuestLineInfo = counted(function(questID)
  local id = lines[questID]
  if not id then return nil end
  return { questLineName = lineNames[id], questLineID = id, questID = questID }
 end),
 GetQuestLineQuests = counted(function(id) return members[id] end),
}

-- Every call that would change the game is a trap.
local function trap(name) return function() forbidden[#forbidden + 1] = name end end
for _, name in ipairs({ 'SetCurrentTitle', 'ExpandFactionHeader', 'CollapseFactionHeader', 'ExpandAllFactionHeaders', 'SetWatchedFactionByIndex',
  'AbandonQuest', 'SetSelectedFaction', 'SetFactionActive', 'ToggleFactionAtWar', 'AchievementFrame_ToggleAchievementFrame',
  'ToggleAchievementFrame', 'AddTrackedAchievement', 'RemoveTrackedAchievement', 'SetAchievementSearchString' }) do _G[name] = trap(name) end
C_Reputation.ExpandFactionHeader = trap('C_Reputation.ExpandFactionHeader')
C_Reputation.CollapseFactionHeader = trap('C_Reputation.CollapseFactionHeader')
C_Reputation.ExpandAllFactionHeaders = trap('C_Reputation.ExpandAllFactionHeaders')
C_Reputation.SetSelectedFaction = trap('C_Reputation.SetSelectedFaction')
C_QuestLog.AbandonQuest = trap('C_QuestLog.AbandonQuest')

function dump(v)
 if type(v) ~= 'table' then return tostring(v) end
 local keys = {}
 for k in pairs(v) do keys[#keys + 1] = tostring(k) end
 table.sort(keys)
 local out = {}
 for _, k in ipairs(keys) do out[#out + 1] = k .. '=' .. dump(v[k] ~= nil and v[k] or v[tonumber(k)]) end
 return '{' .. table.concat(out, ',') .. '}'
end
"""

BOOT = """
Everloot.frame.onEvent(nil,'ADDON_LOADED','Everloot')
function event(name) for _, hook in ipairs(Everloot.frame.hooks or {}) do hook(nil, name) end end
function rows(kind) return (EverlootDB.records[kind] or {}) end
function ids(kind) local s = {}; for _, r in ipairs(rows(kind)) do s[r.eventId] = true end return s end
function status() return Everloot:Status() end
"""


def fresh(saved="{ toggles = { completion = true } }", after_world="", core_tweak=""):
    lua = LuaRuntime()
    lua.execute(WORLD)
    lua.execute(after_world)
    lua.execute(f"EverlootDB = {saved}")
    for file in ["core.lua", "modules/completion.lua"]:
        lua.execute((root / file).read_text(encoding="utf-8"))
    lua.execute(core_tweak)
    lua.execute(BOOT)
    return lua


# --- opt-in: off by default, and nothing is read or written while off ------------------------------
lua = fresh(saved="nil")
lua.execute("""
assert(EverlootDB.toggles.completion == false, 'the module is opt-in')
assert(status():find('completion: off by toggle', 1, true), status())
event('PLAYER_ENTERING_WORLD'); event('ACHIEVEMENT_EARNED')
assert(drain() == 0, 'an off module schedules nothing')
for _, kind in ipairs({'achievement_catalog','reputation_catalog','title_catalog','quest_chain_catalog','achievement_owned','reputation_owned','title_owned','quest_owned'}) do
 assert(#rows(kind) == 0, kind)
 assert(status():find('rows ' .. kind .. ': 0', 1, true), 'status lists ' .. kind)
end
""")

# --- the first read: chunked, complete, and shaped for the intake --------------------------------
lua = fresh()
lua.execute("""
assert(status():find('completion: ready', 1, true), status())
event('PLAYER_ENTERING_WORLD')
assert(#rows('achievement_catalog') == 0, 'nothing is read until the events settle')
assert(timers[1].seconds == 10, 'debounced')
drain()
assert(frames > 4, 'a long list is read across frames, not in one: ' .. frames)
assert(maxPerFrame <= 300, 'a frame reads a bounded number of times: ' .. maxPerFrame)

assert(#rows('achievement_catalog') == 304, #rows('achievement_catalog'))
assert(#rows('achievement_owned') == 4, #rows('achievement_owned'))
assert(#rows('reputation_catalog') == 4 and #rows('reputation_owned') == 3, 'renown factions have no standing row')
assert(#rows('title_catalog') == 3 and #rows('title_owned') == 1)
assert(#rows('quest_owned') == 1 and #rows('quest_chain_catalog') == 2)

local byId = {}
for _, r in ipairs(rows('achievement_catalog')) do byId[r.achievementId] = r end
assert(not byId[202], 'guild achievements are not read')
local explore = byId[102]
assert(explore.name == 'Explore Kalimdor' and explore.category == 'Exploration' and explore.parentCategory == 'General' and explore.categoryId == 10)
assert(explore.points == 25 and explore.criteriaCount == 4 and #explore.criteria == 4 and explore.criteria[1].text == 'Ashenvale' and explore.criteria[1].required == 1)
assert(byId[201].category == 'Quests', 'colour codes are stripped')
assert(byId[5001].parentCategory == 'General')
for _, r in ipairs(rows('achievement_catalog')) do assert(r.characterKey == nil and r.character == nil, 'catalog rows carry no player data') end

local owned = {}
for _, r in ipairs(rows('achievement_owned')) do owned[r.achievementId] = r end
assert(owned[101].completed == true and owned[101].earnedByMe == true and owned[101].earnedOn == '2026-03-14', 'two-digit year')
assert(owned[103].completed == true and owned[103].earnedByMe == false and owned[103].earnedOn == '2025-01-02')
assert(owned[102].completed == false and owned[102].earnedByMe == nil and owned[102].criteriaMet == 1 and owned[102].criteriaTotal == 4)
assert(owned[201].criteriaMet == 8 and owned[201].criteriaTotal == 10)
assert(owned[5001] == nil, 'an achievement with no progress is implied by the catalog, not stored')

local key = rows('achievement_owned')[1].characterKey
assert(key:find('^%x%x%x%x%x%x%x%x$') and key == key:lower(), key)
assert(not key:find('4242', 1, true) and not key:find('0ABCDEF1', 1, true) and not key:lower():find('abcdef1', 1, true), 'the key is not the GUID')
for _, kind in ipairs({'achievement_owned','reputation_owned','title_owned','quest_owned'}) do
 for _, r in ipairs(rows(kind)) do assert(r.characterKey == key and r.class == 'MAGE' and r.level == 42 and r.installId == EverlootDB.installId, kind) end
end

local reps = {}
for _, r in ipairs(rows('reputation_catalog')) do reps[r.factionId] = r end
assert(reps[72].header == 'Alliance' and reps[72].major == nil)
assert(reps[2000].header == 'Horde' and reps[2000].major == true)
assert(reps[1168].header == nil, 'a header with its own standing is a faction, with no header of its own')
local standing = {}
for _, r in ipairs(rows('reputation_owned')) do standing[r.factionId] = r end
assert(standing[69].reaction == 5 and standing[69].standing == 8500 and standing[69].floor == 3000 and standing[69].ceiling == 9000)
assert(standing[2000] == nil)

local t = rows('title_catalog')
assert(t[1].name == 'Private' and t[2].name == 'Corporal' and t[3].titleId == 3, 'titles are trimmed and stripped')
local ownedTitles = rows('title_owned')[1].titleIds
assert(#ownedTitles == 2 and ownedTitles[1] == 1 and ownedTitles[2] == 3)

local chains = {}
for _, r in ipairs(rows('quest_chain_catalog')) do chains[r.questLineId] = r end
assert(chains[900].name == 'The Defias' and #chains[900].questIds == 4 and chains[901].questIds[2] == 102)
local q = rows('quest_owned')[1].questIds
assert(#q == 5 and q[5] == 101)

local note = status()
assert(note:find('collapsed headers hide their factions', 1, true), note)
assert(note:find('achievements: 304 read, 304 new rows (+4 yours)', 1, true), note)
assert(#forbidden == 0, table.concat(forbidden, ','))
""")

# --- a second read changes nothing; a change replaces its row and adds no stale one ----------------
lua.execute("""
local before = {}
for _, kind in ipairs({'achievement_catalog','achievement_owned','reputation_catalog','reputation_owned','title_catalog','title_owned','quest_owned','quest_chain_catalog'}) do before[kind] = #rows(kind) end
local owned0, rep0 = ids('achievement_owned'), ids('reputation_owned')
event('ACHIEVEMENT_EARNED'); event('UPDATE_FACTION'); event('KNOWN_TITLES_UPDATE'); event('QUEST_TURNED_IN')
drain()
for kind, n in pairs(before) do assert(#rows(kind) == n, 'an unchanged read adds nothing: ' .. kind) end
assert(next(ids('achievement_owned')) and ids('achievement_owned')[next(owned0)], 'the same rows remain')

-- Progress on one achievement and one reputation.
achievements[10][2].crit[2][2] = true
factions[3].currentStanding = 8900
event('ACHIEVEMENT_EARNED'); event('FACTION_STANDING_CHANGED')
drain()
assert(#rows('achievement_owned') == 4 and #rows('reputation_owned') == 3, 'a changed row replaces the old one')
local gone, added = 0, 0
for id in pairs(owned0) do if not ids('achievement_owned')[id] then gone = gone + 1 end end
for id in pairs(ids('achievement_owned')) do if not owned0[id] then added = added + 1 end end
assert(gone == 1 and added == 1, 'exactly one achievement row was replaced')
for _, r in ipairs(rows('achievement_owned')) do if r.achievementId == 102 then assert(r.criteriaMet == 2) end end
for _, r in ipairs(rows('reputation_owned')) do if r.factionId == 69 then assert(r.standing == 8900) end end
assert(#rows('achievement_catalog') == before.achievement_catalog, 'catalog rows are written once')

-- A new quest and a new title are additions.
completed[#completed + 1] = 8
known[2] = true
event('QUEST_TURNED_IN'); event('KNOWN_TITLES_UPDATE')
drain()
assert(#rows('quest_owned') == 2 and #rows('quest_owned')[2].questIds == 1 and rows('quest_owned')[2].questIds[1] == 8)
assert(#rows('title_owned') == 2 and rows('title_owned')[2].titleIds[1] == 2)
assert(#rows('quest_chain_catalog') == 2, 'a known chain is not written again')

-- Another character on the same install gets its own key; the catalogs are not repeated.
local firstKey = rows('achievement_owned')[1].characterKey
guid = 'Player-4242-0FEDCBA9'
event('PLAYER_ENTERING_WORLD')
drain()
local keys = {}
for _, r in ipairs(rows('achievement_owned')) do keys[r.characterKey] = true end
local n = 0; for _ in pairs(keys) do n = n + 1 end
assert(n == 2 and #rows('achievement_owned') == 8, 'two characters, four rows each')
assert(#rows('achievement_catalog') == before.achievement_catalog and #rows('title_catalog') == 3)
guid = 'Player-4242-0ABCDEF1'

-- The whole file serialises without a name or a GUID in it.
local text = dump(EverlootDB.records)
for _, secret in ipairs({ 'Thrall', 'Player-', '0ABCDEF1', '0FEDCBA9' }) do assert(not text:find(secret, 1, true), secret) end
assert(#forbidden == 0, table.concat(forbidden, ','))
""")

# --- combat: nothing is read until it ends ---------------------------------------------------------
lua = fresh(after_world="combat = true")
lua.execute("""
event('PLAYER_ENTERING_WORLD')
drain(6)
assert(#rows('achievement_catalog') == 0, 'no read during combat')
combat = false
drain()
assert(#rows('achievement_catalog') == 304)
""")

# --- /everloot completion: reads now, and off withdraws everything ---------------------------------
lua = fresh()
lua.execute("""
SlashCmdList.EVERLOOT('completion')
assert(timers[1].seconds == 0, 'asked for now, not after the debounce')
drain()
assert(#rows('title_catalog') == 3)

-- A read in progress stops when the player turns the module off.
event('ACHIEVEMENT_EARNED')
achievements[10][1].name = 'Renamed'
drain(2)
SlashCmdList.EVERLOOT('completion off')
drain()
for _, kind in ipairs({'achievement_catalog','reputation_catalog','title_catalog','quest_chain_catalog','achievement_owned','reputation_owned','title_owned','quest_owned'}) do
 assert(#rows(kind) == 0, 'off withdraws ' .. kind .. ': ' .. #rows(kind))
end
assert(EverlootDB.completionSeen == nil and EverlootDB.toggles.completion == false)
assert(printed[#printed]:find('deleted from this file', 1, true))
SlashCmdList.EVERLOOT('completion')
assert(printed[#printed]:find('module is off', 1, true))
SlashCmdList.EVERLOOT('completion on')
assert(EverlootDB.toggles.completion == true)
""")

# --- missing calls are named and record nothing for that part -----------------------------------
lua = fresh(after_world="C_Reputation = nil; GetNumTitles = nil")
lua.execute("""
local s = status()
assert(s:find('reputation unavailable, missing C_Reputation.GetNumFactions, C_Reputation.GetFactionDataByIndex (records nothing)', 1, true), s)
assert(s:find('titles unavailable, missing GetNumTitles (records nothing)', 1, true), s)
assert(s:find('achievements ready', 1, true) and s:find('quests ready', 1, true), s)
event('PLAYER_ENTERING_WORLD'); drain()
assert(#rows('reputation_catalog') == 0 and #rows('reputation_owned') == 0 and #rows('title_catalog') == 0 and #rows('title_owned') == 0)
assert(#rows('achievement_catalog') == 304 and #rows('quest_owned') == 1)
""")

lua = fresh(after_world="C_QuestLine = nil; UnitGUID = nil")
lua.execute("""
local s = status()
assert(s:find('quest chains unavailable, missing C_QuestLine.GetQuestLineInfo, C_QuestLine.GetQuestLineQuests (records no chains)', 1, true), s)
assert(s:find('your progress not recorded, missing UnitGUID (catalogs only)', 1, true), s)
event('PLAYER_ENTERING_WORLD'); drain()
assert(#rows('achievement_catalog') == 304 and #rows('quest_chain_catalog') == 0)
assert(#rows('achievement_owned') == 0 and #rows('quest_owned') == 0 and #rows('title_owned') == 0 and #rows('reputation_owned') == 0, 'no key, no personal rows')
""")

lua = fresh(after_world="C_Timer = nil")
lua.execute("""
assert(status():find('completion: disabled: missing C_Timer.After', 1, true), status())
event('PLAYER_ENTERING_WORLD')
assert(#rows('achievement_catalog') == 0)
""")

lua = fresh(after_world="GetCategoryList = nil; GetAchievementInfo = nil; C_Reputation = nil; GetNumTitles = nil; C_QuestLog = nil")
lua.execute("""
local s = status()
assert(s:find('completion: disabled', 1, true) and s:find('missing GetCategoryList', 1, true) and s:find('missing C_QuestLog.GetAllCompletedQuestIDs', 1, true), s)
""")

# --- the file's own cap is respected and reported -----------------------------------------------
lua = fresh(core_tweak="Everloot.MAX_ROWS_PER_KIND = 3")
lua.execute("""
event('PLAYER_ENTERING_WORLD'); drain()
assert(#rows('achievement_catalog') == 3 and EverlootDB.paused.achievement_catalog, 'capped, not discarded')
assert(status():find('achievement_catalog paused at capacity', 1, true), status())
""")

# --- read only, and only the calls it declares ---------------------------------------------------
source = (root / "modules" / "completion.lua").read_text(encoding="utf-8")
code = "\n".join(line.split("--")[0] for line in source.splitlines())
api_block = source[source.index("local API = {"):source.index("C.API = API")]
declared = set(re.findall(r'"([A-Za-z_][\w.]*)"', "\n".join(line.split("--")[0] for line in api_block.splitlines())))
named = set(re.findall(r'call\("([\w.]+)"', code)) | set(re.findall(r'\bresolve\("([\w.]+)"\)', code))
assert named, "the source scan found no calls"
assert named <= declared, f"completion.lua calls a function it does not declare: {sorted(named - declared)}"
assert re.findall(r'\b(UnitName|GetUnitName|GetRealmName|GetGuildInfo|GetPlayerInfoByGUID)\b', code) == [], "no character name is read"
actions = (r"SetCurrentTitle|ExpandFactionHeader|CollapseFactionHeader|ExpandAllFactionHeaders|CollapseAllFactionHeaders|SetSelectedFaction|"
           r"SetFactionActive|ToggleFactionAtWar|SetWatchedFaction\w*|SetLegacyReputationsShown|SetReputationSortType|AbandonQuest|"
           r"AddQuestWatch|RemoveQuestWatch|SetSuperTrackedQuestID|AddTrackedAchievement|RemoveTrackedAchievement|SetAchievementSearchString|"
           r"ToggleAchievementFrame|AchievementFrame_\w+|ShowAchievementFrameForAchievement|ToggleLegacyChallenges|RequestQuestLinesForMap|"
           r"SetSelectedQuest|SelectQuestLogEntry|ShowUIPanel|HideUIPanel|SendChatMessage|RunScript|loadstring")
for source_file in sorted(root.rglob("*.lua")):
    if "tests" in source_file.parts:
        continue
    text = "\n".join(line.split("--")[0] for line in source_file.read_text(encoding="utf-8").splitlines())
    called = re.search(rf"\b({actions})\s*\(|pcall\(\s*(?:[A-Za-z_]+\.)?({actions})\b|call\(\s*\"[\w.]*\b({actions})\"", text)
    assert not called, f"{source_file.name} calls an API that changes the game: {called.group(0)}"

print("Lua 5.1 completion: opt-in, chunked reads that skip combat, achievements/reputation/titles/quest chains, replaced rows, "
      "opaque character key, missing calls named, cap respected, off withdraws, no call that changes the game")
