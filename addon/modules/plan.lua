-- Everloot talent plan: loads an Everloot share code and shows it next to the talent window.
-- DISPLAY ONLY. It names the next point to spend and lists where your build differs from the plan.
-- It never spends a point, clicks a talent, imports a loadout or acts for the player.
--
-- Share code (documented in addon/README.md and docs/2026-10-17-talent-share-code.md):
--   EL1-<class>-<spec>-<build>-<payload>
--   class    lowercase class token, e.g. mage
--   spec     client spec id, or 0 when unknown
--   build    client build the plan was made on, e.g. 1.60.1.70450
--   payload  base64url (no padding) of the text "node:rank,node:rank:choice,..." in spend order

local E = Everloot
local T = E.Talents
local P = {}
E.Plan = P

local VERSION = 1
local MAX_ENTRIES = 600

local B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
local B64URL_VALUE = {}
for i = 1, #B64URL do B64URL_VALUE[B64URL:sub(i, i)] = i - 1 end

local function encode64(text)
  local out = {}
  for i = 1, #text, 3 do
    local a, b, c = text:byte(i, i + 2)
    local n = a * 65536 + (b or 0) * 256 + (c or 0)
    local chars = { math.floor(n / 262144) % 64, math.floor(n / 4096) % 64, math.floor(n / 64) % 64, n % 64 }
    local keep = c and 4 or (b and 3 or 2)
    for k = 1, keep do out[#out + 1] = B64URL:sub(chars[k] + 1, chars[k] + 1) end
  end
  return table.concat(out)
end

local function decode64(text)
  if #text % 4 == 1 then return nil end
  local out = {}
  for i = 1, #text, 4 do
    local n, count = 0, 0
    for k = i, math.min(i + 3, #text) do
      local value = B64URL_VALUE[text:sub(k, k)]
      if not value then return nil end
      n = n * 64 + value
      count = count + 1
    end
    for _ = count + 1, 4 do n = n * 64 end
    local bytes = { math.floor(n / 65536) % 256, math.floor(n / 256) % 256, n % 256 }
    for k = 1, count - 1 do out[#out + 1] = string.char(bytes[k]) end
  end
  return table.concat(out)
end

--- Encode { class, spec, build, entries = { { nodeId, rank, choice? } } } as a share code.
function P.Encode(plan)
  local parts = {}
  for _, entry in ipairs(plan.entries) do
    local text = entry.nodeId .. ":" .. entry.rank
    if entry.choice then text = text .. ":" .. entry.choice end
    parts[#parts + 1] = text
  end
  return string.format("EL%d-%s-%d-%s-%s", VERSION, plan.class:lower(), plan.spec or 0, plan.build, encode64(table.concat(parts, ",")))
end

--- Decode a share code: plan table, or nil and the reason.
function P.Decode(code)
  if type(code) ~= "string" then return nil, "no code" end
  -- Padding is not part of the format, but a tool that adds it should not break the code.
  code = code:gsub("^%s+", ""):gsub("%s+$", ""):gsub("=+$", "")
  local version, class, spec, build, payload = code:match("^EL(%d+)%-(%a+)%-(%d+)%-([%d%.]+)%-([%w_%-]*)$")
  -- Same shape as the intake schema's build: digits in dot-separated groups, at least two.
  if build and not (build:find("^%d+%.[%d%.]*%d$") and not build:find("%.%.")) then version = nil end
  if not version then return nil, "that is not an Everloot share code (EL1-class-spec-build-payload)" end
  if tonumber(version) ~= VERSION then return nil, "share code version " .. version .. " is not supported by this addon (it reads version " .. VERSION .. ")" end
  local text = decode64(payload)
  if not text then return nil, "the plan part of the code is damaged" end
  local entries = {}
  local seen = {}
  for item in text:gmatch("[^,]+") do
    local node, rank, choice = item:match("^(%d+):(%d+):?(%d*)$")
    node, rank = tonumber(node), tonumber(rank)
    if not node or node < 1 or not rank or rank < 1 or rank > 50 then return nil, "the plan part of the code is damaged" end
    local pick = choice ~= "" and tonumber(choice) or nil
    if pick and pick > 3 then return nil, "the plan part of the code is damaged" end
    if seen[node] then return nil, "the plan lists node " .. node .. " twice" end
    seen[node] = true
    entries[#entries + 1] = { nodeId = node, rank = rank, choice = pick }
    if #entries > MAX_ENTRIES then return nil, "the plan has too many nodes" end
  end
  if #entries == 0 then return nil, "the plan has no talents in it" end
  return { version = VERSION, class = class:upper(), spec = tonumber(spec), build = build, entries = entries }
end

--- Compare a plan with the client's current state (T.State). Pure: no game calls.
--- Returns { total, done, next = { entry, blocked }, mismatches = { { kind, nodeId, have, want } } }.
function P.Evaluate(plan, state)
  local result = { total = 0, done = 0, mismatches = {} }
  local planned = {}
  local deficits = {}
  for _, entry in ipairs(plan.entries) do
    planned[entry.nodeId] = true
    result.total = result.total + entry.rank
    local node = state.nodes[entry.nodeId]
    if not node then
      result.mismatches[#result.mismatches + 1] = { kind = "unknown", nodeId = entry.nodeId, want = entry.rank }
    else
      result.done = result.done + math.min(node.ranks, entry.rank)
      if node.ranks > entry.rank then
        result.mismatches[#result.mismatches + 1] = { kind = "extra", nodeId = entry.nodeId, have = node.ranks, want = entry.rank }
      elseif node.ranks > 0 and entry.choice ~= nil and node.choice ~= nil and node.choice ~= entry.choice then
        result.mismatches[#result.mismatches + 1] = { kind = "choice", nodeId = entry.nodeId, have = node.choice, want = entry.choice }
      elseif node.ranks < entry.rank then
        deficits[#deficits + 1] = { entry = entry, node = node }
      end
    end
  end
  for _, nodeId in ipairs(state.order) do
    local node = state.nodes[nodeId]
    if not planned[nodeId] and node.ranks > 0 then
      result.mismatches[#result.mismatches + 1] = { kind = "extra", nodeId = nodeId, have = node.ranks, want = 0 }
    end
  end
  for _, d in ipairs(deficits) do
    if d.node.canBuy ~= false then result.next = { entry = d.entry, blocked = false }; break end
  end
  if not result.next and deficits[1] then result.next = { entry = deficits[1].entry, blocked = true } end
  return result
end

local function spellName(configID, nodeId, state, choice)
  local node = state and state.nodes[nodeId]
  local entries = node and node.entryIDs
  local entryId = type(entries) == "table" and (entries[(choice or 0) + 1] or entries[1]) or nil
  local name
  if entryId and C_Traits and T.Call then
    local entry = T.Call(C_Traits.GetEntryInfo, configID, entryId)
    local definition = type(entry) == "table" and entry.definitionID and T.Call(C_Traits.GetDefinitionInfo, entry.definitionID)
    local spellId = type(definition) == "table" and definition.spellID
    if spellId then
      if C_Spell and C_Spell.GetSpellName then name = T.Call(C_Spell.GetSpellName, spellId)
      elseif GetSpellInfo then name = T.Call(GetSpellInfo, spellId) end
    end
  end
  if type(name) == "string" and name ~= "" then return name end
  return "node " .. nodeId
end

---------------------------------------------------------------- saved builds (EverlootBuilds slot addon)

-- The Desktop App writes the player's saved builds from everloot.app into the EverlootBuilds slot addon,
-- which sets EverlootBuildsData = { version, syncedAt, builds = { { name, character, class, code, code2,
-- active, gameBuild } } }. Read only, at command time; nothing is saved or sent from here.

local function savedData()
  local data = EverlootBuildsData
  if type(data) == "table" and type(data.builds) == "table" then return data end
  return nil
end

--- Chat-safe: one line, and a typed | cannot start a WoW escape sequence.
local function plain(text)
  return (text:gsub("[%c]", " "):gsub("|", "||"))
end

--- The saved builds for this player, in the order /everloot plan numbers them: those filed under this
--- character (name, case-insensitive) and class, the active one first, then the class's other builds.
--- Nil when the EverlootBuilds addon is not loaded.
function P.SavedBuilds()
  local data = savedData()
  if not data then return nil end
  local class = T.Player()
  local me
  if UnitName then
    local ok, name = pcall(UnitName, "player")
    if ok and type(name) == "string" and name ~= "" then me = name:lower() end
  end
  local active, mine, others = {}, {}, {}
  for _, b in ipairs(data.builds) do
    if type(b) == "table" and type(b.name) == "string" and type(b.code) == "string" and type(b.class) == "string" then
      if not class or b.class:gsub("%A", ""):upper() == class then
        if me and type(b.character) == "string" and b.character:lower() == me then
          table.insert(b.active == true and active or mine, b)
        else
          others[#others + 1] = b
        end
      end
    end
  end
  for _, b in ipairs(mine) do active[#active + 1] = b end
  for _, b in ipairs(others) do active[#active + 1] = b end
  return active
end

--- Print the numbered list. Returns false when there is no EverlootBuilds data.
function P.ListSaved()
  local list = P.SavedBuilds()
  if not list then return false end
  if #list == 0 then
    print("Everloot: no saved builds for this class in the last Desktop App sync.")
    return true
  end
  print("Everloot: your saved builds (/everloot plan <number> loads one, <number> 2 its second set):")
  for i, b in ipairs(list) do
    if i > 20 then print("  and " .. (#list - 20) .. " more, up to /everloot plan " .. #list); break end
    local who = type(b.character) == "string" and (" - " .. plain(b.character)) or ""
    print(string.format("  %d. %s%s%s%s", i, plain(b.name), who, b.active == true and " (active)" or "",
      type(b.code2) == "string" and " [2 sets]" or ""))
  end
  return true
end

local current       -- the loaded plan
local last          -- { configID, state, result } from the latest refresh

--- The text lines shown in the panel and printed to chat.
local function lines()
  if not current then
    return { "No plan loaded. Paste an Everloot share code below, or /everloot plan <code>.",
      savedData() and "/everloot plan lists your saved builds; /everloot plan <number> loads one."
        or "Builds saved on everloot.app show here after a Desktop App sync and /reload." }
  end
  local out = {}
  local here = EverlootDB and EverlootDB.clientBuild
  out[#out + 1] = string.format("%s plan, made on build %s", current.class, current.build)
  if here and here ~= current.build then
    out[#out + 1] = "You are on build " .. here .. ": node ids may have moved since this plan was made."
  end
  if not last then
    out[#out + 1] = "Open the talent window, or wait: your talents have not been read yet."
    return out
  end
  local r, state, configID = last.result, last.state, last.configID
  out[#out + 1] = string.format("%d of %d planned points match.", r.done, r.total)
  if r.next then
    local want = r.next.entry
    local have = state.nodes[want.nodeId] and state.nodes[want.nodeId].ranks or 0
    out[#out + 1] = string.format("Next point: %s (rank %d of %d)%s", spellName(configID, want.nodeId, state, want.choice), have + 1, want.rank,
      r.next.blocked and " - not available yet (a gate or no point to spend)" or "")
  elseif r.total > 0 and #r.mismatches == 0 then
    out[#out + 1] = "Your build matches the plan."
  end
  if #r.mismatches > 0 then
    out[#out + 1] = string.format("Differences from the plan (%d):", #r.mismatches)
    for i, m in ipairs(r.mismatches) do
      if i > 8 then out[#out + 1] = "  and " .. (#r.mismatches - 8) .. " more"; break end
      if m.kind == "unknown" then
        out[#out + 1] = "  node " .. m.nodeId .. " is not in your talent tree (plan from another build?)"
      elseif m.kind == "choice" then
        out[#out + 1] = string.format("  %s: you chose option %d, the plan says %d", spellName(configID, m.nodeId, state, m.have), m.have + 1, m.want + 1)
      else
        out[#out + 1] = string.format("  %s: you have %d, the plan has %d", spellName(configID, m.nodeId, state), m.have, m.want)
      end
    end
  end
  return out
end
P.Lines = lines

---------------------------------------------------------------- panel (all guarded)

local panel
local nextMark
local flagMarks = {}
local userHidden = false

--- A talent button in Blizzard's window, if it is open. Looked up only; never clicked.
local function buttonFor(nodeId)
  local talents = PlayerSpellsFrame and PlayerSpellsFrame.TalentsFrame
  if not (talents and type(talents.GetTalentButtonByNodeID) == "function") then return nil end
  if type(talents.IsShown) == "function" and not talents:IsShown() then return nil end
  local ok, button = pcall(talents.GetTalentButtonByNodeID, talents, nodeId)
  if ok and type(button) == "table" then return button end
  return nil
end

--- A click-through coloured overlay on a talent button.
local function overlay(slot, button, r, g, b)
  local mark = slot
  if not mark then
    mark = CreateFrame("Frame", nil, UIParent)
    mark:SetFrameStrata("HIGH")
    mark:EnableMouse(false)
    mark.texture = mark:CreateTexture(nil, "OVERLAY")
    mark.texture:SetAllPoints(mark)
    mark.texture:SetColorTexture(r, g, b, 0.4)
  end
  -- A child of the talent button, so it goes away with the button when the window closes or the tab changes.
  mark:SetParent(button)
  mark:SetFrameStrata("HIGH")
  mark:ClearAllPoints()
  mark:SetAllPoints(button)
  mark:Show()
  return mark
end

local function clearMarks()
  if nextMark then nextMark:Hide() end
  for _, mark in ipairs(flagMarks) do mark:Hide() end
end

local function mark()
  clearMarks()
  if not (current and last) then return end
  local r = last.result
  if r.next and not r.next.blocked then
    local button = buttonFor(r.next.entry.nodeId)
    if button then nextMark = overlay(nextMark, button, 0.2, 1, 0.2) end
  end
  local used = 0
  for _, m in ipairs(r.mismatches) do
    local button = m.kind ~= "unknown" and buttonFor(m.nodeId)
    if button and used < 12 then
      used = used + 1
      flagMarks[used] = overlay(flagMarks[used], button, 1, 0.2, 0.2)
    end
  end
end

local function buildPanel()
  if panel then return panel end
  if not CreateFrame then return nil end
  local ok, frame = pcall(CreateFrame, "Frame", "EverlootPlanFrame", UIParent, "BackdropTemplate")
  if not ok or not frame then ok, frame = pcall(CreateFrame, "Frame", "EverlootPlanFrame", UIParent) end
  if not ok or not frame then return nil end
  local built = pcall(function()
    frame:SetSize(330, 280)
    frame:SetPoint("CENTER")
    frame:SetMovable(true)
    frame:EnableMouse(true)
    frame:SetClampedToScreen(true)
    frame:RegisterForDrag("LeftButton")
    frame:SetScript("OnDragStart", frame.StartMoving)
    frame:SetScript("OnDragStop", frame.StopMovingOrSizing)
    if frame.SetBackdrop then
      frame:SetBackdrop({ bgFile = "Interface\\DialogFrame\\UI-DialogBox-Background", edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border",
        tile = true, tileSize = 16, edgeSize = 16, insets = { left = 4, right = 4, top = 4, bottom = 4 } })
    end
    local title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    title:SetPoint("TOPLEFT", 14, -12)
    title:SetText("Everloot talent plan (display only)")
    frame.body = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    frame.body:SetPoint("TOPLEFT", 14, -34)
    frame.body:SetWidth(300)
    frame.body:SetJustifyH("LEFT")
    frame.body:SetJustifyV("TOP")
    local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
    close:SetPoint("TOPRIGHT", -2, -2)
    local box = CreateFrame("EditBox", nil, frame, "InputBoxTemplate")
    box:SetSize(280, 20)
    box:SetPoint("BOTTOMLEFT", 20, 12)
    box:SetAutoFocus(false)
    box:SetScript("OnEnterPressed", function(self)
      local text = self:GetText()
      self:SetText("")
      self:ClearFocus()
      P.Load(text)
    end)
    box:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
    -- The panel only hides when the player closes it, so the talent window must not bring it back.
    frame:SetScript("OnHide", function() userHidden = true; clearMarks() end)
  end)
  if not built then return nil end
  panel = frame
  return panel
end

--- Read the active spec group and recompute the plan. Safe to call at any time.
function P.Refresh()
  if not current then last = nil; clearMarks(); return end
  local active
  for _, entry in ipairs(T.Groups()) do
    if entry.active then active = entry end
  end
  local state = active and T.State(active.configID)
  last = state and { configID = active.configID, state = state, result = P.Evaluate(current, state) } or nil
  if panel and panel:IsShown() then
    panel.body:SetText(table.concat(lines(), "\n"))
    pcall(mark)
  end
end

--- Show the panel, beside the talent window when it is open.
function P.Show()
  userHidden = false
  local frame = buildPanel()
  if not frame then
    P.Refresh()
    print(table.concat(lines(), "\n"))
    return
  end
  local talents = PlayerSpellsFrame
  if talents and type(talents.IsShown) == "function" and talents:IsShown() then
    pcall(function()
      frame:ClearAllPoints()
      frame:SetPoint("TOPLEFT", talents, "TOPRIGHT", 6, 0)
    end)
  end
  frame:Show()
  P.Refresh()
  frame.body:SetText(table.concat(lines(), "\n"))
  pcall(mark)
end

--- Load a share code. Returns true, or false and the reason (also printed).
function P.Load(code)
  local plan, reason = P.Decode(code)
  if not plan then print("Everloot: " .. reason); return false, reason end
  local class = T.Player()
  if class and class ~= plan.class then
    reason = "that plan is for " .. plan.class .. " and you are playing " .. class
    print("Everloot: " .. reason)
    return false, reason
  end
  if not class then print("Everloot: your class could not be read yet, so this plan was not checked against it.") end
  local spec = T.SpecId()
  if plan.spec and plan.spec > 0 and spec and spec ~= plan.spec then
    print("Everloot: this plan was made for spec id " .. plan.spec .. " and the client reports " .. spec .. ". Check it is the right plan.")
  end
  current = plan
  EverlootDB.plan = P.Encode(plan)
  P.Show()
  if not panel then return true end
  print("Everloot: plan loaded (" .. #plan.entries .. " talents). It only shows; it never spends points.")
  return true
end

function P.Clear()
  current, last = nil, nil
  EverlootDB.plan = nil
  clearMarks()
  if panel then panel.body:SetText(table.concat(lines(), "\n")) end
end

--- Load saved build number n from the list /everloot plan prints, exactly like a pasted code.
--- set 2 loads the build's second talent set.
function P.LoadSaved(n, set)
  local list = P.SavedBuilds()
  if not list then
    print("Everloot: no saved builds here yet. Sync them with the Everloot Desktop App, then /reload.")
    return false
  end
  local build = list[n]
  if not build then
    print("Everloot: there is no saved build " .. n .. ". /everloot plan lists them.")
    return false
  end
  set = set or 1
  local code = set == 1 and build.code or set == 2 and build.code2 or nil
  if type(code) ~= "string" then
    print(set == 2 and ("Everloot: saved build " .. n .. " has no second talent set.")
      or ("Everloot: a saved build has talent sets 1 and 2, not " .. set .. "."))
    return false
  end
  print("Everloot: loading saved build " .. n .. (set == 2 and " (second set)" or "") .. ", " .. plain(build.name) .. ".")
  return P.Load(code)
end

--- /everloot plan [code | number | show | hide | clear]
function E.PlanCommand(arg)
  arg = (arg or ""):gsub("^%s+", ""):gsub("%s+$", "")
  local word = arg:lower()
  if word == "" then P.ListSaved(); return P.Show() end
  if word == "show" then return P.Show() end
  local n, set = word:match("^(%d+)%s*(%d*)$")
  if n then return P.LoadSaved(tonumber(n), tonumber(set)) end
  if word == "hide" then userHidden = true; if panel then panel:Hide() end return end
  if word == "clear" then P.Clear(); print("Everloot: plan cleared."); return end
  P.Load(arg)
end

local function hookTalentFrame()
  local frame = PlayerSpellsFrame
  if not (frame and type(frame.HookScript) == "function") or P.hooked == frame then return end
  local hooked = pcall(frame.HookScript, frame, "OnShow", function() if current and not userHidden then P.Show() end end)
  -- Overlays belong to the talent window: take them off when it closes.
  pcall(frame.HookScript, frame, "OnHide", clearMarks)
  if hooked then P.hooked = frame end
end

local refreshPending = false
--- Trait events come in bursts and the panel is usually closed: recompute only for a visible panel, after they settle.
local function scheduleRefresh()
  if not (current and panel and panel:IsShown()) then return end
  if C_Timer and type(C_Timer.After) == "function" then
    if refreshPending then return end
    refreshPending = true
    C_Timer.After(2, function() refreshPending = false; pcall(P.Refresh) end)
  else
    pcall(P.Refresh)
  end
end

E:RegisterModule("plan", function()
  if not (T and T.HasTraitApi()) then error("trait API unavailable", 0) end
  if EverlootDB.plan then
    local plan = P.Decode(EverlootDB.plan)
    if plan then current = plan else EverlootDB.plan = nil end
  end
  local f = E.frame
  for _, name in ipairs({ "ADDON_LOADED", "PLAYER_ENTERING_WORLD", "TRAIT_CONFIG_UPDATED", "TRAIT_NODE_CHANGED",
    "ACTIVE_PLAYER_SPECIALIZATION_CHANGED", "PLAYER_TALENT_UPDATE" }) do
    pcall(function() f:RegisterEvent(name) end)
  end
  f:HookScript("OnEvent", function(_, event)
    if event == "ADDON_LOADED" or event == "PLAYER_ENTERING_WORLD" then hookTalentFrame() end
    if event ~= "ADDON_LOADED" then scheduleRefresh() end
  end)
  hookTalentFrame()
  return "ready (/everloot plan <share code>; shows only, never spends points)"
end)
