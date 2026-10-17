import { expect, test } from "vitest";
import { TALENT_CLASSES, loadCatalog } from "./catalogs";
import { classAnswers, classDescription, classFacts, hubAnswers } from "./facts";
import { DESCRIPTION_MAX, DESCRIPTION_MIN } from "../seo";

test("hunter facts are counted from the catalog", async () => {
  const catalog = await loadCatalog("hunter");
  const facts = classFacts(catalog);
  expect(facts.className).toBe("Hunter");
  expect(facts.trees.map((t) => t.name)).toEqual(["Beast Mastery", "Marksmanship", "Survival"]);
  expect(facts.trees.map((t) => t.talents)).toEqual(catalog.trees.map((t) => catalog.nodes.filter((n) => n.treeId === t.id).length));
  expect(facts.trees.map((t) => t.ranks)).toEqual(catalog.trees.map((t) => catalog.nodes.filter((n) => n.treeId === t.id).reduce((s, n) => s + n.maxRanks, 0)));
  expect(facts.totalRanks).toBe(facts.trees.reduce((s, t) => s + t.ranks, 0));
  expect(facts.points).toBe(catalog.rules.pointLevels!.length);
  expect(facts.maxLevel).toBe(60);
  expect(facts.firstPointLevel).toBe(10);
  expect(facts.sameGates).toBe(true);
  expect(facts.trees[0].gates.map((g) => g.row)).toEqual([2, 3, 4, 5, 6, 7]);
});

test("the answer names the build, the points, the trees and the gates, and gives no advice", async () => {
  const facts = classFacts(await loadCatalog("hunter"));
  const a = classAnswers(facts);
  expect(a.pointsQuestion).toBe("How many talent points does a Hunter get at level 60?");
  expect(a.pointsAnswer).toContain(`build ${facts.build}`);
  expect(a.pointsAnswer).toContain(`${facts.points} talent points by level 60`);
  expect(a.pointsAnswer).toContain("Beast Mastery, Marksmanship and Survival");
  expect(a.pointsAnswer).toContain("so no build can take everything");
  expect(a.layoutAnswer).toContain("row 2 needs 5");
  expect(a.layoutAnswer).toContain("row 7 needs 30");
  expect(`${a.pointsAnswer} ${a.layoutAnswer}`).not.toMatch(/best|recommend|should|optimal/i);
});

test("trees with different gates are listed one by one", async () => {
  const facts = classFacts(await loadCatalog("hunter"));
  facts.trees[1] = { ...facts.trees[1], gates: [{ row: 2, points: 3 }] };
  facts.sameGates = false;
  expect(classAnswers(facts).layoutAnswer).toContain("Marksmanship: row 2 needs 3.");
});

test("every class page has its own description inside the length window", async () => {
  const seen = new Set<string>();
  for (const slug of TALENT_CLASSES) {
    const description = classDescription(classFacts(await loadCatalog(slug)));
    expect(description.length, `${slug}: ${description}`).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
    expect(description.length, `${slug}: ${description}`).toBeLessThanOrEqual(DESCRIPTION_MAX);
    seen.add(description);
  }
  expect(seen.size).toBe(TALENT_CLASSES.length);
});

test("the hub answers points at level 60 and the two talent sets, with the level 40 marked unconfirmed", async () => {
  const a = hubAnswers(await Promise.all(TALENT_CLASSES.map(loadCatalog)));
  expect(a.pointsQuestion).toBe("How many talent points do you get at level 60?");
  expect(a.pointsAnswer).toContain("every class has 51 talent points by level 60");
  expect(a.setsAnswer).toContain("40");
  expect(a.setsAnswer).toContain("beta notes");
  expect(a.setsAnswer).toContain("unconfirmed");
});
