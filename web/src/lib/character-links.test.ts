import { createHash, createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { LINK_CODE, type StoredCensusRecord } from "@everloot/protocol";
import { censusAgrees, characterLinksOn, linkCodeHash, linkKey, newLinkCode, type LinkRow } from "./character-links";
import { censusKey } from "./census-intake";

const SECRET = "s".repeat(40);
const GUID = "Player-4395-0A1B2C3D";
const row: LinkRow = {
  kind: "character_link", installId: "install-1234", capturedAt: "2026-10-21T18:00:00.000Z", code: "EL-7K3Q-9P",
  name: "Thrallina", realm: "Forever Pioneer", race: "Orc", class: "SHAMAN", level: 24, faction: "Horde", guid: GUID, completionKey: "0a1b2c3d",
};

test("the switch is on only for exactly 1", () => {
  expect(characterLinksOn({ EVERLOOT_CHARACTER_LINKS: "1" })).toBe(true);
  for (const value of [undefined, "", "0", "true", " 1", "yes"]) expect(characterLinksOn({ EVERLOOT_CHARACTER_LINKS: value })).toBe(false);
});

test("codes have the protocol's shape, use the unambiguous alphabet, and differ", () => {
  const codes = Array.from({ length: 200 }, newLinkCode);
  for (const code of codes) {
    expect(LINK_CODE.safeParse(code).success, code).toBe(true);
    expect(code).toMatch(/^EL-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$/);
  }
  expect(new Set(codes).size).toBeGreaterThan(195);
});

test("a code is kept as the SHA-256 of its upper-case form, so case does not matter", () => {
  expect(linkCodeHash("EL-7K3Q-9P")).toBe(createHash("sha256").update("EL-7K3Q-9P").digest("hex"));
  expect(linkCodeHash(" el-7k3q-9p ")).toBe(linkCodeHash("EL-7K3Q-9P"));
});

test("the link key is HMAC(secret, 'link:' + guid): not the census key, not the GUID, and secret-bound", () => {
  const key = linkKey(GUID, SECRET);
  expect(key).toBe(createHmac("sha256", SECRET).update(`link:${GUID}`).digest("hex"));
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(key).not.toBe(censusKey(GUID, SECRET));
  expect(linkKey(GUID, "t".repeat(40))).not.toBe(key);
});

test("the census agrees when it has no row for the character or every row matches; one mismatch refuses", () => {
  const census = (over: Partial<StoredCensusRecord>) => ({
    kind: "census_self", installId: "install-1234", capturedAt: row.capturedAt, eventId: "census_self:2026-10-21:" + "a".repeat(24),
    characterKey: censusKey(GUID, SECRET), serverId: 4395, race: "Orc", class: "SHAMAN", level: 20, faction: "Horde", realm: "Forever Pioneer", ...over,
  }) as StoredCensusRecord;
  expect(censusAgrees(row, SECRET, [])).toBe(true);
  expect(censusAgrees(row, SECRET, [census({}), census({ level: 24 })])).toBe(true);
  // Another character's row says nothing about this one.
  expect(censusAgrees(row, SECRET, [census({ characterKey: "b".repeat(64), race: "Human" })])).toBe(true);
  expect(censusAgrees(row, SECRET, [census({}), census({ race: "Troll" })])).toBe(false);
  expect(censusAgrees(row, SECRET, [census({ class: "WARRIOR" })])).toBe(false);
  expect(censusAgrees(row, SECRET, [census({ faction: "Alliance" })])).toBe(false);
});
