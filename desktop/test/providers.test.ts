import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { loadProviders } from "../../companion/src/providers/config";
import { ownProvider, removeProvider, setProvider } from "../src/main/providers";
import { PROVIDER_PRESETS } from "../src/shared/providers";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-providers-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const ANT = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
const OR = "sk-or-v1-example-example-example-example";
const config = (d: string) => JSON.parse(readFileSync(join(d, "config.json"), "utf8"));

test("an Anthropic key goes into its own file and config.json gets one entry the companion can load", () => {
  const d = dir();
  expect(setProvider(d, { kind: "anthropic", key: `  ${ANT}\n` })).toEqual({ kind: "anthropic", model: "claude-sonnet-5-5", baseUrl: null });
  expect(readFileSync(join(d, "anthropic.key"), "utf8")).toBe(ANT + "\n");
  expect(config(d).providers).toEqual([{ type: "anthropic", apiKeyFile: join(d, "anthropic.key"), model: "claude-sonnet-5-5", source: "everloot-desktop" }]);
  expect(ownProvider(d)).toEqual({ kind: "anthropic", model: "claude-sonnet-5-5", baseUrl: null });
  expect(loadProviders(join(d, "config.json"))).toHaveLength(1);
});

test("OpenRouter and OpenCode Zen become openai-compatible entries on their base URL; Ollama needs no key", () => {
  const d = dir();
  expect(setProvider(d, { kind: "openrouter", key: OR, model: "qwen/qwen3.7-flash" })).toEqual({ kind: "openrouter", model: "qwen/qwen3.7-flash", baseUrl: "https://openrouter.ai/api/v1" });
  expect(config(d).providers[0]).toEqual({ type: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", model: "qwen/qwen3.7-flash", apiKeyFile: join(d, "openrouter.key"), source: "everloot-desktop", kind: "openrouter" });
  expect(loadProviders(join(d, "config.json"))[0].name).toBe("openai-compatible:qwen/qwen3.7-flash");

  // Switching providers replaces the entry and removes the old key file.
  setProvider(d, { kind: "opencode", key: "zen-example-key" });
  expect(existsSync(join(d, "openrouter.key"))).toBe(false);
  expect(config(d).providers).toHaveLength(1);
  expect(ownProvider(d)).toEqual({ kind: "opencode", model: "glm-5.3-flash-free", baseUrl: "https://opencode.ai/inference/openai/v1" });

  setProvider(d, { kind: "ollama", model: "qwen3:8b" });
  expect(existsSync(join(d, "opencode.key"))).toBe(false);
  expect(config(d).providers[0]).toEqual({ type: "openai-compatible", baseUrl: "http://localhost:11434/v1", model: "qwen3:8b", source: "everloot-desktop", kind: "ollama" });
  expect(loadProviders(join(d, "config.json"))).toHaveLength(1);
});

test("a custom server takes its own address and an optional key", () => {
  const d = dir();
  expect(setProvider(d, { kind: "custom", baseUrl: "https://llm.example.test/v1/", model: "my-model" })).toEqual({ kind: "custom", model: "my-model", baseUrl: "https://llm.example.test/v1" });
  expect(config(d).providers[0].apiKeyFile).toBeUndefined();
  setProvider(d, { kind: "custom", baseUrl: "https://llm.example.test/v1", model: "my-model", key: "abc" });
  expect(readFileSync(join(d, "custom.key"), "utf8")).toBe("abc\n");
  expect(() => setProvider(d, { kind: "custom", baseUrl: "llm.example.test", model: "m" })).toThrow(/http/);
});

test("an existing config keeps its other entries and settings; the picked provider goes first", () => {
  const d = dir();
  writeFileSync(join(d, "config.json"), JSON.stringify({ note: "mine", providers: [{ type: "openai-compatible", baseUrl: "http://x", model: "m" }] }));
  setProvider(d, { kind: "anthropic", key: ANT });
  setProvider(d, { kind: "anthropic", key: ANT + "x", model: "claude-opus-5-5" });
  const c = config(d);
  expect(c.note).toBe("mine");
  expect(c.providers.map((p: { type: string; model: string }) => [p.type, p.model])).toEqual([["anthropic", "claude-opus-5-5"], ["openai-compatible", "m"]]);
  expect(readFileSync(join(d, "anthropic.key"), "utf8").trim()).toBe(ANT + "x");
});

test("remove deletes the picked entry and its key file; hand-written entries are left alone", () => {
  const d = dir();
  setProvider(d, { kind: "anthropic", key: ANT });
  removeProvider(d);
  expect(existsSync(join(d, "anthropic.key"))).toBe(false);
  expect(config(d).providers).toEqual([]);
  expect(ownProvider(d)).toBeNull();
  const e = dir();
  writeFileSync(join(e, "config.json"), JSON.stringify({ providers: [{ type: "anthropic", apiKeyFile: "/elsewhere/key" }] }));
  removeProvider(e);
  expect(config(e).providers).toEqual([{ type: "anthropic", apiKeyFile: "/elsewhere/key" }]);
  expect(ownProvider(e)).toBeNull();
  removeProvider(dir()); // nothing there is not an error
});

test("an anthropic entry from before the marker, on the app's own key file, still counts as the app's", () => {
  const d = dir();
  writeFileSync(join(d, "anthropic.key"), ANT + "\n");
  writeFileSync(join(d, "config.json"), JSON.stringify({ providers: [{ type: "anthropic", apiKeyFile: join(d, "anthropic.key"), model: "claude-haiku-5-5" }] }));
  expect(ownProvider(d)).toEqual({ kind: "anthropic", model: "claude-haiku-5-5", baseUrl: null });
  removeProvider(d);
  expect(existsSync(join(d, "anthropic.key"))).toBe(false);
});

test("bad pastes are refused before anything is written", () => {
  const d = dir();
  expect(() => setProvider(d, { kind: "anthropic", key: "hunter2" })).toThrow(/sk-ant-/);
  expect(() => setProvider(d, { kind: "openrouter", key: ANT })).toThrow(/sk-or-/);
  expect(() => setProvider(d, { kind: "openrouter", key: "" })).toThrow(/sk-or-/);
  expect(() => setProvider(d, { kind: "opencode", key: "" })).toThrow(/Paste the key/);
  expect(() => setProvider(d, { kind: "ollama", model: "" })).toThrow(/Pick or type a model/);
  expect(() => setProvider(d, { kind: "ollama", model: "not a model id" })).toThrow(/model id/);
  expect(() => setProvider(d, { kind: "nope" as never })).toThrow(/Unknown provider/);
  expect(existsSync(join(d, "config.json"))).toBe(false);
});

test("every preset's first model is a valid id and every OpenCode model listed is zero-retention free", () => {
  for (const p of PROVIDER_PRESETS) {
    for (const m of p.models) expect(m.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
    if (p.kind === "opencode") for (const m of p.models) { expect(m.id).toMatch(/-free$/); expect(m.note).toContain("zero retention"); }
  }
});
