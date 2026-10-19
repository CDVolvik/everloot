import { CENSUS_KINDS, storedCensusSchemas, UPLOAD_LIMITS, type StoredCensusRecord } from "@everloot/protocol";
import { canonicalJson } from "./corpus.js";

/**
 * Stored census rows, one per install and event, last write wins (docs/design/specs/2026-10-18-census-design.md).
 * The upload page sends a character's row for the day again with each upload, and the addon may raise its level
 * and capturedAt in between; intake gives every copy the same event id. So a repeat is never a conflict: the
 * later capturedAt wins, then the higher level, then the greater canonical JSON, so the result does not depend
 * on the order uploads are read in. Upload objects are append-only, so this is where the rule lives.
 */

function eventKey(row: StoredCensusRecord): string {
  return JSON.stringify([row.installId, row.eventId]);
}

/** Whether `next` replaces `kept`, a row with the same install and event. */
function replaces(next: StoredCensusRecord, kept: StoredCensusRecord): boolean {
  const time = Date.parse(next.capturedAt) - Date.parse(kept.capturedAt);
  if (time !== 0) return time > 0;
  if (next.level !== kept.level) return next.level > kept.level;
  return canonicalJson(next) > canonicalJson(kept);
}

/** Rows one install may keep per kind and UTC day, so one install cannot invent a crowd of character keys. */
export function censusDailyCap(kind: StoredCensusRecord["kind"]): number {
  return kind === "census_self" ? UPLOAD_LIMITS.censusSelfPerDay : UPLOAD_LIMITS.censusSeenPerDay;
}

/**
 * Fold raw upload rows into `previous`. Rows that are not stored census rows are skipped, never an error,
 * and a row still carrying a GUID is not one: the stored schemas have no GUID field and need a character key.
 * Past the daily cap for one install, kind and day, the rows with the lowest event ids are kept, so the result
 * is the same whatever order the uploads are read in, and folding in steps equals folding once.
 */
export function mergeCensusRows(previous: readonly StoredCensusRecord[], raw: readonly unknown[]): StoredCensusRecord[] {
  const rows = new Map(previous.map((row) => [eventKey(row), row]));
  for (const candidate of raw) {
    const kind = (candidate as { kind?: unknown } | null)?.kind;
    if (typeof kind !== "string" || !CENSUS_KINDS.includes(kind)) continue;
    const parsed = storedCensusSchemas[kind as keyof typeof storedCensusSchemas].safeParse(candidate);
    if (!parsed.success) continue;
    const key = eventKey(parsed.data);
    const kept = rows.get(key);
    if (!kept || replaces(parsed.data, kept)) rows.set(key, parsed.data);
  }
  const perDay = new Map<string, number>();
  return [...rows].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row).filter((row) => {
    const group = JSON.stringify([row.installId, row.kind, row.eventId.split(":")[1]]);
    const count = (perDay.get(group) ?? 0) + 1;
    perDay.set(group, count);
    return count <= censusDailyCap(row.kind);
  });
}
