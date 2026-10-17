import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CURRENT_BUILD, TABLES, type BuffTable } from "@/data/raid-buffs";
import {
  adaptGenerated, coverage, decodeRaid, emptySlots, encodeRaid, findCode, groupsOf, resize, SIZES,
  type Slot, type Slots,
} from "./raid";

const table = TABLES[CURRENT_BUILD];
const slot = (c: Slot["class"], tree: Slot["tree"] = 0): Slot => ({ class: c, tree });

/** A table of our own, so the math is tested without depending on the shipped list. */
const mini: BuffTable = {
  build: "1.0.1",
  label: "test",
  families: [
    { id: "shout", label: "Shout", kind: "buff" },
    { id: "aura", label: "Aura", kind: "buff" },
    { id: "wild", label: "Wild", kind: "buff" },
    { id: "mystery", label: "Mystery", kind: "buff" },
    { id: "armor", label: "Armor", kind: "debuff" },
  ],
  entries: [
    { id: "shout", label: "Shout", family: "shout", scope: "raid", evidence: "patch-notes", providers: [{ class: "warrior" }], names: ["Shout"] },
    { id: "aura", label: "Aura", family: "aura", scope: "party", evidence: "classic-assumed", providers: [{ class: "paladin" }], names: ["Aura"] },
    { id: "wild", label: "Wild", family: "wild", scope: "single", evidence: "classic-assumed", providers: [{ class: "druid" }], names: ["Wild"] },
    { id: "gwild", label: "Greater Wild", family: "wild", scope: "area", evidence: "classic-assumed", providers: [{ class: "druid", tree: 3 }], names: ["Greater Wild"] },
    { id: "mystery", label: "Mystery", family: "mystery", scope: "unknown", evidence: "classic-assumed", providers: [{ class: "warlock" }], names: ["Mystery"] },
    { id: "armor", label: "Armor", family: "armor", scope: "enemy", evidence: "classic-assumed", providers: [{ class: "rogue", tree: 1 }], names: ["Armor"] },
  ],
};

function raid(size: 10 | 20 | 40, placed: Record<number, Slot>): Slots {
  const slots = emptySlots(size);
  for (const [i, s] of Object.entries(placed)) slots[Number(i)] = s;
  return slots;
}

describe("coverage", () => {
  test("an empty raid is missing everything", () => {
    const c = coverage(emptySlots(10), mini);
    expect(c.buffs.every((b) => b.raid === "missing" && b.groups.every((g) => g === "missing"))).toBe(true);
    expect(c.summary.missing).toBe(4);
  });

  test("a raid-scope buff reaches every group from any one provider", () => {
    const c = coverage(raid(20, { 17: slot("warrior") }), mini);
    const shout = c.buffs.find((b) => b.family.id === "shout")!;
    expect(shout.groups).toEqual(["covered", "covered", "covered", "covered"]);
    expect(shout.raid).toBe("covered");
  });

  test("a party-scope buff reaches only the group that holds the provider", () => {
    const c = coverage(raid(20, { 0: slot("paladin"), 6: slot("paladin") }), mini);
    const aura = c.buffs.find((b) => b.family.id === "aura")!;
    expect(aura.groups).toEqual(["covered", "covered", "missing", "missing"]);
    expect(aura.raid).toBe("missing");
  });

  test("slot 5 and slot 6 are different groups", () => {
    const c = coverage(raid(10, { 4: slot("paladin") }), mini);
    expect(c.buffs.find((b) => b.family.id === "aura")!.groups).toEqual(["covered", "missing"]);
  });

  test("a buff cast on players one at a time is 'cast', not 'covered'", () => {
    const c = coverage(raid(10, { 7: slot("druid") }), mini);
    const wild = c.buffs.find((b) => b.family.id === "wild")!;
    expect(wild.groups).toEqual(["cast", "cast"]);
  });

  test("a talent-gated provider with 'any tree' is only possible", () => {
    const any = coverage(raid(10, { 0: slot("rogue", 0) }), mini);
    expect(any.debuffs[0].raid).toBe("possible");
    const right = coverage(raid(10, { 0: slot("rogue", 1) }), mini);
    expect(right.debuffs[0].raid).toBe("covered");
    const wrong = coverage(raid(10, { 0: slot("rogue", 2) }), mini);
    expect(wrong.debuffs[0].raid).toBe("missing");
  });

  test("a family counts once and takes its best member", () => {
    const wildOnly = coverage(raid(10, { 0: slot("druid", 1) }), mini);
    expect(wildOnly.buffs.find((b) => b.family.id === "wild")!.raid).toBe("cast");
    expect(wildOnly.buffs.filter((b) => b.family.id === "wild")).toHaveLength(1);
  });

  test("unknown scope is shown as unknown when someone brings it, and missing when nobody does", () => {
    expect(coverage(raid(10, { 1: slot("warlock") }), mini).buffs.find((b) => b.family.id === "mystery")!.raid).toBe("unknown");
    expect(coverage(raid(10, { 1: slot("mage") }), mini).buffs.find((b) => b.family.id === "mystery")!.raid).toBe("missing");
  });

  test("debuffs are raid-wide: every group shows the same state", () => {
    const c = coverage(raid(20, { 19: slot("rogue", 1) }), mini);
    expect(c.debuffs[0].groups).toEqual(["covered", "covered", "covered", "covered"]);
  });

  test("the summary counts buff families by raid state", () => {
    const c = coverage(raid(10, { 0: slot("warrior"), 1: slot("druid"), 2: slot("warlock") }), mini);
    expect(c.summary).toEqual({ covered: 1, cast: 1, possible: 0, unknown: 1, missing: 1 });
  });

  test("the shipped table: Battle Shout reaches the raid, Leader of the Pack stays in its party", () => {
    const slots = raid(20, { 0: slot("warrior"), 5: slot("druid", 2) });
    const c = coverage(slots, table);
    expect(c.buffs.find((b) => b.family.id === "battle-shout")!.groups).toEqual(["covered", "covered", "covered", "covered"]);
    expect(c.buffs.find((b) => b.family.id === "leader-of-the-pack")!.groups).toEqual(["missing", "covered", "missing", "missing"]);
  });
});

describe("the shipped table", () => {
  test("is stamped with the current build and has unique ids", () => {
    expect(table.build).toBe(CURRENT_BUILD);
    expect(new Set(table.entries.map((e) => e.id)).size).toBe(table.entries.length);
  });

  test("every entry belongs to a family and names an aura and a class that exist", () => {
    const families = new Set(table.families.map((f) => f.id));
    for (const e of table.entries) {
      expect(families.has(e.family), e.id).toBe(true);
      expect(e.names.length, e.id).toBeGreaterThan(0);
      expect(e.providers.length, e.id).toBeGreaterThan(0);
    }
    for (const f of table.families) expect(table.entries.some((e) => e.family === f.id), f.id).toBe(true);
  });

  test("nothing claims to come from the client table before the table is published", () => {
    expect(table.entries.every((e) => e.evidence !== "client-table" && e.spellIds === undefined)).toBe(true);
  });

  test("the addon's data file lists the same buffs, scopes and aura names", () => {
    const lua = readFileSync(new URL("../../../addon/modules/raid_data.lua", import.meta.url), "utf8");
    expect(lua).toContain(`build = "${table.build}"`);
    const rows = [...lua.matchAll(/^\s*\{ family = "([^"]+)", id = "([^"]+)", scope = "([^"]+)", names = \{([^}]*)\} \},$/gm)];
    const buffs = table.entries.filter((e) => table.families.find((f) => f.id === e.family)!.kind === "buff");
    expect(rows.map((r) => [r[2], r[1], r[3], [...r[4].matchAll(/"([^"]+)"/g)].map((n) => n[1])])).toEqual(
      buffs.map((e) => [e.id, e.family, e.scope, e.names]),
    );
  });
});

describe("share code", () => {
  test("round trips every size, class and tree", () => {
    const classes = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"] as const;
    for (const size of SIZES) {
      const slots = emptySlots(size).map((_, i) => (i % 7 === 6 ? null : slot(classes[i % 9], (i % 4) as Slot["tree"])));
      const decoded = decodeRaid(encodeRaid({ size, build: CURRENT_BUILD, slots }));
      expect(decoded).toEqual({ ok: true, value: { size, build: CURRENT_BUILD, slots } });
    }
  });

  test("an empty raid is a short code and trailing empty slots are left out", () => {
    expect(encodeRaid({ size: 40, build: "1.60.1.70450", slots: emptySlots(40) })).toBe("ELR1-40-1.60.1.70450-");
    const code = encodeRaid({ size: 10, build: "1.60.1.70450", slots: raid(10, { 0: slot("mage", 3) }) });
    expect(code).toBe("ELR1-10-1.60.1.70450-NzM");
    expect(decodeRaid(code)).toMatchObject({ ok: true });
  });

  test("the payload is base64url of class and tree digits", () => {
    // Mage tree 3 is "73", slot 2 is empty ("00"), slot 3 is a warrior with any tree ("10").
    expect(encodeRaid({ size: 10, build: "1.60.1.70450", slots: raid(10, { 0: slot("mage", 3), 2: slot("warrior", 0) }) })).toBe(
      "ELR1-10-1.60.1.70450-NzMwMDEw",
    );
  });

  test("reads a code the addon wrote (addon/tests/raid_contract.py)", () => {
    const r = decodeRaid("ELR1-10-1.60.1.70450-MTA5MDcwMDAwMDYwNTAyMDMw");
    expect(r.ok && r.value.slots.map((s) => s && s.class)).toEqual([
      "warrior", "druid", "mage", null, null, "shaman", "priest", "paladin", "hunter", null,
    ]);
  });

  test("findCode pulls a code out of a link", () => {
    expect(findCode("https://everloot.app/tools/raid#raid=ELR1-10-1.60.1.70450-NzM")).toBe("ELR1-10-1.60.1.70450-NzM");
  });

  test("padding on the end is ignored; surrounding spaces too", () => {
    expect(decodeRaid(" ELR1-10-1.60.1.70450-NzM= ")).toMatchObject({ ok: true });
  });

  test("a code for a later version is refused with a clear message", () => {
    const r = decodeRaid("ELR2-10-1.60.1.70450-NzM");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/version 2/);
  });

  test("the talent code is not a raid code", () => {
    expect(decodeRaid("EL1-mage-1482-1.60.1.70450-OTAwMDE6Miw5MDAwMjoxOjEsOTAwMDQ6Mg").ok).toBe(false);
  });

  test.each([
    ["a size that is not offered", "ELR1-15-1.60.1.70450-NzM"],
    ["a damaged build", "ELR1-10-1..70450-NzM"],
    ["a build with one group", "ELR1-10-70450-NzM"],
    ["characters outside the alphabet", "ELR1-10-1.60.1.70450-Nz!"],
    ["an odd number of digits", "ELR1-10-1.60.1.70450-Nw"],
    ["a class that does not exist", "ELR1-10-1.60.1.70450-MDE"],
    ["a tree that does not exist", "ELR1-10-1.60.1.70450-NzQ"],
    ["more slots than the size", "ELR1-10-1.60.1.70450-" + btoa("7".repeat(22)).replace(/=+$/, "")],
    ["no code at all", ""],
  ])("refuses %s", (_name, code) => {
    expect(decodeRaid(code).ok).toBe(false);
  });
});

describe("layout helpers", () => {
  test("groups are five slots and resizing keeps the first slots", () => {
    const slots = raid(20, { 0: slot("mage"), 19: slot("druid") });
    expect(groupsOf(slots)).toHaveLength(4);
    expect(groupsOf(slots)[3]).toHaveLength(5);
    const small = resize(slots, 10);
    expect(small).toHaveLength(10);
    expect(small[0]).toEqual(slot("mage"));
    expect(resize(small, 40)).toHaveLength(40);
  });
});

describe("generated table adapter", () => {
  const generated = {
    build: { buildId: 70450, version: "1.60.1" },
    entries: [
      { id: "battle-shout", scope: "raid", spells: [{ spellId: 1 }, { spellId: 2 }] },
      { id: "windfury-totem", scope: "party", spells: [{ spellId: 3 }] },
      { id: "thunder-clap", scope: null, spells: [] },
      { id: "sunder-armor", scope: "something-new", spells: [{ spellId: 4 }] },
    ],
  };
  const adapted = adaptGenerated(table, generated, "Found in game files, unconfirmed");

  test("takes scope, spell ids and the build from the generated table", () => {
    const shout = adapted.entries.find((e) => e.id === "battle-shout")!;
    expect(shout).toMatchObject({ scope: "raid", evidence: "client-table", spellIds: [1, 2] });
    expect(adapted.entries.find((e) => e.id === "windfury-totem")!.scope).toBe("party");
    expect(adapted.build).toBe("1.60.1.70450");
    expect(adapted.label).toBe("Found in game files, unconfirmed");
  });

  test("an entry the table lacks, has no scope for, or gives a scope we do not know becomes unknown", () => {
    for (const id of ["thunder-clap", "sunder-armor", "faerie-fire"]) {
      const e = adapted.entries.find((x) => x.id === id)!;
      expect(e.scope, id).toBe("unknown");
    }
    expect(adapted.entries.find((e) => e.id === "thunder-clap")!.evidence).toBe("not-in-table");
  });

  test("keeps providers and families, and does not change the original", () => {
    expect(adapted.entries.find((e) => e.id === "battle-shout")!.providers).toEqual([{ class: "warrior" }]);
    expect(table.entries.find((e) => e.id === "windfury-totem")!.scope).toBe("raid");
  });

  test("changes the coverage: a party-only Windfury no longer reaches other groups", () => {
    const slots = raid(10, { 0: slot("shaman") });
    expect(coverage(slots, table).buffs.find((b) => b.family.id === "windfury")!.groups).toEqual(["covered", "covered"]);
    expect(coverage(slots, adapted).buffs.find((b) => b.family.id === "windfury")!.groups).toEqual(["covered", "missing"]);
  });
});
