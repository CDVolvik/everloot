import { expect, test } from "vitest";
import { CLASSES, LAUNCH, LAUNCH_AT, NEW_COMBOS, RACES } from "./wow-forever";

test("the launch instant is 3:00 p.m. Pacific on the quoted date", () => {
  expect(LAUNCH.quote).toContain("3:00 p.m. PST");
  expect(LAUNCH_AT.startsWith(LAUNCH.date)).toBe(true);
  expect(new Date(LAUNCH_AT).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })).toBe("11/4/2026, 3:00:00 PM");
});

test("the race table matches Blizzard's article: nine classes, ten rows, Skyborne on both factions", () => {
  const rows = Object.values(RACES.factions).flatMap((f) => Object.entries(f));
  expect(rows).toHaveLength(10);
  for (const [, classes] of rows) for (const c of classes) expect(CLASSES).toContain(c);
  expect(RACES.factions.Horde.Skyborne).toContain("Shaman");
  expect(RACES.factions.Horde.Skyborne).not.toContain("Mage");
  expect(RACES.factions.Alliance.Skyborne).toContain("Mage");
  expect(RACES.factions.Alliance.Skyborne).not.toContain("Shaman");
  // Every class is playable somewhere on each faction.
  for (const faction of Object.values(RACES.factions)) {
    expect(new Set(Object.values(faction).flat())).toEqual(new Set(CLASSES));
  }
});

test("every new combination named in the article is in the table", () => {
  const all = Object.values(RACES.factions).reduce<Record<string, readonly string[]>>((a, f) => ({ ...a, ...f }), {});
  for (const [race, cls] of NEW_COMBOS) expect(all[race], `${race} ${cls}`).toContain(cls);
});
