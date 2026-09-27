import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { syncSources } from "./sources.js";

export type DB = Database.Database;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  licence TEXT NOT NULL,
  publishable INTEGER NOT NULL CHECK (publishable IN (0, 1)),
  homepage TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('item','npc','quest','zone','spell','lore_page','creator','realm')),
  ext_id TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  game_version TEXT NOT NULL CHECK (game_version IN ('forever','classic','retail','lore')),
  source_id TEXT NOT NULL REFERENCES sources(id),
  source_url TEXT NOT NULL,
  licence TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  UNIQUE (source_id, kind, ext_id)
);
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts
  USING fts5(name, body, content='entities', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts(rowid, name, body) VALUES (new.id, new.name, new.body);
END;
CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, name, body) VALUES ('delete', old.id, old.name, old.body);
END;
CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, name, body) VALUES ('delete', old.id, old.name, old.body);
  INSERT INTO entities_fts(rowid, name, body) VALUES (new.id, new.name, new.body);
END;
CREATE TABLE IF NOT EXISTS api_cache (
  key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

export function openDb(path: string): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  syncSources(db);
  return db;
}
