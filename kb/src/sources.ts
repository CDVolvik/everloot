import type { DB } from "./db.js";

export type SourceId = "warcraft-wiki-2023" | "wago-tools" | "curated" | "blizzard-api";

export interface Source {
  id: SourceId;
  name: string;
  licence: string;
  /** Publishable rows go into the public snapshot. Everything else stays on the user's machine. */
  publishable: boolean;
  homepage: string;
}

export const SOURCES: Record<SourceId, Source> = {
  "warcraft-wiki-2023": {
    id: "warcraft-wiki-2023",
    name: "Warcraft Wiki (Internet Archive dump, 2023-11-13)",
    licence: "CC-BY-SA-4.0",
    publishable: true,
    homepage: "https://warcraft.wiki.gg",
  },
  "wago-tools": {
    id: "wago-tools",
    name: "wago.tools DB2 export (rebuilt locally)",
    licence: "blizzard-game-data",
    publishable: false,
    homepage: "https://wago.tools",
  },
  curated: {
    id: "curated",
    name: "WoWVault curated entries",
    licence: "CC-BY-SA-4.0",
    publishable: true,
    homepage: "https://github.com/CDVolvik/wowvault",
  },
  "blizzard-api": {
    id: "blizzard-api",
    name: "Blizzard Battle.net API (local cache only)",
    licence: "blizzard-developer-api-terms",
    publishable: false,
    homepage: "https://develop.battle.net",
  },
};

export function syncSources(db: DB): void {
  const stmt = db.prepare(
    `INSERT INTO sources (id, name, licence, publishable, homepage)
     VALUES (@id, @name, @licence, @publishable, @homepage)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, licence = excluded.licence,
       publishable = excluded.publishable, homepage = excluded.homepage`,
  );
  for (const s of Object.values(SOURCES)) stmt.run({ ...s, publishable: s.publishable ? 1 : 0 });
}
