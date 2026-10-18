import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { loadProviders } from "../../companion/src/providers/config";
import { hasOwnAnthropicKey, looksLikeAnthropicKey, removeAnthropicKey, setAnthropicKey } from "../src/main/providers";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-providers-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";

test("the key goes into its own file and config.json gets one anthropic entry the companion can load", () => {
  const d = dir();
  const keyFile = setAnthropicKey(d, `  ${KEY}\n`);
  expect(readFileSync(keyFile, "utf8")).toBe(KEY + "\n");
  const config = JSON.parse(readFileSync(join(d, "config.json"), "utf8"));
  expect(config.providers).toEqual([{ type: "anthropic", apiKeyFile: keyFile, model: "claude-sonnet-5-5" }]);
  expect(hasOwnAnthropicKey(d)).toBe(true);
  expect(loadProviders(join(d, "config.json"))).toHaveLength(1);
});

test("an existing config keeps its other entries and settings; a second save replaces the entry, not adds one", () => {
  const d = dir();
  writeFileSync(join(d, "config.json"), JSON.stringify({ note: "mine", providers: [{ type: "openai-compatible", baseUrl: "http://x", model: "m" }] }));
  setAnthropicKey(d, KEY);
  setAnthropicKey(d, KEY + "x", "claude-opus-5-5");
  const config = JSON.parse(readFileSync(join(d, "config.json"), "utf8"));
  expect(config.note).toBe("mine");
  expect(config.providers.map((p: { type: string }) => p.type)).toEqual(["anthropic", "openai-compatible"]);
  expect(config.providers[0].model).toBe("claude-opus-5-5");
  expect(readFileSync(join(d, "anthropic.key"), "utf8").trim()).toBe(KEY + "x");
});

test("remove deletes the file and the entry that pointed at it; an entry on another key file is left alone", () => {
  const d = dir();
  setAnthropicKey(d, KEY);
  removeAnthropicKey(d);
  expect(existsSync(join(d, "anthropic.key"))).toBe(false);
  expect(JSON.parse(readFileSync(join(d, "config.json"), "utf8")).providers).toEqual([]);
  expect(hasOwnAnthropicKey(d)).toBe(false);
  const e = dir();
  writeFileSync(join(e, "config.json"), JSON.stringify({ providers: [{ type: "anthropic", apiKeyFile: "/elsewhere/key" }] }));
  removeAnthropicKey(e);
  expect(JSON.parse(readFileSync(join(e, "config.json"), "utf8")).providers).toEqual([{ type: "anthropic", apiKeyFile: "/elsewhere/key" }]);
  expect(hasOwnAnthropicKey(e)).toBe(false);
  removeAnthropicKey(dir()); // nothing there is not an error
});

test("a paste that is not an Anthropic key is refused before anything is written", () => {
  const d = dir();
  expect(() => setAnthropicKey(d, "hunter2")).toThrow(/sk-ant-/);
  expect(existsSync(join(d, "config.json"))).toBe(false);
  expect(looksLikeAnthropicKey("sk-ant-short")).toBe(false);
  expect(looksLikeAnthropicKey(KEY)).toBe(true);
});
