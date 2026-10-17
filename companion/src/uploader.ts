import { readFileSync } from "node:fs";
import { parseEverlootLua } from "../../web/src/lib/sv-parse";
import { prepareUpload, sendBatches } from "../../web/src/lib/upload-batches";
import type { SentState } from "./sent-state";

export interface UploadOptions {
  /** Site origin, e.g. https://everloot.app. */
  endpoint: string;
  fetch?: typeof fetch;
  state: SentState;
}

export interface UploadResult { sent: number; batches: number; heldNamed: number; heldLegacy: number; heldAddons: number; invalid: number }

/**
 * Send one SavedVariables file's unsent events, the same way the upload page does: named categories
 * stay on this machine (no sharing choices, no grants), and progress advances only on a confirmed receipt.
 * The installed addon list stays here too: it is sent only from the upload page, after its preview.
 */
export async function uploadFile(file: string, options: UploadOptions): Promise<UploadResult> {
  const parsed = parseEverlootLua(readFileSync(file, "utf8"));
  const unsent = parsed.records.filter((r) => typeof r.eventId !== "string" || !options.state.has(parsed.installId, r.eventId));
  const records = unsent.filter((r) => r.kind !== "addon_seen");
  const session = prepareUpload({ addonVersion: parsed.version, clientBuild: parsed.clientBuild, records }, {}, []);
  const result = { sent: 0, batches: session.batches.length, heldNamed: session.held.named, heldLegacy: session.held.legacy,
    heldAddons: unsent.length - records.length, invalid: session.held.invalid };
  if (session.batches.length === 0) return result;
  await sendBatches(session, options.fetch ?? fetch, () => {
    const confirmed = JSON.parse(session.batches[session.next - 1]).records as { eventId: string }[];
    options.state.add(parsed.installId, confirmed.map((r) => r.eventId));
    result.sent += confirmed.length;
  }, new URL("/api/intake", options.endpoint).href);
  return result;
}
