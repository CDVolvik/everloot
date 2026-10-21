import { parseRecords } from "@everloot/protocol";
import { describe, expect, test } from "vitest";
import { convertRecorder, recorderCharacter, RecorderFileError, RECORDER_CHARACTER } from "./polestar-recorder";
import { parsePolestarTable } from "./sv-parse";
import { prepareUpload } from "./upload-batches";

// Hand-written in the shape Polestar Recorder schema 1 writes: string-keyed sessions, 1..n event lists, an empty `{}`,
// an id-keyed `maps`, identity the converter must strip, kinds it must skip, and a session of another schema.
const FILE = `
PolestarRecorderDB = {
  ["schema"] = 1,
  ["enabled"] = true,
  ["current"] = "1760100000-Aelwyn",
  ["fp"] = { ["Aelwyn-Doomhowl"] = { ["Goldshire"] = true } },
  ["sessions"] = {
    ["1760000000-Aelwyn"] = {
      ["schema"] = 1, ["build"] = "1.60.1.70338", ["session"] = "1760000000-Aelwyn",
      ["char"] = { ["name"] = "Aelwyn", ["realm"] = "Doomhowl", ["race"] = "Human", ["class"] = "MAGE", ["faction"] = "Alliance" },
      ["started"] = 1760000000, ["ended"] = 1760003600,
      ["events"] = {
        { ["t"] = 1.5, ["e"] = "zone", ["map"] = 1429, ["zone"] = "Elwynn Forest" },
        { ["t"] = 10, ["e"] = "accept", ["q"] = 7, ["title"] = "Kobold Camp Cleanup", ["qlvl"] = 2, ["lvl"] = 1, ["npc"] = 197, ["npcName"] = "Marshal McBride", ["map"] = 1429, ["x"] = 48.17, ["y"] = 42.95, ["items"] = {}, ["choices"] = { 2224, 2225 } },
        { ["t"] = 12, ["e"] = "gossip", ["npc"] = 197, ["npcName"] = "Marshal McBride", ["available"] = {}, ["active"] = { 7 }, ["map"] = 1429, ["x"] = 48.2, ["y"] = 42.9 },
        { ["t"] = 20, ["e"] = "mark", ["text"] = "my secret note", ["map"] = 1429, ["x"] = 1, ["y"] = 1 },
        { ["t"] = 30, ["e"] = "slain", ["npc"] = 6, ["npcName"] = "Kobold Vermin", ["cls"] = "normal", ["npcLvl"] = 2, ["map"] = 1429, ["x"] = 47.1, ["y"] = 38.2, ["denied"] = true },
        { ["t"] = 31, ["e"] = "drop", ["npc"] = 6, ["npcName"] = "Kobold Vermin", ["items"] = { { ["item"] = 2589, ["n"] = 1 }, { ["item"] = 2589, ["n"] = 2, ["q"] = true } }, ["map"] = 1429, ["x"] = 47.1, ["y"] = 38.2 },
        { ["t"] = 40, ["e"] = "drop", ["object"] = 1618, ["gather"] = "herb", ["items"] = { { ["item"] = 2447, ["n"] = 2 } }, ["map"] = 1429, ["x"] = 50, ["y"] = 60 },
        { ["t"] = 41, ["e"] = "drop", ["npc"] = 113, ["gather"] = "skin", ["items"] = { { ["item"] = 2934, ["n"] = 1 } }, ["map"] = 1429, ["x"] = 1, ["y"] = 1 },
        { ["t"] = 42, ["e"] = "drop", ["npc"] = 6 },
        { ["t"] = 50, ["e"] = "rare", ["npc"] = 61, ["npcName"] = "Thuros Lightfingers", ["cls"] = "rareelite", ["npcLvl"] = 11, ["src"] = "vignette", ["map"] = 1429, ["x"] = 90, ["y"] = 80 },
        { ["t"] = 51, ["e"] = "rare", ["npc"] = 61, ["npcName"] = "Thuros Lightfingers", ["cls"] = "rareelite", ["npcLvl"] = 11, ["src"] = "target", ["map"] = 1429, ["x"] = 89, ["y"] = 79 },
        { ["t"] = 60, ["e"] = "turnin", ["q"] = 7, ["xpReward"] = 450, ["npc"] = 197, ["npcName"] = "Marshal McBride", ["map"] = 1429, ["x"] = 48.1, ["y"] = 42.9, ["choices"] = { 2224, 2225 } },
        { ["t"] = 70, ["e"] = "step", ["title"] = "Polestar step words", ["guideTitle"] = "Polestar guide words" },
        { ["t"] = 80, ["e"] = "vendor", ["npc"] = 78, ["npcName"] = "Janos Hammerknuckle", ["map"] = 1429, ["x"] = 41.7, ["y"] = 65.9 },
        { ["t"] = 81, ["e"] = "vendor", ["npc"] = 78, ["npcName"] = "Janos Hammerknuckle", ["map"] = 1429, ["x"] = 41.8, ["y"] = 65.9 },
        { ["t"] = 90, ["e"] = "teleport", ["weird"] = true },
        { ["t"] = 95, ["e"] = "progress", ["q"] = 7, ["oi"] = 1, ["text"] = "Kobold Vermin slain: 1/8", ["cur"] = 1, ["max"] = 8 },
        { ["t"] = 96, ["e"] = "kill", ["npc"] = 6, ["npcName"] = "Kobold Vermin", ["map"] = 1429, ["x"] = 47, ["y"] = 38 },
      },
      ["maps"] = { [1429] = { ["name"] = "Elwynn Forest", ["type"] = 3, ["parent"] = 1415 } },
      ["counts"] = {}, ["dropped"] = { ["pos"] = 12 },
      ["legacy"] = { ["Aelwyn"] = "old" },
    },
    ["1760090000-Borric"] = {
      ["schema"] = 1, ["build"] = "1.60.1.70400", ["session"] = "1760090000-Borric",
      ["char"] = { ["name"] = "Borric", ["realm"] = "Doomhowl", ["faction"] = "Horde" },
      ["started"] = 1760090000, ["ended"] = 1760090100,
      ["events"] = {
        { ["t"] = 5, ["e"] = "fp", ["location"] = "Orgrimmar", ["npc"] = 3310, ["npcName"] = "Doras", ["map"] = 1454, ["x"] = 45.1, ["y"] = 63.9 },
        { ["t"] = 6, ["e"] = "trainer", ["npc"] = 3324, ["npcName"] = "Grol'dar", ["map"] = 1454, ["x"] = 48.4, ["y"] = 45.6 },
        { ["t"] = 7, ["e"] = "accept", ["q"] = 8, ["title"] = "A Poster's Call", ["qlvl"] = 5, ["object"] = 123, ["objName"] = "Wanted Poster", ["map"] = 1454, ["x"] = 50, ["y"] = 50 },
      },
      ["dropped"] = {},
    },
    ["1760100000-Aelwyn"] = {
      ["schema"] = 1, ["build"] = "1.60.1.70450", ["session"] = "1760100000-Aelwyn",
      ["char"] = { ["name"] = "Aelwyn", ["realm"] = "Doomhowl", ["faction"] = "Alliance" },
      ["started"] = 1760100000, ["ended"] = 1760100100,
      ["events"] = {
        [1] = { ["t"] = 3, ["e"] = "vendor", ["npc"] = 78, ["npcName"] = "Janos Hammerknuckle", ["map"] = 1429, ["x"] = 41.7, ["y"] = 65.8 },
      },
    },
    ["1760200000-Cyra"] = {
      ["schema"] = 2, ["char"] = { ["name"] = "Cyra", ["realm"] = "Doomhowl" }, ["started"] = 1760200000,
      ["events"] = { { ["t"] = 1, ["e"] = "vendor", ["npc"] = 5, ["npcName"] = "Cyra's Vendor", ["map"] = 1, ["x"] = 1, ["y"] = 1 } },
    },
  },
}
`;

const convert = () => convertRecorder(parsePolestarTable(FILE));
const rowsOf = async () => (await convert()).records as Array<Record<string, unknown>>;

describe("convertRecorder", () => {
  test("every row it makes passes the protocol, with positions on the file's own 0 to 100 scale", async () => {
    const records = await rowsOf();
    const parsed = parseRecords(records);
    expect(parsed.receipt.rejected).toEqual([]);
    expect(parsed.records).toHaveLength(records.length);
    expect(records.find((r) => r.kind === "npc_sighting" && r.role === "questgiver")).toMatchObject({ mapId: 1429, x: 48.17, y: 42.95 });
  });

  test("an NPC's window is an interaction position with its role; a gossip window has none", async () => {
    const sightings = (await rowsOf()).filter((r) => r.kind === "npc_sighting" && r.positionKind === "interaction");
    const by = (npcId: number) => sightings.filter((r) => r.npcId === npcId).map((r) => r.role ?? null);
    expect(by(197).sort()).toEqual([null, "questgiver"].sort()); // accept and turn-in give one questgiver row, gossip one without a role
    expect(by(78)).toEqual(["vendor", "vendor"]); // once per session
    expect(by(3310)).toEqual(["flightmaster"]);
    expect(by(3324)).toEqual(["trainer"]);
    // Level and reaction are not in the file at a window: never guessed.
    expect(sightings.every((r) => !("level" in r) && !("reaction" in r))).toBe(true);
  });

  test("kills and rares seen on the unit are the player's position; a vignette rare is skipped", async () => {
    const player = (await rowsOf()).filter((r) => r.kind === "npc_sighting" && r.positionKind === "player");
    expect(player.map((r) => [r.npcId, r.level, r.rank])).toEqual([[6, 2, "normal"], [61, 11, "rare_elite"]]);
    expect(player.find((r) => r.npcId === 61)).toMatchObject({ x: 89, y: 79 });
    expect((await rowsOf()).some((r) => r.positionKind === "npc")).toBe(false);
  });

  test("a quest joins its accept and turn-in within the session", async () => {
    const quests = (await rowsOf()).filter((r) => r.kind === "quest");
    expect(quests).toEqual([
      expect.objectContaining({ questId: 7, title: "Kobold Camp Cleanup", level: 2, giverNpcId: 197, turnInNpcId: 197, rewardItemIds: [2224, 2225], faction: "alliance", capturedAt: "2025-10-09T08:53:30.000Z" }),
      expect.objectContaining({ questId: 8, title: "A Poster's Call", level: 5, faction: "horde" }),
    ]);
    // An object gave quest 8: it has no giver NPC.
    expect(quests[1]).not.toHaveProperty("giverNpcId");
  });

  test("loot windows with items become loot rows; skinning and empty windows do not, and nothing claims loot-api", async () => {
    const loot = (await rowsOf()).filter((r) => r.kind === "loot");
    expect(loot).toEqual([
      expect.objectContaining({ sourceNpcId: 6, items: [{ itemId: 2589, count: 3 }] }),
      expect.objectContaining({ sourceObjectId: 1618, items: [{ itemId: 2447, count: 2 }], gatherKind: "herb", mapId: 1429, x: 50, y: 60 }),
    ]);
    expect(loot[0]).not.toHaveProperty("mapId");
    expect(loot.some((r) => "sourceEvidence" in r)).toBe(false);
  });

  test("no name, realm, session key, note or guide text reaches any row", async () => {
    const payload = await convert();
    const sent = JSON.stringify(payload.records);
    for (const secret of ["Aelwyn", "Borric", "Cyra", "Doomhowl", "1760000000-", "my secret note", "Polestar step words", "Polestar guide words", "slain: 1/8", "Goldshire", "Human", "MAGE"]) {
      expect(sent).not.toContain(secret);
    }
    expect(JSON.stringify({ ...payload, recorder: undefined })).not.toContain("Aelwyn");
  });

  test("one install id per character, a hash; session after session, each its own batch", async () => {
    const payload = await convert();
    const ids = [...new Set(payload.records.map((r) => r.installId as string))];
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => RECORDER_CHARACTER.test(id))).toBe(true);
    const session = prepareUpload(payload, {}, []);
    const batches = session.batches.map((b) => JSON.parse(b));
    expect(batches).toHaveLength(3);
    expect(batches.every((b) => b.source === "polestar_recorder" && recorderCharacter(b.records) !== null)).toBe(true);
    expect(batches.map((b) => new Set(b.records.map((r: { eventId: string }) => r.eventId.split(":")[1])).size)).toEqual([1, 1, 1]);
    expect(batches[0].records[0].installId).toBe(batches[2].records[0].installId);
    expect(batches[1].records[0].installId).not.toBe(batches[0].records[0].installId);
  });

  test("the same file converts to the same event ids, so sending it again changes nothing", async () => {
    const [a, b] = [await rowsOf(), await rowsOf()];
    expect(a.map((r) => r.eventId)).toEqual(b.map((r) => r.eventId));
    expect(new Set(a.map((r) => `${r.installId}|${r.eventId}`)).size).toBe(a.length);
    expect(a[0].eventId).toMatch(/^ps:1760000000:\d+:npc_sighting$/);
  });

  test("the preview counts skipped kinds, sessions of another schema and the Recorder's own caps", async () => {
    const { recorder } = await convert();
    expect(recorder).toMatchObject({ characters: 2, sessions: 3, unread: 1, capped: { pos: 12 } });
    expect(recorder.skipped).toEqual({ zone: 1, mark: 1, step: 1, teleport: 1, progress: 1, kill: 1, "rare (vignette)": 1 });
  });

  test("a file of another schema is refused; an empty or nil file converts to nothing", async () => {
    await expect(convertRecorder(parsePolestarTable(`PolestarRecorderDB = { ["schema"] = 2, ["sessions"] = {} }`))).rejects.toBeInstanceOf(RecorderFileError);
    for (const empty of ["PolestarRecorderDB = nil", "PolestarRecorderDB = {}", `PolestarRecorderDB = { ["schema"] = 1, ["sessions"] = {} }`]) {
      const payload = await convertRecorder(parsePolestarTable(empty));
      expect(payload.records).toEqual([]);
      expect(payload.recorder.sessions).toBe(0);
    }
  });
});
