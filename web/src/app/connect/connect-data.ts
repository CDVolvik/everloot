import { CREDIT_LINE, LICENCE, LICENCE_URL, MCP_RESOURCE_URIS, MCP_TOOL_NAMES, SITE, TERMS_URL, type McpResourceUri, type McpToolName } from "@everloot/protocol";

export const MCP_URL = `${SITE}/mcp/public`;
export const CORPUS_URL = `${SITE}/api/corpus/public`;

/** The public MCP's per-IP limit per hour. connect.test.ts checks it against intake-quota.ts. */
export const REQUESTS_PER_HOUR = 200;

/** One plain sentence per tool for the page and llms.txt, keyed by name so a new tool in the protocol fails the type check here. */
const TOOL_TEXT: Record<McpToolName, string> = {
  search_knowledge: "Search lore and reference data. Every hit has its source and licence.",
  get_entity: "One record, by the id a search hit gives you.",
  get_by_name: "Records with exactly this name, for telling similar names apart.",
  answer_sources: "The evidence behind a question, each piece with its source, licence and date, so an assistant can answer and cite.",
  profession_path: "A leveling path for one profession, from what players reported.",
  recipe_thresholds: "The skill ranges where a recipe turns yellow, green and grey.",
  item_page: "One item: agreed name, drop rate with kill count, map pin.",
  npc_page: "One NPC: agreed name and map pins.",
  object_page: "One game object (a chest, herb, ore vein or fishing pool): the items players looted from it, with loot windows and install counts.",
  quest_page: "One quest: title, level, giver, turn-in and rewards.",
  vendor_page: "What one vendor sells, with copper prices.",
  world_map_near: "What is near a spot: entrances, observed NPCs and vendors, with distances in yards.",
  entity_relations: "How an item, NPC, spell or quest connects to others: dropped by, sold by, created by, reagent for, set, same icon. Each relation says if players saw it (3 installs) or the game files hold it (unconfirmed, with the build).",
  item_categories: "Item classes, subclasses, slots and qualities from the game files, with item counts; one item's category path, or the items in a category. Found in game files, unconfirmed, with the build.",
  talent_tree: "One class's talent trees from the game files: every node with its talents, ranks, position, prerequisites and row gate. Found in game files, unconfirmed, with the build.",
  talent_plan: "Reads a talent share code or calculator link: the talents and ranks it holds, points per tree, the lowest level for it, and every problem in plain words.",
  collection_gap: "What one install is missing from a collection, such as Mounts.",
  completion_progress: "What one install's characters finished in achievements, reputation, titles and quest chains, and what is closest to done.",
  guild_board: "A guild's roster, bosses, loot and attendance, from officer uploads.",
  auction_history: "Daily median auction price for one item on one realm.",
  market_value: "Market value, minimum buyout, historical value and units listed for one item on one realm, from full scans players started.",
  gold_ledger: "Peak gold and money events for one character, from that player's own upload.",
  recent_changes: "Recent Blizzard staff posts, hotfixes and new game builds, newest first, with links to the originals.",
  ecosystem_projects: "Forever addons and open-source projects, ranked on five boards, with GitHub facts and install counts from 3 installs.",
  everloot_plan: "What is built, what is next and what is waiting. Read it before assuming a tool exists.",
};

/** Every tool the MCP server registers, in the protocol's order. */
export const MCP_TOOLS: readonly { name: McpToolName; text: string }[] = MCP_TOOL_NAMES.map((name) => ({ name, text: TOOL_TEXT[name] }));

/** One plain sentence per resource, keyed by URI so a new resource in the protocol fails the type check here. */
const RESOURCE_TEXT: Record<McpResourceUri, string> = {
  "everloot://builds": "The build the game-file facts come from, and every build Blizzard's version service has listed, with when Everloot first saw it. JSON.",
  "everloot://methodology": "How uploads become facts: three installs must agree, unrecorded is never zero, game files and play are kept apart, and what is never published. Markdown.",
  "everloot://data-policy": "The data policy in short: what is published, what is refused, the licence and credit line, and the limits on bulk copying. Markdown.",
};

/** Every resource the MCP server registers, in the protocol's order. A client reads one whole with resources/read. */
export const MCP_RESOURCES: readonly { uri: McpResourceUri; text: string }[] = MCP_RESOURCE_URIS.map((uri) => ({ uri, text: RESOURCE_TEXT[uri] }));

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
  openapiCurl: `curl -s ${SITE}/api/openapi.json | jq '.paths | keys'`,
  pagingJs: `// Every loot record, page by page. Stop when next is null.
let url = "${CORPUS_URL}?kinds=loot&limit=500";
const records = [];
while (url) {
  const body = await (await fetch(url)).json();
  if (!body.ok) throw new Error(body.error);
  records.push(...body.records);
  url = body.next;
}
console.log(records.length, "loot windows as of", body.dataAsOf);
// Show the credit line wherever these appear: body.attribution.credit`,
  pagingPy: `import requests

url = "${CORPUS_URL}?kinds=vendor&limit=500"
records = []
while url:
    body = requests.get(url, timeout=30).json()
    if not body["ok"]:
        raise SystemExit(body["error"])
    records.extend(body["records"])
    url = body["next"]
print(len(records), "vendor lists; credit:", body["attribution"]["credit"])`,
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
  "kinds": ["loot"],
  "offset": 0,
  "limit": 1,
  "total": 1,
  "next": null,
  "attribution": {
    "licence": "${LICENCE}",
    "licenceUrl": "${LICENCE_URL}",
    "credit": "${CREDIT_LINE}",
    "source": "${SITE}/database",
    "terms": "${TERMS_URL}"
  }
}`,
  credit: CREDIT_LINE,
} as const;
