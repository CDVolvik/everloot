import { expect, test } from "vitest";
import { loadProviders, loadThread, pickModel, removeProvider, saveProvider, saveThread } from "./store";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}
const OR = "sk-or-v1-example-example-example-example";
const ANT = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";

test("providers are kept per kind, the latest saved first, and a saved key survives a model change", () => {
  const s = memory();
  saveProvider(s, { kind: "openrouter", model: "deepseek/deepseek-v4.1-flash", key: ` ${OR} ` });
  saveProvider(s, { kind: "anthropic", model: "claude-sonnet-5-5", key: ANT });
  expect(loadProviders(s).map((p) => p.kind)).toEqual(["anthropic", "openrouter"]);
  saveProvider(s, { kind: "openrouter", model: "qwen/qwen3.7-flash" });
  expect(loadProviders(s)[0]).toEqual({ kind: "openrouter", model: "qwen/qwen3.7-flash", key: OR });
  expect(pickModel(s, "anthropic", "claude-haiku-5-5")[0]).toEqual({ kind: "anthropic", model: "claude-haiku-5-5", key: ANT });
  expect(removeProvider(s, "anthropic").map((p) => p.kind)).toEqual(["openrouter"]);
  removeProvider(s, "openrouter");
  expect(s.m.size).toBe(0);
});

test("bad pastes and unsaved providers are refused before anything is written", () => {
  const s = memory();
  expect(() => saveProvider(s, { kind: "anthropic", model: "claude-sonnet-5-5", key: "hunter2" })).toThrow(/sk-ant-/);
  expect(() => saveProvider(s, { kind: "openrouter", model: "x", key: "" })).toThrow(/Paste the key first/);
  expect(() => saveProvider(s, { kind: "ollama", model: "" })).toThrow(/Pick or type a model/);
  expect(() => saveProvider(s, { kind: "nope" as never, model: "m" })).toThrow(/Pick a provider/);
  expect(() => pickModel(s, "anthropic", "claude-haiku-5-5")).toThrow(/not saved/);
  expect(s.m.size).toBe(0);
  expect(saveProvider(s, { kind: "ollama", model: "qwen3:8b" })[0]).toEqual({ kind: "ollama", model: "qwen3:8b", key: "" });
});

test("damaged storage reads as empty, and the thread keeps the newest sixty messages", () => {
  const s = memory();
  s.setItem("everloot.chat.providers.v1", "{not json");
  s.setItem("everloot.chat.thread.v1", JSON.stringify([{ role: "system", text: "x" }]));
  expect(loadProviders(s)).toEqual([]);
  expect(loadThread(s)).toEqual([]);
  saveThread(s, Array.from({ length: 70 }, (_, i) => ({ role: "user" as const, text: `m${i}`, at: "", model: null, sources: [], steps: [] })));
  expect(loadThread(s).map((m) => m.text)[0]).toBe("m10");
  saveThread(s, []);
  expect(s.m.has("everloot.chat.thread.v1")).toBe(false);
});
