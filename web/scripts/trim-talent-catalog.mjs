// Copies the fields the talent calculator needs out of the talent catalog that
// `npm run kb -- client-catalog` writes, into web/src/data/game-data/talents/<class>.json.
//
//   node scripts/trim-talent-catalog.mjs <catalog-dir>/talents
//
// Kept: build stamp, class and tree names, node ids, positions, kind, ranks, prerequisites,
// unlock gates, point levels, and per entry the definition id, spell id, name and ranks.
// Dropped: spell descriptions, aura text, effect numbers, durations and icon ids. Those are Blizzard
// text and art; they wait for the data policy change (docs/DATA_POLICY.md) and an asset step.
//
// The output is Blizzard's data, read from the game files by our extractor. See that folder's README.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/trim-talent-catalog.mjs <catalog-dir>/talents");
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "game-data", "talents");
mkdirSync(out, { recursive: true });

const SCHEMA = "everloot.talent-catalog/1";

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json").sort()) {
  const src = JSON.parse(readFileSync(join(dir, file), "utf8"));
  if (src.schema !== SCHEMA) throw new Error(`${file}: schema ${src.schema}, expected ${SCHEMA}`);
  if (src.warnings.length > 0) console.warn(file, "warnings:", src.warnings);

  const trimmed = {
    schema: src.schema,
    label: src.label,
    build: src.build,
    classId: src.classId,
    className: src.className,
    specId: src.specId,
    traitTreeId: src.traitTreeId,
    pointLevels: src.pointLevels,
    trees: src.trees.map((t) => ({
      id: t.id,
      name: t.name,
      order: t.order,
      nodes: t.nodes.map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        row: n.row,
        col: n.col,
        kind: n.kind,
        maxRanks: n.maxRanks,
        entries: n.entries.map((e) => ({ definitionId: e.definitionId, spellId: e.spellId, name: e.name, maxRanks: e.maxRanks })),
        prereqs: n.prereqs,
        unlock: n.unlock,
      })),
    })),
  };

  // One node per line, so a diff between builds reads as moved, added or removed talents.
  const { trees, ...head } = trimmed;
  const headText = JSON.stringify(head, null, 1).replace(/\n}$/, "");
  const treeText = trees
    .map((t) => {
      const { nodes, ...th } = t;
      return `  {${JSON.stringify(th).slice(1, -1)},"nodes":[\n${nodes.map((n) => "   " + JSON.stringify(n)).join(",\n")}\n  ]}`;
    })
    .join(",\n");
  const name = String(src.className).toLowerCase();
  writeFileSync(join(out, `${name}.json`), `${headText},\n "trees": [\n${treeText}\n ]\n}\n`);
  console.log(name, src.build.version, trimmed.trees.length, "trees", trimmed.trees.reduce((n, t) => n + t.nodes.length, 0), "nodes");
}
