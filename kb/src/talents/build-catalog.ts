/**
 * Builds the talent catalog from the raw rows of one client snapshot. Pure: it takes a table reader,
 * so tests run on small made-up tables and the CLI runs on a snapshot file.
 */
import {
  LABEL, SCHEMA, type BuildStamp, type CatalogIndex, type ClassCatalog, type Node, type Tree,
} from "./catalog.js";

export type Row = Record<string, unknown>;
export type Rows = Map<number, Row>;
/** Rows of a table by name; undefined when the build does not have the table. */
export type TableReader = (table: string) => Rows | undefined;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const list = (rows: Rows | undefined): Row[] => [...(rows?.values() ?? [])];

function group<T>(items: T[], key: (item: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const item of items) {
    const k = key(item);
    out.set(k, [...(out.get(k) ?? []), item]);
  }
  return out;
}

/** The talent frame lays nodes out on a grid of this many units. */
const GRID = 600;
/** A position this close to a grid line, in units, counts as on it (stored values drift by a few units). */
const ON_GRID = 100;
/** A node this many grid steps from the tree's middle is not part of the layout. */
const MAX_STEPS_FROM_MIDDLE = 12;

/** The most common remainder of the values modulo the grid, in 10 unit buckets. */
function modalResidue(values: number[]): number {
  const buckets = new Map<number, { n: number; residue: number }>();
  for (const v of values) {
    const residue = ((v % GRID) + GRID) % GRID;
    const key = Math.round(residue / 10);
    const b = buckets.get(key) ?? { n: 0, residue };
    b.n += 1;
    buckets.set(key, b);
  }
  return [...buckets.values()].sort((a, b) => b.n - a.n || a.residue - b.residue)[0]?.residue ?? 0;
}

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** One axis of a tree's layout: where the grid lines are and how to tell a stored value belongs on it. */
function axis(values: number[]) {
  const origin = modalResidue(values);
  const step = (v: number) => Math.round((v - origin) / GRID);
  const middle = median(values.map(step));
  const fits = (v: number) => Math.abs(v - origin - step(v) * GRID) <= ON_GRID && Math.abs(step(v) - middle) <= MAX_STEPS_FROM_MIDDLE;
  /** The value, or the value divided by ten when only that one fits (a stored decimal shift), or null. */
  const fix = (v: number): { value: number; repaired: boolean } | null =>
    fits(v) ? { value: v, repaired: false } : Number.isInteger(v / 10) && fits(v / 10) ? { value: v / 10, repaired: true } : null;
  return { step, fix };
}

const EDGE_TYPES: Record<number, "visual" | "sufficient" | "required" | "exclusive" | undefined> = {
  0: "visual", 2: "sufficient", 3: "required", 4: "exclusive",
};
const NODE_KINDS: Record<number, Node["kind"] | undefined> = { 0: "single", 1: "tiered", 2: "choice" };

/** TraitCond.CondType 0: the condition that makes a node or group available. */
const COND_AVAILABLE = 0;

export interface CatalogInput {
  get: TableReader;
  build: BuildStamp;
  /** Rows and encrypted blocks per table, from the manifest beside the snapshot, when there is one. */
  tables: CatalogIndex["tables"];
}

/** Tables the catalog cannot be built without. A build that lacks one gets a warning, never a quiet empty catalog. */
const REQUIRED_TABLES = [
  "ChrClasses", "SkillLine", "SkillRaceClassInfo", "SkillLineXTraitTree", "TraitNode", "TraitNodeEntry", "TraitDefinition",
  "TraitNodeGroupDisplayInfo", "TraitNodeGroupXTraitNode", "TraitNodeXTraitNodeEntry", "TraitEdge", "TraitCond",
  "TraitNodeGroupXTraitCond", "TraitTreeXTraitCurrency", "TraitCurrencySource", "SpellName",
];

type SpentRequired = NonNullable<Node["unlock"]["spentRequired"]>;

export function buildTalentCatalog({ get, build, tables }: CatalogInput): { index: CatalogIndex; classes: ClassCatalog[] } {
  const warnings: string[] = [];
  for (const name of REQUIRED_TABLES) {
    const rows = get(name);
    if (!rows) warnings.push(`required table ${name} is not in this snapshot`);
    else if (!rows.size) warnings.push(`required table ${name} has no rows`);
  }
  const classRows = list(get("ChrClasses"));
  const specRows = list(get("ChrSpecialization"));
  const skillClass = new Map<number, number>();
  for (const r of list(get("SkillRaceClassInfo"))) skillClass.set(num(r.SkillID), (skillClass.get(num(r.SkillID)) ?? 0) | num(r.ClassMask));
  const skillName = new Map(list(get("SkillLine")).map((r) => [num(r.ID), text(r.DisplayName_lang)]));
  const spellName = new Map(list(get("SpellName")).map((r) => [num(r.ID), text(r.Name_lang)]));
  const definitions = new Map(list(get("TraitDefinition")).map((r) => [num(r.ID), r]));
  const entries = new Map(list(get("TraitNodeEntry")).map((r) => [num(r.ID), r]));
  const traitNodes = new Map(list(get("TraitNode")).map((r) => [num(r.ID), r]));
  const conds = new Map(list(get("TraitCond")).map((r) => [num(r.ID), r]));

  const nodeEntries = group(list(get("TraitNodeXTraitNodeEntry")), (r) => num(r.TraitNodeID));
  const groupNodes = group(list(get("TraitNodeGroupXTraitNode")), (r) => num(r.TraitNodeGroupID));
  const nodeGroups = group(list(get("TraitNodeGroupXTraitNode")), (r) => num(r.TraitNodeID));
  const groupConds = group(list(get("TraitNodeGroupXTraitCond")), (r) => num(r.TraitNodeGroupID));
  const nodeConds = group(list(get("TraitNodeXTraitCond")), (r) => num(r.TraitNodeID));
  const edgesByNode = group(list(get("TraitEdge")), (r) => num(r.LeftTraitNodeID));
  const displayByTree = group(list(get("TraitNodeGroupDisplayInfo")), (r) => num(r.TraitTreeID));
  const currenciesByTree = group(list(get("TraitTreeXTraitCurrency")), (r) => num(r.TraitTreeID));
  const sources = list(get("TraitCurrencySource"));
  const spellText = new Map(list(get("Spell")).map((r) => [num(r.ID), r]));
  const radius = new Map(list(get("SpellRadius")).map((r) => [num(r.ID), num(r.Radius)]));
  const durations = new Map(list(get("SpellDuration")).map((r) => [num(r.ID), num(r.Duration)]));
  const misc = new Map(list(get("SpellMisc")).filter((r) => num(r.DifficultyID) === 0).map((r) => [num(r.SpellID), r]));
  const effectsBySpell = group(list(get("SpellEffect")).filter((r) => num(r.DifficultyID) === 0), (r) => num(r.SpellID));
  const fileStatus = get("FileStatus");

  // Class trees: the client links a class's skill line to its trait tree; the skill line's class mask names the class.
  const classTrees = new Map<number, { treeId: number; skillLineId: number }>();
  for (const r of list(get("SkillLineXTraitTree"))) {
    const skillLineId = num(r.SkillLineID);
    const mask = skillClass.get(skillLineId) ?? 0;
    const classId = mask > 0 && (mask & (mask - 1)) === 0 ? Math.log2(mask) + 1 : 0;
    if (!classId) warnings.push(`trait tree ${num(r.TraitTreeID)}: skill line ${skillLineId} does not map to exactly one class (mask ${mask}); skipped`);
    else classTrees.set(classId, { treeId: num(r.TraitTreeID), skillLineId });
  }
  const classTreeIds = new Set([...classTrees.values()].map((t) => t.treeId));

  /** Row gates on one node: the "available" conditions on the node groups it belongs to. */
  const gatesOf = (nodeId: number): Omit<SpentRequired, "scope">[] =>
    (nodeGroups.get(nodeId) ?? []).flatMap((g) =>
      (groupConds.get(num(g.TraitNodeGroupID)) ?? []).flatMap((link) => {
        const c = conds.get(num(link.TraitCondID));
        if (!c || num(c.CondType) !== COND_AVAILABLE || num(c.TraitNodeID) !== 0 || num(c.SpentAmountRequired) <= 0) return [];
        return [{ amount: num(c.SpentAmountRequired), gateGroupId: num(g.TraitNodeGroupID), currencyId: num(c.TraitCurrencyID), traitTreeId: num(c.TraitTreeID) }];
      }));
  const isGate = (groupId: number): boolean => (groupConds.get(groupId) ?? []).some((l) => {
    const c = conds.get(num(l.TraitCondID));
    return !!c && num(c.CondType) === COND_AVAILABLE && num(c.SpentAmountRequired) > 0;
  });

  let edgesOutside = 0;
  let edgesOfOtherType = 0;
  let emptyNodes = 0;
  const classes: ClassCatalog[] = [];
  for (const cls of [...classRows].sort((a, b) => num(a.ID) - num(b.ID))) {
    const classId = num(cls.ID);
    const link = classTrees.get(classId);
    if (!link) continue;
    const className = text(cls.Name_lang) ?? `class ${classId}`;
    const classWarnings: string[] = [];
    const specs = specRows.filter((s) => num(s.ClassID) === classId).sort((a, b) => num(a.OrderIndex) - num(b.OrderIndex) || num(a.ID) - num(b.ID));
    if (specs.length > 1) classWarnings.push(`${specs.length} specializations listed for this class; specId is the first`);
    const display = (displayByTree.get(link.treeId) ?? []).sort((a, b) => num(a.OrderIndex) - num(b.OrderIndex));
    if (!display.length) classWarnings.push("no talent trees listed for this class tree (TraitNodeGroupDisplayInfo)");

    const specGroupIds = new Set(display.map((d) => num(d.TraitNodeGroupID)));
    const treeNodeIds = new Set([...traitNodes.values()].filter((n) => num(n.TraitTreeID) === link.treeId).map((n) => num(n.ID)));
    const assigned = new Set(display.flatMap((d) => (groupNodes.get(num(d.TraitNodeGroupID)) ?? []).map((r) => num(r.TraitNodeID))));
    const loose = [...treeNodeIds].filter((id) => !assigned.has(id)).sort((a, b) => a - b);
    if (display.length && loose.length) classWarnings.push(`${loose.length} nodes of the class tree are in no talent tree and are left out: ${loose.join(", ")}`);

    // Pass 1: nodes of each talent tree, on a grid.
    const gateOf = new Map<number, Omit<SpentRequired, "scope">>();
    const droppedIds = new Map<number, Set<number>>();
    const trees: Tree[] = display.map((d) => {
      const groupId = num(d.TraitNodeGroupID);
      const treeName = skillName.get(num(d.SkillLineID)) ?? `tree ${groupId}`;
      const ids = (groupNodes.get(groupId) ?? []).map((r) => num(r.TraitNodeID)).filter((id) => treeNodeIds.has(id)).sort((a, b) => a - b);
      const xs = axis(ids.map((id) => num(traitNodes.get(id)!.PosX)));
      const ys = axis(ids.map((id) => num(traitNodes.get(id)!.PosY)));
      const place = new Map<number, { x: { value: number; repaired: boolean } | null; y: { value: number; repaired: boolean } | null }>();
      for (const id of ids) place.set(id, { x: xs.fix(num(traitNodes.get(id)!.PosX)), y: ys.fix(num(traitNodes.get(id)!.PosY)) });
      const onGrid = (id: number) => { const p = place.get(id)!; return !!p.x && !!p.y && !p.x.repaired && !p.y.repaired; };

      // The same spell on several nodes: when one sits on the grid and another does not, the off-grid one is a leftover and is dropped.
      const spellsOf = (id: number) => [...(nodeEntries.get(id) ?? [])].sort((a, b) => num(a.Index) - num(b.Index))
        .map((l) => num(definitions.get(num(entries.get(num(l.TraitNodeEntryID))?.TraitDefinitionID))?.SpellID)).join(",");
      const bySpells = new Map<string, number[]>();
      for (const id of ids) bySpells.set(spellsOf(id), [...(bySpells.get(spellsOf(id)) ?? []), id]);
      const dropped = new Set<number>();
      for (const [signature, same] of bySpells) {
        if (same.length < 2 || signature === "") continue;
        const keep = same.filter(onGrid);
        if (keep.length && keep.length < same.length) {
          for (const id of same.filter((i) => !keep.includes(i))) dropped.add(id);
          classWarnings.push(`${treeName}: node ${same.filter((i) => !keep.includes(i)).join(", ")} repeats the spell of node ${keep.join(", ")} and sits off the grid; left out`);
        } else if (!keep.length || keep.length === same.length) {
          classWarnings.push(`${treeName}: nodes ${same.join(", ")} carry the same spell and are all kept`);
        }
      }
      droppedIds.set(groupId, dropped);
      const kept = ids.filter((id) => !dropped.has(id));
      const unfit = kept.filter((id) => !place.get(id)!.x || !place.get(id)!.y);
      for (const id of unfit) classWarnings.push(`${treeName}: node ${id} is off the grid at (${num(traitNodes.get(id)!.PosX)}, ${num(traitNodes.get(id)!.PosY)}) and could not be corrected; its cell is a guess`);
      for (const id of kept.filter((i) => [place.get(i)!.x, place.get(i)!.y].some((v) => v?.repaired))) {
        classWarnings.push(`${treeName}: node ${id} was stored at (${num(traitNodes.get(id)!.PosX)}, ${num(traitNodes.get(id)!.PosY)}), ten times too large on one axis; its cell uses the value divided by ten`);
      }
      const cell = (id: number) => {
        const raw = traitNodes.get(id)!;
        const p = place.get(id)!;
        return { sx: xs.step(p.x?.value ?? num(raw.PosX)), sy: ys.step(p.y?.value ?? num(raw.PosY)) };
      };
      const minX = Math.min(...kept.map((id) => cell(id).sx));
      const minY = Math.min(...kept.map((id) => cell(id).sy));
      const inTree = new Set(kept);

      const prereqs = new Map<number, Node["prereqs"]>();
      const treeEdges: Tree["edges"] = [];
      for (const id of kept) {
        for (const e of edgesByNode.get(id) ?? []) {
          const to = num(e.RightTraitNodeID);
          const type = EDGE_TYPES[num(e.Type)];
          if (!type) { edgesOfOtherType += 1; continue; }
          if (!inTree.has(to)) { edgesOutside += 1; continue; }
          treeEdges.push({ from: id, to, type });
          if (type === "sufficient" || type === "required") {
            prereqs.set(to, [...(prereqs.get(to) ?? []), { nodeId: id, rule: type === "sufficient" ? "any" : "all" }]);
          }
        }
      }

      const nodes: Node[] = kept.map((id) => {
        const raw = traitNodes.get(id)!;
        const ordered = [...(nodeEntries.get(id) ?? [])].sort((a, b) => num(a.Index) - num(b.Index));
        const nodeEntryList = ordered.map((link2) => {
          const entry = entries.get(num(link2.TraitNodeEntryID));
          const def = definitions.get(num(entry?.TraitDefinitionID));
          const spellId = num(def?.SpellID);
          const shown = num(def?.VisibleSpellID) || spellId;
          const m = misc.get(shown);
          const iconFileId = num(m?.SpellIconFileDataID) || null;
          const durationIndex = num(m?.DurationIndex);
          return {
            definitionId: num(entry?.TraitDefinitionID),
            spellId,
            name: text(def?.OverrideName_lang) ?? spellName.get(shown) ?? null,
            maxRanks: num(entry?.MaxRanks),
            iconFileId,
            iconFile: iconFileId === null || !fileStatus ? ("unchecked" as const) : ((fileStatus.get(iconFileId)?.Status as "present" | "encrypted" | "absent" | undefined) ?? "unchecked"),
            description: text(spellText.get(shown)?.Description_lang),
            auraDescription: text(spellText.get(shown)?.AuraDescription_lang),
            effects: (effectsBySpell.get(shown) ?? []).sort((a, b) => num(a.EffectIndex) - num(b.EffectIndex)).map((e) => ({
              index: num(e.EffectIndex),
              basePoints: typeof e.EffectBasePointsF === "number" ? e.EffectBasePointsF : num(e.EffectBasePoints),
              dieSides: num(e.EffectDieSides), periodMs: num(e.EffectAuraPeriod), chainTargets: num(e.EffectChainTargets), miscValue: num(e.EffectMiscValue),
              radiusYards: Math.max(0, ...(Array.isArray(e.EffectRadiusIndex) ? e.EffectRadiusIndex : [e.EffectRadiusIndex]).map((i) => radius.get(num(i)) ?? 0)) || null,
            })),
            durationMs: durationIndex && durations.has(durationIndex) ? durations.get(durationIndex)! : null,
          };
        });
        if (!nodeEntryList.length) emptyNodes += 1;
        const kind = NODE_KINDS[num(raw.Type)] ?? (nodeEntryList.length > 1 ? "choice" : "single");
        const ranksList = nodeEntryList.map((e) => e.maxRanks);
        const maxRanks = kind === "tiered" ? ranksList.reduce((a, b) => a + b, 0) : Math.max(0, ...ranksList);

        const gates = gatesOf(id).sort((a, b) => b.amount - a.amount);
        if (gates.length) gateOf.set(id, gates[0]);
        const unlock: Node["unlock"] = {};
        const ranksInNodes = (nodeConds.get(id) ?? []).flatMap((l) => {
          const c = conds.get(num(l.TraitCondID));
          return c && num(c.CondType) === COND_AVAILABLE && num(c.TraitNodeID) && num(c.SpentAmountRequired) > 0
            ? [{ nodeId: num(c.TraitNodeID), ranks: num(c.SpentAmountRequired) }] : [];
        });
        if (ranksInNodes.length) unlock.ranksInNodes = ranksInNodes;
        const p = place.get(id)!;
        const c = cell(id);
        return {
          id, x: num(raw.PosX), y: num(raw.PosY), row: c.sy - minY, col: c.sx - minX,
          ...([p.x, p.y].some((v) => v?.repaired) ? { positionRepaired: true } : {}),
          kind, maxRanks, entries: nodeEntryList, prereqs: prereqs.get(id) ?? [], unlock,
        };
      });
      return { id: groupId, name: skillName.get(num(d.SkillLineID)) ?? null, skillLineId: num(d.SkillLineID), order: num(d.OrderIndex), nodes, edges: treeEdges };
    });

    // Pass 2: where each row gate counts its points. A companion group lists exactly the nodes above the gated row.
    const sameSet = (members: Set<number>, wanted: number[]) => wanted.length > 0 && members.size === wanted.length && wanted.every((id) => members.has(id));
    const treeDropped = new Set([...droppedIds.values()].flatMap((s) => [...s]));
    for (const tree of trees) {
      for (const node of tree.nodes) {
        const gate = gateOf.get(node.id);
        if (!gate) continue;
        const gateRow = Math.min(...(groupNodes.get(gate.gateGroupId) ?? []).map((r) => nodeRow(trees, num(r.TraitNodeID))).filter((r): r is number => r !== null));
        if (!Number.isFinite(gateRow)) continue;
        const aboveTree = tree.nodes.filter((n) => n.row < gateRow).map((n) => n.id);
        const aboveClass = trees.flatMap((t) => t.nodes.filter((n) => n.row < gateRow).map((n) => n.id));
        let scope: SpentRequired["scope"] = "unconfirmed";
        let companionGroupId: number | undefined;
        for (const [gid, rows] of groupNodes) {
          if (specGroupIds.has(gid) || gid === gate.gateGroupId || isGate(gid)) continue;
          const members = new Set(rows.map((r) => num(r.TraitNodeID)).filter((id) => !treeDropped.has(id)));
          if (!members.size || ![...members].every((id) => treeNodeIds.has(id))) continue;
          if (sameSet(members, aboveTree)) { scope = "tree"; companionGroupId = gid; break; }
          if (aboveClass.length > aboveTree.length && sameSet(members, aboveClass)) { scope = "class"; companionGroupId = gid; break; }
        }
        node.unlock.spentRequired = { ...gate, scope, ...(companionGroupId === undefined ? {} : { companionGroupId }) };
      }
    }

    const currencies = [...(currenciesByTree.get(link.treeId) ?? [])].sort((a, b) => num(a.Index) - num(b.Index) || num(a.ID) - num(b.ID));
    const currency = currencies.length ? num(currencies[0].TraitCurrencyID) : null;
    if (currencies.length > 1) classWarnings.push(`${currencies.length} currencies are listed for the class tree; points use the first by index (${currency})`);
    const pointLevels = currency === null ? [] : sources
      .filter((s) => num(s.TraitCurrencyID) === currency && num(s.PlayerLevel) > 0 && num(s.TraitNodeEntryID) === 0 && num(s.Amount) > 0)
      .flatMap((s) => Array<number>(num(s.Amount)).fill(num(s.PlayerLevel)))
      .sort((a, b) => a - b);

    classes.push({
      schema: SCHEMA, label: LABEL, build, classId, className: text(cls.Name_lang), specId: specs.length ? num(specs[0].ID) : null,
      traitTreeId: link.treeId, pointLevels, pointCurrencyId: currency, trees, warnings: classWarnings,
    });
  }

  if (edgesOfOtherType) warnings.push(`${edgesOfOtherType} edges left out: a type that is deprecated in WoWDBDefs or that this extractor does not know`);
  if (edgesOutside) warnings.push(`${edgesOutside} edges left out: they lead to a node outside the tree`);
  if (emptyNodes) warnings.push(`${emptyNodes} nodes have no entries`);
  if (!classes.length) warnings.push("no class talent trees were found in this snapshot");
  for (const c of classes) for (const w of c.warnings) warnings.push(`${c.className ?? c.classId}: ${w}`);
  const index: CatalogIndex = {
    schema: SCHEMA, label: LABEL, build,
    classes: classes.map((c) => ({
      classId: c.classId, className: c.className, file: `${(c.className ?? `class-${c.classId}`).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`,
      trees: c.trees.length, nodes: c.trees.reduce((n, t) => n + t.nodes.length, 0),
    })),
    otherTraitTrees: list(get("TraitTree")).map((r) => num(r.ID)).filter((id) => !classTreeIds.has(id)).sort((a, b) => a - b),
    tables, warnings,
  };
  return { index, classes };
}

/** Row of a node in whichever talent tree holds it, or null when no tree does. */
function nodeRow(trees: Tree[], nodeId: number): number | null {
  for (const t of trees) {
    const n = t.nodes.find((x) => x.id === nodeId);
    if (n) return n.row;
  }
  return null;
}
