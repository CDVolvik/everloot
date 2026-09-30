import { expect, test } from "vitest";
import { guildFactsFromRecords, handleGuildBoard, type GuildFacts } from "../src/guild-board.js";

const base: GuildFacts = { counts: [], members: [], bosses: [], loot: [], gear: [], attendance: [] };

test("two agreeing officer uploads publish the components and do not invent a score", () => {
  const facts: GuildFacts = {
    ...base,
    counts: [
      { installId: "a", guildName: "Olympus", realm: "Forever", members: 2 },
      { installId: "b", guildName: "Olympus", realm: "Forever", members: 2 },
      { installId: "c", guildName: "Olympus", realm: "Forever", members: 9 },
    ],
    members: [
      { installId: "a", guildName: "Olympus", realm: "Forever", name: "Ada", rank: "Officer", level: 60, className: "Mage" },
      { installId: "b", guildName: "Olympus", realm: "Forever", name: "Ada", rank: "Officer", level: 60, className: "Mage" },
      { installId: "a", guildName: "Olympus", realm: "Forever", name: "Bea", rank: "Member", level: 60, className: "Priest" },
      { installId: "c", guildName: "Olympus", realm: "Forever", name: "Bea", rank: "Officer", level: 60, className: "Priest" },
    ],
    bosses: [
      { installId: "a", guildName: "Olympus", realm: "Forever", instance: "Molten Core", difficulty: "40", boss: "Lucifron" },
      { installId: "b", guildName: "Olympus", realm: "Forever", instance: "Molten Core", difficulty: "40", boss: "Lucifron" },
      { installId: "a", guildName: "Olympus", realm: "Forever", instance: "Molten Core", difficulty: "40", boss: "Magmadar" },
    ],
    loot: [
      { installId: "a", guildName: "Olympus", realm: "Forever", itemId: 17076, recipient: "Ada", sourceBoss: "Lucifron" },
      { installId: "b", guildName: "Olympus", realm: "Forever", itemId: 17076, recipient: "Ada", sourceBoss: "Lucifron" },
    ],
    gear: [
      { installId: "a", realm: "Forever", character: "Ada", itemLevel: 66 },
      { installId: "b", realm: "Forever", character: "Ada", itemLevel: 66 },
    ],
    attendance: [
      { installId: "a", guildName: "Olympus", realm: "Forever", name: "Ada" },
      { installId: "b", guildName: "Olympus", realm: "Forever", name: "Ada" },
    ],
  };
  const text = handleGuildBoard({ guildName: "Olympus", realm: "Forever" }, facts);
  expect(text).toContain("Member count: 2");
  expect(text).toContain("Ada — Officer, 60 Mage");
  expect(text).not.toContain("Bea");
  expect(text).toContain("Molten Core · 40: Lucifron");
  expect(text).not.toContain("Magmadar");
  expect(text).toContain("Item 17076 to Ada from Lucifron");
  expect(text).toContain("Average item level: 66");
  expect(text).toContain("Present 1 of 2: Ada");
  expect(text).toContain("no published weights");
});

test("one install cannot agree with itself, and a blank guild is refused", () => {
  const facts: GuildFacts = {
    ...base,
    counts: [
      { installId: "a", guildName: "Olympus", realm: "Forever", members: 2 },
      { installId: "a", guildName: "Olympus", realm: "Forever", members: 2 },
    ],
  };
  expect(handleGuildBoard({ guildName: "Olympus", realm: "Forever" }, facts)).toContain("No agreed member count");
  expect(handleGuildBoard({ guildName: " ", realm: "Forever" })).toBe("Name a guild.");
  expect(handleGuildBoard({ guildName: "Olympus", realm: " " })).toBe("Name a realm.");
});

test("a snapshot without an officer claim does not become a roster", () => {
  const facts = guildFactsFromRecords([
    {
      kind: "guild_snapshot",
      installId: "abcdef12",
      guildName: "Olympus",
      realm: "Forever",
      claimToken: "short",
      members: [{ name: "Ada", rank: "Officer", level: 60, class: "Mage" }],
    },
  ]);
  expect(facts.counts).toHaveLength(0);
  expect(facts.members).toHaveLength(0);
});
