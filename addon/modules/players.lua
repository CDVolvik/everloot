-- Everloot player pages: who you saw, by name. Off until the player runs /everloot players on.
--
-- One kind of row, written in the shape the upload sends:
--   player_seen  a character: name, realm, race, class, level and guild (when the game shows one)
-- It is your own character at login and level-up, and a player you target, mouse over or group with.
-- Race and class are the game's tokens (UnitRace and UnitClass second return), not display names.
--
-- This is the module that reads other players' names and guilds, so it is separate from census.lua, which
-- never does, and it reads nothing else: no position, gear, inspection, roster or chat. The contract test
-- fails if this file names a call that could, and lists every game call it may make. The design is
-- docs/design/specs/2026-10-20-player-pages-design.md.
--
-- One row per character, kept in place: a new level, race, class or guild changes the row, and a new UTC day
-- moves its date (capturedAt), so the file holds the newest sighting, not a history. The row keeps no time of
-- day on the site (it keeps the date) and no position. Load on the game and the file:
--   * a player already read is not read again for 10 minutes, and two reads from target or mouseover are at
--     least a quarter of a second apart, so mouseover costs a few table lookups; a roster change reads the
--     group once;
--   * at most 300 new characters a UTC day, at most 1,000 rows in the file (the oldest rows go first);
--   * about 200 bytes a row, so a full file adds about 200 KB to SavedVariables.
-- Players from another realm are skipped: UnitName names their realm, and one realm string is all a row holds.

local E = Everloot
local P = {}
E.Players = P

local MAX_ROWS = 1000
local NEW_PER_DAY = 300
local RESEEN_SECONDS = 600
local MIN_GAP = 0.25
local MAX_TRACKED = 2000
local MAX_LEVEL = 60
local RACE = "^%a+$"                       -- 2 to 24 letters, e.g. Scourge, Skyborne
local CLASS = "^%u+$"                      -- 3 to 16 capitals, e.g. HUNTER
local NAME = "^[%a\128-\255]+$"            -- letters only; accented letters are multi-byte, so 2 to 48 bytes
local GUILD = "^[%w\128-\255][%w\128-\255 '%-]*$"

-- Every call this module makes to the game. A test scans the source against this list.
P.API = { "UnitIsPlayer", "UnitGUID", "UnitName", "UnitLevel", "UnitRace", "UnitClass", "GetGuildInfo", "GetRealmName", "GetTime", "IsInRaid" }

local PARTY, RAID = {}, {}
for i = 1, 4 do PARTY[i] = "party" .. i end
for i = 1, 40 do RAID[i] = "raid" .. i end

local active = false
local selfGuid
local lastRead = -math.huge
local readAt, tracked = {}, 0      -- guid -> GetTime() of its last read; the guids are never saved
local index = {}                   -- "name\0realm" -> row, rebuilt from the file at login

local function rows()
  local list = EverlootDB.records.player_seen
  if not list then list = {}; EverlootDB.records.player_seen = list end
  return list
end

local function keyOf(name, realm)
  return name:lower() .. "\0" .. realm
end

local function stamp()
  return date("!%Y-%m-%dT%H:%M:%SZ")
end

local function today()
  return date("!%Y-%m-%d")
end

--- "player_seen:<n>". The number only goes up, and holds nothing about the player.
local function eventId()
  local n = (tonumber(EverlootDB.playersNext) or 0) + 1
  EverlootDB.playersNext = n
  return "player_seen:" .. string.format("%.0f", n)
end

local function token(value, pattern, min, max)
  return type(value) == "string" and #value >= min and #value <= max and value:find(pattern) ~= nil
end

--- Same rule as the protocol's validRealm, in bytes: letters, digits, spaces, apostrophes, hyphens.
local function realmOf(value)
  if type(value) ~= "string" then return nil end
  value = value:gsub("^%s+", ""):gsub("%s+$", "")
  if #value < 2 or #value > 40 or not value:find("^[%w\128-\255][%w\128-\255 '%-]*$") then return nil end
  return value
end

local function reindex()
  index = {}
  for _, row in ipairs(rows()) do
    if type(row.name) == "string" and type(row.realm) == "string" then index[keyOf(row.name, row.realm)] = row end
  end
end

--- New characters kept today, against the daily cap.
local function newToday()
  local on = today()
  local d = EverlootDB.playersDay
  if type(d) ~= "table" or d.day ~= on then d = { day = on, n = 0 }; EverlootDB.playersDay = d end
  return d
end

--- Keep what was read: change the row if the character has changed, move its date if it is a new day, add it
--- if it is new. Over the file's cap the oldest rows go.
local function keep(name, realm, race, class, level, guild)
  local key = keyOf(name, realm)
  local row = index[key]
  if row then
    local changed = row.level ~= level or row.race ~= race or row.class ~= class or (guild ~= nil and row.guild ~= guild)
    local moved = type(row.capturedAt) ~= "string" or row.capturedAt:sub(1, 10) ~= today()
    if changed or moved then
      row.level, row.race, row.class = level, race, class
      if guild ~= nil then row.guild = guild end
      row.capturedAt = stamp()
    end
    return
  end
  local d = newToday()
  if d.n >= NEW_PER_DAY then return end
  d.n = d.n + 1
  row = {
    installId = EverlootDB.installId, eventId = eventId(), capturedAt = stamp(),
    name = name, realm = realm, race = race, class = class, level = level, guild = guild,
  }
  local list = rows()
  list[#list + 1] = row
  index[key] = row
  while #list > MAX_ROWS do
    local old = table.remove(list, 1)
    if index[keyOf(old.name, old.realm)] == old then index[keyOf(old.name, old.realm)] = nil end
  end
end

--- Read one player unit. `newLevel` is for yourself at level-up, before UnitLevel has it.
local function read(unit, newLevel)
  -- The realm-aware call, not the plain one: the plain call gives the server, which is never empty,
  -- so a client that answers with the server would drop every player. A unit on another realm
  -- carries a realm that is not ours, and that is the only thing that makes it another realm.
  local name, unitRealm = UnitName(unit, true)
  local ourRealm = GetRealmName()
  local _, ourServer = UnitName("player")
  local anotherRealm = unitRealm and unitRealm ~= "" and unitRealm ~= ourRealm and unitRealm ~= ourServer
  if not token(name, NAME, 2, 48) or anotherRealm then return true end
  local level = tonumber(newLevel) or UnitLevel(unit)
  if type(level) ~= "number" or level < 1 or level > MAX_LEVEL then return false end
  local _, race = UnitRace(unit)
  local _, class = UnitClass(unit)
  local realm = realmOf(GetRealmName())
  if not token(race, RACE, 2, 24) or not token(class, CLASS, 3, 16) or not realm then return true end
  local guild = GetGuildInfo(unit)
  if not token(guild, GUILD, 2, 96) then guild = nil end
  keep(name, realm, race, class, math.floor(level), guild)
  return true
end

--- A player unit you see. Skips yourself, creatures and anything read too recently. A roster change reads
--- the whole group at once (`burst`): that is at most 40 players, and each is then left alone for 10 minutes.
local function seen(unit, burst)
  if not active or not UnitIsPlayer(unit) then return end
  local guid = UnitGUID(unit)
  if not guid then return end
  if not selfGuid then selfGuid = UnitGUID("player") end
  if guid == selfGuid then return end
  local now = GetTime()
  local last = readAt[guid]
  if last and now - last < RESEEN_SECONDS then return end
  if not burst and now - lastRead < MIN_GAP then return end
  lastRead = now
  if not read(unit) then return end   -- a hidden level ("??") is tried again next time
  if not last then
    tracked = tracked + 1
    if tracked > MAX_TRACKED then readAt = {}; tracked = 1 end
  end
  readAt[guid] = now
end

local function group()
  local units = (IsInRaid and IsInRaid()) and RAID or PARTY
  for i = 1, #units do seen(units[i], true) end
end

--- Your own character. PLAYER_LEVEL_UP passes the new level before UnitLevel has it.
local function recordSelf(newLevel)
  if not active then return end
  selfGuid = UnitGUID("player")
  read("player", newLevel)
end

--- /everloot players off: stop reading and delete every player row in this file.
function P.Withdraw()
  active = false
  EverlootDB.records.player_seen = nil
  EverlootDB.playersDay = nil
  if EverlootDB.paused then EverlootDB.paused.player_seen = nil end
  index, readAt, tracked = {}, {}, 0
end

--- One line for /everloot players.
function P.StatusLine()
  if not E:IsEnabled("players") then
    return "Everloot players: off. /everloot players on starts it."
  end
  -- The number counts what is in the file, and the file is written by the game when it saves. A row read
  -- since the last save is in the game but not yet in the file, so a number can go down after a reload and
  -- a row can be lost if the client ends before the game saves. The line says so, because a player who
  -- counted a character and then saw a smaller number has to know why.
  return string.format("Everloot players: %s. %d characters kept (at most %d).\nThe game writes this file when it saves, so the number can change and a row can be lost if the client ends first: log out to be sure a character is in it. Nothing leaves it until you upload it: the Desktop App, with the player pages allowed, or everloot.app/upload.",
    active and "on" or "on after /reload", E:Count("player_seen"), MAX_ROWS)
end

E:RegisterModule("players", function()
  for _, name in ipairs(P.API) do
    if type(_G[name]) ~= "function" then error(name .. " unavailable", 0) end
  end
  active = true
  reindex()
  local f = E.frame
  f:RegisterEvent("PLAYER_LOGIN")
  f:RegisterEvent("PLAYER_LEVEL_UP")
  f:RegisterEvent("PLAYER_TARGET_CHANGED")
  f:RegisterEvent("UPDATE_MOUSEOVER_UNIT")
  f:RegisterEvent("GROUP_ROSTER_UPDATE")
  f:HookScript("OnEvent", function(_, event, arg1)
    if not active then return end
    if event == "UPDATE_MOUSEOVER_UNIT" then pcall(seen, "mouseover")
    elseif event == "PLAYER_TARGET_CHANGED" then pcall(seen, "target")
    elseif event == "GROUP_ROSTER_UPDATE" then pcall(group)
    elseif event == "PLAYER_LOGIN" then pcall(recordSelf); pcall(group)
    elseif event == "PLAYER_LEVEL_UP" then pcall(recordSelf, arg1) end
  end)
  return "ready (names of your characters and of players you target, mouse over or group with; /everloot players off deletes the rows)"
end)
