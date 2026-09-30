import { expect, test } from "vitest";
import { itemFactsFromRecords } from "../src/drop-rollup.js";
import { handleItemPage } from "../src/item-page.js";

test("loot and item_seen records become the same item page the site renders", () => {
  const loot = (installId: string) => ({
    kind: "loot",
    installId,
    sourceNpcId: 456,
    items: [{ itemId: 1234, count: 1 }],
  });
  const seen = (installId: string) => ({ kind: "item_seen", installId, itemId: 1234, name: "Peacebloom" });
  const facts = itemFactsFromRecords([loot("a"), loot("b"), loot("c"), seen("a"), seen("b"), seen("c"), { kind: "loot" }]);
  expect(facts.rates[0]).toMatchObject({ itemId: 1234, kills: 3, drops: 3, reporters: 3, public: true });
  const text = handleItemPage({ itemId: 1234 }, facts);
  expect(text).toContain("Peacebloom");
  expect(text).toContain("100.0%");
  expect(text).toContain("NPC 456");
});
