import { z } from "zod";
import { MCP_CREDIT } from "./attribution.js";

/**
 * The Everloot MCP server's tools: names, titles, descriptions, input schemas and annotations, in the
 * order the server lists them. kb/src/mcp-server.ts registers from this table and supplies the handlers;
 * the connect page and llms.txt list from it; schema/mcp/<tool>.json is generated from it. Every tool
 * is read-only. Today every tool answers with one text block (TOOL_OUTPUT); structured output is a later
 * minor release, tool by tool.
 */

/** Record kinds in the knowledge release (lore and reference data). */
export const KNOWLEDGE_KINDS = ["item", "npc", "object", "quest", "zone", "spell", "lore_page", "creator", "realm"] as const;
/** Game versions a knowledge record can belong to. */
export const GAME_VERSIONS = ["forever", "classic", "retail", "lore"] as const;
/** Entities relation edges connect. A zone is a UiMap id. */
export const ENTITY_KINDS = ["item", "spell", "npc", "object", "quest", "zone", "item_set", "icon", "skill"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];
/** Typed relations between entities, in the order pages list them: what players saw first, then what the files say. */
export const RELS = [
  "dropped_by", "sold_by", "reward_from", "located_in",
  "created_by", "reagent_for", "part_of_set", "same_icon", "in_skill_line",
] as const;
export type Rel = (typeof RELS)[number];
/** recent_changes filters. */
export const CHANGE_FILTERS = ["all", "posts", "hotfixes", "builds"] as const;
export type ChangeFilter = (typeof CHANGE_FILTERS)[number];
/** ecosystem_projects boards, and the filter that adds "all" (A to Z). */
export const BOARD_IDS = ["installed", "rising", "active", "release", "maintained"] as const;
export type BoardId = (typeof BOARD_IDS)[number];
export const ECOSYSTEM_BOARD_FILTERS = ["all", ...BOARD_IDS] as const;
/** world_map_near: radius in yards and results per list. */
export const NEAR_DEFAULT_RADIUS = 500;
export const NEAR_MAX_RADIUS = 5000;
export const NEAR_DEFAULT_LIMIT = 5;
export const NEAR_MAX_LIMIT = 20;
/** Item quality slugs in Enum.ItemQuality order. */
export const ITEM_QUALITY_SLUGS = ["poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom"] as const;

const searchArgs = {
  query: z.string().max(1000).describe("What to look up: names, questions, keywords. Question words are ignored."),
  kind: z.enum(KNOWLEDGE_KINDS).optional().describe("Narrow to one record kind."),
  version: z.enum(GAME_VERSIONS).optional().describe("Narrow to one game version."),
  limit: z.number().int().min(1).max(25).default(8),
};

export interface McpToolDef {
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  annotations: { readOnlyHint: true; openWorldHint: false };
}

/** Every tool, keyed by name, in the order the server lists them. */
export const MCP_TOOLS = {
  search_knowledge: {
    title: "Search the Everloot knowledge base",
    description:
      "Search WoW lore and Forever reference data. Exact-name matches rank first. Every hit carries its source and licence.",
    inputSchema: searchArgs,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  get_entity: {
    title: "Get one knowledge record by id",
    description: "Fetch the full record behind a search hit id, for page rendering.",
    inputSchema: { id: z.number().int().describe("Record id from a search_knowledge hit.") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  get_by_name: {
    title: "Get records by exact name",
    description: "Exact full-name match (case-insensitive) for disambiguation. Use search_knowledge for fuzzy matches.",
    inputSchema: {
      name: z.string().max(200).describe("Full record name."),
      kind: z.enum(KNOWLEDGE_KINDS).optional().describe("Narrow to one record kind."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  profession_path: {
    title: "Profession leveling path",
    description:
      "Leveling path for one Forever profession from Everloot uploads. A step exists only after 3 installs agree: on a reported recipe, or on the recipe colours that make it orange (a guaranteed skill-up), starting at the trainer's required rank. Gold exists only after 3 price uploads agree. No copied guide. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
    inputSchema: {
      profession: z.string().describe("Profession name, such as Alchemy."),
      fromSkill: z.number().int().min(1).max(500).default(1).describe("Skill the character has now."),
      toSkill: z.number().int().min(1).max(500).describe("Skill to stop at. Must be above fromSkill."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  recipe_thresholds: {
    title: "Recipe skill ranges",
    description:
      "Where a Forever profession's recipes turn yellow, green and grey, inferred from the colours players' trade-skill windows showed. A recipe appears only after 3 installs agree, as ranges, never guessed exact numbers. Agreed reagents come with an estimated cost per craft when every reagent has an agreed price. Reads Everloot's current public corpus.",
    inputSchema: {
      profession: z.string().describe("Profession name, such as Alchemy."),
      recipe: z.string().optional().describe("Optional part of a recipe name to narrow the list."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  item_page: {
    title: "Item page for a drop",
    description:
      "One Forever item: agreed name, public drop rate with kill count, and an agreed map pin. A rate is public after 3 installs kill the source. A name or pin needs 3 installs agreeing. No Wowhead rows. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
    inputSchema: { itemId: z.number().int().positive().describe("Item id from a drop row.") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  npc_page: {
    title: "NPC page",
    description:
      "One Forever NPC: agreed name and map pins. A name or pin needs 3 installs agreeing. The pin does not require a drop. No copied spawn list. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
    inputSchema: { npcId: z.number().int().positive().describe("NPC id.") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  object_page: {
    title: "Game object page",
    description:
      "One game object (a chest, herb, ore vein or fishing pool) by the id in its GUID: the items players looted from it, each with observed loot windows, windows with the item and distinct install reports. A frequency is public after 3 install reports; a public object with nothing in its windows reads as a measured zero. Objects have no names yet. Reads Everloot's current authorized public corpus when connected.",
    inputSchema: { objectId: z.number().int().positive().describe("The object's entry id, as in /database/objects/1731.") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  quest_page: {
    title: "Quest page",
    description:
      "One Forever quest: agreed title, level, giver, turn-in, and rewards. Each fact needs 3 installs agreeing. No copied quest text. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
    inputSchema: { questId: z.number().int().positive().describe("Quest id.") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  vendor_page: {
    title: "Vendor page",
    description:
      "Goods one Forever vendor sells. An item is listed when 3 installs agree on that item and its copper price. Two agreed prices both stay listed. No copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
    inputSchema: { vendorNpcId: z.number().int().positive().describe("Vendor NPC id.") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  world_map_near: {
    title: "What is near a place on the map",
    description:
      `Entrances, NPCs and vendors near a spot, nearest first, with straight-line distances in yards. Give a zone (name or map id) with x and y from 0 to 100, or an NPC id to start from where that NPC stands. Entrances come from the game files and are unconfirmed. NPCs and vendors are player-observed and listed only where 3 installs agree on the position. Zones the files hold back as possibly unreleased are not offered. Game objects are not listed: no public record gives them a position. Reads Everloot's current authorized public corpus when connected.`,
    inputSchema: {
      zone: z.string().max(80).optional().describe("Zone name or map id, such as Elwynn Forest or 1429. Needs x and y."),
      x: z.number().min(0).max(100).optional().describe("Across the zone map, 0 (west) to 100 (east)."),
      y: z.number().min(0).max(100).optional().describe("Down the zone map, 0 (north) to 100 (south)."),
      npcId: z.number().int().positive().optional().describe("Start from this NPC's agreed position instead of a zone and x, y."),
      radius: z.number().positive().max(NEAR_MAX_RADIUS).default(NEAR_DEFAULT_RADIUS).describe("Search radius in yards."),
      limit: z.number().int().min(1).max(NEAR_MAX_LIMIT).default(NEAR_DEFAULT_LIMIT).describe("Most results per list."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  entity_relations: {
    title: "How an item, NPC, spell or quest connects to others",
    description:
      `Every typed relation of one entity, both directions: dropped by, sold by, reward from, located in (player-observed, listed where 3 installs agree, with the install count and last seen), and created by, reagent for, part of set, same icon (found in game files, unconfirmed, with the build they came from). Ids are the game's own. Reads Everloot's current authorized public corpus and the committed client layer.`,
    inputSchema: {
      kind: z.enum(ENTITY_KINDS).describe("What the id names. A zone is a UiMap id, as on /map."),
      id: z.number().int().positive().describe("The game's id for it, such as item 19019."),
      rel: z.enum(RELS).optional().describe("Only this relation."),
      direction: z.enum(["from", "to", "both"]).default("both").describe("from: what this entity points to (an item's sources). to: what points at it (what an NPC drops). Default both."),
      limit: z.number().int().min(1).max(100).default(25).describe("Most lines per relation."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  item_categories: {
    title: "Item categories: class, subclass, slot and quality",
    description:
      `Item categories from the game files (found in game files, unconfirmed, with the build): class and subclass with the client's English names and slugs, slot and quality. With no arguments, the whole tree with item counts. With item, that item's category path. With class (a slug such as weapon or armor), and optionally subclass, slot and quality slugs, the items in it. Ids only: item names come from player uploads (item_page).`,
    inputSchema: {
      item: z.number().int().positive().optional().describe("An item id: answers its class, subclass, slot and quality."),
      class: z.string().max(40).optional().describe("Class slug, such as weapon, armor, consumable or trade-goods."),
      subclass: z.string().max(40).optional().describe("Subclass slug or number within the class, such as one-handed-swords or cloth."),
      slot: z.string().max(40).optional().describe("Slot slug, such as head, chest, one-hand or trinket."),
      quality: z.enum(ITEM_QUALITY_SLUGS).optional().describe("poor, common, uncommon, rare, epic, legendary, artifact or heirloom."),
      limit: z.number().int().min(1).max(100).default(25).describe("Most items listed."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  collection_gap: {
    title: "Owned versus missing in a collection",
    description:
      "Missing items in one collection for one install. A list row is public after 3 installs agree on the collection, the source, and the item. Owned is what that install uploaded. Not a Blizzard profile read and not a copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
    inputSchema: {
      collection: z.string().describe("Collection name, such as Mounts."),
      ownerInstallId: z.string().describe("Install id whose owned upload to compare."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  completion_progress: {
    title: "Achievement, reputation, title and quest progress",
    description:
      "What one install's characters have finished, and what is closest to done: achievements with the largest share of criteria or progress met, reputations nearest the next standing, titles known, and quests finished in a chain. A list entry is public after 3 players (installs uploading from different addresses) report it identically. Progress is shown only when that install uploaded it with the collection sharing choice and a verified grant; without it the answer says so. Not a Blizzard profile read and not a copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
    inputSchema: {
      ownerInstallId: z.string().describe("Install id whose completion upload to read."),
      characterKey: z.string().max(8).optional().describe("One character's 8-digit key from the upload, when the install has several."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  guild_board: {
    title: "Officer guild board",
    description:
      "Roster, bosses, loot, attendance, and average item level from officer uploads. A figure is public after 2 uploads agree. The average names how many roster members were measured. There is no single score because score_v1 weights are not published. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
    inputSchema: {
      guildName: z.string().describe("Guild name."),
      realm: z.string().describe("Realm name."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  auction_history: {
    title: "Auction history for one item",
    description:
      "Price history from auction scans players uploaded on purpose. A day is public after 3 installs scanned that item on that realm. Copper is the median. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
    inputSchema: {
      realm: z.string().describe("Realm name."),
      itemId: z.number().int().positive().describe("Item id."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  market_value: {
    title: "Forever market value for one item",
    description:
      "Market value, minimum buyout, historical value and units listed for one item on one WoW: Forever realm, from full auction scans players started and uploaded. A day is public after 3 reporters (distinct upload addresses) scanned the item; values are medians, thin days and outlier days are left out of the market value. Market value weights the last 14 public days, historical is the median of 60. Missing or unavailable data is reported explicitly.",
    inputSchema: {
      realm: z.string().describe("Realm name."),
      itemId: z.number().int().positive().describe("Item id."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  gold_ledger: {
    title: "Gold ledger for one character",
    description:
      "Peak gold and the money events that character's own upload recorded. Loot, quests, vendors, and auction sales stay on the money line. Gameplay stays on its own line. A missing line is unrecorded. The difference is not called bought and is not a ban. Installs are not merged. No scan of a player who did not upload. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
    inputSchema: {
      character: z.string().describe("Character name."),
      realm: z.string().describe("Realm name."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  recent_changes: {
    title: "Recent official changes for WoW: Forever",
    description:
      "Newest first: Blizzard blue posts (title, author, time, a short excerpt and the link to the original), hotfix posts, and new game builds. Excerpts only: Blizzard's post text is Blizzard's, so open the link for the full post. A build's time is when Everloot first saw it, not Blizzard's release time.",
    inputSchema: {
      filter: z.enum(CHANGE_FILTERS).default("all").describe("posts (blue posts), hotfixes, builds, or all."),
      game: z.enum(["forever", "classic"]).optional().describe("Narrow to one game."),
      limit: z.number().int().min(1).max(25).default(10),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  ecosystem_projects: {
    title: "WoW: Forever addons and open-source projects",
    description:
      "Forever addons and tools from the community registry, with a board ranking: most installed, rising, most active, freshest release or best maintained. Each project shows its GitHub repository, stars, latest release, last commit, whether its .toc declares a Forever interface number, and installs from Everloot uploads (counted from 3 installs; a missing count means not counted, not zero). Projects are ranked, never people. GitHub facts carry the time they were refreshed.",
    inputSchema: {
      board: z.enum(ECOSYSTEM_BOARD_FILTERS).default("all").describe("installed, rising, active, release, maintained, or all (A to Z)."),
      forever_ready_only: z.boolean().optional().describe("Only projects whose .toc lists a Forever interface number."),
      limit: z.number().int().min(1).max(25).default(10),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  everloot_plan: {
    title: "Everloot implementation tracker",
    description:
      "The full Everloot build list: what is live, what is next, what is waiting on Carlos, and which reference sites are page shapes only. Read this before assuming a tool exists.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
} as const satisfies Record<string, McpToolDef>;

export type McpToolName = keyof typeof MCP_TOOLS;
/** The parsed arguments one tool receives, defaults applied. */
export type McpToolArgs<K extends McpToolName> = z.infer<z.ZodObject<(typeof MCP_TOOLS)[K]["inputSchema"]>>;
/** The names in the order the server lists them. */
export const MCP_TOOL_NAMES = Object.keys(MCP_TOOLS) as McpToolName[];
/** The list form, for clients that iterate. */
export const MCP_TOOL_LIST = MCP_TOOL_NAMES.map((name) => ({ name, ...MCP_TOOLS[name] }));

/**
 * What every tool returns today: one text content block. Answers built on player data end with the
 * credit line, after a line stating how old the data is. Tools that read nothing from players carry
 * their sources inside the text instead.
 */
export const TOOL_OUTPUT = { type: "text", endsWith: MCP_CREDIT } as const;
/** The tools whose answers are built on player uploads and therefore end with TOOL_OUTPUT.endsWith. */
export const PLAYER_DATA_TOOLS: readonly McpToolName[] = [
  "profession_path", "recipe_thresholds", "item_page", "npc_page", "object_page", "quest_page", "vendor_page",
  "world_map_near", "entity_relations", "collection_gap", "completion_progress", "guild_board", "auction_history",
  "market_value", "gold_ledger",
];
