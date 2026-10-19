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
}

/** Installed addon lists go only from the upload page, after its preview; the companion never sends them. */
const ADDON_LIST: RecordKind = "addon_seen";
/**
 * The census goes only from the upload page too, which shows its counts first. The kinds are plain
 * strings because the census intake change adds them to @everloot/protocol.
 */
const CENSUS = new Set<string>(["census_self", "census_seen"]);

export interface UploadResult { sent: number; batches: number; heldNamed: number; heldLegacy: number; heldAddons: number; heldCensus: number; invalid: number }

/**
 * Send one SavedVariables file's unsent events, the same way the upload page does: named categories
 * stay on this machine (no sharing choices, no grants), and progress advances only on a confirmed receipt.
 * The installed addon list and the census stay here too: they are sent only from the upload page, after its preview.
 */
export async function uploadFile(file: string, options: UploadOptions): Promise<UploadResult> {
  const parsed = parseEverlootLua(readFileSync(file, "utf8"));
  const unsent = parsed.records.filter((r) => typeof r.eventId !== "string" || !options.state.has(parsed.installId, r.eventId));
  const heldCensus = unsent.filter((r) => CENSUS.has(String(r.kind))).length;
  const records = unsent.filter((r) => r.kind !== ADDON_LIST && !CENSUS.has(String(r.kind)));
  const session = prepareUpload({ addonVersion: parsed.version, clientBuild: parsed.clientBuild, records }, {}, []);
  const result = { sent: 0, batches: session.batches.length, heldNamed: session.held.named, heldLegacy: session.held.legacy,
    heldAddons: unsent.length - records.length - heldCensus, heldCensus, invalid: session.held.invalid };
  if (session.batches.length === 0) return result;
  await sendBatches(session, options.fetch ?? fetch, () => {
    const confirmed = JSON.parse(session.batches[session.next - 1]).records as { eventId: string }[];
    options.state.add(parsed.installId, confirmed.map((r) => r.eventId));
    result.sent += confirmed.length;
  }, new URL("/api/intake", options.endpoint).href);
  return result;
}
