"""Run with: uv run --with lupa python addon/tests/raid_contract.py"""
from pathlib import Path
from lupa.lua51 import LuaRuntime

root = Path(__file__).parents[1]
toc = (root / "Everloot.toc").read_text(encoding="utf-8")
assert "modules\\raid_data.lua" in toc and "modules\\raid.lua" in toc, "raid files must be in the TOC"
source = (root / "modules" / "raid.lua").read_text(encoding="utf-8")
# Display only: the module may read the group and auras and nothing else.
for forbidden in ["CastSpellByName", "TargetUnit", "InviteUnit", "UninviteUnit", "SetRaidSubgroup", "SwapRaidSubgroup",
                  "PromoteToAssistant", "SendChatMessage", "RunMacro", "UseAction", "SecureActionButton", "E:Store"]:
    assert forbidden not in source, f"raid.lua must not call {forbidden}"

STUBS = """
date = function() return '2026-10-18T00:00:00Z' end
time = function() return 123456 end
printed = {}
print = function(...) local t = {} for i = 1, select('#', ...) do t[#t+1] = tostring((select(i, ...))) end table.insert(printed, table.concat(t, ' ')) end
SlashCmdList = {}
CreateFrame = function() return {
 RegisterEvent=function() end,
 SetScript=function(self, _, f) self.onEvent=f end,
 HookScript=function() end
} end
BUILD = { '1.60.1', '70450', 'Oct 1 2026', 11508 }
GetBuildInfo = function() return unpack(BUILD) end
"""

# A raid of 7: group 1 has a warrior, a druid and a mage; group 2 has a shaman, a priest, a paladin and a
# hunter. Buffs are placed by name. "far" is out of range, "off" is offline.
GROUP = """
group = { inRaid = true, members = {
 { name = 'Ash', sub = 1, class = 'WARRIOR', auras = { 'Battle Shout' } },
 { name = 'Bri', sub = 1, class = 'DRUID', auras = { 'Mark of the Wild', 'Battle Shout' } },
 { name = 'Cal', sub = 1, class = 'MAGE', auras = { 'Arcane Intellect', 'Battle Shout' } },
 { name = 'Dee', sub = 2, class = 'SHAMAN', auras = { 'Strength of Earth' } },
 { name = 'Eli', sub = 2, class = 'PRIEST', auras = { 'Power Word: Fortitude' } },
 { name = 'Fay', sub = 2, class = 'PALADIN', auras = {} },
 { name = 'Gus', sub = 2, class = 'HUNTER', auras = {}, far = true },
} }
IsInGroup = function() return #group.members > 0 end
IsInRaid = function() return group.inRaid end
GetNumGroupMembers = function() return #group.members end
GetRaidRosterInfo = function(i)
 local m = group.members[i]
 return m.name, 0, m.sub, 60, m.class:sub(1,1) .. m.class:sub(2):lower(), m.class
end
function member(unit)
 local n = unit:match('^raid(%d+)$')
 if n then return group.members[tonumber(n)] end
 if unit == 'player' then return group.members[1] end
 local p = unit:match('^party(%d+)$')
 return p and group.members[tonumber(p) + 1] or nil
end
UnitExists = function(u) return member(u) ~= nil end
UnitIsConnected = function(u) local m = member(u) return m ~= nil and not m.off end
UnitIsVisible = function(u) local m = member(u) return m ~= nil and not m.far end
UnitName = function(u) local m = member(u) return m and m.name end
UnitClass = function(u) local m = member(u) return m and (m.class:sub(1,1) .. m.class:sub(2):lower()), m and m.class end
calls = 0
"""

MODERN_AURAS = """
C_UnitAuras = { GetAuraDataByIndex = function(unit, i, filter)
 assert(filter == 'HELPFUL', 'only helpful auras are read')
 calls = calls + 1
 local m = member(unit)
 local name = m and m.auras[i]
 if not name then return nil end
 return { name = name, spellId = 900000 + i }
end }
"""

CLASSIC_AURAS = """
UnitAura = function(unit, i, filter)
 assert(filter == 'HELPFUL', 'only helpful auras are read')
 calls = calls + 1
 local m = member(unit)
 local name = m and m.auras[i]
 if not name then return nil end
 return name, 'icon', 1, nil, 0, 0, 'player', false, false, 800000 + i
end
"""


def fresh(extra: str = "", auras: str = MODERN_AURAS):
    lua = LuaRuntime()
    lua.execute(STUBS)
    lua.execute(GROUP)
    lua.execute(auras)
    lua.execute(extra)
    for file in ["core.lua", "modules/raid_data.lua", "modules/raid.lua"]:
        lua.execute((root / file).read_text(encoding="utf-8"))
    lua.execute("Everloot.frame.onEvent(nil,'ADDON_LOADED','Everloot')")
    return lua


lua = fresh()
lua.execute("""
local note
for _, line in ipairs(printed) do if line:find('raid:') or line:find('  raid:') then note = line end end
assert(Everloot.RaidCommand, 'the module registers its command')
assert(Everloot.RaidData.build == '1.60.1.70450', 'the buff list names its build')
assert(EverlootDB.toggles.raid == nil, 'no toggle is needed: nothing is recorded')
""")

# The report: who lacks what, per group.
lua.execute("""
printed = {}
SlashCmdList.EVERLOOT('raid')
local text = table.concat(printed, '\\n')
assert(text:find('7 members', 1, true), text)
assert(text:find('hand-checked and unconfirmed', 1, true), 'the report labels the list unconfirmed')
assert(not text:find('may be out of date', 1, true), 'same build, no warning: ' .. text)
local g1 = text:match('Group 1: ([^\\n]*)')
local g2 = text:match('Group 2: ([^\\n]*)')
assert(g1 and g1:find('missing', 1, true), g1)
assert(not g1:find('Battle Shout', 1, true), 'group 1 has Battle Shout: ' .. text)
assert(not g1:find('Mark of the Wild', 1, true) and not g1:find('Arcane Intellect', 1, true), 'group 1 has these')
assert(g1:find('Power Word: Fortitude', 1, true), 'group 1 lacks Fortitude')
assert(g2:find('Battle Shout', 1, true), 'group 2 lacks Battle Shout (Fay and Gus read nothing)')
assert(not g2:find('Power Word: Fortitude', 1, true) and not g2:find('Strength of Earth', 1, true), 'group 2 has these')
assert(text:find('1 member(s) could not be read', 1, true), 'Gus is out of range and is not counted as lacking')
""")

# Aura reading falls back to UnitAura on a client without C_UnitAuras.
lua = fresh(auras=CLASSIC_AURAS)
lua.execute("""
printed = {}
SlashCmdList.EVERLOOT('raid')
local text = table.concat(printed, '\\n')
assert(not text:match('Group 1: ([^\\n]*)'):find('Battle Shout', 1, true), 'UnitAura fallback reads names')
""")

# No aura API at all: members are unreadable, the command reports that and does not error.
lua = fresh(auras="")
lua.execute("""
printed = {}
SlashCmdList.EVERLOOT('raid')
local text = table.concat(printed, '\\n')
assert(text:find('nobody could be read', 1, true), text)
""")

# Spell ids work when a buff carries them (the generated table adds them later).
lua = fresh()
lua.execute("""
local data = { families = { { id = 'f', label = 'F' } }, buffs = { { family = 'f', id = 'f1', scope = 'raid', names = { 'Nope' }, spellIds = { 1001 } } } }
local groups = Everloot.Raid.Missing({
 { group = 1, readable = true, auras = { [1001] = true } },
 { group = 2, readable = true, auras = {} },
}, data)
assert(#groups[1].missing == 0 and groups[2].missing[1] == 'F', 'a spell id match counts')
""")

# A client on another build is told the list may be out of date.
lua = fresh("BUILD = { '1.60.1', '70500', 'Oct 9 2026', 11508 }")
lua.execute("""
printed = {}
SlashCmdList.EVERLOOT('raid')
assert(table.concat(printed, '\\n'):find('build 1.60.1.70500, so the list may be out of date', 1, true))
""")

# Cost: one pass reads each member's auras once, at most 40 per member.
lua = fresh()
lua.execute("""
calls = 0
SlashCmdList.EVERLOOT('raid')
assert(calls <= 7 * 41, 'at most 41 aura reads per member, got ' .. calls)
""")

# Not in a group.
lua = fresh("group.members = {}")
lua.execute("""
printed = {}
SlashCmdList.EVERLOOT('raid')
assert(table.concat(printed, '\\n'):find('not in a group', 1, true))
""")

# Party (not a raid): everyone is group 1, units are player and party1..4.
lua = fresh("group.inRaid = false; group.members = { group.members[1], group.members[2] }")
lua.execute("""
printed = {}
SlashCmdList.EVERLOOT('raid')
local text = table.concat(printed, '\\n')
assert(text:find('2 members', 1, true) and text:find('Group 1:', 1, true) and not text:find('Group 2:', 1, true), text)
""")

# The share code: the same format the site reads (web/src/lib/raid.ts).
lua = fresh()
lua.execute("""
local R = Everloot.Raid
local members = {}
for i = 1, 7 do
 local m = group.members[i]
 members[i] = { group = m.sub, class = m.class }
end
local code = R.Code(members, '1.60.1.70450')
-- warrior druid mage, two empty slots, shaman priest paladin hunter, one empty:
-- 10 90 70 00 00 60 50 20 30 00  ->  "1090700000605020 30"  (trailing "00" dropped)
assert(code == 'ELR1-10-1.60.1.70450-MTA5MDcwMDAwMDYwNTAyMDMw', code)
-- the site test encodes mage tree 3 and a warrior as "NzMwMDEw"; the addon writes tree 0, so mage is "70".
assert(R.Code({ { group = 1, class = 'MAGE' } }, '1.60.1.70450') == 'ELR1-10-1.60.1.70450-NzA', 'mage alone is 70')
assert(R.Code({}, '1.60.1.70450') == 'ELR1-10-1.60.1.70450-', 'an empty raid is a short code')
assert(R.Code(members, nil) == nil, 'no build, no code')
assert(R.Code(members, '70450') == nil, 'a malformed build is refused')

-- Size follows the highest group: group 3 needs 20 slots, group 5 needs 40.
local g3 = R.Code({ { group = 3, class = 'MAGE' } }, '1.60.1.70450')
assert(g3:find('^ELR1%-20%-'), g3)
local g5 = R.Code({ { group = 5, class = 'MAGE' } }, '1.60.1.70450')
assert(g5:find('^ELR1%-40%-'), g5)
-- A sixth player in one group does not spill into the next group's slots.
local six = {}
for i = 1, 6 do six[i] = { group = 1, class = 'MAGE' } end
local sixCode = R.Code(six, '1.60.1.70450')
assert(sixCode == R.Code({ six[1], six[2], six[3], six[4], six[5] }, '1.60.1.70450'), 'five slots per group')
-- An unknown class is an empty slot.
assert(R.Code({ { group = 1, class = 'DEATHKNIGHT' } }, '1.60.1.70450') == 'ELR1-10-1.60.1.70450-', 'unknown class is empty')

printed = {}
SlashCmdList.EVERLOOT('raid code')
local text = table.concat(printed, '\\n')
assert(text:find('Everloot raid code: ELR1-10-1.60.1.70450-', 1, true), text)
""")
print("raid contract ok")
