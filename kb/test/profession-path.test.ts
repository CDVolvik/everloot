import { expect, test } from "vitest";
import { handleProfessionPath, professionPath, type PriceSighting, type RecipeSighting } from "../src/profession-path.js";

const sight = (installId: string, recipe: string, reagents: RecipeSighting["reagents"], extra: Partial<RecipeSighting> = {}): RecipeSighting => ({
  installId,
  profession: "Alchemy",
  recipe,
  skillMin: 1,
  skillMax: 10,
  points: 1,
  reagents,
  ...extra,
});

const price = (installId: string, copper: number, item = "Peacebloom"): PriceSighting => ({ installId, item, copper });

test("a recipe stays off the path until 3 installs agree, and one install cannot agree with itself", () => {
  const reagents = [{ item: "Peacebloom", count: 1 }];
  const two = professionPath([sight("a", "Minor Healing Potion", reagents), sight("a", "Minor Healing Potion", reagents), sight("b", "Minor Healing Potion", reagents)], [], {
    profession: "Alchemy",
    fromSkill: 1,
    toSkill: 10,
  });
  expect(two.steps).toHaveLength(0);
  const three = professionPath(
    [sight("a", "Minor Healing Potion", reagents), sight("b", "Minor Healing Potion", reagents), sight("c", "Minor Healing Potion", reagents)],
    [],
    { profession: "alchemy", fromSkill: 1, toSkill: 10 },
  );
  expect(three.steps).toMatchObject([{ recipe: "Minor Healing Potion", fromSkill: 1, toSkill: 10, crafts: 9, reporters: 3, copper: null }]);
});

test("the path prefers more skill per reagent and leaves a gap instead of inventing a step", () => {
  const lean = [{ item: "Peacebloom", count: 1 }];
  const heavy = [{ item: "Peacebloom", count: 5 }, { item: "Silverleaf", count: 5 }];
  const rows = ["a", "b", "c"].flatMap((installId) => [
    sight(installId, "Heavy", heavy),
    sight(installId, "Lean", lean),
    sight(installId, "Later", lean, { skillMin: 15, skillMax: 20 }),
  ]);
  const path = professionPath(rows, [], { profession: "Alchemy", fromSkill: 1, toSkill: 20 });
  expect(path.steps.map((step) => step.recipe)).toEqual(["Lean", "Later"]);
  expect(path.gaps).toEqual([{ fromSkill: 10, toSkill: 15 }]);
  expect(path.reagents).toEqual([{ item: "Peacebloom", count: 14 }]);
  expect(path.copper).toBeNull();
});

test("gold is the median of 3 prices, and a missing reagent price keeps the total unpublished", () => {
  const reagents = [{ item: "Peacebloom", count: 2 }];
  const rows = ["a", "b", "c"].map((installId) => sight(installId, "Minor Healing Potion", reagents, { skillMax: 2 }));
  const priced = professionPath(rows, [price("a", 100), price("b", 300), price("c", 500)], { profession: "Alchemy", fromSkill: 1, toSkill: 2 });
  expect(priced.steps[0]?.copper).toBe(600);
  expect(priced.copper).toBe(600);
  const withVial = ["a", "b", "c"].map((installId) =>
    sight(installId, "Minor Healing Potion", [{ item: "Peacebloom", count: 1 }, { item: "Empty Vial", count: 1 }], { skillMax: 2 }),
  );
  const missing = professionPath(withVial, [price("a", 100), price("b", 300), price("c", 500), price("a", 10, "Empty Vial"), price("b", 10, "Empty Vial")], {
    profession: "Alchemy",
    fromSkill: 1,
    toSkill: 2,
  });
  expect(missing.steps[0]?.copper).toBeNull();
  expect(missing.copper).toBeNull();
  const text = handleProfessionPath({ profession: "Alchemy", fromSkill: 1, toSkill: 2 }, rows, [price("a", 100), price("b", 300), price("c", 500)]);
  expect(text).toContain("6s 0c");
  expect(text).toContain("3 independent uploads");
});

test("a blank profession or a backwards range is refused", () => {
  expect(handleProfessionPath({ profession: "  " })).toBe("Name a profession.");
  expect(handleProfessionPath({ profession: "Alchemy", fromSkill: 10, toSkill: 10 })).toContain("target skill");
});
