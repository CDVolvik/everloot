import { describe, expect, test } from "vitest";
import { LuaParseError, parseEverlootLua, parseEverlootTable } from "./sv-parse.js";

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

  test("an empty item list is a kill that dropped nothing, and an empty kind adds no rows", () => {
    const text = `EverlootDB = { version = "0.1.0", installId = "abcd-1234", records = { loot = { { sourceNpcId = 7, items = {} } }, quest = {} } }`;
    const f = parseEverlootLua(text);
    expect(f.records).toHaveLength(1);
    expect(f.records[0]).toMatchObject({ kind: "loot", sourceNpcId: 7, items: [] });
  });

  test("the client build comes along when the addon wrote one (0.2.6+)", () => {
    const text = `EverlootDB = { version = "0.2.6", installId = "abcd-1234", clientBuild = "1.60.1.70450", records = {} }`;
    expect(parseEverlootLua(text).clientBuild).toBe("1.60.1.70450");
    expect(parseEverlootLua(SV)).not.toHaveProperty("clientBuild");
  });

  test("rejects non-exports and malformed tables", () => {
    expect(() => parseEverlootLua("x = 1")).toThrow(LuaParseError);
    expect(() => parseEverlootLua("EverlootDB = { version = ")).toThrow(LuaParseError);
    expect(() => parseEverlootLua('EverlootDB = { version = "0.1.0" }')).toThrow(LuaParseError);
  });
});

test("the whole table is readable for fields beyond records, such as /ask questions", () => {
  const table = parseEverlootTable(`EverlootDB = {
["version"] = "0.2.3", ["installId"] = "abcd-1234", ["records"] = {},
["asks"] = { {["id"] = "ask:1", ["question"] = "Who is Thrall?", ["askedAt"] = "2026-10-09T00:00:00Z"} },
}`);
  expect(table.asks).toEqual([{ id: "ask:1", question: "Who is Thrall?", askedAt: "2026-10-09T00:00:00Z" }]);
  expect(() => parseEverlootTable("not lua")).toThrow(LuaParseError);
});
