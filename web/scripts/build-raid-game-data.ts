// Trims the raid buff table and talent catalog that `client-catalog` writes (kb/src/raid-buffs.ts,
// everloot.raid-buffs/2) into the two files the site and the addon commit:
//   web/src/data/game-data/raid-<build>.json   and   addon/modules/raid_data.lua
// Usage, from web/:  npx tsx scripts/build-raid-game-data.ts <catalog dir> <snapshot.sqlite>
// where <catalog dir> is data/catalog/<product>-<build>-<config> and the snapshot is the one it was made from
// (its SpellEffect rows are needed to follow learn-spell and trigger-spell links). Reads game file data (Blizzard's); see
// web/src/data/game-data/README.md. Keeps ids, names, scope and, where ranks disagree, the per-rank scope.
// Drops tooltip text, effects and everything else.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { readClientRows } from "../../kb/src/client-snapshot.js";

const dir = resolve(process.argv[2] ?? "");
const snapshot = resolve(process.argv[3] ?? "");
const root = resolve(__dirname, "..", "..");
const table = JSON.parse(readFileSync(join(dir, "raid-buffs.json"), "utf8"));
if (table.schema !== "everloot.raid-buffs/2") throw new Error(`expected everloot.raid-buffs/2, got ${table.schema}`);

// Which effect a group cast shares with its single-target cast. Our grouping, read off the spell names.
const GROUP_CAST_OF: Record<string, string> = {
  "gift-of-the-wild": "mark-of-the-wild",
  "arcane-brilliance": "arcane-intellect",
  "prayer-of-fortitude": "power-word-fortitude",
  "prayer-of-spirit": "divine-spirit",
  "prayer-of-shadow-protection": "shadow-protection",
  "greater-blessing-of-might": "blessing-of-might",
  "greater-blessing-of-kings": "blessing-of-kings",
  "greater-blessing-of-wisdom": "blessing-of-wisdom",
  "greater-blessing-of-salvation": "blessing-of-salvation",
};

interface RawEntry {
  id: string; label: string; kind: "buff" | "debuff"; class: string | null; scope: string | null;
  byRank: { rank: number | null; spellIds: number[]; scope: string }[];
  spells: { spellId: number; name: string }[];
}
const raw: RawEntry[] = table.entries.filter((e: RawEntry) => e.byRank.length > 0 && e.scope !== null);
const byId = new Map(raw.map((e) => [e.id, e]));

interface Catalog { className: string; trees: { name: string; order: number; nodes: { entries: { spellId: number; name: string | null }[] }[] }[] }
const catalogs: Catalog[] = readdirSync(join(dir, "talents")).filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => JSON.parse(readFileSync(join(dir, "talents", f), "utf8")))
  .map((c: Catalog) => ({ ...c, trees: [...c.trees].sort((x, y) => x.order - y.order) }));
const trees: Record<string, string[]> = {};
for (const c of catalogs) trees[c.className.toLowerCase()] = c.trees.map((t) => t.name);

/**
 * Spells a talent spell leads to, from the SpellEffect rows: a learn-spell (36) or trigger-spell (64) effect, or
 * an apply-aura effect (6) whose aura triggers a spell (23 periodic, 42 proc, 109 target trigger), to a depth of
 * three. A shapeshift form that triggers its aura (Moonkin Form -> Moonkin Aura) is the same link.
 */
const TRIGGERS = new Map<number, number[]>();
for (const e of readClientRows(snapshot, "SpellEffect").values()) {
  const trigger = Number(e.EffectTriggerSpell);
  if (!trigger || Number(e.DifficultyID) !== 0) continue;
  const effect = Number(e.Effect), aura = Number(e.EffectAura);
  if (effect === 36 || effect === 64 || (effect === 6 && [23, 42, 109].includes(aura))) {
    TRIGGERS.set(Number(e.SpellID), [...(TRIGGERS.get(Number(e.SpellID)) ?? []), trigger]);
  }
}
const MAX_DEPTH = 3;
function reachable(start: number): Map<number, number> {
  const depth = new Map([[start, 0]]);
  let frontier = [start];
  for (let d = 1; d <= MAX_DEPTH; d++) {
    const next: number[] = [];
    for (const s of frontier) for (const t of TRIGGERS.get(s) ?? []) if (!depth.has(t)) { depth.set(t, d); next.push(t); }
    frontier = next;
  }
  return depth;
}

type Gate = { tree: "baseline" | "unknown" | 1 | 2 | 3; proof?: "talent spell" | "spell chain" | "talent name"; via?: string };
/**
 * Which tree a class needs for an effect, from the talent catalog and the spell links above. In order of proof:
 * a talent whose spell is one of the effect's spell ids ("talent spell"); a talent whose spell leads to one of
 * them by learn or trigger links ("spell chain"); a talent with the effect's own spell name ("talent name").
 * The first kind that matches decides. "baseline" when no talent matches, "unknown" when matches are in more
 * than one tree.
 */
function gateOf(e: { class: string; spellIds: number[]; names: string[] }): Gate {
  const catalog = catalogs.find((c) => c.className.toLowerCase() === e.class);
  if (!catalog) return { tree: "unknown" };
  const ids = new Set(e.spellIds);
  const names = new Set(e.names);
  const found: Record<NonNullable<Gate["proof"]>, Map<number, string>> = { "talent spell": new Map(), "spell chain": new Map(), "talent name": new Map() };
  catalog.trees.forEach((t, i) => t.nodes.forEach((n) => n.entries.forEach((en) => {
    const reach = reachable(en.spellId);
    const hit = [...reach.keys()].find((id) => ids.has(id));
    if (hit !== undefined) found[reach.get(hit) === 0 ? "talent spell" : "spell chain"].set(i + 1, `${en.name ?? en.spellId} (${en.spellId}) -> ${hit}`);
    else if (en.name && names.has(en.name)) found["talent name"].set(i + 1, `${en.name} (${en.spellId})`);
  })));
  for (const proof of ["talent spell", "spell chain", "talent name"] as const) {
    const hit = found[proof];
    if (hit.size === 0) continue;
    return hit.size === 1 ? { tree: [...hit.keys()][0] as 1 | 2 | 3, proof, via: [...hit.values()][0] } : { tree: "unknown", proof };
  }
  return { tree: "baseline" };
}

const gates = new Map<string, Gate>();
const entries = raw.map((e) => {
  const spellIds = [...new Set(e.byRank.flatMap((r) => r.spellIds))].sort((a, b) => a - b);
  const names = [...new Set(e.spells.map((s) => s.name))];
  const cls = (e.class ?? "").toLowerCase();
  return {
    id: e.id, label: e.label, kind: e.kind, class: cls,
    family: GROUP_CAST_OF[e.id] ?? e.id, scope: e.scope, ...(() => { const g = gateOf({ class: cls, spellIds, names }); gates.set(e.id, g); return { tree: g.tree, ...(g.proof ? { treeProof: g.proof } : {}) }; })(), names, spellIds,
    ...(e.scope === "mixed" ? { byRank: e.byRank.map((r) => ({ rank: r.rank, spellIds: r.spellIds, scope: r.scope })) } : {}),
  };
});
const families = [...new Set(entries.map((e) => e.family))].map((id) => {
  const e = byId.get(id)!;
  return { id, label: e.label, kind: e.kind };
});

const out = {
  schema: "everloot.web-raid-data/1",
  label: "Found in game files, unconfirmed",
  source: "everloot.raid-buffs/2 and everloot.talent-catalog, trimmed to ids, names and scope",
  build: table.build.version as string,
  notFound: table.notFound as string[],
  families, entries, trees,
};
writeFileSync(join(root, "web", "src", "data", "game-data", `raid-${out.build}.json`), JSON.stringify(out, null, 1) + "\n");

const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const buffs = entries.filter((e) => e.kind === "buff");
const lua = [
  "-- Raid buff table for the raid module, generated by web/scripts/build-raid-game-data.ts from",
  `-- web/src/data/game-data/raid-${out.build}.json (the same ids, families, scopes, aura names and spell ids;`,
  "-- web/src/lib/raid.test.ts fails if the two differ). Read from the game files of the build below,",
  "-- unconfirmed. Debuffs are left out: the module reads players' own auras, not the boss.",
  "",
  "Everloot = Everloot or {}",
  "Everloot.RaidData = {",
  `  build = ${q(out.build)},`,
  "  families = {",
  ...families.filter((f) => f.kind === "buff").map((f) => `    { id = ${q(f.id)}, label = ${q(f.label)} },`),
  "  },",
  "  buffs = {",
  ...buffs.map((e) => `  { family = ${q(e.family)}, id = ${q(e.id)}, scope = ${q(e.scope!)}, names = {${e.names.map(q).join(", ")}}, spellIds = {${e.spellIds.join(", ")}} },`),
  "  },",
  "}",
  "",
].join("\n");
writeFileSync(join(root, "addon", "modules", "raid_data.lua"), lua);
for (const e of entries) if (e.tree !== "baseline") console.log(`${e.id}: tree ${e.tree}, ${gates.get(e.id)!.proof}: ${gates.get(e.id)!.via ?? "matches in several trees"}`);
console.log(`${entries.length} entries, ${families.length} families, not found: ${out.notFound.join(", ") || "none"}`);
