-- Everloot /ask, the file bridge. A question waits in SavedVariables (written at logout or /reload);
-- the companion answers it into the EverlootAnswers addon, which this module reads on the next load.
-- Nothing here talks to the network or plays the character.

local E = Everloot
local MAX_QUESTION, MAX_PENDING = 500, 20

-- Same Adler-32 the companion writes; Lua 5.1 arithmetic only.
local function adler32(s)
  local a, b = 1, 0
  for i = 1, #s do
    a = (a + s:byte(i)) % 65521
    b = (b + a) % 65521
  end
  return b * 65536 + a
end

function E:Ask(text)
  local question = type(text) == "string" and (text:gsub("^%s+", ""):gsub("%s+$", "")) or ""
  if question == "" then
    print("Everloot: type a question after /ask.")
    return
  end
  if #question > MAX_QUESTION then
    print("Everloot: that question is too long (500 characters at most).")
    return
  end
  EverlootDB.asks = EverlootDB.asks or {}
  EverlootDB.askCounter = (EverlootDB.askCounter or 0) + 1
  table.insert(EverlootDB.asks, {
    id = "ask:" .. EverlootDB.installId .. ":" .. EverlootDB.askCounter,
    question = question,
    askedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
  })
  while #EverlootDB.asks > MAX_PENDING do table.remove(EverlootDB.asks, 1) end
  print("Everloot: question saved. Keep the companion running, then /reload to read the answer.")
end

--- Show each verified answer once; an answered question leaves the queue, a failed checksum stays.
local function showAnswers()
  if type(EverlootAnswersDB) ~= "table" or type(EverlootDB.asks) ~= "table" then return end
  local waiting = {}
  for _, ask in ipairs(EverlootDB.asks) do
    local a = EverlootAnswersDB[ask.id]
    if type(a) == "table" and type(a.answer) == "string" and a.sum == adler32(a.answer) then
      print("Everloot — " .. ask.question)
      local source = (type(a.source) == "string" and a.source ~= "none") and (" (Source: " .. a.source .. ")") or ""
      print("  " .. a.answer .. source)
    else
      if type(a) == "table" then
        print("Everloot: the answer to \"" .. ask.question .. "\" failed its checksum and was not shown.")
      end
      waiting[#waiting + 1] = ask
    end
  end
  EverlootDB.asks = waiting
end

SLASH_EVERLOOTASK1 = "/ask"
SlashCmdList["EVERLOOTASK"] = function(msg) E:Ask(msg) end

E:RegisterModule("ask", function()
  showAnswers()
  return "ready (/ask; answers show after /reload)"
end)
