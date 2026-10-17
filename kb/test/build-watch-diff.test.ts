import { describe, expect, it } from "vitest";
import { buildChangeEntry, diffTalents } from "../src/build-watch/diff.js";
import { ChangeEntry, hasChanges } from "../src/build-watch/changes.js";
import { GameDataManifest, toCommitted } from "../src/build-watch/game-data.js";
import { prBody, terminalSummary } from "../src/build-watch/render.js";
import { catalog, CONFIG_A, node, raid, stamp } from "./build-watch-fixtures.js";

const committed = (nodes: ReturnType<typeof node>[], over = {}) => [toCommitted(catalog(1, nodes, over))];

describe("diffTalents", () => {
  const base = [node(1, "Mutilate"), node(2, "Evasion"), node(3, "Vigor")];

  it("reports nothing for identical catalogs", () => {
    const d = diffTalents(committed(base), committed(base), false);
    expect(Object.values(d).flat()).toEqual([]);
  });

  it("finds added and removed talents", () => {
    const d = diffTalents(committed(base), committed([base[0], base[1], node(4, "Riposte", { maxRanks: 3, kind: "tiered" })]), false);
    expect(d.added.map((a) => [a.name, a.kind, a.maxRanks])).toEqual([["Riposte", "tiered", 3]]);
    expect(d.removed.map((r) => r.name)).toEqual(["Vigor"]);
  });

  it("finds moved talents, including to another tree", () => {
    const moved = [{ ...base[0], x: 5000, row: 2, col: 3 }, base[1], base[2]];
    const d = diffTalents(committed(base), committed(moved), false);
    expect(d.moved).toHaveLength(1);
    expect(d.moved[0]).toMatchObject({ name: "Mutilate", from: { x: 1001, row: 0 }, to: { x: 5000, row: 2, col: 3 } });
  });

  it("does not call a talent moved when only its derived row and column shifted", () => {
    const shifted = [{ ...base[0], row: 4, col: 4 }, base[1], base[2]];
    expect(diffTalents(committed(base), committed(shifted), false).moved).toEqual([]);
  });

  it("finds rank, gate and prerequisite changes", () => {
    const next = [
      { ...base[0], maxRanks: 2 },
      { ...base[1], unlock: { pointsInTree: 5 } },
      { ...base[2], prereqs: [{ nodeId: 1, rule: "all" as const }] },
    ];
    const d = diffTalents(committed(base), committed(next), false);
    expect(d.ranks).toMatchObject([{ name: "Mutilate", before: 1, after: 2 }]);
    expect(d.gates).toMatchObject([{ name: "Evasion", before: {}, after: { pointsInTree: 5 } }]);
    expect(d.prereqs).toMatchObject([{ name: "Vigor", before: [], after: [{ nodeId: 1, rule: "all" }] }]);
  });

  it("ignores the order prerequisites are listed in", () => {
    const a = [{ ...base[0], prereqs: [{ nodeId: 2, rule: "any" as const }, { nodeId: 3, rule: "any" as const }] }];
    const b = [{ ...base[0], prereqs: [{ nodeId: 3, rule: "any" as const }, { nodeId: 2, rule: "any" as const }] }];
    expect(diffTalents(committed(a), committed(b), false).prereqs).toEqual([]);
  });

  it("reports a talent swapped for another spell, not as a value change", () => {
    const swapped = node(1, "Mutilate 2", {});
    swapped.entries[0].spellId = 999;
    const d = diffTalents(committed(base), committed([swapped, base[1], base[2]]), false);
    expect(d.replaced).toMatchObject([{ nodeId: 1, before: [101], after: [999] }]);
    expect(d.spellValues).toEqual([]);
  });

  it("reports spell value changes and tooltip changes without storing tooltip text", () => {
    const next = [node(1, "Mutilate"), node(2, "Evasion"), node(3, "Vigor")];
    next[0].entries[0].effects[0].basePoints = 8;
    next[0].entries[0].durationMs = 6000;
    next[1].entries[0].description = "Evasion tooltip, reworded";
    const d = diffTalents(committed(base), committed(next), false);
    const byName = Object.fromEntries(d.spellValues.map((s) => [s.name, s.changes]));
    expect(byName.Mutilate).toEqual([
      { field: "durationMs", before: null, after: 6000 },
      { field: "effect 1 basePoints", before: 5, after: 8 },
    ]);
    expect(byName.Evasion).toHaveLength(1);
    expect(byName.Evasion[0].field).toBe("text");
    expect(JSON.stringify(d)).not.toContain("reworded");
  });

  it("reports classes and talent point levels", () => {
    const other = toCommitted(catalog(2, [node(9, "Bash")], { classId: 11, className: "Druid" }));
    const d = diffTalents(committed(base), [...committed(base, { pointLevels: [10, 11] }), other], false);
    expect(d.classesAdded).toEqual(["Druid"]);
    expect(d.pointLevels).toMatchObject([{ className: "Rogue", before: [10, 11, 12], after: [10, 11] }]);
    expect(diffTalents([...committed(base), other], committed(base), false).classesRemoved).toEqual(["Druid"]);
  });

  it("flags every item as a spoiler for a build that is not live", () => {
    const next = [{ ...base[0], maxRanks: 3 }, node(4, "New")];
    const d = diffTalents(committed(base), committed(next), true);
    expect([...d.added, ...d.ranks, ...d.removed].every((i) => i.spoiler)).toBe(true);
    expect(diffTalents(committed(base), committed(next), false).added[0].spoiler).toBe(false);
  });
});

describe("buildChangeEntry", () => {
  const manifest = (buildId: number, config = CONFIG_A) => GameDataManifest.parse({
    schema: "everloot.game-data/1", label: "found in game files, unconfirmed", build: stamp(buildId, config),
    classes: [{ classId: 4, className: "Rogue", file: "rogue.json" }], tables: [], warnings: [],
  });
  const input = (over = {}) => ({
    product: "wow_classic_beta", live: false, detectedAt: "2026-10-17T10:00:00.000Z",
    build: { version: "1.60.1.2", buildId: 2, buildConfig: CONFIG_A }, manifest: manifest(2),
    classes: committed([node(1, "Mutilate")]), raidBuffs: raid(2, "raid"),
    committed: { manifest: manifest(1), classes: committed([node(1, "Mutilate"), node(2, "Evasion")]) },
    raidBaseline: raid(1, "party"),
    encryptedTables: [{ table: "Spell", blocks: 29 }, { table: "SpellName", blocks: 14 }, { table: "Item", blocks: 0 }],
    warnings: [], ...over,
  });

  it("builds a valid entry with talent and raid buff changes", () => {
    const entry = buildChangeEntry(input());
    expect(() => ChangeEntry.parse(entry)).not.toThrow();
    expect(entry).toMatchObject({ id: "wow_classic_beta-2", initial: false, spoiler: true, previous: { buildId: 1 } });
    expect(entry.talents!.removed.map((r) => r.name)).toEqual(["Evasion"]);
    expect(entry.raidBuffs).toMatchObject({ comparedTo: { buildId: 1 }, scopeChanges: [{ id: "battle-shout", before: "party", after: "raid", spoiler: true }] });
    expect(entry.encryptedBlocks).toEqual({ total: 43, tables: [{ table: "Spell", blocks: 29 }, { table: "SpellName", blocks: 14 }] });
    expect(hasChanges(entry)).toBe(true);
  });

  it("records a baseline when nothing is committed yet", () => {
    const entry = buildChangeEntry(input({ committed: null, raidBaseline: null }));
    expect(entry).toMatchObject({ initial: true, previous: null, talents: null, raidBuffs: { comparedTo: null, scopeChanges: [] } });
    expect(hasChanges(entry)).toBe(false);
  });

  it("is not a spoiler when the product is live", () => {
    const entry = buildChangeEntry(input({ live: true }));
    expect(entry.spoiler).toBe(false);
    expect(entry.raidBuffs!.scopeChanges[0].spoiler).toBe(false);
  });

  it("warns when the table definitions changed between the two builds", () => {
    const m = manifest(2);
    m.build.definitions = "ffffffffffff";
    expect(buildChangeEntry(input({ manifest: m })).warnings.join(" ")).toContain("definitions differ");
  });
});

describe("rendering", () => {
  const manifest = GameDataManifest.parse({
    schema: "everloot.game-data/1", label: "found in game files, unconfirmed", build: stamp(2),
    classes: [{ classId: 4, className: "Rogue", file: "rogue.json" }], tables: [], warnings: [],
  });
  const make = (next: ReturnType<typeof node>[]) => buildChangeEntry({
    product: "wow_classic_beta", live: false, detectedAt: "2026-10-17T10:00:00.000Z",
    build: { version: "1.60.1.2", buildId: 2, buildConfig: CONFIG_A }, manifest, classes: committed(next), raidBuffs: raid(2, "raid"),
    committed: { manifest, classes: committed([node(1, "Mutilate")]) }, raidBaseline: raid(1, "party"),
    encryptedTables: [{ table: "Spell", blocks: 29 }], warnings: [],
  });

  it("puts the build, spoiler notice, encrypted blocks and each change in the body", () => {
    const entry = make([{ ...node(1, "Mutilate"), maxRanks: 4 }, node(5, "Shadowstep")]);
    const body = prBody(entry, { supersedes: [31], classes: 1, nodes: 2 });
    expect(body).toContain("build=2");
    expect(body).toContain("**Spoiler.**");
    expect(body).toContain("Encrypted blocks skipped, never decrypted: 29 (Spell 29)");
    expect(body).toContain("[spoiler] Rogue / Assassination: Shadowstep (single, 1 rank)");
    expect(body).toContain("Mutilate: 1 -> 4 ranks");
    expect(body).toContain("Battle Shout: party -> raid");
    expect(body).toContain("#31");
    expect(body).toContain("blue tracker");
  });

  it("cannot be turned into a mention, link or html by a spell name", () => {
    const body = prBody(make([node(1, "Mutilate"), node(7, "@everyone <img src=x> [a](http://b)")]), { supersedes: [], classes: 1, nodes: 2 });
    expect(body).not.toMatch(/@everyone|<img|\[a\]/);
  });

  it("caps long lists and stays under GitHub's body limit", () => {
    const many = Array.from({ length: 3000 }, (_, i) => node(100 + i, `Talent number ${i} with a fairly long name to use up room`));
    const body = prBody(make([node(1, "Mutilate"), ...many]), { supersedes: [], classes: 1, nodes: 3001 });
    expect(body).toContain("and 2960 more in the JSON entry");
    expect(body.length).toBeLessThan(65_000);
  });

  it("says plainly when nothing changed", () => {
    const entry = make([node(1, "Mutilate")]);
    entry.raidBuffs!.scopeChanges = [];
    expect(prBody(entry, { supersedes: [], classes: 1, nodes: 1 })).toContain("No differences");
  });

  it("gives a terminal summary with counts", () => {
    const text = terminalSummary(make([node(1, "Mutilate"), node(5, "Shadowstep")]));
    expect(text).toContain("wow_classic_beta 1.60.1.2");
    expect(text).toContain("Talents added: 1");
    expect(text).toContain("encrypted blocks skipped: 29");
  });
});
