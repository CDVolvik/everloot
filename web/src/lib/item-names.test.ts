import { ITEM_FACTS } from "@everloot/protocol";
import { expect, test } from "vitest";
import type { ReportedFact } from "../../../kb/src/item-facts";
import { shard0 } from "./game-assets.fixture";
import { factLine, itemTipText, withReported, WHY } from "./item-names";

const fact = (f: Partial<ReportedFact> & Pick<ReportedFact, "fact" | "value">): ReportedFact =>
  ({ reporters: 3, build: "1.60.1.70450", lastSeen: "2026-11-05T12:00:00.000Z", ...f });

test("each placeholder the files print is the line a reported number fills", () => {
  // Item 25 is a sword with Stamina and Strength; the same record as plate armour carries the armour line.
  const sword = itemTipText(shard0["25"]);
  for (const line of [factLine("damage_per_second", null), factLine("stamina", null), factLine("strength", null)]) expect(sword.lines).toContain(line);
  expect(itemTipText({ ...shard0["9"], c: 4, sc: 4, s: 1 }).lines).toContain(factLine("armor", null));
  expect([factLine("armor", 103), factLine("stamina", 5), factLine("spirit", -2), factLine("damage_per_second", 12), factLine("fire_resistance", 10)])
    .toEqual(["103 Armor", "+5 Stamina", "-2 Spirit", "(12.0 damage per second)", "+10 Fire Resistance"]);
  for (const f of ITEM_FACTS) expect(factLine(f, null)).toContain("[?]");
});

test("agreed numbers replace their placeholders, the reasons that no longer apply go, and each number says who and when", () => {
  const sword = itemTipText(shard0["25"]);
  const filled = withReported(sword, { shown: [fact({ fact: "damage_per_second", value: 12.4 }), fact({ fact: "stamina", value: 5 }), fact({ fact: "strength", value: 3, reporters: 7, lastSeen: null })], contested: [] });
  expect(filled.lines).toEqual(["Binds when equipped", "Unique", "One-Hand · Sword", "[?] - [?] Damage · Speed 1.90", "(12.4 damage per second)", "+5 Stamina", "+3 Strength", "Requires Level 5", "Item Level 2", '"Old."', "Sell Price: 7c"]);
  expect(filled.why).toEqual([
    WHY.damage,
    "12.4 damage per second: reported by 3 installs, last seen 2026-11-05, build 1.60.1.70450.",
    "+5 Stamina: reported by 3 installs, last seen 2026-11-05, build 1.60.1.70450.",
    "+3 Strength: reported by 7 installs, last seen [?], build 1.60.1.70450.",
  ]);
  // The damage range is still unknown, so the tooltip is still partial.
  expect(filled.partial).toBe(true);
  // Untouched when nothing is reported, and the record's own tooltip is not changed in place.
  expect(withReported(sword, { shown: [], contested: [] })).toBe(sword);
  expect(sword.lines).toContain("+[?] Stamina");
});

test("a line the files did not print goes where the game prints it; a contested line keeps its [?] and says why", () => {
  const shield = itemTipText({ ...shard0["9"], c: 4, sc: 6, s: 14, st: [7, 6], r: 20 });
  expect(shield.lines.slice(0, 4)).toEqual(["Off Hand · Shield", "[?] Armor", "+[?] Stamina", "+[?] Spirit"]);
  const got = withReported(shield, {
    shown: [fact({ fact: "armor", value: 300 }), fact({ fact: "block", value: 6 }), fact({ fact: "stamina", value: 4 }), fact({ fact: "shadow_resistance", value: 5 })],
    contested: ["spirit", "fire_resistance"],
  });
  expect(got.lines.slice(0, 7)).toEqual(["Off Hand · Shield", "300 Armor", "6 Block", "+4 Stamina", "+[?] Spirit", "+5 Shadow Resistance", "Requires Level 20"]);
  // Spirit is still a placeholder, so its reason stays; armour's goes. Fire resistance has no line to explain.
  expect(got.why.slice(0, 2)).toEqual([WHY.stats, "[?] Spirit: installs disagree on the number, so none is shown until 3 agree on one."]);
  expect(got.why).not.toContain(WHY.armor);
  expect(got.partial).toBe(true);
  const settled = withReported(shield, { shown: [fact({ fact: "armor", value: 300 }), fact({ fact: "stamina", value: 4 }), fact({ fact: "spirit", value: -1 })], contested: [] });
  expect(settled.lines).toContain("-1 Spirit");
  expect(settled.why.filter((w) => w.startsWith("[?]"))).toEqual([]);
  expect(settled.partial).toBe(false);
});
