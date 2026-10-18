import { API_ROUTES, MCP_TOOL_NAMES } from "@everloot/protocol";
import { expect, test } from "vitest";
import { routeDocs, toolDocs, toolParams, typeLabel } from "./protocol-docs";

test("every tool gets a parameter table in declaration order, with required flags and descriptions", () => {
  const docs = toolDocs();
  expect(docs.map((d) => d.name)).toEqual(MCP_TOOL_NAMES);
  const search = docs.find((d) => d.name === "search_knowledge")!;
  expect(search.params.map((p) => p.name)).toEqual(["query", "kind", "version", "limit"]);
  expect(search.params[0]).toMatchObject({ required: true, type: "string, up to 1000 characters" });
  expect(search.params[3]).toMatchObject({ required: false, type: "integer, 1 to 25, default 8" });
  expect(search.playerData).toBe(false);
  expect(docs.find((d) => d.name === "item_page")!.playerData).toBe(true);
  expect(search.structured).toBe(true);
  expect(docs.find((d) => d.name === "item_page")!.structured).toBe(true);
  expect(docs.every((d) => d.structured)).toBe(true);
  expect(toolParams("everloot_plan")).toEqual([]);
});

test("type labels read as plain words", () => {
  expect(typeLabel({ type: "integer", exclusiveMinimum: 0 })).toBe("integer, 1 or more");
  expect(typeLabel({ type: "number", minimum: 0, maximum: 100 })).toBe("number, 0 to 100");
  expect(typeLabel({ enum: ["a", "b"] })).toBe("one of: a, b");
  expect(typeLabel({ type: "boolean" })).toBe("boolean");
  const near = toolParams("world_map_near");
  expect(near.find((p) => p.name === "radius")!.type).toBe("number, above 0, up to 5000, default 500");
  expect(near.find((p) => p.name === "zone")!.type).toBe("string, up to 80 characters");
});

test("the route docs are the protocol's catalogue", () => {
  expect(routeDocs()).toEqual([...API_ROUTES]);
});
