import type { TalentCatalog, TalentNode } from "./types";

// A small made-up tree for tests. Not game data. Two trees, rows gated by points in the tree above,
// one prerequisite, one choice node, a gate of exactly 16 points, and a gate on points anywhere.

const single = (id: number, treeId: number, row: number, col: number, maxRanks: number, extra: Partial<TalentNode> = {}): TalentNode => ({
  id, treeId, row, col, maxRanks, kind: "single",
  entries: [{ definitionId: null, spellId: null, name: `Talent ${id}` }],
  prereqs: [],
  ...extra,
});

export const fixture: TalentCatalog = {
  classId: 8,
  classSlug: "mage",
  className: "Mage",
  specId: 1482,
  build: "1.0.0.1",
  source: { name: "Fixture", url: "https://example.test/", licence: "none", licenceUrl: "https://example.test/", retrieved: "2026-10-17", kind: "test data" },
  rules: { firstPointLevel: 10, maxLevel: 60, dualSpecLevel: 40, status: "unconfirmed", note: "test" },
  trees: [{ id: 1, name: "Left" }, { id: 2, name: "Right" }],
  nodes: [
    // Left: rows 1 to 4. Row 2 opens at 5 points above, row 3 at 10, row 4 at 16.
    single(11, 1, 1, 1, 5),
    single(12, 1, 1, 2, 5),
    single(21, 1, 2, 1, 5, { unlock: { pointsInTree: 5 } }),
    single(22, 1, 2, 2, 1, { unlock: { pointsInTree: 5 }, prereqs: [12] }),
    single(31, 1, 3, 1, 5, { unlock: { pointsInTree: 10 } }),
    { ...single(32, 1, 3, 2, 1, { unlock: { pointsInTree: 10 } }), kind: "choice", entries: [
      { definitionId: null, spellId: null, name: "Choice A" },
      { definitionId: null, spellId: null, name: "Choice B" },
    ] },
    single(41, 1, 4, 1, 1, { unlock: { pointsInTree: 16 } }),
    // Right: one open node and one that wants 6 points spent anywhere else.
    single(51, 2, 1, 1, 5),
    single(52, 2, 2, 1, 1, { unlock: { pointsTotal: 6 } }),
  ],
};
