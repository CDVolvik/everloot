# Forever market: full scans, market values, prices in game

Date: 2026-10-16. Status: draft for Carlos's review. Owner decision: Carlos approved all four stages
on 2026-10-16 ("1, 2, 3 and 4").

## 1. Why

Auction prices are the data players check most often. On Retail and Classic, TradeSkillMaster (TSM)
fills that role. Its servers pull Blizzard's auction-house API every hour, compute per-realm values
(minimum buyout, market value, historical), and its desktop app writes them into a small helper addon
that TSM's tooltips read.

WoW: Forever has no Blizzard auction API (checked 2026-09-27), and TSM's addon does not declare
Forever's interface (`70058`; TSM 4.14 lists `120007, 50504, 20505, 11508`). So on 2026-11-04 nobody
has Forever auction data except players who scan in game. Everloot already collects scans, which makes
it the natural Forever market tool.

This design reuses TSM's **pipeline shape**: collect, compute, deliver, show. It takes none of TSM's
code or data. TSM's addon is "All Rights Reserved" on CurseForge, and our own spec
(2026-09-27, §Sources) says we never read TSM's files. Nothing here reads, links to, or imitates TSM's
code, file formats or data. The algorithms below are our own and documented here.

## 2. What exists

- `addon/modules/auctions.lua` stores up to 50 rows from the list the player opened (`auction_scan`:
  one per-unit buyout per row). It is off until `/everloot auctions on`.
- Intake accepts `auction_scan` (`web/src/lib/intake.ts`).
- `kb/src/auction-history.ts`: a realm/item day is public when 3 installs scanned it; the copper is the
  median of each install's last scan that day. Served on `/tools/auctions` and by the MCP tool
  `auction_history`. `profession_path` and `recipe_thresholds` price reagents from these rows.
- The companion writes the `EverlootAnswers` slot addon for `/ask` (`companion/src/bridge/answers.ts`).
  That is the delivery pattern stage 3 reuses.

Constraints that shape the design:
- The addon keeps at most 2,000 rows per kind (`E.MAX_ROWS_PER_KIND`). A full auction house is far
  larger.
- The site loads the whole public corpus (`snapshots/corpus.json`) into memory. Per-item rows from full
  scans would grow it by megabytes a day.
- Intake batches are at most 1 MB and 2,000 records.
- Free services only (decision 2026-10-07).

## 3. Stage 1: full scan in the addon

**The Forever auction API** (read 2026-10-16 from `Gethe/wow-ui-source`, branch `forever`, head
`172a387` "1.60.1 (70450)"; paths under `Interface/AddOns/`, "doc" =
`Blizzard_APIDocumentationGenerated/AuctionHouseDocumentation.lua`):

- Forever has **only the modern `C_AuctionHouse` API.** The legacy calls `auctions.lua` uses today
  (`GetNumAuctionItems`, `GetAuctionItemInfo`, `QueryAuctionItems`, `CanSendAuctionQuery`,
  `AUCTION_ITEM_LIST_UPDATE`) appear nowhere on the branch, and there is no `Blizzard_AuctionUI`, only
  `Blizzard_AuctionHouseUI`. **So the 0.2.5 auction module almost certainly disables itself in the
  Forever client** ("auction API unavailable") and has collected nothing there. Confirm in game:
  `/dump GetNumAuctionItems, C_AuctionHouse and C_AuctionHouse.ReplicateItems`.
- **Full scan:** `C_AuctionHouse.ReplicateItems()` (doc:946), no arguments. Blizzard's own note: "This
  function should be used in place of an 'allItem' QueryAuctionItems call to query the entire auction
  house." Results: `REPLICATE_ITEM_LIST_UPDATE` (doc:1493), `GetNumReplicateItems()` (552),
  `GetReplicateItemInfo(index)` (626) returning `name, texture, count, qualityID, usable, level,
  levelType, minBid, minIncrement, buyoutPrice, bidAmount, highBidder, bidderFullName, owner,
  ownerFullName, saleStatus, itemID, hasAllInfo`.
- Not restricted or protected. `HasRestrictions` is only on posting, cancelling, bidding and buying.
  Search queries are documented at 100 calls a minute and "should not be used to query the entire
  auction house. See ReplicateItems" (doc:1034).
- **Browse results** (what the player searches) come from `SendBrowseQuery` → `GetBrowseResults()`,
  which give the minimum price and total quantity per item. That replaces today's 50-row capture.
- **`70058` is a build number, not an interface number** (commit "1.60.1 (70058)"; head is build
  70450). Our TOC says `## Interface: 70058`. Read the real value in game:
  `/dump select(4, GetBuildInfo())`, and set the TOC (and `EverlootAnswers`) to it.

Unknowns only an in-game test settles: whether `ReplicateItems` has a cooldown (Retail's is 15
minutes); how many rows arrive and whether they arrive at once; what `hasAllInfo == false` rows hold;
whether a click is required. The design assumes the strictest answer to each.

The player clicks a **Scan all** button on the auction-house frame. Nothing scans without that click,
and the addon never posts, bids or buys. The button is disabled for 15 minutes after a scan, and
`/everloot status` shows when the next scan is allowed.

Reading the result:
- Rows are read in chunks across frames (default 1,000 rows per frame), so the client does not
  stall on a large house.
- Bid-only rows (no buyout), rows with no item id and rows with an invalid stack size are skipped and
  counted. Rows with `hasAllInfo == false` are read again once, two seconds later; any still
  incomplete are counted in the scan's status line, never guessed.

Browse capture (`auction_scan`) is **not** moved to the modern API in this change. Browse results
give `minPrice` per item, and Blizzard's UI only proves it is a unit price for commodities; for other
items it may be a whole stack's price. Recording it as a unit price could be wrong by a stack's size.
The legacy browse path stays for clients that have the old API; on Forever, `auction_history` and
reagent pricing get Forever data once they read market values (a later change) or once an in-game
check settles `minPrice`.

Per item, one scan yields an **item summary**:

| Field | Meaning |
|---|---|
| `itemId` | from the row's item link |
| `auctions` | listings with a buyout |
| `quantity` | units across those listings |
| `minUnit` | lowest per-unit buyout, copper |
| `marketUnit` | Everloot scan value (below) |

**Scan value (`marketUnit`).** Sort the listings by per-unit buyout. Walk up from the cheapest,
counting units, until a quarter of the item's units are covered (always at least the whole first
listing). `marketUnit` is the unit-weighted mean price of the units walked. It answers "what does the
cheap end of the market cost right now" without being set by one under-priced listing. The function
is pure Lua with its own contract tests.

**Storage.** One scan becomes `auction_snapshot` records of at most 1,000 items each:
`{ kind, installId, eventId, capturedAt, realm, scanId, part, parts, items: [[itemId, auctions,
quantity, minUnit, marketUnit], ...] }`. A whole house is a handful of records, so the 2,000-row cap
does not bind. The addon keeps the last three scans per realm (older parts are deleted once a newer
scan completes) and reports the scan in `/everloot status`.

**Your own prices, at once.** The addon adds Everloot lines to item tooltips from the player's own
latest scan ("Your scan: min 1g 20s, value 1g 35s, 42 up, 3 h ago"). This works with no companion and
no upload.

## 4. Stage 2: market values on the server

**Intake.** A new `auction_snapshot` schema (items array at most 1,000 tuples; every number an
integer in range). The upload's existing 1 MB / 2,000-record limits stay.

**Kept out of the general corpus.** `mergeCorpus` skips `auction_snapshot`, so `snapshots/corpus.json`
and `/api/corpus/public` do not grow with scans. The raw upload stays in R2 as the record of truth,
as for every kind.

**Market rollup.** The ten-minute cron gains a second step that reads only uploads it has not seen
(its own watermark) and folds their `auction_snapshot` records into `snapshots/market.json`:
realm → item → day → install → that install's last scan that day. Days older than 60 are pruned.

**Public values.** Derived on read, with the existing corroboration rule:
- A realm/item **day is public when 3 installs scanned it.** Its values are the medians of those
  installs' last scans that day (`minUnit`, `marketUnit`, `quantity`).
- **Market value**: recency-weighted mean of the public days in the last 14 (weight 15 − age in
  days).
- **Historical**: median of the public days in the last 60.
- **Minimum buyout**: the newest public day's median minimum.
- Every value carries its newest day, reporter count and age. Prices with no public day say so and
  are never shown as zero.

**Reads.**
- `GET /api/market/prices?realm=<realm>`: compact JSON for the companion (every item with a public
  value on that realm).
- MCP tool `market_value { realm, itemId }`, same text as the page.
- `auction_history` and reagent pricing keep reading `auction_scan` for now; switching them to market
  values is a later change.

**Licence.** The public values are published like every other Everloot fact. Raw scans are not served
by `/api/corpus/public`. Whether market data stays under the CC BY-SA data licence is Carlos's call
before the flip (~10/24); this design works either way.

## 5. Stage 3: community prices in game

The companion's `watch --game` command (and a new `prices` command) fetches `/api/market/prices` for
each realm found in the player's SavedVariables and writes an `EverlootPrices` slot addon, the same
way the bridge writes `EverlootAnswers`: Lua-escaped data only, written atomically. Each realm (keyed
lower-case) is one string, `itemId,market,min,historical,quantity,day,reporters;...` with a blank
market when unrecorded, plus an Adler-32 `sum` over it. The addon parses a realm on its first tooltip
and ignores it if the sum fails. A failed fetch keeps the previous file. Prices show after the next
`/reload`. A golden file (`addon/tests/fixtures/EverlootPrices.lua`) is rendered by the companion and
loaded by the addon's Lua test, so both sides are held to one format.

Tooltips then show both lines: the community value (market, minimum, historical, reporters, age) and
the player's own latest scan.

## 6. Stage 4: the market on everloot.app

`/tools/auctions` becomes the market page:
- Realm picker, then the items with public values, sorted by quantity, with market, minimum,
  historical, reporters and age.
- Item view: the 60-day history as a small chart plus the existing day list.
- The page says plainly how values are made (the corroboration rule and the scan value).

## 7. Order of work

1. Addon (stage 1 + own-scan tooltips): version 0.3.0, zip rebuilt, contract tests.
2. Server (stage 2): schema, corpus exclusion, rollup, derivation, API, MCP tool.
3. Companion (stage 3): `prices` command, slot addon, addon reader.
4. Web (stage 4): market page.

Each is its own PR. Nothing merges without Carlos (merging to `main` deploys production).

## 8. Out of scope

- Any automated scanning, posting, cancelling, bidding or buying.
- Sniping, auto-undercut or anything that acts on the auction house for the player.
- Reading TSM's or any other addon's files, data or code.
- Retail and Classic realms (TSM covers them; Forever is our market).

## 9. Open items

- In-game checks for 0.3.0 (Carlos): `/dump select(4, GetBuildInfo())` for the real interface number;
  the Everloot scan button's place on the frame; one full scan (does it complete, how many rows,
  does a cooldown apply, any "script deprecated" popup); tooltips show "Your scan".
- **Separate bug, not fixed here:** `addon/modules/gold.lua` reads the player's own auctions with the
  legacy `GetAuctionItemInfo("owner", i)`, which Forever does not have. Its auction buyout and sale
  attribution likely records nothing on Forever. The modern calls are `C_AuctionHouse.QueryOwnedAuctions`
  → `OWNED_AUCTIONS_UPDATED` → `GetOwnedAuctions()`.
- The 0.2.5 in-game beta checklist is still open with Carlos; 0.3.0 adds a full scan to it.
- Market-data licence decision before the flip.
- Rollup size at scale: about 10k items × 60 days × reporters per realm. Fine for beta; revisit if
  `market.json` passes 20 MB.
