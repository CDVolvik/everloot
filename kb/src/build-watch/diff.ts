/**
 * Compares the committed game data with a new build and says what changed, in the shape of a
 * changelog entry. Pure: no files, no network.
 */
import { isDeepStrictEqual } from "node:util";
import { diffRaidBuffs, type RaidBuffTable } from "../raid-buffs.js";
import { CHANGE_SCHEMA, type BuildRef, type ChangeEntry, type TalentChanges } from "./changes.js";
import { LABEL } from "../talents/catalog.js";
import type { CommittedClass, GameDataManifest } from "./game-data.js";

type Node = CommittedClass["trees"][number]["nodes"][number];
interface Located { cls: CommittedClass; tree: string | null; node: Node }

const nameOf = (n: Node) => n.entries.map((e) => e.name ?? `spell ${e.spellId}`).join(" / ") || `node ${n.id}`;

function locate(classes: CommittedClass[]): Map<number, Located> {
  const out = new Map<number, Located>();
  for (const cls of classes) for (const t of cls.trees) for (const node of t.nodes) out.set(node.id, { cls, tree: t.name, node });
  return out;
}

const where = (l: Located, spoiler: boolean) => ({
  classId: l.cls.classId, className: l.cls.className, tree: l.tree, nodeId: l.node.id, name: nameOf(l.node), spoiler,
});
const position = (l: Located) => ({ tree: l.tree, x: l.node.x, y: l.node.y, row: l.node.row, col: l.node.col });
const sortPrereqs = (p: Node["prereqs"]) => [...p].sort((a, b) => a.nodeId - b.nodeId || a.rule.localeCompare(b.rule));
const order = <T extends { classId: number; nodeId: number }>(a: T, b: T) => a.classId - b.classId || a.nodeId - b.nodeId;

export function diffTalents(before: CommittedClass[], after: CommittedClass[], spoiler: boolean): TalentChanges {
  const out: TalentChanges = {
    classesAdded: [], classesRemoved: [], added: [], removed: [], moved: [], ranks: [], gates: [], prereqs: [], replaced: [], spellValues: [], pointLevels: [],
  };
  const ref = (c: CommittedClass) => ({ classId: c.classId, className: c.className, spoiler });
  const byId = (x: { classId: number }, y: { classId: number }) => x.classId - y.classId;
  const was = new Map(before.map((c) => [c.classId, c]));
  const now = new Map(after.map((c) => [c.classId, c]));
  out.classesAdded = [...now.values()].filter((c) => !was.has(c.classId)).map(ref).sort(byId);
  out.classesRemoved = [...was.values()].filter((c) => !now.has(c.classId)).map(ref).sort(byId);
  for (const c of after) {
    const old = was.get(c.classId);
    if (old && !isDeepStrictEqual(old.pointLevels, c.pointLevels)) {
      out.pointLevels.push({ classId: c.classId, className: c.className, before: old.pointLevels, after: c.pointLevels, spoiler });
    }
  }

  const a = locate(before);
  const b = locate(after);
  for (const [id, l] of b) {
    const old = a.get(id);
    if (!old) {
      out.added.push({ ...where(l, spoiler), kind: l.node.kind, maxRanks: l.node.maxRanks });
      continue;
    }
    const n = l.node;
    const o = old.node;
    if (o.x !== n.x || o.y !== n.y || old.tree !== l.tree) out.moved.push({ ...where(l, spoiler), from: position(old), to: position(l) });
    if (o.maxRanks !== n.maxRanks) out.ranks.push({ ...where(l, spoiler), before: o.maxRanks, after: n.maxRanks });
    if (!isDeepStrictEqual(o.unlock, n.unlock)) out.gates.push({ ...where(l, spoiler), before: o.unlock, after: n.unlock });
    if (!isDeepStrictEqual(sortPrereqs(o.prereqs), sortPrereqs(n.prereqs))) {
      out.prereqs.push({ ...where(l, spoiler), before: sortPrereqs(o.prereqs), after: sortPrereqs(n.prereqs) });
    }
    const oldSpells = o.entries.map((e) => e.spellId);
    const newSpells = n.entries.map((e) => e.spellId);
    if (!isDeepStrictEqual(oldSpells, newSpells)) out.replaced.push({ ...where(l, spoiler), before: oldSpells, after: newSpells });
    else {
      n.entries.forEach((entry, i) => {
        const e = o.entries[i];
        const changes: { field: string; before: number | string | null; after: number | string | null }[] = [];
        const check = (field: string, x: number | string | null | undefined, y: number | string | null | undefined) => {
          if ((x ?? null) !== (y ?? null)) changes.push({ field, before: x ?? null, after: y ?? null });
        };
        check("durationMs", e.durationMs, entry.durationMs);
        check("maxRanks", e.maxRanks, entry.maxRanks);
        check("text", e.textHash, entry.textHash);
        const indexes = [...new Set([...e.effects, ...entry.effects].map((x) => x.index))].sort((p, q) => p - q);
        for (const idx of indexes) {
          const x = e.effects.find((f) => f.index === idx);
          const y = entry.effects.find((f) => f.index === idx);
          for (const f of ["basePoints", "dieSides", "periodMs", "chainTargets", "miscValue", "radiusYards"] as const) check(`effect ${idx + 1} ${f}`, x?.[f], y?.[f]);
        }
        if (changes.length) out.spellValues.push({ ...where(l, spoiler), spellId: entry.spellId, spellName: entry.name, changes });
      });
    }
  }
  for (const [id, l] of a) if (!b.has(id)) out.removed.push({ ...where(l, spoiler), maxRanks: l.node.maxRanks });
  for (const key of ["added", "removed", "moved", "ranks", "gates", "prereqs", "replaced", "spellValues"] as const) out[key].sort(order as never);
  return out;
}

export interface DiffInput {
  product: string;
  live: boolean;
  detectedAt: string;
  build: BuildRef;
  manifest: GameDataManifest;
  classes: CommittedClass[];
  raidBuffs: RaidBuffTable;
  /** What is committed now; null for the first entry of a product. */
  committed: { manifest: GameDataManifest; classes: CommittedClass[] } | null;
  /** The newest earlier raid buff table that was on hand (not committed; it comes from the Actions cache). */
  raidBaseline: RaidBuffTable | null;
  encryptedTables: { table: string; blocks: number }[];
  warnings: string[];
}

export function buildChangeEntry(input: DiffInput): ChangeEntry {
  const spoiler = !input.live;
  const ref = (b: { version: string; buildId: number; buildConfig: string }): BuildRef => ({ version: b.version, buildId: b.buildId, buildConfig: b.buildConfig });
  const blocks = input.encryptedTables.filter((t) => t.blocks > 0).sort((x, y) => x.table.localeCompare(y.table));
  const warnings = [...input.warnings];
  if (input.committed && input.committed.manifest.build.definitions !== input.manifest.build.definitions) {
    warnings.push(`table definitions differ (WoWDBDefs ${input.committed.manifest.build.definitions ?? "unknown"} vs ${input.manifest.build.definitions ?? "unknown"}): a change may come from the layouts, not the game`);
  }
  return {
    schema: CHANGE_SCHEMA,
    label: LABEL,
    id: `${input.product}-${input.build.buildId}`,
    product: input.product,
    live: input.live,
    spoiler,
    detectedAt: input.detectedAt,
    build: input.build,
    previous: input.committed ? ref(input.committed.manifest.build) : null,
    initial: !input.committed,
    encryptedBlocks: { total: blocks.reduce((n, t) => n + t.blocks, 0), tables: blocks },
    talents: input.committed ? diffTalents(input.committed.classes, input.classes, spoiler) : null,
    raidBuffs: {
      comparedTo: input.raidBaseline ? ref(input.raidBaseline.build) : null,
      scopeChanges: input.raidBaseline ? diffRaidBuffs(input.raidBaseline, input.raidBuffs).map((c) => ({ ...c, spoiler })) : [],
    },
    warnings,
  };
}
