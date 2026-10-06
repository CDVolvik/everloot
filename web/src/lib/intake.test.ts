import { describe, expect, test } from "vitest";
import { ALL_RECORD_KINDS, parseRecords, parseUpload, validateUpload } from "./intake.js";

const base = { installId: "test-install-1234", capturedAt: "2026-09-29T12:00:00.000Z" };

describe("intake contract", () => {
  test("all record kinds exist", () => {
    expect(ALL_RECORD_KINDS).toHaveLength(17);
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
          claimToken: "officer-claim-token-0123456789",
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
    sourceNpcId: 123,
    items: [{ itemId: 456, count: 1, secret: "strip" }],
    extra: "strip",
  };
  const canonicalLoot = {
    kind: "loot",
    installId: "install-1234",
    capturedAt: "2026-10-05T00:00:00.000Z",
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
