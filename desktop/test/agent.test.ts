import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { answer, readProviderEntries, sourcesIn } from "../src/main/agent";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-agent-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const HIT = "[item] Thunderfury bindings\nDrops from Baron Geddon, 3 of 41 kills.\nSource: Everloot uploads (CC BY-SA 4.0)\n\n[npc] Baron Geddon\nMolten Core.\nSource: Warcraft Wiki 2023 dump (CC BY-SA 4.0)\n";
const fakeSession = (calls: { name: string; args: unknown }[], reply = HIT) =>
  (async (_t: unknown, run: (c: unknown) => Promise<unknown>) => run({
    callTool: async (c: { name: string; arguments: unknown }) => { calls.push({ name: c.name, args: c.arguments }); return { content: [{ type: "text", text: reply }] }; },
    listTools: async () => ({ tools: [{ name: "search_knowledge", description: "search", inputSchema: { type: "object", properties: { query: { type: "string" } } } }] }),
  })) as never;

test("sources are the distinct Source lines in order", () => {
  expect(sourcesIn(HIT)).toEqual(["Everloot uploads (CC BY-SA 4.0)", "Warcraft Wiki 2023 dump (CC BY-SA 4.0)"]);
  expect(sourcesIn("nothing")).toEqual([]);
});

test("config entries come without keys, and an inline key is refused", () => {
  const d = dir();
  const p = join(d, "config.json");
  expect(readProviderEntries(p)).toEqual([]);
  writeFileSync(p, JSON.stringify({ providers: [{ type: "anthropic", apiKeyFile: "k.txt", model: "m" }, { type: "openai-compatible", baseUrl: "http://x", model: "y" }, { nope: 1 }] }));
  expect(readProviderEntries(p)).toEqual([{ type: "anthropic", model: "m", apiKeyFile: "k.txt" }, { type: "openai-compatible", model: "y", baseUrl: "http://x" }]);
  writeFileSync(p, JSON.stringify({ providers: [{ type: "anthropic", apiKey: "sk-no" }] }));
  expect(() => readProviderEntries(p)).toThrow(/apiKeyFile/);
});

test("with no provider the answer is the sourced hits themselves; no source means no answer", async () => {
  const calls: { name: string; args: unknown }[] = [];
  const r = await answer({ mcp: { url: "https://everloot.app/mcp/public", token: null }, entries: [], providers: [], history: [], question: "what drops bindings", session: fakeSession(calls) });
  expect(calls).toEqual([{ name: "search_knowledge", args: { query: "what drops bindings", limit: 3 } }]);
  expect(r.model).toBeNull();
  expect(r.sources).toHaveLength(2);
  expect(r.text).toContain("Baron Geddon");
  const none = await answer({ mcp: { url: "u", token: null }, entries: [], providers: [], history: [], question: "q", session: fakeSession([], "nothing here") });
  expect(none.text).toMatch(/No sourced answer/);
  expect(none.sources).toEqual([]);
});

test("another provider phrases the answer from the hits and is named", async () => {
  const provider = { name: "openai-compatible:gemma", complete: vi.fn(async (_s: string, u: string) => { expect(u).toContain("Baron Geddon"); return { text: "Baron Geddon drops them.", model: "gemma4" }; }) };
  const r = await answer({ mcp: { url: "u", token: null }, entries: [{ type: "openai-compatible" }], providers: [provider], history: [{ role: "user", text: "hi", at: "", model: null, sources: [], steps: [] }], question: "bindings?", session: fakeSession([]) });
  expect(r).toMatchObject({ text: "Baron Geddon drops them.", model: "gemma4" });
  expect(r.sources).toHaveLength(2);
});

test("with Anthropic the model calls the MCP tools itself and the steps and sources are recorded", async () => {
  const d = dir();
  writeFileSync(join(d, "k.txt"), "sk-test\n");
  const calls: { name: string; args: unknown }[] = [];
  let turn = 0;
  const client = { messages: { create: vi.fn(async (req: { tools: { name: string }[]; messages: unknown[] }) => {
    expect(req.tools.map((t) => t.name)).toEqual(["search_knowledge"]);
    turn++;
    if (turn === 1) return { model: "claude-sonnet-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "search_knowledge", input: { query: "bindings" } }] };
    expect(req.messages).toHaveLength(3);
    return { model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Baron Geddon in Molten Core. Source: Everloot uploads." }] };
  }) } };
  const r = await answer({ mcp: { url: "u", token: null }, entries: [{ type: "anthropic", apiKeyFile: join(d, "k.txt") }], providers: [], history: [], question: "bindings?", session: fakeSession(calls), anthropicClient: client as never });
  expect(calls).toEqual([{ name: "search_knowledge", args: { query: "bindings" } }]);
  expect(r.model).toBe("claude-sonnet-5-5");
  expect(r.steps).toEqual([{ tool: "search_knowledge", input: '{"query":"bindings"}', chars: HIT.length }]);
  expect(r.sources).toHaveLength(2);
  expect(r.text).toContain("Baron Geddon");
});
