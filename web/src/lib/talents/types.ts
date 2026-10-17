// The talent catalog the calculator reads. The shape follows the catalog being defined in
// kb/src/talents/catalog.ts (feat/client-extract-talents): trees, nodes with a position, max ranks,
// entries, prerequisites and unlock gates. Until that lands, `src/data/talents/*.json` is built from
// Talents Forever's export (scripts/import-talentsforever.mjs). `adapter.ts` accepts either source.

export type NodeKind = "single" | "choice";

export interface TalentEntry {
  /** Blizzard's trait definition id. Null until the client extract supplies it. */
  definitionId: number | null;
  /** Spell id of the talent's spell, only where the source gives one. Null otherwise. */
  spellId: number | null;
  name: string;
}

export interface TalentNode {
  id: number;
  treeId: number;
  /** 1-based grid position, top row first. */
  row: number;
  col: number;
  maxRanks: number;
  kind: NodeKind;
  /** One entry for a single node, two or more for a choice node. */
  entries: TalentEntry[];
  /** Node ids that must be at full rank before this node can take a point. */
  prereqs: number[];
  /** Points that must already be spent before this node can take a point. */
  unlock?: {
    /** In nodes of this tree on rows above this one. */
    pointsInTree?: number;
    /** In every other node of the build, in any tree. */
    pointsTotal?: number;
  };
}

export interface TalentTree {
  id: number;
  name: string;
}

export interface PointRules {
  /** The first level that earns a talent point; one point per level from here. */
  firstPointLevel: number;
  maxLevel: number;
  /** Level at which the second talent set unlocks. */
  dualSpecLevel: number;
  /** "unconfirmed" until Everloot has read the rules from the game itself. */
  status: "confirmed" | "unconfirmed";
  note: string;
}

export interface TalentCatalog {
  classId: number;
  classSlug: string;
  className: string;
  specId: number;
  /** The game build the layout was read from, for example 1.60.1.70425. */
  build: string;
  source: {
    name: string;
    url: string;
    licence: string;
    licenceUrl: string;
    retrieved: string;
    /** What this source is, in a phrase the page can show. */
    kind: string;
  };
  rules: PointRules;
  trees: TalentTree[];
  nodes: TalentNode[];
}

/** Ranks spent per node id. `choice` is the chosen entry index, for choice nodes. */
export type Ranks = Record<number, { rank: number; choice?: number }>;
