"""Run with: uv run --with lupa --with jsonschema python addon/tests/map_positions_contract.py

Positions for the world map. At an NPC window the player's position is recorded as the NPC's
(`positionKind = "interaction"`) with the window's role; at an object's loot window the row gains the
player's position, how the object was opened (from UNIT_SPELLCAST_SENT) and its name. The event names
and the spellcast arguments follow Blizzard's documented signatures and were not checked on the Forever
client, so every missing event, call or field must record nothing rather than error.
"""
from pathlib import Path
from lupa.lua51 import LuaRuntime

STUBS = """
date = function() return '2026-10-21T00:00:00Z' end
time = function() return 123456 end
print = function() end
SlashCmdList = {}
CreateFrame = function() return {
 RegisterEvent=function(self, name) self.events=self.events or {}; self.events[name]=true end,
 SetScript=function(self, _, f) self.onEvent=f end,
 HookScript=function(self, _, f) self.hooks=self.hooks or {}; table.insert(self.hooks,f) end
} end
guids = { npc = 'Creature-0-1-2-3-3158-0000000001' }
UnitGUID = function(unit) return guids[unit] end
UnitName = function() return 'Duokna' end
UnitLevel = function() return 15 end
UnitIsFriend = function() return true end
UnitCanAttack = function() return false end
UnitCreatureType = function() return 'Humanoid' end
UnitClassification = function() return 'normal' end
map, px, py = 1411, .512, .428
C_Map = {GetBestMapForUnit=function() return map end,
 GetPlayerMapPosition=function() if px then return {x=px,y=py} end end}
clock = 100
GetTime = function() return clock end
"""

root = Path(__file__).parents[1]


def fresh(extra=""):
    lua = LuaRuntime()
    lua.execute(STUBS + extra)
    for file in ["core.lua", "modules/openworld.lua"]:
        lua.execute((root / file).read_text(encoding="utf-8"))
    lua.execute("""
Everloot.frame.onEvent(nil,'ADDON_LOADED','Everloot')
function event(name, ...) for _, hook in ipairs(Everloot.frame.hooks) do hook(nil, name, ...) end end
function sightings() return EverlootDB.records.npc_sighting or {} end
function last() local rows = sightings(); return rows[#rows] end
""")
    return lua


# --- NPC windows: one row per window, the player's position as the NPC's, the window's role ---
lua = fresh("""
CanMerchantRepair = function() return repairs end
GetMerchantNumItems = function() return 0 end
GetMerchantItemLink = function() end
GetMerchantItemInfo = function() end
""")
lua.execute("""
local registered = Everloot.frame.events
for _, name in ipairs({'MERCHANT_SHOW','GOSSIP_SHOW','QUEST_DETAIL','QUEST_GREETING','TRAINER_SHOW','TAXIMAP_OPENED',
  'BANKFRAME_OPENED','AUCTION_HOUSE_SHOW','PET_STABLE_SHOW','CONFIRM_BINDER','PLAYER_INTERACTION_MANAGER_FRAME_SHOW',
  'UNIT_SPELLCAST_SENT','LOOT_OPENED','LOOT_CLOSED'}) do
  assert(registered[name], name .. ' is not registered')
end

local windows = {
  {'MERCHANT_SHOW', 'vendor', 3158}, {'TRAINER_SHOW', 'trainer', 3347}, {'QUEST_DETAIL', 'questgiver', 3143},
  {'QUEST_GREETING', 'questgiver', 3144}, {'TAXIMAP_OPENED', 'flightmaster', 3310}, {'BANKFRAME_OPENED', 'banker', 3309},
  {'AUCTION_HOUSE_SHOW', 'auctioneer', 9856}, {'PET_STABLE_SHOW', 'stablemaster', 9988}, {'CONFIRM_BINDER', 'innkeeper', 6929},
}
for i, w in ipairs(windows) do
  guids.npc = 'Creature-0-1-2-3-' .. w[3] .. '-0000000001'
  event(w[1])
  assert(#sightings() == i, w[1] .. ' records one sighting')
  local row = last()
  assert(row.npcId == w[3] and row.positionKind == 'interaction' and row.role == w[2], w[1] .. ' gives role ' .. w[2])
  assert(row.mapId == 1411 and math.abs(row.x - 51.2) < 1e-9 and math.abs(row.y - 42.8) < 1e-9, 'the player position, 0..100')
  assert(row.name == 'Duokna' and row.level == 15 and row.reaction == 'friendly' and row.creatureType == 'Humanoid')
  event(w[1])
  assert(#sightings() == i, w[1] .. ' reopened at the same NPC and map adds nothing')
end
local n = #sightings()

-- A merchant who repairs is a repair NPC.
repairs = true
guids.npc = 'Creature-0-1-2-3-3160-0000000001'
event('MERCHANT_SHOW')
assert(last().role == 'repair' and #sightings() == n + 1)
repairs = nil
n = n + 1

-- A gossip window names no service: the row has no role, unless the old gossip options say innkeeper.
guids.npc = 'Creature-0-1-2-3-4000-0000000001'
event('GOSSIP_SHOW')
assert(#sightings() == n + 1 and last().positionKind == 'interaction' and last().role == nil)
GetGossipOptions = function() return 'Make this inn your home.', 'binder', 'Let me browse your goods.', 'vendor' end
guids.npc = 'Creature-0-1-2-3-4001-0000000001'
event('GOSSIP_SHOW')
assert(#sightings() == n + 2 and last().role == 'innkeeper')
GetGossipOptions = function() error('broken') end
guids.npc = 'Creature-0-1-2-3-4002-0000000001'
event('GOSSIP_SHOW')
assert(#sightings() == n + 3 and last().role == nil, 'a failing gossip call still records the NPC, without a role')
n = n + 3

-- A quest window from a quest NPC unit; nothing for an item, an object or a shared quest.
guids.npc = nil
guids.questnpc = 'Creature-0-1-2-3-4003-0000000001'
event('QUEST_DETAIL')
assert(#sightings() == n + 1 and last().npcId == 4003 and last().role == 'questgiver')
guids.questnpc = 'GameObject-0-1-2-3-1561-0000000001'
event('QUEST_DETAIL')
guids.questnpc = 'Player-1-00000001'
event('QUEST_GREETING')
guids.questnpc = nil
event('QUEST_GREETING')
assert(#sightings() == n + 1, 'no creature, no row')
n = n + 1

-- The newer clients' interaction manager, by Enum.PlayerInteractionType name. The same NPC through both events is one row.
Enum = { PlayerInteractionType = { Gossip = 3, Merchant = 5, Banker = 8, TaxiNode = 9, Trainer = 10, Binder = 12, Auctioneer = 21, StableMaster = 26, QuestGiver = 4, MailInfo = 17 } }
guids.npc = 'Creature-0-1-2-3-3158-0000000001'
event('PLAYER_INTERACTION_MANAGER_FRAME_SHOW', 5)
assert(#sightings() == n, 'the vendor already recorded through MERCHANT_SHOW is not recorded twice')
guids.npc = 'Creature-0-1-2-3-5000-0000000001'
event('PLAYER_INTERACTION_MANAGER_FRAME_SHOW', 12)
assert(#sightings() == n + 1 and last().role == 'innkeeper')
event('PLAYER_INTERACTION_MANAGER_FRAME_SHOW', 17)
event('PLAYER_INTERACTION_MANAGER_FRAME_SHOW', 999)
event('PLAYER_INTERACTION_MANAGER_FRAME_SHOW', nil)
assert(#sightings() == n + 1, 'a mailbox, an unknown type or none records nothing')
Enum = nil
event('PLAYER_INTERACTION_MANAGER_FRAME_SHOW', 5)
assert(#sightings() == n + 1, 'no enum, nothing')
n = n + 1

-- The same NPC on another map is a new place.
map = 1429
guids.npc = 'Creature-0-1-2-3-3158-0000000001'
event('MERCHANT_SHOW')
assert(#sightings() == n + 1 and last().mapId == 1429)
map = 1411
n = n + 1

-- Missing position, level or calls: nothing, and no error.
guids.npc = 'Creature-0-1-2-3-6000-0000000001'
px = nil
event('BANKFRAME_OPENED')
px = .5
UnitLevel = function() return -1 end
event('BANKFRAME_OPENED')
UnitLevel = function() return 15 end
UnitName = function() return nil end
event('BANKFRAME_OPENED')
UnitName = function() return 'Duokna' end
local savedMap = C_Map
C_Map = nil
event('BANKFRAME_OPENED')
C_Map = { GetBestMapForUnit = function() error('no map') end, GetPlayerMapPosition = function() end }
event('BANKFRAME_OPENED')
C_Map = savedMap
assert(#sightings() == n, 'no position, no level or no name: no row')
event('BANKFRAME_OPENED')
assert(#sightings() == n + 1, 'the window records once the calls answer')
n = n + 1

-- Targeting still records the player's own position, never as the NPC's.
guids.target = 'Creature-0-1-2-3-3158-0000000001'
event('PLAYER_TARGET_CHANGED')
assert(#sightings() == n + 1 and last().positionKind == 'player' and last().role == nil)
""")
from protocol_schema import check_all  # noqa: E402
counts = check_all(lua)
assert counts["npc_sighting"] >= 17, counts

# --- Loot from objects: position, gather kind from the spell, the object's name ---
lua = fresh("""
GetNumLootItems = function() return 1 end
GetLootSlotLink = function() return 'item:2447' end
GetLootSlotInfo = function() return 'icon', 'Peacebloom', 2 end
source = 'GameObject-0-1-2-3-1618-0000000001'
GetLootSourceInfo = function() return source, 2 end
C_Spell = { GetSpellName = function(id) if id == 99999 then return 'Collect' end end }
""")
lua.execute("""
local function rows() return EverlootDB.records.loot or {} end
local function lastLoot() local r = rows(); return r[#r] end
local spawn = 1
local function loot(guid)
  source = guid or ('GameObject-0-1-2-3-1618-00000000' .. string.format('%02d', spawn))
  spawn = spawn + 1
  event('LOOT_OPENED')
  event('LOOT_CLOSED')
end

-- Herb Gathering by spell id, the newer signature: unit, target, castGUID, spellID.
event('UNIT_SPELLCAST_SENT', 'player', 'Peacebloom', 'Cast-3-1-2-3-2366-0000000001', 2366)
clock = clock + 2
loot()
local herb = lastLoot()
assert(#rows() == 1 and herb.sourceObjectId == 1618 and herb.sourceEvidence == 'loot-api')
assert(herb.mapId == 1411 and math.abs(herb.x - 51.2) < 1e-9 and math.abs(herb.y - 42.8) < 1e-9, 'the player position')
assert(herb.gatherKind == 'herb' and herb.sourceObjectName == 'Peacebloom')

-- Mining by spell name, the old signature: unit, spell name, rank, target.
event('UNIT_SPELLCAST_SENT', 'player', 'Mining', 'Apprentice', 'Copper Vein')
loot('GameObject-0-1-2-3-1731-0000000001')
assert(lastLoot().sourceObjectId == 1731 and lastLoot().gatherKind == 'ore' and lastLoot().sourceObjectName == 'Copper Vein')

-- Chests and fishing; fishing has no target name.
event('UNIT_SPELLCAST_SENT', 'player', 'Battered Chest', 'Cast-1', 3365)
loot('GameObject-0-1-2-3-2843-0000000001')
assert(lastLoot().gatherKind == 'chest' and lastLoot().sourceObjectName == 'Battered Chest')
event('UNIT_SPELLCAST_SENT', 'player', '', 'Cast-2', 7620)
loot('GameObject-0-1-2-3-35591-0000000001')
assert(lastLoot().gatherKind == 'fishing' and lastLoot().sourceObjectName == nil)

-- A spell the addon does not know is "other", named by C_Spell or not at all.
event('UNIT_SPELLCAST_SENT', 'player', 'Strange Crate', 'Cast-3', 99999)
loot('GameObject-0-1-2-3-7000-0000000001')
assert(lastLoot().gatherKind == 'other' and lastLoot().sourceObjectName == 'Strange Crate')
C_Spell = nil
event('UNIT_SPELLCAST_SENT', 'player', 'Odd Thing', 'Cast-4', 123456)
loot('GameObject-0-1-2-3-7001-0000000001')
assert(lastLoot().gatherKind == 'other', 'no spell name call: still other')

-- No cast, a stale cast, a failed cast, another unit's cast: the position stays, the kind and name do not.
loot('GameObject-0-1-2-3-7002-0000000001')
assert(lastLoot().mapId == 1411 and lastLoot().gatherKind == nil and lastLoot().sourceObjectName == nil)
event('UNIT_SPELLCAST_SENT', 'player', 'Peacebloom', 'Cast-5', 2366)
clock = clock + 30
loot('GameObject-0-1-2-3-7003-0000000001')
assert(lastLoot().gatherKind == nil, 'a cast 30 seconds ago is not this window')
event('UNIT_SPELLCAST_SENT', 'player', 'Peacebloom', 'Cast-6', 2366)
event('UNIT_SPELLCAST_FAILED', 'player', 'Cast-6', 2366)
loot('GameObject-0-1-2-3-7004-0000000001')
assert(lastLoot().gatherKind == nil, 'a failed cast is not this window')
event('UNIT_SPELLCAST_SENT', 'target', 'Peacebloom', 'Cast-7', 2366)
loot('GameObject-0-1-2-3-7005-0000000001')
assert(lastLoot().gatherKind == nil, 'another unit casting is not the player')
event('UNIT_SPELLCAST_SENT', 'player', 'Peacebloom', 'Cast-8', 2366)
event('LOOT_CLOSED')
loot('GameObject-0-1-2-3-7006-0000000001')
assert(lastLoot().gatherKind == nil, 'a closed window ends the cast')
event('UNIT_SPELLCAST_SENT', 'player', string.rep('x', 121), 'Cast-9', 2366)
loot('GameObject-0-1-2-3-7007-0000000001')
assert(lastLoot().gatherKind == 'herb' and lastLoot().sourceObjectName == nil, 'an over-long name is left out')
event('UNIT_SPELLCAST_SENT', 'player', nil, nil, nil)
event('UNIT_SPELLCAST_SENT', 'player', 42, {}, 'x')
event('UNIT_SPELLCAST_SENT')
loot('GameObject-0-1-2-3-7008-0000000001')
assert(lastLoot().gatherKind == 'other' and lastLoot().sourceObjectName == nil, 'odd arguments never error')

-- A creature's corpse gets no position or object fields, even right after a cast.
local count = #rows()
event('UNIT_SPELLCAST_SENT', 'player', 'Kobold', 'Cast-10', 8613)
loot('Creature-0-1-2-3-6-0000000099')
local corpse = lastLoot()
assert(#rows() == count + 1 and corpse.sourceNpcId == 6 and corpse.mapId == nil and corpse.x == nil and corpse.gatherKind == nil)

-- No position: the object row is kept, without one.
px = nil
event('UNIT_SPELLCAST_SENT', 'player', 'Peacebloom', 'Cast-11', 2366)
loot('GameObject-0-1-2-3-1618-0000000099')
assert(lastLoot().mapId == nil and lastLoot().x == nil and lastLoot().gatherKind == 'herb')
C_Map = nil
loot('GameObject-0-1-2-3-1618-0000000098')
assert(lastLoot().sourceObjectId == 1618 and lastLoot().x == nil, 'no map API, no position, no error')
GetTime = nil
event('UNIT_SPELLCAST_SENT', 'player', 'Peacebloom', 'Cast-12', 2366)
loot('GameObject-0-1-2-3-1618-0000000097')
assert(lastLoot().gatherKind == 'herb', 'without GetTime the cast still counts for the next window')

-- Reopening the same object adds nothing.
count = #rows()
loot('GameObject-0-1-2-3-1618-0000000097')
assert(#rows() == count)
""")
counts = check_all(lua)
assert counts["loot"] == 17, counts
print("Lua 5.1 map positions: NPC windows (merchant, repair, trainer, quest detail and greeting, taxi, bank, auction house, "
      "stable, innkeeper, gossip, interaction manager) record interaction positions once per NPC, role and map; targeting stays "
      "player; object loot rows carry position, gather kind and name; missing events, calls and fields record nothing")
