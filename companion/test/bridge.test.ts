import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { adler32, luaString } from "../src/bridge/lua";
import { readAsks } from "../src/bridge/asks";
import { renderAnswersAddon } from "../src/bridge/answers";
import { answerPending, createAnswerStore } from "../src/bridge/run";
import { answerFromSearch } from "../src/bridge/engine";

const FIXTURE = new URL("../../addon/tests/fixtures/EverlootAnswers.lua", import.meta.url);
const HOSTILE = 'x"] = 1 } os.execute("calc") --[[\n]]\\\0\r\t';

test("adler32 matches the published test vector", () => {
  expect(adler32("Wikipedia")).toBe(0x11e60398);
  expect(adler32("")).toBe(1);
});

test("Lua strings escape quotes, backslashes and every control byte", () => {
  expect(luaString('a"b')).toBe('"a\\"b"');
  expect(luaString("a\\b")).toBe('"a\\\\b"');
  expect(luaString("line1\nline2")).toBe('"line1\\nline2"');
  expect(luaString("\0\r\u001b")).toBe('"\\000\\013\\027"');
  // Nothing in the output can end the string early: no raw quote, newline or control byte.
  expect(luaString(HOSTILE).slice(1, -1)).not.toMatch(/(^|[^\\])"|[\u0000-\u001f]/);
});

test("asks are read from SavedVariables, malformed or oversized ones are skipped", () => {
  const lua = `EverlootDB = {
["version"] = "0.2.3",
["installId"] = "abcd-1234-ef56-7890",
["records"] = {},
["asks"] = {
{["id"] = "ask:1", ["question"] = "Where does Thrall live?", ["askedAt"] = "2026-10-09T00:00:00Z"},
{["id"] = "ask:2", ["question"] = "", ["askedAt"] = "2026-10-09T00:00:00Z"},
{["question"] = "no id"},
{["id"] = "ask:3", ["question"] = "${"x".repeat(600)}", ["askedAt"] = "2026-10-09T00:00:00Z"},
},
}`;
  expect(readAsks(lua)).toEqual([{ id: "ask:1", question: "Where does Thrall live?", askedAt: "2026-10-09T00:00:00Z" }]);
  expect(readAsks(`EverlootDB = {["version"] = "0.2.2", ["installId"] = "abcd-1234", ["records"] = {}}`)).toEqual([]);
});

test("the answers addon matches the golden file the Lua 5.1 test loads", () => {
  const { toc, lua } = renderAnswersAddon([
    { id: "ask:1", answer: "Thrall is the Warchief of the Horde.", source: "warcraft.wiki.gg/wiki/Thrall", answeredAt: "2026-10-09T00:00:00Z" },
    { id: "ask:2", answer: HOSTILE, source: "none", answeredAt: "2026-10-09T00:00:01Z" },
  ]);
  expect(toc).toContain("## Title: Everloot Answers");
  expect(toc).toContain("EverlootAnswers.lua");
  // A Windows checkout may hold the fixture with CRLF; the content is what must match.
  expect(lua).toBe(readFileSync(FIXTURE, "utf8").replace(/\r\n/g, "\n"));
});

test("a search result becomes a short answer with its source line", () => {
  const text = "[lore_page/lore] Thrall\nThrall is a shaman and the Warchief.\nSource: https://warcraft.wiki.gg/wiki/Thrall (CC-BY-SA-4.0, retrieved 2023-11-13)";
  expect(answerFromSearch(text)).toEqual({
    answer: "Thrall is a shaman and the Warchief.",
    source: "https://warcraft.wiki.gg/wiki/Thrall (CC-BY-SA-4.0, retrieved 2023-11-13)",
  });
  expect(answerFromSearch("No results.")).toEqual({ answer: "No sourced answer found.", source: "none" });
});

test("pending asks are answered once and written into the slot addon", async () => {
  const dir = mkdtempSync(join(tmpdir(), "everloot-bridge-"));
  const sv = join(dir, "Everloot.lua");
  writeFileSync(sv, `EverlootDB = {["version"] = "0.2.3", ["installId"] = "abcd-1234-ef56-7890", ["records"] = {},
["asks"] = {{["id"] = "ask:1", ["question"] = "Thrall", ["askedAt"] = "2026-10-09T00:00:00Z"}}}`);
  const engine = { answer: vi.fn(async () => ({ answer: "Warchief.", source: "wiki" })) };
  const store = createAnswerStore(join(dir, "state", "answers.json"));
  const addons = join(dir, "AddOns");
  const first = await answerPending({ svFile: sv, addonsDir: addons, engine, store, now: () => new Date("2026-10-09T00:00:05Z") });
  expect(first).toEqual({ answered: 1, failed: 0 });
  const written = readFileSync(join(addons, "EverlootAnswers", "EverlootAnswers.lua"), "utf8");
  expect(written).toContain('["ask:1"]');
  expect(written).toContain(`["sum"] = ${adler32("Warchief.")}`);
  expect(await answerPending({ svFile: sv, addonsDir: addons, engine, store })).toEqual({ answered: 0, failed: 0 });
  expect(engine.answer).toHaveBeenCalledTimes(1);
});

test("an engine failure is reported to the player, not hidden", async () => {
  const dir = mkdtempSync(join(tmpdir(), "everloot-bridge-"));
  const sv = join(dir, "Everloot.lua");
  writeFileSync(sv, `EverlootDB = {["version"] = "0.2.3", ["installId"] = "abcd-1234-ef56-7890", ["records"] = {},
["asks"] = {{["id"] = "ask:9", ["question"] = "Thrall", ["askedAt"] = "2026-10-09T00:00:00Z"}}}`);
  const engine = { answer: vi.fn(async () => { throw new Error("MCP unavailable"); }) };
  const store = createAnswerStore(join(dir, "answers.json"));
  expect(await answerPending({ svFile: sv, addonsDir: join(dir, "AddOns"), engine, store })).toEqual({ answered: 0, failed: 1 });
  expect(readFileSync(join(dir, "AddOns", "EverlootAnswers", "EverlootAnswers.lua"), "utf8")).toContain("Could not answer: MCP unavailable");
});
