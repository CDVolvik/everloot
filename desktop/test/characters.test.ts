import { expect, test } from "vitest";
import { summarizeCharacters } from "../src/main/characters";

const SV = `EverlootDB = { ["version"] = "0.3.3", ["installId"] = "x", ["records"] = {
  ["gold_snapshot"] = { { ["character"] = "Arthas", ["realm"] = "Nightslayer", ["currentCopper"] = 1500000, ["peakCopper"] = 2000000 }, { ["character"] = "Arthas", ["realm"] = "Nightslayer", ["currentCopper"] = 1700000, ["peakCopper"] = 2000000 } },
  ["gear_snapshot"] = { { ["character"] = "Arthas", ["realm"] = "Nightslayer", ["equipped"] = { { ["slot"] = "HeadSlot", ["itemId"] = 1, ["itemLevel"] = 60 }, { ["slot"] = "ChestSlot", ["itemId"] = 2, ["itemLevel"] = 70 } } } },
  ["money_event"] = { { ["character"] = "Arthas", ["realm"] = "Nightslayer", ["category"] = "vendor", ["copper"] = 500 }, { ["character"] = "Arthas", ["realm"] = "Nightslayer", ["category"] = "loot", ["copper"] = 900 }, { ["character"] = "Arthas", ["realm"] = "Nightslayer", ["category"] = "loot", ["copper"] = 100 } },
  ["achievement_owned"] = { { ["characterKey"] = "0a1b2c3d", ["class"] = "PALADIN", ["level"] = 58, ["achievementId"] = 10, ["completed"] = true, ["criteriaMet"] = 1, ["criteriaTotal"] = 1 }, { ["characterKey"] = "0a1b2c3d", ["class"] = "PALADIN", ["level"] = 60, ["achievementId"] = 11, ["completed"] = false, ["criteriaMet"] = 0, ["criteriaTotal"] = 3 } },
  ["reputation_owned"] = { { ["characterKey"] = "0a1b2c3d", ["class"] = "PALADIN", ["level"] = 60, ["factionId"] = 1, ["reaction"] = 8, ["standing"] = 1, ["floor"] = 0, ["ceiling"] = 1 }, { ["characterKey"] = "0a1b2c3d", ["class"] = "PALADIN", ["level"] = 60, ["factionId"] = 2, ["reaction"] = 5, ["standing"] = 1, ["floor"] = 0, ["ceiling"] = 1 } },
  ["title_owned"] = { { ["characterKey"] = "0a1b2c3d", ["class"] = "PALADIN", ["level"] = 60, ["titleIds"] = { 1, 2 } }, { ["characterKey"] = "0a1b2c3d", ["class"] = "PALADIN", ["level"] = 60, ["titleIds"] = { 2, 3 } } },
  ["quest_owned"] = { { ["characterKey"] = "ffffffff", ["class"] = "MAGE", ["level"] = 12, ["questIds"] = { 100, 101 } } },
  ["talent_snapshot"] = { { ["class"] = "PALADIN", ["level"] = 60, ["group"] = 1, ["active"] = true, ["configId"] = 0, ["treeId"] = 1, ["exportStatus"] = "ok", ["points"] = 51, ["nodes"] = {} } },
} }`;

test("named characters get the latest gold, the peak, gear slots and item level, and money by category", () => {
  const info = summarizeCharacters(SV);
  expect(info.characters).toHaveLength(1);
  expect(info.characters[0]).toMatchObject({ character: "Arthas", realm: "Nightslayer", gold: 1700000, peakGold: 2000000, gearSlots: 2, itemLevel: 65, spent: { vendor: 500 }, earned: { loot: 1000 } });
});

test("progress rows are per opaque character key: unions for titles and quests, latest state for achievements and reputations", () => {
  const info = summarizeCharacters(SV);
  expect(info.progress.map((p) => p.key)).toEqual(["0a1b2c3d", "ffffffff"]);
  expect(info.progress[0]).toMatchObject({ class: "PALADIN", level: 60, achievements: 1, achievementsInProgress: 1, reputations: 2, exalted: 1, titles: 3, quests: 0 });
  expect(info.progress[1]).toMatchObject({ class: "MAGE", level: 12, quests: 2 });
  expect(info.talents).toEqual([{ class: "PALADIN", level: 60, points: 51 }]);
});

test("a file with no character data gives empty lists, not an error", () => {
  expect(summarizeCharacters(`EverlootDB = { ["version"] = "0.3.3", ["installId"] = "x", ["records"] = {} }`)).toEqual({ characters: [], progress: [], talents: [] });
});
