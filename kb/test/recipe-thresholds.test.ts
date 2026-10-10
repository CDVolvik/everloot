import { expect, test } from "vitest";
import { formatThresholds, inferThresholds, recipeObservationsFromRecords } from "../src/recipe-thresholds.js";

const obs = (installId: string, rank: number, difficulty: string, recipe = "Lesser Healing Potion") =>
  ({ kind: "recipe_observed", installId, profession: "Alchemy", recipe, rank, difficulty, reagents: [] });

test("colours seen at different ranks narrow each threshold to a range once three installs agree", () => {
  const records = [
    obs("install-a", 50, "optimal"),
    obs("install-b", 60, "medium"),
    obs("install-c", 55, "medium"),
    obs("install-c", 70, "easy"),
    obs("install-a", 90, "trivial"),
  ];
  const [only] = inferThresholds(recipeObservationsFromRecords(records));
  expect(only).toEqual({
    profession: "Alchemy", recipe: "Lesser Healing Potion", installs: 3, observations: 5,
    yellow: { min: 51, max: 55 }, green: { min: 61, max: 70 }, grey: { min: 71, max: 90 },
  });
  expect(formatThresholds(only)).toBe(
    "Lesser Healing Potion (Alchemy), 3 installs: yellow from 51-55, green from 61-70, grey from 71-90.");
});

test("fewer than three installs publish nothing", () => {
  expect(inferThresholds(recipeObservationsFromRecords([obs("install-a", 50, "optimal"), obs("install-b", 60, "medium")]))).toEqual([]);
});

test("contradicting colours withhold the recipe instead of publishing a wrong range", () => {
  const records = [obs("install-a", 40, "trivial"), obs("install-b", 50, "optimal"), obs("install-c", 45, "easy")];
  expect(inferThresholds(recipeObservationsFromRecords(records))).toEqual([]);
});

test("an unbounded side stays unrecorded, never guessed", () => {
  const records = [obs("install-a", 10, "optimal"), obs("install-b", 12, "optimal"), obs("install-c", 15, "optimal")];
  const [only] = inferThresholds(recipeObservationsFromRecords(records));
  expect(only.yellow).toEqual({ min: 16, max: null });
  expect(only.grey).toEqual({ min: 16, max: null });
  expect(formatThresholds(only)).toContain("yellow from 16 (upper bound unrecorded)");
});

test("only well-formed recipe observations are read", () => {
  expect(recipeObservationsFromRecords([{ kind: "loot" }, { ...obs("i", 5, "glowing") }, obs("install-a", 5, "easy")])).toHaveLength(1);
});
