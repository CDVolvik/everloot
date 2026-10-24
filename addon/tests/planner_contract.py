"""Exercise the native workspace through real Lua callbacks, without a game client."""
from pathlib import Path
from lupa.lua51 import LuaRuntime

root = Path(__file__).parents[1]
lua = LuaRuntime()
lua.execute("""
EverlootDB = {clientBuild='1.60.1.70532', toggles={}, records={}}
UIParent = {}; UISpecialFrames = {}; SlashCmdList = {}; Minimap = {}
frames = {}; print = function() end
local F = {}
F.__index = function(_, key) return F[key] or function() end end
function F:SetScript(key, fn) self.scripts[key] = fn end
function F:HookScript(key, fn) self.scripts[key] = fn end
function F:SetText(text) self.text = text end
function F:GetText() return self.text or '' end
function F:Show() self.shown=true; if self.scripts.OnShow then self.scripts.OnShow(self) end end
function F:Hide() self.shown=false; if self.scripts.OnHide then self.scripts.OnHide(self) end end
function F:IsShown() return self.shown end
function F:HighlightText() self.selected=true end
function F:SetFocus() self.focused=true end
function F:ClearFocus() self.focused=false end
function F:CreateFontString() return CreateFrame('FontString') end
function F:CreateTexture() return CreateFrame('Texture') end
CreateFrame = function(kind, name, parent)
 local f = setmetatable({kind=kind, scripts={}, parent=parent, shown=false}, F)
 frames[#frames+1]=f; if name then _G[name]=f end; return f
end
initializers = {}
Everloot = { RegisterModule=function(_, name, fn) initializers[name]=fn end, Talents={
 HasTraitApi=function() return true end,
 Player=function() return 'MAGE' end, SpecId=function() return 0 end, Groups=function() return {} end
}}
""")
for file in ['plan', 'raid_data', 'raid', 'planner', 'minimap']:
    lua.execute((root / f'modules/{file}.lua').read_text(encoding='utf-8'))
lua.execute("""
local W = Everloot.Planner
assert(W and not W.frame, 'workspace is built lazily')
W.Open('talents')
local f = W.frame
assert(f and f:IsShown() and W.tab == 'talents')
assert(f.body:GetText():find('No plan loaded', 1, true))
local count = #frames
W.Open('raid'); W.Open('talents')
assert(#frames == count, 'reuse the same window and controls')
f.box:SetText('EL1-mage-0-1.60.1.70532-MTox')
f.import.scripts.OnClick()
assert(EverlootDB.plan and not EverlootPlanFrame, 'import uses embedded mode, no second window')
assert(f.notice:GetText():find('loaded', 1, true))
f.export.scripts.OnClick()
assert(f.box:GetText():find('#plan=EL1-mage', 1, true) and f.box.selected)
f.import.scripts.OnClick()
assert(f.notice:GetText():find('loaded', 1, true), 'exported link can be imported')
f.tabs.raid.scripts.OnClick()
assert(W.tab == 'raid')
f.box:SetText('ELR1-10-1.60.1.70532-NzMwMDEw')
f.box.scripts.OnEnterPressed(f.box)
assert(EverlootDB.raidPlan)
assert(f.body:GetText():find('Group 1', 1, true))
local before = EverlootDB.raidPlan
f.box:SetText('damaged')
f.import.scripts.OnClick()
assert(EverlootDB.raidPlan == before and f.box:GetText() == 'damaged')
assert(f.notice:GetText():find('not an Everloot', 1, true))
f.clear.scripts.OnClick()
assert(not EverlootDB.raidPlan and EverlootDB.plan, 'clear affects only the current tab')
f.box.scripts.OnEscapePressed(f.box)
assert(not f:IsShown() and not f.box.focused)
local button = Everloot.Minimap.Button()
button.scripts.OnClick(button, 'LeftButton')
assert(f:IsShown(), 'minimap opens workspace')
local settings = 0
Everloot.Options = {Open=function() settings=settings+1 end}
button.scripts.OnClick(button, 'RightButton')
assert(settings == 1)
assert(UISpecialFrames[1] == 'EverlootPlannerFrame', 'Escape closes the workspace')
W.Open('talents')
f.box:SetText('https://everloot.app/tools/talents/mage/b/EL1-mage-0-1.60.1.70532-MTox')
W.Import()
assert(f.notice:GetText():find('loaded', 1, true), 'website preview links also import')
f.box:SetText('https://everloot.app/tools/talents/mage?saved=example#plan=EL1-mage-0-1.60.1.70532-MTox')
W.Import()
assert(f.notice:GetText():find('loaded', 1, true), 'saved build links import')
for _, link in ipairs({
 'https://everloot.app/tools/talents/mage#plan2=EL1-mage-0-1.60.1.70532-MTox',
 'https://everloot.app/tools/talents/mage/b/-/EL1-mage-0-1.60.1.70532-MTox'
}) do
 f.box:SetText(link); W.Import()
 assert(f.notice:GetText():find('loaded', 1, true), 'second-set-only links import')
end
f.box:SetText('https://everloot.app/tools/talents/mage/b/saved-short-link')
W.Import()
assert(f.notice:GetText():find('Copy for addon', 1, true), 'short links explain how to get a code')
Everloot.Talents.HasTraitApi = function() return false end
f.box:SetText('EL1-mage-0-1.60.1.70532-MTox')
W.Import()
assert(f.notice:GetText():find('unavailable', 1, true), 'unsupported clients get a clear explanation')
Everloot.Talents.HasTraitApi = function() return true end
EverlootDB.raidPlan = 'corrupted saved data'
W.Open('raid')
assert(f.body:GetText():find('Saved plan could not load', 1, true))
W.Open('talents')
local reads = 0
Everloot.Talents.Groups = function() reads=reads+1; return {} end
f:Hide()
f.scripts.OnEvent(f, 'PLAYER_TALENT_UPDATE')
assert(reads == 0, 'closed workspace does no talent reads')
W.Open('talents')
local before = reads
f.scripts.OnEvent(f, 'PLAYER_TALENT_UPDATE')
assert(reads > before, 'visible workspace updates its character comparison')
local pending = {}
C_Timer = {After=function(_, fn) pending[#pending+1] = fn end}
f.scripts.OnEvent(f, 'TRAIT_NODE_CHANGED')
f.scripts.OnEvent(f, 'ACTIVE_PLAYER_SPECIALIZATION_CHANGED')
assert(#pending == 1, 'event bursts coalesce into one refresh')
f:Hide()
before = reads
pending[1]()
assert(reads == before, 'a queued update does nothing after closing')
C_Timer = nil
""")
lua.execute((root / 'core.lua').read_text(encoding='utf-8'))
lua.execute("""
SlashCmdList.EVERLOOT('planner raid')
assert(Everloot.Planner.tab == 'raid')
SlashCmdList.EVERLOOT('planner talents')
assert(Everloot.Planner.tab == 'talents')
SlashCmdList.EVERLOOT('plannerraid')
assert(Everloot.Planner.tab == 'talents', 'command requires a word boundary')
Everloot.Planner.frame:Hide()
SlashCmdList.EVERLOOT('')
assert(Everloot.Planner.frame:IsShown(), 'bare command opens workspace')
PlayerSpellsFrame = CreateFrame('Frame')
initializers.plan()
Everloot.Planner.frame.box:SetText('EL1-mage-0-1.60.1.70532-MTox')
Everloot.Planner.Import()
PlayerSpellsFrame:Show()
assert(not EverlootPlanFrame or not EverlootPlanFrame:IsShown(), 'opening talents after workspace import does not open a second panel')
""")
lua.execute("Everloot.RegisterModule = function(_, name, fn) initializers[name]=fn end")
lua.execute((root / 'modules/plan.lua').read_text(encoding='utf-8'))
lua.execute("""
PlayerSpellsFrame:Hide()
initializers.plan()
PlayerSpellsFrame:Show()
assert(not EverlootPlanFrame or not EverlootPlanFrame:IsShown(), 'workspace preference survives a reload')
""")
print('planner contract: PASS')
