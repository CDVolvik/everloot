/**
 * The census rollup: who plays what on WoW: Forever, from the census_self and census_seen rows of
 * installs that turned the census on (docs/design/specs/2026-10-18-census-design.md, §5 and §6).
 *
 * - One character, one count: the latest row per characterKey, across both kinds and every install.
 * - Two windows: the last 7 UTC days, today included (the headline), and since launch. Rows from
 *   before launch (the beta) and rows dated after the corpus was current are not counted.
 * - A count shows only when it covers at least 10 characters reported by at least 3 installs; below
 *   that it is null, which the page and the MCP tool read as "fewer than 10".
 * - Every count that shows is rounded to the nearest 5, each from its own true number. A total is
 *   never the sum of its rounded parts, so subtracting the shown parts from a total gives a range,
 *   not the hidden part.
 * - The output carries counts only: no characterKey, install id, event id, server id or realm.
 *
 * One global view for now. Step 4 of the spec maps realms to ruleset and region; it will group the
 * rows first and call rollupCensus once per group with that group's scope.
 */

export const CENSUS_MIN_CHARACTERS = 10;
export const CENSUS_MIN_INSTALLS = 3;
export const CENSUS_ROUND_TO = 5;
/** Days in the headline window, today (UTC) included. */
export const CENSUS_WEEK_DAYS = 7;
/** Launch, 3:00 p.m. PST on November 4, 2026. web/src/data/wow-forever.ts LAUNCH_AT says the same; a web test keeps them equal. */
export const CENSUS_LAUNCH = "2026-11-04T23:00:00.000Z";

export type Faction = "Alliance" | "Horde";

/**
 * A stored census row, as intake writes it after swapping the GUID for characterKey (spec §4, §5.1).
 * Local until the census intake change lands in @everloot/protocol; then this becomes that type.
 */
export interface CensusRow {
  kind: "census_self" | "census_seen";
  installId: string;
  eventId?: string;
  capturedAt: string;
  /** HMAC of the GUID under a server key, hex. The GUID itself is never stored. */
  characterKey: string;
  serverId: number;
  /** UnitRace's file token, such as "Scourge" or "NightElf". */
  race: string;
  /** UnitClass's file token, such as "HUNTER". */
  class: string;
  level: number;
  faction: Faction;
  /** census_self only: GetRealmName(). */
  realm?: string;
  /** census_seen only: how the player was seen. */
  via?: "target" | "mouseover" | "group";
}

export const CENSUS_CLASSES = [
  { token: "DRUID", name: "Druid" }, { token: "HUNTER", name: "Hunter" }, { token: "MAGE", name: "Mage" },
  { token: "PALADIN", name: "Paladin" }, { token: "PRIEST", name: "Priest" }, { token: "ROGUE", name: "Rogue" },
  { token: "SHAMAN", name: "Shaman" }, { token: "WARLOCK", name: "Warlock" }, { token: "WARRIOR", name: "Warrior" },
] as const;

/**
 * Who can play what, by race token, from Blizzard's race and class tables (the same tables as
 * web/src/data/wow-forever.ts RACES; a web test keeps them equal). Skyborne is on both factions with a
 * different class list on each. "Skyborne" as UnitRace's token is unconfirmed until a beta login checks it.
 */
export const CENSUS_RACES = [
  { faction: "Horde", token: "Orc", name: "Orc", classes: ["HUNTER", "MAGE", "ROGUE", "SHAMAN", "WARLOCK", "WARRIOR"] },
  { faction: "Horde", token: "Tauren", name: "Tauren", classes: ["DRUID", "HUNTER", "SHAMAN", "WARRIOR"] },
  { faction: "Horde", token: "Troll", name: "Troll", classes: ["HUNTER", "MAGE", "PRIEST", "ROGUE", "SHAMAN", "WARLOCK", "WARRIOR"] },
  { faction: "Horde", token: "Scourge", name: "Undead", classes: ["MAGE", "PALADIN", "PRIEST", "ROGUE", "WARLOCK", "WARRIOR"] },
  { faction: "Horde", token: "Skyborne", name: "Skyborne", classes: ["DRUID", "HUNTER", "ROGUE", "SHAMAN", "WARRIOR"] },
  { faction: "Alliance", token: "Dwarf", name: "Dwarf", classes: ["HUNTER", "PALADIN", "PRIEST", "ROGUE", "SHAMAN", "WARRIOR"] },
  { faction: "Alliance", token: "Gnome", name: "Gnome", classes: ["MAGE", "PRIEST", "ROGUE", "WARLOCK", "WARRIOR"] },
  { faction: "Alliance", token: "Human", name: "Human", classes: ["HUNTER", "MAGE", "PALADIN", "PRIEST", "ROGUE", "WARLOCK", "WARRIOR"] },
  { faction: "Alliance", token: "NightElf", name: "Night Elf", classes: ["DRUID", "HUNTER", "PRIEST", "ROGUE", "WARRIOR"] },
  { faction: "Alliance", token: "Skyborne", name: "Skyborne", classes: ["DRUID", "HUNTER", "MAGE", "ROGUE", "WARRIOR"] },
] as const satisfies readonly { faction: Faction; token: string; name: string; classes: readonly string[] }[];

export const FACTIONS: readonly Faction[] = ["Alliance", "Horde"];

export const LEVEL_BANDS = [
  { id: "1-9", min: 1, max: 9, label: "1–9" },
  { id: "10-19", min: 10, max: 19, label: "10–19" },
  { id: "20-29", min: 20, max: 29, label: "20–29" },
  { id: "30-39", min: 30, max: 39, label: "30–39" },
  { id: "40-49", min: 40, max: 49, label: "40–49" },
  { id: "50-59", min: 50, max: 59, label: "50–59" },
  { id: "60", min: 60, max: 60, label: "At 60" },
] as const;

export type LevelBand = (typeof LEVEL_BANDS)[number]["id"];

/** A published count: rounded to the nearest 5, or null when the cell is under the thresholds ("fewer than 10"). */
export type CensusCount = number | null;

export interface CensusWindow {
  id: "week" | "launch";
  /** First instant counted, ISO. */
  from: string;
  /** When the corpus was current, ISO. */
  to: string;
  /** True while the window as a whole is under the thresholds: then nothing in it shows a number. */
  collecting: boolean;
  characters: CensusCount;
  /** Distinct installs that reported a census row in the window. A count of installs, not characters. */
  installs: number;
  /** Characters with an own upload in the window, and characters known only from being seen. */
  bias: { own: CensusCount; seen: CensusCount };
  factions: { faction: Faction; count: CensusCount }[];
  races: { faction: Faction; race: string; count: CensusCount }[];
  classes: { class: string; count: CensusCount }[];
  raceClass: { faction: Faction; race: string; class: string; count: CensusCount }[];
  levels: { band: LevelBand; count: CensusCount }[];
}

export interface CensusView {
  scope: { id: string; label: string };
  asOf: string;
  rule: { minCharacters: number; minInstalls: number; roundTo: number };
  windows: { week: CensusWindow; launch: CensusWindow };
  /** Characters active each UTC day of the 7-day window, oldest first, under the same thresholds. */
  trend: { day: string; count: CensusCount }[];
}

export const GLOBAL_SCOPE = { id: "all", label: "All of WoW: Forever" };

const DAY_MS = 86_400_000;

export function roundCount(n: number): number {
  return Math.round(n / CENSUS_ROUND_TO) * CENSUS_ROUND_TO;
}

/** A count under the thresholds is null; one at or over them is rounded. */
function publish(characters: number, installs: number): CensusCount {
  return characters >= CENSUS_MIN_CHARACTERS && installs >= CENSUS_MIN_INSTALLS ? roundCount(characters) : null;
}

const RACE_BY_FACTION = new Map<string, (typeof CENSUS_RACES)[number]>(CENSUS_RACES.map((r) => [`${r.faction}/${r.token}`, r]));

/** A race and class Blizzard's tables allow for that faction, at a level the game has. */
function playable(row: CensusRow): boolean {
  const race = RACE_BY_FACTION.get(`${row.faction}/${row.race}`);
  return !!race && (race.classes as readonly string[]).includes(row.class) &&
    Number.isInteger(row.level) && row.level >= 1 && row.level <= 60;
}

function bandOf(level: number): LevelBand {
  return LEVEL_BANDS.find((b) => level >= b.min && level <= b.max)!.id;
}

/** The sequence number at the end of an event id ("install:census:12" is 12). */
function seqOf(eventId: string | undefined): number {
  const n = Number((eventId ?? "").split(":").pop());
  return Number.isFinite(n) ? n : 0;
}

/** True when `a` is the later report: capture time, then an own row over a sighting, then the event sequence. */
function laterThan(a: { row: CensusRow; at: number }, b: { row: CensusRow; at: number }): boolean {
  if (a.at !== b.at) return a.at > b.at;
  const own = Number(a.row.kind === "census_self") - Number(b.row.kind === "census_self");
  if (own !== 0) return own > 0;
  return seqOf(a.row.eventId) > seqOf(b.row.eventId);
}

type Dated = { row: CensusRow; at: number };
type Character = { latest: Dated; installs: Set<string>; own: boolean };

/** A cell's true numbers before publishing: its characters and the installs that reported any of them. */
class Tally {
  characters = 0;
  installs = new Set<string>();
  add(c: Character) {
    this.characters++;
    for (const id of c.installs) this.installs.add(id);
  }
  get count(): CensusCount {
    return publish(this.characters, this.installs.size);
  }
}

function tallies<K extends string>(keys: readonly K[]): Map<K, Tally> {
  return new Map(keys.map((k) => [k, new Tally()]));
}

function windowOf(id: CensusWindow["id"], rows: readonly Dated[], from: number, to: number): CensusWindow {
  const characters = new Map<string, Character>();
  const installs = new Set<string>();
  for (const d of rows) {
    if (d.at < from || d.at > to) continue;
    installs.add(d.row.installId);
    const c = characters.get(d.row.characterKey);
    if (!c) {
      characters.set(d.row.characterKey, { latest: d, installs: new Set([d.row.installId]), own: d.row.kind === "census_self" });
      continue;
    }
    c.installs.add(d.row.installId);
    if (d.row.kind === "census_self") c.own = true;
    if (laterThan(d, c.latest)) c.latest = d;
  }

  const total = new Tally();
  const own = new Tally();
  const seen = new Tally();
  const factions = tallies(FACTIONS);
  const races = tallies(CENSUS_RACES.map((r) => `${r.faction}/${r.token}`));
  const classes = tallies<string>(CENSUS_CLASSES.map((c) => c.token));
  const grid = tallies(CENSUS_RACES.flatMap((r) => r.classes.map((c) => `${r.faction}/${r.token}/${c}`)));
  const levels = tallies(LEVEL_BANDS.map((b) => b.id));
  for (const c of characters.values()) {
    const r = c.latest.row;
    total.add(c);
    (c.own ? own : seen).add(c);
    factions.get(r.faction)!.add(c);
    races.get(`${r.faction}/${r.race}`)!.add(c);
    classes.get(r.class)!.add(c);
    grid.get(`${r.faction}/${r.race}/${r.class}`)!.add(c);
    levels.get(bandOf(r.level))!.add(c);
  }

  const collecting = total.count === null;
  const shown = (t: Tally): CensusCount => (collecting ? null : t.count);
  return {
    id,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    collecting,
    characters: shown(total),
    installs: installs.size,
    bias: { own: shown(own), seen: shown(seen) },
    factions: FACTIONS.map((faction) => ({ faction, count: shown(factions.get(faction)!) })),
    races: CENSUS_RACES.map((r) => ({ faction: r.faction, race: r.token, count: shown(races.get(`${r.faction}/${r.token}`)!) })),
    classes: CENSUS_CLASSES.map((c) => ({ class: c.token, count: shown(classes.get(c.token)!) })),
    raceClass: CENSUS_RACES.flatMap((r) => r.classes.map((cls) => ({
      faction: r.faction, race: r.token, class: cls, count: shown(grid.get(`${r.faction}/${r.token}/${cls}`)!),
    }))),
    levels: LEVEL_BANDS.map((b) => ({ band: b.id, count: shown(levels.get(b.id)!) })),
  };
}

/** Characters active on each UTC day of the week window, each day under the same thresholds. */
function trendOf(rows: readonly Dated[], firstDay: number, from: number, to: number): CensusView["trend"] {
  const days = Array.from({ length: CENSUS_WEEK_DAYS }, (_, i) => ({ start: firstDay + i * DAY_MS, characters: new Set<string>(), installs: new Set<string>() }));
  for (const d of rows) {
    if (d.at < from || d.at > to) continue;
    const day = days[Math.floor((d.at - firstDay) / DAY_MS)];
    if (!day) continue;
    day.characters.add(d.row.characterKey);
    day.installs.add(d.row.installId);
  }
  return days.map((d) => ({ day: new Date(d.start).toISOString().slice(0, 10), count: publish(d.characters.size, d.installs.size) }));
}

export interface CensusOptions {
  /** When the corpus was current; rows dated after it are ignored. */
  asOf: string | Date;
  /** Rows before this are the beta and are ignored. */
  launch?: string;
  scope?: { id: string; label: string };
}

export function rollupCensus(rows: readonly CensusRow[], options: CensusOptions): CensusView {
  const to = new Date(options.asOf).getTime();
  const launch = Date.parse(options.launch ?? CENSUS_LAUNCH);
  const dated: Dated[] = [];
  for (const row of rows) {
    const at = Date.parse(row.capturedAt);
    if (Number.isFinite(at) && at >= launch && at <= to && playable(row)) dated.push({ row, at });
  }
  const today = Math.floor(to / DAY_MS) * DAY_MS;
  const firstDay = today - (CENSUS_WEEK_DAYS - 1) * DAY_MS;
  const weekFrom = Math.max(firstDay, launch);
  return {
    scope: options.scope ?? GLOBAL_SCOPE,
    asOf: new Date(to).toISOString(),
    rule: { minCharacters: CENSUS_MIN_CHARACTERS, minInstalls: CENSUS_MIN_INSTALLS, roundTo: CENSUS_ROUND_TO },
    windows: { week: windowOf("week", dated, weekFrom, to), launch: windowOf("launch", dated, launch, to) },
    trend: trendOf(dated, firstDay, weekFrom, to),
  };
}

const KINDS = new Set(["census_self", "census_seen"]);
const VIAS = new Set(["target", "mouseover", "group"]);

/** The census rows in a record list. Anything else, or a row missing a field the rollup reads, is skipped. */
export function censusRowsFromRecords(records: readonly unknown[]): CensusRow[] {
  const rows: CensusRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.kind !== "string" || !KINDS.has(r.kind) || typeof r.installId !== "string" || !r.installId ||
      typeof r.capturedAt !== "string" || !Number.isFinite(Date.parse(r.capturedAt)) ||
      typeof r.characterKey !== "string" || !r.characterKey || typeof r.serverId !== "number" ||
      typeof r.race !== "string" || typeof r.class !== "string" || typeof r.level !== "number" ||
      (r.faction !== "Alliance" && r.faction !== "Horde")) continue;
    rows.push({
      kind: r.kind as CensusRow["kind"], installId: r.installId, capturedAt: r.capturedAt, characterKey: r.characterKey,
      serverId: r.serverId, race: r.race, class: r.class, level: r.level, faction: r.faction,
      ...(typeof r.eventId === "string" ? { eventId: r.eventId } : {}),
      ...(typeof r.realm === "string" ? { realm: r.realm } : {}),
      ...(typeof r.via === "string" && VIAS.has(r.via) ? { via: r.via as CensusRow["via"] } : {}),
    });
  }
  return rows;
}

/** The published census from one record list. `asOf` is when the corpus was current (its dataAsOf). */
export function censusFromRecords(records: readonly unknown[], asOf: string | Date = new Date(), launch: string = CENSUS_LAUNCH): CensusView {
  return rollupCensus(censusRowsFromRecords(records), { asOf, launch });
}
