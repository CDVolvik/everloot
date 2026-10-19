import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { parseRecords } from "@everloot/protocol";
import { censusDateProblem, characterSecret, isCensusRow, storedCensusRow } from "./census-intake";

const GUID = "Player-4395-0A1B2C3D";
const SECRET = "test-character-key".repeat(2);

const self = {
  kind: "census_self", installId: "install-1234", eventId: `census_self:${GUID}`, capturedAt: "2026-10-18T21:30:00.000Z",
  guid: GUID, race: "Scourge", class: "PRIEST", level: 24, faction: "Horde", realm: "Forever",
};
const seen = { ...self, kind: "census_seen", realm: undefined, via: "group" };

/** One wire row, parsed the way intake parses it. */
function parsed(row: unknown) {
  const [record] = parseRecords([row]).records;
  if (!record || !isCensusRow(record)) throw new Error("expected a census row");
  return record;
}

/** Every substring of the GUID of five or more characters, upper and lower case. */
function guidPieces(guid: string): string[] {
  const pieces = new Set<string>();
  for (let i = 0; i < guid.length; i++) for (let j = i + 5; j <= guid.length; j++) pieces.add(guid.slice(i, j).toLowerCase());
  return [...pieces];
}

describe("census rows before storage", () => {
  test("the GUID, and any piece of it, is gone from the stored row", () => {
    for (const row of [self, seen]) {
      const stored = storedCensusRow(parsed(row), SECRET);
      expect(stored).not.toBeNull();
      const text = JSON.stringify(stored).toLowerCase();
      for (const piece of guidPieces(GUID)) expect(text, piece).not.toContain(piece);
      expect(stored).not.toHaveProperty("guid");
    }
  });

  test("the character key is HMAC-SHA256 of the GUID under the server's key, and the server id is kept", () => {
    const characterKey = createHmac("sha256", SECRET).update(GUID).digest("hex");
    expect(storedCensusRow(parsed(self), SECRET)).toEqual({
      kind: "census_self", installId: "install-1234", capturedAt: self.capturedAt,
      eventId: `census_self:2026-10-18:${characterKey.slice(0, 24)}`,
      characterKey, serverId: 4395, race: "Scourge", class: "PRIEST", level: 24, faction: "Horde", realm: "Forever",
    });
    expect(storedCensusRow(parsed(seen), SECRET)).toMatchObject({ kind: "census_seen", characterKey, serverId: 4395, via: "group" });
    expect(storedCensusRow(parsed(seen), SECRET)).not.toHaveProperty("realm");
  });

  test("the event id is the server's own, by UTC day, whatever the client sent", () => {
    const late = storedCensusRow(parsed({ ...seen, capturedAt: "2026-10-18T22:30:00-05:00", eventId: "anything-at-all" }), SECRET);
    expect(late?.eventId).toMatch(/^census_seen:2026-10-19:[0-9a-f]{24}$/);
    const none = storedCensusRow(parsed({ ...seen, eventId: undefined }), SECRET);
    expect(none?.eventId).toBe(storedCensusRow(parsed(seen), SECRET)?.eventId);
  });

  test("one character seen from two installs has one key; another key gives another", () => {
    const a = storedCensusRow(parsed(seen), SECRET);
    const b = storedCensusRow(parsed({ ...seen, installId: "install-5678" }), SECRET);
    expect(a?.characterKey).toBe(b?.characterKey);
    expect(storedCensusRow(parsed(seen), "rotated-key".repeat(3))?.characterKey).not.toBe(a?.characterKey);
  });

  test("a server id too long to be a safe integer is not stored", () => {
    expect(storedCensusRow(parsed({ ...seen, guid: `Player-${"9".repeat(20)}-0A1B` }), SECRET)).toBeNull();
  });

  test("the key comes from EVERLOOT_CHARACTER_KEY; unset, blank or under 32 characters means no census", () => {
    expect(characterSecret({ EVERLOOT_CHARACTER_KEY: SECRET })).toBe(SECRET);
    expect(characterSecret({ EVERLOOT_CHARACTER_KEY: `  ${"k".repeat(32)}  ` })).toBe("k".repeat(32));
    expect(characterSecret({ EVERLOOT_CHARACTER_KEY: "k".repeat(31) })).toBeNull();
    expect(characterSecret({ EVERLOOT_CHARACTER_KEY: "" })).toBeNull();
    expect(characterSecret({ EVERLOOT_CHARACTER_KEY: "   " })).toBeNull();
    expect(characterSecret({})).toBeNull();
  });

  test("the sender's address hash is kept on the row, and only when there is one", () => {
    const reporter = "ab12".repeat(4);
    expect(storedCensusRow(parsed(seen), SECRET, reporter)).toMatchObject({ reporter });
    expect(storedCensusRow(parsed(seen), SECRET)).not.toHaveProperty("reporter");
  });

  test("a row date is held to the server's clock: one day ahead, thirty days back", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    expect(censusDateProblem("2026-10-19T12:00:00Z", now)).toBeNull();
    expect(censusDateProblem("2026-10-19T12:00:01Z", now)).not.toBeNull();
    expect(censusDateProblem("2026-09-18T12:00:00Z", now)).toBeNull();
    expect(censusDateProblem("2026-09-18T11:59:59Z", now)).not.toBeNull();
    expect(censusDateProblem("not a date", now)).not.toBeNull();
  });
});
