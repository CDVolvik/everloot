import { parseRecords } from "./intake";
import { sharingCategory, type SharingCategory } from "../../../kb/src/publication";

export type SharingChoices = Partial<Record<SharingCategory, boolean>>;
export interface BatchReceipt { ok: boolean; persisted?: boolean; uploadId?: string; accepted?: { index: number; kind: string }[]; rejected?: { index: number; reason: string }[]; error?: string }
export interface UploadSession {
  batches: string[]; next: number; receipts: BatchReceipt[];
  counts: Record<string, number>; held: { legacy: number; named: number; invalid: number };
}
export function prepareUpload(payload: unknown, sharing: SharingChoices, grantTokens: string[], maxBytes = 600_000): UploadSession {
  const envelope = payload as { addonVersion?: unknown; records?: unknown };
  if (!envelope || typeof envelope.addonVersion !== "string" || envelope.addonVersion.length > 32 || !Array.isArray(envelope.records)) throw new Error("Choose an Everloot file with a version and records array.");
  if (envelope.records.length > 100_000) throw new Error("This file is too large. Keep the original and split it into files of at most 100,000 records.");
  if (grantTokens.length > 4 || grantTokens.some((token) => !/^[a-f0-9]{64}$/.test(token))) throw new Error("Verification grants must be 64 lowercase hexadecimal characters, one per line (at most four).");
  const parsed = parseRecords(envelope.records);
  const held = { legacy: 0, named: 0, invalid: parsed.receipt.rejected.length };
  const counts: Record<string, number> = {};
  const rows: string[] = [];
  for (const record of parsed.records) {
    if (!record.eventId) { held.legacy++; continue; }
    const category = sharingCategory(record);
    if (category && !sharing[category]) { held.named++; continue; }
    if (category && !grantTokens.length) throw new Error("A verified grant is required for the named categories you selected.");
    if ("claimToken" in record) delete record.claimToken;
    counts[record.kind] = (counts[record.kind] ?? 0) + 1;
    rows.push(JSON.stringify(record));
  }
  const prefix = JSON.stringify({ addonVersion: envelope.addonVersion, sharing, grantTokens }).slice(0, -1) + ',"records":[';
  const suffix = "]}";
  const bytes = (value: string) => new TextEncoder().encode(value).length;
  const overhead = bytes(prefix + suffix);
  const batches: string[] = [];
  let chunk: string[] = [], size = overhead;
  for (const row of rows) {
    const length = bytes(row);
    if (length + overhead > maxBytes) throw new Error("One record is too large to upload. Keep your file and contact Everloot.");
    if (chunk.length === 2000 || size + length + (chunk.length ? 1 : 0) > maxBytes) {
      batches.push(prefix + chunk.join(",") + suffix); chunk = []; size = overhead;
    }
    size += length + (chunk.length ? 1 : 0); chunk.push(row);
  }
  if (chunk.length) batches.push(prefix + chunk.join(",") + suffix);
  return { batches, next: 0, receipts: [], counts, held };
}
/** Advance only after a confirmed durable receipt; retries send the identical batch. */
export async function sendBatches(session: UploadSession, send: typeof fetch = fetch, onProgress: () => void = () => {}, url = "/api/intake") {
  while (session.next < session.batches.length) {
    const body = session.batches[session.next];
    const response = await send(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    const receipt = await response.json() as BatchReceipt;
    if (!response.ok || !receipt.ok || receipt.persisted !== true || !receipt.uploadId || !Array.isArray(receipt.accepted) ||
      receipt.accepted.length + (receipt.rejected?.length ?? 0) !== JSON.parse(body).records.length) {
      throw new Error(receipt.error ?? "Storage was not confirmed. Keep your file and retry.");
    }
    session.receipts.push(receipt); session.next++; onProgress();
  }
}
