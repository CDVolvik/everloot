import { expect, test } from "vitest";
import { buildTalentCatalog, type Row, type Rows, type TableReader } from "../src/talents/build-catalog.js";
import { ClassCatalog, type BuildStamp } from "../src/talents/catalog.js";

const build: BuildStamp = { product: "wow_classic_beta", buildId: 70450, version: "1.60.1.70450", buildConfig: "b".repeat(32), definitions: "abc1234", extractedAt: "2026-10-17T00:00:00.000Z" };
const t = (rows: Row[]): Rows => new Map(rows.map((r, i) => [typeof r.ID === "number" ? r.ID : i + 1, r]));

/**
 * One made-up class (id 1, "Warrior") with a made-up trait tree 900 and two talent trees ("Alpha", "Beta").
 * Alpha has a first row with a single talent, a second row gated at 5 points that holds a choice node,
 * and a tiered node. Beta has one node. Ids and numbers are invented; none are from a real build.
 */
function fixture(extra: Partial<Record<string, Rows>> = {}): TableReader {
  const tables: Record<string, Rows> = {
    ChrClasses: t([{ ID: 1, Name_lang: "Warrior" }, { ID: 2, Name_lang: "Paladin" }]),
    ChrSpecialization: t([{ ID: 77, ClassID: 1, OrderIndex: 0 }]),
    SkillLine: t([{ ID: 10, DisplayName_lang: "Alpha" }, { ID: 11, DisplayName_lang: "Beta" }]),
    SkillRaceClassInfo: t([{ ID: 1, SkillID: 10, ClassMask: 1 }, { ID: 2, SkillID: 99, ClassMask: 3 }]),
    SkillLineXTraitTree: t([{ ID: 1, SkillLineID: 10, TraitTreeID: 900 }]),
    TraitTree: t([{ ID: 900 }, { ID: 901 }]),
    TraitNodeGroupDisplayInfo: t([
      { ID: 1, TraitNodeGroupID: 500, SkillLineID: 10, OrderIndex: 0, TraitTreeID: 900 },
      { ID: 2, TraitNodeGroupID: 501, SkillLineID: 11, OrderIndex: 1, TraitTreeID: 900 },
    ]),
    // 500 and 501 are the talent trees; 502 is the row gate group; the nodes of 500 are 1, 2, 3.
    TraitNodeGroupXTraitNode: t([
      { TraitNodeGroupID: 500, TraitNodeID: 1 }, { TraitNodeGroupID: 500, TraitNodeID: 2 }, { TraitNodeGroupID: 500, TraitNodeID: 3 },
      { TraitNodeGroupID: 501, TraitNodeID: 4 },
      { TraitNodeGroupID: 502, TraitNodeID: 2 }, { TraitNodeGroupID: 502, TraitNodeID: 3 },
      { TraitNodeGroupID: 503, TraitNodeID: 1 }, // companion: the nodes above the gated row
    ]),
    TraitNode: t([
      { ID: 1, TraitTreeID: 900, PosX: 1000, PosY: 2000, Type: 0 },
      { ID: 2, TraitTreeID: 900, PosX: 1000, PosY: 2600, Type: 2 },
      { ID: 3, TraitTreeID: 900, PosX: 1610, PosY: 2610, Type: 1 },
      { ID: 4, TraitTreeID: 900, PosX: 5000, PosY: 2000, Type: 0 },
    ]),
    TraitNodeXTraitNodeEntry: t([
      { TraitNodeID: 1, TraitNodeEntryID: 11, Index: 0 },
      { TraitNodeID: 2, TraitNodeEntryID: 22, Index: 1 }, { TraitNodeID: 2, TraitNodeEntryID: 21, Index: 0 },
      { TraitNodeID: 3, TraitNodeEntryID: 31, Index: 0 }, { TraitNodeID: 3, TraitNodeEntryID: 32, Index: 1 },
      { TraitNodeID: 4, TraitNodeEntryID: 41, Index: 0 },
    ]),
    TraitNodeEntry: t([
      { ID: 11, TraitDefinitionID: 111, MaxRanks: 3 }, { ID: 21, TraitDefinitionID: 121, MaxRanks: 1 }, { ID: 22, TraitDefinitionID: 122, MaxRanks: 1 },
      { ID: 31, TraitDefinitionID: 131, MaxRanks: 2 }, { ID: 32, TraitDefinitionID: 132, MaxRanks: 1 }, { ID: 41, TraitDefinitionID: 141, MaxRanks: 1 },
    ]),
    TraitDefinition: t([
      { ID: 111, SpellID: 1001 }, { ID: 121, SpellID: 1002 }, { ID: 122, SpellID: 1003 },
      { ID: 131, SpellID: 1004 }, { ID: 132, SpellID: 1005 }, { ID: 141, SpellID: 1006 },
    ]),
    // 1006 has no name row: its name sits in an encrypted block.
    SpellName: t([1001, 1002, 1003, 1004, 1005].map((id) => ({ ID: id, Name_lang: `Spell ${id}` }))),
    TraitEdge: t([
      { ID: 1, LeftTraitNodeID: 1, RightTraitNodeID: 2, Type: 2 },
      { ID: 2, LeftTraitNodeID: 1, RightTraitNodeID: 3, Type: 3 },
      { ID: 3, LeftTraitNodeID: 2, RightTraitNodeID: 3, Type: 0 },
      { ID: 4, LeftTraitNodeID: 1, RightTraitNodeID: 4, Type: 2 }, // across trees: left out
      { ID: 5, LeftTraitNodeID: 1, RightTraitNodeID: 3, Type: 1 }, // deprecated type: left out
    ]),
    TraitCond: t([
      { ID: 70, CondType: 0, TraitTreeID: 900, TraitNodeGroupID: 502, TraitNodeID: 0, TraitCurrencyID: 3000, SpentAmountRequired: 5 },
      { ID: 71, CondType: 0, TraitTreeID: 900, TraitNodeGroupID: 0, TraitNodeID: 1, SpentAmountRequired: 2 },
    ]),
    TraitNodeGroupXTraitCond: t([{ TraitCondID: 70, TraitNodeGroupID: 502 }]),
    TraitNodeXTraitCond: t([{ TraitCondID: 71, TraitNodeID: 3 }]),
    TraitTreeXTraitCurrency: t([{ ID: 1, TraitTreeID: 900, TraitCurrencyID: 3000, Index: 0 }]),
    TraitCurrencySource: t([
      { TraitCurrencyID: 3000, PlayerLevel: 11, Amount: 1, TraitNodeEntryID: 0 },
      { TraitCurrencyID: 3000, PlayerLevel: 10, Amount: 1, TraitNodeEntryID: 0 },
      { TraitCurrencyID: 3000, PlayerLevel: 5, Amount: 1, TraitNodeEntryID: 11 }, // granted with a node, not a level point
      { TraitCurrencyID: 3001, PlayerLevel: 12, Amount: 1, TraitNodeEntryID: 0 }, // another currency
      { TraitCurrencyID: 3000, PlayerLevel: 13, Amount: 0, TraitNodeEntryID: 0 }, // gives nothing
    ]),
    ...extra,
  };
  return (name) => tables[name];
}

const run = (extra?: Partial<Record<string, Rows>>) => buildTalentCatalog({ get: fixture(extra), build, tables: [] });

test("a class is found through its skill line and class mask, with its spec id and trees in client order", () => {
  const { classes, index } = run();
  expect(classes).toHaveLength(1);
  const c = classes[0];
  expect(c).toMatchObject({ classId: 1, className: "Warrior", specId: 77, traitTreeId: 900, label: "found in game files, unconfirmed", build });
  expect(c.trees.map((x) => [x.id, x.name, x.skillLineId, x.order, x.nodes.map((n) => n.id)])).toEqual([
    [500, "Alpha", 10, 0, [1, 2, 3]],
    [501, "Beta", 11, 1, [4]],
  ]);
  expect(index.classes).toEqual([{ classId: 1, className: "Warrior", file: "warrior.json", trees: 2, nodes: 4 }]);
  expect(index.otherTraitTrees).toEqual([901]);
});

test("every class document passes its own schema", () => {
  for (const c of run().classes) expect(() => ClassCatalog.parse(c)).not.toThrow();
});

test("node kind, ranks and entries follow the node type, entry order and entry ranks", () => {
  const nodes = run().classes[0].trees[0].nodes;
  expect(nodes[0]).toMatchObject({ kind: "single", maxRanks: 3, entries: [{ definitionId: 111, spellId: 1001, name: "Spell 1001", maxRanks: 3 }] });
  expect(nodes[1]).toMatchObject({ kind: "choice", maxRanks: 1 });
  expect(nodes[1].entries.map((e) => e.spellId)).toEqual([1002, 1003]);
  expect(nodes[2]).toMatchObject({ kind: "tiered", maxRanks: 3 });
});

test("a spell whose name is not in the table gets a null name, not an invented one", () => {
  expect(run().classes[0].trees[1].nodes[0].entries[0]).toMatchObject({ spellId: 1006, name: null });
});

const gate = { amount: 5, gateGroupId: 502, currencyId: 3000, traitTreeId: 900 };

test("a row gate comes from the smaller group a node also belongs to, and names its currency and class tree; the tree group itself is no gate", () => {
  const nodes = run().classes[0].trees[0].nodes;
  expect(nodes[0].unlock).toEqual({});
  expect(nodes[1].unlock).toEqual({ spentRequired: { ...gate, scope: "tree", companionGroupId: 503 } });
  expect(nodes[2].unlock).toEqual({ spentRequired: { ...gate, scope: "tree", companionGroupId: 503 }, ranksInNodes: [{ nodeId: 1, ranks: 2 }] });
});

const withoutCompanion = (): Rows => t([
  { TraitNodeGroupID: 500, TraitNodeID: 1 }, { TraitNodeGroupID: 500, TraitNodeID: 2 }, { TraitNodeGroupID: 500, TraitNodeID: 3 },
  { TraitNodeGroupID: 501, TraitNodeID: 4 }, { TraitNodeGroupID: 502, TraitNodeID: 2 }, { TraitNodeGroupID: 502, TraitNodeID: 3 },
]);

test("the gate scope is unconfirmed when no group matches the nodes above the row, and class when the group spans every talent tree", () => {
  expect(run({ TraitNodeGroupXTraitNode: withoutCompanion() }).classes[0].trees[0].nodes[1].unlock.spentRequired).toMatchObject({ amount: 5, scope: "unconfirmed" });
  const spanning = t([...withoutCompanion().values(), { TraitNodeGroupID: 504, TraitNodeID: 1 }, { TraitNodeGroupID: 504, TraitNodeID: 4 }]);
  expect(run({ TraitNodeGroupXTraitNode: spanning }).classes[0].trees[0].nodes[1].unlock.spentRequired).toMatchObject({ scope: "class", companionGroupId: 504 });
});

test("a node under several conditions on other nodes keeps every one of them", () => {
  const nodes = run({
    TraitCond: t([
      { ID: 70, CondType: 0, TraitTreeID: 900, TraitNodeGroupID: 502, TraitNodeID: 0, TraitCurrencyID: 3000, SpentAmountRequired: 5 },
      { ID: 71, CondType: 0, TraitTreeID: 900, TraitNodeGroupID: 0, TraitNodeID: 1, TraitCurrencyID: 3000, SpentAmountRequired: 2 },
      { ID: 72, CondType: 0, TraitTreeID: 900, TraitNodeGroupID: 0, TraitNodeID: 2, TraitCurrencyID: 3000, SpentAmountRequired: 1 },
    ]),
    TraitNodeXTraitCond: t([{ TraitCondID: 71, TraitNodeID: 3 }, { TraitCondID: 72, TraitNodeID: 3 }]),
  }).classes[0].trees[0].nodes;
  expect(nodes[2].unlock.ranksInNodes).toEqual([{ nodeId: 1, ranks: 2 }, { nodeId: 2, ranks: 1 }]);
});

test("edges: required and sufficient ones become prereqs, visual ones do not, and stray edges are left out and counted", () => {
  const { classes, index } = run();
  const tree = classes[0].trees[0];
  expect(tree.edges).toEqual([
    { from: 1, to: 2, type: "sufficient" },
    { from: 1, to: 3, type: "required" },
    { from: 2, to: 3, type: "visual" },
  ]);
  expect(tree.nodes[1].prereqs).toEqual([{ nodeId: 1, rule: "any" }]);
  expect(tree.nodes[2].prereqs).toEqual([{ nodeId: 1, rule: "all" }]);
  expect(index.warnings).toEqual([
    "1 edges left out: a type that is deprecated in WoWDBDefs or that this extractor does not know",
    "1 edges left out: they lead to a node outside the tree",
  ]);
});

test("rows and columns are cells of the tree's grid, so a small offset stays in the same row or column", () => {
  const nodes = run().classes[0].trees[0].nodes;
  expect(nodes.map((n) => [n.id, n.row, n.col])).toEqual([[1, 0, 0], [2, 1, 0], [3, 1, 1]]);
  expect(nodes[2]).toMatchObject({ x: 1610, y: 2610 });
});

test("point levels list the level of each point, from level sources that give points, in the class tree's first currency", () => {
  const c = run().classes[0];
  expect(c.pointLevels).toEqual([10, 11]);
  expect(c.pointCurrencyId).toBe(3000);
  const swapped = run({ TraitTreeXTraitCurrency: t([
    { ID: 1, TraitTreeID: 900, TraitCurrencyID: 3001, Index: 1 },
    { ID: 2, TraitTreeID: 900, TraitCurrencyID: 3000, Index: 0 },
  ]) }).classes[0];
  expect(swapped).toMatchObject({ pointCurrencyId: 3000, pointLevels: [10, 11] });
  expect(swapped.warnings[0]).toContain("2 currencies are listed");
});

test("a skill line shared by several classes maps to no class and is reported, not guessed", () => {
  const { classes, index } = run({ SkillRaceClassInfo: t([{ ID: 2, SkillID: 10, ClassMask: 3 }]) });
  expect(classes).toEqual([]);
  expect(index.warnings[0]).toContain("does not map to exactly one class");
});

test("a build with no talent tables gives an empty catalog with a warning for every missing table, not a quiet one", () => {
  const { classes, index } = buildTalentCatalog({ get: (n) => (n === "ChrClasses" ? t([{ ID: 1, Name_lang: "Warrior" }]) : undefined), build, tables: [] });
  expect(classes).toEqual([]);
  expect(index.classes).toEqual([]);
  expect(index.warnings).toContain("required table TraitNode is not in this snapshot");
  expect(index.warnings).toContain("required table SkillLineXTraitTree is not in this snapshot");
  expect(index.warnings).toContain("no class talent trees were found in this snapshot");
});

test("a required table with no rows is reported too", () => {
  expect(run({ TraitEdge: t([]) }).index.warnings).toContain("required table TraitEdge has no rows");
});

/**
 * One made-up class with one talent tree of nodes at the given positions, each with the given spell.
 * Grid origin is offset (x 20 mod 600), as it is in the real tables.
 */
function gridClass(nodes: { id: number; x: number; y: number; spell: number }[]) {
  const tables: Record<string, Rows> = {
    ChrClasses: t([{ ID: 1, Name_lang: "Warrior" }]),
    SkillLine: t([{ ID: 10, DisplayName_lang: "Alpha" }]),
    SkillRaceClassInfo: t([{ ID: 1, SkillID: 10, ClassMask: 1 }]),
    SkillLineXTraitTree: t([{ ID: 1, SkillLineID: 10, TraitTreeID: 900 }]),
    TraitNodeGroupDisplayInfo: t([{ ID: 1, TraitNodeGroupID: 500, SkillLineID: 10, OrderIndex: 0, TraitTreeID: 900 }]),
    TraitNodeGroupXTraitNode: t(nodes.map((n) => ({ TraitNodeGroupID: 500, TraitNodeID: n.id }))),
    TraitNode: t(nodes.map((n) => ({ ID: n.id, TraitTreeID: 900, PosX: n.x, PosY: n.y, Type: 0 }))),
    TraitNodeXTraitNodeEntry: t(nodes.map((n) => ({ TraitNodeID: n.id, TraitNodeEntryID: n.id + 1000, Index: 0 }))),
    TraitNodeEntry: t(nodes.map((n) => ({ ID: n.id + 1000, TraitDefinitionID: n.id + 2000, MaxRanks: 1 }))),
    TraitDefinition: t(nodes.map((n) => ({ ID: n.id + 2000, SpellID: n.spell }))),
  };
  return buildTalentCatalog({ get: (n) => tables[n], build, tables: [] }).classes[0];
}

/** A 3 by 3 block of nodes on a grid whose origin is x 420, y 330 (as in the real tables), spells 1 to 9. */
const block = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, x: 1020 + (i % 3) * 600, y: 2130 + Math.floor(i / 3) * 600, spell: i + 1 }));

test("rows and columns start at 0 whatever the grid's offset, and the stored position is kept", () => {
  const nodes = gridClass(block).trees[0].nodes;
  expect(nodes.map((n) => [n.id, n.row, n.col])).toEqual([[1, 0, 0], [2, 0, 1], [3, 0, 2], [4, 1, 0], [5, 1, 1], [6, 1, 2], [7, 2, 0], [8, 2, 1], [9, 2, 2]]);
  expect(nodes[4]).toMatchObject({ x: 1620, y: 2730 });
});

test("a stored position ten times too large on one axis is put on the grid, flagged, and reported", () => {
  const c = gridClass([...block, { id: 10, x: 1620, y: 39_300, spell: 10 }, { id: 11, x: 34_200, y: 3330, spell: 11 }]);
  const nodes = c.trees[0].nodes;
  expect(nodes.find((n) => n.id === 10)).toMatchObject({ x: 1620, y: 39_300, row: 3, col: 1, positionRepaired: true });
  expect(nodes.find((n) => n.id === 11)).toMatchObject({ row: 2, col: 4, positionRepaired: true });
  expect(nodes.find((n) => n.id === 5)?.positionRepaired).toBeUndefined();
  expect(c.warnings.filter((w) => w.includes("ten times too large"))).toHaveLength(2);
});

test("an off-grid node that repeats the spell of an on-grid node is a leftover: left out and reported", () => {
  const c = gridClass([...block, { id: 12, x: 1620, y: 27_300, spell: 5 }]);
  expect(c.trees[0].nodes.map((n) => n.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(c.warnings).toEqual(["Alpha: node 12 repeats the spell of node 5 and sits off the grid; left out"]);
});

test("two on-grid nodes with the same spell are both kept, with a warning", () => {
  const c = gridClass([...block, { id: 13, x: 3420, y: 2130, spell: 5 }]);
  expect(c.trees[0].nodes).toHaveLength(10);
  expect(c.warnings).toEqual(["Alpha: nodes 5, 13 carry the same spell and are all kept"]);
});

test("an off-grid node that cannot be corrected stays, and its cell is flagged as a guess", () => {
  const c = gridClass([...block, { id: 14, x: 1620, y: 777_777, spell: 14 }]);
  expect(c.trees[0].nodes).toHaveLength(10);
  expect(c.warnings[0]).toContain("node 14 is off the grid");
  expect(c.warnings[0]).toContain("could not be corrected");
});

test("each entry carries the icon file id with its file status, the raw text with its tokens, and the values the tokens use", () => {
  const { classes } = run({
    Spell: t([{ ID: 1001, Description_lang: "Increases damage by $s1% for $d.", AuraDescription_lang: "Damage up $s1%." }]),
    SpellMisc: t([{ ID: 1, SpellID: 1001, DifficultyID: 0, SpellIconFileDataID: 4242, DurationIndex: 7 }, { ID: 2, SpellID: 1002, DifficultyID: 0, SpellIconFileDataID: 4243, DurationIndex: 0 }]),
    SpellDuration: t([{ ID: 7, Duration: 15000 }]),
    SpellRadius: t([{ ID: 9, Radius: 10 }]),
    SpellEffect: t([
      { ID: 1, SpellID: 1001, DifficultyID: 0, EffectIndex: 0, EffectBasePointsF: 5, EffectDieSides: 0, EffectAuraPeriod: 3000, EffectChainTargets: 0, EffectMiscValue: 0, EffectRadiusIndex: [9, 0] },
      { ID: 2, SpellID: 1001, DifficultyID: 14, EffectIndex: 0, EffectBasePointsF: 99 }, // another difficulty: ignored
    ]),
    FileStatus: t([{ ID: 4242, Status: "present" }, { ID: 4243, Status: "encrypted" }]),
  });
  const first = classes[0].trees[0].nodes[0].entries[0];
  const second = classes[0].trees[0].nodes[1].entries[0];
  expect(first).toMatchObject({
    iconFileId: 4242, iconFile: "present", description: "Increases damage by $s1% for $d.", auraDescription: "Damage up $s1%.", durationMs: 15000,
    effects: [{ index: 0, basePoints: 5, periodMs: 3000, radiusYards: 10 }],
  });
  expect(second).toMatchObject({ iconFileId: 4243, iconFile: "encrypted", description: null, durationMs: null, effects: [] });
});

test("without a file status table the icon is marked unchecked, and a spell with no icon has a null id", () => {
  const entry = run().classes[0].trees[0].nodes[0].entries[0];
  expect(entry).toMatchObject({ iconFileId: null, iconFile: "unchecked", description: null, effects: [], durationMs: null });
});
