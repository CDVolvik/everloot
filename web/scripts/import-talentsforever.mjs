// Builds web/src/data/talents/<class>.json from Talents Forever's per-class exports.
//
//   node scripts/import-talentsforever.mjs <dir-with-warrior.json-etc> [retrieved-date]
//
// Download the exports first, by hand and slowly (one request per class, a descriptive user agent):
//   https://talentsforever.com/export/<class>.json
// Their data is CC BY 4.0 (https://talentsforever.com/terms, read 2026-10-17); credit and link are
// in THIRD_PARTY.md, docs/sources/LEDGER.md and on the calculator page.
//
// What is taken: tree names, talent names, grid position, max rank, the one prerequisite (by name)
// and the spell id of talents that are spells (found through their spell table, by name).
// What is NOT taken: tooltip text (`desc`, `spell_desc` text, `classic` text), icons, costs. Those
// are Blizzard's and are not covered by the licence.
//
// Node ids are made here, because the export has none: a 20-bit hash of "<class>:<talent name>".
// A name keeps its id when it moves, and the script stops on a collision. The client extract's real
// trait node ids replace these when they exist.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CLASSES = [
  ["warrior", "Warrior", 1, 1491],
  ["paladin", "Paladin", 2, 1486],
  ["hunter", "Hunter", 3, 1485],
  ["rogue", "Rogue", 4, 1488],
  ["priest", "Priest", 5, 1487],
  ["shaman", "Shaman", 7, 1489],
  ["mage", "Mage", 8, 1482],
  ["warlock", "Warlock", 9, 1490],
  ["druid", "Druid", 11, 1484],
];

const [dir, retrieved = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!dir) throw new Error("usage: node scripts/import-talentsforever.mjs <dir> [date]");
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "talents");
mkdirSync(out, { recursive: true });

const fnv1a = (text) => {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

// Assumed, not read from the game: a row opens after five points per row above it.
const GATE_PER_ROW = 5;

for (const [slug, name, classId, specId] of CLASSES) {
  const src = JSON.parse(readFileSync(join(dir, `${slug}.json`), "utf8"));
  const build = /build (\d+(?:\.\d+)+)/.exec(src.talents.source)?.[1];
  if (!build) throw new Error(`${slug}: no build number in talents.source`);

  const trees = [];
  const nodes = [];
  const ids = new Map();
  const byName = new Map();

  src.talents.trees.forEach((tree, i) => {
    const treeId = classId * 10 + i + 1;
    trees.push({ id: treeId, name: tree.name });
    for (const t of tree.talents) {
      const id = fnv1a(`${slug}:${t.name}`) >>> 12;
      if (ids.has(id)) throw new Error(`${slug}: id collision between ${t.name} and ${ids.get(id)}`);
      ids.set(id, t.name);
      byName.set(`${treeId}:${t.name}`, id);
      const spell = src.spell_desc[`${src.class}|${t.name}|Rank 1`];
      nodes.push({
        id,
        treeId,
        row: t.row,
        col: t.col,
        maxRanks: t.max,
        kind: "single",
        entries: [{ definitionId: null, spellId: spell?.id ?? null, name: t.name }],
        prereqs: [],
        ...(t.row > 1 ? { unlock: { pointsInTree: GATE_PER_ROW * (t.row - 1) } } : {}),
        _req: t.req,
        _tree: treeId,
      });
    }
  });

  for (const n of nodes) {
    if (n._req) {
      const id = byName.get(`${n._tree}:${n._req}`);
      if (id === undefined) throw new Error(`${slug}: ${n.entries[0].name} needs unknown ${n._req}`);
      n.prereqs.push(id);
    }
    delete n._req;
    delete n._tree;
  }

  const catalog = {
    classId,
    classSlug: slug,
    className: name,
    specId,
    build,
    source: {
      name: "Talents Forever",
      url: "https://talentsforever.com/",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      retrieved,
      kind: "talent layout, which Talents Forever says it read from the beta client files",
    },
    rules: {
      firstPointLevel: 10,
      maxLevel: 60,
      dualSpecLevel: 40,
      status: "unconfirmed",
      note: "Assumed: one point per level from level 10, five points in a tree per row to open the next, a second talent set at level 40. Not read from the game by Everloot.",
    },
    trees,
    nodes,
  };

  // One node per line, so a diff between builds reads as moved, added or removed talents.
  const head = JSON.stringify({ ...catalog, nodes: undefined }, null, 1).replace(/\n}$/, "");
  const body = nodes.map((n) => "  " + JSON.stringify(n)).join(",\n");
  writeFileSync(join(out, `${slug}.json`), `${head},\n "nodes": [\n${body}\n ]\n}\n`);
  console.log(slug, build, trees.length, "trees", nodes.length, "nodes");
}
