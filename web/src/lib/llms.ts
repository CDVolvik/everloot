import { CORPUS_URL, MCP_RESOURCES, MCP_TOOLS, MCP_URL, REQUESTS_PER_HOUR } from "@/app/connect/connect-data";
import { LAUNCH, longDate } from "@/data/wow-forever";
import { tools, toolHref } from "@/data/tools";
import { PUBLIC_RECORD_KINDS } from "@everloot/protocol";
import { latestBuildLine } from "@/lib/changes-facts";
import { loadTimeline, type ChangeEntry } from "@/lib/changes";
import { NON_AFFILIATION } from "@/lib/jsonld";
import { ANON_PAGE, ANON_PER_HOUR, guardOn } from "@/lib/data-guard";
import { CREDIT_LINE } from "@everloot/protocol";
import { SITE_URL } from "@/lib/seo";
import { TALENT_CLASSES } from "@/lib/talents/catalogs";

/**
 * /llms.txt and /llms-full.txt are generated here from the same lists the site reads (the tool catalog, the MCP
 * tool list, the changes timeline), so a new tool or a new MCP tool shows up without anyone editing a text file.
 */

const url = (path: string) => `${SITE_URL}${path}`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Pages that are not catalog tools but belong in the map of the site. */
const PAGES: { title: string; path: string; text: string }[] = [
  { title: "What is WoW: Forever", path: "/wow-forever", text: "The launch date quoted from Blizzard's announcement with its source and the date it was checked, and the latest game build Everloot has seen." },
  { title: "Patch notes and Blizzard posts", path: "/changes", text: "New game builds, hotfixes and Blizzard blue posts, newest first, with links to Blizzard's originals. A build's date is when Everloot first saw it." },
  { title: "World map", path: "/map", text: "Zones and dungeon and raid entrances read from the game files, drawn by Everloot with no game art. Found in game files, unconfirmed." },
  { title: "Addons", path: "/addons", text: "Everloot's collection addon and Polestar, a leveling-guide addon." },
  { title: "Upload addon data", path: "/upload", text: "Download the Everloot addon (AGPL-3.0) and upload what it collected, with a preview and explicit sharing choices." },
  { title: "Lore archive", path: "/lore", text: "Warcraft Wiki pages as of 13 November 2023, CC BY-SA 4.0. Lore and history, not WoW: Forever data." },
  { title: "Connect", path: "/connect", text: "How to use the public corpus API and the MCP server, and the credit line." },
  { title: "How we count", path: "/methodology", text: "How addon uploads become facts: three installs must agree, unrecorded is not zero, and what is never published." },
  { title: "About", path: "/about", text: "What Everloot is and is not." },
  { title: "Privacy", path: "/privacy", text: "How uploads, cookies and usage statistics are handled." },
  { title: "Terms of use", path: "/terms", text: "Uploads, API keys, licences, trademarks, takedown requests and warranty." },
  { title: "Security", path: "/security", text: "How to report a security problem privately, and what is in scope." },
  { title: "Accessibility", path: "/accessibility", text: "What the site aims for, what is in place, what has been checked and what has not, and how to report a problem." },
];

const LIMITATIONS = [
  "Everloot is a fan project. " + NON_AFFILIATION,
  "Data read from the game files is Blizzard's, not under Everloot's licence, and is labelled found in game files, unconfirmed until seen in play.",
  "A build's date on /changes is when Everloot first saw it, not when Blizzard shipped it.",
  "The level the second talent set unlocks (40) comes from the beta notes, not from the game files, and is unconfirmed.",
  "Public database facts appear only when enough install reports agree. Distinct addon install IDs are not proof of independent people.",
  "Loot-window observations are not verified kills and are not kill-based drop probabilities.",
  "No actual beta-client collection trial has been verified yet. Empty storage and unavailable storage are different states.",
  "No number, name or position is invented for an unknown entity. Farming routes and respawn optimization are planned, not built.",
  "The lore archive is a 2023 Warcraft Wiki snapshot and predates WoW: Forever.",
];

const bullet = (title: string, path: string, text: string) => `- [${title}](${url(path)}): ${text}`;

/** The paging and key sentence for the corpus API; it names limits only once the data guard is on. */
function corpusAccess(): string {
  return guardOn()
    ? `Pages with ?offset= and ?limit=. Without a key: ${ANON_PER_HOUR} requests per hour per IP, ${ANON_PAGE} records a page; a free key (${url("/connect#keys")}) lifts both.`
    : "Optional ?offset= and ?limit= page it.";
}

/** Catalog tools by status. A page already described in PAGES, or listed twice in the catalog, appears once. */
function toolLines(): { live: string[]; collecting: string[] } {
  const seen = new Set(PAGES.map((p) => p.path));
  const lines = (status: "live" | "collecting") =>
    tools
      .filter((t) => t.status === status)
      .filter((t) => !seen.has(toolHref(t)) && seen.add(toolHref(t)))
      .map((t) => bullet(t.title, toolHref(t), t.tagline));
  const live = lines("live");
  return { live, collecting: lines("collecting") };
}

function head(): string[] {
  return [
    "# Everloot",
    "",
    "> Free tools and a database for WoW: Forever (World of Warcraft: Forever). Talent calculator, raid buff planner, world map, patch notes and Blizzard posts, and a database built from player addon uploads. Public data is sparse and depends on corroborated reports.",
    "",
  ];
}

function connect(): string[] {
  return [
    "## For AI assistants and developers",
    `- [MCP server](${MCP_URL}): the way for an AI assistant to answer a question from Everloot's data. Read-only, no sign-in, ${REQUESTS_PER_HOUR} requests per hour per IP. ${MCP_TOOLS.length} tools: ${MCP_TOOLS.map((t) => t.name).join(", ")}. ${MCP_RESOURCES.length} resources, read whole: ${MCP_RESOURCES.map((r) => r.uri).join(", ")}.`,
    bullet("Public corpus API", "/api/corpus/public", `Raw anonymous addon observations in bulk, for developers building their own datasets; to answer a question, use the MCP server. Filter with ?kinds=${PUBLIC_RECORD_KINDS.slice(0, 2).join(",")}. ${corpusAccess()} Credit: ${CREDIT_LINE}`),
    bullet("Relations API", "/api/edges", "Typed relations between items, NPCs, spells, professions and quests (dropped by, sold by, created by, reagent for, set, same icon, profession), paged, filterable by entity, relation and evidence. Player-observed rows need 3 installs; game-file rows are labelled found in game files, unconfirmed, with their build, and are Blizzard's, not under our licence. The whole game-file layer: /api/edges/client-layer."),
    bullet("Objects", "/database/objects", "Chests, herbs, ore veins and fishing pools players looted, by the id in their GUID, with what came out of them; public after 3 install reports."),
    bullet("Items by category", "/database/items", "Every item in the current build by class and subclass, with slot and quality filters, from the game files (found in game files, unconfirmed). As JSON: /api/items and /api/items/categories."),
    bullet("OpenAPI document", "/api/openapi.json", "OpenAPI 3.1 for every JSON endpoint, assembled from the same protocol the routes are tested against."),
    bullet("JSON Schema", "/schema/index.json", "The protocol: one JSON Schema per upload record kind, the API response shapes (/schema/api/<name>.json) and the MCP tool inputs (/schema/mcp/<tool>.json)."),
    bullet("Connect guide", "/connect", "Setup for Claude Code and other MCP clients, a reference of every tool and endpoint, with examples."),
    bullet("Changes feed (RSS)", "/changes/feed.xml", "The newest 50 WoW: Forever builds and Blizzard posts."),
    "",
  ];
}

function limitations(): string[] {
  return ["## Data limitations", ...LIMITATIONS.map((l) => `- ${l}`), ""];
}

export function llmsTxt(): string {
  const { live, collecting } = toolLines();
  return [
    ...head(),
    "## Tools",
    ...live,
    "",
    "## Collecting data (pages are live, public facts open as reports arrive)",
    ...collecting,
    "",
    "## Pages",
    ...PAGES.map((p) => bullet(p.title, p.path, p.text)),
    `- Talent calculator per class: ${TALENT_CLASSES.map((c) => `[${cap(c)}](${url(`/tools/talents/${c}`)})`).join(", ")}.`,
    "",
    ...connect(),
    ...limitations(),
    "## Full version",
    bullet("llms-full.txt", "/llms-full.txt", "The same map with every MCP tool described and the licences."),
    "",
    "Code AGPL-3.0, Everloot's own data CC BY-SA 4.0.",
    "",
  ].join("\n");
}

export function llmsFullTxt(entries: ChangeEntry[] = loadTimeline()): string {
  const { live, collecting } = toolLines();
  return [
    ...head(),
    `Site: ${SITE_URL}`,
    "",
    "## What Everloot is",
    "Everloot follows WoW: Forever. It publishes tools built on the game files, tracks Blizzard's posts and builds, and runs a database of observations that players upload with the Everloot addon. It is run by its maintainer.",
    NON_AFFILIATION,
    "",
    "## Launch date",
    `Blizzard's announcement says: "${LAUNCH.quote}". Source: ${LAUNCH.sourceName}, ${LAUNCH.sourceTitle}, ${LAUNCH.sourceUrl}. Checked on ${longDate(LAUNCH.checkedOn)}. See ${url("/wow-forever")}.`,
    "",
    "## Latest build",
    latestBuildLine(entries),
    "",
    "## Tools",
    ...live,
    "",
    "## Collecting data",
    ...collecting,
    "",
    "## Pages",
    ...PAGES.map((p) => bullet(p.title, p.path, p.text)),
    `- Talent calculator per class: ${TALENT_CLASSES.map((c) => `[${cap(c)}](${url(`/tools/talents/${c}`)})`).join(", ")}.`,
    "",
    "## MCP server",
    `Endpoint: ${MCP_URL} (streamable HTTP, read-only, no sign-in, ${REQUESTS_PER_HOUR} requests per hour per IP). Tools:`,
    ...MCP_TOOLS.map((t) => `- ${t.name}: ${t.text}`),
    "Resources (read whole with resources/read):",
    ...MCP_RESOURCES.map((r) => `- ${r.uri}: ${r.text}`),
    "",
    "## Public corpus API",
    `GET ${CORPUS_URL}. Raw records in bulk; for answering questions the MCP server above is the right tool. Optional ?kinds= takes a comma-separated list of: ${PUBLIC_RECORD_KINDS.join(", ")}. Records carry no install id. ${corpusAccess()} Each response carries the licence and credit line in an attribution field and in X-Everloot-Licence, X-Everloot-Credit and Link headers. Credit: ${CREDIT_LINE}`,
    "",
    "## Relations API",
    `GET ${url("/api/edges")}. One row per relation: fromKind, fromId, rel, toKind, toId, evidence (observed or client), build, installs, firstSeen, lastSeen. Filters: from_kind, from_id, to_kind, to_id, rel, evidence; with none, the whole table pages like the corpus API. Observed rows follow the 3-install rule and carry ${CREDIT_LINE} Client rows are found in game files, unconfirmed, stamped with their build, and carry a gameData notice: Blizzard's data, not under Everloot's licence. ${url("/api/edges/client-layer")} returns the current build's whole game-file layer in one file.`,
    "",
    "## Items API",
    `GET ${url("/api/items")}: every item in the current build with its class, subclass, slot and quality, from the game files. Filters: item, class and subclass (slugs, as in ${url("/database/items")}), slot, quality; paged like the corpus API. ${url("/api/items/categories")} lists the class and subclass tree with slugs and counts. Found in game files, unconfirmed, stamped with the build; Blizzard's data, not under Everloot's licence, so these answers carry a gameData notice instead of the credit line.`,
    "",
    "## OpenAPI and schemas",
    `${url("/api/openapi.json")} describes every endpoint above (OpenAPI 3.1). ${url("/schema/index.json")} lists the protocol's JSON Schema files: records/<kind>.json for each upload record kind, api/<name>.json for each response shape, mcp/<tool>.json for each MCP tool's input. The same definitions are the npm package @everloot/protocol in the repository.`,
    "",
    "## Changes feed",
    `${url("/changes/feed.xml")} is RSS 2.0 with the newest 50 WoW: Forever entries.`,
    "",
    ...limitations(),
    "## Licences",
    "- Code: AGPL-3.0. Source: https://github.com/CDVolvik/everloot",
    "- Everloot's own data and uploaded observations: CC BY-SA 4.0, credited to Everloot contributors.",
    "- Game-file data (talents, raid buffs, map, build changes): Blizzard's, not under Everloot's licence.",
    "- Lore archive: Warcraft Wiki contributors, CC BY-SA 4.0.",
    "",
  ].join("\n");
}
