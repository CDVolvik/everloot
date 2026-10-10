"""Run with: uv run --with lupa python addon/tests/ask_contract.py"""
from pathlib import Path
from lupa.lua51 import LuaRuntime


def adler32(text: str) -> int:
    a, b = 1, 0
    for byte in text.encode("utf-8"):
        a = (a + byte) % 65521
        b = (b + a) % 65521
    return b * 65536 + a


lua = LuaRuntime()
lua.execute("""
date = function() return '2026-10-09T00:00:00Z' end
time = function() return 123456 end
printed = {}
print = function(msg) printed[#printed + 1] = tostring(msg) end
SlashCmdList = {}
CreateFrame = function() return {
 RegisterEvent=function() end,
 SetScript=function(self, _, f) self.onEvent=f end,
 HookScript=function(self, _, f) self.hooks=self.hooks or {}; table.insert(self.hooks,f) end
} end
""")
root = Path(__file__).parents[1]
toc = (root / "Everloot.toc").read_text(encoding="utf-8")
assert "## OptionalDeps: EverlootAnswers" in toc, "answers must load before the main addon"
assert "modules\\ask.lua" in toc, "ask module must be in the TOC"
for file in ["core.lua", "modules/ask.lua"]:
    lua.execute((root / file).read_text(encoding="utf-8"))

lua.execute("""
Everloot.frame.onEvent(nil, 'ADDON_LOADED', 'Everloot')
SLASH_ASK = SlashCmdList.EVERLOOTASK
assert(SLASH_ASK and SLASH_EVERLOOTASK1 == '/ask', '/ask is registered')
SLASH_ASK('  Who is Thrall?  ')
SlashCmdList.EVERLOOT('ask Where is Molten Core?')
SLASH_ASK('')
SLASH_ASK(string.rep('x', 501))
assert(#EverlootDB.asks == 2, 'two real questions stored, blank and oversized refused; got ' .. #EverlootDB.asks)
assert(EverlootDB.asks[1].question == 'Who is Thrall?' and EverlootDB.asks[1].askedAt)
assert(EverlootDB.asks[1].id ~= EverlootDB.asks[2].id, 'ids are unique')
assert(string.find(printed[#printed], 'too long'), 'oversized question is explained')
first, second = EverlootDB.asks[1].id, EverlootDB.asks[2].id
""")

# The companion answered the first question correctly and the second with a corrupted checksum.
g = lua.globals()
lua.execute(f"""
EverlootAnswersDB = {{
  [first] = {{ answer = "Warchief of the Horde.", source = "warcraft.wiki.gg/wiki/Thrall", answeredAt = "x", sum = {adler32("Warchief of the Horde.")} }},
  [second] = {{ answer = "Tampered.", source = "none", answeredAt = "x", sum = 1 }},
}}
printed = {{}}
Everloot:InitModules()
""")
lua.execute("""
local all = table.concat(printed, '\\n')
assert(string.find(all, 'Who is Thrall%?') and string.find(all, 'Warchief of the Horde%.') and string.find(all, 'warcraft.wiki.gg'), all)
assert(not string.find(all, 'Tampered'), 'a failed checksum is never shown')
assert(string.find(all, 'checksum'), 'a failed checksum is reported')
assert(#EverlootDB.asks == 1 and EverlootDB.asks[1].id == second, 'answered question leaves the queue; the bad one stays for a retry')
printed = {}
Everloot:InitModules()
assert(not string.find(table.concat(printed, '\\n'), 'Warchief'), 'an answer is shown once')
""")
print("Lua 5.1 ask: /ask stores bounded questions, verified answers show once, bad checksums are refused")
