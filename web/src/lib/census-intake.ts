import { createHmac } from "node:crypto";
import { CENSUS_KINDS, storedCensusSchemas, type IntakeRecord, type StoredCensusRecord } from "@everloot/protocol";

/**
 * Census rows lose their GUID before anything is stored (docs/design/specs/2026-10-18-census-design.md §5).
 * The GUID becomes `characterKey`, an HMAC under EVERLOOT_CHARACTER_KEY, so nobody can turn a GUID seen in
 * game into our key, and one character seen by many installs is still counted once. The server id is read
 * from the GUID first, for the ruleset and region later. Nothing here logs.
 */

export type CensusRow = Extract<IntakeRecord, { kind: "census_self" | "census_seen" }>;

export function isCensusRow(row: IntakeRecord): row is CensusRow {
  return CENSUS_KINDS.includes(row.kind);
}

/** The server's character key, or null when it is unset or blank: then no census row is stored. */
export function characterSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.EVERLOOT_CHARACTER_KEY?.trim() || null;
}

/**
 * The row as it is stored: `characterKey` and `serverId` in place of the GUID, and the server's own event id,
 * `<kind>:<UTC day>:<first 24 hex of characterKey>`, in place of the client's. It is parsed through the stored
 * schema, which has no GUID field, so nothing else the client sent survives either. Null when the GUID's
 * server id is not a safe integer.
 */
export function storedCensusRow(row: CensusRow, secret: string): StoredCensusRecord | null {
  const serverId = Number(row.guid.split("-")[1]);
  if (!Number.isSafeInteger(serverId)) return null;
  const characterKey = createHmac("sha256", secret).update(row.guid).digest("hex");
  const day = new Date(row.capturedAt).toISOString().slice(0, 10);
  const { guid: _guid, eventId: _clientEventId, ...rest } = row;
  const stored = storedCensusSchemas[row.kind].safeParse({ ...rest, characterKey, serverId, eventId: `${row.kind}:${day}:${characterKey.slice(0, 24)}` });
  return stored.success ? stored.data : null;
}
