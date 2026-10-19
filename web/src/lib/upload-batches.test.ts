import { recordSchemas } from "@everloot/protocol";
import { expect, test, vi } from "vitest";
import { censusCharacters, censusSummary, prepareUpload, sendBatches } from "./upload-batches";
const row = (i: number) => ({ kind: "loot", installId: "install-batches", eventId: `epoch:${i}`, capturedAt: "2026-10-07T00:00:00Z", sourceNpcId: 1, items: [] });
test("splits a full file by records and bytes, withholds legacy and unselected names", () => {
  const legacy = { ...row(9999), eventId: undefined };
  const gold = { kind: "gold_snapshot", installId: "install-batches", eventId: "epoch:gold", capturedAt: row(1).capturedAt, character: "Thrall", realm: "Moon Guard", currentCopper: 1, peakCopper: 1 };
  const session = prepareUpload({ addonVersion: "0.2.0", records: [...Array.from({ length: 4500 }, (_, i) => row(i)), legacy, gold, { kind: "bogus" }] }, {}, []);
  expect(session.batches.map((b) => JSON.parse(b).records.length)).toEqual([2000, 2000, 500]);
  expect(session.held).toEqual({ legacy: 1, named: 1, invalid: 1 });
  expect(session.batches.every((b) => new TextEncoder().encode(b).length <= 600_000)).toBe(true);
});
test("resumes at the first unconfirmed batch and rejects an unpersisted receipt", async () => {
  const session = prepareUpload({ addonVersion: "0.2.0", records: Array.from({ length: 2001 }, (_, i) => row(i)) }, {}, []);
  const first = session.batches[0], second = session.batches[1];
  const send = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, persisted: true, uploadId: "first", accepted: Array(2000).fill({}) })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, persisted: false })));
  await expect(sendBatches(session, send)).rejects.toThrow(/confirmed/i);
  expect(session.next).toBe(1);
  expect(session.receipts).toHaveLength(1);
  send.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, persisted: true, uploadId: "second", accepted: [{}] })));
  await sendBatches(session, send);
  expect(send.mock.calls.map((call) => call[1].body)).toEqual([first, second, second]);
  expect(session.next).toBe(2);
});
test("byte limits apply to large valid rows and one oversized row is an actionable failure", () => {
  const guild = { kind: "guild_snapshot", faction: "horde", installId: "install-batches", capturedAt: row(1).capturedAt, realm: "Moon Guard", guildName: "Raiders", members: Array.from({ length: 2000 }, (_, i) => ({ name: `Member${i}`, rank: "Member", lastOnlineDays: 0, level: 90, class: "Warrior" })) };
  const records = Array.from({ length: 10 }, (_, i) => ({ ...guild, eventId: `roster:${i}` }));
  const session = prepareUpload({ addonVersion: "0.2.0", records }, { guild: true }, ["a".repeat(64)]);
  expect(session.batches.length).toBeGreaterThan(1);
  expect(session.batches.every((b) => new TextEncoder().encode(b).length <= 600_000)).toBe(true);
  expect(() => prepareUpload({ addonVersion: "0.2.0", records }, { guild: true }, ["a".repeat(64)], 200)).toThrow(/large/i);
});
test("every batch carries the client build, and the preview lists the addons being sent", () => {
  const addon = (i: number, name: string, title: string) => ({ kind: "addon_seen", installId: "install-batches", eventId: `epoch:addon${i}`, capturedAt: row(1).capturedAt, name, title, loaded: true });
  const records = [...Array.from({ length: 2001 }, (_, i) => row(i)),
    addon(1, "Questie", "Questie"), addon(2, "DBM-Core", "Deadly Boss Mods"), addon(3, "DBM-StatusBarTimers", "Deadly Boss Mods"), addon(4, "Questie", "Questie")];
  const session = prepareUpload({ addonVersion: "0.2.6", clientBuild: "1.60.1.70450", records }, {}, []);
  expect(session.batches.map((b) => JSON.parse(b).clientBuild)).toEqual(["1.60.1.70450", "1.60.1.70450"]);
  // One entry per folder, since the folder name is what is uploaded; two folders can share a title.
  expect(session.addons).toEqual(["Deadly Boss Mods (DBM-Core)", "Deadly Boss Mods (DBM-StatusBarTimers)", "Questie (Questie)"]);
  const old = prepareUpload({ addonVersion: "0.2.5", records: [row(1)] }, {}, []);
  expect(JSON.parse(old.batches[0])).not.toHaveProperty("clientBuild");
  expect(old.addons).toEqual([]);
  const unreadable = prepareUpload({ addonVersion: "0.2.6", clientBuild: "beta", records: [row(1)] }, {}, []);
  expect(JSON.parse(unreadable.batches[0])).not.toHaveProperty("clientBuild");
});
test("the census preview counts characters, not rows", () => {
  expect(censusSummary({ seen: 312, self: 2 })).toBe("312 characters seen, 2 of your own");
  expect(censusSummary({ seen: 1, self: 0 })).toBe("1 character seen, 0 of your own");
  expect(censusSummary({ seen: 1200, self: 1 })).toBe("1,200 characters seen, 1 of your own");
  expect(censusSummary({ seen: 0, self: 0 })).toBeNull();
  expect(prepareUpload({ addonVersion: "0.3.3", records: [row(1)] }, {}, []).census).toEqual({ seen: 0, self: 0 });
});
test("a census row without a guid is not counted as a character", () => {
  expect(censusCharacters([
    { kind: "census_seen", guid: "Player-4242-00000001" }, { kind: "census_seen", guid: "Player-4242-00000001" },
    { kind: "census_seen" }, { kind: "census_seen", guid: "" }, { kind: "census_seen", guid: 7 },
    { kind: "census_self", guid: "Player-4242-00AABBCC" }, { kind: "census_self" },
    { kind: "loot", guid: "Player-4242-00000002" },
  ])).toEqual({ seen: 1, self: 1 });
});
// Runs once the census intake change adds the kinds to @everloot/protocol; until then the server would refuse them.
test.skipIf(!("census_seen" in recordSchemas))("census rows reach the preview as distinct characters per kind", () => {
  const base = { installId: "install-batches", capturedAt: "2026-10-18T00:00:00Z", race: "Orc", class: "WARRIOR", level: 20, faction: "Horde" };
  const seen = (n: number, guid: string) => ({ ...base, kind: "census_seen", eventId: `census_seen:2026-10-18:${n}`, guid, via: "target" });
  const self = { ...base, kind: "census_self", eventId: "census_self:2026-10-18:1", guid: "Player-4242-00AABBCC", realm: "Forever" };
  // The same player on two days is two rows and one character.
  const session = prepareUpload({ addonVersion: "0.3.3", records: [seen(1, "Player-4242-00000001"), seen(2, "Player-4242-00000002"), seen(3, "Player-4242-00000001"), self] }, {}, []);
  expect(session.census).toEqual({ seen: 2, self: 1 });
});
