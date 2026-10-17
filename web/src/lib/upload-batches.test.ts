import { expect, test, vi } from "vitest";
import { prepareUpload, sendBatches } from "./upload-batches";
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
  const addon = (i: number, title: string) => ({ kind: "addon_seen", installId: "install-batches", eventId: `epoch:addon${i}`, capturedAt: row(1).capturedAt, name: title.replace(/ /g, ""), title, loaded: true });
  const records = [...Array.from({ length: 2001 }, (_, i) => row(i)), addon(1, "Questie"), addon(2, "Bagnon"), addon(3, "Questie")];
  const session = prepareUpload({ addonVersion: "0.2.6", clientBuild: "1.60.1.70450", records }, {}, []);
  expect(session.batches.map((b) => JSON.parse(b).clientBuild)).toEqual(["1.60.1.70450", "1.60.1.70450"]);
  expect(session.addons).toEqual(["Bagnon", "Questie"]);
  const old = prepareUpload({ addonVersion: "0.2.5", records: [row(1)] }, {}, []);
  expect(JSON.parse(old.batches[0])).not.toHaveProperty("clientBuild");
  expect(old.addons).toEqual([]);
  const unreadable = prepareUpload({ addonVersion: "0.2.6", clientBuild: "beta", records: [row(1)] }, {}, []);
  expect(JSON.parse(unreadable.batches[0])).not.toHaveProperty("clientBuild");
});
