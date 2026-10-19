import { z } from "zod";
/**
 * Everloot upload record contract.
 * The addon writes these records to SavedVariables; the uploaders POST them to the site, which
 * validates every record against its kind's schema. Nothing here stores or publishes anything.
 */
/**
 * The cross-field rules zod enforces that JSON Schema cannot express. Each schema below uses its
 * sentence as the refinement message, and `scripts/emit-schema.ts` writes the same sentences into
 * the generated JSON Schema's description, so a reader of the schema files knows the server checks them.
 */
export declare const RULES: {
    readonly loot: readonly ["loot needs a source: npc or object"];
    readonly achievement_catalog: readonly ["criteria cannot outnumber criteriaCount"];
    readonly achievement_owned: readonly ["quantity and required come together", "quantity cannot exceed required", "criteriaMet cannot exceed criteriaTotal", "only a completed achievement has a date", "earnedOn is a real calendar date"];
    readonly reputation_owned: readonly ["floor cannot exceed ceiling"];
    readonly auction_snapshot: readonly ["realm is a realm name: letters, digits, spaces, apostrophes and hyphens, 2 to 40 characters", "part cannot exceed parts"];
    readonly gold_snapshot: readonly ["peak gold cannot be below current gold"];
    readonly map_bounds: readonly ["map bounds need a width and a height"];
    readonly talent_snapshot: readonly ["talent points must equal the sum of node ranks", "talent node ids must be unique"];
};
export declare const INSTALL_ID: z.ZodString;
export declare const npcSighting: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"npc_sighting">;
    npcId: z.ZodNumber;
    name: z.ZodString;
    mapId: z.ZodNumber;
    x: z.ZodNumber;
    y: z.ZodNumber;
    level: z.ZodNumber;
    reaction: z.ZodEnum<{
        friendly: "friendly";
        hostile: "hostile";
        neutral: "neutral";
    }>;
    positionKind: z.ZodOptional<z.ZodEnum<{
        npc: "npc";
        player: "player";
    }>>;
}, z.core.$strip>;
export declare const lootWindow: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"loot">;
    sourceNpcId: z.ZodOptional<z.ZodNumber>;
    sourceObjectId: z.ZodOptional<z.ZodNumber>;
    sourceEvidence: z.ZodOptional<z.ZodLiteral<"loot-api">>;
    items: z.ZodArray<z.ZodObject<{
        itemId: z.ZodNumber;
        count: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const questEvent: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"quest">;
    questId: z.ZodNumber;
    title: z.ZodString;
    level: z.ZodNumber;
    giverNpcId: z.ZodOptional<z.ZodNumber>;
    turnInNpcId: z.ZodOptional<z.ZodNumber>;
    rewardItemIds: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
}, z.core.$strip>;
export declare const vendorList: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"vendor">;
    vendorNpcId: z.ZodNumber;
    items: z.ZodArray<z.ZodObject<{
        itemId: z.ZodNumber;
        priceCopper: z.ZodNumber;
        limitedStock: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const itemSeen: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"item_seen">;
    itemId: z.ZodNumber;
    name: z.ZodString;
    quality: z.ZodEnum<{
        artifact: "artifact";
        common: "common";
        epic: "epic";
        heirloom: "heirloom";
        legendary: "legendary";
        poor: "poor";
        rare: "rare";
        uncommon: "uncommon";
    }>;
    itemLevel: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const guildSnapshot: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"guild_snapshot">;
    guildName: z.ZodString;
    realm: z.ZodString;
    faction: z.ZodEnum<{
        alliance: "alliance";
        horde: "horde";
    }>;
    claimToken: z.ZodOptional<z.ZodString>;
    members: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        rank: z.ZodString;
        level: z.ZodNumber;
        class: z.ZodString;
        lastOnlineDays: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const raidLockout: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"raid_lockout">;
    guildName: z.ZodString;
    realm: z.ZodString;
    instance: z.ZodString;
    difficulty: z.ZodString;
    bossesKilled: z.ZodArray<z.ZodString>;
    resetAt: z.ZodString;
}, z.core.$strip>;
export declare const attendance: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"attendance">;
    guildName: z.ZodString;
    realm: z.ZodString;
    instance: z.ZodString;
    present: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const lootAward: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"loot_award">;
    guildName: z.ZodString;
    realm: z.ZodString;
    itemId: z.ZodNumber;
    itemName: z.ZodString;
    recipient: z.ZodString;
    sourceBoss: z.ZodString;
}, z.core.$strip>;
export declare const gearSnapshot: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"gear_snapshot">;
    character: z.ZodString;
    realm: z.ZodString;
    equipped: z.ZodArray<z.ZodObject<{
        slot: z.ZodString;
        itemId: z.ZodNumber;
        itemLevel: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const collectionCatalog: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"collection_catalog">;
    collection: z.ZodString;
    source: z.ZodString;
    itemId: z.ZodNumber;
}, z.core.$strip>;
export declare const collectionOwned: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"collection_owned">;
    collection: z.ZodString;
    itemId: z.ZodNumber;
}, z.core.$strip>;
/**
 * Opaque per-install label for one character: 8 hex digits the addon derives from the install id and the
 * character's GUID. It is not a name and is not meant to be turned back into one.
 */
export declare const CHARACTER_KEY: z.ZodString;
export declare const achievementCatalog: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"achievement_catalog">;
    achievementId: z.ZodNumber;
    name: z.ZodString;
    categoryId: z.ZodNumber;
    category: z.ZodString;
    parentCategory: z.ZodOptional<z.ZodString>;
    points: z.ZodNumber;
    criteriaCount: z.ZodNumber;
    criteria: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        required: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const reputationCatalog: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"reputation_catalog">;
    factionId: z.ZodNumber;
    name: z.ZodString;
    header: z.ZodOptional<z.ZodString>;
    major: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const titleCatalog: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"title_catalog">;
    titleId: z.ZodNumber;
    name: z.ZodString;
}, z.core.$strip>;
export declare const questChainCatalog: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"quest_chain_catalog">;
    questLineId: z.ZodNumber;
    name: z.ZodString;
    questIds: z.ZodArray<z.ZodNumber>;
    truncated: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const achievementOwned: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    characterKey: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    kind: z.ZodLiteral<"achievement_owned">;
    achievementId: z.ZodNumber;
    completed: z.ZodBoolean;
    earnedByMe: z.ZodOptional<z.ZodBoolean>;
    earnedOn: z.ZodOptional<z.ZodString>;
    criteriaMet: z.ZodNumber;
    criteriaTotal: z.ZodNumber;
    quantity: z.ZodOptional<z.ZodNumber>;
    required: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const reputationOwned: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    characterKey: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    kind: z.ZodLiteral<"reputation_owned">;
    factionId: z.ZodNumber;
    reaction: z.ZodNumber;
    standing: z.ZodNumber;
    floor: z.ZodNumber;
    ceiling: z.ZodNumber;
}, z.core.$strip>;
/** Titles and completed quests are sent as additions: the union of a character's rows is what it has. */
export declare const titleOwned: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    characterKey: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    kind: z.ZodLiteral<"title_owned">;
    titleIds: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
export declare const questOwned: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    characterKey: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    kind: z.ZodLiteral<"quest_owned">;
    questIds: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
/** The kinds that hold one character's own progress. Named data, like collection_owned. */
export declare const COMPLETION_OWNED_KINDS: readonly string[];
/** Catalog rows reflect one character's visible factions and quest lines and carry a per-install event id. */
export declare const COMPLETION_CATALOG_KINDS: readonly string[];
/** None of these is a public record or part of the corpus: the completion rollup folds them. */
export declare const COMPLETION_KINDS: readonly string[];
export declare const auctionScan: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"auction_scan">;
    realm: z.ZodString;
    itemId: z.ZodNumber;
    copper: z.ZodNumber;
    count: z.ZodOptional<z.ZodNumber>;
    priceBasis: z.ZodOptional<z.ZodLiteral<"unit">>;
}, z.core.$strip>;
/**
 * One part of a full auction-house scan the player started (addon 0.3.0+). Each item is
 * [itemId, auctions, quantity, minUnit, marketUnit], copper per unit. A scan is split into parts of
 * at most 1,000 items. These rows feed the market rollup, not the general corpus.
 */
export declare const auctionSnapshot: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"auction_snapshot">;
    realm: z.ZodString & z.ZodType<string, string, z.core.$ZodTypeInternals<string, string>>;
    scanId: z.ZodString;
    part: z.ZodNumber;
    parts: z.ZodNumber;
    items: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
}, z.core.$strip>;
export declare const recipeSeen: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"recipe_seen">;
    profession: z.ZodString;
    recipe: z.ZodString;
    skillMin: z.ZodNumber;
    skillMax: z.ZodNumber;
    points: z.ZodNumber;
    reagents: z.ZodArray<z.ZodObject<{
        item: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** What a trade-skill or craft window showed: a recipe's colour at the player's rank. Thresholds are inferred server-side. */
export declare const recipeObserved: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"recipe_observed">;
    profession: z.ZodString;
    rank: z.ZodNumber;
    maxRank: z.ZodOptional<z.ZodNumber>;
    recipe: z.ZodString;
    difficulty: z.ZodEnum<{
        easy: "easy";
        medium: "medium";
        optimal: "optimal";
        trivial: "trivial";
    }>;
    productItemId: z.ZodOptional<z.ZodNumber>;
    reagents: z.ZodArray<z.ZodObject<{
        item: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** What a trainer window listed: a profession recipe's required rank and training cost. */
export declare const trainerSeen: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"trainer_seen">;
    profession: z.ZodString;
    recipe: z.ZodString;
    requiredRank: z.ZodNumber;
    costCopper: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const priceSeen: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"price_seen">;
    item: z.ZodString;
    copper: z.ZodNumber;
}, z.core.$strip>;
export declare const goldSnapshot: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"gold_snapshot">;
    character: z.ZodString;
    realm: z.ZodString;
    currentCopper: z.ZodNumber;
    peakCopper: z.ZodNumber;
}, z.core.$strip>;
export declare const moneyEvent: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"money_event">;
    character: z.ZodString;
    realm: z.ZodString;
    category: z.ZodEnum<{
        auction: "auction";
        auction_spend: "auction_spend";
        barber: "barber";
        flight: "flight";
        loot: "loot";
        postage: "postage";
        quest: "quest";
        respec: "respec";
        vendor: "vendor";
    }>;
    copper: z.ZodNumber;
}, z.core.$strip>;
/** One installed addon as the AddOns list shows it. No settings, no other addon's SavedVariables. */
export declare const addonSeen: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"addon_seen">;
    name: z.ZodString;
    title: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
    loaded: z.ZodBoolean;
}, z.core.$strip>;
/** A zone's corners in world coordinates, from C_Map.GetWorldPosFromMapPos at (0,0) and (1,1). */
export declare const mapBounds: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"map_bounds">;
    mapId: z.ZodNumber;
    continentId: z.ZodNumber;
    left: z.ZodNumber;
    top: z.ZodNumber;
    right: z.ZodNumber;
    bottom: z.ZodNumber;
}, z.core.$strip>;
/** The game client's version and build from GetBuildInfo(), e.g. 1.60.1.70450. Addon 0.2.6+. */
export declare const CLIENT_BUILD: z.ZodString;
/**
 * One talent build: one spec group of one character, no name. `loadoutString` is Blizzard's own export from
 * C_Traits.GenerateImportString when the client allowed it; `exportStatus` says how that went.
 */
export declare const talentSnapshot: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"talent_snapshot">;
    class: z.ZodString;
    level: z.ZodNumber;
    group: z.ZodNumber;
    active: z.ZodBoolean;
    configId: z.ZodNumber;
    treeId: z.ZodNumber;
    specId: z.ZodOptional<z.ZodNumber>;
    clientBuild: z.ZodOptional<z.ZodString>;
    serializationVersion: z.ZodOptional<z.ZodNumber>;
    loadoutString: z.ZodOptional<z.ZodString>;
    exportStatus: z.ZodEnum<{
        empty: "empty";
        failed: "failed";
        ok: "ok";
        unavailable: "unavailable";
        unexpected: "unexpected";
    }>;
    points: z.ZodNumber;
    nodes: z.ZodArray<z.ZodObject<{
        nodeId: z.ZodNumber;
        ranks: z.ZodNumber;
        choice: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** A player GUID as UnitGUID returns it: Player-<server id>-<player id>. */
export declare const PLAYER_GUID: z.ZodString;
/** One of your own characters, as you log in. */
export declare const censusSelf: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    guid: z.ZodString;
    race: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    faction: z.ZodEnum<{
        Alliance: "Alliance";
        Horde: "Horde";
    }>;
    kind: z.ZodLiteral<"census_self">;
    realm: z.ZodString & z.ZodType<string, string, z.core.$ZodTypeInternals<string, string>>;
    via: z.ZodOptional<z.ZodNever>;
}, z.core.$strip>;
/** A player you targeted, moused over or grouped with. */
export declare const censusSeen: z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    guid: z.ZodString;
    race: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    faction: z.ZodEnum<{
        Alliance: "Alliance";
        Horde: "Horde";
    }>;
    kind: z.ZodLiteral<"census_seen">;
    via: z.ZodEnum<{
        group: "group";
        mouseover: "mouseover";
        target: "target";
    }>;
    realm: z.ZodOptional<z.ZodNever>;
}, z.core.$strip>;
/** The census kinds. Never public row by row: a private rollup publishes counts only. */
export declare const CENSUS_KINDS: readonly string[];
/** HMAC-SHA256 of the GUID under the server's character key, in hex. */
export declare const CENSUS_CHARACTER_KEY: z.ZodString;
export declare const censusSelfStored: z.ZodObject<{
    installId: z.ZodString;
    capturedAt: z.ZodString;
    race: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    faction: z.ZodEnum<{
        Alliance: "Alliance";
        Horde: "Horde";
    }>;
    characterKey: z.ZodString;
    serverId: z.ZodNumber;
    reporter: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"census_self">;
    eventId: z.ZodString;
    realm: z.ZodString & z.ZodType<string, string, z.core.$ZodTypeInternals<string, string>>;
}, z.core.$strip>;
export declare const censusSeenStored: z.ZodObject<{
    installId: z.ZodString;
    capturedAt: z.ZodString;
    race: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    faction: z.ZodEnum<{
        Alliance: "Alliance";
        Horde: "Horde";
    }>;
    characterKey: z.ZodString;
    serverId: z.ZodNumber;
    reporter: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"census_seen">;
    eventId: z.ZodString;
    via: z.ZodEnum<{
        group: "group";
        mouseover: "mouseover";
        target: "target";
    }>;
}, z.core.$strip>;
export declare const storedCensusSchemas: {
    readonly census_self: z.ZodObject<{
        installId: z.ZodString;
        capturedAt: z.ZodString;
        race: z.ZodString;
        class: z.ZodString;
        level: z.ZodNumber;
        faction: z.ZodEnum<{
            Alliance: "Alliance";
            Horde: "Horde";
        }>;
        characterKey: z.ZodString;
        serverId: z.ZodNumber;
        reporter: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"census_self">;
        eventId: z.ZodString;
        realm: z.ZodString & z.ZodType<string, string, z.core.$ZodTypeInternals<string, string>>;
    }, z.core.$strip>;
    readonly census_seen: z.ZodObject<{
        installId: z.ZodString;
        capturedAt: z.ZodString;
        race: z.ZodString;
        class: z.ZodString;
        level: z.ZodNumber;
        faction: z.ZodEnum<{
            Alliance: "Alliance";
            Horde: "Horde";
        }>;
        characterKey: z.ZodString;
        serverId: z.ZodNumber;
        reporter: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"census_seen">;
        eventId: z.ZodString;
        via: z.ZodEnum<{
            group: "group";
            mouseover: "mouseover";
            target: "target";
        }>;
    }, z.core.$strip>;
};
export type StoredCensusRecord = z.infer<typeof censusSelfStored> | z.infer<typeof censusSeenStored>;
/** Every record kind and its schema, in the order the contract lists them. */
export declare const recordSchemas: {
    readonly npc_sighting: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"npc_sighting">;
        npcId: z.ZodNumber;
        name: z.ZodString;
        mapId: z.ZodNumber;
        x: z.ZodNumber;
        y: z.ZodNumber;
        level: z.ZodNumber;
        reaction: z.ZodEnum<{
            friendly: "friendly";
            hostile: "hostile";
            neutral: "neutral";
        }>;
        positionKind: z.ZodOptional<z.ZodEnum<{
            npc: "npc";
            player: "player";
        }>>;
    }, z.core.$strip>;
    readonly loot: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"loot">;
        sourceNpcId: z.ZodOptional<z.ZodNumber>;
        sourceObjectId: z.ZodOptional<z.ZodNumber>;
        sourceEvidence: z.ZodOptional<z.ZodLiteral<"loot-api">>;
        items: z.ZodArray<z.ZodObject<{
            itemId: z.ZodNumber;
            count: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    readonly quest: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"quest">;
        questId: z.ZodNumber;
        title: z.ZodString;
        level: z.ZodNumber;
        giverNpcId: z.ZodOptional<z.ZodNumber>;
        turnInNpcId: z.ZodOptional<z.ZodNumber>;
        rewardItemIds: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
    }, z.core.$strip>;
    readonly vendor: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"vendor">;
        vendorNpcId: z.ZodNumber;
        items: z.ZodArray<z.ZodObject<{
            itemId: z.ZodNumber;
            priceCopper: z.ZodNumber;
            limitedStock: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    readonly item_seen: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"item_seen">;
        itemId: z.ZodNumber;
        name: z.ZodString;
        quality: z.ZodEnum<{
            artifact: "artifact";
            common: "common";
            epic: "epic";
            heirloom: "heirloom";
            legendary: "legendary";
            poor: "poor";
            rare: "rare";
            uncommon: "uncommon";
        }>;
        itemLevel: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    readonly guild_snapshot: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"guild_snapshot">;
        guildName: z.ZodString;
        realm: z.ZodString;
        faction: z.ZodEnum<{
            alliance: "alliance";
            horde: "horde";
        }>;
        claimToken: z.ZodOptional<z.ZodString>;
        members: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            rank: z.ZodString;
            level: z.ZodNumber;
            class: z.ZodString;
            lastOnlineDays: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    readonly raid_lockout: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"raid_lockout">;
        guildName: z.ZodString;
        realm: z.ZodString;
        instance: z.ZodString;
        difficulty: z.ZodString;
        bossesKilled: z.ZodArray<z.ZodString>;
        resetAt: z.ZodString;
    }, z.core.$strip>;
    readonly attendance: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"attendance">;
        guildName: z.ZodString;
        realm: z.ZodString;
        instance: z.ZodString;
        present: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    readonly loot_award: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"loot_award">;
        guildName: z.ZodString;
        realm: z.ZodString;
        itemId: z.ZodNumber;
        itemName: z.ZodString;
        recipient: z.ZodString;
        sourceBoss: z.ZodString;
    }, z.core.$strip>;
    readonly gear_snapshot: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"gear_snapshot">;
        character: z.ZodString;
        realm: z.ZodString;
        equipped: z.ZodArray<z.ZodObject<{
            slot: z.ZodString;
            itemId: z.ZodNumber;
            itemLevel: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    readonly collection_catalog: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"collection_catalog">;
        collection: z.ZodString;
        source: z.ZodString;
        itemId: z.ZodNumber;
    }, z.core.$strip>;
    readonly collection_owned: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"collection_owned">;
        collection: z.ZodString;
        itemId: z.ZodNumber;
    }, z.core.$strip>;
    readonly achievement_catalog: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"achievement_catalog">;
        achievementId: z.ZodNumber;
        name: z.ZodString;
        categoryId: z.ZodNumber;
        category: z.ZodString;
        parentCategory: z.ZodOptional<z.ZodString>;
        points: z.ZodNumber;
        criteriaCount: z.ZodNumber;
        criteria: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            required: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    readonly reputation_catalog: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"reputation_catalog">;
        factionId: z.ZodNumber;
        name: z.ZodString;
        header: z.ZodOptional<z.ZodString>;
        major: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    readonly title_catalog: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"title_catalog">;
        titleId: z.ZodNumber;
        name: z.ZodString;
    }, z.core.$strip>;
    readonly quest_chain_catalog: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"quest_chain_catalog">;
        questLineId: z.ZodNumber;
        name: z.ZodString;
        questIds: z.ZodArray<z.ZodNumber>;
        truncated: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    readonly achievement_owned: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        characterKey: z.ZodString;
        class: z.ZodString;
        level: z.ZodNumber;
        kind: z.ZodLiteral<"achievement_owned">;
        achievementId: z.ZodNumber;
        completed: z.ZodBoolean;
        earnedByMe: z.ZodOptional<z.ZodBoolean>;
        earnedOn: z.ZodOptional<z.ZodString>;
        criteriaMet: z.ZodNumber;
        criteriaTotal: z.ZodNumber;
        quantity: z.ZodOptional<z.ZodNumber>;
        required: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    readonly reputation_owned: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        characterKey: z.ZodString;
        class: z.ZodString;
        level: z.ZodNumber;
        kind: z.ZodLiteral<"reputation_owned">;
        factionId: z.ZodNumber;
        reaction: z.ZodNumber;
        standing: z.ZodNumber;
        floor: z.ZodNumber;
        ceiling: z.ZodNumber;
    }, z.core.$strip>;
    readonly title_owned: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        characterKey: z.ZodString;
        class: z.ZodString;
        level: z.ZodNumber;
        kind: z.ZodLiteral<"title_owned">;
        titleIds: z.ZodArray<z.ZodNumber>;
    }, z.core.$strip>;
    readonly quest_owned: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        characterKey: z.ZodString;
        class: z.ZodString;
        level: z.ZodNumber;
        kind: z.ZodLiteral<"quest_owned">;
        questIds: z.ZodArray<z.ZodNumber>;
    }, z.core.$strip>;
    readonly auction_scan: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"auction_scan">;
        realm: z.ZodString;
        itemId: z.ZodNumber;
        copper: z.ZodNumber;
        count: z.ZodOptional<z.ZodNumber>;
        priceBasis: z.ZodOptional<z.ZodLiteral<"unit">>;
    }, z.core.$strip>;
    readonly auction_snapshot: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"auction_snapshot">;
        realm: z.ZodString & z.ZodType<string, string, z.core.$ZodTypeInternals<string, string>>;
        scanId: z.ZodString;
        part: z.ZodNumber;
        parts: z.ZodNumber;
        items: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
    }, z.core.$strip>;
    readonly recipe_seen: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"recipe_seen">;
        profession: z.ZodString;
        recipe: z.ZodString;
        skillMin: z.ZodNumber;
        skillMax: z.ZodNumber;
        points: z.ZodNumber;
        reagents: z.ZodArray<z.ZodObject<{
            item: z.ZodString;
            count: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    readonly price_seen: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"price_seen">;
        item: z.ZodString;
        copper: z.ZodNumber;
    }, z.core.$strip>;
    readonly recipe_observed: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"recipe_observed">;
        profession: z.ZodString;
        rank: z.ZodNumber;
        maxRank: z.ZodOptional<z.ZodNumber>;
        recipe: z.ZodString;
        difficulty: z.ZodEnum<{
            easy: "easy";
            medium: "medium";
            optimal: "optimal";
            trivial: "trivial";
        }>;
        productItemId: z.ZodOptional<z.ZodNumber>;
        reagents: z.ZodArray<z.ZodObject<{
            item: z.ZodString;
            count: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    readonly trainer_seen: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"trainer_seen">;
        profession: z.ZodString;
        recipe: z.ZodString;
        requiredRank: z.ZodNumber;
        costCopper: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    readonly gold_snapshot: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"gold_snapshot">;
        character: z.ZodString;
        realm: z.ZodString;
        currentCopper: z.ZodNumber;
        peakCopper: z.ZodNumber;
    }, z.core.$strip>;
    readonly money_event: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"money_event">;
        character: z.ZodString;
        realm: z.ZodString;
        category: z.ZodEnum<{
            auction: "auction";
            auction_spend: "auction_spend";
            barber: "barber";
            flight: "flight";
            loot: "loot";
            postage: "postage";
            quest: "quest";
            respec: "respec";
            vendor: "vendor";
        }>;
        copper: z.ZodNumber;
    }, z.core.$strip>;
    readonly addon_seen: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"addon_seen">;
        name: z.ZodString;
        title: z.ZodString;
        version: z.ZodOptional<z.ZodString>;
        loaded: z.ZodBoolean;
    }, z.core.$strip>;
    readonly map_bounds: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"map_bounds">;
        mapId: z.ZodNumber;
        continentId: z.ZodNumber;
        left: z.ZodNumber;
        top: z.ZodNumber;
        right: z.ZodNumber;
        bottom: z.ZodNumber;
    }, z.core.$strip>;
    readonly talent_snapshot: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        kind: z.ZodLiteral<"talent_snapshot">;
        class: z.ZodString;
        level: z.ZodNumber;
        group: z.ZodNumber;
        active: z.ZodBoolean;
        configId: z.ZodNumber;
        treeId: z.ZodNumber;
        specId: z.ZodOptional<z.ZodNumber>;
        clientBuild: z.ZodOptional<z.ZodString>;
        serializationVersion: z.ZodOptional<z.ZodNumber>;
        loadoutString: z.ZodOptional<z.ZodString>;
        exportStatus: z.ZodEnum<{
            empty: "empty";
            failed: "failed";
            ok: "ok";
            unavailable: "unavailable";
            unexpected: "unexpected";
        }>;
        points: z.ZodNumber;
        nodes: z.ZodArray<z.ZodObject<{
            nodeId: z.ZodNumber;
            ranks: z.ZodNumber;
            choice: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    readonly census_self: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        guid: z.ZodString;
        race: z.ZodString;
        class: z.ZodString;
        level: z.ZodNumber;
        faction: z.ZodEnum<{
            Alliance: "Alliance";
            Horde: "Horde";
        }>;
        kind: z.ZodLiteral<"census_self">;
        realm: z.ZodString & z.ZodType<string, string, z.core.$ZodTypeInternals<string, string>>;
        via: z.ZodOptional<z.ZodNever>;
    }, z.core.$strip>;
    readonly census_seen: z.ZodObject<{
        installId: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        capturedAt: z.ZodString;
        guid: z.ZodString;
        race: z.ZodString;
        class: z.ZodString;
        level: z.ZodNumber;
        faction: z.ZodEnum<{
            Alliance: "Alliance";
            Horde: "Horde";
        }>;
        kind: z.ZodLiteral<"census_seen">;
        via: z.ZodEnum<{
            group: "group";
            mouseover: "mouseover";
            target: "target";
        }>;
        realm: z.ZodOptional<z.ZodNever>;
    }, z.core.$strip>;
};
export type RecordKind = keyof typeof recordSchemas;
export declare const ALL_RECORD_KINDS: RecordKind[];
export declare const PUBLIC_RECORD_KINDS: readonly string[];
export declare const anyRecord: z.ZodDiscriminatedUnion<[z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"npc_sighting">;
    npcId: z.ZodNumber;
    name: z.ZodString;
    mapId: z.ZodNumber;
    x: z.ZodNumber;
    y: z.ZodNumber;
    level: z.ZodNumber;
    reaction: z.ZodEnum<{
        friendly: "friendly";
        hostile: "hostile";
        neutral: "neutral";
    }>;
    positionKind: z.ZodOptional<z.ZodEnum<{
        npc: "npc";
        player: "player";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"loot">;
    sourceNpcId: z.ZodOptional<z.ZodNumber>;
    sourceObjectId: z.ZodOptional<z.ZodNumber>;
    sourceEvidence: z.ZodOptional<z.ZodLiteral<"loot-api">>;
    items: z.ZodArray<z.ZodObject<{
        itemId: z.ZodNumber;
        count: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"quest">;
    questId: z.ZodNumber;
    title: z.ZodString;
    level: z.ZodNumber;
    giverNpcId: z.ZodOptional<z.ZodNumber>;
    turnInNpcId: z.ZodOptional<z.ZodNumber>;
    rewardItemIds: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"vendor">;
    vendorNpcId: z.ZodNumber;
    items: z.ZodArray<z.ZodObject<{
        itemId: z.ZodNumber;
        priceCopper: z.ZodNumber;
        limitedStock: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"item_seen">;
    itemId: z.ZodNumber;
    name: z.ZodString;
    quality: z.ZodEnum<{
        artifact: "artifact";
        common: "common";
        epic: "epic";
        heirloom: "heirloom";
        legendary: "legendary";
        poor: "poor";
        rare: "rare";
        uncommon: "uncommon";
    }>;
    itemLevel: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"guild_snapshot">;
    guildName: z.ZodString;
    realm: z.ZodString;
    faction: z.ZodEnum<{
        alliance: "alliance";
        horde: "horde";
    }>;
    claimToken: z.ZodOptional<z.ZodString>;
    members: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        rank: z.ZodString;
        level: z.ZodNumber;
        class: z.ZodString;
        lastOnlineDays: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"raid_lockout">;
    guildName: z.ZodString;
    realm: z.ZodString;
    instance: z.ZodString;
    difficulty: z.ZodString;
    bossesKilled: z.ZodArray<z.ZodString>;
    resetAt: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"attendance">;
    guildName: z.ZodString;
    realm: z.ZodString;
    instance: z.ZodString;
    present: z.ZodArray<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"loot_award">;
    guildName: z.ZodString;
    realm: z.ZodString;
    itemId: z.ZodNumber;
    itemName: z.ZodString;
    recipient: z.ZodString;
    sourceBoss: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"gear_snapshot">;
    character: z.ZodString;
    realm: z.ZodString;
    equipped: z.ZodArray<z.ZodObject<{
        slot: z.ZodString;
        itemId: z.ZodNumber;
        itemLevel: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"collection_catalog">;
    collection: z.ZodString;
    source: z.ZodString;
    itemId: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"collection_owned">;
    collection: z.ZodString;
    itemId: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"achievement_catalog">;
    achievementId: z.ZodNumber;
    name: z.ZodString;
    categoryId: z.ZodNumber;
    category: z.ZodString;
    parentCategory: z.ZodOptional<z.ZodString>;
    points: z.ZodNumber;
    criteriaCount: z.ZodNumber;
    criteria: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        required: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"reputation_catalog">;
    factionId: z.ZodNumber;
    name: z.ZodString;
    header: z.ZodOptional<z.ZodString>;
    major: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"title_catalog">;
    titleId: z.ZodNumber;
    name: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"quest_chain_catalog">;
    questLineId: z.ZodNumber;
    name: z.ZodString;
    questIds: z.ZodArray<z.ZodNumber>;
    truncated: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    characterKey: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    kind: z.ZodLiteral<"achievement_owned">;
    achievementId: z.ZodNumber;
    completed: z.ZodBoolean;
    earnedByMe: z.ZodOptional<z.ZodBoolean>;
    earnedOn: z.ZodOptional<z.ZodString>;
    criteriaMet: z.ZodNumber;
    criteriaTotal: z.ZodNumber;
    quantity: z.ZodOptional<z.ZodNumber>;
    required: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    characterKey: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    kind: z.ZodLiteral<"reputation_owned">;
    factionId: z.ZodNumber;
    reaction: z.ZodNumber;
    standing: z.ZodNumber;
    floor: z.ZodNumber;
    ceiling: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    characterKey: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    kind: z.ZodLiteral<"title_owned">;
    titleIds: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    characterKey: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    kind: z.ZodLiteral<"quest_owned">;
    questIds: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"auction_scan">;
    realm: z.ZodString;
    itemId: z.ZodNumber;
    copper: z.ZodNumber;
    count: z.ZodOptional<z.ZodNumber>;
    priceBasis: z.ZodOptional<z.ZodLiteral<"unit">>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"auction_snapshot">;
    realm: z.ZodString & z.ZodType<string, string, z.core.$ZodTypeInternals<string, string>>;
    scanId: z.ZodString;
    part: z.ZodNumber;
    parts: z.ZodNumber;
    items: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"recipe_seen">;
    profession: z.ZodString;
    recipe: z.ZodString;
    skillMin: z.ZodNumber;
    skillMax: z.ZodNumber;
    points: z.ZodNumber;
    reagents: z.ZodArray<z.ZodObject<{
        item: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"price_seen">;
    item: z.ZodString;
    copper: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"recipe_observed">;
    profession: z.ZodString;
    rank: z.ZodNumber;
    maxRank: z.ZodOptional<z.ZodNumber>;
    recipe: z.ZodString;
    difficulty: z.ZodEnum<{
        easy: "easy";
        medium: "medium";
        optimal: "optimal";
        trivial: "trivial";
    }>;
    productItemId: z.ZodOptional<z.ZodNumber>;
    reagents: z.ZodArray<z.ZodObject<{
        item: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"trainer_seen">;
    profession: z.ZodString;
    recipe: z.ZodString;
    requiredRank: z.ZodNumber;
    costCopper: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"gold_snapshot">;
    character: z.ZodString;
    realm: z.ZodString;
    currentCopper: z.ZodNumber;
    peakCopper: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"money_event">;
    character: z.ZodString;
    realm: z.ZodString;
    category: z.ZodEnum<{
        auction: "auction";
        auction_spend: "auction_spend";
        barber: "barber";
        flight: "flight";
        loot: "loot";
        postage: "postage";
        quest: "quest";
        respec: "respec";
        vendor: "vendor";
    }>;
    copper: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"addon_seen">;
    name: z.ZodString;
    title: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
    loaded: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"map_bounds">;
    mapId: z.ZodNumber;
    continentId: z.ZodNumber;
    left: z.ZodNumber;
    top: z.ZodNumber;
    right: z.ZodNumber;
    bottom: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    kind: z.ZodLiteral<"talent_snapshot">;
    class: z.ZodString;
    level: z.ZodNumber;
    group: z.ZodNumber;
    active: z.ZodBoolean;
    configId: z.ZodNumber;
    treeId: z.ZodNumber;
    specId: z.ZodOptional<z.ZodNumber>;
    clientBuild: z.ZodOptional<z.ZodString>;
    serializationVersion: z.ZodOptional<z.ZodNumber>;
    loadoutString: z.ZodOptional<z.ZodString>;
    exportStatus: z.ZodEnum<{
        empty: "empty";
        failed: "failed";
        ok: "ok";
        unavailable: "unavailable";
        unexpected: "unexpected";
    }>;
    points: z.ZodNumber;
    nodes: z.ZodArray<z.ZodObject<{
        nodeId: z.ZodNumber;
        ranks: z.ZodNumber;
        choice: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    guid: z.ZodString;
    race: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    faction: z.ZodEnum<{
        Alliance: "Alliance";
        Horde: "Horde";
    }>;
    kind: z.ZodLiteral<"census_self">;
    realm: z.ZodString & z.ZodType<string, string, z.core.$ZodTypeInternals<string, string>>;
    via: z.ZodOptional<z.ZodNever>;
}, z.core.$strip>, z.ZodObject<{
    installId: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodString;
    guid: z.ZodString;
    race: z.ZodString;
    class: z.ZodString;
    level: z.ZodNumber;
    faction: z.ZodEnum<{
        Alliance: "Alliance";
        Horde: "Horde";
    }>;
    kind: z.ZodLiteral<"census_seen">;
    via: z.ZodEnum<{
        group: "group";
        mouseover: "mouseover";
        target: "target";
    }>;
    realm: z.ZodOptional<z.ZodNever>;
}, z.core.$strip>], "kind">;
export type IntakeRecord = z.infer<typeof anyRecord>;
/** A record as intake stores it: census rows have their GUID swapped for a key, every other kind is as parsed. */
export type StoredRecord = Exclude<IntakeRecord, {
    kind: "census_self" | "census_seen";
}> | StoredCensusRecord;
/** The request envelope. `protocol` is the uploader's protocol version; a missing one means major 1. */
export declare const uploadPayload: z.ZodObject<{
    addonVersion: z.ZodString;
    clientBuild: z.ZodOptional<z.ZodString>;
    protocol: z.ZodOptional<z.ZodString>;
    records: z.ZodArray<z.ZodUnknown>;
}, z.core.$strip>;
