# Everloot implementation tracker

Generated from `kb/src/bridge-plan.ts`. Edit that file, then regenerate this page.
The MCP tool `everloot_plan` returns the same text.

Hakoovak (US / Moon Guard) is Carlos's own character, sent so two reference pages
could be opened on a real name. It is not a fixture and not the Forever beta character.

Order: one server. Each product tool is one MCP tool on that server. A ChatGPT
subscription connects to the public HTTPS mount and uses its own model. Closed
sites contribute a page shape. Their text and tables stay put. SimulationCraft's
engine stays a separate GPL program.

Rows: 62.

## Live

| Id | Name | Done when |
|---|---|---|
| `mcp.search_knowledge` | Search the knowledge base | stdio tool on everloot-knowledge |
| `mcp.get_entity` | Fetch one record by id | stdio tool on everloot-knowledge |
| `mcp.get_by_name` | Exact-name lookup | stdio tool on everloot-knowledge |
| `mcp.everloot_plan` | This tracker, as a tool | a client can ask what is live, next, waiting, or shape-only |
| `mcp.http_local` | Local HTTP MCP | POST /mcp on 127.0.0.1. Same server as stdio. Not reachable by ChatGPT yet. |
| `site.home` | Public home | https://everloot-web-r21digital.vercel.app |
| `site.upload` | Upload + intake | /upload and /api/intake. Persists when Supabase is connected. |
| `site.drops` | Drop rollups | public when 3 independent installs agree |
| `site.professions` | Profession hubs | hub pages exist. The leveling path is tool.profession_path. |
| `site.waitlist` | Waitlist | signup path exists. Persists when Supabase is connected. |
| `addon.skeleton` | Collector skeleton | TOC 70058, SavedVariables, /upload import. In-client beta test is still waiting. |
| `ops.stored_rollups` | Corpus snapshot | Vercel cron every 10 minutes extends snapshots/corpus.json in R2 with uploads it has not seen. Pages read that one object. ?rebuild=1 (with CRON_SECRET) rebuilds from empty after a deletion. |
| `ops.dns` | everloot.app DNS | A @ 76.76.21.21 and CNAME www cname.vercel-dns.com in Cloudflare, both DNS only. https://everloot.app and www answer 200 with a Let's Encrypt certificate. |
| `ops.vercel_git` | vercel git connect | CDVolvik/everloot is connected and the root directory is web. A push to main deploys production. |
| `ops.supabase` | Supabase + R2 storage | Intake writes the raw upload to R2 bucket everloot-uploads and one index row to Supabase everloot (ref uinmowrmyckklpbwzqhn); the waitlist is a Supabase table. Pages read the indexed objects. Proven end to end on everloot.app 2026-10-04. |

## Next

| Id | Name | Done when |
|---|---|---|
| `mcp.public_https` | Public HTTPS MCP | Bearer token is on the loopback handler (--token or EVERLOOT_MCP_TOKEN). Done when that same handler is on a public HTTPS URL and ChatGPT can connect. |
| `tool.profession_path` | Profession leveling path | Engine and MCP tool profession_path. A step needs 3 agreeing uploads. Gold needs 3 prices per reagent. Intake accepts recipe_seen and price_seen. The tool reads EVERLOOT_UPLOADS when it is set, and otherwise returns the rule and the gaps. Page: /tools/professions. |
| `tool.item_page` | Item page for a drop row | Page /database/items/[id] and MCP tool item_page. Name and map pin need 3 agreeing sightings. The rate is the public rollup. The tool reads EVERLOOT_UPLOADS when it is set, and otherwise returns the empty page. |
| `tool.npc_page` | NPC spawn page | Page /database/npcs/[id] and MCP tool npc_page. A name or map pin needs 3 agreeing sightings. The tool reads EVERLOOT_UPLOADS when it is set, and otherwise returns the empty page. |
| `tool.quest_page` | Quest page | Page /database/quests/[id] and MCP tool quest_page. Title, level, giver, turn-in, and a reward each need 3 agreeing uploads. The tool reads EVERLOOT_UPLOADS when it is set, and otherwise returns the empty page. |
| `tool.vendor_page` | Vendor page | Page /database/vendors/[id] and MCP tool vendor_page. A price is public when 3 installs agree on the item and the copper. The tool reads EVERLOOT_UPLOADS when it is set, and otherwise returns the empty page. |
| `tool.collection` | Missing-collection view | Page /tools/collections and MCP tool collection_gap. A list item needs 3 installs agreeing on the collection, the source, and the item. Owned is that install's upload. Not a Blizzard profile read. The tool reads EVERLOOT_UPLOADS when it is set. |
| `tool.guild` | Guild tracker | Page /tools/guild-board and MCP tool guild_board. Roster, bosses, loot, and item level need 2 agreeing officer uploads. score_v1 has no published weights, so there is no single score. The tool reads EVERLOOT_UPLOADS when it is set. |
| `tool.guild_census` | Public guild-family page | Citation page is /guilds/olympus. Each figure has its source and date. Battle.net guild profile answers for retail and Classic Era in the local adapter. Forever namespaces were refused on 2026-09-30. Done when that namespace fills the same table. Spec: guild system, census section. |
| `tool.auction` | Auction history | Page /tools/auctions and MCP tool auction_history. A day is public when 3 installs scanned that item on that realm. Intake accepts auction_scan. The tool reads EVERLOOT_UPLOADS when it is set. |
| `tool.simc` | SimulationCraft sidecar | run the GPL-3.0 forever branch as its own process once it can sim. Report comes back through MCP. Do not paste the C++ into this repo. |
| `site.gap_marking` | Unrecorded is not zero | Done 2026-10-04: drop, goods, list, and price empties read unrecorded; vendor stock 2-of-3 no longer reads not limited; an install that never uploaded a collection is unrecorded, not owning nothing; a profession gold total names its gaps; hardcoded 0 counters removed; object loot is no longer discarded. Left: 0-of-N measured drops, guild item-level coverage, storage-unreachable shows 0, MCP with EVERLOOT_UPLOADS unset, the client-side profession form, guild-family dash. |
| `mcp.chatgpt_directory` | ChatGPT apps directory | submit the same MCP server the day submissions open |
| `mcp.subscription_signin` | Subscription sign-in | ChatGPT or Claude subscription unlocks the companion. API keys stay the fallback. |

## Waiting on Carlos

| Id | Name | Done when |
|---|---|---|
| `ops.adsense` | AdSense | Carlos's account. Consent banner already on the site. |
| `ops.beta_guild` | Beta character in a guild | two raid nights before 2026-10-21. Hakoovak is not this character. |
| `ops.hero_shot` | Hero screenshot | a real beta screenshot replaces the empty hero |
| `ops.curseforge` | CurseForge pack | staged around 2026-10-24 |
| `ops.signing` | Windows code signing | publisher is likely R21 Media Group LLC |
| `ops.trademark` | Everloot trademark check | before treating the name as clear |
| `ops.apple` | Apple Developer | only if a Mac build ships at launch |
| `ops.wiki_permission` | wiki.gg reply | email to support@indie.io on 2026-09-27. Live wiki stays off the importer until they say yes. |

## Shape only

| Id | Name | Done when |
|---|---|---|
| `ref.olympus_addon` | Olympus Guild addon (MIT) | Their in-game census. It has no server and nothing leaves the client. We cite public pages. We do not join their channel, and we do not replace the addon. |
| `ref.simc` | github.com/simulationcraft | forever branch is the sidecar. Addon is Unlicense and may fold into ours. Engine stays GPL-3.0 outside this tree. |
| `ref.wow_tools_local` | Marlamin/wow.tools.local | MIT dev tool on Carlos's machine. Do not publish extracted tables. Do not use its wago.tools download path. |
| `ref.pengu` | Pengu's Midnight profession sheet | page shape: one profession bible. Do not copy the cells. |
| `ref.gaming_tools` | gaming.tools/wow | page shape: a path that recalculates. Price it from our uploads. |
| `ref.wow_professions` | wow-professions.com | page shape: a Forever door and a TomTom pin. Do not copy their routes. |
| `ref.missing_mounts` | missingmounts.com | page shape: missing list, vendor-ready pile separated. Data comes from uploads. |
| `ref.simple_armory` | simplearmory.com | page shape: character URL, owned versus missing. Hakoovak was only a real name to open the page. |
| `ref.data_for_azeroth` | dataforazeroth.com | page shape: character page. Not a rankings product. |
| `ref.wowauctions` | wowauctions.net | page shape: realm, then item, then price history. |
| `ref.ask_mr_robot` | askmrrobot.com | page shape: one gear optimizer. Their lists stay theirs. |
| `ref.wowutils` | wowutils.com/tools | page shape: many small tools, one hub, one bridge. Use their API if we ever call them. Do not scrape. |
| `ref.liquid_armory` | liquidarmory.com | page shape: trinkets per class, loot table, seasonal overview. |
| `ref.warcraft_tools` | warcraft.tools | page shape: is the name free, what is the item worth, all alts on one page. Their Forever door is not built. |
| `ref.wow_gg` | wow.gg | page shape: a markdown twin per page. Our bridge is our MCP server, not their chat. |
| `ref.wowhead` | wowhead.com | page shape for an item. Link only. A person may check one row by hand in a browser; no bulk reads or XML endpoint. |
| `ref.wowforevertalent` | wowforevertalent.com | the gap standard: unrecorded is not zero. Their rows stay theirs. |
| `ref.foreverdiff` | foreverdiff.com | blocked. Client-extracted tables. Never fetch or compare against it. |
| `ref.icy_veins` | icy-veins.com | page shape: class grid and a news rail. Link only. |
| `ref.raider` | raider.io/search | page shape: one search box. Not a score. |
| `ref.wowprogress` | wowprogress.com | page shape: guild progress. Link only until terms are read. |
| `ref.warcraftlogs` | warcraftlogs.com | explain-a-pull waits on their terms and on Forever log support. |
| `ref.wago_io` | wago.io | page shape: a snippet library. Not wago.tools. Those tables stay blocked. |
| `ref.tbc_rtw` | tbc.rtw.dev | unread past the title. Open it in a browser before borrowing a layout. |
| `ref.wow_pets` | wow-pets.com | unread. Cloudflare 522 on 2026-09-29. Do not substitute another pet site. |
