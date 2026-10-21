/**
 * The Classic 1.12 baseline from pfQuest's database (github.com/shagu/pfQuest), read from a local
 * download into the source database as `pfquest-classic` rows. The source is not publishable: the release
 * build drops it and `audit-sources` reports it. Its job is to say what Forever players still need to
 * confirm (docs/design/specs/2026-10-17-classic-baseline-design.md).
 *
 * The download is untrusted data. Its Lua is never run: `parseLuaData` reads only the literal tables these
 * files hold and throws on anything else. Only the vanilla files are read (no `-tbc`), and from the enUS
 * locale only names and quest titles; quest objective and description text (`O`, `D`) is Blizzard's prose
 * and is never stored. The checkout must be at `PFQUEST_COMMIT` unless the caller says otherwise.
 *
 * The entities table's kind check has no `object` (changing it would break the served release's exact
 * schema check), so objects are stored as `npc` rows with the ext id `object:<id>`. Every row says what it
 * is in `data.entity`: `unit`, `object`, `item` or `quest`. Reference loot (`refloot.lua`, loot tables many
 * sources share) stays a join: an item row lists the tables it is in and a unit or object row the tables it
 * rolls, since spelling every pair out would be 1.4 million drops.
 *
 * pfQuest places spawns by AreaTable zone id, in percent of that zone's map. Uploads use the UiMap id, so
 * each spawn also gets the UiMap id Everloot's own client snapshot assigns to that area (UiMapAssignment,
 * then AreaTable's parent chain). Without a snapshot, or for an area with no UiMap (most instances), it
 * keeps the area id only.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { readClientRows } from "../client-snapshot.js";
import type { DB } from "../db.js";
import { replaceSourceRows, type EntityInput } from "../entities.js";

/** The pfQuest commit the baseline is read from. Another commit needs `allowOtherCommit`. */
export const PFQUEST_COMMIT = "104f35678ca39ab1fb78b655f815cc7016f5e0c8";

export const PFQUEST_DATA_FILES = ["units", "objects", "items", "quests", "refloot", "zones"] as const;
export const PFQUEST_NAME_FILES = ["units", "objects", "items", "quests"] as const;

/**
 * GM, test and placeholder entries left in the emulator data: a name or quest title carrying one of the
 * markers Blizzard's internal data uses (`<TEST>`, `<TXT>`, `<NYI>`, `<UNUSED>`, `[UNUSED]`, `[PH]`, `[DND]`,
 * "(Only GM can see it)"), one of the words UNUSED, TEST, DEPRECATED or NYI in capitals, or an `OLD` prefix
 * glued to the name ("OLDRecruit's Belt"). Case-sensitive, so "Test of Faith" stays.
 */
export const JUNK_NAME = /<(?:TEST|TXT|NYI|UNUSED|PH|DND)>|\[(?:UNUSED|PH|DND|NYI|TEST)\]|\(Only GM can see it\)|\b(?:UNUSED|TEST|DEPRECATED|NYI)\b|^OLD[A-Z]/;

export type LuaData = number | string | boolean | LuaTable;
/** A Lua table: positional entries are keyed 1, 2, 3 …, in file order. */
export type LuaTable = Map<number | string, LuaData>;

const MAX_DEPTH = 16;

/**
 * Reads `pfDB["a"]["b"] = { … }`: nested tables with `[number] =`, `["string"] =` and positional entries,
 * numbers, quoted strings and booleans. Anything else (a call, a variable, an operator) throws, so a file
 * that is not plain data is refused rather than misread. Returns the assigned table.
 */
export function parseLuaData(text: string, path = "input"): LuaTable {
  let i = 0;
  const fail = (why: string): never => {
    throw new Error(`${path}: ${why} at offset ${i}: ${JSON.stringify(text.slice(i, i + 24))}`);
  };
  const ws = () => {
    for (;;) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else if (c === 45 && text.charCodeAt(i + 1) === 45) {
        while (i < text.length && text[i] !== "\n") i++;
      } else return;
    }
  };
  const expect = (s: string) => {
    ws();
    if (!text.startsWith(s, i)) fail(`expected ${s}`);
    i += s.length;
  };
  const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'" };
  const str = (): string => {
    const q = text[i++];
    let out = "";
    for (;;) {
      if (i >= text.length || text[i] === "\n") fail("unterminated string");
      const c = text[i++];
      if (c === q) return out;
      if (c !== "\\") { out += c; continue; }
      const e = text[i++];
      if (e in ESCAPES) out += ESCAPES[e];
      else if (/\d/.test(e)) {
        const m = /^\d{1,3}/.exec(text.slice(i - 1, i + 2))!;
        i += m[0].length - 1;
        out += String.fromCharCode(Number(m[0]));
      } else fail("unknown string escape");
    }
  };
  const value = (depth: number): LuaData => {
    ws();
    const c = text[i];
    if (c === "{") return table(depth + 1);
    if (c === '"' || c === "'") return str();
    if (text.startsWith("true", i)) { i += 4; return true; }
    if (text.startsWith("false", i)) { i += 5; return false; }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (m) { i += m[0].length; return Number(m[0]); }
    return fail("not a data value");
  };
  const table = (depth: number): LuaTable => {
    if (depth > MAX_DEPTH) fail("tables nested too deep");
    i++; // {
    const t: LuaTable = new Map();
    let next = 1;
    for (;;) {
      ws();
      if (text[i] === "}") { i++; return t; }
      if (text[i] === "[") {
        i++;
        const key = value(depth);
        if (typeof key !== "number" && typeof key !== "string") fail("table key is not a number or string");
        expect("]");
        expect("=");
        t.set(key as number | string, value(depth));
      } else {
        t.set(next++, value(depth));
      }
      ws();
      if (text[i] === "," || text[i] === ";") i++;
      else if (text[i] !== "}") fail("expected , or }");
    }
  };

  expect("pfDB");
  for (let n = 0; n < 2; n++) {
    expect("[");
    ws();
    if (text[i] !== '"') fail("expected a quoted key");
    str();
    expect("]");
  }
  expect("=");
  ws();
  if (text[i] !== "{") fail("expected a table");
  const out = table(0);
  ws();
  if (i !== text.length) fail("text after the table");
  return out;
}

/** The checkout's HEAD commit, read from `.git` without running git (a downloaded repository's config could run code). */
export function checkoutCommit(dir: string): string | null {
  const git = join(dir, ".git");
  if (!existsSync(git) || !statSync(git).isDirectory()) return null;
  const head = readFileSync(join(git, "HEAD"), "utf8").trim();
  if (/^[0-9a-f]{40}$/.test(head)) return head;
  const ref = /^ref: (refs\/[\w./-]+)$/.exec(head)?.[1];
  if (!ref || ref.includes("..")) return null;
  const loose = join(git, ref);
  if (existsSync(loose)) return readFileSync(loose, "utf8").trim();
  const packed = join(git, "packed-refs");
  if (!existsSync(packed)) return null;
  for (const line of readFileSync(packed, "utf8").split("\n")) {
    const [sha, name] = line.trim().split(" ");
    if (name === ref && /^[0-9a-f]{40}$/.test(sha)) return sha;
  }
  return null;
}

/** AreaTable id -> UiMap id, from a client snapshot's UiMapAssignment and AreaTable. */
export function areaToUiMap(snapshotPath: string): Map<number, number> {
  const direct = new Map<number, { uiMapId: number; order: number }>();
  for (const a of readClientRows(snapshotPath, "UiMapAssignment").values()) {
    const area = Number(a.AreaID), uiMapId = Number(a.UiMapID), order = Number(a.OrderIndex);
    if (!Number.isInteger(area) || area < 1 || !Number.isInteger(uiMapId) || uiMapId < 1) continue;
    const seen = direct.get(area);
    if (!seen || order < seen.order) direct.set(area, { uiMapId, order });
  }
  const parent = new Map<number, number>();
  for (const a of readClientRows(snapshotPath, "AreaTable").values()) {
    const id = Number(a.ID), up = Number(a.ParentAreaID);
    if (Number.isInteger(id) && Number.isInteger(up) && up > 0) parent.set(id, up);
  }
  const out = new Map<number, number>();
  const areas = new Set([...direct.keys(), ...parent.keys()]);
  for (const area of areas) {
    // Walk up to the first area a UiMap is assigned to; the depth cap guards a parent loop.
    let at: number | undefined = area;
    for (let hops = 0; at !== undefined && hops < 8; hops++, at = parent.get(at)) {
      const hit = direct.get(at);
      if (hit) { out.set(area, hit.uiMapId); break; }
    }
  }
  return out;
}

export interface Spawn {
  x: number;
  y: number;
  areaId: number;
  /** The UiMap the area lies on, as uploads name maps; absent when Everloot's data has none for it. */
  uiMapId?: number;
  respawnSecs: number;
}

/** A direct drop on an item row: the source and its chance in percent, as pfQuest gives it. */
export interface Drop {
  npc?: number;
  object?: number;
  chance: number;
}

/** A reference loot table: on an item row, the item's chance within it; on a unit or object row, the table's chance there. */
export interface RefLoot {
  ref: number;
  chance: number;
}

export interface PfquestImport {
  commit: string;
  rows: { units: number; objects: number; items: number; quests: number };
  skipped: { junk: number; unnamed: number };
  spawns: { total: number; mapped: number; unmappedAreas: Record<string, number> };
}

const num = (v: LuaData | undefined): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const asTable = (v: LuaData | undefined): LuaTable | undefined => (v instanceof Map ? v : undefined);
const ids = (v: LuaData | undefined): number[] => [...(asTable(v)?.values() ?? [])].filter((x): x is number => typeof x === "number");
/** `{ [id] = value }` as pairs, for drop and vendor lists. */
const pairs = (v: LuaData | undefined): [number, number][] =>
  [...(asTable(v)?.entries() ?? [])].filter((e): e is [number, number] => typeof e[0] === "number" && typeof e[1] === "number");
/** A table of id lists (`start`, `end`, `obj`) as plain arrays; other values are dropped. */
const idLists = (v: LuaData | undefined): Record<string, number[]> => {
  const out: Record<string, number[]> = {};
  for (const [k, list] of asTable(v)?.entries() ?? []) if (typeof k === "string") out[k] = ids(list);
  return out;
};

/** "10-12" or "63" -> [10, 12] or [63, 63]. */
function levelRange(v: LuaData | undefined): [number, number] | null {
  const m = /^(\d+)(?:-(\d+))?$/.exec(String(v ?? "").trim());
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
}

/**
 * Reads the pinned pfQuest checkout at `dir` and replaces every `pfquest-classic` row in `db` with it.
 * `snapshotPath` is an Everloot client snapshot for the area -> UiMap mapping.
 */
export async function importPfquest(
  db: DB,
  dir: string,
  opts: { snapshotPath?: string; allowOtherCommit?: boolean; now?: Date } = {},
): Promise<PfquestImport> {
  const commit = checkoutCommit(dir);
  if (commit !== PFQUEST_COMMIT && !opts.allowOtherCommit) {
    throw new Error(`${dir} is at ${commit ?? "no readable git commit"}, not the pinned pfQuest commit ${PFQUEST_COMMIT.slice(0, 8)}; check it out, or pass --unpinned to read it anyway`);
  }
  const read = (file: string) => {
    const path = join(dir, "db", `${file}.lua`);
    return parseLuaData(readFileSync(path, "utf8"), path);
  };
  const data = Object.fromEntries(PFQUEST_DATA_FILES.map((f) => [f, read(f)])) as Record<(typeof PFQUEST_DATA_FILES)[number], LuaTable>;
  const names = Object.fromEntries(PFQUEST_NAME_FILES.map((f) => [f, read(`enUS/${f}`)])) as Record<(typeof PFQUEST_NAME_FILES)[number], LuaTable>;
  const uiMaps = opts.snapshotPath ? areaToUiMap(opts.snapshotPath) : new Map<number, number>();
  // pfQuest's own zone table names each subzone's zone: the fallback when the snapshot has no UiMap for an area.
  const zoneOf = new Map<number, number>();
  for (const [area, row] of data.zones) {
    const up = num(asTable(row)?.get(1));
    if (typeof area === "number" && up !== undefined && up !== area) zoneOf.set(area, up);
  }
  const uiMapFor = (area: number) => uiMaps.get(area) ?? uiMaps.get(zoneOf.get(area) ?? -1);
  // Which reference tables each unit and object rolls, inverted from refloot.lua.
  const rolls = { U: new Map<number, RefLoot[]>(), O: new Map<number, RefLoot[]>() };
  for (const [ref, table] of data.refloot) {
    if (typeof ref !== "number") continue;
    for (const side of ["U", "O"] as const) {
      for (const [id, chance] of pairs(asTable(table)?.get(side))) rolls[side].set(id, [...(rolls[side].get(id) ?? []), { ref, chance }]);
    }
  }

  const stamp = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const url = (file: string) => `https://github.com/shagu/pfQuest/blob/${commit ?? PFQUEST_COMMIT}/db/${file}.lua`;
  const result: PfquestImport = {
    commit: commit ?? "unknown",
    rows: { units: 0, objects: 0, items: 0, quests: 0 },
    skipped: { junk: 0, unnamed: 0 },
    spawns: { total: 0, mapped: 0, unmappedAreas: {} },
  };
  /** The entry's English name, or null (and counted) when it has none or is junk. */
  const nameOf = (file: (typeof PFQUEST_NAME_FILES)[number], id: number): string | null => {
    const raw = names[file].get(id);
    const name = (typeof raw === "string" ? raw : file === "quests" ? asTable(raw)?.get("T") : undefined) as string | undefined;
    if (typeof name !== "string" || !name.trim()) { result.skipped.unnamed++; return null; }
    if (JUNK_NAME.test(name)) { result.skipped.junk++; return null; }
    return name.trim();
  };
  const spawnsOf = (row: LuaTable): Spawn[] => {
    const out: Spawn[] = [];
    for (const c of asTable(row.get("coords"))?.values() ?? []) {
      const t = asTable(c);
      const [x, y, areaId, respawnSecs] = [1, 2, 3, 4].map((k) => num(t?.get(k)));
      if (x === undefined || y === undefined || areaId === undefined) continue;
      const uiMapId = uiMapFor(areaId);
      result.spawns.total++;
      if (uiMapId !== undefined) result.spawns.mapped++;
      else result.spawns.unmappedAreas[areaId] = (result.spawns.unmappedAreas[areaId] ?? 0) + 1;
      out.push({ x, y, areaId, ...(uiMapId !== undefined ? { uiMapId } : {}), respawnSecs: respawnSecs ?? 0 });
    }
    return out;
  };

  const rows: EntityInput[] = [];
  for (const [id, raw] of data.units) {
    const row = asTable(raw);
    if (typeof id !== "number" || !row) continue;
    const name = nameOf("units", id);
    if (!name) continue;
    const level = levelRange(row.get("lvl"));
    rows.push({
      kind: "npc", extId: String(id), name, gameVersion: "classic", sourceUrl: url("units"), retrievedAt: stamp,
      data: {
        entity: "unit", ...(level ? { minLevel: level[0], maxLevel: level[1] } : {}),
        ...(row.has("rnk") ? { rank: Number(row.get("rnk")) } : {}), ...(row.has("fac") ? { faction: String(row.get("fac")) } : {}),
        spawns: spawnsOf(row), refs: rolls.U.get(id) ?? [],
      },
    });
    result.rows.units++;
  }
  for (const [id, raw] of data.objects) {
    const row = asTable(raw);
    if (typeof id !== "number" || !row) continue;
    const name = nameOf("objects", id);
    if (!name) continue;
    rows.push({
      kind: "npc", extId: `object:${id}`, name, gameVersion: "classic", sourceUrl: url("objects"), retrievedAt: stamp,
      data: { entity: "object", id, ...(row.has("fac") ? { faction: String(row.get("fac")) } : {}), spawns: spawnsOf(row), refs: rolls.O.get(id) ?? [] },
    });
    result.rows.objects++;
  }
  for (const [id, raw] of data.items) {
    const row = asTable(raw);
    if (typeof id !== "number" || !row) continue;
    const name = nameOf("items", id);
    if (!name) continue;
    const drops: Drop[] = [
      ...pairs(row.get("U")).map(([npc, chance]) => ({ npc, chance })),
      ...pairs(row.get("O")).map(([object, chance]) => ({ object, chance })),
    ];
    const refs: RefLoot[] = pairs(row.get("R")).map(([ref, chance]) => ({ ref, chance }));
    rows.push({
      kind: "item", extId: String(id), name, gameVersion: "classic", sourceUrl: url("items"), retrievedAt: stamp,
      data: { entity: "item", drops, refs, vendors: pairs(row.get("V")).map(([npc, count]) => ({ npc, count })) },
    });
    result.rows.items++;
  }
  for (const [id, raw] of data.quests) {
    const row = asTable(raw);
    if (typeof id !== "number" || !row) continue;
    const title = nameOf("quests", id);
    if (!title) continue;
    rows.push({
      kind: "quest", extId: String(id), name: title, gameVersion: "classic", sourceUrl: url("quests"), retrievedAt: stamp,
      data: {
        entity: "quest",
        ...Object.fromEntries((["lvl", "min", "race", "class"] as const).flatMap((k) => (num(row.get(k)) !== undefined ? [[k, num(row.get(k))]] : []))),
        pre: ids(row.get("pre")), start: idLists(row.get("start")), end: idLists(row.get("end")), obj: idLists(row.get("obj")),
      },
    });
    result.rows.quests++;
  }
  await replaceSourceRows(db, "pfquest-classic", ["npc", "item", "quest"], rows);
  return result;
}
