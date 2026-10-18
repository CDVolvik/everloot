import { readFileSync } from "node:fs";
import { ALL_RECORD_KINDS, API_SCHEMAS, MCP_TOOL_NAMES } from "@everloot/protocol";
import { expect, test } from "vitest";
import { GET } from "./route";

const get = (...path: string[]) => GET(new Request(`https://everloot.app/schema/${path.join("/")}`), { params: Promise.resolve({ path }) });

test("serves the index, a record schema, an API schema and an MCP tool schema from the installed package", async () => {
  const index = await (await get("index.json")).json();
  expect(index.kinds).toEqual([...ALL_RECORD_KINDS].sort());
  expect(index.mcpTools).toEqual(MCP_TOOL_NAMES);
  expect(index.api).toEqual(Object.keys(API_SCHEMAS));
  const loot = await get("records", "loot.json");
  expect(loot.headers.get("content-type")).toContain("application/schema+json");
  expect(loot.headers.get("cache-control")).toContain("public");
  expect((await loot.json()).$id).toBe("https://everloot.app/schema/records/loot.json");
  expect((await (await get("api", "dropsResponse.json")).json()).$id).toBe("https://everloot.app/schema/api/dropsResponse.json");
  expect((await (await get("mcp", "search_knowledge.json")).json()).title).toBe("Search the Everloot knowledge base");
});

test("the files are byte for byte the package's committed schema folder", async () => {
  const committed = readFileSync(new URL("../../../../../packages/protocol/schema/upload.json", import.meta.url), "utf8");
  expect(await (await get("upload.json")).text()).toBe(committed);
});

test("anything outside the folder, or not a schema file, is a 404", async () => {
  for (const path of [["..", "package.json"], ["records", "..", "..", "package.json"], ["nope.json"], ["records", "Loot.json"], ["index.txt"], ["api", "routes.json;x"]]) {
    const response = await get(...path);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
});
