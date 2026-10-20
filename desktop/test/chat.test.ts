import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { ACCOUNT_KEY_FILE } from "../src/main/account";
import { answer } from "../src/main/agent";
import { createChat } from "../src/main/chat";
import { defaultSettings } from "../src/main/settings";
import type { Settings } from "../src/shared/types";

vi.mock("../src/main/agent", async (importOriginal) => ({ ...(await importOriginal<object>()), answer: vi.fn() }));
const mockAnswer = vi.mocked(answer);

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-desktop-")); dirs.push(d); return d; };
afterEach(() => { mockAnswer.mockReset(); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const reply = (text: string) => ({ text, model: null, sources: [], steps: [] });
const settings = (patch: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), endpoint: "https://example.test", ...patch });

test("a question and its answer land in chat.json and come back on the next start", async () => {
  const d = dir();
  mockAnswer.mockResolvedValueOnce(reply("Thunderfury drops in Molten Core."));
  const chat = createChat(d, () => settings());
  const info = await chat.send("  where does Thunderfury drop?  ");
  expect(info.messages.map((m) => [m.role, m.text])).toEqual([["user", "where does Thunderfury drop?"], ["assistant", "Thunderfury drops in Molten Core."]]);
  expect(info.error).toBeNull();
  expect(JSON.parse(readFileSync(join(d, "chat.json"), "utf8"))).toHaveLength(2);
  expect(createChat(d, () => settings()).info().messages).toHaveLength(2);
  // The agent saw the history before this question and the question itself.
  expect(mockAnswer.mock.calls[0][0]).toMatchObject({ question: "where does Thunderfury drop?", history: [] });
});

test("an empty question and a question while busy do nothing", async () => {
  const chat = createChat(dir(), () => settings());
  expect((await chat.send("   ")).messages).toEqual([]);
  let release!: (r: ReturnType<typeof reply>) => void;
  mockAnswer.mockReturnValueOnce(new Promise((res) => { release = res; }));
  const first = chat.send("one");
  expect(chat.info().busy).toBe(true);
  expect((await chat.send("two")).messages.map((m) => m.text)).toEqual(["one"]);
  release(reply("answer"));
  expect((await first).messages.map((m) => m.text)).toEqual(["one", "answer"]);
  expect(mockAnswer).toHaveBeenCalledTimes(1);
});

test("a failed answer keeps the question, reports the error and clears it on the next send", async () => {
  const chat = createChat(dir(), () => settings());
  mockAnswer.mockRejectedValueOnce(new Error("MCP unreachable"));
  const failed = await chat.send("hello");
  expect(failed.error).toBe("MCP unreachable");
  expect(failed.busy).toBe(false);
  expect(failed.messages.map((m) => m.role)).toEqual(["user"]);
  mockAnswer.mockResolvedValueOnce(reply("hi"));
  expect((await chat.send("again")).error).toBeNull();
});

test("the transcript keeps the newest hundred messages", async () => {
  const d = dir();
  writeFileSync(join(d, "chat.json"), JSON.stringify(Array.from({ length: 120 }, (_, i) => ({ role: "user", text: `m${i}`, at: "", model: null, sources: [], steps: [] }))));
  const chat = createChat(d, () => settings());
  expect(chat.info().messages).toHaveLength(100);
  expect(chat.info().messages[0].text).toBe("m20");
  mockAnswer.mockResolvedValueOnce(reply("a"));
  const after = await chat.send("q");
  expect(after.messages).toHaveLength(100);
  expect(after.messages.at(-1)?.text).toBe("a");
});

test("the target is the public mount without a token and the token endpoint with one", async () => {
  const d = dir();
  expect(createChat(d, () => settings()).info()).toMatchObject({ mcpUrl: "https://example.test/mcp/public", withToken: false });
  const tokenFile = join(d, "token.txt");
  writeFileSync(tokenFile, "tok-123\n");
  const withToken = createChat(d, () => settings({ ask: { enabled: true, mcpUrl: "https://example.test/mcp", tokenFile } }));
  expect(withToken.info()).toMatchObject({ mcpUrl: "https://example.test/mcp", withToken: true });
  mockAnswer.mockResolvedValueOnce(reply("ok"));
  await withToken.send("q");
  expect(mockAnswer.mock.calls[0][0].mcp).toEqual({ url: "https://example.test/mcp", token: "tok-123" });
  // An empty or missing token file falls back to the public mount.
  writeFileSync(tokenFile, "");
  expect(withToken.info()).toMatchObject({ mcpUrl: "https://example.test/mcp/public", withToken: false });
});

test("signed in, the public mount gets the account key; a token file still wins", async () => {
  const d = dir();
  const key = `evl_${"0f".repeat(32)}`;
  writeFileSync(join(d, ACCOUNT_KEY_FILE), key + "\n");
  const chat = createChat(d, () => settings());
  expect(chat.info()).toMatchObject({ mcpUrl: "https://example.test/mcp/public", withToken: false });
  mockAnswer.mockResolvedValueOnce(reply("ok"));
  await chat.send("q");
  expect(mockAnswer.mock.calls[0][0].mcp).toEqual({ url: "https://example.test/mcp/public", token: key });
  const tokenFile = join(d, "token.txt");
  writeFileSync(tokenFile, "tok-123\n");
  mockAnswer.mockResolvedValueOnce(reply("ok"));
  await createChat(d, () => settings({ ask: { enabled: true, mcpUrl: "https://example.test/mcp", tokenFile } })).send("q");
  expect(mockAnswer.mock.calls[1][0].mcp).toEqual({ url: "https://example.test/mcp", token: "tok-123" });
});

test("the mode names the first provider with its model, and the picker's entry goes in front of hand-written ones", () => {
  const d = dir();
  const chat = createChat(d, () => settings());
  expect(chat.info()).toMatchObject({ mode: "plain search", provider: null });
  writeFileSync(join(d, "config.json"), JSON.stringify({ providers: [{ type: "openai-compatible", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", apiKeyFile: "k.txt" }] }));
  expect(chat.info()).toMatchObject({ mode: "api.deepseek.com:deepseek-chat with tools", provider: null });
  chat.setProvider({ kind: "anthropic", key: `sk-ant-${"a".repeat(30)}`, model: "claude-haiku-5-5" });
  expect(chat.info()).toMatchObject({ mode: "anthropic:claude-haiku-5-5 with tools", provider: { kind: "anthropic", model: "claude-haiku-5-5", baseUrl: null } });
  // The hand-written provider stays behind the picked one rather than being dropped.
  expect(JSON.parse(readFileSync(join(d, "config.json"), "utf8")).providers.map((p: { type: string }) => p.type)).toEqual(["anthropic", "openai-compatible"]);
  chat.removeProvider();
  expect(chat.info()).toMatchObject({ mode: "api.deepseek.com:deepseek-chat with tools", provider: null });
  // Saved by hand with a byte order mark: still read.
  writeFileSync(join(d, "config.json"), "\uFEFF" + JSON.stringify({ providers: [{ type: "openai-compatible", baseUrl: "http://localhost:11434/v1", model: "qwen3" }] }));
  expect(chat.info().mode).toBe("localhost:qwen3 with tools");
  writeFileSync(join(d, "config.json"), JSON.stringify({ providers: [{ type: "openai", apiKey: "inline" }] }));
  expect(chat.info().mode).toMatch(/^config.json: providers\[0\]/);
});

test("clear empties the transcript on disk too", async () => {
  const d = dir();
  mockAnswer.mockResolvedValueOnce(reply("a"));
  const chat = createChat(d, () => settings());
  await chat.send("q");
  expect(chat.clear().messages).toEqual([]);
  expect(existsSync(join(d, "chat.json"))).toBe(true);
  expect(JSON.parse(readFileSync(join(d, "chat.json"), "utf8"))).toEqual([]);
});
