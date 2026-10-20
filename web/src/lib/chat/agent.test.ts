import { describe, expect, test, vi } from "vitest";
import { MY_BUILDS_LINE, MY_BUILDS_REFUSAL } from "../saved-builds";
import { ACCOUNT_TOOL, answer, callTool, CHAT_TOOLS, loadTools, NO_SOURCED_ANSWER, readOpenAiStream, searchOnly, signedIn, sourcesIn, type ToolDef } from "./agent";
import { chatProvider } from "./providers";

const HIT = "[lore_page/lore] Leeroy Jenkins\nLeeroy Jenkins is a valiant human paladin.\nSource: https://warcraft.wiki.gg/wiki/Leeroy_Jenkins (CC-BY-SA-4.0, retrieved 2023-11-13)\n";

/** A text/event-stream body split across reads at awkward places. */
function sse(events: unknown[], named = false): Response {
  const raw = events.map((e) => `${named ? `event: ${(e as { type: string }).type}\n` : ""}data: ${JSON.stringify(e)}\n\n`).join("") + ": keep-alive\n\ndata: [DONE]\n\n";
  const bytes = new TextEncoder().encode(raw);
  const body = new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); } });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** This site's /api/tools endpoint, answering every lookup with HIT. */
function site(calls: string[]) {
  return vi.fn(async (url: string) => { calls.push(url); return new Response(JSON.stringify({ text: HIT }), { status: 200 }); }) as unknown as typeof fetch;
}

const TOOLS: ToolDef[] = [{ name: "search_knowledge", description: "Search", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }];

test("sources are the distinct Source lines in order", () => {
  expect(sourcesIn(HIT + HIT)).toEqual(["https://warcraft.wiki.gg/wiki/Leeroy_Jenkins (CC-BY-SA-4.0, retrieved 2023-11-13)"]);
});

test("tools load from the published schema files without their $schema and $id", async () => {
  const send = vi.fn(async (_url: string) => new Response(JSON.stringify({ title: "T", description: "D", inputSchema: { $schema: "x", $id: "y", type: "object", properties: {} } }), { status: 200 }));
  const tools = await loadTools(send as never);
  expect(tools.map((t) => t.name)).toEqual([...CHAT_TOOLS]);
  expect(send.mock.calls[0][0]).toBe("/schema/mcp/search_knowledge.json");
  expect(tools[0]).toEqual({ name: "search_knowledge", description: "T. D", inputSchema: { type: "object", properties: {} } });
});

test("my_builds is offered only for a signed-in visitor, with its one line and a slug argument", async () => {
  const send = vi.fn(async (_url: string) => new Response(JSON.stringify({ title: "T", inputSchema: { type: "object", properties: {} } }), { status: 200 }));
  expect((await loadTools(send as never)).map((t) => t.name)).toEqual([...CHAT_TOOLS]);
  const tools = await loadTools(send as never, true);
  expect(tools.map((t) => t.name)).toEqual([...CHAT_TOOLS, "my_builds"]);
  expect(tools.at(-1)).toEqual(ACCOUNT_TOOL);
  expect(ACCOUNT_TOOL.description).toBe(MY_BUILDS_LINE);
  expect(ACCOUNT_TOOL.inputSchema).toMatchObject({ properties: { slug: { type: "string", pattern: "^[A-Za-z0-9]{8}$" } } });
  // The schema files are fetched for the public tools only; my_builds has none.
  expect(send.mock.calls.map((c) => c[0])).not.toContain("/schema/mcp/my_builds.json");
});

test("signed in means /api/auth/me names a user; anything else is signed out", async () => {
  const me = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as never;
  expect(await signedIn(me({ user: { id: "u", name: "Thrall#1" } }))).toBe(true);
  expect(await signedIn(me({ user: null }))).toBe(false);
  expect(await signedIn(me({ error: "down" }, 503))).toBe(false);
  expect(await signedIn(vi.fn(async () => { throw new TypeError("offline"); }) as never)).toBe(false);
});

describe("tool calls", () => {
  test("my_builds goes to /api/tools like the others; the site answers the refusal when signed out", async () => {
    const calls: string[] = [];
    expect(await callTool("my_builds", { slug: "AbCd1234" }, site(calls))).toBe(HIT);
    expect(calls).toEqual(["/api/tools/my_builds?slug=AbCd1234"]);
    const refused = vi.fn(async () => new Response(JSON.stringify({ error: MY_BUILDS_REFUSAL }), { status: 401 }));
    expect(await callTool("my_builds", {}, refused as never)).toBe(`Tool error: ${MY_BUILDS_REFUSAL}`);
  });

  test("go to /api/tools with plain arguments in the query string", async () => {
    const calls: string[] = [];
    expect(await callTool("item_page", { itemId: 19019, nested: { no: 1 }, empty: null }, site(calls))).toBe(HIT);
    expect(calls).toEqual(["/api/tools/item_page?itemId=19019"]);
  });
  test("an unknown tool or a failing call comes back as text for the model", async () => {
    expect(await callTool("delete_everything", {}, site([]))).toMatch(/no tool named/);
    const bad = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "itemId must be a number" }), { status: 400 }));
    expect(await callTool("item_page", { itemId: "x" }, bad as never)).toBe("Tool error: itemId must be a number");
  });
});

test("without a key the answer is the search hits, or no sourced answer", async () => {
  const r = await searchOnly("Leeroy Jenkins", site([]));
  expect(r).toMatchObject({ model: null, sources: [expect.stringContaining("Leeroy_Jenkins")] });
  const none = vi.fn(async () => new Response(JSON.stringify({ text: "No results." }), { status: 200 }));
  expect((await searchOnly("whos is leroy jenkins", none as never)).text).toBe(NO_SOURCED_ANSWER);
});

test("OpenRouter: the streamed tool call is rebuilt, run on this site, and the answer streams with its sources", async () => {
  const calls: string[] = [];
  const bodies: { stream?: boolean; tools: unknown[]; messages: { role: string }[] }[] = [];
  const headers: Record<string, string>[] = [];
  const send = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
    bodies.push(JSON.parse(init.body)); headers.push(init.headers);
    return bodies.length === 1
      ? sse([
        { model: "deepseek/deepseek-v4.1-flash", choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: "search_knowledge", arguments: "" } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "{\"query\":\"Leeroy" } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: " Jenkins\"}" } }] } }] },
      ])
      : sse([{ choices: [{ delta: { content: "A human paladin" } }] }, { choices: [{ delta: { content: " famous for charging in." } }] }]);
  });
  const progress: unknown[] = [];
  const r = await answer({ provider: chatProvider("openrouter")!, model: "deepseek/deepseek-v4.1-flash", key: "sk-or-v1-test", history: [], question: "whos is leroy jenkins", tools: TOOLS, send: send as never, site: site(calls), onProgress: (p) => progress.push(p) });
  expect(send.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(headers[0].authorization).toBe("Bearer sk-or-v1-test");
  expect(bodies[0].stream).toBe(true);
  expect(calls).toEqual(["/api/tools/search_knowledge?query=Leeroy+Jenkins"]);
  expect(bodies[1].messages.slice(-2).map((m) => m.role)).toEqual(["assistant", "tool"]);
  expect(progress).toEqual([{ text: "", tool: "search_knowledge" }, { text: "A human paladin", tool: null }, { text: "A human paladin famous for charging in.", tool: null }]);
  expect(r).toMatchObject({ text: "A human paladin famous for charging in.", model: "deepseek/deepseek-v4.1-flash", steps: [{ tool: "search_knowledge" }] });
  expect(r.sources).toHaveLength(1);
});

test("Anthropic: the browser header is sent, the tool_use input is pieced together, and the reply streams", async () => {
  const calls: string[] = [];
  const bodies: { messages: { role: string; content: unknown }[] }[] = [];
  const headers: Record<string, string>[] = [];
  const send = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
    bodies.push(JSON.parse(init.body)); headers.push(init.headers);
    return bodies.length === 1
      ? sse([
        { type: "message_start", message: { model: "claude-sonnet-5-5" } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "search_knowledge" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"query\": \"Leeroy" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: " Jenkins\"}" } },
        { type: "message_delta", delta: { stop_reason: "tool_use" } },
      ], true)
      : sse([
        { type: "message_start", message: { model: "claude-sonnet-5-5" } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "A valiant" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " human paladin." } },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ], true);
  });
  const r = await answer({ provider: chatProvider("anthropic")!, model: "claude-sonnet-5-5", key: "sk-ant-test", history: [{ role: "user", text: "hi" }, { role: "assistant", text: "hello" }], question: "who is leeroy", tools: TOOLS, send: send as never, site: site(calls) });
  expect(send.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
  expect(headers[0]).toMatchObject({ "x-api-key": "sk-ant-test", "anthropic-dangerous-direct-browser-access": "true" });
  expect(calls).toEqual(["/api/tools/search_knowledge?query=Leeroy+Jenkins"]);
  expect(bodies[1].messages.at(-2)).toEqual({ role: "assistant", content: [{ type: "tool_use", id: "t1", name: "search_knowledge", input: { query: "Leeroy Jenkins" } }] });
  expect(bodies[1].messages.at(-1)).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: HIT }] });
  expect(r).toMatchObject({ text: "A valiant human paladin.", model: "claude-sonnet-5-5", sources: [expect.stringContaining("Leeroy_Jenkins")] });
});

test("provider errors name the provider and the message, in a body or inside the stream", async () => {
  const http = vi.fn(async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 }));
  await expect(answer({ provider: chatProvider("anthropic")!, model: "m", key: "k", history: [], question: "q", tools: TOOLS, send: http as never, site: site([]) }))
    .rejects.toThrow("Anthropic: HTTP 401, invalid x-api-key");
  const inStream = vi.fn(async () => sse([{ error: { message: "Rate limit exceeded" } }]));
  await expect(answer({ provider: chatProvider("openrouter")!, model: "m", key: "k", history: [], question: "q", tools: TOOLS, send: inStream as never, site: site([]) }))
    .rejects.toThrow("openrouter.ai: Rate limit exceeded");
});

test("an Ollama that cannot be reached says how to let the page in", async () => {
  const down = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
  await expect(answer({ provider: chatProvider("ollama")!, model: "qwen3", key: "", history: [], question: "q", tools: TOOLS, send: down as never, site: site([]) }))
    .rejects.toThrow(/OLLAMA_ORIGINS=https:\/\/everloot\.app/);
});

test("a stream without indexes treats each tool piece as a whole call", async () => {
  const r = await readOpenAiStream(sse([{ choices: [{ delta: { tool_calls: [{ id: "a", function: { name: "get_entity", arguments: "{\"id\":1}" } }] } }] }, { choices: [{ delta: { tool_calls: [{ id: "b", function: { name: "get_entity", arguments: "{\"id\":2}" } }] } }] }]).body!, () => {});
  expect(r.message.tool_calls?.map((c) => c.function.arguments)).toEqual(["{\"id\":1}", "{\"id\":2}"]);
});
