-- Everloot auction collector. Off unless the player enables the auctions toggle.
-- Records buyouts from the list the player already opened. No external price feed.

local E = Everloot

local function scan()
  if not (GetNumAuctionItems and GetAuctionItemLink and GetAuctionItemInfo and GetRealmName) then
    return "auction API unavailable"
  end
  local realm = GetRealmName()
  if type(realm) ~= "string" or #realm < 2 then return "no realm" end
  local n = GetNumAuctionItems("list")
  if type(n) ~= "number" or n < 1 then return "empty list" end
  local stored = 0
  for i = 1, math.min(n, 50) do
    local link = GetAuctionItemLink("list", i)
    local itemId = link and tonumber(link:match("item:(%d+)"))
    local buyout = select(10, GetAuctionItemInfo("list", i))
    if itemId and type(buyout) == "number" and buyout >= 0 then
      E:Store("auction_scan", {
        installId = EverlootDB.installId,
        capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
        realm = realm, itemId = itemId, copper = math.floor(buyout),
      })
      stored = stored + 1
    end
  end
  return "stored " .. stored
end

E:RegisterModule("auctions", function()
  if not GetNumAuctionItems then error("auction API unavailable", 0) end
  local f = E.frame
  f:RegisterEvent("AUCTION_ITEM_LIST_UPDATE")
  f:HookScript("OnEvent", function(_, event)
    if event == "AUCTION_ITEM_LIST_UPDATE" then pcall(scan) end
  end)
  return "ready (buyouts from the list the player opened)"
end)
