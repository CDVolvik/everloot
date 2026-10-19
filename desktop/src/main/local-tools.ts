import type { CharactersInfo, ScanAge } from "../shared/types";

/**
 * Tools the chat model can call that read the player's own save files on this computer, beside
 * the MCP server's tools over Everloot's public data. They return text only, nothing leaves the
 * machine through them, and each result ends with a Source line so the page lists it like any
 * other. The reads go through the same functions the Characters and Market pages use.
 */

export interface LocalTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(input: Record<string, unknown>): string;
}

export interface LocalData {
  characters(): CharactersInfo;
  /** Every realm's last full scan, newest first; at is null when a realm was never scanned. */
  scans(): ScanAge[];
  /** The realms the player follows for the prices file. */
  followed(): string[];
}

export const LOCAL_SOURCE = "this computer (your Everloot.lua, not uploaded)";

const NO_ARGS = { type: "object", properties: {}, additionalProperties: false };

export const gold = (copper: number | null): string => {
  if (copper === null) return "unknown";
  const g = Math.floor(copper / 10000), s = Math.floor((copper % 10000) / 100), c = copper % 100;
  return g ? `${g.toLocaleString("en-US")}g ${s}s` : s ? `${s}s ${c}c` : `${c}c`;
};

const age = (iso: string | null, now: number): string => {
  if (!iso) return "never";
  const h = Math.max(0, Math.round((now - Date.parse(iso)) / 3_600_000));
  if (h < 1) return "under an hour ago";
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
};

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

export function localTools(data: LocalData, now: () => number = Date.now): LocalTool[] {
  return [
    {
      name: "my_characters",
      description: "The player's own characters from the save files on this computer: gold now and at its peak, gold earned and spent in the last seven days, item level and gear slots, level and class, achievements, exalted reputations and titles. Use for any question about the player's characters, gold or progress.",
      inputSchema: NO_ARGS,
      run: () => {
        const info = data.characters();
        if (!info.characters.length && !info.progress.length) return `No characters in the account files yet. The addon writes them after a login; the app reads Everloot.lua from the game folder.\nSource: ${LOCAL_SOURCE}`;
        const lines = info.characters.map((c) => {
          const net = c.week.earned - c.week.spent;
          const parts = [`${c.character}-${c.realm}: ${gold(c.gold)}`];
          if (c.peakGold !== null && c.peakGold !== c.gold) parts.push(`peak ${gold(c.peakGold)}`);
          parts.push(`last 7 days earned ${gold(c.week.earned)}, spent ${gold(c.week.spent)}, net ${net < 0 ? "-" : "+"}${gold(Math.abs(net))}`);
          if (c.itemLevel !== null) parts.push(`item level ${c.itemLevel} over ${c.gearSlots} slots`);
          if (sum(c.spent)) parts.push(`spent by category all time: ${Object.entries(c.spent).map(([k, v]) => `${k} ${gold(v)}`).join(", ")}`);
          return parts.join("; ");
        });
        for (const p of info.progress) {
          lines.push(`${p.key}: level ${p.level} ${p.class}, ${p.achievements} achievements (${p.achievementsInProgress} in progress), ${p.exalted} of ${p.reputations} reputations exalted, ${p.titles} titles`);
        }
        return `${lines.join("\n")}\nSource: ${LOCAL_SOURCE}`;
      },
    },
    {
      name: "my_realm_scans",
      description: "When the player last ran a full auction house scan on each realm, and which realms the prices file follows. Use for questions about scan freshness, which realms have the player's data, or whether to scan again.",
      inputSchema: NO_ARGS,
      run: () => {
        const t = now();
        const scans = data.scans();
        const followed = data.followed();
        const lines = scans.map((s) => `${s.realm}: last full scan ${s.at ? `${s.at} (${age(s.at, t)})` : "never"}`);
        if (!lines.length) lines.push("No auction scans in the account files yet. A scan is started in game with the addon's scan button.");
        lines.push(followed.length ? `Realms followed for the prices file: ${followed.join(", ")}` : "No realms followed for the prices file beyond the scanned ones.");
        return `${lines.join("\n")}\nSource: ${LOCAL_SOURCE}`;
      },
    },
  ];
}
