import { describe, expect, test } from "vitest";
import { ALL_RECORD_KINDS, LINK_KINDS, parseRecords, PUBLIC_RECORD_KINDS } from "../src/index.js";

const row = {
  installId: "test-install-1234", capturedAt: "2026-10-21T18:00:00.000Z", eventId: "character_link:1",
  kind: "character_link", code: "EL-7K3Q-9P", name: "Thrallina", realm: "Forever Pioneer", race: "Orc", class: "SHAMAN",
  level: 24, faction: "Horde", guid: "Player-4395-0A1B2C3D", completionKey: "0a1b2c3d",
};

const reasons = (rows: unknown[]) => parseRecords(rows).receipt.rejected.map((r) => r.reason);

describe("character_link records", () => {
  test("it is a record kind and not a public corpus kind", () => {
    expect(LINK_KINDS).toEqual(["character_link"]);
    expect(ALL_RECORD_KINDS).toContain("character_link");
    expect(PUBLIC_RECORD_KINDS).not.toContain("character_link");
  });

  test("a row parses as sent, and a code typed in lower case is accepted", () => {
    const lower = { ...row, code: "el-7k3q-9p" };
    const parsed = parseRecords([row, lower]);
    expect(parsed.receipt.rejected).toEqual([]);
    expect(parsed.records).toEqual([row, lower]);
  });

  test("a code outside the alphabet or the shape is refused", () => {
    for (const code of ["EL-7K3Q-9", "EL-7K3Q9P", "XX-7K3Q-9P", "EL-7K3O-9P", "EL-7K3I-9P", "EL-7K3U-9P", "EL-7K3Q-9P-1"]) {
      expect(reasons([{ ...row, code }]), code).toHaveLength(1);
    }
  });

  test("every listed field is required and checked", () => {
    for (const field of ["code", "name", "realm", "race", "class", "level", "faction", "guid", "completionKey"]) {
      const { [field]: _gone, ...without } = row as Record<string, unknown>;
      expect(reasons([without]), field).toHaveLength(1);
    }
    expect(reasons([{ ...row, guid: "Creature-0-1" }])).toHaveLength(1);
    expect(reasons([{ ...row, completionKey: "0A1B2C3D" }])).toHaveLength(1);
    expect(reasons([{ ...row, faction: "Neutral" }])).toHaveLength(1);
    expect(reasons([{ ...row, level: 61 }])).toHaveLength(1);
  });

  test("anything else the client sends is dropped", () => {
    const parsed = parseRecords([{ ...row, x: 1, gold: 5, guild: "Night Watch" }]);
    expect(parsed.receipt.rejected).toEqual([]);
    expect(Object.keys(parsed.records[0]).sort()).toEqual(Object.keys(row).sort());
  });
});
