import { describe, expect, test } from "vitest";
import { ALL_RECORD_KINDS, parseRecords, parseUpload, validateUpload } from "./intake.js";

const base = { installId: "test-install-1234", capturedAt: "2026-09-29T12:00:00.000Z", eventId: "evt-1" };

describe("intake contract", () => {
  test("all record kinds exist", () => {
    expect(ALL_RECORD_KINDS).toHaveLength(22);
    expect(ALL_RECORD_KINDS).toContain("auction_snapshot");
    expect(ALL_RECORD_KINDS).toContain("addon_seen");
    expect(ALL_RECORD_KINDS).toContain("map_bounds");
    expect(ALL_RECORD_KINDS).toContain("recipe_observed");
    expect(ALL_RECORD_KINDS).toContain("trainer_seen");
    expect(ALL_RECORD_KINDS).toContain("gold_snapshot");
    expect(ALL_RECORD_KINDS).toContain("money_event");
    expect(ALL_RECORD_KINDS).toContain("loot_award");
    expect(ALL_RECORD_KINDS).toContain("collection_catalog");
    expect(ALL_RECORD_KINDS).toContain("recipe_seen");
    expect(ALL_RECORD_KINDS).toContain("auction_scan");
  });

  test("accepts a mixed valid upload", () => {
    const r = validateUpload({
      addonVersion: "0.1.0",
      records: [
        { ...base, kind: "npc_sighting", npcId: 1234, name: "Forest Spider", mapId: 141, x: 42.5, y: 61.0, level: 60, reaction: "hostile" },
        { ...base, kind: "loot", sourceNpcId: 1234, items: [{ itemId: 456, count: 2 }] },
        {
          ...base, kind: "guild_snapshot", guildName: "Olympus", realm: "Forever-1", faction: "horde",
          claimToken: "evt_officerclaimtoken0123456789abcdef",
          members: [{ name: "Thrallfan", rank: "Guild Master", level: 60, class: "Shaman", lastOnlineDays: 0 }],
        },
      ],
    });
    expect(r.rejected).toHaveLength(0);
    expect(r.accepted.map((a) => a.kind)).toEqual(["npc_sighting", "loot", "guild_snapshot"]);
  });

  test("rejects unknown kinds, bad fields and loot without a source", () => {
    const r = validateUpload({
      addonVersion: "0.1.0",
      records: [
        { ...base, kind: "flying_mounts" },
        { ...base, kind: "loot", items: [{ itemId: 1, count: 1 }] },
        { ...base, kind: "npc_sighting", npcId: -5, name: "X", mapId: 1, x: 1, y: 1, level: 60, reaction: "hostile" },
      ],
    });
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected.map((x) => x.reason)).toEqual([
      "unknown kind: flying_mounts",
      "loot needs a source: npc or object",
      expect.stringContaining(">0"),
    ]);
  });

  test("accepts collection, auction, and recipe records", () => {
    const r = validateUpload({
      addonVersion: "0.1.0",
      records: [
        { ...base, kind: "collection_catalog", collection: "Mounts", source: "Vendor", itemId: 1 },
        { ...base, kind: "collection_owned", collection: "Mounts", itemId: 1 },
        { ...base, kind: "auction_scan", realm: "Forever", itemId: 1, copper: 50 },
        { ...base, kind: "recipe_seen", profession: "Alchemy", recipe: "Minor Healing Potion", skillMin: 1, skillMax: 10, points: 1, reagents: [{ item: "Peacebloom", count: 1 }] },
        { ...base, kind: "price_seen", item: "Peacebloom", copper: 100 },
      ],
    });
    expect(r.rejected).toHaveLength(0);
    expect(r.accepted).toHaveLength(5);
  });

  test("auction scans keep the stack size and per-unit price basis", () => {
    const result = parseRecords([
      { ...base, kind: "auction_scan", realm: "Forever", itemId: 1, copper: 25, count: 4, priceBasis: "unit" },
      { ...base, kind: "auction_scan", realm: "Forever", itemId: 1, copper: 25, count: 0, priceBasis: "unit" },
      { ...base, kind: "auction_scan", realm: "Forever", itemId: 1, copper: 25, priceBasis: "stack" },
    ]);
    expect(result.records).toEqual([
      expect.objectContaining({ kind: "auction_scan", copper: 25, count: 4, priceBasis: "unit" }),
    ]);
    expect(result.receipt.rejected.map((r) => r.index)).toEqual([1, 2]);
  });

  test("a full-scan snapshot keeps whole-copper item summaries and rejects bad tuples", () => {
    const snap = (items: unknown, over = {}) => ({
      ...base, kind: "auction_snapshot", realm: "Forever", scanId: "scan-1", part: 1, parts: 2, items, ...over,
    });
    const result = parseRecords([
      snap([[2589, 4, 80, 95, 100], [765, 1, 3, 33, 33]]),
      snap([[2589, 4, 80, -1, 100]]),
      snap([[2589, 4, 80, 95.5, 100]]),
      snap([[0, 4, 80, 95, 100]]),
      snap([[2589, 0, 80, 95, 100]]),
      snap([[2589, 4, 80, 95]]),
      snap([]),
      snap(Array.from({ length: 1001 }, (_, i) => [i + 1, 1, 1, 1, 1])),
      snap([[2589, 4, 80, 95, 100]], { part: 3, parts: 2 }),
    ]);
    expect(result.records).toEqual([
      expect.objectContaining({ kind: "auction_snapshot", scanId: "scan-1", part: 1, parts: 2, items: [[2589, 4, 80, 95, 100], [765, 1, 3, 33, 33]] }),
    ]);
    expect(result.receipt.rejected.map((r) => r.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("one listing above 200k gold does not drop the other items of its scan part", () => {
    const result = parseRecords([{
      ...base, kind: "auction_snapshot", realm: "Forever", scanId: "scan-1", part: 1, parts: 1,
      items: [[19019, 1, 1, 99_999_999_999, 99_999_999_999], [2589, 4, 2_000_000, 95, 100]],
    }]);
    expect(result.receipt.rejected).toEqual([]);
  });

  test("a recipe observation keeps the colour the window showed at that rank", () => {
    const result = parseRecords([
      { ...base, kind: "recipe_observed", profession: "Alchemy", rank: 60, maxRank: 75, recipe: "Lesser Healing Potion",
        difficulty: "optimal", productItemId: 858, reagents: [{ item: "Briarthorn", count: 1 }] },
      { ...base, kind: "recipe_observed", profession: "Enchanting", rank: 40, recipe: "Enchant Bracer - Minor Health",
        difficulty: "medium", reagents: [] },
      { ...base, kind: "recipe_observed", profession: "Alchemy", rank: 60, recipe: "X", difficulty: "glowing", reagents: [] },
    ]);
    expect(result.records).toHaveLength(2);
    expect(result.receipt.rejected.map((r) => r.index)).toEqual([2]);
  });

  test("a trainer row keeps the recipe's required rank and optional training cost", () => {
    const result = parseRecords([
      { ...base, kind: "trainer_seen", profession: "Alchemy", recipe: "Lesser Healing Potion", requiredRank: 55, costCopper: 250 },
      { ...base, kind: "trainer_seen", profession: "Alchemy", recipe: "Elixir of Minor Agility", requiredRank: 50 },
      { ...base, kind: "trainer_seen", profession: "Alchemy", recipe: "X", requiredRank: 0 },
      { ...base, kind: "trainer_seen", profession: "Alchemy", recipe: "Y", requiredRank: 50, costCopper: -1 },
    ]);
    expect(result.records).toHaveLength(2);
    expect(result.receipt.rejected.map((r) => r.index)).toEqual([2, 3]);
  });

  test("a loot window with no items is a kill when it names a source", () => {
    const r = validateUpload({
      addonVersion: "0.1.0",
      records: [{ ...base, kind: "loot", sourceNpcId: 1234, items: [] }],
    });
    expect(r.rejected).toHaveLength(0);
    expect(r.accepted).toEqual([{ index: 0, kind: "loot" }]);
    const bare = validateUpload({
      addonVersion: "0.1.0",
      records: [{ ...base, kind: "loot", items: [] }],
    });
    expect(bare.accepted).toHaveLength(0);
    expect(bare.rejected.map((row) => row.reason)).toContain("loot needs a source: npc or object");
  });

  test("accepts a gold snapshot and a loot money event", () => {
    const r = validateUpload({
      addonVersion: "0.1.0",
      records: [
        { ...base, kind: "gold_snapshot", character: "Bigz", realm: "Forever", currentCopper: 120000, peakCopper: 5389075 },
        { ...base, kind: "money_event", character: "Bigz", realm: "Forever", category: "loot", copper: 64600 },
      ],
    });
    expect(r.rejected).toHaveLength(0);
    expect(r.accepted.map((row) => row.kind)).toEqual(["gold_snapshot", "money_event"]);
    const low = validateUpload({
      addonVersion: "0.1.0",
      records: [{ ...base, kind: "gold_snapshot", character: "Bigz", realm: "Forever", currentCopper: 10, peakCopper: 1 }],
    });
expect(low.rejected.map((row) => row.reason).join(" ")).toContain("peak gold cannot be below current gold");
  });

  test("an installed addon keeps its folder name, title, .toc version and whether it loaded", () => {
    const result = parseRecords([
      { ...base, kind: "addon_seen", name: "Questie", title: "Questie", version: "9.5.1", loaded: true },
      { ...base, kind: "addon_seen", name: "OldBags", title: "Old Bags", loaded: false },
      { ...base, kind: "addon_seen", name: "", title: "Nameless", loaded: true },
      { ...base, kind: "addon_seen", name: "Questie", title: "Questie", loaded: "yes" },
    ]);
    expect(result.records).toEqual([
      { ...base, kind: "addon_seen", name: "Questie", title: "Questie", version: "9.5.1", loaded: true },
      { ...base, kind: "addon_seen", name: "OldBags", title: "Old Bags", loaded: false },
    ]);
    expect(result.receipt.rejected.map((r) => r.index)).toEqual([2, 3]);
  });

  test("zone bounds are four world coordinates with a width and a height", () => {
    const zone = { ...base, kind: "map_bounds", mapId: 1429, continentId: 0, left: 1535.4, top: -7939.6, right: -1599.6, bottom: -10254.2 };
    const result = parseRecords([
      zone,
      { ...zone, right: zone.left },
      { ...zone, top: zone.bottom },
      { ...zone, mapId: 0 },
      { ...zone, left: Number.POSITIVE_INFINITY },
    ]);
    expect(result.records).toEqual([zone]);
    expect(result.receipt.rejected.map((r) => r.index)).toEqual([1, 2, 3, 4]);
    expect(result.receipt.rejected[0].reason).toBe("map bounds need a width and a height");
  });

  test("rejects empty and oversized payloads", () => {
    expect(validateUpload({ addonVersion: "0.1.0", records: [] }).rejected[0].index).toBe(-1);
    expect(validateUpload({}).rejected).toHaveLength(1);
  });
});

describe("canonical parsing", () => {
  const validLoot = {
    kind: "loot",
    installId: "install-1234",
    capturedAt: "2026-10-05T00:00:00.000Z",
    eventId: "evt-1",
    sourceNpcId: 123,
    items: [{ itemId: 456, count: 1, secret: "strip" }],
    extra: "strip",
  };
  const canonicalLoot = {
    kind: "loot",
    installId: "install-1234",
    capturedAt: "2026-10-05T00:00:00.000Z",
    eventId: "evt-1",
    sourceNpcId: 123,
    items: [{ itemId: 456, count: 1 }],
  };

  test("a rejected first row does not own attribution; accepted rows are stored parsed", () => {
    const result = parseUpload({
      addonVersion: "0.1.0",
      records: [{ ...validLoot, installId: "" }, validLoot],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a parsed envelope");
    expect(result.upload).toEqual({ addonVersion: "0.1.0", records: [canonicalLoot] });
    expect(result.receipt.accepted).toEqual([{ index: 1, kind: "loot" }]);
    expect(result.receipt.rejected[0].index).toBe(0);
  });

  test("schema defaults survive and unknown extra fields are stripped", () => {
    const result = parseUpload({
      addonVersion: "0.1.0",
      records: [
        {
          ...base,
          kind: "quest",
          questId: 55,
          title: "Road to Westfall",
          level: 12,
          nested: { keep: "no" },
        },
        { ...base, kind: "price_seen", item: "Peacebloom", copper: 100, note: "strip" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a parsed envelope");
    expect(result.upload.records[0]).toEqual({
      ...base,
      kind: "quest",
      questId: 55,
      title: "Road to Westfall",
      level: 12,
      rewardItemIds: [],
    });
    expect(result.upload.records[1]).toEqual({ ...base, kind: "price_seen", item: "Peacebloom", copper: 100 });
  });

  test("the client build is kept when sent and optional for 0.2.5 uploads", () => {
    const withBuild = parseUpload({ addonVersion: "0.2.6", clientBuild: "1.60.1.70450", records: [validLoot] });
    expect(withBuild.ok).toBe(true);
    if (!withBuild.ok) throw new Error("expected a parsed envelope");
    expect(withBuild.upload).toEqual({ addonVersion: "0.2.6", clientBuild: "1.60.1.70450", records: [canonicalLoot] });
    const without = parseUpload({ addonVersion: "0.2.5", records: [validLoot] });
    expect(without.ok).toBe(true);
    if (!without.ok) throw new Error("expected a parsed envelope");
    expect(without.upload).not.toHaveProperty("clientBuild");
    expect(parseUpload({ addonVersion: "0.2.6", clientBuild: "<script>", records: [validLoot] }).ok).toBe(false);
  });

  test("a valid envelope whose rows are all rejected still parses with no records", () => {
    const result = parseUpload({
      addonVersion: "0.1.0",
      records: [{ ...validLoot, installId: "" }, { ...base, kind: "flying_mounts" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a parsed envelope");
    expect(result.upload.records).toEqual([]);
    expect(result.receipt.accepted).toEqual([]);
    expect(result.receipt.rejected.map((row) => row.index)).toEqual([0, 1]);
  });

  test("an invalid envelope does not parse and keeps the receipt reason", () => {
    const result = parseUpload({});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejected envelope");
    expect(result.receipt.accepted).toEqual([]);
    expect(result.receipt.rejected).toHaveLength(1);
    expect(result.receipt.rejected[0].index).toBe(-1);
    expect(validateUpload({})).toEqual(result.receipt);
  });

  test("2000 rows parse and 2001 rows are an envelope failure", () => {
    const rows = Array.from({ length: 2000 }, () => validLoot);
    expect(parseUpload({ addonVersion: "0.1.0", records: rows }).ok).toBe(true);
    const over = parseUpload({ addonVersion: "0.1.0", records: [...rows, validLoot] });
    expect(over.ok).toBe(false);
    if (over.ok) throw new Error("expected the 2001-row envelope to be refused");
    expect(over.receipt.rejected[0].reason).toContain("2000");
  });

  test("hostile kinds and non-object rows are ordinary rejected rows", () => {
    const rows: unknown[] = [
      { ...base, kind: "constructor" },
      { ...base, kind: "toString" },
      { ...base, kind: "__proto__" },
      { ...base, kind: "hasOwnProperty" },
      42,
      "loot",
      null,
      true,
      [],
      Object.create({ kind: "loot" }),
    ];
    const result = parseRecords(rows);
    expect(result.records).toEqual([]);
    expect(result.receipt.accepted).toEqual([]);
    expect(result.receipt.rejected.map((row) => row.index)).toEqual(rows.map((_, index) => index));
    expect(result.receipt.rejected[rows.length - 1].reason).toContain("unknown kind");
  });

  test("parseRecords reports original indices without an envelope cap", () => {
    const rows: unknown[] = Array.from({ length: 2001 }, (_, index) =>
      index === 1500 ? { ...base, kind: "price_seen", item: "Peacebloom", copper: 1 } : { ...base, kind: "price_seen", copper: -1 },
    );
    const result = parseRecords(rows);
    expect(result.receipt.accepted).toEqual([{ index: 1500, kind: "price_seen" }]);
    expect(result.records).toHaveLength(1);
  });
});
