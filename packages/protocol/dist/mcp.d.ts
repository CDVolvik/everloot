import { z } from "zod";
/**
 * The Everloot MCP server's tools: names, titles, descriptions, input schemas and annotations, in the
 * order the server lists them. kb/src/mcp-server.ts registers from this table and supplies the handlers;
 * the connect page and llms.txt list from it; schema/mcp/<tool>.json is generated from it. Every tool
 * is read-only. Today every tool answers with one text block (TOOL_OUTPUT); structured output is a later
 * minor release, tool by tool.
 */
/** Record kinds in the knowledge release (lore and reference data). */
export declare const KNOWLEDGE_KINDS: readonly ["item", "npc", "object", "quest", "zone", "spell", "lore_page", "creator", "realm"];
/** Game versions a knowledge record can belong to. */
export declare const GAME_VERSIONS: readonly ["forever", "classic", "retail", "lore"];
/** Entities relation edges connect. A zone is a UiMap id. */
export declare const ENTITY_KINDS: readonly ["item", "spell", "npc", "object", "quest", "zone", "item_set", "icon", "skill"];
export type EntityKind = (typeof ENTITY_KINDS)[number];
/** Typed relations between entities, in the order pages list them: what players saw first, then what the files say. */
export declare const RELS: readonly ["dropped_by", "sold_by", "reward_from", "located_in", "created_by", "reagent_for", "part_of_set", "same_icon", "in_skill_line"];
export type Rel = (typeof RELS)[number];
/** recent_changes filters. */
export declare const CHANGE_FILTERS: readonly ["all", "posts", "hotfixes", "builds"];
export type ChangeFilter = (typeof CHANGE_FILTERS)[number];
/** ecosystem_projects boards, and the filter that adds "all" (A to Z). */
export declare const BOARD_IDS: readonly ["installed", "rising", "active", "release", "maintained"];
export type BoardId = (typeof BOARD_IDS)[number];
export declare const ECOSYSTEM_BOARD_FILTERS: readonly ["all", "installed", "rising", "active", "release", "maintained"];
/** world_map_near: radius in yards and results per list. */
export declare const NEAR_DEFAULT_RADIUS = 500;
export declare const NEAR_MAX_RADIUS = 5000;
export declare const NEAR_DEFAULT_LIMIT = 5;
export declare const NEAR_MAX_LIMIT = 20;
/** Item quality slugs in Enum.ItemQuality order. */
export declare const ITEM_QUALITY_SLUGS: readonly ["poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom"];
export interface McpToolDef {
    title: string;
    description: string;
    inputSchema: z.ZodRawShape;
    annotations: {
        readOnlyHint: true;
        openWorldHint: false;
    };
}
/** Every tool, keyed by name, in the order the server lists them. */
export declare const MCP_TOOLS: {
    readonly search_knowledge: {
        readonly title: "Search the Everloot knowledge base";
        readonly description: "Search WoW lore and Forever reference data. Exact-name matches rank first. Every hit carries its source and licence.";
        readonly inputSchema: {
            query: z.ZodString;
            kind: z.ZodOptional<z.ZodEnum<{
                creator: "creator";
                item: "item";
                lore_page: "lore_page";
                npc: "npc";
                object: "object";
                quest: "quest";
                realm: "realm";
                spell: "spell";
                zone: "zone";
            }>>;
            version: z.ZodOptional<z.ZodEnum<{
                classic: "classic";
                forever: "forever";
                lore: "lore";
                retail: "retail";
            }>>;
            limit: z.ZodDefault<z.ZodNumber>;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly get_entity: {
        readonly title: "Get one knowledge record by id";
        readonly description: "Fetch the full record behind a search hit id, for page rendering.";
        readonly inputSchema: {
            readonly id: z.ZodNumber;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly get_by_name: {
        readonly title: "Get records by exact name";
        readonly description: "Exact full-name match (case-insensitive) for disambiguation. Use search_knowledge for fuzzy matches.";
        readonly inputSchema: {
            readonly name: z.ZodString;
            readonly kind: z.ZodOptional<z.ZodEnum<{
                creator: "creator";
                item: "item";
                lore_page: "lore_page";
                npc: "npc";
                object: "object";
                quest: "quest";
                realm: "realm";
                spell: "spell";
                zone: "zone";
            }>>;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly profession_path: {
        readonly title: "Profession leveling path";
        readonly description: "Leveling path for one Forever profession from Everloot uploads. A step exists only after 3 installs agree: on a reported recipe, or on the recipe colours that make it orange (a guaranteed skill-up), starting at the trainer's required rank. Gold exists only after 3 price uploads agree. No copied guide. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
        readonly inputSchema: {
            readonly profession: z.ZodString;
            readonly fromSkill: z.ZodDefault<z.ZodNumber>;
            readonly toSkill: z.ZodNumber;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly recipe_thresholds: {
        readonly title: "Recipe skill ranges";
        readonly description: "Where a Forever profession's recipes turn yellow, green and grey, inferred from the colours players' trade-skill windows showed. A recipe appears only after 3 installs agree, as ranges, never guessed exact numbers. Agreed reagents come with an estimated cost per craft when every reagent has an agreed price. Reads Everloot's current public corpus.";
        readonly inputSchema: {
            readonly profession: z.ZodString;
            readonly recipe: z.ZodOptional<z.ZodString>;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly item_page: {
        readonly title: "Item page for a drop";
        readonly description: "One Forever item: agreed name, public drop rate with kill count, and an agreed map pin. A rate is public after 3 installs kill the source. A name or pin needs 3 installs agreeing. No Wowhead rows. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
        readonly inputSchema: {
            readonly itemId: z.ZodNumber;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly npc_page: {
        readonly title: "NPC page";
        readonly description: "One Forever NPC: agreed name and map pins. A name or pin needs 3 installs agreeing. The pin does not require a drop. No copied spawn list. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
        readonly inputSchema: {
            readonly npcId: z.ZodNumber;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly object_page: {
        readonly title: "Game object page";
        readonly description: "One game object (a chest, herb, ore vein or fishing pool) by the id in its GUID: the items players looted from it, each with observed loot windows, windows with the item and distinct install reports. A frequency is public after 3 install reports; a public object with nothing in its windows reads as a measured zero. Objects have no names yet. Reads Everloot's current authorized public corpus when connected.";
        readonly inputSchema: {
            readonly objectId: z.ZodNumber;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly quest_page: {
        readonly title: "Quest page";
        readonly description: "One Forever quest: agreed title, level, giver, turn-in, and rewards. Each fact needs 3 installs agreeing. No copied quest text. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
        readonly inputSchema: {
            readonly questId: z.ZodNumber;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly vendor_page: {
        readonly title: "Vendor page";
        readonly description: "Goods one Forever vendor sells. An item is listed when 3 installs agree on that item and its copper price. Two agreed prices both stay listed. No copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
        readonly inputSchema: {
            readonly vendorNpcId: z.ZodNumber;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly world_map_near: {
        readonly title: "What is near a place on the map";
        readonly description: `Entrances, NPCs and vendors near a spot, nearest first, with straight-line distances in yards. Give a zone (name or map id) with x and y from 0 to 100, or an NPC id to start from where that NPC stands. Entrances come from the game files and are unconfirmed. NPCs and vendors are player-observed and listed only where 3 installs agree on the position. Zones the files hold back as possibly unreleased are not offered. Game objects are not listed: no public record gives them a position. Reads Everloot's current authorized public corpus when connected.`;
        readonly inputSchema: {
            readonly zone: z.ZodOptional<z.ZodString>;
            readonly x: z.ZodOptional<z.ZodNumber>;
            readonly y: z.ZodOptional<z.ZodNumber>;
            readonly npcId: z.ZodOptional<z.ZodNumber>;
            readonly radius: z.ZodDefault<z.ZodNumber>;
            readonly limit: z.ZodDefault<z.ZodNumber>;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly entity_relations: {
        readonly title: "How an item, NPC, spell or quest connects to others";
        readonly description: `Every typed relation of one entity, both directions: dropped by, sold by, reward from, located in (player-observed, listed where 3 installs agree, with the install count and last seen), and created by, reagent for, part of set, same icon (found in game files, unconfirmed, with the build they came from). Ids are the game's own. Reads Everloot's current authorized public corpus and the committed client layer.`;
        readonly inputSchema: {
            readonly kind: z.ZodEnum<{
                icon: "icon";
                item: "item";
                item_set: "item_set";
                npc: "npc";
                object: "object";
                quest: "quest";
                skill: "skill";
                spell: "spell";
                zone: "zone";
            }>;
            readonly id: z.ZodNumber;
            readonly rel: z.ZodOptional<z.ZodEnum<{
                created_by: "created_by";
                dropped_by: "dropped_by";
                in_skill_line: "in_skill_line";
                located_in: "located_in";
                part_of_set: "part_of_set";
                reagent_for: "reagent_for";
                reward_from: "reward_from";
                same_icon: "same_icon";
                sold_by: "sold_by";
            }>>;
            readonly direction: z.ZodDefault<z.ZodEnum<{
                both: "both";
                from: "from";
                to: "to";
            }>>;
            readonly limit: z.ZodDefault<z.ZodNumber>;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly item_categories: {
        readonly title: "Item categories: class, subclass, slot and quality";
        readonly description: `Item categories from the game files (found in game files, unconfirmed, with the build): class and subclass with the client's English names and slugs, slot and quality. With no arguments, the whole tree with item counts. With item, that item's category path. With class (a slug such as weapon or armor), and optionally subclass, slot and quality slugs, the items in it. Ids only: item names come from player uploads (item_page).`;
        readonly inputSchema: {
            readonly item: z.ZodOptional<z.ZodNumber>;
            readonly class: z.ZodOptional<z.ZodString>;
            readonly subclass: z.ZodOptional<z.ZodString>;
            readonly slot: z.ZodOptional<z.ZodString>;
            readonly quality: z.ZodOptional<z.ZodEnum<{
                artifact: "artifact";
                common: "common";
                epic: "epic";
                heirloom: "heirloom";
                legendary: "legendary";
                poor: "poor";
                rare: "rare";
                uncommon: "uncommon";
            }>>;
            readonly limit: z.ZodDefault<z.ZodNumber>;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly collection_gap: {
        readonly title: "Owned versus missing in a collection";
        readonly description: "Missing items in one collection for one install. A list row is public after 3 installs agree on the collection, the source, and the item. Owned is what that install uploaded. Not a Blizzard profile read and not a copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
        readonly inputSchema: {
            readonly collection: z.ZodString;
            readonly ownerInstallId: z.ZodString;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly completion_progress: {
        readonly title: "Achievement, reputation, title and quest progress";
        readonly description: "What one install's characters have finished, and what is closest to done: achievements with the largest share of criteria or progress met, reputations nearest the next standing, titles known, and quests finished in a chain. A list entry is public after 3 players (installs uploading from different addresses) report it identically. Progress is shown only when that install uploaded it with the collection sharing choice and a verified grant; without it the answer says so. Not a Blizzard profile read and not a copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
        readonly inputSchema: {
            readonly ownerInstallId: z.ZodString;
            readonly characterKey: z.ZodOptional<z.ZodString>;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly guild_board: {
        readonly title: "Officer guild board";
        readonly description: "Roster, bosses, loot, attendance, and average item level from officer uploads. A figure is public after 2 uploads agree. The average names how many roster members were measured. There is no single score because score_v1 weights are not published. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
        readonly inputSchema: {
            readonly guildName: z.ZodString;
            readonly realm: z.ZodString;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly auction_history: {
        readonly title: "Auction history for one item";
        readonly description: "Price history from auction scans players uploaded on purpose. A day is public after 3 installs scanned that item on that realm. Copper is the median. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
        readonly inputSchema: {
            readonly realm: z.ZodString;
            readonly itemId: z.ZodNumber;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly market_value: {
        readonly title: "Forever market value for one item";
        readonly description: "Market value, minimum buyout, historical value and units listed for one item on one WoW: Forever realm, from full auction scans players started and uploaded. A day is public after 3 reporters (distinct upload addresses) scanned the item; values are medians, thin days and outlier days are left out of the market value. Market value weights the last 14 public days, historical is the median of 60. Missing or unavailable data is reported explicitly.";
        readonly inputSchema: {
            readonly realm: z.ZodString;
            readonly itemId: z.ZodNumber;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly gold_ledger: {
        readonly title: "Gold ledger for one character";
        readonly description: "Peak gold and the money events that character's own upload recorded. Loot, quests, vendors, and auction sales stay on the money line. Gameplay stays on its own line. A missing line is unrecorded. The difference is not called bought and is not a ban. Installs are not merged. No scan of a player who did not upload. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
        readonly inputSchema: {
            readonly character: z.ZodString;
            readonly realm: z.ZodString;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly recent_changes: {
        readonly title: "Recent official changes for WoW: Forever";
        readonly description: "Newest first: Blizzard blue posts (title, author, time, a short excerpt and the link to the original), hotfix posts, and new game builds. Excerpts only: Blizzard's post text is Blizzard's, so open the link for the full post. A build's time is when Everloot first saw it, not Blizzard's release time.";
        readonly inputSchema: {
            readonly filter: z.ZodDefault<z.ZodEnum<{
                all: "all";
                builds: "builds";
                hotfixes: "hotfixes";
                posts: "posts";
            }>>;
            readonly game: z.ZodOptional<z.ZodEnum<{
                classic: "classic";
                forever: "forever";
            }>>;
            readonly limit: z.ZodDefault<z.ZodNumber>;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly ecosystem_projects: {
        readonly title: "WoW: Forever addons and open-source projects";
        readonly description: "Forever addons and tools from the community registry, with a board ranking: most installed, rising, most active, freshest release or best maintained. Each project shows its GitHub repository, stars, latest release, last commit, whether its .toc declares a Forever interface number, and installs from Everloot uploads (counted from 3 installs; a missing count means not counted, not zero). Projects are ranked, never people. GitHub facts carry the time they were refreshed.";
        readonly inputSchema: {
            readonly board: z.ZodDefault<z.ZodEnum<{
                active: "active";
                all: "all";
                installed: "installed";
                maintained: "maintained";
                release: "release";
                rising: "rising";
            }>>;
            readonly forever_ready_only: z.ZodOptional<z.ZodBoolean>;
            readonly limit: z.ZodDefault<z.ZodNumber>;
        };
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
    readonly everloot_plan: {
        readonly title: "Everloot implementation tracker";
        readonly description: "The full Everloot build list: what is live, what is next, what is waiting on Carlos, and which reference sites are page shapes only. Read this before assuming a tool exists.";
        readonly inputSchema: {};
        readonly annotations: {
            readonly readOnlyHint: true;
            readonly openWorldHint: false;
        };
    };
};
export type McpToolName = keyof typeof MCP_TOOLS;
/** The parsed arguments one tool receives, defaults applied. */
export type McpToolArgs<K extends McpToolName> = z.infer<z.ZodObject<(typeof MCP_TOOLS)[K]["inputSchema"]>>;
/** The names in the order the server lists them. */
export declare const MCP_TOOL_NAMES: McpToolName[];
/** The list form, for clients that iterate. */
export declare const MCP_TOOL_LIST: ({
    title: "Search the Everloot knowledge base";
    description: "Search WoW lore and Forever reference data. Exact-name matches rank first. Every hit carries its source and licence.";
    inputSchema: {
        query: z.ZodString;
        kind: z.ZodOptional<z.ZodEnum<{
            creator: "creator";
            item: "item";
            lore_page: "lore_page";
            npc: "npc";
            object: "object";
            quest: "quest";
            realm: "realm";
            spell: "spell";
            zone: "zone";
        }>>;
        version: z.ZodOptional<z.ZodEnum<{
            classic: "classic";
            forever: "forever";
            lore: "lore";
            retail: "retail";
        }>>;
        limit: z.ZodDefault<z.ZodNumber>;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Get one knowledge record by id";
    description: "Fetch the full record behind a search hit id, for page rendering.";
    inputSchema: {
        readonly id: z.ZodNumber;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Get records by exact name";
    description: "Exact full-name match (case-insensitive) for disambiguation. Use search_knowledge for fuzzy matches.";
    inputSchema: {
        readonly name: z.ZodString;
        readonly kind: z.ZodOptional<z.ZodEnum<{
            creator: "creator";
            item: "item";
            lore_page: "lore_page";
            npc: "npc";
            object: "object";
            quest: "quest";
            realm: "realm";
            spell: "spell";
            zone: "zone";
        }>>;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Profession leveling path";
    description: "Leveling path for one Forever profession from Everloot uploads. A step exists only after 3 installs agree: on a reported recipe, or on the recipe colours that make it orange (a guaranteed skill-up), starting at the trainer's required rank. Gold exists only after 3 price uploads agree. No copied guide. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
    inputSchema: {
        readonly profession: z.ZodString;
        readonly fromSkill: z.ZodDefault<z.ZodNumber>;
        readonly toSkill: z.ZodNumber;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Recipe skill ranges";
    description: "Where a Forever profession's recipes turn yellow, green and grey, inferred from the colours players' trade-skill windows showed. A recipe appears only after 3 installs agree, as ranges, never guessed exact numbers. Agreed reagents come with an estimated cost per craft when every reagent has an agreed price. Reads Everloot's current public corpus.";
    inputSchema: {
        readonly profession: z.ZodString;
        readonly recipe: z.ZodOptional<z.ZodString>;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Item page for a drop";
    description: "One Forever item: agreed name, public drop rate with kill count, and an agreed map pin. A rate is public after 3 installs kill the source. A name or pin needs 3 installs agreeing. No Wowhead rows. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
    inputSchema: {
        readonly itemId: z.ZodNumber;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "NPC page";
    description: "One Forever NPC: agreed name and map pins. A name or pin needs 3 installs agreeing. The pin does not require a drop. No copied spawn list. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
    inputSchema: {
        readonly npcId: z.ZodNumber;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Game object page";
    description: "One game object (a chest, herb, ore vein or fishing pool) by the id in its GUID: the items players looted from it, each with observed loot windows, windows with the item and distinct install reports. A frequency is public after 3 install reports; a public object with nothing in its windows reads as a measured zero. Objects have no names yet. Reads Everloot's current authorized public corpus when connected.";
    inputSchema: {
        readonly objectId: z.ZodNumber;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Quest page";
    description: "One Forever quest: agreed title, level, giver, turn-in, and rewards. Each fact needs 3 installs agreeing. No copied quest text. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
    inputSchema: {
        readonly questId: z.ZodNumber;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Vendor page";
    description: "Goods one Forever vendor sells. An item is listed when 3 installs agree on that item and its copper price. Two agreed prices both stay listed. No copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
    inputSchema: {
        readonly vendorNpcId: z.ZodNumber;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "What is near a place on the map";
    description: `Entrances, NPCs and vendors near a spot, nearest first, with straight-line distances in yards. Give a zone (name or map id) with x and y from 0 to 100, or an NPC id to start from where that NPC stands. Entrances come from the game files and are unconfirmed. NPCs and vendors are player-observed and listed only where 3 installs agree on the position. Zones the files hold back as possibly unreleased are not offered. Game objects are not listed: no public record gives them a position. Reads Everloot's current authorized public corpus when connected.`;
    inputSchema: {
        readonly zone: z.ZodOptional<z.ZodString>;
        readonly x: z.ZodOptional<z.ZodNumber>;
        readonly y: z.ZodOptional<z.ZodNumber>;
        readonly npcId: z.ZodOptional<z.ZodNumber>;
        readonly radius: z.ZodDefault<z.ZodNumber>;
        readonly limit: z.ZodDefault<z.ZodNumber>;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "How an item, NPC, spell or quest connects to others";
    description: `Every typed relation of one entity, both directions: dropped by, sold by, reward from, located in (player-observed, listed where 3 installs agree, with the install count and last seen), and created by, reagent for, part of set, same icon (found in game files, unconfirmed, with the build they came from). Ids are the game's own. Reads Everloot's current authorized public corpus and the committed client layer.`;
    inputSchema: {
        readonly kind: z.ZodEnum<{
            icon: "icon";
            item: "item";
            item_set: "item_set";
            npc: "npc";
            object: "object";
            quest: "quest";
            skill: "skill";
            spell: "spell";
            zone: "zone";
        }>;
        readonly id: z.ZodNumber;
        readonly rel: z.ZodOptional<z.ZodEnum<{
            created_by: "created_by";
            dropped_by: "dropped_by";
            in_skill_line: "in_skill_line";
            located_in: "located_in";
            part_of_set: "part_of_set";
            reagent_for: "reagent_for";
            reward_from: "reward_from";
            same_icon: "same_icon";
            sold_by: "sold_by";
        }>>;
        readonly direction: z.ZodDefault<z.ZodEnum<{
            both: "both";
            from: "from";
            to: "to";
        }>>;
        readonly limit: z.ZodDefault<z.ZodNumber>;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Item categories: class, subclass, slot and quality";
    description: `Item categories from the game files (found in game files, unconfirmed, with the build): class and subclass with the client's English names and slugs, slot and quality. With no arguments, the whole tree with item counts. With item, that item's category path. With class (a slug such as weapon or armor), and optionally subclass, slot and quality slugs, the items in it. Ids only: item names come from player uploads (item_page).`;
    inputSchema: {
        readonly item: z.ZodOptional<z.ZodNumber>;
        readonly class: z.ZodOptional<z.ZodString>;
        readonly subclass: z.ZodOptional<z.ZodString>;
        readonly slot: z.ZodOptional<z.ZodString>;
        readonly quality: z.ZodOptional<z.ZodEnum<{
            artifact: "artifact";
            common: "common";
            epic: "epic";
            heirloom: "heirloom";
            legendary: "legendary";
            poor: "poor";
            rare: "rare";
            uncommon: "uncommon";
        }>>;
        readonly limit: z.ZodDefault<z.ZodNumber>;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Owned versus missing in a collection";
    description: "Missing items in one collection for one install. A list row is public after 3 installs agree on the collection, the source, and the item. Owned is what that install uploaded. Not a Blizzard profile read and not a copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
    inputSchema: {
        readonly collection: z.ZodString;
        readonly ownerInstallId: z.ZodString;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Achievement, reputation, title and quest progress";
    description: "What one install's characters have finished, and what is closest to done: achievements with the largest share of criteria or progress met, reputations nearest the next standing, titles known, and quests finished in a chain. A list entry is public after 3 players (installs uploading from different addresses) report it identically. Progress is shown only when that install uploaded it with the collection sharing choice and a verified grant; without it the answer says so. Not a Blizzard profile read and not a copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
    inputSchema: {
        readonly ownerInstallId: z.ZodString;
        readonly characterKey: z.ZodOptional<z.ZodString>;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Officer guild board";
    description: "Roster, bosses, loot, attendance, and average item level from officer uploads. A figure is public after 2 uploads agree. The average names how many roster members were measured. There is no single score because score_v1 weights are not published. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
    inputSchema: {
        readonly guildName: z.ZodString;
        readonly realm: z.ZodString;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Auction history for one item";
    description: "Price history from auction scans players uploaded on purpose. A day is public after 3 installs scanned that item on that realm. Copper is the median. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
    inputSchema: {
        readonly realm: z.ZodString;
        readonly itemId: z.ZodNumber;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Forever market value for one item";
    description: "Market value, minimum buyout, historical value and units listed for one item on one WoW: Forever realm, from full auction scans players started and uploaded. A day is public after 3 reporters (distinct upload addresses) scanned the item; values are medians, thin days and outlier days are left out of the market value. Market value weights the last 14 public days, historical is the median of 60. Missing or unavailable data is reported explicitly.";
    inputSchema: {
        readonly realm: z.ZodString;
        readonly itemId: z.ZodNumber;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Gold ledger for one character";
    description: "Peak gold and the money events that character's own upload recorded. Loot, quests, vendors, and auction sales stay on the money line. Gameplay stays on its own line. A missing line is unrecorded. The difference is not called bought and is not a ban. Installs are not merged. No scan of a player who did not upload. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.";
    inputSchema: {
        readonly character: z.ZodString;
        readonly realm: z.ZodString;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Recent official changes for WoW: Forever";
    description: "Newest first: Blizzard blue posts (title, author, time, a short excerpt and the link to the original), hotfix posts, and new game builds. Excerpts only: Blizzard's post text is Blizzard's, so open the link for the full post. A build's time is when Everloot first saw it, not Blizzard's release time.";
    inputSchema: {
        readonly filter: z.ZodDefault<z.ZodEnum<{
            all: "all";
            builds: "builds";
            hotfixes: "hotfixes";
            posts: "posts";
        }>>;
        readonly game: z.ZodOptional<z.ZodEnum<{
            classic: "classic";
            forever: "forever";
        }>>;
        readonly limit: z.ZodDefault<z.ZodNumber>;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "WoW: Forever addons and open-source projects";
    description: "Forever addons and tools from the community registry, with a board ranking: most installed, rising, most active, freshest release or best maintained. Each project shows its GitHub repository, stars, latest release, last commit, whether its .toc declares a Forever interface number, and installs from Everloot uploads (counted from 3 installs; a missing count means not counted, not zero). Projects are ranked, never people. GitHub facts carry the time they were refreshed.";
    inputSchema: {
        readonly board: z.ZodDefault<z.ZodEnum<{
            active: "active";
            all: "all";
            installed: "installed";
            maintained: "maintained";
            release: "release";
            rising: "rising";
        }>>;
        readonly forever_ready_only: z.ZodOptional<z.ZodBoolean>;
        readonly limit: z.ZodDefault<z.ZodNumber>;
    };
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
} | {
    title: "Everloot implementation tracker";
    description: "The full Everloot build list: what is live, what is next, what is waiting on Carlos, and which reference sites are page shapes only. Read this before assuming a tool exists.";
    inputSchema: {};
    annotations: {
        readonly readOnlyHint: true;
        readonly openWorldHint: false;
    };
    name: "auction_history" | "collection_gap" | "completion_progress" | "ecosystem_projects" | "entity_relations" | "everloot_plan" | "get_by_name" | "get_entity" | "gold_ledger" | "guild_board" | "item_categories" | "item_page" | "market_value" | "npc_page" | "object_page" | "profession_path" | "quest_page" | "recent_changes" | "recipe_thresholds" | "search_knowledge" | "vendor_page" | "world_map_near";
})[];
/**
 * What every tool returns today: one text content block. Answers built on player data end with the
 * credit line, after a line stating how old the data is. Tools that read nothing from players carry
 * their sources inside the text instead.
 */
export declare const TOOL_OUTPUT: {
    readonly type: "text";
    readonly endsWith: "Licence: CC BY-SA 4.0. Credit: Everloot contributors, https://everloot.app";
};
/** The tools whose answers are built on player uploads and therefore end with TOOL_OUTPUT.endsWith. */
export declare const PLAYER_DATA_TOOLS: readonly McpToolName[];
