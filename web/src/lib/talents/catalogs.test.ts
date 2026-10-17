import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { CatalogError, normalizeCatalog } from "./adapter";
import { TALENT_CLASSES, loadCatalog } from "./catalogs";
import { fixture } from "./fixture";
import { add, isLegal, pointsSpent, remove } from "./rules";
import { decodeBuild, encodeBuild, resolveBuild } from "./share";
import type { Ranks } from "./types";

const dataDir = fileURLToPath(new URL("../../data/talents/", import.meta.url));

describe.each(TALENT_CLASSES)("%s seed data", (slug) => {
  test("is a sound tree", async () => {
    const c = await loadCatalog(slug);
    expect(c.classSlug).toBe(slug);
    expect(c.trees).toHaveLength(3);
    expect(c.source).toMatchObject({ name: "Talents Forever", licence: "CC BY 4.0" });
    expect(c.rules.status).toBe("unconfirmed");
    const ids = c.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const seen = new Set<string>();
    for (const n of c.nodes) {
      const pos = `${n.treeId}:${n.row}:${n.col}`;
      expect(seen.has(pos), pos).toBe(false);
      seen.add(pos);
      expect(n.row).toBeGreaterThanOrEqual(1);
      expect(n.row).toBeLessThanOrEqual(7);
      expect(n.maxRanks).toBeGreaterThanOrEqual(1);
      expect(n.unlock?.pointsInTree ?? 0).toBe(5 * (n.row - 1));
      for (const p of n.prereqs) {
        const need = c.nodes.find((x) => x.id === p)!;
        expect(need.treeId).toBe(n.treeId);
        expect(need.row).toBeLessThanOrEqual(n.row);
      }
    }
  });

  test("a full legal build reaches 51 points, and every point can be given back", async () => {
    const c = await loadCatalog(slug);
    let ranks: Ranks = {};
    // Greedy fill in reading order until the points run out.
    for (let pass = 0; pass < 60 && pointsSpent(ranks) < 51; pass++) {
      for (const n of c.nodes) {
        const next = add(c, ranks, n.id, 51);
        if (next !== ranks) ranks = next;
      }
    }
    expect(pointsSpent(ranks)).toBe(51);
    expect(isLegal(c, ranks)).toBe(true);
    // Give back from the last row first: every step must stay legal and end at nothing.
    const order = [...c.nodes].reverse();
    let guard = 0;
    while (pointsSpent(ranks) > 0 && guard++ < 200) {
      for (const n of order) ranks = remove(c, ranks, n.id);
      expect(isLegal(c, ranks)).toBe(true);
    }
    expect(pointsSpent(ranks)).toBe(0);
  });

  test("a build survives the share code and the tree it came from", async () => {
    const c = await loadCatalog(slug);
    let ranks: Ranks = {};
    for (const n of c.nodes) ranks = add(c, ranks, n.id, 30);
    const decoded = decodeBuild(encodeBuild({ classSlug: c.classSlug, specId: c.specId, build: c.build, ranks }));
    if (!decoded.ok) throw new Error("decode failed");
    const resolved = resolveBuild(c, decoded.build);
    expect(resolved).toEqual({ ok: true, build: { ranks, unknown: [], clamped: [], rejected: [], buildDiffers: false } });
  });
});

describe("licence boundary", () => {
  test("no tooltip text, icon or cost field was imported", () => {
    const files = readdirSync(dataDir).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(9);
    for (const f of files) {
      const text = readFileSync(dataDir + f, "utf8");
      for (const banned of ['"desc"', '"text"', '"icon"', '"cost"', '"classic"', '"ranks"']) {
        expect(text.includes(banned), `${f} has ${banned}`).toBe(false);
      }
    }
  });
});

describe("adapter", () => {
  const base = { classId: 8, specId: 1482, build: "1", trees: [{ id: 1, name: "T" }] };
  const entry = (name: string) => ({ name });

  test("accepts the other source's shape: nodes by id, x/y from zero, max, edges", () => {
    const c = normalizeCatalog({
      ...base,
      nodes: {
        "10": { treeId: 1, x: 0, y: 0, max: 3, entries: [entry("A")] },
        "20": { treeId: 1, x: 1, y: 1, max: 1, entries: [entry("B"), entry("C")], unlock: { pointsInTree: 5 } },
      },
      edges: [{ from: 10, to: 20 }],
    });
    expect(c.nodes).toEqual([
      { id: 10, treeId: 1, row: 1, col: 1, maxRanks: 3, kind: "single", entries: [{ definitionId: null, spellId: null, name: "A" }], prereqs: [] },
      { id: 20, treeId: 1, row: 2, col: 2, maxRanks: 1, kind: "choice", entries: [{ definitionId: null, spellId: null, name: "B" }, { definitionId: null, spellId: null, name: "C" }], prereqs: [10], unlock: { pointsInTree: 5 } },
    ]);
    expect(c.rules.status).toBe("unconfirmed");
  });

  test("passes our own shape through unchanged", () => {
    expect(normalizeCatalog(fixture)).toEqual(fixture);
  });

  test("refuses a broken catalog", () => {
    const node = { treeId: 1, row: 1, col: 1, maxRanks: 1, entries: [entry("A")] };
    expect(() => normalizeCatalog({ ...base, nodes: [{ ...node, id: 1 }, { ...node, id: 1, col: 2 }] })).toThrow(CatalogError);
    expect(() => normalizeCatalog({ ...base, nodes: [{ ...node, id: 1, prereqs: [99] }] })).toThrow(/not in the catalog/);
    expect(() => normalizeCatalog({ ...base, nodes: [{ ...node, id: 1, treeId: 7 }] })).toThrow(/no known tree/);
    expect(() => normalizeCatalog({ ...base, nodes: [{ ...node, id: 1, kind: "choice" }] })).toThrow(/fewer than two/);
    expect(() => normalizeCatalog({ ...base, nodes: [{ id: 1, treeId: 1, entries: [entry("A")] }] })).toThrow(/no position/);
    expect(() => normalizeCatalog({ nope: true })).toThrow(CatalogError);
  });
});
