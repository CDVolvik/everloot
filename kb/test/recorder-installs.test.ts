import { describe, expect, test } from "vitest";
import { mergeCorpus, publicRecords } from "../src/corpus.js";
import { foldRecorderInstalls, isRecorderInstall } from "../src/recorder-installs.js";
import { npcPage, npcRoles, worldFactsFromRecords } from "../src/world-pages.js";
import { observedEdges } from "../src/edges.js";

const hex = (c: string) => c.repeat(16);
const ps = (character: string, address: string) => `ps-${hex(character)}-${hex(address)}`;
/** A Recorder row: an interaction position with no level or reaction, as the converter makes them. */
const seen = (installId: string, eventId = "ps:1760000000:2:npc_sighting", x = 48) => ({
  kind: "npc_sighting", installId, eventId, capturedAt: "2025-10-09T08:53:30.000Z",
  npcId: 197, name: "Marshal McBride", mapId: 1429, x, y: 42.9, positionKind: "interaction", role: "questgiver",
});
const pinsOf = (rows: unknown[]) => {
  const records = publicRecords(mergeCorpus(undefined, rows));
  return { records, page: npcPage(197, worldFactsFromRecords(records)) };
};

describe("Polestar Recorder installs", () => {
  test("three characters from three addresses make a pin of Recorder interaction positions", () => {
    const { page, records } = pinsOf([seen(ps("1", "a"), undefined, 48), seen(ps("2", "b"), undefined, 48.2), seen(ps("3", "c"), undefined, 47.9)]);
    expect(page.name).toBe("Marshal McBride");
    expect(page.pins).toEqual([{ mapId: 1429, x: 48, y: 42.9, reporters: 3 }]);
    expect(npcRoles(worldFactsFromRecords(records).npcs)).toEqual(["questgiver"]);
  });

  test("three characters on one address are one voter, and so is one character on three addresses", () => {
    expect(pinsOf([seen(ps("1", "a")), seen(ps("2", "a")), seen(ps("3", "a"))]).page.pins).toEqual([]);
    expect(pinsOf([seen(ps("1", "a")), seen(ps("1", "b")), seen(ps("1", "c"))]).page.pins).toEqual([]);
    // Linked through a chain (1a, 1b, 2b): still one person as far as anyone can tell.
    expect(pinsOf([seen(ps("1", "a")), seen(ps("1", "b")), seen(ps("2", "b")), seen(ps("3", "c"))]).page.pins).toEqual([]);
    expect(pinsOf([seen(ps("1", "a")), seen(ps("1", "b")), seen(ps("2", "b")), seen(ps("3", "c")), seen(ps("4", "d"))]).page.pins[0]?.reporters).toBe(3);
  });

  test("Recorder voters count alongside addon installs", () => {
    const addon = (installId: string) => ({ ...seen(installId, "epoch:1"), level: 5, reaction: "friendly" });
    expect(pinsOf([addon("abcd-0001"), addon("abcd-0002"), seen(ps("1", "a"))]).page.pins[0]?.reporters).toBe(3);
    expect(pinsOf([addon("abcd-0001"), seen(ps("1", "a")), seen(ps("2", "a"))]).page.pins).toEqual([]);
  });

  test("the same event sent again from another address counts once", () => {
    const folded = foldRecorderInstalls([seen(ps("1", "a")), seen(ps("1", "b")), seen(ps("1", "b"), "ps:1760000000:9:npc_sighting")]);
    expect(folded).toHaveLength(2);
    expect(new Set(folded.map((r) => r.installId))).toEqual(new Set([ps("1", "a")]));
  });

  test("addon rows pass through untouched; a ps- id the server did not shape is dropped", () => {
    const rows = [{ installId: "abcd-0001", eventId: "e:1" }, { installId: "ps-not-a-voter", eventId: "e:2" }];
    expect(foldRecorderInstalls(rows)).toEqual([rows[0]]);
    expect(isRecorderInstall("abcd-0001")).toBe(false);
    expect(isRecorderInstall(ps("1", "a"))).toBe(true);
  });

  test("player positions from a Recorder file never make a pin or an edge", () => {
    const rows = [ps("1", "a"), ps("2", "b"), ps("3", "c")].map((id) => ({ ...seen(id), positionKind: "player", role: undefined }));
    const { page, records } = pinsOf(rows);
    expect(page.pins).toEqual([]);
    expect(observedEdges(records, "2026-10-22T00:00:00Z").filter((e) => e.toKind === "zone")).toEqual([]);
  });
});
