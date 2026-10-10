/**
 * Regenerates addon/tests/fixtures/EverlootAnswers.lua: npx tsx scripts/write-answers-fixture.ts
 * The companion test pins its output to this file; addon/tests/answers_contract.py loads it in Lua 5.1.
 */
import { writeFileSync } from "node:fs";
import { renderAnswersAddon } from "../src/bridge/answers";

export const HOSTILE = 'x"] = 1 } os.execute("calc") --[[\n]]\\\0\r\t';

const { lua } = renderAnswersAddon([
  { id: "ask:1", answer: "Thrall is the Warchief of the Horde.", source: "warcraft.wiki.gg/wiki/Thrall", answeredAt: "2026-10-09T00:00:00Z" },
  { id: "ask:2", answer: HOSTILE, source: "none", answeredAt: "2026-10-09T00:00:01Z" },
]);
writeFileSync(new URL("../../addon/tests/fixtures/EverlootAnswers.lua", import.meta.url), lua);
