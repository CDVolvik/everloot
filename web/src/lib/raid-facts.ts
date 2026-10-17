import type { BuffTable } from "@/data/game-data/raid";
import { titleCase } from "./raid";

export interface TalentBuff {
  label: string;
  class: string;
  /** The tree's name, or null when the files match the effect in more than one tree. */
  tree: string | null;
  proof?: string;
}

export interface RaidTalentFacts {
  build: string;
  /** Effects a class gets only through a talent, in the file's order. */
  talent: TalentBuff[];
  /** Effects whose talent matches are in more than one tree. */
  unknownTree: TalentBuff[];
  /** Effects that come with the class. */
  baseline: number;
}

/**
 * Which raid effects need a talent, from the raid file's `tree` and `treeProof`. Effects only a player
 * can cast on themselves are left out, as in the planner's tables.
 */
export function raidTalentFacts(table: BuffTable): RaidTalentFacts {
  const entries = table.entries.filter((e) => e.scope !== "self");
  const named = (e: (typeof entries)[number], tree: string | null): TalentBuff => ({ label: e.label, class: titleCase(e.class), tree, ...(e.treeProof ? { proof: e.treeProof } : {}) });
  return {
    build: table.build,
    talent: entries.filter((e) => e.tree === 1 || e.tree === 2 || e.tree === 3).map((e) => named(e, table.trees[e.class]?.[(e.tree as number) - 1] ?? null)),
    unknownTree: entries.filter((e) => e.tree === "unknown").map((e) => named(e, null)),
    baseline: entries.filter((e) => e.tree === "baseline").length,
  };
}
