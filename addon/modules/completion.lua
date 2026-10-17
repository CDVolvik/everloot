-- Everloot completion tracker for WoW: Forever (client 1.60.1, interface 16001): achievements,
-- reputation, titles and quest chains. Off until the player runs /everloot completion on.
--
-- Two kinds of rows, both read from the game's own windows' data and never written back:
--   catalog rows  achievement_catalog, reputation_catalog, title_catalog, quest_chain_catalog:
--                 game facts (ids, names, criteria text), no player data. The site lists an entry
--                 after 3 installs report it identically.
--   owned rows    achievement_owned, reputation_owned, title_owned, quest_owned: this character's own
--                 progress, under an opaque 8-digit key (not the name). Shared only from the upload
--                 page, with the "My collection ownership" choice and a verified grant.
-- A changed achievement or standing replaces its earlier row in this file, so the file does not grow
-- with every point of reputation. Titles and completed quests are written as additions.
--
-- Calls, checked against the client's own files for build 1.60.1.70450 (docs/2026-10-19-addon-0.3.3-beta-checklist.md):
--   GetCategoryList, GetCategoryInfo, GetCategoryNumAchievements, GetAchievementInfo,
--   GetAchievementNumCriteria, GetAchievementCriteriaInfo     achievements (used by Blizzard's windows)
--   C_Reputation.GetNumFactions, GetFactionDataByIndex, IsMajorFaction   reputation (documented)
--   GetNumTitles, GetTitleName, IsTitleKnown                  titles (documented)
--   C_QuestLog.GetAllCompletedQuestIDs                        completed quests (documented)
--   C_QuestLine.GetQuestLineInfo, GetQuestLineQuests          quest chains (documented)
-- A missing call records nothing for that part and /everloot status says which one. The module
-- reads in chunks across frames, never in combat, and calls nothing that changes the game.

local E = Everloot
local C = {}
E.Completion = C

local BUDGET = 250             -- API reads per frame
local DEBOUNCE_SECONDS = 10    -- events arrive in bursts; read once after they settle
local COMBAT_RETRY_SECONDS = 15
local MAX_CATEGORIES = 500
local MAX_PER_CATEGORY = 1000
local MAX_ACHIEVEMENTS = 3000
local MAX_CRITERIA = 5000      -- web/src/lib/intake.ts
local MAX_CRITERIA_KEPT = 100
local MAX_TITLES = 5000
local MAX_FACTIONS = 600
local MAX_IDS_PER_ROW = 200
local MAX_CHAINS = 400
local MAX_ID = 2000000000

local KINDS = { "achievement_catalog", "reputation_catalog", "title_catalog", "quest_chain_catalog",
  "achievement_owned", "reputation_owned", "title_owned", "quest_owned" }

-- Every call this module may make to the game. A test scans the source against this list.
local API = {
  achievements = { "GetCategoryList", "GetCategoryInfo", "GetCategoryNumAchievements", "GetAchievementInfo",
    "GetAchievementNumCriteria", "GetAchievementCriteriaInfo" },
  reputation = { "C_Reputation.GetNumFactions", "C_Reputation.GetFactionDataByIndex" },
  titles = { "GetNumTitles", "GetTitleName", "IsTitleKnown" },
  quests = { "C_QuestLog.GetAllCompletedQuestIDs" },
  chains = { "C_QuestLine.GetQuestLineInfo", "C_QuestLine.GetQuestLineQuests" },
  optional = { "C_Reputation.IsMajorFaction" },   -- absent: renown factions are not told apart
  player = { "UnitGUID", "UnitClass", "UnitLevel" },
  timer = { "C_Timer.After" },
}
C.API = API

local function resolve(path)
  local value = _G
  for part in path:gmatch("[^%.]+") do
    if type(value) ~= "table" then return nil end
    value = value[part]
  end
  return value
end

local function absent(paths)
  local out = {}
  for _, path in ipairs(paths) do
    if type(resolve(path)) ~= "function" then out[#out + 1] = path end
  end
  return out
end
C.Absent = absent

--- One guarded call. Only the values are returned; an error is a nil.
local function call(path, ...)
  local fn = resolve(path)
  if type(fn) ~= "function" then return nil end
  local ok, a, b, c, d, e, f, g, h, i, j, k, l, m, n = pcall(fn, ...)
  if not ok then return nil end
  return a, b, c, d, e, f, g, h, i, j, k, l, m, n
end

local function whole(n, min, max)
  return type(n) == "number" and n == math.floor(n) and n >= min and n <= max
end

--- Plain text of at most `limit` bytes: colour codes, links and textures out, control characters to spaces.
local function plain(text, limit)
  if type(text) ~= "string" then return nil end
  text = text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""):gsub("|T.-|t", ""):gsub("|A.-|a", "")
  text = text:gsub("|H.-|h(.-)|h", "%1"):gsub("%c", " "):gsub("^%s+", ""):gsub("%s+$", "")
  if #text > limit then text = text:sub(1, limit):gsub("[\192-\255][\128-\191]*$", "") end
  if text == "" then return nil end
  return text
end

--- A stored signature: Adler-32 and length, so one changed digit is seen.
local function stamp(text)
  return E.Adler32(text) * 1000 + (#text % 1000)
end

local function hex8(n)
  return string.format("%04x%04x", math.floor(n / 65536) % 65536, n % 65536)
end

--- This character's opaque key, class token and level, or nil, reason.
function C.Identity()
  local guid = call("UnitGUID", "player")
  if type(guid) ~= "string" or guid == "" then return nil, "no player id" end
  local _, token = call("UnitClass", "player")
  if type(token) ~= "string" or not token:find("^%a+$") or #token < 2 or #token > 20 then return nil, "no class" end
  local level = tonumber(call("UnitLevel", "player"))
  if not level or level < 1 then return nil, "no level" end
  return hex8(E.Adler32((EverlootDB.installId or "") .. ":" .. guid)), token, math.min(100, math.floor(level))
end

--- "YYYY-MM-DD" from the achievement's month, day and year (the game gives the year as two digits).
local function earnedOn(month, day, year)
  if not (whole(month, 1, 12) and whole(day, 1, 31) and whole(year, 0, 2100)) then return nil end
  if year < 100 then year = year + 2000 end
  return string.format("%04d-%02d-%02d", year, month, day)
end

-- ---------------------------------------------------------------------------------------------
-- Store: one pass at a time. A row replaces the row its entity had, and the superseded ones are
-- dropped when the pass ends.

local function seenTable()
  local seen = EverlootDB.completionSeen
  if type(seen) ~= "table" then seen = {}; EverlootDB.completionSeen = seen end
  seen.cat = type(seen.cat) == "table" and seen.cat or {}
  for _, bucket in ipairs({ "a", "f", "t", "q" }) do
    if type(seen.cat[bucket]) ~= "table" then seen.cat[bucket] = {} end
  end
  seen.own = type(seen.own) == "table" and seen.own or {}
  return seen
end

local function ownedSeen(seen, key)
  local own = seen.own[key]
  if type(own) ~= "table" then own = {}; seen.own[key] = own end
  for _, bucket in ipairs({ "a", "f", "t", "q" }) do
    if type(own[bucket]) ~= "table" then own[bucket] = {} end
  end
  return own
end

local ROW_KEY = {
  achievement_catalog = function(r) return tostring(r.achievementId) end,
  reputation_catalog = function(r) return tostring(r.factionId) end,
  title_catalog = function(r) return tostring(r.titleId) end,
  quest_chain_catalog = function(r) return tostring(r.questLineId) end,
  achievement_owned = function(r) return r.characterKey .. ":" .. r.achievementId end,
  reputation_owned = function(r) return r.characterKey .. ":" .. r.factionId end,
}

local function newContext()
  return { dead = {}, index = {}, capped = {}, stats = {} }
end

local function stat(ctx, name, delta)
  ctx.stats[name] = (ctx.stats[name] or 0) + (delta or 1)
end

--- The row this entity already has in the file, if any.
local function existing(ctx, kind, key)
  local index = ctx.index[kind]
  if not index then
    index = {}
    ctx.index[kind] = index
    local keyOf = ROW_KEY[kind]
    for _, row in ipairs(EverlootDB.records[kind] or {}) do
      local ok, k = pcall(keyOf, row)
      if ok and k then index[k] = row end
    end
  end
  return index[key]
end

--- Store `row` unless `bucket[id]` already holds its signature. Returns true when a row was written.
local function put(ctx, kind, bucket, id, signature, row)
  if ctx.capped[kind] then return false end
  local mark = stamp(signature)
  if bucket[id] == mark then return false end
  row.installId = EverlootDB.installId
  row.capturedAt = date("!%Y-%m-%dT%H:%M:%SZ")
  local old = existing(ctx, kind, ROW_KEY[kind](row))
  if not E:Store(kind, row) then ctx.capped[kind] = true; return false end
  if old then
    ctx.dead[kind] = ctx.dead[kind] or {}
    ctx.dead[kind][old] = true
  end
  bucket[id] = mark
  stat(ctx, kind)
  return true
end

local function compact(ctx)
  for kind, dead in pairs(ctx.dead) do
    local kept = {}
    for _, row in ipairs(EverlootDB.records[kind] or {}) do
      if not dead[row] then kept[#kept + 1] = row end
    end
    EverlootDB.records[kind] = kept
    if EverlootDB.paused and #kept < E.MAX_ROWS_PER_KIND then EverlootDB.paused[kind] = nil end
  end
end

-- ---------------------------------------------------------------------------------------------
-- Readers. Each runs inside a coroutine and calls spend(n) so a long list is read across frames.

local function categoryNames(id, cache)
  if cache[id] ~= nil then return cache[id][1], cache[id][2] end
  local title, parent = call("GetCategoryInfo", id)
  local name = plain(title, 80)
  local parentName
  if whole(parent, 1, MAX_ID) and parent ~= id then
    parentName = plain((call("GetCategoryInfo", parent)), 80)
  end
  cache[id] = { name, parentName }
  return name, parentName
end

local function readAchievements(ctx, seen, own, identity, spend)
  local categories = call("GetCategoryList")
  if type(categories) ~= "table" then stat(ctx, "achievement_unreadable"); return end
  local names = {}
  local visited, total = {}, 0
  for ci = 1, math.min(#categories, MAX_CATEGORIES) do
    local categoryId = categories[ci]
    if whole(categoryId, 0, MAX_ID) then
      local count = call("GetCategoryNumAchievements", categoryId)
      count = whole(count, 0, MAX_PER_CATEGORY) and count or 0
      local category, parentCategory = categoryNames(categoryId, names)
      spend(1)
      for index = 1, count do
        if total >= MAX_ACHIEVEMENTS then stat(ctx, "achievement_stopped"); return end
        local id, name, points, completed, month, day, year, _, _, _, _, isGuild, byMe = call("GetAchievementInfo", categoryId, index)
        spend(1)
        name = plain(name, 120)
        if category and name and whole(id, 1, MAX_ID) and not visited[id] and not isGuild then
          visited[id] = true
          total = total + 1
          local criteriaCount = call("GetAchievementNumCriteria", id)
          criteriaCount = whole(criteriaCount, 0, MAX_CRITERIA) and criteriaCount or 0
          spend(1)
          local criteria, met = {}, 0
          for ci2 = 1, criteriaCount do
            local text, _, done, _, required = call("GetAchievementCriteriaInfo", id, ci2)
            if done then met = met + 1 end
            if ci2 <= MAX_CRITERIA_KEPT then
              required = whole(required, 0, MAX_ID) and required or 0
              criteria[#criteria + 1] = { text = plain(text, 120) or "", required = required }
            end
            spend(1)
          end
          points = whole(points, 0, 1000) and points or 0
          local sig = { id, name, categoryId, category, tostring(parentCategory), points, criteriaCount }
          for _, c in ipairs(criteria) do sig[#sig + 1] = c.text .. "=" .. c.required end
          put(ctx, "achievement_catalog", seen.cat.a, id, table.concat(sig, "|"), {
            kind = "achievement_catalog", achievementId = id, name = name, categoryId = categoryId,
            category = category, parentCategory = parentCategory, points = points,
            criteriaCount = criteriaCount, criteria = criteria,
          })
          stat(ctx, "achievement_read")
          if identity then
            local done = completed and true or false
            if done or met > 0 then
              local earnedByMe, when
              if done then earnedByMe = byMe and true or false; when = earnedOn(month, day, year) end
              local row = {
                kind = "achievement_owned", characterKey = identity.key, class = identity.class, level = identity.level,
                achievementId = id, completed = done, earnedByMe = earnedByMe, earnedOn = when,
                criteriaMet = met, criteriaTotal = criteriaCount,
              }
              put(ctx, "achievement_owned", own.a, id, table.concat({ id, tostring(done), tostring(row.earnedByMe), tostring(row.earnedOn), met, criteriaCount }, "|"), row)
            end
          end
        end
      end
    end
  end
end

local function readReputation(ctx, seen, own, identity, spend)
  local count = call("C_Reputation.GetNumFactions")
  if not whole(count, 0, MAX_FACTIONS) then stat(ctx, "reputation_unreadable"); return end
  local header
  local collapsed = 0
  local hasMajor = type(resolve("C_Reputation.IsMajorFaction")) == "function"
  for index = 1, count do
    local data = call("C_Reputation.GetFactionDataByIndex", index)
    spend(1)
    if type(data) == "table" then
      local isHeader = data.isHeader and true or false
      if isHeader and data.isCollapsed then collapsed = collapsed + 1 end
      local name = plain(data.name, 80)
      local id = data.factionID
      if isHeader and not data.isHeaderWithRep then
        header = name
      elseif name and whole(id, 1, MAX_ID) then
        local parent = data.isChild and header or nil
        -- A header that carries its own standing is a faction and also the header of the rows under it.
        if isHeader then header = name end
        local major = hasMajor and call("C_Reputation.IsMajorFaction", id) and true or nil
        put(ctx, "reputation_catalog", seen.cat.f, id, table.concat({ id, name, tostring(parent), tostring(major) }, "|"), {
          kind = "reputation_catalog", factionId = id, name = name, header = parent, major = major,
        })
        stat(ctx, "reputation_read")
        local reaction, standing, floor, ceiling = data.reaction, data.currentStanding, data.currentReactionThreshold, data.nextReactionThreshold
        if identity and not major and whole(reaction, 1, 20) and whole(standing, -1000000, 10000000)
          and whole(floor, -1000000, 10000000) and whole(ceiling, -1000000, 10000000) and floor <= ceiling then
          put(ctx, "reputation_owned", own.f, id, table.concat({ id, reaction, standing, floor, ceiling }, "|"), {
            kind = "reputation_owned", characterKey = identity.key, class = identity.class, level = identity.level,
            factionId = id, reaction = reaction, standing = standing, floor = floor, ceiling = ceiling,
          })
        end
      end
    end
  end
  ctx.collapsed = collapsed
end

local function readTitles(ctx, seen, own, identity, spend)
  local count = call("GetNumTitles")
  if not whole(count, 0, MAX_TITLES) then stat(ctx, "title_unreadable"); return end
  local fresh = {}
  for id = 1, count do
    local title = call("GetTitleName", id)
    spend(1)
    local name = plain(title, 80)
    if name then
      put(ctx, "title_catalog", seen.cat.t, id, id .. "|" .. name, { kind = "title_catalog", titleId = id, name = name })
      stat(ctx, "title_read")
    end
    if identity and call("IsTitleKnown", id) and not own.t[id] then fresh[#fresh + 1] = id end
  end
  for first = 1, #fresh, MAX_IDS_PER_ROW do
    local ids = {}
    for i = first, math.min(first + MAX_IDS_PER_ROW - 1, #fresh) do ids[#ids + 1] = fresh[i] end
    if E:Store("title_owned", {
      installId = EverlootDB.installId, capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"), kind = "title_owned",
      characterKey = identity.key, class = identity.class, level = identity.level, titleIds = ids,
    }) then
      for _, id in ipairs(ids) do own.t[id] = true end
      stat(ctx, "title_owned")
    else
      ctx.capped.title_owned = true
      break
    end
  end
end

local function readQuests(ctx, seen, own, identity, spend, wantChains)
  local ids = call("C_QuestLog.GetAllCompletedQuestIDs")
  if type(ids) ~= "table" then stat(ctx, "quest_unreadable"); return end
  local fresh = {}
  for _, id in ipairs(ids) do
    if whole(id, 1, MAX_ID) and not own.q[id] then fresh[#fresh + 1] = id end
    spend(0.1)
  end
  -- Chains are looked up for newly completed quests only, so later passes stay cheap.
  local linked, lines = {}, 0
  if wantChains then
    for _, id in ipairs(fresh) do
      if not linked[id] and lines < MAX_CHAINS then
        local info = call("C_QuestLine.GetQuestLineInfo", id)
        spend(1)
        local lineId = type(info) == "table" and info.questLineID
        if whole(lineId, 1, MAX_ID) and not seen.cat.q[lineId] then
          local members = call("C_QuestLine.GetQuestLineQuests", lineId)
          spend(1)
          local name = plain(info.questLineName, 120)
          if name and type(members) == "table" and #members > 0 then
            local list = {}
            for _, member in ipairs(members) do
              if whole(member, 1, MAX_ID) and #list < 80 then list[#list + 1] = member; linked[member] = true end
            end
            if #list > 0 then
              lines = lines + 1
              put(ctx, "quest_chain_catalog", seen.cat.q, lineId, lineId .. "|" .. name .. "|" .. table.concat(list, ","), {
                kind = "quest_chain_catalog", questLineId = lineId, name = name, questIds = list,
              })
              stat(ctx, "chain_read")
            end
          end
        end
      end
    end
  end
  if not identity then return end
  for first = 1, #fresh, MAX_IDS_PER_ROW do
    local batch = {}
    for i = first, math.min(first + MAX_IDS_PER_ROW - 1, #fresh) do batch[#batch + 1] = fresh[i] end
    if E:Store("quest_owned", {
      installId = EverlootDB.installId, capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"), kind = "quest_owned",
      characterKey = identity.key, class = identity.class, level = identity.level, questIds = batch,
    }) then
      for _, id in ipairs(batch) do own.q[id] = true end
      stat(ctx, "quest_owned", #batch)
    else
      ctx.capped.quest_owned = true
      break
    end
  end
end

-- ---------------------------------------------------------------------------------------------
-- Scheduling

local state = { running = false, again = false, pending = false, epoch = 0, dirty = {}, ready = {}, missing = {}, last = nil }
C.State = state

local function summary(ctx)
  local s = ctx.stats
  local parts = {}
  local function part(label, read, rows, owned)
    if s[read .. "_unreadable"] then parts[#parts + 1] = label .. ": unreadable"
    elseif s[read .. "_read"] or rows ~= nil then
      local text = label .. ": " .. (s[read .. "_read"] or 0) .. " read, " .. (rows or 0) .. " new rows"
      if owned and owned > 0 then text = text .. " (+" .. owned .. " yours)" end
      parts[#parts + 1] = text
    end
  end
  if state.ready.achievements then part("achievements", "achievement", s.achievement_catalog, s.achievement_owned) end
  if state.ready.reputation then
    part("reputation", "reputation", s.reputation_catalog, s.reputation_owned)
    if ctx.collapsed and ctx.collapsed > 0 then
      parts[#parts] = parts[#parts] .. "; " .. ctx.collapsed .. " collapsed headers hide their factions, expand them in the reputation window and run /everloot completion"
    end
  end
  if state.ready.titles then part("titles", "title", s.title_catalog, s.title_owned) end
  if state.ready.quests then
    local text = "quests: " .. (s.quest_owned or 0) .. " newly completed"
    if state.ready.chains then text = text .. ", " .. (s.chain_read or 0) .. " chains found" end
    parts[#parts + 1] = text
  end
  for kind in pairs(ctx.capped) do parts[#parts + 1] = kind .. " paused at capacity" end
  if s.achievement_stopped then parts[#parts + 1] = "achievements stopped at " .. MAX_ACHIEVEMENTS end
  return table.concat(parts, "; ")
end

local function describe()
  local lines = {}
  local function domain(name, ready, missing)
    if ready then lines[#lines + 1] = name .. " ready"
    else lines[#lines + 1] = name .. " unavailable, missing " .. table.concat(missing, ", ") .. " (records nothing)" end
  end
  domain("achievements", state.ready.achievements, state.missing.achievements or {})
  domain("reputation", state.ready.reputation, state.missing.reputation or {})
  domain("titles", state.ready.titles, state.missing.titles or {})
  domain("quests", state.ready.quests, state.missing.quests or {})
  if state.ready.quests and not state.ready.chains then
    lines[#lines + 1] = "quest chains unavailable, missing " .. table.concat(state.missing.chains or {}, ", ") .. " (records no chains)"
  end
  if #(state.missing.player or {}) > 0 then
    lines[#lines + 1] = "your progress not recorded, missing " .. table.concat(state.missing.player, ", ") .. " (catalogs only)"
  end
  return table.concat(lines, "; ")
end

local function body(domains, finish)
  local used = 0
  local epoch = state.epoch
  local function spend(n)
    used = used + n
    if used >= BUDGET then
      used = 0
      coroutine.yield()
      -- Withdrawn while this read was waiting for the next frame: write nothing more.
      if state.epoch ~= epoch then error("withdrawn", 0) end
    end
  end
  return coroutine.create(function()
    local ctx = newContext()
    local seen = seenTable()
    seen.build = EverlootDB.clientBuild
    local key, class, level = C.Identity()
    local identity = key and { key = key, class = class, level = level } or nil
    local own = identity and ownedSeen(seen, key) or { a = {}, f = {}, t = {}, q = {} }
    if domains.achievements and state.ready.achievements then readAchievements(ctx, seen, own, identity, spend) end
    if domains.reputation and state.ready.reputation then readReputation(ctx, seen, own, identity, spend) end
    if domains.titles and state.ready.titles then readTitles(ctx, seen, own, identity, spend) end
    if domains.quests and state.ready.quests then readQuests(ctx, seen, own, identity, spend, state.ready.chains) end
    compact(ctx)
    finish(ctx)
  end)
end

local function inCombat()
  return type(InCombatLockdown) == "function" and InCombatLockdown() and true or false
end

local pump

local function startPass()
  state.pending = false
  if state.running then state.again = true; return end
  if inCombat() then
    state.pending = true
    C_Timer.After(COMBAT_RETRY_SECONDS, startPass)
    return
  end
  local domains = state.dirty
  state.dirty = {}
  state.running = true
  local failed
  local co = body(domains, function(ctx)
    state.last = summary(ctx)
    E:SetNote("completion", state.last ~= "" and state.last or describe())
  end)
  pump = function()
    local ok, err = coroutine.resume(co)
    if not ok then failed = tostring(err) end
    if failed or coroutine.status(co) == "dead" then
      state.running = false
      if failed then E:SetNote("completion", "stopped: " .. failed) end
      if state.again then state.again = false; C.Schedule({}) end
    else
      C_Timer.After(0, pump)
    end
  end
  pump()
end

--- Mark domains dirty and read once after the events settle.
function C.Schedule(domains, delay)
  for name in pairs(domains or { achievements = true, reputation = true, titles = true, quests = true }) do state.dirty[name] = true end
  if state.pending then return end
  state.pending = true
  C_Timer.After(delay or DEBOUNCE_SECONDS, startPass)
end

--- Read now, from /everloot completion.
function C.ReadNow()
  if not E:IsEnabled("completion") then
    print("Everloot: the completion module is off. /everloot completion on, then /reload.")
    return
  end
  if not state.ready.timer then print("Everloot: completion needs C_Timer.After, which this client lacks.") return end
  print("Everloot: reading achievements, reputation, titles and quests across the next few seconds.")
  C.Schedule(nil, 0)
end

--- /everloot completion off: withdraw everything this module wrote.
function C.Withdraw()
  state.epoch = state.epoch + 1
  state.dirty = {}
  for _, kind in ipairs(KINDS) do
    EverlootDB.records[kind] = nil
    if EverlootDB.paused then EverlootDB.paused[kind] = nil end
  end
  EverlootDB.completionSeen = nil
end

E:RegisterModule("completion", function()
  for name, paths in pairs(API) do
    state.missing[name] = absent(paths)
    state.ready[name] = #state.missing[name] == 0
  end
  if not state.ready.timer then error("missing C_Timer.After (reads are chunked across frames), records nothing", 0) end
  local any = state.ready.achievements or state.ready.reputation or state.ready.titles or state.ready.quests
  if not any then error(describe(), 0) end
  local f = E.frame
  local map = {
    PLAYER_ENTERING_WORLD = { achievements = true, reputation = true, titles = true, quests = true },
    ACHIEVEMENT_EARNED = { achievements = true },
    UPDATE_FACTION = { reputation = true },
    FACTION_STANDING_CHANGED = { reputation = true },
    KNOWN_TITLES_UPDATE = { titles = true },
    QUEST_TURNED_IN = { quests = true },
  }
  local watched = {}
  for event, domains in pairs(map) do
    if pcall(function() f:RegisterEvent(event) end) then watched[event] = domains end
  end
  f:HookScript("OnEvent", function(_, event)
    if watched[event] then C.Schedule(watched[event]) end
  end)
  return "ready: " .. describe() .. " (off: /everloot completion off)"
end)
