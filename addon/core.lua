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
  toggles = { openworld = true, guild = true, gear = true, auctions = false },
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

--- Append a row to a kind store with a rolling cap (oldest rows drop first).
function E:Store(kind, row)
  if type(row) ~= "table" then return false end
  row.kindLoggedAt = date("!%Y-%m-%dT%H:%M:%SZ")
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
    "collection_catalog", "collection_owned", "auction_scan", "recipe_seen", "price_seen" }) do
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
  else
    print("Everloot commands: /everloot status")
  end
end
