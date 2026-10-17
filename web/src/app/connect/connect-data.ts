const SITE = "https://everloot.app";
export const MCP_URL = `${SITE}/mcp/public`;
export const CORPUS_URL = `${SITE}/api/corpus/public`;

/** The public MCP's per-IP limit per hour. connect.test.ts checks it against intake-quota.ts. */
export const REQUESTS_PER_HOUR = 200;

/** Every tool kb/src/mcp-server.ts registers, in its order. connect.test.ts fails if the two drift apart. */
export const MCP_TOOLS: readonly { name: string; text: string }[] = [
  { name: "search_knowledge", text: "Search lore and reference data. Every hit has its source and licence." },
  { name: "get_entity", text: "One record, by the id a search hit gives you." },
  { name: "get_by_name", text: "Records with exactly this name, for telling similar names apart." },
  { name: "profession_path", text: "A leveling path for one profession, from what players reported." },
  { name: "recipe_thresholds", text: "The skill ranges where a recipe turns yellow, green and grey." },
  { name: "item_page", text: "One item: agreed name, drop rate with kill count, map pin." },
  { name: "npc_page", text: "One NPC: agreed name and map pins." },
  { name: "quest_page", text: "One quest: title, level, giver, turn-in and rewards." },
  { name: "vendor_page", text: "What one vendor sells, with copper prices." },
  { name: "world_map_near", text: "What is near a spot: entrances, observed NPCs and vendors, with distances in yards." },
  { name: "collection_gap", text: "What one install is missing from a collection, such as Mounts." },
  { name: "completion_progress", text: "What one install's characters finished in achievements, reputation, titles and quest chains, and what is closest to done." },
  { name: "guild_board", text: "A guild's roster, bosses, loot and attendance, from officer uploads." },
  { name: "auction_history", text: "Daily median auction price for one item on one realm." },
  { name: "market_value", text: "Market value, minimum buyout, historical value and units listed for one item on one realm, from full scans players started." },
  { name: "gold_ledger", text: "Peak gold and money events for one character, from that player's own upload." },
  { name: "recent_changes", text: "Recent Blizzard staff posts, hotfixes and new game builds, newest first, with links to the originals." },
  { name: "ecosystem_projects", text: "Forever addons and open-source projects, ranked on five boards, with GitHub facts and install counts from 3 installs." },
  { name: "everloot_plan", text: "What is built, what is next and what is waiting. Read it before assuming a tool exists." },
];

const curlBody = JSON.stringify({
  jsonrpc: "2.0", id: 1, method: "tools/call",
  params: { name: "get_by_name", arguments: { name: "Thrall" } },
});

export const CONNECT_EXAMPLES = {
  claudeCode: `claude mcp add --transport http everloot ${MCP_URL}`,
  remoteConfig: JSON.stringify({ mcpServers: { everloot: { type: "http", url: MCP_URL } } }, null, 2),
  mcpCurl: `curl -s ${MCP_URL} \\
  -H "content-type: application/json" \\
  -H "accept: application/json, text/event-stream" \\
  -d '${curlBody}'`,
  localSite: `git clone https://github.com/CDVolvik/everloot.git
cd everloot
(cd kb && npm install)
cd web && npm install
npm run sample-release    # prints a KB_SNAPSHOT_PATH line
# put that line and EVERLOOT_MCP_PUBLIC=1 in web/.env.local
npm run dev               # MCP at http://localhost:3000/mcp/public`,
  stdioConfig: JSON.stringify({
    mcpServers: {
      everloot: {
        command: "node",
        args: [
          "/path/to/everloot/kb/node_modules/tsx/dist/cli.mjs",
          "/path/to/everloot/kb/src/cli.ts",
          "serve-mcp",
          "--db",
          "/path/to/everloot/web/.data/release/release.sqlite",
        ],
        env: { EVERLOOT_PUBLIC_CORPUS_URL: CORPUS_URL },
      },
    },
  }, null, 2),
  corpusCurl: `curl -s "${CORPUS_URL}?kinds=loot,vendor"`,
  corpusShape: `{
  "ok": true,
  "uploads": 1,
  "records": [
    {
      "kind": "loot",
      "eventId": "example:1",
      "capturedAt": "2026-10-17T08:00:00.000Z",
      "sourceNpcId": 1234,
      "items": [{ "itemId": 5678, "count": 1 }]
    }
  ],
  "dataAsOf": "2026-10-17T08:50:28.003Z",
  "kinds": ["loot"]
}`,
  credit: `Data from Everloot (https://everloot.app), CC BY-SA 4.0.`,
} as const;
