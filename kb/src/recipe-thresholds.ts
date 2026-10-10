/**
 * Recipe skill thresholds from what players' trade-skill windows showed (recipe_observed rows).
 * The window gives a colour at a rank, never the thresholds, so each observation only bounds them:
 * orange at rank r means the recipe turns yellow above r; yellow, green or grey at r means at or
 * below r. Green and grey work the same way. A threshold is published as a range, only when three
 * installs contributed and their colours do not contradict each other. Unbounded sides stay null.
 */
import { INDEPENDENT_INSTALLS } from "./drop-rollup.js";

const ORDER = ["optimal", "medium", "easy", "trivial"] as const;
type Colour = (typeof ORDER)[number];

export interface RecipeObservation { installId: string; profession: string; recipe: string; rank: number; difficulty: Colour }
export interface Range { min: number | null; max: number | null }
export interface RecipeThresholds {
  profession: string; recipe: string; installs: number; observations: number;
  yellow: Range; green: Range; grey: Range;
}

export function recipeObservationsFromRecords(records: unknown[]): RecipeObservation[] {
  const out: RecipeObservation[] = [];
  for (const raw of records) {
    const r = raw as Record<string, unknown>;
    if (r?.kind !== "recipe_observed" || typeof r.installId !== "string" || typeof r.profession !== "string" ||
      typeof r.recipe !== "string" || typeof r.rank !== "number" || !ORDER.includes(r.difficulty as Colour)) continue;
    out.push({ installId: r.installId, profession: r.profession, recipe: r.recipe, rank: r.rank, difficulty: r.difficulty as Colour });
  }
  return out;
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
    out.push({ profession: rows[0].profession, recipe: rows[0].recipe, installs, observations: rows.length, yellow, green, grey });
  }
  return out.sort((a, b) => a.profession.localeCompare(b.profession) || a.recipe.localeCompare(b.recipe));
}

function range(r: Range): string {
  if (r.min === null && r.max === null) return "unrecorded";
  if (r.min === null) return `at or below ${r.max}`;
  if (r.max === null) return `${r.min} (upper bound unrecorded)`;
  return r.min === r.max ? `${r.min}` : `${r.min}-${r.max}`;
}

export function formatThresholds(t: RecipeThresholds): string {
  return `${t.recipe} (${t.profession}), ${t.installs} installs: yellow from ${range(t.yellow)}, ` +
    `green from ${range(t.green)}, grey from ${range(t.grey)}.`;
}
