import { pointsAtLevel } from "./rules";
import type { TalentCatalog } from "./types";

/** The id of a class page's closed "How it works" section, which the calculator's "?" button opens. */
export const HOW_IT_WORKS_ID = "how-it-works";

/**
 * Plain facts about one class, counted from its talent catalog. Everything here is read from the game
 * files of the catalog's build and stays unconfirmed until checked in game; nothing is advice.
 */
export interface TreeFacts {
  name: string;
  /** Talent nodes in the tree. */
  talents: number;
  /** Ranks that can be bought across those talents. */
  ranks: number;
  /** Row number to the points that must be spent in this tree above the row. Rows without a gate are left out. */
  gates: { row: number; points: number }[];
}

export interface ClassFacts {
  className: string;
  build: string;
  maxLevel: number;
  firstPointLevel: number;
  /** Talent points a character has at max level. */
  points: number;
  trees: TreeFacts[];
  totalTalents: number;
  totalRanks: number;
  /** True when every tree has the same row gates. */
  sameGates: boolean;
}

export function classFacts(catalog: TalentCatalog): ClassFacts {
  const trees: TreeFacts[] = catalog.trees.map((tree) => {
    const nodes = catalog.nodes.filter((n) => n.treeId === tree.id);
    const byRow = new Map<number, number>();
    for (const n of nodes) {
      const need = n.unlock?.pointsInTree ?? 0;
      if (need > 0) byRow.set(n.row, Math.max(byRow.get(n.row) ?? 0, need));
    }
    return {
      name: tree.name,
      talents: nodes.length,
      ranks: nodes.reduce((sum, n) => sum + n.maxRanks, 0),
      gates: [...byRow].sort((a, b) => a[0] - b[0]).map(([row, points]) => ({ row, points })),
    };
  });
  const key = (t: TreeFacts) => t.gates.map((g) => `${g.row}:${g.points}`).join(",");
  return {
    className: catalog.className,
    build: catalog.build,
    maxLevel: catalog.rules.maxLevel,
    firstPointLevel: catalog.rules.firstPointLevel,
    points: pointsAtLevel(catalog, catalog.rules.maxLevel),
    trees,
    totalTalents: trees.reduce((s, t) => s + t.talents, 0),
    totalRanks: trees.reduce((s, t) => s + t.ranks, 0),
    sameGates: trees.every((t) => key(t) === key(trees[0])),
  };
}

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const gateText = (gates: TreeFacts["gates"]) => gates.map((g) => `row ${g.row} needs ${g.points}`).join(", ");

/** The two answer paragraphs shown on a class page: points at max level, then how the trees are laid out. */
export function classAnswers(facts: ClassFacts): { pointsQuestion: string; pointsAnswer: string; layoutQuestion: string; layoutAnswer: string } {
  const treeNames = list(facts.trees.map((t) => t.name));
  const gates = facts.sameGates
    ? facts.trees[0].gates.length ? `In every tree, a talent can be taken only after points are spent in that tree above its row: ${gateText(facts.trees[0].gates)}.` : ""
    : facts.trees.filter((t) => t.gates.length).map((t) => `${t.name}: ${gateText(t.gates)}.`).join(" ");
  return {
    pointsQuestion: `How many talent points does a ${facts.className} get at level ${facts.maxLevel}?`,
    pointsAnswer:
      `In the game files of build ${facts.build}, a ${facts.className} has ${facts.points} talent points by level ${facts.maxLevel}, the first at level ${facts.firstPointLevel}. ` +
      `The ${plural(facts.trees.length, "tree")} (${treeNames}) hold ${plural(facts.totalTalents, "talent")} with ${plural(facts.totalRanks, "rank")} between them, ` +
      (facts.totalRanks > facts.points ? "so no build can take everything." : "enough for every rank."),
    layoutQuestion: `How are the ${facts.className} talent trees laid out?`,
    layoutAnswer: gates,
  };
}

/** Meta description and lead line of a class page, from the same facts the answer block uses. */
export function classDescription(facts: ClassFacts): string {
  return `Plan ${facts.className} talents for WoW: Forever: ${facts.points} points at level ${facts.maxLevel} across ${list(facts.trees.map((t) => t.name))}, with point rules and sharing. Unconfirmed.`;
}

export interface MaxLevelPoints { points: number; level: number; firstPointLevel: number; classes: string[] }

/** Classes grouped by the points they have at max level, for the talent hub. Usually one group. */
export function pointsByClass(catalogs: TalentCatalog[]): MaxLevelPoints[] {
  const groups = new Map<string, MaxLevelPoints>();
  for (const c of catalogs) {
    const f = classFacts(c);
    const key = `${f.points}:${f.maxLevel}:${f.firstPointLevel}`;
    const group = groups.get(key) ?? { points: f.points, level: f.maxLevel, firstPointLevel: f.firstPointLevel, classes: [] };
    group.classes.push(f.className);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** The hub's answers: points at max level per class, and the two talent sets. */
export function hubAnswers(catalogs: TalentCatalog[]): { pointsQuestion: string; pointsAnswer: string; setsQuestion: string; setsAnswer: string } {
  const groups = pointsByClass(catalogs);
  const build = catalogs[0]?.build ?? "";
  const level = groups[0]?.level ?? 60;
  const dual = catalogs[0]?.rules.dualSpecLevel ?? 40;
  const points =
    groups.length === 1
      ? `In the game files of build ${build}, every class has ${groups[0].points} talent points by level ${groups[0].level}, the first at level ${groups[0].firstPointLevel}.`
      : `In the game files of build ${build}, the points a class has by level ${level} are: ${groups.map((g) => `${g.points} for ${list(g.classes)}`).join("; ")}.`;
  return {
    pointsQuestion: `How many talent points do you get at level ${level}?`,
    pointsAnswer: `${points} The calculator counts them from the game's own point levels and stops you at the limit. Unconfirmed until checked in game.`,
    setsQuestion: "Are there two talent sets?",
    setsAnswer: `The calculator has a first and a second talent set to plan in. The level the second set unlocks, ${dual}, comes from the beta notes and not from the game files, so it is unconfirmed.`,
  };
}
