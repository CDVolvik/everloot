-- Everloot guild collector: snapshots, lockouts, attendance, loot awards.
-- Guild-consented data: rows are stored locally and publish ONLY through an officer upload
-- (claim token, previewed before send — see the intake contract + /upload page).

local E = Everloot

local function guildContext()
  local name, _, _, _ = GetGuildInfo and GetGuildInfo("player")
  if not name then return nil end
  local realm = GetRealmName and GetRealmName() or "?"
  local faction = (UnitFactionGroup and UnitFactionGroup("player")) or "?"
  return { guildName = name, realm = realm, faction = faction:lower() }
end

local function snapshotRoster()
  local ctx = guildContext()
  if not ctx then return "not in a guild" end
  local members = {}
  local n = GetNumGuildMembers and GetNumGuildMembers() or 0
  for i = 1, math.min(n, 2000) do
    -- Legacy roster getters are the stable cross-flavor call; C_GuildInfo covers the rest.
    local name, rank, _, level, _, _, _, _, online, _, class = GetGuildRosterInfo and GetGuildRosterInfo(i)
    if name and online then
      members[#members + 1] = {
        name = name:gsub("%-.+", ""), rank = rank or "?", level = level or 0,
        class = class or "?", lastOnlineDays = 0,
      }
    end
  end
  E:Store("guild_snapshot", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    guildName = ctx.guildName, realm = ctx.realm, faction = ctx.faction,
    claimToken = "pending-officer-claim",
    members = members,
  })
  return "snapshot stored (" .. #members .. " online)"
end

local function raidAttendance()
  local ctx = guildContext()
  if not ctx then return end
  if not (IsInRaid and IsInRaid()) then return end
  local present = {}
  for i = 1, math.min(GetNumGroupMembers(), 40) do
    local name = GetRaidRosterInfo and select(1, GetRaidRosterInfo(i))
    if name then present[#present + 1] = name:gsub("%-.+", "") end
  end
  if #present == 0 then return end
  local instance = (GetInstanceInfo and select(1, GetInstanceInfo())) or "?"
  E:Store("attendance", {
    installId = EverlootDB.installId,
    capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
    guildName = ctx.guildName, realm = ctx.realm, instance = instance, present = present,
  })
end

E:RegisterModule("guild", function()
  if not (GetGuildInfo and C_GuildInfo) then
    error("guild API unavailable in beta", 0)
  end
  if C_GuildInfo and C_GuildInfo.GuildRoster then
    -- Modern roster request path; legacy getters read the results.
    local ok = pcall(C_GuildInfo.GuildRoster)
    if not ok then return "C_GuildInfo.GuildRoster unavailable in beta" end
  elseif not GetGuildRosterInfo then
    return "no roster API in beta"
  end
  local f = E.frame
  f:RegisterEvent("GUILD_ROSTER_UPDATE")
  f:RegisterEvent("PLAYER_ENTERING_WORLD")
  f:HookScript("OnEvent", function(_, event)
    if event == "GUILD_ROSTER_UPDATE" or event == "PLAYER_ENTERING_WORLD" then
      pcall(raidAttendance)
    end
  end)
  -- Lockout + loot-award capture lands with the beta raid test (RaidLocks + loot events).
  return "ready (roster/attendance; lockout+loot pending raid test)"
end)
