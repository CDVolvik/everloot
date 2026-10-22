import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { addRecheckScopes, readRecheck, RECHECK_FILE, scopesFromClientDiff, scopesFromEntry } from "../src/build-watch/recheck.js";
import type { TableDiff } from "../src/client-diff.js";

const dirs: string[] = [];
const scratch = () => { const d = mkdtempSync(join(tmpdir(), "recheck-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const entry = (mapChanges: { kind: "continent" | "zone" | "entrance"; id: number; change: string }[] | null) => ({
  id: "wow_classic_beta-70500", detectedAt: "2026-11-02T10:00:00.000Z",
  mapChanges: mapChanges && mapChanges.map((c) => ({ ...c, name: "x", spoiler: false })),
});

test("moved or removed zones put their pins and entrances to recheck; a moved entrance its own", () => {
  const scopes = scopesFromEntry(entry([
    { kind: "zone", id: 1429, change: "bounds 1,2,3,4 -> 1,2,3,5" },
    { kind: "zone", id: 1460, change: "added" },
    { kind: "zone", id: 1411, change: "removed" },
    { kind: "entrance", id: 36, change: "position 0:1,2 -> 0:1,3" },
    { kind: "continent", id: 0, change: "bounds" },
  ]));
  expect(scopes).toEqual([
    { since: "2026-11-02T10:00:00.000Z", source: "build-watch wow_classic_beta-70500", type: "pins", zones: [1411, 1429] },
    { since: "2026-11-02T10:00:00.000Z", source: "build-watch wow_classic_beta-70500", type: "entrances", zones: [1411, 1429] },
    { since: "2026-11-02T10:00:00.000Z", source: "build-watch wow_classic_beta-70500", type: "entrances", ids: [36] },
  ]);
  expect(scopesFromEntry(entry(null))).toEqual([]);
  expect(scopesFromEntry(entry([{ kind: "zone", id: 1460, change: "added" }]))).toEqual([]);
});

test("a client diff's changed and removed QuestV2 rows and changed UiMap rows become scopes", () => {
  const table = (name: string, changed: number[], removed: number[] = []): TableDiff => ({
    table: name, added: [999], removed, changed: changed.map((id) => ({ id, fields: [] })), schema: { addedFields: [], removedFields: [] },
  });
  const scopes = scopesFromClientDiff({ tables: [table("QuestV2", [783, 7], [12]), table("UiMap", [1429]), table("Item", [25])] }, { since: "2026-11-02T10:00:00Z", source: "build 70500" });
  expect(scopes).toEqual([
    { since: "2026-11-02T10:00:00.000Z", source: "build 70500", type: "quests", ids: [7, 12, 783] },
    { since: "2026-11-02T10:00:00.000Z", source: "build 70500", type: "pins", zones: [1429] },
  ]);
});

test("adding scopes writes the file once and a rerun changes nothing", () => {
  const root = scratch();
  const scopes = scopesFromEntry(entry([{ kind: "zone", id: 1429, change: "removed" }]));
  expect(readRecheck(root).scopes).toEqual([]);
  expect(addRecheckScopes(root, root, scopes)).toBe(true);
  const first = readFileSync(join(root, RECHECK_FILE), "utf8");
  expect(addRecheckScopes(root, root, scopes)).toBe(false);
  expect(readFileSync(join(root, RECHECK_FILE), "utf8")).toBe(first);
  expect(readRecheck(root).scopes).toHaveLength(2);
});

test("a dry run reads the repository's file and writes the scratch tree", () => {
  const repo = scratch(), tree = scratch();
  addRecheckScopes(repo, repo, scopesFromEntry(entry([{ kind: "entrance", id: 36, change: "removed" }])));
  expect(addRecheckScopes(repo, tree, scopesFromEntry(entry([{ kind: "zone", id: 1429, change: "removed" }])))).toBe(true);
  expect(readRecheck(repo).scopes).toHaveLength(1);
  expect(readRecheck(tree).scopes).toHaveLength(3);
});

test("the committed recheck file is valid", () => {
  expect(readRecheck(join(import.meta.dirname, "..", "..")).schema).toBe("everloot.recheck/1");
});
