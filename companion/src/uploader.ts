import { readFileSync } from "node:fs";
import type { RecordKind } from "@everloot/protocol";
import { parseEverlootLua } from "../../web/src/lib/sv-parse";
import { prepareUpload, sendBatches } from "../../web/src/lib/upload-batches";
import type { SentState } from "./sent-state";

export interface UploadOptions {
  /** Site origin, e.g. https://everloot.app. */
  endpoint: string;
  fetch?: typeof fetch;
  state: SentState;
  /** The player allowed census counts in the Desktop App; without it the census waits for the upload page. */
  census?: boolean;
  /** The player allowed the player pages in the Desktop App; without it they wait for the upload page. */
  players?: boolean;
}

/** Installed addon lists go only from the upload page, after its preview; the companion never sends them. */
const ADDON_LIST: RecordKind = "addon_seen";
/**
 * The census goes from the upload page, which shows its counts first, or from the Desktop App when the
 * player allowed it on the app's setup screen or in its settings. The kinds are plain strings because
 * the census intake change adds them to @everloot/protocol.
 */
const CENSUS = new Set<string>(["census_self", "census_seen"]);

/** Named player rows go only from the upload page too, which says what they are first. */
const PLAYERS: RecordKind = "player_seen";

export interface UploadResult { sent: number; batches: number; heldNamed: number; heldLegacy: number; heldAddons: number; heldCensus: number; heldPlayers: number; invalid: number }

/**
 * Send one SavedVariables file's unsent events, the same way the upload page does: named categories
 * stay on this machine (no sharing choices, no grants), and progress advances only on a confirmed receipt.
 * The installed addon list and player rows stay here too: they are sent only from the upload page, after its preview.
 * The census stays here too unless `census` is set.
 */
export async function uploadFile(file: string, options: UploadOptions): Promise<UploadResult> {
  const parsed = parseEverlootLua(readFileSync(file, "utf8"));
  const unsent = parsed.records.filter((r) => typeof r.eventId !== "string" || !options.state.has(parsed.installId, r.eventId));
  const held = (r: Record<string, unknown>) => !options.census && CENSUS.has(String(r.kind));
  const heldCensus = unsent.filter(held).length;
  const heldPlayer = (r: Record<string, unknown>) => !options.players && r.kind === PLAYERS;
  const heldPlayers = unsent.filter(heldPlayer).length;
  const records = unsent.filter((r) => r.kind !== ADDON_LIST && !heldPlayer(r) && !held(r));
  const session = prepareUpload({ addonVersion: parsed.version, clientBuild: parsed.clientBuild, records }, {}, []);
  const result = { sent: 0, batches: session.batches.length, heldNamed: session.held.named, heldLegacy: session.held.legacy,
    heldAddons: unsent.length - records.length - heldCensus - heldPlayers, heldCensus, heldPlayers, invalid: session.held.invalid };
  if (session.batches.length === 0) return result;
  await sendBatches(session, options.fetch ?? fetch, () => {
    const confirmed = JSON.parse(session.batches[session.next - 1]).records as { eventId: string }[];
    options.state.add(parsed.installId, confirmed.map((r) => r.eventId));
    result.sent += confirmed.length;
  }, new URL("/api/intake", options.endpoint).href);
  return result;
}
