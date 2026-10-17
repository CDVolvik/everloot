import { expect, test } from "vitest";
import { popularAddonsFromRecords, rollupAllAddons, type AddonSeenRow } from "../src/addon-rollup.js";

const seen = (installId: string, name: string, capturedAt = "2026-10-17T00:00:00Z", loaded = true): AddonSeenRow =>
  ({ installId, name, title: name, loaded, capturedAt });

test("an addon is public once three installs report it", () => {
  const two = rollupAllAddons([seen("a", "Questie"), seen("b", "Questie")]);
  expect(two.addons[0]).toMatchObject({ name: "Questie", installs: 2, public: false });
  const three = rollupAllAddons([seen("a", "Questie"), seen("b", "Questie"), seen("c", "Questie")]);
  expect(three.addons[0]).toMatchObject({ name: "Questie", installs: 3, loadedInstalls: 3, share: 1, public: true });
});

test("one install reporting every session counts once", () => {
  const { addons } = rollupAllAddons([
    seen("a", "Questie", "2026-10-15T00:00:00Z"),
    seen("a", "Questie", "2026-10-16T00:00:00Z"),
    seen("a", "Questie", "2026-10-17T00:00:00Z"),
  ]);
  expect(addons[0]).toMatchObject({ installs: 1, public: false, firstSeen: "2026-10-15T00:00:00Z", lastSeen: "2026-10-17T00:00:00Z" });
});

test("the share is the installs running it out of every install that reported its addons", () => {
  const { addons, reportingInstalls } = rollupAllAddons([
    seen("a", "Questie"), seen("b", "Questie"), seen("c", "Questie", undefined, false),
    seen("a", "Bagnon"), seen("b", "Bagnon"), seen("c", "Bagnon"), seen("d", "Bagnon"),
    seen("d", "Everloot"),
  ]);
  expect(reportingInstalls).toBe(4);
  const questie = addons.find((a) => a.name === "Questie")!;
  expect(questie).toMatchObject({ installs: 3, loadedInstalls: 2, share: 0.5, public: true });
  expect(addons.map((a) => a.name)).toEqual(["Bagnon", "Questie"]);
});

test("Everloot and its answers addon are left out of the ranking", () => {
  const rows = ["a", "b", "c"].flatMap((id) => [seen(id, "Everloot"), seen(id, "EverlootAnswers"), seen(id, "Questie")]);
  expect(rollupAllAddons(rows).addons.map((a) => a.name)).toEqual(["Questie"]);
});

test("the newest title is shown, and the rollup holds no install id", () => {
  const facts = popularAddonsFromRecords([
    { kind: "addon_seen", installId: "install-one", name: "Questie", title: "Questie", loaded: true, capturedAt: "2026-10-15T00:00:00Z" },
    { kind: "addon_seen", installId: "install-two", name: "Questie", title: "Questie 9", loaded: true, capturedAt: "2026-10-17T00:00:00Z" },
    { kind: "addon_seen", installId: "install-ten", name: "Questie", title: "Questie", loaded: true, capturedAt: "2026-10-16T00:00:00Z" },
    { kind: "addon_seen", installId: "install-six", name: "Questie", title: "Questie", loaded: "yes", capturedAt: "2026-10-17T00:00:00Z" },
    { kind: "loot", installId: "install-one" },
  ]);
  expect(facts.addons).toEqual([{
    name: "Questie", title: "Questie 9", installs: 3, loadedInstalls: 3, share: 1,
    firstSeen: "2026-10-15T00:00:00Z", lastSeen: "2026-10-17T00:00:00Z", public: true,
  }]);
  expect(JSON.stringify(facts)).not.toContain("install-");
});

test("the leaderboard's rows leave out addons fewer than three installs report, not just flag them", () => {
  const records = [
    ...["a", "b", "c"].map((id) => ({ kind: "addon_seen", ...seen(id, "Questie") })),
    ...["a", "b"].map((id) => ({ kind: "addon_seen", ...seen(id, "MyGuildTools") })),
  ];
  const { addons, reportingInstalls } = popularAddonsFromRecords(records);
  expect(addons.map((a) => a.name)).toEqual(["Questie"]);
  expect(reportingInstalls).toBe(3);
  expect(JSON.stringify(addons)).not.toContain("MyGuildTools");
});
