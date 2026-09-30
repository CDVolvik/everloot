/**
 * One list of everything Everloot still has to ship.
 * docs/TRACKER.md is this function's output. A test fails if the file drifts.
 * The MCP tool `everloot_plan` returns the same text, so a connected client
 * sees the whole map and cannot quietly drop a row.
 */

export type PlanStatus = "live" | "next" | "waiting" | "shape";

export type PlanItem = {
  id: string;
  status: PlanStatus;
  name: string;
  /** What "done" means, or why this row is not a build. */
  done: string;
};

export const BRIDGE_PLAN: readonly PlanItem[] = [
  { id: "mcp.search_knowledge", status: "live", name: "Search the knowledge base", done: "stdio tool on everloot-knowledge" },
  { id: "mcp.get_entity", status: "live", name: "Fetch one record by id", done: "stdio tool on everloot-knowledge" },
  { id: "mcp.get_by_name", status: "live", name: "Exact-name lookup", done: "stdio tool on everloot-knowledge" },
  { id: "mcp.everloot_plan", status: "live", name: "This tracker, as a tool", done: "a client can ask what is live, next, waiting, or shape-only" },
  { id: "mcp.http_local", status: "live", name: "Local HTTP MCP", done: "POST /mcp on 127.0.0.1. Same server as stdio. Not reachable by ChatGPT yet." },
  { id: "site.home", status: "live", name: "Public home", done: "https://everloot-web-r21digital.vercel.app" },
  { id: "site.upload", status: "live", name: "Upload + intake", done: "/upload and /api/intake. Persists when Supabase is connected." },
  { id: "site.drops", status: "live", name: "Drop rollups", done: "public when 3 independent installs agree" },
  { id: "site.professions", status: "live", name: "Profession hubs", done: "hub pages exist. The leveling path is tool.profession_path." },
  { id: "site.waitlist", status: "live", name: "Waitlist", done: "signup path exists. Persists when Supabase is connected." },
  { id: "addon.skeleton", status: "live", name: "Collector skeleton", done: "TOC 70058, SavedVariables, /upload import. In-client beta test is still waiting." },

  { id: "mcp.public_https", status: "next", name: "Public HTTPS MCP", done: "same /mcp handler on a public URL with auth, so a ChatGPT subscription can connect" },
  { id: "tool.profession_path", status: "next", name: "Profession leveling path", done: "reagent list and a gold cost from our uploads, one MCP tool" },
  { id: "tool.item_page", status: "next", name: "Item page for a drop row", done: "name, source, drop, map, from our rollups, one MCP tool" },
  { id: "tool.collection", status: "next", name: "Missing-collection view", done: "owned versus missing from an upload, grouped by source. Not a Blizzard profile read." },
  { id: "tool.guild", status: "next", name: "Guild tracker", done: "progression, roster, loot, internal score. Officer-published guild data only." },
  { id: "tool.guild_census", status: "next", name: "Guild-family census", done: "Sum of one upload per guild. Two reporters must agree. Characters are not double-counted. Players dedupe only by an opt-in alt link. Missing guilds stay missing. No public Forever roster API. Spec: guild system, census section." },
  { id: "tool.auction", status: "next", name: "Auction history", done: "prices from the player's own AH browsing, uploaded on purpose" },
  { id: "tool.simc", status: "next", name: "SimulationCraft sidecar", done: "run the GPL-3.0 forever branch as its own process once it can sim. Report comes back through MCP. Do not paste the C++ into this repo." },
  { id: "mcp.chatgpt_directory", status: "next", name: "ChatGPT apps directory", done: "submit the same MCP server the day submissions open" },
  { id: "mcp.subscription_signin", status: "next", name: "Subscription sign-in", done: "ChatGPT or Claude subscription unlocks the companion. API keys stay the fallback." },

  { id: "ops.dns", status: "waiting", name: "everloot.app DNS", done: "Carlos approves the Domain Connect click. Apex did not answer HTTP on 2026-09-29." },
  { id: "ops.vercel_git", status: "waiting", name: "vercel git connect", done: "Carlos connects the GitHub repo in Vercel" },
  { id: "ops.supabase", status: "waiting", name: "Supabase project", done: "intake and waitlist stop failing soft" },
  { id: "ops.adsense", status: "waiting", name: "AdSense", done: "Carlos's account. Consent banner already on the site." },
  { id: "ops.beta_guild", status: "waiting", name: "Beta character in a guild", done: "two raid nights before 2026-10-21. Hakoovak is not this character." },
  { id: "ops.hero_shot", status: "waiting", name: "Hero screenshot", done: "a real beta screenshot replaces the empty hero" },
  { id: "ops.curseforge", status: "waiting", name: "CurseForge pack", done: "staged around 2026-10-24" },
  { id: "ops.signing", status: "waiting", name: "Windows code signing", done: "publisher is likely R21 Media Group LLC" },
  { id: "ops.trademark", status: "waiting", name: "Everloot trademark check", done: "before treating the name as clear" },
  { id: "ops.apple", status: "waiting", name: "Apple Developer", done: "only if a Mac build ships at launch" },
  { id: "ops.wiki_permission", status: "waiting", name: "wiki.gg reply", done: "email to support@indie.io on 2026-09-27. Live wiki stays off the importer until they say yes." },

  { id: "ref.olympus_addon", status: "shape", name: "Olympus Guild addon (MIT)", done: "In-game census of Asmongold's guilds. The author says nothing leaves the client. Learn the rules. Do not run our own hidden-channel reporter." },
  { id: "ref.simc", status: "shape", name: "github.com/simulationcraft", done: "forever branch is the sidecar. Addon is Unlicense and may fold into ours. Engine stays GPL-3.0 outside this tree." },
  { id: "ref.wow_tools_local", status: "shape", name: "Marlamin/wow.tools.local", done: "MIT dev tool on Carlos's machine. Do not publish extracted tables. Do not use its wago.tools download path." },
  { id: "ref.pengu", status: "shape", name: "Pengu's Midnight profession sheet", done: "page shape: one profession bible. Do not copy the cells." },
  { id: "ref.gaming_tools", status: "shape", name: "gaming.tools/wow", done: "page shape: a path that recalculates. Price it from our uploads." },
  { id: "ref.wow_professions", status: "shape", name: "wow-professions.com", done: "page shape: a Forever door and a TomTom pin. Do not copy their routes." },
  { id: "ref.missing_mounts", status: "shape", name: "missingmounts.com", done: "page shape: missing list, vendor-ready pile separated. Data comes from uploads." },
  { id: "ref.simple_armory", status: "shape", name: "simplearmory.com", done: "page shape: character URL, owned versus missing. Hakoovak was only a real name to open the page." },
  { id: "ref.data_for_azeroth", status: "shape", name: "dataforazeroth.com", done: "page shape: character page. Not a rankings product." },
  { id: "ref.wowauctions", status: "shape", name: "wowauctions.net", done: "page shape: realm, then item, then price history." },
  { id: "ref.ask_mr_robot", status: "shape", name: "askmrrobot.com", done: "page shape: one gear optimizer. Their lists stay theirs." },
  { id: "ref.wowutils", status: "shape", name: "wowutils.com/tools", done: "page shape: many small tools, one hub, one bridge. Use their API if we ever call them. Do not scrape." },
  { id: "ref.liquid_armory", status: "shape", name: "liquidarmory.com", done: "page shape: trinkets per class, loot table, seasonal overview." },
  { id: "ref.warcraft_tools", status: "shape", name: "warcraft.tools", done: "page shape: is the name free, what is the item worth, all alts on one page. Their Forever door is not built." },
  { id: "ref.wow_gg", status: "shape", name: "wow.gg", done: "page shape: a markdown twin per page. Our bridge is our MCP server, not their chat." },
  { id: "ref.wowhead", status: "shape", name: "wowhead.com", done: "page shape for an item. Link only." },
  { id: "ref.icy_veins", status: "shape", name: "icy-veins.com", done: "page shape: class grid and a news rail. Link only." },
  { id: "ref.raider", status: "shape", name: "raider.io/search", done: "page shape: one search box. Not a score." },
  { id: "ref.wowprogress", status: "shape", name: "wowprogress.com", done: "page shape: guild progress. Link only until terms are read." },
  { id: "ref.warcraftlogs", status: "shape", name: "warcraftlogs.com", done: "explain-a-pull waits on their terms and on Forever log support." },
  { id: "ref.wago_io", status: "shape", name: "wago.io", done: "page shape: a snippet library. Not wago.tools. Those tables stay blocked." },
  { id: "ref.tbc_rtw", status: "shape", name: "tbc.rtw.dev", done: "unread past the title. Open it in a browser before borrowing a layout." },
  { id: "ref.wow_pets", status: "shape", name: "wow-pets.com", done: "unread. Cloudflare 522 on 2026-09-29. Do not substitute another pet site." },
];

const STATUS_LABEL: Record<PlanStatus, string> = {
  live: "Live",
  next: "Next",
  waiting: "Waiting on Carlos",
  shape: "Shape only",
};

export function planIds(): string[] {
  return BRIDGE_PLAN.map((item) => item.id);
}

export function renderTracker(): string {
  const lines = [
    "# Everloot implementation tracker",
    "",
    "Generated from `kb/src/bridge-plan.ts`. Edit that file, then regenerate this page.",
    "The MCP tool `everloot_plan` returns the same text.",
    "",
    "Hakoovak (US / Moon Guard) is Carlos's own character, sent so two reference pages",
    "could be opened on a real name. It is not a fixture and not the Forever beta character.",
    "",
    "Order: one server. Each product tool is one MCP tool on that server. A ChatGPT",
    "subscription connects to the public HTTPS mount and uses its own model. Closed",
    "sites contribute a page shape. Their text and tables stay put. SimulationCraft's",
    "engine stays a separate GPL program.",
    "",
    `Rows: ${BRIDGE_PLAN.length}.`,
    "",
  ];
  for (const status of ["live", "next", "waiting", "shape"] as const) {
    lines.push(`## ${STATUS_LABEL[status]}`, "", "| Id | Name | Done when |", "|---|---|---|");
    for (const item of BRIDGE_PLAN.filter((row) => row.status === status)) {
      lines.push(`| \`${item.id}\` | ${item.name} | ${item.done} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function handlePlan(): string {
  return renderTracker();
}
