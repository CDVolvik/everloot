import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CURRENT_BUILD, TABLES, type BuffTable } from "@/data/game-data/raid";
import {
  coverage, decodeRaid, emptySlots, encodeRaid, findCode, groupsOf, resize, SIZES, treeNames,
  type Slot, type Slots,
} from "./raid";

const table = TABLES[CURRENT_BUILD];
const slot = (c: Slot["class"], tree: Slot["tree"] = 0): Slot => ({ class: c, tree });

/** A table of our own, so the math is tested without depending on the generated data. */
const entry = (id: string, family: string, cls: string, scope: BuffTable["entries"][number]["scope"]) =>
  ({ id, label: id, family, class: cls, scope, names: [id], spellIds: [1] });
const mini: BuffTable = {
  build: "1.0.1",
  label: "test",
  notFound: [],
  trees: {},
  families: [
    { id: "shout", label: "Shout", kind: "buff" },
    { id: "aura", label: "Aura", kind: "buff" },
    { id: "wild", label: "Wild", kind: "buff" },
    { id: "mystery", label: "Mystery", kind: "buff" },
    { id: "armor", label: "Armor", kind: "debuff" },
  ],
  entries: [
    entry("shout", "shout", "warrior", "raid"),
    entry("aura", "aura", "paladin", "party"),
    entry("wild", "wild", "druid", "single"),
    entry("gwild", "wild", "druid", "unknown"),
    entry("mystery", "mystery", "warlock", "mixed"),
    entry("armor", "armor", "rogue", "enemy"),
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
    const shout = coverage(raid(20, { 17: slot("warrior") }), mini).buffs.find((b) => b.family.id === "shout")!;
    expect(shout.groups).toEqual(["covered", "covered", "covered", "covered"]);
    expect(shout.raid).toBe("covered");
  });

  test("a party-scope buff reaches only the group that holds the provider", () => {
    const aura = coverage(raid(20, { 0: slot("paladin"), 6: slot("paladin") }), mini).buffs.find((b) => b.family.id === "aura")!;
    expect(aura.groups).toEqual(["covered", "covered", "missing", "missing"]);
    expect(aura.raid).toBe("missing");
  });

  test("slot 5 and slot 6 are different groups", () => {
    const c = coverage(raid(10, { 4: slot("paladin") }), mini);
    expect(c.buffs.find((b) => b.family.id === "aura")!.groups).toEqual(["covered", "missing"]);
  });

  test("a buff cast on players one at a time is 'cast', not 'covered'", () => {
    const wild = coverage(raid(10, { 7: slot("druid") }), mini).buffs.find((b) => b.family.id === "wild")!;
    expect(wild.groups).toEqual(["cast", "cast"]);
  });

  test("the tree does not change coverage: the game files do not gate effects by tree", () => {
    const a = coverage(raid(10, { 0: slot("rogue", 0) }), mini);
    const b = coverage(raid(10, { 0: slot("rogue", 3) }), mini);
    expect(a).toEqual(b);
    expect(a.debuffs[0].raid).toBe("covered");
  });

  test("a family counts once and takes its best member", () => {
    const c = coverage(raid(10, { 0: slot("druid", 1) }), mini);
    expect(c.buffs.filter((b) => b.family.id === "wild")).toHaveLength(1);
    expect(c.buffs.find((b) => b.family.id === "wild")!.raid).toBe("cast");
  });

  test("unknown and mixed scope read as unknown when someone brings it, missing when nobody does", () => {
    expect(coverage(raid(10, { 1: slot("warlock") }), mini).buffs.find((b) => b.family.id === "mystery")!.raid).toBe("unknown");
    expect(coverage(raid(10, { 1: slot("mage") }), mini).buffs.find((b) => b.family.id === "mystery")!.raid).toBe("missing");
  });

  test("debuffs are raid-wide: every group shows the same state", () => {
    const c = coverage(raid(20, { 19: slot("rogue", 1) }), mini);
    expect(c.debuffs[0].groups).toEqual(["covered", "covered", "covered", "covered"]);
  });

  test("the summary counts buff families by raid state", () => {
    const c = coverage(raid(10, { 0: slot("warrior"), 1: slot("druid"), 2: slot("warlock") }), mini);
    expect(c.summary).toEqual({ covered: 1, cast: 1, unknown: 1, missing: 1 });
  });

  test("the generated table: Battle Shout reaches the raid, and Gift of the Wild (raid in the files) covers the Mark of the Wild family", () => {
    const c = coverage(raid(20, { 0: slot("warrior"), 5: slot("druid", 2) }), table);
    expect(c.buffs.find((b) => b.family.id === "battle-shout")!.groups).toEqual(["covered", "covered", "covered", "covered"]);
    expect(c.buffs.find((b) => b.family.id === "mark-of-the-wild")!.raid).toBe("covered");
  });

  test("Greater Blessings and Salvation stay unknown, and Sanctuary is absent", () => {
    const paladin = coverage(raid(10, { 0: slot("paladin") }), table);
    expect(paladin.buffs.find((b) => b.family.id === "blessing-of-salvation")!.raid).toBe("unknown");
    expect(table.entries.filter((e) => e.id.startsWith("greater-")).every((e) => e.scope === "unknown")).toBe(true);
    expect(table.entries.some((e) => e.id === "blessing-of-sanctuary")).toBe(false);
    expect(table.notFound).toContain("blessing-of-sanctuary");
  });
});

describe("the generated table", () => {
  test("is stamped with the build, has unique ids, and a family for every entry", () => {
    expect(table.build).toBe(CURRENT_BUILD);
    expect(new Set(table.entries.map((e) => e.id)).size).toBe(table.entries.length);
    const families = new Set(table.families.map((f) => f.id));
    for (const e of table.entries) {
      expect(families.has(e.family), e.id).toBe(true);
      expect(e.spellIds.length, e.id).toBeGreaterThan(0);
      expect(e.names.length, e.id).toBeGreaterThan(0);
    }
    for (const f of table.families) expect(table.entries.some((e) => e.id === f.id), f.id).toBe(true);
  });

  test("keeps the per-rank scope only where ranks disagree, and holds no tooltip text", () => {
    for (const e of table.entries) expect(e.byRank !== undefined, e.id).toBe(e.scope === "mixed");
    expect(JSON.stringify(table)).not.toMatch(/description|tooltip/i);
  });

  test("has nine classes with three tree names each, from the game", () => {
    expect(Object.keys(table.trees)).toHaveLength(9);
    for (const names of Object.values(table.trees)) expect(names).toHaveLength(3);
    expect(treeNames(table, "druid")).toEqual(["Balance", "Feral Combat", "Restoration"]);
  });

  test("the addon's data file lists the same buffs, scopes, aura names and spell ids", () => {
    const lua = readFileSync(new URL("../../../addon/modules/raid_data.lua", import.meta.url), "utf8");
    expect(lua).toContain(`build = "${table.build}"`);
    const row = /^\s*\{ family = "([^"]+)", id = "([^"]+)", scope = "([^"]+)", names = \{([^}]*)\}, spellIds = \{([^}]*)\} \},$/gm;
    const rows = [...lua.matchAll(row)];
    const buffs = table.entries.filter((e) => table.families.find((f) => f.id === e.family)!.kind === "buff");
    const quoted = /"([^"]*)"/g;
    expect(rows.map((r) => [r[2], r[1], r[3], [...r[4].matchAll(quoted)].map((n) => n[1]), r[5].split(", ").map(Number)])).toEqual(
      buffs.map((e) => [e.id, e.family, e.scope, e.names, e.spellIds]),
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
