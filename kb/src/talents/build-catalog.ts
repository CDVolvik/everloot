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

/** Position values closer than this are one row or column (positions are not always on an exact grid). */
const SAME_POSITION = 150;

/** Rank of each value among the distinct positions, from 0. */
function ranks(values: number[]): Map<number, number> {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const out = new Map<number, number>();
  let rank = -1;
  let last = -Infinity;
  for (const v of sorted) {
    if (v - last >= SAME_POSITION) rank += 1;
    out.set(v, rank);
    last = v;
  }
  return out;
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

export function buildTalentCatalog({ get, build, tables }: CatalogInput): { index: CatalogIndex; classes: ClassCatalog[] } {
  const warnings: string[] = [];
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
  const currencyOfTree = new Map(list(get("TraitTreeXTraitCurrency")).map((r) => [num(r.TraitTreeID), num(r.TraitCurrencyID)]));
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

  const groupGate = (groupId: number): number | undefined => {
    const spent = (groupConds.get(groupId) ?? [])
      .map((link) => conds.get(num(link.TraitCondID)))
      .filter((c): c is Row => !!c && num(c.CondType) === COND_AVAILABLE && num(c.TraitNodeID) === 0)
      .map((c) => num(c.SpentAmountRequired))
      .filter((n) => n > 0);
    return spent.length ? Math.max(...spent) : undefined;
  };

  let droppedEdges = 0;
  let emptyNodes = 0;
  const classes: ClassCatalog[] = [];
  for (const cls of [...classRows].sort((a, b) => num(a.ID) - num(b.ID))) {
    const classId = num(cls.ID);
    const link = classTrees.get(classId);
    if (!link) continue;
    const classWarnings: string[] = [];
    const specs = specRows.filter((s) => num(s.ClassID) === classId).sort((a, b) => num(a.OrderIndex) - num(b.OrderIndex) || num(a.ID) - num(b.ID));
    if (specs.length > 1) classWarnings.push(`${specs.length} specializations listed for this class; specId is the first`);
    const display = (displayByTree.get(link.treeId) ?? []).sort((a, b) => num(a.OrderIndex) - num(b.OrderIndex));
    if (!display.length) classWarnings.push("no talent trees listed for this class tree (TraitNodeGroupDisplayInfo)");

    const trees: Tree[] = display.map((d) => {
      const groupId = num(d.TraitNodeGroupID);
      const ids = (groupNodes.get(groupId) ?? []).map((r) => num(r.TraitNodeID)).filter((id) => traitNodes.get(id) && num(traitNodes.get(id)!.TraitTreeID) === link.treeId).sort((a, b) => a - b);
      const inTree = new Set(ids);
      const rowOf = ranks(ids.map((id) => num(traitNodes.get(id)!.PosY)));
      const colOf = ranks(ids.map((id) => num(traitNodes.get(id)!.PosX)));

      const prereqs = new Map<number, Node["prereqs"]>();
      const treeEdges: Tree["edges"] = [];
      for (const id of ids) {
        for (const e of edgesByNode.get(id) ?? []) {
          const to = num(e.RightTraitNodeID);
          const type = EDGE_TYPES[num(e.Type)];
          if (!inTree.has(to) || !type) { droppedEdges += 1; continue; }
          treeEdges.push({ from: id, to, type });
          if (type === "sufficient" || type === "required") {
            prereqs.set(to, [...(prereqs.get(to) ?? []), { nodeId: id, rule: type === "sufficient" ? "any" : "all" }]);
          }
        }
      }

      const nodes: Node[] = ids.map((id) => {
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
            name: text(def?.OverrideName_lang) ?? spellName.get(num(def?.VisibleSpellID) || spellId) ?? null,
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

        // The row gate sits on a smaller node group that this node is also a member of.
        const gates = (nodeGroups.get(id) ?? []).map((g) => groupGate(num(g.TraitNodeGroupID))).filter((n): n is number => n !== undefined);
        const unlock: Node["unlock"] = {};
        if (gates.length) unlock.pointsInTree = Math.max(...gates);
        for (const l of nodeConds.get(id) ?? []) {
          const c = conds.get(num(l.TraitCondID));
          if (c && num(c.CondType) === COND_AVAILABLE && num(c.TraitNodeID) && num(c.SpentAmountRequired) > 0) {
            unlock.ranksInNode = { nodeId: num(c.TraitNodeID), ranks: num(c.SpentAmountRequired) };
          }
        }
        return {
          id, x: num(raw.PosX), y: num(raw.PosY), row: rowOf.get(num(raw.PosY)) ?? 0, col: colOf.get(num(raw.PosX)) ?? 0,
          kind, maxRanks, entries: nodeEntryList, prereqs: prereqs.get(id) ?? [], unlock,
        };
      });
      return { id: groupId, name: skillName.get(num(d.SkillLineID)) ?? null, skillLineId: num(d.SkillLineID), order: num(d.OrderIndex), nodes, edges: treeEdges };
    });

    const currency = currencyOfTree.get(link.treeId);
    const pointLevels = currency === undefined ? [] : sources
      .filter((s) => num(s.TraitCurrencyID) === currency && num(s.PlayerLevel) > 0 && num(s.TraitNodeEntryID) === 0)
      .flatMap((s) => Array<number>(Math.max(1, num(s.Amount))).fill(num(s.PlayerLevel)))
      .sort((a, b) => a - b);

    classes.push({
      schema: SCHEMA, label: LABEL, build, classId, className: text(cls.Name_lang), specId: specs.length ? num(specs[0].ID) : null,
      traitTreeId: link.treeId, pointLevels, trees, warnings: classWarnings,
    });
  }

  if (droppedEdges) warnings.push(`${droppedEdges} edges left out: a node outside the tree, or an edge type this extractor does not know`);
  if (emptyNodes) warnings.push(`${emptyNodes} nodes have no entries`);
  const classTreeIds = new Set([...classTrees.values()].map((t) => t.treeId));
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
