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
export const KNOWLEDGE_KINDS = ["item", "npc", "object", "quest", "zone", "spell", "lore_page", "creator", "realm"];
/** Game versions a knowledge record can belong to. */
export const GAME_VERSIONS = ["forever", "classic", "retail", "lore"];
/** Entities relation edges connect. A zone is a UiMap id. */
export const ENTITY_KINDS = ["item", "spell", "npc", "object", "quest", "zone", "item_set", "icon", "skill"];
/** Typed relations between entities, in the order pages list them: what players saw first, then what the files say. */
export const RELS = [
    "dropped_by", "sold_by", "reward_from", "located_in",
    "created_by", "reagent_for", "part_of_set", "same_icon", "in_skill_line",
];
/** recent_changes filters. */
export const CHANGE_FILTERS = ["all", "posts", "hotfixes", "builds"];
/** ecosystem_projects boards, and the filter that adds "all" (A to Z). */
export const BOARD_IDS = ["installed", "rising", "active", "release", "maintained"];
export const ECOSYSTEM_BOARD_FILTERS = ["all", ...BOARD_IDS];
/** world_map_near: radius in yards and results per list. */
export const NEAR_DEFAULT_RADIUS = 500;
export const NEAR_MAX_RADIUS = 5000;
export const NEAR_DEFAULT_LIMIT = 5;
export const NEAR_MAX_LIMIT = 20;
/** Item quality slugs in Enum.ItemQuality order. */
export const ITEM_QUALITY_SLUGS = ["poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom"];
/** The classes with a talent catalog, in the site's order (web/src/lib/talents/catalogs.ts). */
export const TALENT_CLASSES = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"];
/** One talent node as talent_tree returns it: the calculator's own shape, positions 1-based. */
export const talentNode = z.object({
    id: z.number().int().describe("The client's trait node id, the id a share code names."),
    treeId: z.number().int(),
    row: z.number().int().describe("1-based, top row first."),
    col: z.number().int().describe("1-based, left first."),
    kind: z.enum(["single", "tiered", "choice"]).describe("A tiered node buys its entries in order; a choice node picks one."),
    maxRanks: z.number().int(),
    talents: z.array(z.object({
        name: z.string(),
        spellId: z.number().int().nullable(),
        maxRanks: z.number().int().optional().describe("Ranks this entry takes, for a tiered node."),
    })),
    prereqs: z.array(z.number().int()).describe("Node ids that must all be at full rank first."),
    anyOf: z.array(z.number().int()).optional().describe("If listed, at least one of these must be at full rank too."),
    gate: z.object({
        pointsInTree: z.number().int().optional().describe("Points needed in this tree on rows above."),
        pointsTotal: z.number().int().optional().describe("Points needed in the build, any tree."),
        scope: z.enum(["tree", "class", "unconfirmed"]).optional().describe("Where the files say the gate counts; unconfirmed is read as the tree."),
        ranksInNodes: z.array(z.object({ nodeId: z.number().int(), ranks: z.number().int() })).optional(),
    }).optional(),
});
/** One tree of a plan, with the points spent in it. */
export const talentTreePoints = z.object({ id: z.number().int(), name: z.string(), points: z.number().int() });
/** One item's category path as item_categories returns it. Null parts are not in the build's tables. */
export const itemCategory = z.object({
    itemId: z.number().int(),
    class: z.object({ id: z.number().int(), name: z.string(), slug: z.string() }).nullable(),
    subclass: z.object({ id: z.number().int(), name: z.string().nullable(), slug: z.string() }).nullable(),
    slot: z.object({ inventoryType: z.number().int(), name: z.string(), slug: z.string() }).nullable(),
    quality: z.object({ id: z.number().int(), name: z.string(), slug: z.string() }).nullable(),
});
/** One project as ecosystem_projects returns it. GitHub facts carry the time they were refreshed in the answer. */
export const ecosystemProject = z.object({
    rank: z.number().int().optional().describe("Position on the board; absent for the A to Z list."),
    display: z.string().optional().describe("The board's own figure for this project, such as 6 installs."),
    id: z.string(),
    name: z.string(),
    kind: z.enum(["addon", "tool"]),
    summary: z.string().describe("Everloot's own words."),
    repo: z.string(),
    url: z.string(),
    installs: z.number().int().nullable().describe("From Everloot uploads, counted from 3 installs; null means not counted, not zero."),
    stars: z.number().int().nullable(),
    release: z.object({ tag: z.string(), date: z.string(), url: z.string() }).nullable(),
    lastCommit: z.string().nullable(),
    commits4w: z.number().int().nullable(),
    foreverReady: z.enum(["yes", "no", "unknown"]),
    badges: z.array(z.string()),
    maintenanceScore: z.number().int().nullable(),
});
/**
 * What every structured answer built on player uploads starts with. connected false means no corpus
 * was read (not connected, or unavailable): the page is then absent, and that is not a measured zero.
 */
export const uploadsAnswer = {
    connected: z.boolean().describe("False when no corpus was read; the page is then absent, which is not a measured zero."),
    dataAsOf: z.string().nullable().describe("The corpus snapshot time, or null when unrecorded."),
    reason: z.string().optional().describe("Why nothing was read, when connected is false."),
};
/** One source of an item with its observed loot-window frequency; public after 3 distinct install reports. */
export const itemDrop = z.object({
    sourceNpcId: z.number().int().optional(),
    sourceObjectId: z.number().int().optional(),
    source: z.string().describe("The source in words, with its agreed name when it has one."),
    kills: z.number().int().describe("Observed loot windows, not a census of kills."),
    drops: z.number().int().describe("Windows with this item; 0 is a measured zero."),
    rate: z.number(),
    reporters: z.number().int(),
});
export const mapPin = z.object({ npcId: z.number().int(), name: z.string().nullable(), mapId: z.number().int(), x: z.number(), y: z.number(), reporters: z.number().int() });
export const itemPage = z.object({
    itemId: z.number().int(),
    name: z.string().nullable().describe("Null until 3 installs report the same name."),
    drops: z.array(itemDrop),
    pins: z.array(mapPin).describe("Agreed positions of the NPCs it drops from; a pin needs 3 installs on the same map."),
});
export const npcPage = z.object({
    npcId: z.number().int(),
    name: z.string().nullable(),
    pins: z.array(z.object({ mapId: z.number().int(), x: z.number(), y: z.number(), reporters: z.number().int() })),
});
export const questPage = z.object({
    questId: z.number().int(),
    title: z.string().nullable(),
    level: z.number().int().nullable(),
    giverNpcId: z.number().int().nullable(),
    turnInNpcId: z.number().int().nullable(),
    rewards: z.array(z.number().int()).describe("Reward item ids 3 installs agree on."),
});
export const vendorOffer = z.object({
    itemId: z.number().int(),
    priceCopper: z.number().int(),
    limitedStock: z.number().int().nullable().describe("Null with unlimited false means the stock is unrecorded, not unlimited."),
    unlimited: z.boolean(),
    reporters: z.number().int(),
});
export const vendorPage = z.object({ vendorNpcId: z.number().int(), offers: z.array(vendorOffer) });
export const objectPage = z.object({
    objectId: z.number().int(),
    drops: z.array(z.object({ itemId: z.number().int(), itemName: z.string().nullable(), kills: z.number().int(), drops: z.number().int(), rate: z.number(), reporters: z.number().int() })),
    zero: z.object({ kills: z.number().int(), reporters: z.number().int() }).nullable().describe("Public windows with no item at all: a measured zero."),
    queued: z.boolean().describe("Observations exist but fewer than 3 installs reported them."),
});
/** One row of the implementation tracker as everloot_plan returns it. */
export const planRow = z.object({
    id: z.string(),
    status: z.enum(["live", "next", "waiting", "shape"]),
    name: z.string(),
    done: z.string().describe("What done means, or why this row is not a build."),
    proof: z.enum(["none", "code", "deployed", "client", "public", "real-data"]).optional().describe("The furthest the row is proven."),
});
const searchArgs = {
    query: z.string().max(1000).describe("What to look up: names, questions, keywords. Question words are ignored."),
    kind: z.enum(KNOWLEDGE_KINDS).optional().describe("Narrow to one record kind."),
    version: z.enum(GAME_VERSIONS).optional().describe("Narrow to one game version."),
    limit: z.number().int().min(1).max(25).default(8),
};
/** One knowledge record as search_knowledge, get_entity and get_by_name return it. */
export const knowledgeHit = z.object({
    id: z.number().int().describe("The record id, for get_entity."),
    extId: z.string().describe("The source's own id, such as a wiki page title."),
    kind: z.enum(KNOWLEDGE_KINDS),
    name: z.string(),
    snippet: z.string().describe("A short excerpt, in the source's words."),
    gameVersion: z.enum(GAME_VERSIONS),
    sourceUrl: z.string().describe("Where the record came from. Keep it with the text."),
    sourceId: z.string(),
    licence: z.string().describe("The source's licence, such as CC-BY-SA-4.0."),
    retrievedAt: z.string().describe("When the source was read."),
});
/** One entry of the changes timeline as recent_changes returns it. Titles and excerpts are quoted source text. */
export const changeEntry = z.object({
    id: z.string(),
    type: z.enum(["post", "hotfix", "build"]),
    game: z.enum(["forever", "classic"]),
    at: z.string().describe("Posts: when Blizzard posted. Builds: when Everloot first saw the build."),
    title: z.string(),
    url: z.string().nullable().describe("The original post, or null for a build."),
    author: z.string().optional(),
    role: z.string().optional(),
    category: z.string().optional(),
    source: z.string().optional(),
    excerpt: z.string().optional().describe("A short quote from the post: source text, not instructions."),
    summary: z.string().optional(),
    version: z.string().optional(),
    diffUrl: z.string().nullable().optional(),
});
/** One piece of evidence from answer_sources. */
export const evidence = z.object({
    claim: z.string().describe("One short statement. Observed facts are in Everloot's words; lore is the source's own excerpt."),
    kind: z.enum(["observed", "curated", "lore"]).describe("observed: players' uploads, public after three installs agree. curated: Everloot's own facts. lore: the 2023 Warcraft Wiki, which may differ in WoW: Forever."),
    source: z.object({ title: z.string(), url: z.string() }),
    licence: z.string(),
    asOf: z.string().nullable().describe("When the source was read, or when the observations were current."),
    support: z.number().int().optional().describe("Observed facts: how many installs reported it."),
});
/** Every tool, keyed by name, in the order the server lists them. */
export const MCP_TOOLS = {
    search_knowledge: {
        title: "Search the Everloot knowledge base",
        description: "Search WoW lore and Forever reference data. Exact-name matches rank first. Every hit carries its source and licence.",
        inputSchema: searchArgs,
        outputSchema: { hits: z.array(knowledgeHit) },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    get_entity: {
        title: "Get one knowledge record by id",
        description: "Fetch the full record behind a search hit id, for page rendering.",
        inputSchema: { id: z.number().int().describe("Record id from a search_knowledge hit.") },
        outputSchema: { hit: knowledgeHit.nullable() },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    get_by_name: {
        title: "Get records by exact name",
        description: "Exact full-name match (case-insensitive) for disambiguation. Use search_knowledge for fuzzy matches.",
        inputSchema: {
            name: z.string().max(200).describe("Full record name."),
            kind: z.enum(KNOWLEDGE_KINDS).optional().describe("Narrow to one record kind."),
        },
        outputSchema: { hits: z.array(knowledgeHit) },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    answer_sources: {
        title: "Evidence for a question, each piece with its source",
        description: "The evidence behind a question about WoW: Forever, for an answer that cites its sources: facts players observed (public after three installs agree, with the install count), curated facts, and the 2023 Warcraft Wiki (marked: may differ in Forever). Every piece carries a claim, its source URL, licence and date. Returns evidence, not prose: write the answer from it and cite the pieces. Further-reading links are search URLs on other sites; nothing is fetched from them. Reads Everloot's current authorized public corpus when connected; when it is not, the observed layer is unrecorded, not empty.",
        inputSchema: {
            question: z.string().min(1).max(500).describe("The question, with names spelled as in the game."),
            limit: z.number().int().min(1).max(25).default(8).describe("Most lore and curated pieces."),
        },
        outputSchema: {
            evidence: z.array(evidence).describe("Observed first, then curated, then lore."),
            furtherReading: z.array(z.object({ site: z.string(), url: z.string() })).describe("Search links on other sites. Nothing was fetched."),
            dataAsOf: z.string().nullable().describe("When the observed layer was current; null when it is not connected."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    profession_path: {
        title: "Profession leveling path",
        description: "Leveling path for one Forever profession from Everloot uploads. A step exists only after 3 installs agree: on a reported recipe, or on the recipe colours that make it orange (a guaranteed skill-up), starting at the trainer's required rank. Gold exists only after 3 price uploads agree. No copied guide. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
        inputSchema: {
            profession: z.string().describe("Profession name, such as Alchemy."),
            fromSkill: z.number().int().min(1).max(500).default(1).describe("Skill the character has now."),
            toSkill: z.number().int().min(1).max(500).describe("Skill to stop at. Must be above fromSkill."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    recipe_thresholds: {
        title: "Recipe skill ranges",
        description: "Where a Forever profession's recipes turn yellow, green and grey, inferred from the colours players' trade-skill windows showed. A recipe appears only after 3 installs agree, as ranges, never guessed exact numbers. Agreed reagents come with an estimated cost per craft when every reagent has an agreed price. Reads Everloot's current public corpus.",
        inputSchema: {
            profession: z.string().describe("Profession name, such as Alchemy."),
            recipe: z.string().optional().describe("Optional part of a recipe name to narrow the list."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    item_page: {
        title: "Item page for a drop",
        description: "One Forever item: agreed name, public drop rate with kill count, and an agreed map pin. A rate is public after 3 installs kill the source. A name or pin needs 3 installs agreeing. No Wowhead rows. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
        inputSchema: { itemId: z.number().int().positive().describe("Item id from a drop row.") },
        outputSchema: { ...uploadsAnswer, page: itemPage.optional() },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    npc_page: {
        title: "NPC page",
        description: "One Forever NPC: agreed name and map pins. A name or pin needs 3 installs agreeing. The pin does not require a drop. No copied spawn list. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
        inputSchema: { npcId: z.number().int().positive().describe("NPC id.") },
        outputSchema: { ...uploadsAnswer, page: npcPage.optional() },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    object_page: {
        title: "Game object page",
        description: "One game object (a chest, herb, ore vein or fishing pool) by the id in its GUID: the items players looted from it, each with observed loot windows, windows with the item and distinct install reports. A frequency is public after 3 install reports; a public object with nothing in its windows reads as a measured zero. Objects have no names yet. Reads Everloot's current authorized public corpus when connected.",
        inputSchema: { objectId: z.number().int().positive().describe("The object's entry id, as in /database/objects/1731.") },
        outputSchema: { ...uploadsAnswer, page: objectPage.optional() },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    quest_page: {
        title: "Quest page",
        description: "One Forever quest: agreed title, level, giver, turn-in, and rewards. Each fact needs 3 installs agreeing. No copied quest text. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
        inputSchema: { questId: z.number().int().positive().describe("Quest id.") },
        outputSchema: { ...uploadsAnswer, page: questPage.optional() },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    vendor_page: {
        title: "Vendor page",
        description: "Goods one Forever vendor sells. An item is listed when 3 installs agree on that item and its copper price. Two agreed prices both stay listed. No copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
        inputSchema: { vendorNpcId: z.number().int().positive().describe("Vendor NPC id.") },
        outputSchema: { ...uploadsAnswer, page: vendorPage.optional() },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    world_map_near: {
        title: "What is near a place on the map",
        description: `Entrances, NPCs and vendors near a spot, nearest first, with straight-line distances in yards. Give a zone (name or map id) with x and y from 0 to 100, or an NPC id to start from where that NPC stands. Entrances come from the game files and are unconfirmed. NPCs and vendors are player-observed and listed only where 3 installs agree on the position. Zones the files hold back as possibly unreleased are not offered. Game objects are not listed: no public record gives them a position. Reads Everloot's current authorized public corpus when connected.`,
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
        description: `Every typed relation of one entity, both directions: dropped by, sold by, reward from, located in (player-observed, listed where 3 installs agree, with the install count and last seen), and created by, reagent for, part of set, same icon (found in game files, unconfirmed, with the build they came from). Ids are the game's own. Reads Everloot's current authorized public corpus and the committed client layer.`,
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
        description: `Item categories from the game files (found in game files, unconfirmed, with the build): class and subclass with the client's English names and slugs, slot and quality. With no arguments, the whole tree with item counts. With item, that item's category path. With class (a slug such as weapon or armor), and optionally subclass, slot and quality slugs, the items in it. Ids only: item names come from player uploads (item_page).`,
        inputSchema: {
            item: z.number().int().positive().optional().describe("An item id: answers its class, subclass, slot and quality."),
            class: z.string().max(40).optional().describe("Class slug, such as weapon, armor, consumable or trade-goods."),
            subclass: z.string().max(40).optional().describe("Subclass slug or number within the class, such as one-handed-swords or cloth."),
            slot: z.string().max(40).optional().describe("Slot slug, such as head, chest, one-hand or trinket."),
            quality: z.enum(ITEM_QUALITY_SLUGS).optional().describe("poor, common, uncommon, rare, epic, legendary, artifact or heirloom."),
            limit: z.number().int().min(1).max(100).default(25).describe("Most items listed."),
        },
        outputSchema: {
            label: z.string(),
            build: z.string(),
            item: itemCategory.nullable().optional().describe("With item: its path, or null when the item is not in the build."),
            classes: z.array(z.object({
                id: z.number().int(), name: z.string(), slug: z.string(), items: z.number().int(),
                subclasses: z.array(z.object({ id: z.number().int(), name: z.string().nullable(), slug: z.string(), items: z.number().int() })),
            })).optional().describe("With no arguments: the whole tree, classes with items only."),
            items: z.array(itemCategory).optional().describe("With class: the items in the category, up to limit."),
            total: z.number().int().optional().describe("With class: how many items match, listed or not."),
            error: z.string().optional().describe("A class or subclass that is not in the build."),
            credit: z.string(),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    talent_tree: {
        title: "Talent trees for one class",
        description: "The WoW: Forever talent trees of one class from the game files (found in game files, unconfirmed, with the build): every node with its talents, ranks, grid position, prerequisites and row gate, plus the levels talent points arrive at. Node ids are the ids a share code names. Narrow to one tree by name. The calculator is at /tools/talents/<class>.",
        inputSchema: {
            class: z.enum(TALENT_CLASSES).describe("Class slug."),
            tree: z.string().max(40).optional().describe("One tree by name, such as Arcane. Without it, every tree."),
        },
        outputSchema: {
            label: z.string(),
            build: z.string().describe("The game build the trees were read from."),
            class: z.enum(TALENT_CLASSES),
            className: z.string(),
            specId: z.number().int().describe("The client's spec id, or 0 when unknown."),
            points: z.object({
                firstPointLevel: z.number().int(),
                maxLevel: z.number().int(),
                total: z.number().int().describe("Talent points at the max level."),
                pointLevels: z.array(z.number().int()).describe("The level each point arrives at."),
            }),
            trees: z.array(z.object({ id: z.number().int(), name: z.string(), nodes: z.number().int() })),
            nodes: z.array(talentNode),
            credit: z.string(),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    talent_plan: {
        title: "Read a talent share code",
        description: "Decodes an Everloot talent share code (EL1-<class>-<spec>-<build>-<payload>, or a calculator link carrying one after #plan=) against the class's trees: the talents and ranks it holds, points per tree, the lowest level that can hold it, and every problem in plain words: a code made on another build, nodes the tree does not have, ranks cut back, points the rules would not place. Nothing is dropped silently. Game-file data, found in game files, unconfirmed.",
        inputSchema: {
            code: z.string().max(2000).describe("The share code, or a link that carries one."),
        },
        outputSchema: {
            ok: z.boolean().describe("False when the code could not be read at all; message says why."),
            message: z.string().optional(),
            class: z.enum(TALENT_CLASSES).optional(),
            className: z.string().optional(),
            codeBuild: z.string().optional().describe("The game build the code was made on."),
            treeBuild: z.string().optional().describe("The build of the trees it was read against."),
            pointsSpent: z.number().int().optional(),
            minLevel: z.number().int().optional().describe("The lowest level that can hold this many points."),
            byTree: z.array(talentTreePoints).optional(),
            talents: z.array(z.object({
                id: z.number().int(), treeId: z.number().int(), name: z.string(), rank: z.number().int(), maxRanks: z.number().int(),
                choice: z.number().int().optional().describe("The chosen entry of a choice node, zero-based."),
            })).optional(),
            problems: z.array(z.string()).optional().describe("One sentence each. Empty means the code loaded exactly as made."),
            link: z.string().optional().describe("The calculator with this plan loaded."),
            label: z.string(),
            credit: z.string(),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    collection_gap: {
        title: "Owned versus missing in a collection",
        description: "Missing items in one collection for one install. A list row is public after 3 installs agree on the collection, the source, and the item. Owned is what that install uploaded. Not a Blizzard profile read and not a copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
        inputSchema: {
            collection: z.string().describe("Collection name, such as Mounts."),
            ownerInstallId: z.string().describe("Install id whose owned upload to compare."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    completion_progress: {
        title: "Achievement, reputation, title and quest progress",
        description: "What one install's characters have finished, and what is closest to done: achievements with the largest share of criteria or progress met, reputations nearest the next standing, titles known, and quests finished in a chain. A list entry is public after 3 players (installs uploading from different addresses) report it identically. Progress is shown only when that install uploaded it with the collection sharing choice and a verified grant; without it the answer says so. Not a Blizzard profile read and not a copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
        inputSchema: {
            ownerInstallId: z.string().describe("Install id whose completion upload to read."),
            characterKey: z.string().max(8).optional().describe("One character's 8-digit key from the upload, when the install has several."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guild_board: {
        title: "Officer guild board",
        description: "Roster, bosses, loot, attendance, and average item level from officer uploads. A figure is public after 2 uploads agree. The average names how many roster members were measured. There is no single score because score_v1 weights are not published. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
        inputSchema: {
            guildName: z.string().describe("Guild name."),
            realm: z.string().describe("Realm name."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    auction_history: {
        title: "Auction history for one item",
        description: "Price history from auction scans players uploaded on purpose. A day is public after 3 installs scanned that item on that realm. Copper is the median. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
        inputSchema: {
            realm: z.string().describe("Realm name."),
            itemId: z.number().int().positive().describe("Item id."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    market_value: {
        title: "Forever market value for one item",
        description: "Market value, minimum buyout, historical value and units listed for one item on one WoW: Forever realm, from full auction scans players started and uploaded. A day is public after 3 reporters (distinct upload addresses) scanned the item; values are medians, thin days and outlier days are left out of the market value. Market value weights the last 14 public days, historical is the median of 60. Missing or unavailable data is reported explicitly.",
        inputSchema: {
            realm: z.string().describe("Realm name."),
            itemId: z.number().int().positive().describe("Item id."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    gold_ledger: {
        title: "Gold ledger for one character",
        description: "Peak gold and the money events that character's own upload recorded. Loot, quests, vendors, and auction sales stay on the money line. Gameplay stays on its own line. A missing line is unrecorded. The difference is not called bought and is not a ban. Installs are not merged. No scan of a player who did not upload. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
        inputSchema: {
            character: z.string().describe("Character name."),
            realm: z.string().describe("Realm name."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    recent_changes: {
        title: "Recent official changes for WoW: Forever",
        description: "Newest first: Blizzard blue posts (title, author, time, a short excerpt and the link to the original), hotfix posts, and new game builds. Excerpts only: Blizzard's post text is Blizzard's, so open the link for the full post. A build's time is when Everloot first saw it, not Blizzard's release time.",
        inputSchema: {
            filter: z.enum(CHANGE_FILTERS).default("all").describe("posts (blue posts), hotfixes, builds, or all."),
            game: z.enum(["forever", "classic"]).optional().describe("Narrow to one game."),
            limit: z.number().int().min(1).max(25).default(10),
        },
        outputSchema: { connected: z.boolean().describe("False when the timeline is not connected: the list is then not a measured zero."), entries: z.array(changeEntry) },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ecosystem_projects: {
        title: "WoW: Forever addons and open-source projects",
        description: "Forever addons and tools from the community registry, with a board ranking: most installed, rising, most active, freshest release or best maintained. Each project shows its GitHub repository, stars, latest release, last commit, whether its .toc declares a Forever interface number, and installs from Everloot uploads (counted from 3 installs; a missing count means not counted, not zero). Projects are ranked, never people. GitHub facts carry the time they were refreshed.",
        inputSchema: {
            board: z.enum(ECOSYSTEM_BOARD_FILTERS).default("all").describe("installed, rising, active, release, maintained, or all (A to Z)."),
            forever_ready_only: z.boolean().optional().describe("Only projects whose .toc lists a Forever interface number."),
            limit: z.number().int().min(1).max(25).default(10),
        },
        outputSchema: {
            connected: z.boolean().describe("False when the tracker is not connected: the list is then not a measured zero."),
            refreshedAt: z.string().nullable().describe("When the GitHub facts were last refreshed."),
            installsAvailable: z.boolean().describe("False when install counts could not be read: a null count then means unknown."),
            forever: z.object({ interface: z.number().int(), version: z.string(), build: z.number().int() }).nullable()
                .describe("What Forever-ready compares each .toc with, derived from the build's version and not yet confirmed in the client."),
            board: z.enum(ECOSYSTEM_BOARD_FILTERS),
            projects: z.array(ecosystemProject),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    everloot_plan: {
        title: "Everloot implementation tracker",
        description: "The full Everloot build list: what is live, what is next, what is waiting on Carlos, and which reference sites are page shapes only. Read this before assuming a tool exists.",
        inputSchema: {},
        outputSchema: {
            rows: z.array(planRow).describe("Every row, in the tracker's order."),
            counts: z.object({ live: z.number().int(), next: z.number().int(), waiting: z.number().int(), shape: z.number().int() }),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
};
/** The names in the order the server lists them. */
export const MCP_TOOL_NAMES = Object.keys(MCP_TOOLS);
/** The list form, for clients that iterate. */
export const MCP_TOOL_LIST = MCP_TOOL_NAMES.map((name) => ({ name, ...MCP_TOOLS[name] }));
/**
 * What every tool returns: one text content block. Answers built on player data end with the
 * credit line, after a line stating how old the data is. Tools that read nothing from players carry
 * their sources inside the text instead. Tools with an outputSchema also return structuredContent of
 * that shape (STRUCTURED_TOOLS); the others gain it tool by tool in later minor releases.
 */
export const TOOL_OUTPUT = { type: "text", endsWith: MCP_CREDIT };
/** The tools that answer with structuredContent beside the text. */
export const STRUCTURED_TOOLS = MCP_TOOL_NAMES.filter((name) => "outputSchema" in MCP_TOOLS[name]);
/** The tools whose answers are built on player uploads and therefore end with TOOL_OUTPUT.endsWith. */
export const PLAYER_DATA_TOOLS = [
    "answer_sources", "profession_path", "recipe_thresholds", "item_page", "npc_page", "object_page", "quest_page", "vendor_page",
    "world_map_near", "entity_relations", "collection_gap", "completion_progress", "guild_board", "auction_history",
    "market_value", "gold_ledger",
];
/** One game build as the version service listed it. Everloot records identifiers only, never game files. */
export const buildEntry = z.object({
    key: z.string().describe("product:buildConfig, the build's identity."),
    product: z.string().describe("Blizzard's product id, such as wow_classic_beta."),
    buildConfig: z.string(),
    buildId: z.number().int(),
    version: z.string().describe("The version label, such as 1.60.1.70450."),
    regions: z.array(z.string()),
    firstSeen: z.string().describe("When Everloot first saw the build, not Blizzard's release time."),
    lastSeen: z.string(),
    status: z.enum(["queued", "processed"]),
});
/** What everloot://builds holds. */
export const buildsResource = z.object({
    gameFiles: z.object({
        product: z.string(), buildId: z.number().int(), version: z.string(), buildConfig: z.string(),
        definitions: z.string().nullable().describe("The WoWDBDefs commit the column names came from."),
        extractedAt: z.string(),
    }).describe("The build the game-file facts (entity_relations, item_categories) were read from."),
    registry: z.array(buildEntry).describe("Every build the version service has listed, newest first."),
    credit: z.string().describe("Game-file facts are Blizzard's, not under Everloot's licence."),
});
/** Every resource, keyed by URI, in the order the server lists them. */
export const MCP_RESOURCES = {
    "everloot://builds": {
        name: "builds",
        title: "Game builds Everloot knows",
        description: "The build the game-file facts come from, and every build Blizzard's version service has listed, with when Everloot first saw it. JSON of the shape in schema/mcp/resources.json.",
        mimeType: "application/json",
    },
    "everloot://methodology": {
        name: "methodology",
        title: "How Everloot counts",
        description: "How player uploads become facts: three installs must agree, unrecorded is never zero, game files and play are kept apart, and what is never published. Read it before stating a number as certain.",
        mimeType: "text/markdown",
    },
    "everloot://data-policy": {
        name: "data-policy",
        title: "Everloot data policy",
        description: "Where the data comes from, what is refused, the licence and credit line, and the limits on bulk copying, in short, with the link to the full policy.",
        mimeType: "text/markdown",
    },
};
/** The URIs in the order the server lists them. */
export const MCP_RESOURCE_URIS = Object.keys(MCP_RESOURCES);
/** The list form, for clients that iterate. */
export const MCP_RESOURCE_LIST = MCP_RESOURCE_URIS.map((uri) => ({ uri, ...MCP_RESOURCES[uri] }));
