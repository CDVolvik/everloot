import { describe, expect, test } from "vitest";
import { agreedDifficulties, confirmedEntrances, instanceBosses, instanceFactsFromRecords } from "../src/instances.js";

// SYNTHETIC records; ids, names and times are made up.
const asOf = new Date("2026-10-21T12:00:00Z");
const entrance = (installId: string, capturedAt: string, extra: object = {}) => ({
  kind: "instance_entrance", installId, capturedAt, instanceMapId: 36, name: "Synthetic Mines", instanceType: "party", mapId: 1436, x: 42, y: 72, ...extra,
});
const encounter = (installId: string, capturedAt: string, success = true, extra: object = {}) => ({
  kind: "encounter", installId, capturedAt, encounterId: 9, name: "Foreman", instanceMapId: 36, success, npcIds: [77], ...extra,
});

describe("when an agreed instance fact was last seen", () => {
  test("an entrance carries its installs and the latest time one zoned in; the place and the count are as before", () => {
    const facts = instanceFactsFromRecords([
      entrance("a", "2026-10-18T10:00:00Z"), entrance("b", "2026-10-20T09:30:00Z"), entrance("c", "2026-10-19T08:00:00Z"),
    ]);
    expect(confirmedEntrances(facts.entrances, asOf)).toEqual([
      { instanceMapId: 36, name: "Synthetic Mines", instanceType: "party", mapId: 1436, x: 42, y: 72, reporters: 3, lastSeen: "2026-10-20T09:30:00.000Z" },
    ]);
  });

  test("a time after the corpus's own is left out, so a clock set ahead cannot move it", () => {
    const facts = instanceFactsFromRecords([
      entrance("a", "2026-10-18T10:00:00Z"), entrance("b", "2026-10-19T09:30:00Z"), entrance("c", "2031-01-01T00:00:00Z"),
    ]);
    const [e] = confirmedEntrances(facts.entrances, asOf);
    expect(e).toMatchObject({ reporters: 3, lastSeen: "2026-10-19T09:30:00.000Z" });
  });

  test("rows without a time still count; the date is then unknown", () => {
    const rows = [entrance("a", "x"), entrance("b", "x"), entrance("c", "x")];
    const [e] = confirmedEntrances(instanceFactsFromRecords(rows).entrances, asOf);
    expect(e).toMatchObject({ reporters: 3, lastSeen: null });
  });

  test("a boss carries its kills, its installs and the latest report, a wipe included", () => {
    const facts = instanceFactsFromRecords([
      encounter("a", "2026-10-18T10:00:00Z"), encounter("a", "2026-10-18T11:00:00Z"), encounter("b", "2026-10-19T10:00:00Z"),
      encounter("c", "2026-10-20T22:00:00Z", false),
    ]);
    expect(instanceBosses(facts.encounters, asOf).get(36)).toEqual([
      { encounterId: 9, name: "Foreman", kills: 3, npcIds: [77], reporters: 3, lastSeen: "2026-10-20T22:00:00.000Z" },
    ]);
  });
});

describe("agreedDifficulties", () => {
  test("3 installs agree on an instance's difficulty across entrances and encounters; 2 do not", () => {
    const facts = instanceFactsFromRecords([
      entrance("a", "2026-10-18T10:00:00Z", { difficulty: 1 }), entrance("b", "2026-10-18T10:00:00Z", { difficulty: 1 }),
      encounter("c", "2026-10-18T10:00:00Z", true, { difficulty: 1 }),
      { ...entrance("a", "2026-10-18T10:00:00Z", { difficulty: 9 }), instanceMapId: 409 }, { ...entrance("b", "2026-10-18T10:00:00Z", { difficulty: 9 }), instanceMapId: 409 },
    ]);
    expect([...agreedDifficulties(facts)]).toEqual([[36, 1]]);
  });
});
