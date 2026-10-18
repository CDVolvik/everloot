import { expect, test } from "vitest";
import { authorizeRecord, type PublicationGrant, type PublicationState } from "../src/publication.js";
import { parseRecords } from "@everloot/protocol";

const hash = "a".repeat(64);
const grant: PublicationGrant = { tokenHash: hash, installId: "install-one", realm: "Moon Guard",
  subjectType: "guild", subject: "Test Guild", categories: ["guild"], expiresAt: "2026-11-01T00:00:00Z",
  verifiedBy: "operator", evidence: "Officer authority verified in beta client", revokedAt: null };
const row = parseRecords([{ kind: "guild_snapshot", installId: "install-one", eventId: "epoch:1",
  capturedAt: "2026-10-07T00:00:00Z", guildName: "Test Guild", realm: "Moon Guard", faction: "horde",
  claimToken: "pending-officer-claim", members: [{ name: "Thrall", rank: "Officer", level: 60, class: "Shaman", lastOnlineDays: 0 }] }]).records[0];
const state: PublicationState = { grants: [grant], suppressions: [] };
const now = new Date("2026-10-07T00:00:00Z");
test("a schema-valid placeholder never establishes officer authority", () => {
  expect(authorizeRecord(row, [], state, now)).toBeNull();
  expect(authorizeRecord(row, ["b".repeat(64)], state, now)).toBeNull();
});
test("only a live, install/realm/guild-scoped grant publishes the roster", () => {
  expect(authorizeRecord(row, [hash], state, now)).not.toBeNull();
  for (const over of [{ installId: "other-install" }, { realm: "Other Realm" }, { subject: "Other Guild" },
    { expiresAt: "2026-10-01T00:00:00Z" }, { revokedAt: "2026-10-07T00:00:00Z" }, { categories: [] }]) {
    expect(authorizeRecord(row, [hash], { grants: [{ ...grant, ...over }], suppressions: [] }, now)).toBeNull();
  }
});
test("member opt-out removes the name from rosters even under another live officer grant", () => {
  expect(authorizeRecord(row, [hash], { ...state, suppressions: [{ realm: "moon guard", character: "thrall" }] }, now)).toBeNull();
});
test("gold requires its own verified character/category scope", () => {
  const gold = parseRecords([{ kind: "gold_snapshot", installId: "install-one", eventId: "epoch:2",
    capturedAt: "2026-10-07T00:00:00Z", character: "Thrall", realm: "Moon Guard", currentCopper: 50, peakCopper: 50 }]).records[0];
  expect(authorizeRecord(gold, [hash], state, now)).toBeNull();
  const characterGrant = { ...grant, subjectType: "character" as const, subject: "Thrall", categories: ["gold" as const] };
  expect(authorizeRecord(gold, [hash], { grants: [characterGrant], suppressions: [] }, now)).toEqual(gold);
  expect(authorizeRecord(gold, [hash], { grants: [characterGrant], suppressions: [{ realm: "Moon Guard", character: "Thrall" }] }, now)).toBeNull();
});
