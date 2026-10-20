"""Run with: uv run --with lupa --with jsonschema python addon/tests/players_contract.py

The players module: off by default, one row per character kept in place, and nothing read about another
player beyond name, realm, race, class, level and guild. Reads are throttled (10 minutes per player, a quarter
of a second between reads), new characters are capped at 300 a UTC day, and the file holds at most 1,000 rows
with the oldest going first. The rows are checked in the exact shape the upload sends, against the protocol's
JSON Schema.
"""
import json
import re
from pathlib import Path

from lupa.lua51 import LuaRuntime

from protocol_schema import check_rows, to_plain

root = Path(__file__).parents[1]
toc = (root / "Everloot.toc").read_text(encoding="utf-8")
assert "modules\\players.lua" in toc, "the players module must be in the TOC"
assert toc.index("modules\\players.lua") > toc.index("core.lua"), "core loads before the module"
source = (root / "modules" / "players.lua").read_text(encoding="utf-8")

# --- Nothing in the file can read a position, gear, a roster or anything else about a player ---
# Scanned over the whole file, comments included, so the names cannot creep in anywhere. Names and guilds are
# the point of this module, so UnitName and GetGuildInfo are allowed, and only those.
FORBIDDEN = [
    # other ways to a name or an id
    "UnitFullName", "GetUnitName", "UnitPVPName", "GetPlayerInfoByGUID", "C_PlayerInfo", "Ambiguate",
    # the guild roster: a whole guild's members are the officers' data, never read here
    "GetGuildRosterInfo", "GetNumGuildMembers", "C_GuildInfo", "C_Club", "IsInGuild", "GetGuildRosterLastOnline",
    # gear and inspection
    "GetInventoryItemLink", "GetInventoryItemID", "GetInventoryItemQuality", "GetInventorySlotInfo",
    "GetAverageItemLevel", "C_PaperDollInfo", "NotifyInspect", "CanInspect", "GetInspectSpecialization", "C_Item",
    # position
    "C_Map", "UnitPosition", "GetPlayerMapPosition", "GetBestMapForUnit", "GetZoneText", "GetRealZoneText",
    "GetSubZoneText", "GetMinimapZoneText", "CheckInteractDistance", "UnitDistanceSquared", "UnitInRange",
    # chat, friends, the who list
    "SendWho", "GetWhoInfo", "C_FriendList", "GetFriendInfo", "BNGetFriendInfo", "C_BattleNet",
]
for name in FORBIDDEN:
    assert not re.search(r"\b" + re.escape(name) + r"\b", source), f"players.lua names {name}"
# No nameplate or inspect events: they would read far more players than the player is looking at.
for event in ("NAME_PLATE_UNIT_ADDED", "INSPECT_READY", "GUILD_ROSTER_UPDATE", "WHO_LIST_UPDATE", "CHAT_MSG"):
    assert event not in source, f"players.lua listens to {event}"

# Every game call in the code (comments stripped) is on the module's own list, and the list holds only these.
code = "\n".join(line.split("--")[0] for line in source.splitlines())
called = set(re.findall(r"(?<![\w.:])([A-Z][A-Za-z0-9_]*)\s*\(", code))
ALLOWED = {"UnitIsPlayer", "UnitGUID", "UnitName", "UnitLevel", "UnitRace", "UnitClass", "GetGuildInfo", "GetRealmName", "GetTime", "IsInRaid"}
assert called <= ALLOWED, f"players.lua calls {sorted(called - ALLOWED)}, which are not on the players list"
declared = set(re.search(r"P\.API = \{([^}]*)\}", source).group(1).replace('"', "").replace(" ", "").split(","))
assert declared == ALLOWED, f"P.API lists {sorted(declared)}"
# The census stays as it was: it still never names another player.
assert "UnitName" not in (root / "modules" / "census.lua").read_text(encoding="utf-8"), "census.lua must stay anonymous"

WORLD = """
NOW_T = 1792281600 -- 2026-10-18T00:00:00Z
GT = 1000.0
time = function() return NOW_T end
date = function(format, t) return os.date(format, t or NOW_T) end
GetTime = function() return GT end
printed = {}
print = function(...) printed[#printed + 1] = table.concat({ ... }, ' ') end
SlashCmdList = {}
registered = {}
CreateFrame = function() return {
 RegisterEvent=function(_, name) registered[name] = (registered[name] or 0) + 1 end,
 SetScript=function(self, _, f) self.onEvent=f end,
 HookScript=function(self, _, f) self.hooks=self.hooks or {}; table.insert(self.hooks,f) end
} end

-- Units by token. A forbidden call is counted, never answered.
units = {}
me = { guid = 'Player-4242-00AABBCC', player = true, name = 'Myself', race = 'Skyborne', class = 'HUNTER', level = 12, guild = 'Night Watch' }
units.player = me
realm = 'Forever Pioneer'
inRaid = false
forbidden, nameCalls = 0, 0
UnitIsPlayer = function(unit) local u = units[unit]; return u ~= nil and u.player == true end
UnitGUID = function(unit) local u = units[unit]; return u and u.guid end
UnitName = function(unit) local u = units[unit]; if u then nameCalls = nameCalls + 1; return u.name, u.realmName end end
UnitLevel = function(unit) local u = units[unit]; return u and u.level end
UnitRace = function(unit) local u = units[unit]; if u then return u.race, u.race, 3 end end
UnitClass = function(unit) local u = units[unit]; if u then return 'Display', u.class, 3 end end
GetGuildInfo = function(unit) local u = units[unit]; if u and u.guild then return u.guild, 'Rank', 1 end end
GetRealmName = function() return realm end
IsInRaid = function() return inRaid end
for _, name in ipairs({ 'GetGuildRosterInfo', 'GetNumGuildMembers', 'UnitFullName', 'UnitPosition', 'GetInventoryItemLink', 'NotifyInspect', 'GetPlayerInfoByGUID', 'GetUnitName' }) do
 _G[name] = function() forbidden = forbidden + 1 end
end

function nameOf(n)
 local s = ''
 repeat s = string.char(97 + n % 26) .. s; n = math.floor(n / 26) until n == 0
 return 'Pl' .. s
end

function player(n, fields)
 local u = { guid = string.format('Player-4242-%08X', n), player = true, name = nameOf(n), race = 'Orc', class = 'WARRIOR', level = 20 }
 for k, v in pairs(fields or {}) do u[k] = v end
 return u
end
"""


def lua_literal(value):
    """A plain value as a Lua table constructor, the way the game writes SavedVariables back."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
    if isinstance(value, list):
        return "{" + ", ".join(lua_literal(v) for v in value) + "}"
    return "{" + ", ".join(f"[{lua_literal(k)}] = {lua_literal(v)}" for k, v in value.items()) + "}"


def fresh(saved: str = "nil", extra: str = "", files=("core.lua", "modules/players.lua")):
    lua = LuaRuntime()
    lua.execute(WORLD)
    lua.execute(extra)
    lua.execute(f"EverlootDB = {saved}")
    for file in files:
        lua.execute((root / file).read_text(encoding="utf-8"))
    lua.execute("""
Everloot.frame.onEvent(nil,'ADDON_LOADED','Everloot')
function event(name, arg) for _, hook in ipairs(Everloot.frame.hooks or {}) do hook(nil, name, arg) end end
function reload() Everloot.frame.hooks = nil; registered = {}; Everloot.frame.onEvent(nil,'ADDON_LOADED','Everloot'); event('PLAYER_LOGIN') end
function rows() return EverlootDB.records.player_seen or {} end
function sweep(from, to, fields)
 for i = from, to do GT = GT + 1; units.mouseover = player(i, fields); event('UPDATE_MOUSEOVER_UNIT') end
end
""")
    return lua


# --- Off by default: nothing registered, nothing read, nothing recorded ---
lua = fresh()
lua.execute("""
assert(EverlootDB.toggles.players == false, 'players is off by default')
for _, name in ipairs({ 'PLAYER_TARGET_CHANGED', 'UPDATE_MOUSEOVER_UNIT', 'GROUP_ROSTER_UPDATE', 'PLAYER_LOGIN', 'PLAYER_LEVEL_UP' }) do
 assert(registered[name] == nil, 'off registers nothing: ' .. name)
end
assert(Everloot.frame.hooks == nil, 'off adds no event handler')
units.target = player(1); units.mouseover = player(2); units.party1 = player(3)
event('PLAYER_LOGIN'); event('PLAYER_TARGET_CHANGED'); event('UPDATE_MOUSEOVER_UNIT'); event('GROUP_ROSTER_UPDATE')
assert(#rows() == 0, 'nothing is recorded while players is off')
assert(nameCalls == 0, 'no name was read while players is off')
assert(string.find(Everloot:Status(), 'players: off by toggle', 1, true), 'status shows players is off')
SlashCmdList.EVERLOOT('players')
assert(string.find(printed[#printed], 'players: off', 1, true), 'the status line says off')
""")

# An install from before this module, even one with the census on, keeps players off.
lua = fresh("{ installId = 'abcd-1234', toggles = { openworld = true, census = true }, records = {} }")
lua.execute("assert(EverlootDB.toggles.players == false and EverlootDB.toggles.census == true, 'an upgraded install starts with players off')")

# --- On: your own character and the players you see ---
lua = fresh()
lua.execute("""
SlashCmdList.EVERLOOT('players on')
assert(EverlootDB.toggles.players == true, '/everloot players on turns it on')
local said = printed[#printed]
assert(string.find(said, 'name, realm, race, class, level and guild', 1, true) and string.find(said, 'upload page', 1, true)
  and string.find(said, 'Never where they are', 1, true) and string.find(said, 'hidden', 1, true), said)
reload()
assert(registered.PLAYER_TARGET_CHANGED and registered.UPDATE_MOUSEOVER_UNIT and registered.GROUP_ROSTER_UPDATE and registered.PLAYER_LEVEL_UP)
assert(not registered.NAME_PLATE_UNIT_ADDED and not registered.GUILD_ROSTER_UPDATE, 'no nameplate or roster events')
assert(string.find(Everloot:Status(), 'players: ready', 1, true), Everloot:Status())

local own = rows()
assert(#own == 1, 'login records your character')
local r = own[1]
assert(r.name == 'Myself' and r.realm == 'Forever Pioneer' and r.race == 'Skyborne' and r.class == 'HUNTER' and r.level == 12 and r.guild == 'Night Watch', 'self row')
assert(r.installId == EverlootDB.installId and r.capturedAt == '2026-10-18T00:00:00Z' and r.eventId == 'player_seen:1', tostring(r.eventId))

-- Level-up passes the new level before UnitLevel has it; the same row takes it.
NOW_T = NOW_T + 60
event('PLAYER_LEVEL_UP', 13)
assert(#rows() == 1 and rows()[1].level == 13 and rows()[1].capturedAt == '2026-10-18T00:01:00Z', 'level-up updates your row in place')

GT = GT + 5
units.target = player(1, { level = 30, guild = 'Red Hand' })
event('PLAYER_TARGET_CHANGED')
GT = GT + 5
units.mouseover = player(2, { race = 'Scourge', class = 'PRIEST' })
event('UPDATE_MOUSEOVER_UNIT')
units.party1 = player(3, { race = 'Human' }); units.party2 = player(4)
event('GROUP_ROSTER_UPDATE')
local seen = rows()
assert(#seen == 5, 'you, target, mouseover and two party members; got ' .. #seen)
assert(seen[2].name == nameOf(1) and seen[2].level == 30 and seen[2].guild == 'Red Hand' and seen[2].eventId == 'player_seen:2')
assert(seen[3].race == 'Scourge' and seen[3].class == 'PRIEST' and seen[3].guild == nil, 'no guild is no field')
assert(seen[4].race == 'Human' and seen[5].name == nameOf(4))

-- A raid reads raid1..raid40, and you are in it: you are not read twice.
inRaid = true
GT = GT + 5
units.raid1 = me; units.raid2 = player(5)
event('GROUP_ROSTER_UPDATE')
assert(#seen == 6 and seen[6].name == nameOf(5), 'raid members are read, you are not')

-- Skipped: creatures, yourself, hidden levels, another realm, a missing field, a name that is not a name.
local before = #seen
for _, u in ipairs({
 { guid = 'Creature-0-4242-0-1-299-00000ABCDE', player = false, name = 'Wolf', race = 'Orc', class = 'WARRIOR', level = 5 },
 player(9, { player = false }),
 me,
 player(10, { level = -1 }), player(11, { level = 0 }), player(12, { level = 61 }),
 player(13, { realmName = 'Elsewhere' }),
 player(14, { race = false }), player(15, { class = '' }), player(16, { class = 'Warrior' }), player(17, { class = 'XY' }),
 player(18, { race = 'X' }), player(19, { race = 'Night Elf' }),
 player(20, { name = 'Bob1' }), player(21, { name = 'Two Words' }), player(22, { name = 'A' }), player(23, { name = false }), player(24, { name = '' }),
}) do
 GT = GT + 1
 units.mouseover = u
 event('UPDATE_MOUSEOVER_UNIT')
end
assert(#seen == before, 'none of those is a row; got ' .. (#seen - before))
assert(forbidden == 0, 'no roster, gear, position or inspection call was made')

-- A guild the protocol would refuse is left off the row; the player is still kept.
GT = GT + 1
units.mouseover = player(30, { guild = 'Bad<tag>' })
event('UPDATE_MOUSEOVER_UNIT')
assert(#seen == before + 1 and seen[#seen].guild == nil)
GT = GT + 1
units.mouseover = player(31, { name = 'Zhang\xc4\x81' })  -- UTF-8 letters are letters
event('UPDATE_MOUSEOVER_UNIT')
assert(#seen == before + 2 and seen[#seen].name == 'Zhang\xc4\x81')
""")

# --- One row per character, updated in place ---
lua.execute("""
local seen = rows()
local count = #seen
GT = GT + 700
units.mouseover = player(1, { level = 30, guild = 'Red Hand' })
event('UPDATE_MOUSEOVER_UNIT')
assert(#seen == count and seen[2].capturedAt == '2026-10-18T00:01:00Z', 'same data on the same day: the row is untouched')
local snapshot = {}
for k, v in pairs(seen[2]) do snapshot[k] = v end
GT = GT + 700
units.mouseover = player(1, { level = 30, guild = 'Red Hand' })
event('UPDATE_MOUSEOVER_UNIT')
for k, v in pairs(seen[2]) do assert(snapshot[k] == v, 'a repeat changed ' .. k) end

-- A new level changes the row and its time; a missing guild keeps the one it had.
NOW_T = NOW_T + 3600
GT = GT + 700
units.mouseover = player(1, { level = 31, guild = false })
event('UPDATE_MOUSEOVER_UNIT')
assert(#seen == count and seen[2].level == 31 and seen[2].guild == 'Red Hand' and seen[2].capturedAt == '2026-10-18T01:01:00Z', 'new level, kept guild')
assert(seen[2].eventId == 'player_seen:2', 'the row keeps its event id')
-- A new guild replaces the old one.
GT = GT + 700
units.mouseover = player(1, { level = 31, guild = 'Blue Hand' })
event('UPDATE_MOUSEOVER_UNIT')
assert(seen[2].guild == 'Blue Hand')

-- The next UTC day moves the date of a character seen again, with no new row.
NOW_T = 1792281600 + 86400 + 5
GT = GT + 700
units.mouseover = player(1, { level = 31, guild = 'Blue Hand' })
event('UPDATE_MOUSEOVER_UNIT')
assert(#seen == count and seen[2].capturedAt == '2026-10-19T00:00:05Z', 'a new day moves the date, not the row count')
""")

# --- Throttle: a player is read again after 10 minutes, and target/mouseover reads keep a quarter-second apart ---
lua = fresh("{ installId = 'abcd-1234', toggles = { players = true }, records = {} }")
lua.execute("""
GT = 5000
units.mouseover = player(1)
event('UPDATE_MOUSEOVER_UNIT')
local reads = nameCalls
for _ = 1, 100 do GT = GT + 5; event('UPDATE_MOUSEOVER_UNIT') end
assert(nameCalls == reads, 'the same player within 10 minutes is not read again')
GT = GT + 600
event('UPDATE_MOUSEOVER_UNIT')
assert(nameCalls > reads, 'after 10 minutes the player is read again')
assert(#rows() == 1)

-- Two different players in the same instant: the second waits for the next event, and is then read.
GT = GT + 1
units.mouseover = player(2); units.target = player(3)
event('UPDATE_MOUSEOVER_UNIT'); event('PLAYER_TARGET_CHANGED')
assert(#rows() == 2, 'only the first of two reads in one instant')
GT = GT + 0.3
event('PLAYER_TARGET_CHANGED')
assert(#rows() == 3, 'the second is read once a quarter second has passed')

-- A hidden level is tried again: nothing is remembered for it.
GT = GT + 1
units.mouseover = player(4, { level = -1 })
event('UPDATE_MOUSEOVER_UNIT')
assert(#rows() == 3)
GT = GT + 1
units.mouseover = player(4, { level = 22 })
event('UPDATE_MOUSEOVER_UNIT')
assert(#rows() == 4 and rows()[4].level == 22)
""")

# --- The busy path allocates nothing when the player was read recently ---
lua.execute("""
units.mouseover = player(4, { level = 22 })
event('UPDATE_MOUSEOVER_UNIT')
local hooks = Everloot.frame.hooks
collectgarbage('collect'); collectgarbage('stop')
local before = collectgarbage('count')
for _ = 1, 20000 do GT = GT + 0.001; hooks[1](nil, 'UPDATE_MOUSEOVER_UNIT') end
local grew = collectgarbage('count') - before
collectgarbage('restart')
assert(grew < 1, 'mouseover over a recently read player allocated ' .. grew .. ' KB over 20000 events')
""")

# --- Caps: 300 new characters a UTC day, 1,000 rows in the file with the oldest going first ---
lua = fresh("{ installId = 'abcd-1234', toggles = { players = true }, records = {} }")
lua.execute("""
sweep(1, 400)
assert(#rows() == 300, 'at most 300 new characters a day; got ' .. #rows())
assert(rows()[300].name == nameOf(300))
-- A character already kept still updates after the daily cap is reached.
GT = GT + 700
units.mouseover = player(1, { level = 44 })
event('UPDATE_MOUSEOVER_UNIT')
assert(rows()[1].level == 44, 'an existing character is still updated at the cap')
for day = 1, 3 do
 NOW_T = NOW_T + 86400
 sweep(day * 1000, day * 1000 + 299)
end
local list = rows()
assert(#list == 1000, 'capped at 1000; got ' .. #list)
assert(list[1].name == nameOf(201), 'the oldest rows went first: ' .. list[1].name)
assert(list[1000].name == nameOf(3299))
assert(EverlootDB.paused == nil or EverlootDB.paused.player_seen == nil, 'players rotates instead of pausing')
-- A character that gave way is a new row if it is seen again.
NOW_T = NOW_T + 86400
GT = GT + 700
units.mouseover = player(2)
event('UPDATE_MOUSEOVER_UNIT')
assert(#list == 1000 and list[1000].name == nameOf(2) and list[1].name == nameOf(202), list[1].name)
""")

# --- A reload finds the rows again and adds no duplicates ---
saved = lua_literal(to_plain(lua.globals().EverlootDB))
lua = fresh(saved, "GT = 90000; NOW_T = NOW_T + 86400 * 5")
lua.execute("""
event('PLAYER_LOGIN')
local count = #rows()
GT = GT + 1
units.mouseover = player(2, { level = 20 })
event('UPDATE_MOUSEOVER_UNIT')
assert(#rows() == count, 'a character in the file is found again, not added twice (' .. count .. ' -> ' .. #rows() .. ')')
""")

# --- The record each row becomes on upload ---
lua = fresh("{ installId = 'abcd-1234', toggles = { players = true }, records = {} }")
lua.execute("""
event('PLAYER_LOGIN')
GT = GT + 1
units.target = player(7, { level = 60, race = 'NightElf', class = 'DRUID', guild = "O'Neil-Clan 9" })
event('PLAYER_TARGET_CHANGED')
GT = GT + 1
units.mouseover = player(8)
event('UPDATE_MOUSEOVER_UNIT')
""")
db = lua.globals().EverlootDB
install_id = db.installId
records = [{"kind": "player_seen", "installId": install_id, **row} for row in to_plain(db.records.player_seen)]
assert len(records) == 3
for record in records:
    fields = set(record) - {"kind"}
    required = {"installId", "eventId", "capturedAt", "name", "realm", "race", "class", "level"}
    assert required <= fields <= required | {"guild"}, sorted(fields)
    assert re.fullmatch(r"player_seen:[0-9]+", record["eventId"])
    assert re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", record["capturedAt"])
    assert "guid" not in record and "Player-" not in json.dumps(record), "no GUID leaves the file"
ids = [r["eventId"] for r in records]
assert len(ids) == len(set(ids)), "event ids are unique"
assert records[1] == {
    "kind": "player_seen", "installId": install_id, "eventId": records[1]["eventId"], "capturedAt": "2026-10-18T00:00:00Z",
    "name": "Plh", "realm": "Forever Pioneer", "race": "NightElf", "class": "DRUID", "level": 60, "guild": "O'Neil-Clan 9",
}, records[1]
assert json.loads(json.dumps(records[0])) == records[0], "plain JSON values only"
check_rows("player_seen", [{k: v for k, v in r.items() if k not in ("kind", "installId")} for r in records], install_id)

# --- Off deletes every player row and stops reading at once ---
lua.execute("""
EverlootDB.paused = { player_seen = true, loot = true }
local last = EverlootDB.playersNext
SlashCmdList.EVERLOOT('players off')
assert(EverlootDB.toggles.players == false and #rows() == 0, 'off deletes the player rows')
assert(EverlootDB.paused.player_seen == nil and EverlootDB.paused.loot == true, 'off clears the players pause only')
assert(string.find(printed[#printed], 'deleted', 1, true))
local calls = nameCalls
GT = GT + 1000
units.mouseover = player(50)
event('UPDATE_MOUSEOVER_UNIT'); event('PLAYER_LOGIN')
assert(#rows() == 0 and nameCalls == calls, 'nothing is read after off, before any reload')
SlashCmdList.EVERLOOT('players on')
SlashCmdList.EVERLOOT('players')
assert(string.find(printed[#printed], 'on after /reload', 1, true), printed[#printed])
reload()
SlashCmdList.EVERLOOT('players')
assert(string.find(printed[#printed], 'players: on. 1 characters kept', 1, true), printed[#printed])
assert(tonumber(string.match(EverlootDB.records.player_seen[1].eventId, '%d+')) > last, 'ids are not reused after off')
""")

# --- A client without one of the calls disables the module instead of raising ---
lua = fresh("{ installId = 'abcd-1234', toggles = { players = true }, records = {} }", "GetGuildInfo = nil")
lua.execute("""
event('PLAYER_LOGIN')
assert(#rows() == 0)
assert(string.find(Everloot:Status(), 'players: disabled: GetGuildInfo unavailable', 1, true), Everloot:Status())
""")

# --- The census is untouched: with only the census on, no name is read ---
lua = fresh("{ installId = 'abcd-1234', toggles = { census = true, players = false }, records = {} }", files=("core.lua", "modules/census.lua", "modules/players.lua"))
lua.execute("""
units.mouseover = player(1); units.party1 = player(2)
event('PLAYER_LOGIN'); event('UPDATE_MOUSEOVER_UNIT')
assert(nameCalls == 0, 'the census never reads a name')
assert(#rows() == 0, 'and writes no player row')
""")

print("Lua 5.1 players: off by default, no roster/gear/position calls, one row per character kept in place, throttled reads, "
      "300 new a day, 1000 rows with the oldest dropped, rows match the protocol schema, off deletes, census stays anonymous")
