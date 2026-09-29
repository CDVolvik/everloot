import { describe, expect, test } from "vitest";
import { ALL_RECORD_KINDS, validateUpload } from "./intake.js";

const base = { installId: "test-install-1234", capturedAt: "2026-09-29T12:00:00.000Z" };

describe("intake contract", () => {
  test("all ten record kinds exist", () => {
    expect(ALL_RECORD_KINDS).toHaveLength(10);
    expect(ALL_RECORD_KINDS).toContain("loot_award");
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

  test("rejects empty and oversized payloads", () => {
    expect(validateUpload({ addonVersion: "0.1.0", records: [] }).rejected[0].index).toBe(-1);
    expect(validateUpload({}).rejected).toHaveLength(1);
  });
});
