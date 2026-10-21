import { expect, test } from "vitest";
import { tallyVotes, type VoteRow } from "../src/fact-states.js";
import { foldRecorderInstalls } from "../src/recorder-installs.js";
import { agreedLabelsById, npcTraits } from "../src/world-pages.js";

const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString();
const votes = (count: number, value: string | number = "Hogger", start = 0): VoteRow[] =>
  Array.from({ length: count }, (_, i) => ({ installId: `v${start + i}`, value, capturedAt: day(0) }));
const at = (n: number) => ({ asOf: day(n) });

test("no reported value is missing; one or two voters are reported; three confirm", () => {
  expect(tallyVotes([], at(20)).state).toBe("missing");
  for (const count of [1, 2]) expect(tallyVotes(votes(count), at(20)).state).toBe("reported");
  expect(tallyVotes(votes(3), at(20)).state).toBe("confirmed");
});

test("different values are separate votes, and two winning groups are contested", () => {
  expect(tallyVotes([...votes(2), ...votes(1, "Riverpaw", 2)], at(20)).state).toBe("reported");
  const split = tallyVotes([...votes(3), ...votes(3, "Riverpaw", 3)], at(20));
  expect(split.state).toBe("reported");
  expect(split.contested).toBe(true);
  expect(split.winner).toBeNull();
  expect(tallyVotes([...votes(3), ...votes(1, "Riverpaw", 3)], at(20)).state).toBe("confirmed");
  // An install can appear in different groups; it never contributes twice to either.
  expect(tallyVotes([...votes(3), ...votes(3, "Riverpaw")], at(20)).contested).toBe(true);
});

test("repeat records and whitespace in install ids do not add voters", () => {
  const rows = [...votes(2), { ...votes(1)[0]!, installId: " v0 ", capturedAt: day(10) }];
  const result = tallyVotes(rows, at(20));
  expect(result.state).toBe("reported");
  expect(result.groups[0]!.voters.size).toBe(2);
  expect(result.groups[0]!.firstCapturedAt).toBe(Date.parse(day(0)));
  expect(result.groups[0]!.lastCapturedAt).toBe(Date.parse(day(10)));
});

test("Recorder character on two addresses is one voter, using the corpus fold", () => {
  const rows = [
    { installId: "ps-1111111111111111-aaaaaaaaaaaaaaaa", value: 7 },
    { installId: "ps-1111111111111111-bbbbbbbbbbbbbbbb", value: 7 },
    { installId: "ps-2222222222222222-cccccccccccccccc", value: 7 },
  ];
  expect(tallyVotes(foldRecorderInstalls(rows)).state).toBe("reported");
  expect(tallyVotes(foldRecorderInstalls(rows)).groups[0]!.voters.size).toBe(2);
});

test("labels preserve the first spelling and integers follow the existing readers", () => {
  const rows = [{ installId: "a", value: " Hogger " }, { installId: "b", value: "hogger" }, { installId: "c", value: "HOGGER" }];
  expect(tallyVotes(rows).winner?.value).toBe("Hogger");
  expect(tallyVotes([...rows, { installId: "d", value: "" }, { installId: " ", value: "other" }]).groups).toHaveLength(1);
  expect(tallyVotes([...votes(3, 11), ...votes(3, 1.5, 3)]).winner?.value).toBe(11);
  expect(tallyVotes([...votes(3, 11), ...votes(3, "11", 3)]).contested).toBe(true);
});

test("settling needs five voters and fourteen full days since the third distinct voter", () => {
  expect(tallyVotes(votes(4), at(14)).state).toBe("confirmed");
  expect(tallyVotes(votes(5), at(13)).state).toBe("confirmed");
  expect(tallyVotes(votes(5), at(14)).state).toBe("settled");
  expect(tallyVotes(votes(5), { asOf: new Date(Date.parse(day(14)) - 1).toISOString() }).state).toBe("confirmed");
  const lateThird = votes(5).map((r, i) => ({ ...r, capturedAt: day(i < 2 ? 0 : 7) }));
  expect(tallyVotes(lateThird, at(20)).state).toBe("confirmed");
  expect(tallyVotes([...lateThird].reverse(), at(21)).state).toBe("settled");
  const repeated = [...votes(2), ...votes(3).map((r) => ({ ...r, capturedAt: day(7) }))];
  expect(tallyVotes(repeated, at(20)).state).toBe("confirmed");
  const freshExtras = [...votes(3), ...votes(2, "Hogger", 3).map((r) => ({ ...r, capturedAt: day(14) }))];
  expect(tallyVotes(freshExtras, at(14)).state).toBe("settled");
});

test("a newly conflicting voter prevents settling for fourteen days", () => {
  const rows = [...votes(5), { installId: "other", value: "Riverpaw", capturedAt: day(7) }];
  expect(tallyVotes(rows, at(20)).state).toBe("confirmed");
  expect(tallyVotes(rows, at(21)).state).toBe("settled");
  // Repeating an existing conflicting vote does not gain a voter.
  expect(tallyVotes([...rows, { ...rows[5]!, capturedAt: day(20) }], at(21)).state).toBe("settled");
  expect(tallyVotes([...rows, { ...rows[5]!, installId: "new", capturedAt: day(20) }], at(21)).state).toBe("confirmed");
});

test("future timestamps are clamped and missing or invalid times never manufacture age", () => {
  expect(tallyVotes(votes(5).map((r) => ({ ...r, capturedAt: day(30) })), at(14)).state).toBe("confirmed");
  for (const capturedAt of [undefined, "bad"]) {
    expect(tallyVotes(votes(5).map((r) => ({ ...r, capturedAt })), at(14)).state).toBe("confirmed");
  }
  expect(tallyVotes(votes(5)).state).toBe("confirmed");
});

test("recheck excludes old and cutoff-time votes, then three new voters reconfirm", () => {
  const old = votes(5);
  const options = { ...at(30), recheckSince: day(10) };
  expect(tallyVotes(old, options).state).toBe("recheck");
  expect(tallyVotes(votes(3), options).state).toBe("recheck");
  expect(tallyVotes([...old, ...votes(3, "Riverpaw", 5).map((r) => ({ ...r, capturedAt: day(10) }))], options).state).toBe("recheck");
  const fresh = votes(5, "Riverpaw", 5).map((r) => ({ ...r, capturedAt: day(11) }));
  expect(tallyVotes([...old, ...fresh.slice(0, 2)], options).state).toBe("recheck");
  expect(tallyVotes([...old, ...fresh.slice(0, 3)], options).state).toBe("confirmed");
  expect(tallyVotes([...old, ...fresh], { ...at(25), recheckSince: day(10) }).state).toBe("settled");
  expect(tallyVotes(votes(2), options).state).toBe("reported");
  expect(tallyVotes([], options).state).toBe("missing");
});

test("reader labels and numbers retain their current results at every agreement boundary", () => {
  const label = (rows: VoteRow[]) => agreedLabelsById(rows.map((r) => ({ id: 7, installId: r.installId, label: String(r.value) }))).get(7);
  expect(label(votes(2))).toBeUndefined();
  expect(label(votes(3))).toBe("Hogger");
  expect(label([...votes(3), ...votes(3, "Other", 3)])).toBeUndefined();
  const level = (rows: VoteRow[]) => npcTraits(rows.map((r) => ({ installId: r.installId, npcId: 7, name: "Hogger", mapId: 1, x: 1, y: 1, level: Number(r.value) }))).level;
  expect(level(votes(2, 11))).toBeNull();
  expect(level(votes(3, 11))).toBe(11);
  expect(level([...votes(3, 11), ...votes(3, 12, 3)])).toBeNull();
});
