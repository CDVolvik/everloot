import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MCP_PROMPT_LIST, MCP_PROMPT_NAMES } from "@everloot/protocol";
import { afterEach, expect, test } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { createKnowledgeServer } from "../src/mcp-server.js";
import { promptText } from "../src/prompts.js";

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

test("prompts/list is exactly the protocol's prompt table, in order, with its arguments", async () => {
  const listed = (await (await client()).listPrompts()).prompts;
  expect(listed.map((p) => p.name)).toEqual(MCP_PROMPT_NAMES);
  for (const [i, p] of listed.entries()) {
    const def = MCP_PROMPT_LIST[i];
    expect(p.title).toBe(def.title);
    expect(p.description).toBe(def.description);
    expect((p.arguments ?? []).map((a) => [a.name, a.required ?? false])).toEqual(Object.entries(def.arguments).map(([name, a]) => [name, a.required]));
  }
});

test("each prompt is one user message that names the tools to call and carries the argument", async () => {
  const c = await client();
  const sources = await c.getPrompt({ name: "answer_with_sources", arguments: { question: "Where does Peacebloom drop?" } });
  expect(sources.messages).toHaveLength(1);
  expect(sources.messages[0].role).toBe("user");
  const text = (sources.messages[0].content as { text: string }).text;
  expect(text).toContain("Where does Peacebloom drop?");
  expect(text).toContain("answer_sources");
  expect(text).toContain("unrecorded: it is not zero");
  expect(text).toBe(promptText("answer_with_sources", { question: "Where does Peacebloom drop?" }));

  const plan = (await c.getPrompt({ name: "review_talent_plan", arguments: { code: "EL1-mage-0-1.60.1.70450-" } })).messages[0].content as { text: string };
  expect(plan.text).toContain("talent_plan: EL1-mage-0-1.60.1.70450-");
  expect(plan.text).toContain("talent_tree");
  expect(plan.text).toContain("unconfirmed until seen in play");

  const both = (await c.getPrompt({ name: "what_changed", arguments: {} })).messages[0].content as { text: string };
  expect(both.text).toContain("WoW: Forever and WoW Classic");
  expect(both.text).toContain("recent_changes (filter all, limit 25)");
  const classic = (await c.getPrompt({ name: "what_changed", arguments: { game: "classic" } })).messages[0].content as { text: string };
  expect(classic.text).toContain("WoW Classic with recent_changes (game classic, filter all, limit 25)");
  expect(classic.text).toContain("the full text is Blizzard's");
});

test("a missing required argument is refused, and an unknown prompt is an error", async () => {
  const c = await client();
  await expect(c.getPrompt({ name: "answer_with_sources", arguments: {} })).rejects.toThrow();
  await expect(c.getPrompt({ name: "review_talent_plan", arguments: { code: "  " } })).rejects.toThrow(/needs code/);
  await expect(c.getPrompt({ name: "no_such_prompt", arguments: {} })).rejects.toThrow();
});

test("what_changed takes forever or classic in any case, and refuses any other game instead of reading it as both", async () => {
  const c = await client();
  const classic = (await c.getPrompt({ name: "what_changed", arguments: { game: " Classic " } })).messages[0].content as { text: string };
  expect(classic.text).toContain("WoW Classic with recent_changes (game classic, filter all, limit 25)");
  await expect(c.getPrompt({ name: "what_changed", arguments: { game: "retail" } })).rejects.toThrow(/what_changed takes game forever or classic/);
  const blank = (await c.getPrompt({ name: "what_changed", arguments: { game: " " } })).messages[0].content as { text: string };
  expect(blank.text).toContain("WoW: Forever and WoW Classic");
});
