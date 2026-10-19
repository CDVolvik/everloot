import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MCP_PROMPTS, MCP_RESOURCE_TEMPLATES, MCP_RESOURCE_URIS, TALENT_CLASSES } from "@everloot/protocol";
import { afterEach, expect, test } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { createKnowledgeServer } from "../src/mcp-server.js";

const databases: DB[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

async function client() {
  const db = openDb(":memory:");
  databases.push(db);
  const server = createKnowledgeServer(db);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const c = new Client({ name: "test", version: "0" });
  await c.connect(clientSide);
  return c;
}

test("the server declares completions, and completes a prompt argument from the protocol's values", async () => {
  const c = await client();
  expect(c.getServerCapabilities()?.completions).toBeDefined();
  const values = MCP_PROMPTS.what_changed.arguments.game.values;
  const all = await c.complete({ ref: { type: "ref/prompt", name: "what_changed" }, argument: { name: "game", value: "" } });
  expect(all.completion.values).toEqual([...values]);
  const some = await c.complete({ ref: { type: "ref/prompt", name: "what_changed" }, argument: { name: "game", value: "C" } });
  expect(some.completion.values).toEqual(["classic"]);
  const none = await c.complete({ ref: { type: "ref/prompt", name: "what_changed" }, argument: { name: "game", value: "retail" } });
  expect(none.completion.values).toEqual([]);
  // An argument without a value set completes to nothing, not to an error.
  const free = await c.complete({ ref: { type: "ref/prompt", name: "answer_with_sources" }, argument: { name: "question", value: "Thr" } });
  expect(free.completion.values).toEqual([]);
});

test("the class variable of the talents template completes from the protocol's class list", async () => {
  const c = await client();
  const all = await c.complete({ ref: { type: "ref/resource", uri: "everloot://talents/{class}" }, argument: { name: "class", value: "" } });
  expect(all.completion.values).toEqual([...TALENT_CLASSES]);
  const p = await c.complete({ ref: { type: "ref/resource", uri: "everloot://talents/{class}" }, argument: { name: "class", value: "p" } });
  expect(p.completion.values).toEqual(["paladin", "priest"]);
  // An id variable has no finite set: nothing to offer.
  const id = await c.complete({ ref: { type: "ref/resource", uri: "everloot://item/{id}" }, argument: { name: "id", value: "1" } });
  expect(id.completion.values).toEqual([]);
});

test("resources/list carries the static resources and one talents resource per class, each readable", async () => {
  const c = await client();
  const listed = (await c.listResources()).resources;
  expect(listed.slice(0, MCP_RESOURCE_URIS.length).map((r) => r.uri)).toEqual(MCP_RESOURCE_URIS);
  const classes = listed.filter((r) => r.uri.startsWith("everloot://talents/"));
  expect(classes.map((r) => r.uri)).toEqual(TALENT_CLASSES.map((k) => `everloot://talents/${k}`));
  expect(classes[0]).toMatchObject({ name: "talents/warrior", mimeType: "application/json" });
  expect(classes[0].title).toContain(MCP_RESOURCE_TEMPLATES["everloot://talents/{class}"].title);
  // No listed resource for the id templates: their value sets are not finite.
  expect(listed.some((r) => /^everloot:\/\/(item|npc|quest|vendor|object)\//.test(r.uri))).toBe(false);
  const read = await c.readResource({ uri: classes[0].uri });
  expect(JSON.parse((read.contents[0] as { text: string }).text).class).toBe("warrior");
});
