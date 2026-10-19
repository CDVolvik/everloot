import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { compareTrees, readTree, verdict, type Tree } from "../scripts/check-semver.js";

const record = (properties: Record<string, unknown>, required: string[] = ["installId"]): unknown =>
  ({ $id: "x", type: "object", properties, required });

const base: Tree = {
  "records/loot.json": record({ installId: { type: "string", minLength: 8, maxLength: 64, description: "Random install id." }, items: { type: "array", maxItems: 50 } }),
  "limits.json": { maxBodyBytes: 1000000, recordsPerBatch: 2000 },
  "index.json": { protocol: "1.0.0", kinds: ["loot", "vendor"], mcpTools: ["search_knowledge"] },
  "mcp/search_knowledge.json": { inputSchema: { properties: { limit: { type: "integer", minimum: 1, maximum: 25, default: 8 }, kind: { enum: ["item", "npc"] } } } },
};
const edit = (change: (tree: Tree) => void): Tree => { const copy = structuredClone(base); change(copy); return copy; };
// The fixtures are loose JSON by design: the check reads real files, not typed shapes.
const at = (tree: Tree, file: string) => tree[file] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("compareTrees", () => {
  test("an unchanged tree, or one where only descriptions, defaults and the protocol stamp change, has no diff", () => {
    expect(compareTrees(base, base)).toEqual({ breaking: [], additions: [] });
    const cosmetic = edit((t) => {
      at(t, "records/loot.json").properties.installId.description = "Different words.";
      at(t, "mcp/search_knowledge.json").inputSchema.properties.limit.default = 10;
      at(t, "index.json").protocol = "1.1.0";
    });
    expect(compareTrees(base, cosmetic)).toEqual({ breaking: [], additions: [] });
  });

  test("removing a kind, a property, an enum value, a tool or a route is breaking", () => {
    const gone = edit((t) => {
      delete t["records/loot.json"];
      at(t, "index.json").kinds = ["vendor"];
      at(t, "index.json").mcpTools = [];
      at(t, "mcp/search_knowledge.json").inputSchema.properties.kind.enum = ["item"];
    });
    const diff = compareTrees(base, gone);
    expect([...diff.breaking].sort()).toEqual([
      "index.json/kinds: loot was removed",
      "index.json/mcpTools: search_knowledge was removed",
      "mcp/search_knowledge.json/inputSchema/properties/kind/enum: npc was removed",
      "records/loot.json was removed",
    ]);
    expect(diff.additions).toEqual([]);
    const property = edit((t) => { delete at(t, "records/loot.json").properties.items; });
    expect(compareTrees(base, property).breaking).toEqual(["records/loot.json/properties/items was removed"]);
  });

  test("a new required field, a lower maximum, a higher minimum, a new pattern or a changed type is breaking", () => {
    const tight = edit((t) => {
      at(t, "records/loot.json").required = ["installId", "items"];
      at(t, "records/loot.json").properties.installId.maxLength = 32;
      at(t, "records/loot.json").properties.installId.minLength = 16;
      at(t, "records/loot.json").properties.installId.pattern = "^[a-z]+$";
      at(t, "records/loot.json").properties.items.type = "object";
      at(t, "limits.json").maxBodyBytes = 500000;
      at(t, "limits.json").recordsPerBatch = 1000;
    });
    expect([...compareTrees(base, tight).breaking].sort()).toEqual([
      "limits.json/maxBodyBytes: 1000000 -> 500000",
      "limits.json/recordsPerBatch: 2000 -> 1000",
      "records/loot.json/properties/installId/maxLength: 64 -> 32",
      "records/loot.json/properties/installId/minLength: 8 -> 16",
      "records/loot.json/properties/installId/pattern was added, so less is accepted",
      "records/loot.json/properties/items/type: \"array\" -> \"object\"",
      "records/loot.json/required: items became required",
    ]);
  });

  test("a field named like a keyword (title, description, default, protocol) is still a field", () => {
    const named = edit((t) => {
      Object.assign(at(t, "records/loot.json").properties, {
        title: { type: "string", description: "Quest title." },
        protocol: { type: "string" },
        definitions: { type: "object", description: "A field called definitions." },
      });
    });
    expect(compareTrees(base, named).additions.sort()).toEqual([
      "records/loot.json/properties/definitions was added",
      "records/loot.json/properties/protocol was added",
      "records/loot.json/properties/title was added",
    ]);
    const cosmetic = structuredClone(named);
    at(cosmetic, "records/loot.json").properties.title.description = "Other words.";
    at(cosmetic, "records/loot.json").properties.definitions.description = "Other words.";
    expect(compareTrees(named, cosmetic)).toEqual({ breaking: [], additions: [] });
    const broken = structuredClone(named);
    delete at(broken, "records/loot.json").properties.title;
    at(broken, "records/loot.json").properties.protocol.type = "number";
    at(broken, "records/loot.json").properties.definitions.type = "string";
    expect([...compareTrees(named, broken).breaking].sort()).toEqual([
      'records/loot.json/properties/definitions/type: "object" -> "string"',
      'records/loot.json/properties/protocol/type: "string" -> "number"',
      "records/loot.json/properties/title was removed",
    ]);
  });

  test("a new kind, property, enum value, tool, route or a looser limit is an addition", () => {
    const more = edit((t) => {
      t["records/census_self.json"] = record({ installId: { type: "string" } });
      at(t, "records/loot.json").properties.note = { type: "string" };
      at(t, "records/loot.json").properties.installId.maxLength = 128;
      at(t, "records/loot.json").required = [];
      at(t, "index.json").kinds = ["loot", "vendor", "census_self"];
      at(t, "mcp/search_knowledge.json").inputSchema.properties.kind.enum = ["item", "npc", "quest"];
      at(t, "limits.json").maxBodyBytes = 2000000;
    });
    const diff = compareTrees(base, more);
    expect(diff.breaking).toEqual([]);
    expect([...diff.additions].sort()).toEqual([
      "index.json/kinds: census_self was added",
      "limits.json/maxBodyBytes: 1000000 -> 2000000",
      "mcp/search_knowledge.json/inputSchema/properties/kind/enum: quest was added",
      "records/loot.json/properties/installId/maxLength: 64 -> 128",
      "records/loot.json/properties/note was added",
      "records/loot.json/required: installId is no longer required",
      "records/census_self.json was added",
    ].sort());
  });
});

describe("verdict", () => {
  const breaking = { breaking: ["records/loot.json was removed"], additions: [] };
  const added = { breaking: [], additions: ["records/x.json was added"] };
  const none = { breaking: [], additions: [] };

  test("breaking needs a major bump, an addition at least a minor bump, nothing needs nothing", () => {
    expect(verdict("1.0.0", "1.1.0", breaking)[0]).toContain("need a major bump (2.0.0)");
    expect(verdict("1.0.0", "2.0.0", breaking)).toEqual([]);
    expect(verdict("1.0.0", "1.0.1", added)[0]).toContain("need at least a minor bump");
    expect(verdict("1.0.0", "1.1.0", added)).toEqual([]);
    expect(verdict("1.0.0", "2.0.0", added)).toEqual([]);
    expect(verdict("1.0.0", "1.0.1", none)).toEqual([]);
  });

  test("a version below the published one, or not x.y.z, fails", () => {
    expect(verdict("1.2.0", "1.1.9", none)[0]).toContain("is below the published");
    expect(verdict("1.0.0", "next", none)[0]).toContain("must be x.y.z");
  });
});

test("readTree reads the committed schema folder with forward-slash keys", () => {
  const tree = readTree(join(import.meta.dirname, "..", "schema"));
  expect(Object.keys(tree)).toContain("records/loot.json");
  expect(Object.keys(tree)).toContain("mcp/search_knowledge.json");
  expect(compareTrees(tree, tree)).toEqual({ breaking: [], additions: [] });
});
