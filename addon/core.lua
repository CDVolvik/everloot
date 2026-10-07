-- Everloot core: event dispatch, module registry, toggles, SavedVariables store.
-- Legal: official Lua API only, own SavedVariables, nothing that plays the character.
-- Every Blizzard call is guarded: on beta, missing systems disable their module, never error.

Everloot = Everloot or {}
local E = Everloot

E.VERSION = "0.1.0"
E.MAX_ROWS_PER_KIND = 2000

local defaults = {
  version = E.VERSION,
  installId = nil,
  eventCounter = 0,
  toggles = { openworld = true, guild = true, gear = true, auctions = false, gold = true },
  records = {},
}

local function newInstallId()
  local t = {}
  for _ = 1, 4 do t[#t + 1] = string.format("%04x", math.random(0, 0xffff)) end
  return table.concat(t, "-")
end

--- Allocate a new event ID for this install. Persisted in SavedVariables.
--- Returns a string like "evt-1", "evt-2", etc.
function E:NextEventId()
  EverlootDB = EverlootDB or {}
  EverlootDB.eventCounter = (EverlootDB.eventCounter or 0) + 1
  return "evt-" .. EverlootDB.eventCounter
end

--- Batch upload state (resumable across reloads)
local batchDefaults = {
  batchCursor = {}, -- kind -> index of next unsent record
  batchSize = 500,  -- records per batch (stays under 2000 aggregate cap)
}

local function initBatchState()
  EverlootDB = EverlootDB or {}
  EverlootDB.batchCursor = EverlootDB.batchCursor or {}
  EverlootDB.batchSize = EverlootDB.batchSize or batchDefaults.batchSize
end

--- Get the next batch of unsent records across all kinds.
--- Returns { records: {...}, hasMore: boolean, totalUnsent: number }
function E:GetNextBatch()
  initBatchState()
  local allRecords = {}
  local totalUnsent = 0
  for kind, store in pairs(EverlootDB.records or {}) do
    local cursor = EverlootDB.batchCursor[kind] or 1
    local unsent = #store - cursor + 1
    if unsent > 0 then
      totalUnsent = totalUnsent + unsent
      for i = cursor, math.min(cursor + EverlootDB.batchSize - 1, #store) do
        local row = store[i]
        if row then
          allRecords[#allRecords + 1] = row
        end
      end
    end
  end
  local hasMore = totalUnsent > EverlootDB.batchSize
  return { records = allRecords, hasMore = hasMore, totalUnsent = totalUnsent }
end

--- Advance the batch cursor after a successful upload.
--- `count` is the number of records that were accepted by the server.
function E:AdvanceBatchCursor(count)
  initBatchState()
  local remaining = count
  for kind, store in pairs(EverlootDB.records or {}) do
    if remaining <= 0 then break end
    local cursor = EverlootDB.batchCursor[kind] or 1
    local unsent = #store - cursor + 1
    if unsent > 0 then
      local advance = math.min(remaining, unsent)
      EverlootDB.batchCursor[kind] = cursor + advance
      remaining = remaining - advance
    end
  end
end

--- Reset batch cursor (for testing or full resend).
function E:ResetBatchCursor()
  EverlootDB.batchCursor = {}
end

local frame = CreateFrame("Frame")
E.frame = frame

function E:IsEnabled(module)
  return EverlootDB and EverlootDB.toggles and EverlootDB.toggles[module] ~= false
end

--- Append a row to a kind store with a rolling cap (oldest rows drop first).
--- If eventId is not provided, allocates a new one via NextEventId().
function E:Store(kind, row, eventId)
  if type(row) ~= "table" then return false end
  row.kindLoggedAt = date("!%Y-%m-%dT%H:%M:%SZ")
  row.eventId = eventId or E:NextEventId()
  local store = EverlootDB.records[kind]
  if not store then store = {}; EverlootDB.records[kind] = store end
  store[#store + 1] = row
  while #store > E.MAX_ROWS_PER_KIND do table.remove(store, 1) end
  return true
end

function E:Count(kind)
  local store = EverlootDB.records[kind]
  return store and #store or 0
end

local modules = {}

function E:RegisterModule(name, init)
  modules[#modules + 1] = { name = name, init = init, ok = false, note = "pending" }
end

function E:InitModules()
  for _, m in ipairs(modules) do
    if self:IsEnabled(m.name) then
      local ok, note = pcall(m.init, self)
      m.ok = ok
      m.note = ok and (note or "ready") or ("disabled: " .. tostring(note))
    else
      m.note = "off by toggle"
    end
  end
end

function E:Status()
  local lines = { "Everloot " .. E.VERSION .. " (" .. (EverlootDB and EverlootDB.installId or "?") .. ")" }
  for _, m in ipairs(modules) do
    lines[#lines + 1] = string.format("  %s: %s", m.name, m.note)
  end
  for _, kind in ipairs({ "npc_sighting", "loot", "quest", "vendor", "item_seen",
    "guild_snapshot", "raid_lockout", "attendance", "loot_award", "gear_snapshot",
    "collection_catalog", "collection_owned", "auction_scan", "recipe_seen", "price_seen",
    "gold_snapshot", "money_event" }) do
    lines[#lines + 1] = string.format("  rows %s: %d", kind, self:Count(kind))
  end
  return table.concat(lines, "\n")
end

frame:RegisterEvent("ADDON_LOADED")
frame:SetScript("OnEvent", function(_, event, arg1)
  if event == "ADDON_LOADED" and arg1 == "Everloot" then
    EverlootDB = EverlootDB or {}
    for k, v in pairs(defaults) do if EverlootDB[k] == nil then EverlootDB[k] = v end end
    if not EverlootDB.installId then EverlootDB.installId = newInstallId() end
    E:InitModules()
    print(E:Status())
  end
end)

SLASH_EVERLOOT1 = "/everloot"
SlashCmdList["EVERLOOT"] = function(msg)
  msg = msg and msg:lower():gsub("^%s+", "") or ""
  if msg == "status" or msg == "" then
    print(E:Status())
  elseif msg == "version" then
    print("Everloot " .. E.VERSION)
  elseif msg == "batch" then
    local b = E:GetNextBatch()
    print("Next batch: " .. #b.records .. " records, hasMore=" .. tostring(b.hasMore) .. ", totalUnsent=" .. b.totalUnsent)
  elseif msg == "batch reset" then
    E:ResetBatchCursor()
    print("Batch cursor reset")
  else
    print("Everloot commands: /everloot status, /everloot batch, /everloot batch reset")
  end
end
