-- Everloot core: event dispatch, module registry, toggles, SavedVariables store.
-- Legal: official Lua API only, own SavedVariables, nothing that plays the character.
-- Every Blizzard call is guarded: on beta, missing systems disable their module, never error.

Everloot = Everloot or {}
local E = Everloot

E.VERSION = "0.2.5"
E.MAX_ROWS_PER_KIND = 2000

local defaults = {
  version = E.VERSION,
  installId = nil,
  toggles = { openworld = true, guild = true, gear = true, auctions = false, gold = true },
  records = {},
}

local function newInstallId()
  local t = {}
  for _ = 1, 4 do t[#t + 1] = string.format("%04x", math.random(0, 0xffff)) end
  return table.concat(t, "-")
end

local frame = CreateFrame("Frame")
E.frame = frame

function E:IsEnabled(module)
  return EverlootDB and EverlootDB.toggles and EverlootDB.toggles[module] ~= false
end

--- Preserve retained rows. At capacity, pause this kind instead of silently discarding data.
function E:Store(kind, row)
  if type(row) ~= "table" then return false end
  local store = EverlootDB.records[kind]
  if not store then store = {}; EverlootDB.records[kind] = store end
  if #store >= E.MAX_ROWS_PER_KIND then
    EverlootDB.paused = EverlootDB.paused or {}
    if not EverlootDB.paused[kind] then
      print("Everloot: " .. kind .. " collection paused at capacity. Keep and upload your SavedVariables file.")
    end
    EverlootDB.paused[kind] = true
    return false
  end
  -- Allocate once, not at export. Persist epoch + counter together; never reuse an ID.
  if not EverlootDB.eventEpoch or type(EverlootDB.nextEvent) ~= "number" then
    EverlootDB.eventEpoch = newInstallId() .. "-" .. tostring(time())
    EverlootDB.nextEvent = 0
  end
  if EverlootDB.nextEvent >= 9007199254740990 then return false end
  EverlootDB.nextEvent = EverlootDB.nextEvent + 1
  row.eventId = EverlootDB.eventEpoch .. ":" .. string.format("%.0f", EverlootDB.nextEvent)
  row.kindLoggedAt = date("!%Y-%m-%dT%H:%M:%SZ")
  store[#store + 1] = row
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
  for kind in pairs(EverlootDB and EverlootDB.paused or {}) do
    lines[#lines + 1] = "  " .. kind .. ": collection paused; retained rows were not deleted"
  end
  for _, m in ipairs(modules) do
    lines[#lines + 1] = string.format("  %s: %s", m.name, m.note)
  end
  for _, kind in ipairs({ "npc_sighting", "loot", "quest", "vendor", "item_seen",
    "guild_snapshot", "raid_lockout", "attendance", "loot_award", "gear_snapshot",
    "collection_catalog", "collection_owned", "auction_scan", "recipe_seen", "recipe_observed", "trainer_seen", "price_seen",
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
    EverlootDB.version = E.VERSION
    E:InitModules()
    print(E:Status())
  end
end)

SLASH_EVERLOOT1 = "/everloot"
SlashCmdList["EVERLOOT"] = function(msg)
  -- A question keeps its case, so it is routed before the command is lowercased.
  local question = type(msg) == "string" and msg:match("^%s*[Aa][Ss][Kk]%s+(.+)$")
  if question and E.Ask then return E:Ask(question) end
  msg = msg and msg:lower():gsub("^%s+", "") or ""
  if msg == "status" or msg == "" then
    print(E:Status())
  elseif msg == "version" then
    print("Everloot " .. E.VERSION)
  elseif msg == "auctions on" or msg == "auctions off" then
    EverlootDB.toggles.auctions = (msg == "auctions on")
    print("Everloot: auction scans " .. (EverlootDB.toggles.auctions and "on" or "off") .. ". /reload to apply.")
  else
    print("Everloot commands: /everloot status, /everloot auctions on|off, /ask <question>")
  end
end
