import { describe, expect, test } from "vitest";
import { LuaParseError, parseEverlootLua } from "./sv-parse.js";

const SV = `-- Everloot export
EverlootDB = {
  version = "0.1.0",
  installId = "abcd-1234",
  toggles = { openworld = true, guild = false },
  records = {
    npc_sighting = {
      {
        capturedAt = "2026-09-30T10:00:00.000Z",
        npcId = 1234,
        name = "Forest Spider",
        mapId = 141,
        x = 42.5,
        y = 61.0,
        level = 60,
        reaction = "hostile",
      },
      {
        capturedAt = "2026-09-30T10:05:00.000Z",
        npcId = 99,
        name = "Boar \\"Boss\\"",
        mapId = 1,
        x = 50, y = 50,
        level = 5,
        reaction = "neutral",
        note = nil,
      },
    },
    ["loot"] = {
      [1] = {
        capturedAt = "2026-09-30T10:01:00.000Z",
        sourceNpcId = 1234,
        items = { { itemId = 456, count = 2 } },
      },
    },
  },
};
`;

describe("SavedVariables parser", () => {
  test("parses a realistic Everloot.lua into intake rows", () => {
    const f = parseEverlootLua(SV);
    expect(f.version).toBe("0.1.0");
    expect(f.installId).toBe("abcd-1234");
    expect(f.records).toHaveLength(3);
    expect(f.records[0]).toMatchObject({ kind: "npc_sighting", npcId: 1234, name: "Forest Spider", installId: "abcd-1234" });
    expect(f.records[1]).toMatchObject({ name: 'Boar "Boss"' });
    expect(f.records[1]).not.toHaveProperty("note"); // nil skipped
    expect(f.records[2]).toMatchObject({ items: [{ itemId: 456, count: 2 }] });
  });

  test("rejects non-exports and malformed tables", () => {
    expect(() => parseEverlootLua("x = 1")).toThrow(LuaParseError);
    expect(() => parseEverlootLua("EverlootDB = { version = ")).toThrow(LuaParseError);
    expect(() => parseEverlootLua('EverlootDB = { version = "0.1.0" }')).toThrow(LuaParseError);
  });
});
