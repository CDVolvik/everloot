import { z } from "zod";
import { LICENCE, SITE, uploadsAnswer, type McpToolDef } from "@everloot/protocol";
import {
  CENSUS_CLASSES, CENSUS_RACES, FACTIONS, LEVEL_BANDS,
  type CensusCount, type CensusView, type CensusWindow, type Faction,
} from "./census.js";

/**
 * population: the census as an MCP answer ("most played class", "how rare are Gnome Priests"), read from
 * the site's census rollup (kb/src/census.ts) under the same thresholds as /census, with the window in
 * every answer. Defined here rather than in @everloot/protocol's MCP_TOOLS until the census intake
 * change lands there; the server registers it after the protocol's tools.
 */

/** The site's census, aggregate only. Null means it was unreadable. */
export type CensusLoader = () => Promise<{ view: CensusView; dataAsOf: string | null } | null>;

export const CENSUS_UNSET =
  "Population numbers are not connected to this server, so this is not a measured zero. They are on everloot.app/census and its MCP.";
export const CENSUS_UNAVAILABLE = "Population numbers unavailable. They are unrecorded, not zero.";

const CENSUS_URL = `${SITE}/census`;
const METHOD_URL = `${SITE}/methodology#population`;

const populationCell = z.object({
  slice: z.enum(["faction", "race", "class", "raceClass", "level"]),
  faction: z.enum(FACTIONS as [Faction, ...Faction[]]).optional(),
  race: z.string().optional().describe("UnitRace's token, such as Scourge for Undead."),
  class: z.string().optional().describe("UnitClass's token, such as PRIEST."),
  band: z.string().optional().describe("Level band: 1-9, 10-19 ... 50-59, or 60."),
  label: z.string(),
  count: z.number().int().nullable().describe("Characters, rounded to the nearest 5; null means fewer than 10 characters or fewer than 3 installs."),
  share: z.number().nullable().describe("count out of the window's characters, both as shown."),
});
export type PopulationCell = z.infer<typeof populationCell>;

const populationPage = z.object({
  scope: z.object({ id: z.string(), label: z.string() }),
  window: z.object({ id: z.enum(["week", "launch"]), from: z.string(), to: z.string() }),
  collecting: z.boolean().describe("True until the window has 10 characters from 3 installs; then no count is shown."),
  characters: z.number().int().nullable(),
  installs: z.number().int().describe("Installs that reported in the window: a count of installs, not of people."),
  rule: z.object({ minCharacters: z.number().int(), minInstalls: z.number().int(), roundTo: z.number().int() }),
  cells: z.array(populationCell),
  note: z.string().optional().describe("Why there are no cells: a name the game does not have, or a combination it does not allow."),
  source: z.object({ title: z.string(), url: z.string() }),
  method: z.object({ title: z.string(), url: z.string() }),
  licence: z.string(),
});
export type PopulationPage = z.infer<typeof populationPage>;

export const POPULATION_TOOL = {
  title: "Who plays what: population by race, class, faction and level",
  description:
    "How many characters play each race, class, race and class, faction and level band on WoW: Forever, from the census of players who turned it on in the Everloot addon. Each character counts once. A count shows only when it covers at least 10 characters reported by at least 3 installs, rounded to the nearest 5; below that it reads fewer than 10. Every answer states its window: active in the last 7 days (default) or since launch. With no arguments, the overview: most played class first. No names, ever. Missing or unavailable data is reported explicitly.",
  inputSchema: {
    race: z.string().max(40).optional().describe("A race, such as Gnome, Night Elf or Undead."),
    class: z.string().max(40).optional().describe("A class, such as Priest."),
    faction: z.enum(FACTIONS as [Faction, ...Faction[]]).optional().describe("Alliance or Horde."),
    window: z.enum(["week", "launch"]).default("week").describe("week: active in the last 7 days. launch: seen since launch."),
  },
  // The envelope every structured answer built on player uploads uses.
  outputSchema: { ...uploadsAnswer, page: populationPage.optional() },
  annotations: { readOnlyHint: true, openWorldHint: false },
} as const satisfies McpToolDef;

export type PopulationArgs = { race?: string; class?: string; faction?: Faction; window: "week" | "launch" };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const CLASS_NAME = new Map<string, string>(CENSUS_CLASSES.map((c) => [c.token, c.name]));
const RACE_NAME = new Map<string, string>(CENSUS_RACES.map((r) => [r.token, r.name]));

const RACE_ALIAS = new Map<string, string>();
for (const r of CENSUS_RACES) for (const a of [r.token, r.name, `${r.name}s`]) RACE_ALIAS.set(norm(a), r.token);
for (const [alias, token] of [["forsaken", "Scourge"], ["nightelves", "NightElf"], ["dwarves", "Dwarf"]]) RACE_ALIAS.set(alias, token);
const CLASS_ALIAS = new Map<string, string>();
for (const c of CENSUS_CLASSES) for (const a of [c.token, `${c.name}s`]) CLASS_ALIAS.set(norm(a), c.token);

const day = (iso: string) => iso.slice(0, 10);
const about = (n: number) => `about ${n.toLocaleString("en-US")}`;
const percent = (share: number) => `${Number((share * 100).toFixed(1))}%`;

function windowLine(view: CensusView, w: CensusWindow): string {
  const what = w.id === "week" ? "characters active in the last 7 days" : "characters seen since launch";
  return `Census, ${view.scope.label}: ${what} (${day(w.from)} to ${day(w.to)} UTC).`;
}

function ruleLine(view: CensusView): string {
  const { minCharacters, minInstalls, roundTo } = view.rule;
  return `Each character counts once. A count shows when it covers at least ${minCharacters} characters reported by at least ${minInstalls} installs, rounded to the nearest ${roundTo}; below that it reads "fewer than ${minCharacters}". Method: ${METHOD_URL}`;
}

function cellOf(w: CensusWindow, base: Omit<PopulationCell, "count" | "share">, count: CensusCount): PopulationCell {
  return { ...base, count, share: count !== null && w.characters ? Number((count / w.characters).toFixed(3)) : null };
}

function cellLine(c: PopulationCell, total: CensusCount, unit = ""): string {
  if (c.count === null) return `${c.label}: fewer than 10${unit}`;
  return `${c.label}: ${about(c.count)}${unit}${c.share !== null && total !== null ? `, ${percent(c.share)} of ${about(total)}` : ""}`;
}

const byCount = (a: PopulationCell, b: PopulationCell) => (b.count ?? -1) - (a.count ?? -1) || a.label.localeCompare(b.label);

/** The overview: factions, classes (most played first), races, level bands. */
function overview(w: CensusWindow): PopulationCell[] {
  return [
    ...w.factions.map((f) => cellOf(w, { slice: "faction", faction: f.faction, label: f.faction }, f.count)),
    ...w.classes.map((c) => cellOf(w, { slice: "class", class: c.class, label: CLASS_NAME.get(c.class)! }, c.count)).sort(byCount),
    ...w.races.map((r) => cellOf(w, { slice: "race", faction: r.faction, race: r.race, label: `${RACE_NAME.get(r.race)} (${r.faction})` }, r.count)).sort(byCount),
    ...w.levels.map((l) => cellOf(w, { slice: "level", band: l.band, label: `Level ${LEVEL_BANDS.find((b) => b.id === l.band)!.label}` }, l.count)),
  ];
}

/** The cells a question names, or a note saying why there are none. */
function query(args: PopulationArgs, w: CensusWindow): { cells: PopulationCell[]; note?: string } {
  const race = args.race?.trim() ? RACE_ALIAS.get(norm(args.race)) : undefined;
  if (args.race?.trim() && !race) {
    return { cells: [], note: `No race called "${args.race.trim()}" in WoW: Forever. Races: ${[...new Set(CENSUS_RACES.map((r) => r.name))].join(", ")}.` };
  }
  const cls = args.class?.trim() ? CLASS_ALIAS.get(norm(args.class)) : undefined;
  if (args.class?.trim() && !cls) {
    return { cells: [], note: `No class called "${args.class.trim()}" in WoW: Forever. Classes: ${CENSUS_CLASSES.map((c) => c.name).join(", ")}.` };
  }
  const sides = (f: Faction) => !args.faction || args.faction === f;
  if (race && !CENSUS_RACES.some((r) => r.token === race && sides(r.faction))) {
    return { cells: [], note: `${RACE_NAME.get(race)} is not an ${args.faction} race in WoW: Forever.` };
  }
  if (cls && (race || args.faction)) {
    const cells = w.raceClass.filter((c) => c.class === cls && sides(c.faction) && (!race || c.race === race))
      .map((c) => cellOf(w, { slice: "raceClass", faction: c.faction, race: c.race, class: c.class, label: `${RACE_NAME.get(c.race)} ${CLASS_NAME.get(c.class)} (${c.faction})` }, c.count));
    if (cells.length) return { cells };
    const who = race ? RACE_NAME.get(race) : args.faction;
    return { cells: [], note: `${who} ${CLASS_NAME.get(cls)} is not a playable combination in WoW: Forever (Blizzard's race and class tables).` };
  }
  if (cls) return { cells: w.classes.filter((c) => c.class === cls).map((c) => cellOf(w, { slice: "class", class: c.class, label: CLASS_NAME.get(c.class)! }, c.count)) };
  if (race) {
    return { cells: w.races.filter((r) => r.race === race && sides(r.faction))
      .map((r) => cellOf(w, { slice: "race", faction: r.faction, race: r.race, label: `${RACE_NAME.get(r.race)} (${r.faction})` }, r.count)) };
  }
  return { cells: w.factions.filter((f) => f.faction === args.faction).map((f) => cellOf(w, { slice: "faction", faction: f.faction, label: f.faction }, f.count)) };
}

/** The answer to one question from one census view: the text every client gets and the structured page. */
export function populationAnswer(args: PopulationArgs, view: CensusView): { text: string; page: PopulationPage } {
  const w = view.windows[args.window];
  const asked = Boolean(args.race?.trim() || args.class?.trim() || args.faction);
  const { cells, note } = asked ? query(args, w) : { cells: overview(w), note: undefined };
  const lines = [windowLine(view, w), ruleLine(view)];
  if (note) lines.push(note);
  if (w.collecting) {
    lines.push(`Still collecting: no count shows until this window has at least ${view.rule.minCharacters} characters reported by at least ${view.rule.minInstalls} installs. ${w.installs} ${w.installs === 1 ? "install has" : "installs have"} reported in it so far.`);
  } else {
    lines.push(`${about(w.characters!)} characters, from ${w.installs} installs.`);
    if (!asked) {
      const classes = cells.filter((c) => c.slice === "class");
      const top = classes.filter((c) => c.count !== null && c.count === classes[0]?.count);
      lines.push(top.length === 0 ? "No class has a count yet."
        : top.length === 1 ? `Most played class: ${top[0].label}, ${about(top[0].count!)} (${percent(top[0].share!)}).`
        : `Most played classes, tied after rounding: ${top.map((c) => c.label).join(", ")}, ${about(top[0].count!)} each.`);
      for (const [slice, title] of [["faction", "Factions"], ["class", "Classes"], ["race", "Races"], ["level", "Level bands"]] as const) {
        lines.push(`${title}:`, ...cells.filter((c) => c.slice === slice).map((c) => `  ${cellLine(c, w.characters)}`));
      }
      const { own, seen } = w.bias;
      lines.push(own !== null && seen !== null
        ? `Known from: ${percent(seen / (own + seen))} players seen by uploaders, ${percent(own / (own + seen))} uploaders' own characters.`
        : `Known from: ${seen === null ? "fewer than 10" : about(seen)} seen, ${own === null ? "fewer than 10" : about(own)} own characters.`);
    } else {
      lines.push(...cells.map((c) => cellLine(c, w.characters, " characters")));
    }
  }
  return {
    text: lines.join("\n"),
    page: {
      scope: view.scope,
      window: { id: w.id, from: w.from, to: w.to },
      collecting: w.collecting,
      characters: w.characters,
      installs: w.installs,
      rule: view.rule,
      cells,
      ...(note ? { note } : {}),
      source: { title: "Everloot census", url: CENSUS_URL },
      method: { title: "How we count: population numbers", url: METHOD_URL },
      licence: LICENCE,
    },
  };
}

/** The whole tool answer. `footer` is the server's data-age and credit lines. */
export async function answerPopulation(
  args: PopulationArgs, loader: CensusLoader | undefined, footer: (dataAsOf: string | null) => string,
): Promise<{ text: string; structured: Record<string, unknown> }> {
  if (!loader) return { text: CENSUS_UNSET, structured: { connected: false, dataAsOf: null, reason: CENSUS_UNSET } };
  let loaded: Awaited<ReturnType<CensusLoader>>;
  try { loaded = await loader(); } catch { loaded = null; }
  if (!loaded) return { text: CENSUS_UNAVAILABLE, structured: { connected: false, dataAsOf: null, reason: CENSUS_UNAVAILABLE } };
  const { text, page } = populationAnswer(args, loaded.view);
  return { text: `${text}\n${footer(loaded.dataAsOf)}`, structured: { connected: true, dataAsOf: loaded.dataAsOf, page } };
}
