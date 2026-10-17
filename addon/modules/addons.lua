-- Everloot installed-addons list. Off unless the player runs /everloot addons on.
-- At login, records each installed addon's folder name, title, .toc version and whether it loaded,
-- from the game's AddOns API (C_AddOns, or the older globals). Nothing else: no addon settings,
-- no other addon's SavedVariables, no character data. One row per addon a day, sooner when its
-- version or loaded state changes. The upload preview lists these addons before anything is sent.

local E = Everloot

local function addonApi()
  local c = C_AddOns
  if c and c.GetNumAddOns and c.GetAddOnInfo and c.GetAddOnMetadata and c.IsAddOnLoaded then
    return { count = c.GetNumAddOns, info = c.GetAddOnInfo, metadata = c.GetAddOnMetadata, loaded = c.IsAddOnLoaded }
  end
  if GetNumAddOns and GetAddOnInfo and GetAddOnMetadata and IsAddOnLoaded then
    return { count = GetNumAddOns, info = GetAddOnInfo, metadata = GetAddOnMetadata, loaded = IsAddOnLoaded }
  end
  return nil
end

--- Titles carry colour codes and icons for the AddOns list; keep the plain text, cut to `limit` bytes.
local function plain(text, limit)
  if type(text) ~= "string" then return nil end
  text = text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""):gsub("|T.-|t", ""):gsub("|A.-|a", "")
  text = text:gsub("^%s+", ""):gsub("%s+$", "")
  if #text > limit then text = text:sub(1, limit):gsub("[\192-\255][\128-\191]*$", "") end
  if text == "" then return nil end
  return text
end

local function record()
  if not E:IsEnabled("addons") then return "off" end
  local api = addonApi()
  if not api then return "addon list API unavailable" end
  local okCount, count = pcall(api.count)
  if not okCount or type(count) ~= "number" then return "no addon count" end
  EverlootDB.addonsSeen = EverlootDB.addonsSeen or {}
  local at = date("!%Y-%m-%dT%H:%M:%SZ")
  local stored = 0
  for i = 1, math.min(count, 300) do
    local okInfo, name, title = pcall(api.info, i)
    if okInfo and type(name) == "string" and name ~= "" and #name <= 100 then
      local okVersion, version = pcall(api.metadata, name, "Version")
      version = okVersion and plain(version, 40) or nil
      local okLoaded, isLoaded = pcall(api.loaded, name)
      local loaded = (okLoaded and isLoaded) and true or false
      local key = at:sub(1, 10) .. "|" .. tostring(version) .. "|" .. tostring(loaded)
      if EverlootDB.addonsSeen[name] ~= key then
        local ok = E:Store("addon_seen", {
          installId = EverlootDB.installId,
          capturedAt = at,
          name = name,
          title = plain(title, 120) or name,
          version = version,
          loaded = loaded,
        })
        if ok then EverlootDB.addonsSeen[name] = key; stored = stored + 1 end
      end
    end
  end
  return "stored " .. stored
end

E:RegisterModule("addons", function()
  if not addonApi() then error("addon list API unavailable", 0) end
  local f = E.frame
  f:RegisterEvent("PLAYER_LOGIN")
  f:HookScript("OnEvent", function(_, event)
    if event == "PLAYER_LOGIN" then pcall(record) end
  end)
  return "ready (installed addons at login; /everloot addons off to stop)"
end)
