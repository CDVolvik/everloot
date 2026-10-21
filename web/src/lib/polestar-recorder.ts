import { CLIENT_BUILD, type UploadSource } from "@everloot/protocol";

/**
 * Polestar Recorder files, converted in the browser into Everloot's own record kinds.
 *
 * The Polestar Recorder addon (by fitzforge, part of https://github.com/fitzforge/polestar, GPL-3.0) writes
 * `WTF/Account/<account>/SavedVariables/Polestar_Recorder.lua` once a player turns it on. Everloot reads that file's
 * format (schema 1) with its own parser (`parsePolestarTable` in sv-parse.ts) and copies none of the addon's code.
 * Each session (one login) is converted on its own and sent as its own upload, under one install id per character.
 * Every position in the file is where the player stood. What is kept:
 * - An NPC's window (a quest given or turned in, a gossip window offering quests, a vendor, a trainer, a flight
 *   master): `npc_sighting` with positionKind `interaction`, the player a few yards from the NPC.
 * - A rare the player saw on its nameplate, target or mouseover, and an NPC the player killed: `npc_sighting` with
 *   positionKind `player`, which is never a pin.
 * - A quest accepted, joined to its turn-in in the same session: `quest`.
 * - A loot window with items: `loot`. The file does not say whether the loot API named the source, so there is no
 *   `sourceEvidence`, and public drop rates leave these windows out.
 * Every other event kind is counted as skipped, among them `step` (Polestar's own guide text), `progress` (quest
 * objective text), `kill` (`slain` records the same deaths with the unit's own name), `pos`, `enter` and `treasure`.
 * A rare seen through a minimap vignette is skipped too: its position is the vignette's, not the player's, and no
 * kind here says so yet. The file records neither an NPC's level at its window nor any NPC's reaction, so those are
 * left out, never guessed. Character names and realms, session keys, notes and the rest of the file never leave
 * this module: a character becomes a hash, which the server hashes again under its own key.
 */

export const RECORDER_SOURCE: UploadSource = "polestar_recorder";
/** The record kinds a Recorder upload may carry. Intake refuses any other in one. */
export const RECORDER_KINDS: readonly string[] = ["npc_sighting", "quest", "loot"];
/** The install id the browser sends: a hash of the character, never its name. The server replaces it. */
export const RECORDER_CHARACTER = /^polestar-[0-9a-f]{40}$/;
/** The `addonVersion` of a converted file's envelope. */
export const RECORDER_ADDON_VERSION = "polestar-recorder";
/** The file schema this converter reads. */
export const RECORDER_SCHEMA = 1;

/** The one character id every row of a Recorder upload shares, or null. */
export function recorderCharacter(records: readonly { installId: string }[]): string | null {
  const ids = new Set(records.map((r) => r.installId));
  const [id] = ids;
  return ids.size === 1 && RECORDER_CHARACTER.test(id) ? id : null;
}

/** The session a converted row came from, read from its event id (`ps:<session start>:<event>:<kind>`), or null. */
export function recorderSession(eventId: unknown): string | null {
  return typeof eventId === "string" && /^ps:\d+:/.test(eventId) ? eventId.split(":")[1] : null;
}

type Row = Record<string, unknown>;

/**
 * The file as an upload payload for `prepareUpload`: every session's rows, one session after another, so that each
 * batch holds one session of one character. `recorder` is what the preview says about the file.
 */
export interface RecorderPayload {
  addonVersion: string;
  clientBuild?: string;
  source: UploadSource;
  records: Row[];
  recorder: {
    /** Characters and sessions with at least one converted row. */
    characters: number;
    sessions: number;
    /** Sessions left out because they use another schema or have no start time. */
    unread: number;
    /** Events of kinds Everloot does not convert, by kind. */
    skipped: Record<string, number>;
    /** Events the Recorder itself discarded at its caps, by kind: those sessions are missing facts of that kind. */
    capped: Record<string, number>;
  };
}

export class RecorderFileError extends Error {}

const obj = (v: unknown): Row | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null);
// The Lua reader turns a table keyed 1..n into an array and an empty table into []: either shape is read here.
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : obj(v) ? Object.values(v as Row) : []);
const id = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 2_000_000_000 ? v : null);
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && v.length <= max ? v : null);

/** The player's position, 0 to 100 as the file and the protocol both have it. */
function position(ev: Row): { mapId: number; x: number; y: number } | null {
  const { map, x, y } = ev;
  if (typeof map !== "number" || !Number.isInteger(map) || map < 0) return null;
  if (typeof x !== "number" || typeof y !== "number" || !(x >= 0 && x <= 100 && y >= 0 && y <= 100)) return null;
  return { mapId: map, x, y };
}

/** `UnitClassification` as Everloot's rank; the minor ranks have none. */
const RANKS: Record<string, string> = { normal: "normal", elite: "elite", rare: "rare", rareelite: "rare_elite", worldboss: "boss" };
/** The window each event kind stands for, and the role Everloot gives it (a gossip window names no service). */
const WINDOWS: Record<string, string | undefined> = { accept: "questgiver", turnin: "questgiver", gossip: undefined, vendor: "vendor", trainer: "trainer", fp: "flightmaster" };
/** Rares seen on the unit itself, from where the player stood. */
const RARE_SOURCES = new Set(["nameplate", "target", "mouseover"]);
/** A skinning window has no Everloot kind: as an NPC's it is not the NPC's drop, and it is skipped. */
const GATHER: Record<string, string> = { herb: "herb", mine: "ore" };
const READ = new Set([...Object.keys(WINDOWS), "rare", "slain", "drop"]);

async function characterId(name: string, realm: string): Promise<string> {
  const bytes = new TextEncoder().encode(`everloot-polestar:${name}-${realm}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `polestar-${[...digest].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40)}`;
}

/** One session's events as Everloot rows, without the install id. */
function convertSession(started: number, faction: unknown, events: Row[], skipped: Record<string, number>): Row[] {
  const sightings = new Map<string, Row>();
  const quests = new Map<number, { accept?: Row; turnin?: Row; eventId?: string; capturedAt?: string }>();
  const loot: Row[] = [];
  events.forEach((ev, index) => {
    const kind = typeof ev.e === "string" ? ev.e : "unknown";
    if (!READ.has(kind) || (kind === "rare" && !RARE_SOURCES.has(String(ev.src)))) {
      const label = kind === "rare" ? "rare (vignette)" : kind;
      skipped[label] = (skipped[label] ?? 0) + 1;
      return;
    }
    const t = typeof ev.t === "number" && Number.isFinite(ev.t) && ev.t >= 0 ? ev.t : null;
    if (t === null) return;
    const capturedAt = new Date(Math.round((started + t) * 1000)).toISOString();
    // The session's start, the event's place in it and the kind made: the same file sent again makes the same ids,
    // and the session key, which holds the character's name, is never part of one.
    const eventId = (made: string) => `ps:${started}:${index + 1}:${made}`;
    const sighting = (positionKind: "interaction" | "player", role?: string, extra: Row = {}) => {
      const npcId = id(ev.npc), name = text(ev.npcName, 120), at = position(ev);
      if (!npcId || !name || !at) return;
      // One row per NPC, kind of position, role and map, as the Everloot addon keeps them.
      const key = `${npcId}|${positionKind}|${role ?? ""}|${at.mapId}`;
      if (sightings.has(key)) return;
      sightings.set(key, { kind: "npc_sighting", eventId: eventId("npc_sighting"), capturedAt, npcId, name, ...at, positionKind, ...(role ? { role } : {}), ...extra });
    };
    if (kind in WINDOWS) {
      sighting("interaction", WINDOWS[kind]);
      const q = id(ev.q);
      if (q && (kind === "accept" || kind === "turnin")) {
        const quest = quests.get(q) ?? {};
        if (kind === "accept" && !quest.accept) Object.assign(quest, { accept: ev, eventId: eventId("quest"), capturedAt });
        if (kind === "turnin" && !quest.turnin) quest.turnin = ev;
        quests.set(q, quest);
      }
    } else if (kind === "slain" || kind === "rare") {
      const level = typeof ev.npcLvl === "number" && Number.isInteger(ev.npcLvl) && ev.npcLvl >= 1 && ev.npcLvl <= 100 ? ev.npcLvl : undefined;
      const rank = typeof ev.cls === "string" ? RANKS[ev.cls] : undefined;
      sighting("player", undefined, { ...(level ? { level } : {}), ...(rank ? { rank } : {}) });
    } else if (kind === "drop") {
      const row = lootRow(ev);
      if (row) loot.push({ kind: "loot", eventId: eventId("loot"), capturedAt, ...row });
    }
  });
  const questRows: Row[] = [];
  for (const [questId, { accept, turnin, eventId, capturedAt }] of quests) {
    // A title and a level come only with the accept: a turn-in alone makes no quest row.
    const title = accept && text(accept.title, 200);
    const level = accept && typeof accept.qlvl === "number" && Number.isInteger(accept.qlvl) && accept.qlvl >= 1 && accept.qlvl <= 100 ? accept.qlvl : null;
    if (!accept || !title || !level) continue;
    const giverNpcId = accept.object === undefined ? id(accept.npc) : null;
    const turnInNpcId = turnin && turnin.object === undefined ? id(turnin.npc) : null;
    const rewards = [...new Set([accept.items, accept.choices, turnin?.items, turnin?.choices].flatMap(list).map(id).filter((n): n is number => n !== null))].slice(0, 20);
    questRows.push({
      kind: "quest", eventId, capturedAt, questId, title, level, rewardItemIds: rewards,
      ...(giverNpcId ? { giverNpcId } : {}), ...(turnInNpcId ? { turnInNpcId } : {}),
      // The accepting character's faction, which is what the quest record's `faction` means.
      ...(faction === "Alliance" || faction === "Horde" ? { faction: faction.toLowerCase() } : {}),
    });
  }
  return [...sightings.values(), ...questRows, ...loot];
}

/** A loot window with items, as Everloot's loot row, or null. */
function lootRow(ev: Row): Row | null {
  const npc = id(ev.npc), object = id(ev.object);
  if (!npc && !object) return null;
  if (npc && ev.gather !== undefined) return null;
  const gatherKind = typeof ev.gather === "string" ? GATHER[ev.gather] : undefined;
  if (ev.gather !== undefined && !gatherKind) return null;
  const counts = new Map<number, number>();
  for (const raw of list(ev.items)) {
    const item = obj(raw);
    const itemId = item && id(item.item);
    const n = item && typeof item.n === "number" && Number.isInteger(item.n) ? item.n : null;
    if (!itemId || !n || n < 1) return null;
    counts.set(itemId, (counts.get(itemId) ?? 0) + n);
  }
  // A window with no item is not the same measurement as the addon's, which keeps only item slots.
  if (counts.size === 0 || counts.size > 50 || [...counts.values()].some((n) => n > 1000)) return null;
  const items = [...counts].map(([itemId, count]) => ({ itemId, count }));
  if (npc) return { sourceNpcId: npc, items };
  // The loot record's position is the player's on the map where the object was opened, which is what the file has.
  const at = position(ev);
  return { sourceObjectId: object, items, ...(at ?? {}), ...(gatherKind ? { gatherKind } : {}) };
}

/**
 * The whole file as one payload, session after session. A file the game left empty (it can, after a restart)
 * converts to nothing. A file of another schema is refused: its fields may mean something else. Throws
 * RecorderFileError.
 */
export async function convertRecorder(db: Record<string, unknown>): Promise<RecorderPayload> {
  const skipped: Record<string, number> = {};
  const capped: Record<string, number> = {};
  const records: Row[] = [];
  const recorder = { characters: 0, sessions: 0, unread: 0, skipped, capped };
  const empty = db.schema === undefined && list(db.sessions).length === 0;
  if (!empty && db.schema !== RECORDER_SCHEMA) {
    throw new RecorderFileError(`This Polestar Recorder file uses schema ${String(db.schema ?? "unknown")}; Everloot reads schema ${RECORDER_SCHEMA}. Keep the file; nothing was sent.`);
  }
  const sessions: { started: number; build: string | null; faction: unknown; character: string; events: Row[]; dropped: Row | null }[] = [];
  for (const raw of list(db.sessions)) {
    const s = obj(raw);
    const char = obj(s?.char);
    const started = s && typeof s.started === "number" && Number.isInteger(s.started) && s.started > 0 ? s.started : null;
    if (!s || s.schema !== RECORDER_SCHEMA || !started || !char) { recorder.unread++; continue; }
    sessions.push({
      started,
      build: typeof s.build === "string" && CLIENT_BUILD.safeParse(s.build).success ? s.build : null,
      faction: char.faction,
      // Held only to tell characters apart and to make the hash below; never part of a row.
      character: JSON.stringify([typeof char.name === "string" ? char.name : "", typeof char.realm === "string" ? char.realm : ""]),
      events: list(s.events).map(obj).filter((e): e is Row => e !== null),
      dropped: obj(s.dropped),
    });
  }
  sessions.sort((a, b) => a.started - b.started);
  const characters = new Map<string, string>();
  let clientBuild: string | undefined;
  for (const s of sessions) {
    if (s.build) clientBuild = s.build;
    for (const [kind, n] of Object.entries(s.dropped ?? {})) if (typeof n === "number" && n > 0) capped[kind] = (capped[kind] ?? 0) + n;
    const rows = convertSession(s.started, s.faction, s.events, skipped);
    if (!rows.length) continue;
    let installId = characters.get(s.character);
    if (!installId) {
      const [name, realm] = JSON.parse(s.character) as [string, string];
      installId = await characterId(name, realm);
      characters.set(s.character, installId);
    }
    recorder.sessions++;
    for (const row of rows) records.push({ installId, ...row });
  }
  recorder.characters = characters.size;
  return { addonVersion: RECORDER_ADDON_VERSION, ...(clientBuild ? { clientBuild } : {}), source: RECORDER_SOURCE, records, recorder };
}
