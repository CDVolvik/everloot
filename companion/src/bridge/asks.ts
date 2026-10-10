import { parseEverlootTable } from "../../../web/src/lib/sv-parse";

export interface Ask { id: string; question: string; askedAt: string }

const ID = /^[A-Za-z0-9:_-]{3,64}$/;
export const MAX_QUESTION = 500;

/** Questions the addon stored with /ask. Anything malformed or oversized is skipped, never guessed. */
export function readAsks(savedVariables: string): Ask[] {
  const asks = parseEverlootTable(savedVariables).asks;
  if (!Array.isArray(asks)) return [];
  return asks.flatMap((row) => {
    const r = row as Record<string, unknown>;
    if (typeof r?.id !== "string" || !ID.test(r.id)) return [];
    if (typeof r.question !== "string" || r.question.trim().length === 0 || r.question.length > MAX_QUESTION) return [];
    if (typeof r.askedAt !== "string") return [];
    return [{ id: r.id, question: r.question.trim(), askedAt: r.askedAt }];
  }).slice(-20);
}
