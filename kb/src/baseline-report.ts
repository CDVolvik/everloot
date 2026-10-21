/**
 * What Forever players have confirmed of the Classic baseline (`pfquest-classic`, see
 * kb/src/importers/pfquest.ts) and what they still need to. Each baseline NPC, object, quest, drop and
 * vendor item is set against the corroborated uploads (3 installs agree, `WORLD_AGREEMENT`):
 *
 * - confirmed: Forever matches Classic;
 * - changed: in both, but the zone, level, name, giver or turn-in differs;
 * - new: corroborated in Forever and not in the baseline;
 * - not seen: in the baseline and not corroborated yet, sorted by zone and level so players know where to look.
 *
 * Spawns are compared by zone. The addon records where the player stood (`positionKind = "player"`) unless it
 * read the NPC's own position or its window was open; only those pin positions are checked against the
 * nearest Classic spawn. Drop rates and vendor prices are shown, never judged: pfQuest has no prices, and a
 * few loot windows do not test a rate. Reference loot (tables many sources share) confirms an observed drop
 * but is not counted as not seen, since it spells out 1.4 million pairs.
 *
 * The report is for the maintainer's machine. It is written outside the repository and never published.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { DB } from "./db.js";
import type { DropRate } from "./drop-rollup.js";
import type { Drop, RefLoot, Spawn } from "./importers/pfquest.js";
import { agreedObjectNames, type ObjectSpawnRow } from "./object-spawns.js";
import { agreedNpcNames, npcPage, npcTraits, questPage, vendorPage, WORLD_AGREEMENT, type WorldFacts } from "./world-pages.js";

export const VERDICTS = ["confirmed", "changed", "new", "not_seen"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const SUBJECTS = ["npc", "object", "quest", "drop", "vendor"] as const;
export type Subject = (typeof SUBJECTS)[number];

/** How far, on the 0..100 map scale, an agreed NPC pin may be from the nearest Classic spawn and still match. */
export const POSITION_TOLERANCE = 5;

const NO_SPAWN = "No spawn recorded";

export interface ReportRow {
  subject: Subject;
  /** `448`, or for a drop or vendor item `npc:448>item:1307`. */
  id: string;
  name: string | null;
  zone: string;
  level: number | null;
  /** What differs on a changed row; what was compared, or how much is left, on the others. */
  notes: string[];
}

export interface BaselineReport {
  /** The pfQuest commit the baseline was read from. */
  commit: string | null;
  /** The corpus time; null for local files or no corpus. */
  dataAsOf: string | null;
  /** False when no upload source was connected: every baseline row is then not seen. */
  connected: boolean;
  counts: Record<Subject, Record<Verdict, number>>;
  rows: Record<Verdict, ReportRow[]>;
}

interface Placed { id: number; name: string; spawns: Spawn[]; refs: RefLoot[]; minLevel?: number; maxLevel?: number }
interface BaselineQuest { id: number; title: string; lvl?: number; start: Record<string, number[]>; end: Record<string, number[]> }
interface BaselineItem { id: number; name: string; drops: Drop[]; refs: RefLoot[]; vendors: { npc: number; count: number }[] }

export interface Baseline {
  commit: string | null;
  units: Map<number, Placed>;
  objects: Map<number, Placed>;
  quests: Map<number, BaselineQuest>;
  items: Map<number, BaselineItem>;
}

/** The `pfquest-classic` rows of a source database. */
export function readBaseline(db: DB): Baseline {
  const out: Baseline = { commit: null, units: new Map(), objects: new Map(), quests: new Map(), items: new Map() };
  const rows = db.prepare("SELECT ext_id AS extId, name, data, source_url AS url FROM entities WHERE source_id = 'pfquest-classic'").iterate() as Iterable<{ extId: string; name: string; data: string; url: string }>;
  for (const r of rows) {
    const d = JSON.parse(r.data) as Record<string, any>;
    out.commit ??= /\/blob\/([0-9a-f]{40})\//.exec(r.url)?.[1] ?? null;
    if (d.entity === "unit") {
      out.units.set(Number(r.extId), { id: Number(r.extId), name: r.name, spawns: d.spawns ?? [], refs: d.refs ?? [], minLevel: d.minLevel, maxLevel: d.maxLevel });
    } else if (d.entity === "object") {
      out.objects.set(Number(d.id), { id: Number(d.id), name: r.name, spawns: d.spawns ?? [], refs: d.refs ?? [] });
    } else if (d.entity === "item") {
      out.items.set(Number(r.extId), { id: Number(r.extId), name: r.name, drops: d.drops ?? [], refs: d.refs ?? [], vendors: d.vendors ?? [] });
    } else if (d.entity === "quest") {
      out.quests.set(Number(r.extId), { id: Number(r.extId), title: r.name, lvl: d.lvl, start: d.start ?? {}, end: d.end ?? {} });
    }
  }
  return out;
}

export interface Observed {
  world: WorldFacts;
  /** Drop rates from `rollupDrops`; only public ones (3 installs) count. */
  drops: DropRate[];
  objects: ObjectSpawnRow[];
  dataAsOf: string | null;
  connected: boolean;
}

function groupBy<T>(rows: readonly T[], key: (row: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/** The maps 3 installs saw this id on, wherever on the map they stood. */
function agreedMaps(rows: readonly { installId: string; mapId?: number }[]): number[] {
  const installs = new Map<number, Set<string>>();
  for (const r of rows) {
    if (r.mapId === undefined || !Number.isInteger(r.mapId) || r.mapId < 0 || !r.installId.trim()) continue;
    const set = installs.get(r.mapId) ?? new Set<string>();
    set.add(r.installId.trim());
    installs.set(r.mapId, set);
  }
  return [...installs].filter(([, s]) => s.size >= WORLD_AGREEMENT).map(([m]) => m).sort((a, b) => a - b);
}

const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Sets the baseline against the corroborated uploads. `zoneNames` names UiMap ids (Everloot's map layer);
 * an unnamed one prints as `UiMap <id>`, and a spawn with no UiMap as `Area <id>`.
 */
export function compareBaseline(baseline: Baseline, observed: Observed, zoneNames: ReadonlyMap<number, string>): BaselineReport {
  const counts = Object.fromEntries(SUBJECTS.map((s) => [s, Object.fromEntries(VERDICTS.map((v) => [v, 0]))])) as BaselineReport["counts"];
  const rows = Object.fromEntries(VERDICTS.map((v) => [v, [] as ReportRow[]])) as BaselineReport["rows"];
  const add = (verdict: Verdict, row: ReportRow, n = 1) => {
    rows[verdict].push(row);
    counts[row.subject][verdict] += n;
  };
  const mapName = (id: number) => zoneNames.get(id) ?? `UiMap ${id}`;
  /** The zone most of a source's spawns are in. */
  const zoneOf = (spawns: readonly Spawn[] | undefined): string => {
    if (!spawns?.length) return NO_SPAWN;
    const n = new Map<string, number>();
    for (const s of spawns) {
      const label = s.uiMapId !== undefined ? mapName(s.uiMapId) : `Area ${s.areaId}`;
      n.set(label, (n.get(label) ?? 0) + 1);
    }
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  };
  const classicMaps = (p: Placed) => [...new Set(p.spawns.flatMap((s) => (s.uiMapId !== undefined ? [s.uiMapId] : [])))].sort((a, b) => a - b);
  /** Notes for a source seen on maps the baseline does not have it on; none when the baseline has no mapped spawn. */
  const zoneNotes = (p: Placed, maps: number[]): string[] => {
    const had = classicMaps(p);
    const elsewhere = maps.filter((m) => !had.includes(m));
    return had.length && elsewhere.length ? [`zone: seen in ${elsewhere.map(mapName).join(", ")}; Classic ${had.map(mapName).join(", ")}`] : [];
  };
  const levelLabel = (p: Placed) => (p.minLevel === undefined ? "?" : p.minLevel === p.maxLevel ? String(p.minLevel) : `${p.minLevel}-${p.maxLevel}`);

  // NPCs: corroborated when 3 installs agree on its name or saw it on one map.
  const npcNames = agreedNpcNames(observed.world);
  const seenNpcs = new Set<number>();
  for (const [npcId, list] of groupBy(observed.world.npcs, (r) => r.npcId)) {
    const maps = agreedMaps(list);
    const name = npcNames.get(npcId) ?? null;
    if (!maps.length && !name) continue;
    seenNpcs.add(npcId);
    const { level } = npcTraits(list);
    const b = baseline.units.get(npcId);
    const zone = maps.length ? mapName(maps[0]!) : zoneOf(b?.spawns);
    if (!b) {
      add("new", { subject: "npc", id: String(npcId), name, zone, level, notes: [] });
      continue;
    }
    const notes = zoneNotes(b, maps);
    if (level !== null && b.minLevel !== undefined && (level < b.minLevel || level > (b.maxLevel ?? b.minLevel))) notes.push(`level: ${level}; Classic ${levelLabel(b)}`);
    if (name && !same(name, b.name)) notes.push(`name: "${name}"; Classic "${b.name}"`);
    for (const pin of npcPage(npcId, { npcs: list, quests: [], vendors: [] }).pins) {
      const near = Math.min(...b.spawns.filter((s) => s.uiMapId === pin.mapId).map((s) => Math.hypot(s.x - pin.x, s.y - pin.y)));
      if (Number.isFinite(near) && near > POSITION_TOLERANCE) notes.push(`position: ${pin.x}, ${pin.y} in ${mapName(pin.mapId)}; nearest Classic spawn ${near.toFixed(1)} away`);
    }
    add(notes.length ? "changed" : "confirmed", { subject: "npc", id: String(npcId), name: name ?? b.name, zone, level: level ?? b.minLevel ?? null, notes });
  }
  for (const b of baseline.units.values()) {
    if (!seenNpcs.has(b.id)) add("not_seen", { subject: "npc", id: String(b.id), name: b.name, zone: zoneOf(b.spawns), level: b.minLevel ?? null, notes: [] });
  }

  // Objects: the same, from the loot windows players opened on them.
  const objectNames = agreedObjectNames(observed.objects);
  const seenObjects = new Set<number>();
  for (const [objectId, list] of groupBy(observed.objects, (r) => r.objectId)) {
    const maps = agreedMaps(list);
    const name = objectNames.get(objectId) ?? null;
    if (!maps.length && !name) continue;
    seenObjects.add(objectId);
    const b = baseline.objects.get(objectId);
    const zone = maps.length ? mapName(maps[0]!) : zoneOf(b?.spawns);
    if (!b) {
      add("new", { subject: "object", id: String(objectId), name, zone, level: null, notes: [] });
      continue;
    }
    const notes = zoneNotes(b, maps);
    if (name && !same(name, b.name)) notes.push(`name: "${name}"; Classic "${b.name}"`);
    add(notes.length ? "changed" : "confirmed", { subject: "object", id: String(objectId), name: name ?? b.name, zone, level: null, notes });
  }
  for (const b of baseline.objects.values()) {
    if (!seenObjects.has(b.id)) add("not_seen", { subject: "object", id: String(b.id), name: b.name, zone: zoneOf(b.spawns), level: null, notes: [] });
  }

  // Quests: placed where their giver (or the object that starts them) stands.
  const questZone = (q: BaselineQuest | undefined, giver: number | null): string => {
    const unit = baseline.units.get(q?.start.U?.[0] ?? giver ?? -1);
    if (unit) return zoneOf(unit.spawns);
    const object = baseline.objects.get(q?.start.O?.[0] ?? -1);
    return object ? zoneOf(object.spawns) : NO_SPAWN;
  };
  const seenQuests = new Set<number>();
  for (const [questId, list] of groupBy(observed.world.quests, (r) => r.questId)) {
    const page = questPage(questId, { npcs: [], quests: list, vendors: [] });
    if (page.title === null && page.level === null && page.giverNpcId === null && page.turnInNpcId === null) continue;
    seenQuests.add(questId);
    const b = baseline.quests.get(questId);
    const zone = questZone(b, page.giverNpcId);
    if (!b) {
      add("new", { subject: "quest", id: String(questId), name: page.title, zone, level: page.level, notes: [] });
      continue;
    }
    const notes: string[] = [];
    if (page.level !== null && b.lvl !== undefined && page.level !== b.lvl) notes.push(`level: ${page.level}; Classic ${b.lvl}`);
    const npcList = (ids: number[] | undefined) => (ids?.length ? `NPC ${ids.join(", ")}` : "not an NPC");
    if (page.giverNpcId !== null && !(b.start.U ?? []).includes(page.giverNpcId)) notes.push(`giver: NPC ${page.giverNpcId}; Classic ${npcList(b.start.U)}`);
    if (page.turnInNpcId !== null && !(b.end.U ?? []).includes(page.turnInNpcId)) notes.push(`turn-in: NPC ${page.turnInNpcId}; Classic ${npcList(b.end.U)}`);
    if (page.title !== null && !same(page.title, b.title)) notes.push(`title: "${page.title}"; Classic "${b.title}"`);
    add(notes.length ? "changed" : "confirmed", { subject: "quest", id: String(questId), name: page.title ?? b.title, zone, level: page.level ?? b.lvl ?? null, notes });
  }
  for (const b of baseline.quests.values()) {
    if (!seenQuests.has(b.id)) add("not_seen", { subject: "quest", id: String(b.id), name: b.title, zone: questZone(b, null), level: b.lvl ?? null, notes: [] });
  }

  // Drops: an observed public rate against the item's Classic sources, direct or through a shared loot table.
  const source = (kind: "npc" | "object", id: number) => (kind === "npc" ? baseline.units.get(id) : baseline.objects.get(id));
  const sourceLabel = (kind: "npc" | "object", id: number) => source(kind, id)?.name ?? `${kind === "npc" ? "NPC" : "Object"} ${id}`;
  const itemLabel = (id: number) => baseline.items.get(id)?.name ?? `Item ${id}`;
  const seenDrops = new Set<string>();
  for (const r of observed.drops) {
    if (!r.public) continue;
    const kind = r.sourceNpcId !== undefined ? "npc" : "object";
    const sourceId = (r.sourceNpcId ?? r.sourceObjectId)!;
    const key = `${kind}:${sourceId}>item:${r.itemId}`;
    seenDrops.add(key);
    const item = baseline.items.get(r.itemId);
    const direct = item?.drops.find((d) => (kind === "npc" ? d.npc : d.object) === sourceId);
    const rolled = new Set((source(kind, sourceId)?.refs ?? []).map((x) => x.ref));
    const viaRef = item?.refs.find((x) => rolled.has(x.ref));
    const row = {
      subject: "drop" as const, id: key, name: `${itemLabel(r.itemId)} from ${sourceLabel(kind, sourceId)}`,
      zone: zoneOf(source(kind, sourceId)?.spawns), level: (source(kind, sourceId) as Placed | undefined)?.minLevel ?? null,
    };
    const seen = `observed ${pct(r.rate)} over ${r.kills} windows`;
    if (direct) add("confirmed", { ...row, notes: [`${seen}; Classic ${direct.chance}%`] });
    else if (viaRef) add("confirmed", { ...row, notes: [`${seen}; Classic through loot table ${viaRef.ref} (${viaRef.chance}% within it)`] });
    else add("new", { ...row, notes: [seen] });
  }
  // Not seen: one row per source, with how many of its direct Classic drops no public rate has yet.
  const unseen = new Map<string, number>();
  for (const item of baseline.items.values()) {
    for (const d of item.drops) {
      const kind = d.npc !== undefined ? "npc" : "object";
      const id = (d.npc ?? d.object)!;
      if (seenDrops.has(`${kind}:${id}>item:${item.id}`)) continue;
      unseen.set(`${kind}:${id}`, (unseen.get(`${kind}:${id}`) ?? 0) + 1);
    }
  }
  for (const [key, n] of unseen) {
    const [kind, idText] = key.split(":") as ["npc" | "object", string];
    const p = source(kind, Number(idText));
    const refs = p?.refs.length ? `; also rolls ${p.refs.length} shared loot table${p.refs.length === 1 ? "" : "s"}` : "";
    add("not_seen", { subject: "drop", id: key, name: sourceLabel(kind, Number(idText)), zone: zoneOf(p?.spawns), level: p?.minLevel ?? null, notes: [`${n} Classic drop${n === 1 ? "" : "s"} without a public rate${refs}`] }, n);
  }

  // Vendor items: an agreed offer against Classic's vendor lists. pfQuest has no prices, so a price is only shown.
  const classicVendors = new Set<string>();
  for (const item of baseline.items.values()) for (const v of item.vendors) classicVendors.add(`npc:${v.npc}>item:${item.id}`);
  const seenOffers = new Set<string>();
  for (const [vendorNpcId, list] of groupBy(observed.world.vendors, (r) => r.vendorNpcId)) {
    for (const offer of vendorPage(vendorNpcId, { npcs: [], quests: [], vendors: list }).offers) {
      // One row per item: a vendor can be agreed on two prices for it.
      const key = `npc:${vendorNpcId}>item:${offer.itemId}`;
      if (seenOffers.has(key)) continue;
      seenOffers.add(key);
      const b = baseline.units.get(vendorNpcId);
      const row = { subject: "vendor" as const, id: key, name: `${itemLabel(offer.itemId)} at ${sourceLabel("npc", vendorNpcId)}`, zone: zoneOf(b?.spawns), level: b?.minLevel ?? null };
      add(classicVendors.has(key) ? "confirmed" : "new", { ...row, notes: [`${offer.priceCopper} copper; ${offer.reporters} reporters`] });
    }
  }
  const unsold = new Map<number, number>();
  for (const key of classicVendors) {
    if (seenOffers.has(key)) continue;
    const npc = Number(/^npc:(\d+)>/.exec(key)![1]);
    unsold.set(npc, (unsold.get(npc) ?? 0) + 1);
  }
  for (const [npc, n] of unsold) {
    const b = baseline.units.get(npc);
    add("not_seen", { subject: "vendor", id: `npc:${npc}`, name: sourceLabel("npc", npc), zone: zoneOf(b?.spawns), level: b?.minLevel ?? null, notes: [`${n} Classic item${n === 1 ? "" : "s"} for sale not agreed yet`] }, n);
  }

  // Zone, then level, so a player can work through one zone at a time. Rows with no place go last.
  const lastZone = (z: string) => (z === NO_SPAWN ? 2 : z.startsWith("Area ") || z.startsWith("UiMap ") ? 1 : 0);
  for (const list of Object.values(rows)) {
    list.sort((a, b) =>
      lastZone(a.zone) - lastZone(b.zone) || a.zone.localeCompare(b.zone) || (a.level ?? 999) - (b.level ?? 999) ||
      SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject) || a.id.localeCompare(b.id, "en", { numeric: true }));
  }
  return { commit: baseline.commit, dataAsOf: observed.dataAsOf, connected: observed.connected, counts, rows };
}

const SUBJECT_LABEL: Record<Subject, string> = { npc: "NPCs", object: "Objects", quest: "Quests", drop: "Drops", vendor: "Vendor items" };
const VERDICT_LABEL: Record<Verdict, string> = { confirmed: "Confirmed", changed: "Changed", new: "New in Forever", not_seen: "Not seen yet" };

const cell = (s: string) => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");

export function formatBaselineReport(report: BaselineReport): string {
  const lines = [
    "# Classic baseline report",
    "",
    "Local only: never published, never committed. The baseline is pfQuest's Classic 1.12 database " +
      `(commit ${report.commit?.slice(0, 8) ?? "unknown"}); a row is corroborated when ${WORLD_AGREEMENT} installs agree.`,
    report.connected
      ? `Uploads: ${report.dataAsOf ? `as of ${report.dataAsOf}` : "local files"}.`
      : "Uploads: not connected or unreadable (EVERLOOT_PUBLIC_CORPUS_URL, EVERLOOT_UPLOADS), so everything is not seen yet. This is not a measured zero.",
    "Spawns are compared by zone; only pins from the NPC's own position or its window are checked against Classic spawns. " +
      "Drops and vendor items count pairs; shared loot tables are not counted as not seen.",
    "",
    "| | Confirmed | Changed | New in Forever | Not seen yet |",
    "|---|---|---|---|---|",
    ...SUBJECTS.map((s) => `| ${SUBJECT_LABEL[s]} | ${VERDICTS.map((v) => report.counts[s][v]).join(" | ")} |`),
  ];
  for (const verdict of ["changed", "new", "confirmed"] as const) {
    lines.push("", `## ${VERDICT_LABEL[verdict]}`, "");
    if (!report.rows[verdict].length) { lines.push("None."); continue; }
    lines.push("| Zone | Level | What | Id | Name | Notes |", "|---|---|---|---|---|---|");
    for (const r of report.rows[verdict]) lines.push(`| ${cell(r.zone)} | ${r.level ?? ""} | ${r.subject} | ${r.id} | ${cell(r.name ?? "")} | ${cell(r.notes.join("; "))} |`);
  }
  lines.push("", `## ${VERDICT_LABEL.not_seen}, by zone`);
  let zone: string | null = null;
  for (const r of report.rows.not_seen) {
    if (r.zone !== zone) {
      zone = r.zone;
      lines.push("", `### ${zone}`, "", "| Level | What | Id | Name | Notes |", "|---|---|---|---|---|");
    }
    lines.push(`| ${r.level ?? ""} | ${r.subject} | ${r.id} | ${cell(r.name ?? "")} | ${cell(r.notes.join("; "))} |`);
  }
  return `${lines.join("\n")}\n`;
}

/** The repository root, found from this file. The report must never be written inside it. */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Writes `baseline-report.md` and `baseline-report.json` to `outDir`, which must be outside the repository. */
export function writeBaselineReport(report: BaselineReport, outDir: string, repoRoot = REPO_ROOT): { markdown: string; json: string } {
  const out = resolve(outDir);
  const rel = relative(resolve(repoRoot), out);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error(`refusing to write the baseline report inside the repository (${out}); pick a folder outside it`);
  }
  mkdirSync(out, { recursive: true });
  const markdown = join(out, "baseline-report.md");
  const json = join(out, "baseline-report.json");
  writeFileSync(markdown, formatBaselineReport(report));
  writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);
  return { markdown, json };
}
