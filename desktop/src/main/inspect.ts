import { existsSync, readFileSync, statSync } from "node:fs";
import { parseEverlootLua } from "../../../web/src/lib/sv-parse";
import { readAsks } from "../../../companion/src/bridge/asks";
import { readRealms } from "../../../companion/src/prices";
import type { FileSummary } from "../shared/types";

export function summarizeSavedVariables(text: string, confirmedFor: (installId: string) => number): Omit<FileSummary, "file" | "writtenAt" | "bytes"> {
  try {
    const parsed = parseEverlootLua(text);
    const counts = new Map<string, number>();
    for (const r of parsed.records) counts.set(String(r.kind), (counts.get(String(r.kind)) ?? 0) + 1);
    const kinds = [...counts].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
    let pendingAsks = 0;
    try { pendingAsks = readAsks(text).length; } catch { /* asks are optional */ }
    return {
      ok: true, error: null,
      addonVersion: parsed.version, clientBuild: parsed.clientBuild ?? null,
      kinds, records: parsed.records.length,
      confirmed: confirmedFor(parsed.installId),
      pendingAsks,
      scanRealms: readRealms(text),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), addonVersion: null, clientBuild: null, kinds: [], records: 0, confirmed: 0, pendingAsks: 0, scanRealms: [] };
  }
}

/** Confirmed event counts per install from the companion's sent.json; an unreadable file counts nothing. */
export function confirmedCounts(sentPath: string): (installId: string) => number {
  let sent: Record<string, string[]> = {};
  try { if (existsSync(sentPath)) sent = JSON.parse(readFileSync(sentPath, "utf8")) as Record<string, string[]>; } catch { sent = {}; }
  return (installId) => (Array.isArray(sent[installId]) ? sent[installId].length : 0);
}

export function summarizeFiles(files: string[], sentPath: string): FileSummary[] {
  const confirmedFor = confirmedCounts(sentPath);
  return files.map((file) => {
    let text = "", writtenAt: string | null = null, bytes = 0;
    try { const st = statSync(file); writtenAt = st.mtime.toISOString(); bytes = st.size; text = readFileSync(file, "utf8"); }
    catch (err) { return { file, writtenAt, bytes, ...summarizeSavedVariables("", confirmedFor), ok: false, error: err instanceof Error ? err.message : String(err) }; }
    return { file, writtenAt, bytes, ...summarizeSavedVariables(text, confirmedFor) };
  });
}
