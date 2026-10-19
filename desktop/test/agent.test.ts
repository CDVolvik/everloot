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
  const r = await answer({ mcp: { url: "https://everloot.app/mcp/public", token: null }, entries: [], history: [], question: "what drops bindings", session: fakeSession(calls) });
  expect(calls).toEqual([{ name: "search_knowledge", args: { query: "what drops bindings", limit: 3 } }]);
  expect(r.model).toBeNull();
  expect(r.sources).toHaveLength(2);
  expect(r.text).toContain("Baron Geddon");
  const none = await answer({ mcp: { url: "u", token: null }, entries: [], history: [], question: "q", session: fakeSession([], "nothing here") });
  expect(none.text).toMatch(/No sourced answer/);
  expect(none.sources).toEqual([]);
});

test("an OpenAI-compatible provider runs the same tool loop in that API's shape", async () => {
  const d = dir();
  writeFileSync(join(d, "k.txt"), "sk-or-test\n");
  const calls: { name: string; args: unknown }[] = [];
  const requests: { url: string; headers: Record<string, string>; body: { model: string; messages: { role: string; tool_call_id?: string }[]; tools: { type: string; function: { name: string } }[] } }[] = [];
  const send = vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body);
    requests.push({ url, headers: init.headers, body });
    const reply = requests.length === 1
      ? { model: "deepseek/deepseek-v4.1-flash", choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "search_knowledge", arguments: "{\"query\":\"bindings\"}" } }] } }] }
      : { model: "deepseek/deepseek-v4.1-flash", choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Baron Geddon in Molten Core. Source: Everloot uploads." } }] };
    return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
  });
  const entry = { type: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1/", model: "deepseek/deepseek-v4.1-flash", apiKeyFile: join(d, "k.txt") };
  const r = await answer({ mcp: { url: "u", token: null }, entries: [entry], history: [{ role: "user", text: "hi", at: "", model: null, sources: [], steps: [] }], question: "bindings?", session: fakeSession(calls), send: send as never });
  expect(requests[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(requests[0].headers.authorization).toBe("Bearer sk-or-test");
  expect(requests[0].body.tools).toEqual([{ type: "function", function: { name: "search_knowledge", description: "search", parameters: { type: "object", properties: { query: { type: "string" } } } } }]);
  expect(requests[0].body.messages.map((m) => m.role)).toEqual(["system", "user", "user"]);
  expect(calls).toEqual([{ name: "search_knowledge", args: { query: "bindings" } }]);
  // The second request carries the assistant's tool call and the tool's result.
  expect(requests[1].body.messages.slice(-2).map((m) => [m.role, m.tool_call_id])).toEqual([["assistant", undefined], ["tool", "c1"]]);
  expect(r).toMatchObject({ model: "deepseek/deepseek-v4.1-flash", text: "Baron Geddon in Molten Core. Source: Everloot uploads." });
  expect(r.steps).toEqual([{ tool: "search_knowledge", input: '{"query":"bindings"}', chars: HIT.length }]);
  expect(r.sources).toHaveLength(2);
});

test("an OpenAI-compatible error names the server and the message", async () => {
  const send = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Insufficient credits" } }), { status: 402 }));
  const entry = { type: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", model: "x" };
  await expect(answer({ mcp: { url: "u", token: null }, entries: [entry], history: [], question: "q", session: fakeSession([]), send: send as never }))
    .rejects.toThrow("https://openrouter.ai/api/v1: HTTP 402, Insufficient credits");
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
  const r = await answer({ mcp: { url: "u", token: null }, entries: [{ type: "anthropic", apiKeyFile: join(d, "k.txt") }], history: [], question: "bindings?", session: fakeSession(calls), anthropicClient: client as never });
  expect(calls).toEqual([{ name: "search_knowledge", args: { query: "bindings" } }]);
  expect(r.model).toBe("claude-sonnet-5-5");
  expect(r.steps).toEqual([{ tool: "search_knowledge", input: '{"query":"bindings"}', chars: HIT.length }]);
  expect(r.sources).toHaveLength(2);
  expect(r.text).toContain("Baron Geddon");
});
