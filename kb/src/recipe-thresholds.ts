/**
 * Recipe skill thresholds from what players' trade-skill windows showed (recipe_observed rows).
 * The window gives a colour at a rank, never the thresholds, so each observation only bounds them:
 * orange at rank r means the recipe turns yellow above r; yellow, green or grey at r means at or
 * below r. Green and grey work the same way. A threshold is published as a range, only when three
 * installs contributed and their colours do not contradict each other. Unbounded sides stay null.
 * Reagents follow the same bar: a list is shown when three installs saw the same one. Its cost per
 * craft uses the profession path's agreed prices, and stays unrecorded while any reagent has none.
 */
import { INDEPENDENT_INSTALLS } from "./drop-rollup.js";
import { agreePrices, formatCopper, professionFactsFromRecords, reagentKey, type AgreedRecipe, type PriceSighting, type Reagent } from "./profession-path.js";

const ORDER = ["optimal", "medium", "easy", "trivial"] as const;
type Colour = (typeof ORDER)[number];

export interface RecipeObservation { installId: string; profession: string; recipe: string; rank: number; difficulty: Colour; reagents: Reagent[] }
export interface Range { min: number | null; max: number | null }
export interface RecipeThresholds {
  profession: string; recipe: string; installs: number; observations: number;
  yellow: Range; green: Range; grey: Range;
  /** The reagent list three installs agree on, or null. */
  reagents: Reagent[] | null;
}

export function recipeObservationsFromRecords(records: unknown[]): RecipeObservation[] {
  const out: RecipeObservation[] = [];
  for (const raw of records) {
    const r = raw as Record<string, unknown>;
    if (r?.kind !== "recipe_observed" || typeof r.installId !== "string" || typeof r.profession !== "string" ||
      typeof r.recipe !== "string" || typeof r.rank !== "number" || !ORDER.includes(r.difficulty as Colour)) continue;
    const reagents = (Array.isArray(r.reagents) ? r.reagents : []).filter((x): x is Reagent =>
      typeof x?.item === "string" && x.item.trim() !== "" && Number.isInteger(x?.count) && x.count >= 1);
    out.push({ installId: r.installId, profession: r.profession, recipe: r.recipe, rank: r.rank, difficulty: r.difficulty as Colour, reagents });
  }
  return out;
}

/** Observations plus price reports (price_seen and per-unit auction scans) for ranges with reagent costs. */
export function recipeFactsFromRecords(records: unknown[]): { observations: RecipeObservation[]; prices: PriceSighting[] } {
  return { observations: recipeObservationsFromRecords(records), prices: professionFactsFromRecords(records).prices };
}

export interface TrainerRow { installId: string; profession: string; recipe: string; requiredRank: number }

export function trainerRowsFromRecords(records: unknown[]): TrainerRow[] {
  const out: TrainerRow[] = [];
  for (const raw of records) {
    const r = raw as Record<string, unknown>;
    if (r?.kind !== "trainer_seen" || typeof r.installId !== "string" || typeof r.profession !== "string" ||
      typeof r.recipe !== "string" || !Number.isInteger(r.requiredRank) || (r.requiredRank as number) < 1) continue;
    out.push({ installId: r.installId, profession: r.profession, recipe: r.recipe, requiredRank: r.requiredRank as number });
  }
  return out;
}

export type DerivedStep = AgreedRecipe & { profession: string };

const recipeKey = (profession: string, recipe: string) => `${profession.trim().toLowerCase()}|${recipe.trim().toLowerCase()}`;

/**
 * Orange-only steps (design note 2026-10-10, option B): a published recipe with agreed reagents pays
 * one point per craft from its learn rank up to yellow.min, the first rank not known to be orange.
 * The learn rank is the trainer's, when three installs agree on one; else the lowest rank seen orange.
 */
export function derivedSteps(observations: RecipeObservation[], trainers: TrainerRow[]): DerivedStep[] {
  const trained = new Map<string, Map<number, Set<string>>>();
  for (const row of trainers) {
    const ranks = trained.get(recipeKey(row.profession, row.recipe)) ?? new Map<number, Set<string>>();
    ranks.set(row.requiredRank, (ranks.get(row.requiredRank) ?? new Set<string>()).add(row.installId));
    trained.set(recipeKey(row.profession, row.recipe), ranks);
  }
  const out: DerivedStep[] = [];
  for (const t of inferThresholds(observations)) {
    if (!t.reagents || t.yellow.min === null) continue;
    const key = recipeKey(t.profession, t.recipe);
    const [best, next] = [...(trained.get(key) ?? [])].sort((a, b) => b[1].size - a[1].size);
    const skillMin = best && best[1].size >= INDEPENDENT_INSTALLS && next?.[1].size !== best[1].size
      ? best[0]
      : Math.min(...observations.filter((o) => o.difficulty === "optimal" && recipeKey(o.profession, o.recipe) === key).map((o) => o.rank));
    if (!(skillMin < t.yellow.min)) continue;
    out.push({ profession: t.profession, recipe: t.recipe, skillMin, skillMax: t.yellow.min, points: 1, reagents: t.reagents, reporters: t.installs });
  }
  return out;
}

/** Everything the profession path reads: reported recipes, prices, and steps derived from colours and trainers. */
export function pathFactsFromRecords(records: unknown[]) {
  const { sightings, prices } = professionFactsFromRecords(records);
  const observations = recipeObservationsFromRecords(records);
  const trainers = trainerRowsFromRecords(records);
  return { sightings, prices, observations, trainers, derived: derivedSteps(observations, trainers) };
}

/** The list the most installs saw, when at least three did and no other list ties it. */
function agreedReagents(rows: RecipeObservation[]): Reagent[] | null {
  const lists = new Map<string, { reagents: Reagent[]; installs: Set<string> }>();
  for (const row of rows) {
    if (row.reagents.length === 0) continue;
    const key = reagentKey(row.reagents);
    const list = lists.get(key) ?? { reagents: row.reagents, installs: new Set<string>() };
    list.installs.add(row.installId);
    lists.set(key, list);
  }
  const [best, next] = [...lists.values()].sort((a, b) => b.installs.size - a.installs.size);
  if (!best || best.installs.size < INDEPENDENT_INSTALLS || next?.installs.size === best.installs.size) return null;
  return best.reagents.map((r) => ({ item: r.item.trim(), count: r.count }));
}

/** Threshold `step` is the first rank at or past colour ORDER[step]: yellow 1, green 2, grey 3. */
function bound(rows: RecipeObservation[], step: number): Range {
  let min: number | null = null, max: number | null = null;
  for (const { rank, difficulty } of rows) {
    if (ORDER.indexOf(difficulty) < step) min = Math.max(min ?? -Infinity, rank + 1);
    else max = Math.min(max ?? Infinity, rank);
  }
  return { min, max };
}

const contradicts = (r: Range) => r.min !== null && r.max !== null && r.min > r.max;

export function inferThresholds(observations: RecipeObservation[]): RecipeThresholds[] {
  const groups = new Map<string, RecipeObservation[]>();
  for (const o of observations) {
    const key = `${o.profession.trim().toLowerCase()}|${o.recipe.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  const out: RecipeThresholds[] = [];
  for (const rows of groups.values()) {
    const installs = new Set(rows.map((r) => r.installId)).size;
    if (installs < INDEPENDENT_INSTALLS) continue;
    const [yellow, green, grey] = [bound(rows, 1), bound(rows, 2), bound(rows, 3)];
    if ([yellow, green, grey].some(contradicts)) continue;
    out.push({ profession: rows[0].profession, recipe: rows[0].recipe, installs, observations: rows.length, yellow, green, grey, reagents: agreedReagents(rows) });
  }
  return out.sort((a, b) => a.profession.localeCompare(b.profession) || a.recipe.localeCompare(b.recipe));
}

function range(r: Range): string {
  if (r.min === null && r.max === null) return "unrecorded";
  if (r.min === null) return `at or below ${r.max}`;
  if (r.max === null) return `${r.min} (upper bound unrecorded)`;
  return r.min === r.max ? `${r.min}` : `${r.min}-${r.max}`;
}

/** The recipe_thresholds tool and the profession page: published ranges for one profession, optionally one recipe. */
export function handleRecipeThresholds(
  args: { profession: string; recipe?: string },
  observations: RecipeObservation[],
  prices: PriceSighting[] = [],
): string {
  const profession = args.profession.trim();
  if (!profession) return "Name a profession.";
  const wanted = args.recipe?.trim().toLowerCase();
  const rows = inferThresholds(observations).filter((t) =>
    t.profession.toLowerCase() === profession.toLowerCase() && (!wanted || t.recipe.toLowerCase().includes(wanted)));
  if (rows.length === 0) {
    return `No recipe ranges for ${profession} yet. A range appears once ${INDEPENDENT_INSTALLS} installs have opened the ` +
      "profession window with addon 0.2.3 or later and their colours agree. This is unrecorded, not zero.";
  }
  const agreed = agreePrices(prices);
  return [
    `${profession} recipe skill ranges, from the colours players' windows showed. A range, never a guessed exact number. ` +
      `Costs use median reagent prices from at least ${INDEPENDENT_INSTALLS} installs, from any realm.`,
    ...rows.map((t) => `${formatThresholds(t)} ${costLine(t.reagents, agreed)}`),
  ].join("\n");
}

function costLine(reagents: Reagent[] | null, prices: Map<string, number>): string {
  if (!reagents) return "Reagents unrecorded.";
  const mats = `Reagents: ${reagents.map((r) => `${r.count} ${r.item}`).join(", ")}.`;
  const missing = reagents.filter((r) => !prices.has(r.item.toLowerCase())).map((r) => r.item);
  if (missing.length > 0) return `${mats} Cost per craft unrecorded: no agreed price for ${missing.join(", ")}.`;
  const copper = reagents.reduce((sum, r) => sum + prices.get(r.item.toLowerCase())! * r.count, 0);
  return `${mats} Estimated cost per craft: ${formatCopper(copper)}.`;
}

export function formatThresholds(t: RecipeThresholds): string {
  return `${t.recipe} (${t.profession}), ${t.installs} installs: yellow from ${range(t.yellow)}, ` +
    `green from ${range(t.green)}, grey from ${range(t.grey)}.`;
}
