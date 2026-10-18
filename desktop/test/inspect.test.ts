import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { confirmedCounts, summarizeFiles, summarizeSavedVariables } from "../src/main/inspect";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-inspect-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const SV = `EverlootDB = { ["version"] = "0.3.3", ["installId"] = "inst-1", ["clientBuild"] = "1.60.1.70450",
  ["records"] = { ["loot"] = { { ["sourceNpcId"] = 7, ["items"] = {} }, { ["sourceNpcId"] = 8, ["items"] = {} } }, ["npc_sighting"] = { { ["npcId"] = 1 } } },
  ["asks"] = { { ["id"] = "ask:inst-1:1", ["question"] = "what drops bindings", ["askedAt"] = "2026-10-18T00:00:00Z" } },
  ["lastScans"] = { ["Nightslayer"] = { ["at"] = "2026-10-18T00:00:00Z" } } }`;

test("a file summary counts records per kind, asks, scan realms and confirmed events, and never includes the records", () => {
  const s = summarizeSavedVariables(SV, (id) => (id === "inst-1" ? 5 : 0));
  expect(s).toMatchObject({ ok: true, addonVersion: "0.3.3", clientBuild: "1.60.1.70450", records: 3, confirmed: 5, pendingAsks: 1, scanRealms: ["Nightslayer"] });
  expect(s.kinds).toEqual([{ kind: "loot", count: 2 }, { kind: "npc_sighting", count: 1 }]);
  expect(JSON.stringify(s)).not.toContain("sourceNpcId");
});

test("a damaged file reports the parser's reason instead of counts", () => {
  const s = summarizeSavedVariables("EverlootDB = { version = ", () => 0);
  expect(s.ok).toBe(false);
  expect(s.error).toBeTruthy();
  expect(s.kinds).toEqual([]);
});

test("confirmed counts come from sent.json per install; a missing or damaged file counts nothing", () => {
  const d = dir();
  const sent = join(d, "sent.json");
  expect(confirmedCounts(sent)("inst-1")).toBe(0);
  writeFileSync(sent, JSON.stringify({ "inst-1": ["a", "b"], other: 3 }));
  expect(confirmedCounts(sent)("inst-1")).toBe(2);
  expect(confirmedCounts(sent)("other")).toBe(0);
  writeFileSync(sent, "{nope");
  expect(confirmedCounts(sent)("inst-1")).toBe(0);
});

test("summaries carry the file's size and write time, and a missing file is an error row", () => {
  const d = dir();
  const sv = join(d, "Everloot.lua");
  writeFileSync(sv, SV);
  const [ok, missing] = summarizeFiles([sv, join(d, "none.lua")], join(d, "sent.json"));
  expect(ok).toMatchObject({ file: sv, ok: true, bytes: SV.length });
  expect(ok.writtenAt).toMatch(/^\d{4}-/);
  expect(missing).toMatchObject({ ok: false, bytes: 0 });
  expect(missing.error).toBeTruthy();
});
