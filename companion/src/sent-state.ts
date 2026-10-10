import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Event ids the intake has confirmed, per install. Only a durable receipt adds an id, so a failed or
 * interrupted batch is sent again next time; the server deduplicates replays either way.
 */
export function createSentState(path: string) {
  const sent = new Map<string, Set<string>>();
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, string[]>;
    for (const [install, ids] of Object.entries(raw)) sent.set(install, new Set(ids));
  }
  return {
    has(install: string, eventId: string): boolean {
      return sent.get(install)?.has(eventId) ?? false;
    },
    add(install: string, eventIds: string[]): void {
      const ids = sent.get(install) ?? new Set<string>();
      for (const id of eventIds) ids.add(id);
      sent.set(install, ids);
      mkdirSync(dirname(path), { recursive: true });
      // Write then rename, so a crash never leaves a half-written state file.
      writeFileSync(`${path}.tmp`, JSON.stringify(Object.fromEntries([...sent].map(([k, v]) => [k, [...v]]))));
      renameSync(`${path}.tmp`, path);
    },
  };
}

export type SentState = ReturnType<typeof createSentState>;
