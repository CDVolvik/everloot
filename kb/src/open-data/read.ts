import { readFileSync } from "node:fs";
import { parseRecords } from "@everloot/protocol";

/**
 * Records saved from the public corpus, for `open-data --records <file>`: the corpus API's answer as JSON
 * (`{ records, dataAsOf }`, several pages may be merged into one `records` array), a bare JSON array, or NDJSON
 * with one record per line. Every record must pass the protocol's schema, so a half-saved or hand-edited file is
 * refused whole instead of read as a smaller corpus.
 */
export function readRecordsFile(path: string): { records: unknown[]; dataAsOf: string | null } {
  const text = readFileSync(path, "utf8");
  let raw: unknown;
  let dataAsOf: string | null = null;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = text.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown);
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const answer = raw as { records?: unknown; dataAsOf?: unknown };
    if (!Array.isArray(answer.records)) throw new Error(`${path} is neither a list of records nor a corpus answer with a records list`);
    if (typeof answer.dataAsOf === "string" && Number.isFinite(Date.parse(answer.dataAsOf))) dataAsOf = new Date(answer.dataAsOf).toISOString();
    raw = answer.records;
  }
  if (!Array.isArray(raw)) throw new Error(`${path} is neither a list of records nor a corpus answer with a records list`);
  const parsed = parseRecords(raw);
  if (parsed.receipt.rejected.length) throw new Error(`${path}: ${parsed.receipt.rejected.length} records are not valid public records; nothing exported`);
  return { records: parsed.records, dataAsOf };
}
