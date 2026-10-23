import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MCP_RESOURCE_TEMPLATE_LIST, MCP_RESOURCE_TEMPLATE_URIS, MCP_TOOLS } from "@everloot/protocol";
import { afterEach, expect, test } from "vitest";
import { z } from "zod";
import { openDb, type DB } from "../src/db.js";
import { createKnowledgeServer } from "../src/mcp-server.js";

const AS_OF = "2026-10-18T10:00:00.000Z";
const records: unknown[] = [];
for (const [i, installId] of ["a", "b", "c"].entries()) {
  const base = { installId, capturedAt: "2026-10-09T00:00:00Z", sourceEvidence: "loot-api" };
  records.push({ ...base, eventId: `name-${i}`, kind: "item_seen", itemId: 1234, name: "Peacebloom", quality: "common" });
  records.push({ ...base, eventId: `number-${i}`, kind: "item_fact", itemId: 1234, fact: "stamina", value: 5, clientBuild: "1.60.1.70450" });
  records.push({ ...base, eventId: `loot-${i}`, kind: "loot", sourceNpcId: 456, items: [{ itemId: 1234, count: 1 }] });
  records.push({ ...base, eventId: `vendor-${i}`, kind: "vendor", vendorNpcId: 99, items: [{ itemId: 1234, priceCopper: 25 }] });
}

const databases: DB[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

async function client() {
  const db = openDb(":memory:");
  databases.push(db);
  const server = createKnowledgeServer(db, { corpus: async () => ({ records, dataAsOf: AS_OF }) });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const c = new Client({ name: "test", version: "0" });
  await c.connect(clientSide);
  return c;
}

test("resources/templates/list is exactly the protocol's template table, in order", async () => {
  const listed = (await (await client()).listResourceTemplates()).resourceTemplates;
  expect(listed.map((t) => t.uriTemplate)).toEqual(MCP_RESOURCE_TEMPLATE_URIS);
  for (const [i, t] of listed.entries()) expect(t).toMatchObject({ name: MCP_RESOURCE_TEMPLATE_LIST[i].name, title: MCP_RESOURCE_TEMPLATE_LIST[i].title, mimeType: "application/json" });
});

test("reading an entity URI gives the tool's structured answer as JSON, the same the tool returns", async () => {
  const c = await client();
  const read = await c.readResource({ uri: "everloot://item/1234" });
  expect(read.contents[0]).toMatchObject({ uri: "everloot://item/1234", mimeType: "application/json" });
  const viaResource = JSON.parse((read.contents[0] as { text: string }).text);
  const viaTool = (await c.callTool({ name: "item_page", arguments: { itemId: 1234 } })).structuredContent;
  expect(viaResource).toEqual(viaTool);
  expect(z.object(MCP_TOOLS.item_page.outputSchema).parse(viaResource).page!.name).toBe("Peacebloom");
  expect(viaResource.page.reported.shown).toEqual([{ fact: "stamina", value: 5, reporters: 3, build: "1.60.1.70450", lastSeen: "2026-10-09T00:00:00.000Z" }]);

  const vendor = JSON.parse(((await c.readResource({ uri: "everloot://vendor/99" })).contents[0] as { text: string }).text);
  expect(vendor.page.offers).toEqual([{ itemId: 1234, priceCopper: 25, limitedStock: null, unlimited: true, reporters: 3 }]);

  const talents = JSON.parse(((await c.readResource({ uri: "everloot://talents/mage" })).contents[0] as { text: string }).text);
  expect(talents).toEqual((await c.callTool({ name: "talent_tree", arguments: { class: "mage" } })).structuredContent);
});

test("a variable the tool's input schema refuses is an error that says what the variable must be", async () => {
  const c = await client();
  await expect(c.readResource({ uri: "everloot://item/abc" })).rejects.toThrow(/id must be a positive id/);
  await expect(c.readResource({ uri: "everloot://item/0" })).rejects.toThrow(/positive id/);
  await expect(c.readResource({ uri: "everloot://talents/monk" })).rejects.toThrow(/class must be a class slug/);
  await expect(c.readResource({ uri: "everloot://nothing/1" })).rejects.toThrow();
});
