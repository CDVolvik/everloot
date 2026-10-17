# Part 1 — Knowledge Base + Ingestion Implementation Plan


**Goal:** A local SQLite knowledge base for WoW with provenance on every row, filled by importers
(2023 Warcraft Wiki dump, wago.tools Forever tables, curated YAML), a Blizzard API client with a
local cache, a provenance validator, and a snapshot command that exports only publishable data.

**Architecture:** One standalone TypeScript package at `kb/` in the wowvault repo. One `entities`
table (with a `kind` column) carries provenance inline and feeds an FTS5 index through triggers.
Each importer turns its input into `EntityInput` rows and hands them to one function,
`replaceSourceRows`, which atomically replaces that source's rows. Sources are declared once in a
registry that says whether they are publishable; the snapshot command uses that flag.

**Tech Stack:** Node ≥ 22 · TypeScript (run with `tsx`) · `better-sqlite3` (bundled SQLite with FTS5)
· `fzstd` (pure-JS zstd) · `sax` (streaming XML) · `wtf_wikipedia` (wikitext → text) · `csv-parse` ·
`yaml` · `vitest`.

**Spec:** `docs/design/specs/2026-09-27-forever-ai-addon-design.md` §2 (legal charter), §4.

> **As built (2026-09-27) — where the code departs from this plan, the code and its commits win:**
> `fzstd` → `zstd-napi` (the dump's frame needs a 2 GB window); the wiki parser pulls through the
> stream iterator; the wiki importer reads the dump twice (WikiTeam layout: pages split across
> blocks, text redirects); `replaceSourceRows` refuses empty replacements; curated/validator/snapshot
> were hardened in review (the snapshot is built in a work file beside the live DB and verified
> before it is moved into place); **Task 6 (wago.tools) was removed** — its robots.txt disallows
> `/db2`; the CLI validates flags and takes Blizzard paths without a leading slash.

**Why not `node:sqlite`:** Node 22.14's built-in SQLite has no FTS5 (`no such module: fts5`) and
`zlib` has no zstd on 22.14 — both checked 2026-09-27.

---

## File map

| File | Responsibility |
|---|---|
| `kb/package.json`, `kb/tsconfig.json` | Package, scripts |
| `kb/src/db.ts` | Open DB, schema (entities, FTS, api_cache) |
| `kb/src/sources.ts` | Source registry: licence + publishable flag |
| `kb/src/entities.ts` | `EntityInput` type, `replaceSourceRows` |
| `kb/src/search.ts` | FTS search |
| `kb/src/http.ts` | Shared User-Agent |
| `kb/src/importers/wiki-xml.ts` | Streaming MediaWiki XML → latest revision per page |
| `kb/src/importers/zstd.ts` | zstd decompress stream with backpressure |
| `kb/src/importers/wiki-dump.ts` | Wiki pages → `lore_page` rows |
| `kb/src/importers/wago.ts` | wago.tools CSV → item/spell/zone rows |
| `kb/src/importers/curated.ts` | `kb/curated/*.yaml` → rows |
| `kb/src/blizzard/namespaces.ts` | Namespace names per game version |
| `kb/src/blizzard/client.ts` | OAuth + GET with local cache |
| `kb/src/validate.ts` | Provenance checks |
| `kb/src/snapshot.ts` | Publishable-only export + manifest |
| `kb/src/cli.ts` | Command line |
| `kb/curated/forever.yaml` | First curated entry |
| `kb/test/**` | Tests and fixtures |
| `kb/README.md` | How to build, licences |

---

### Task 0: Branch

- [ ] **Step 1: Create the working branch from the spec branch**

```bash
cd <repository root>
git fetch origin
git checkout -b feat/kb-part1 origin/docs/forever-ai-addon-spec
```

Expected: `Switched to a new branch 'feat/kb-part1'`.

---

### Task 1: Scaffold the `kb` package

**Files:**
- Create: `kb/package.json`, `kb/tsconfig.json`, `kb/test/smoke.test.ts`
- Modify: `.gitignore` (append)

- [ ] **Step 1: Create `kb/package.json`**

```json
{
  "name": "@wowvault/kb",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=22" },
  "scripts": {
    "kb": "tsx src/cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd kb
npm install better-sqlite3 fzstd sax wtf_wikipedia csv-parse yaml
npm install -D typescript tsx vitest @types/node@22 @types/better-sqlite3 @types/sax
```

Expected: `added N packages`, no `ERR!`. `better-sqlite3` should install a prebuilt binary; if it
tries to compile and fails, stop and report — do not switch libraries silently.

- [ ] **Step 3: Create `kb/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 4: Append to the repo `.gitignore`**

```
# --- kb/ (knowledge base) ---
kb/data/
```

- [ ] **Step 5: Write the smoke test `kb/test/smoke.test.ts`**

```ts
import Database from "better-sqlite3";
import { expect, test } from "vitest";

test("bundled SQLite has FTS5", () => {
  const db = new Database(":memory:");
  db.exec("CREATE VIRTUAL TABLE t USING fts5(a); INSERT INTO t VALUES ('hello world');");
  const row = db.prepare("SELECT count(*) AS n FROM t WHERE t MATCH 'hello'").get() as { n: number };
  expect(row.n).toBe(1);
});
```

- [ ] **Step 6: Run it**

Run: `cd kb && npx vitest run test/smoke.test.ts`
Expected: `1 passed`.

- [ ] **Step 7: Commit**

```bash
cd <repository root>
git add .gitignore kb/package.json kb/package-lock.json kb/tsconfig.json kb/test/smoke.test.ts && git commit -m "[WoWVault] kb: scaffold package (better-sqlite3 with FTS5)"
```

---

### Task 2: Schema, database and source registry

**Files:**
- Create: `kb/src/db.ts`, `kb/src/sources.ts`, `kb/test/db.test.ts`

- [ ] **Step 1: Write the failing test `kb/test/db.test.ts`**

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { SOURCES } from "../src/sources.js";

test("openDb creates the schema and registers every source", () => {
  const db = openDb(":memory:");
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table') ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);
  expect(tables).toEqual(expect.arrayContaining(["api_cache", "entities", "entities_fts", "sources"]));
  const sources = db.prepare("SELECT id, licence, publishable FROM sources ORDER BY id").all();
  expect(sources).toHaveLength(Object.keys(SOURCES).length);
  expect(sources).toContainEqual({ id: "wago-tools", licence: "blizzard-game-data", publishable: 0 });
  expect(sources).toContainEqual({ id: "warcraft-wiki-2023", licence: "CC-BY-SA-4.0", publishable: 1 });
});

test("openDb is safe to call twice on the same file", () => {
  const file = join(mkdtempSync(join(tmpdir(), "kb-db-")), "kb.sqlite");
  openDb(file).close();
  const again = openDb(file);
  expect(again.prepare("SELECT count(*) AS n FROM sources").get()).toEqual({ n: Object.keys(SOURCES).length });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/db.test.ts`
Expected: FAIL — `Cannot find module '../src/db.js'`.

- [ ] **Step 3: Create `kb/src/sources.ts`**

```ts
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
```

- [ ] **Step 4: Create `kb/src/db.ts`**

```ts
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
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run test/db.test.ts`
Expected: `2 passed`.

- [ ] **Step 6: Commit**

```bash
git add kb/src/db.ts kb/src/sources.ts kb/test/db.test.ts && git commit -m "[WoWVault] kb: schema with inline provenance + source registry"
```

---

### Task 3: Writing rows and searching

**Files:**
- Create: `kb/src/entities.ts`, `kb/src/search.ts`, `kb/test/entities.test.ts`

- [ ] **Step 1: Write the failing test `kb/test/entities.test.ts`**

```ts
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { replaceSourceRows, type EntityInput } from "../src/entities.js";
import { search, toFtsQuery } from "../src/search.js";

const row = (extId: string, name: string, body = ""): EntityInput => ({
  kind: "lore_page",
  extId,
  name,
  body,
  gameVersion: "lore",
  sourceUrl: `https://example.test/${extId}`,
  retrievedAt: "2023-11-13",
});

test("replaceSourceRows inserts rows with the source licence", async () => {
  const db = openDb(":memory:");
  const n = await replaceSourceRows(db, "curated", ["lore_page"], [row("1", "Thrall", "Warchief of the Horde")]);
  expect(n).toBe(1);
  const r = db.prepare("SELECT licence, source_id FROM entities").get();
  expect(r).toEqual({ licence: "CC-BY-SA-4.0", source_id: "curated" });
});

test("re-running replaces instead of duplicating", async () => {
  const db = openDb(":memory:");
  await replaceSourceRows(db, "curated", ["lore_page"], [row("1", "Thrall"), row("2", "Jaina")]);
  await replaceSourceRows(db, "curated", ["lore_page"], [row("1", "Thrall")]);
  const { n } = db.prepare("SELECT count(*) AS n FROM entities").get() as { n: number };
  expect(n).toBe(1);
  expect(search(db, "jaina")).toHaveLength(0);
});

test("a failed import rolls back and keeps the previous rows", async () => {
  const db = openDb(":memory:");
  await replaceSourceRows(db, "curated", ["lore_page"], [row("1", "Thrall")]);
  async function* broken() {
    yield row("2", "Jaina");
    throw new Error("boom");
  }
  await expect(replaceSourceRows(db, "curated", ["lore_page"], broken())).rejects.toThrow("boom");
  expect(search(db, "thrall")).toHaveLength(1);
});

test("rows of a kind outside the declared kinds are rejected", async () => {
  const db = openDb(":memory:");
  await expect(
    replaceSourceRows(db, "curated", ["creator"], [row("1", "Thrall")]),
  ).rejects.toThrow("lore_page");
});

test("search finds by name and body and returns provenance", async () => {
  const db = openDb(":memory:");
  await replaceSourceRows(db, "curated", ["lore_page"], [row("1", "Thrall", "Warchief of the Horde")]);
  const hits = search(db, "warchief");
  expect(hits[0]).toMatchObject({ name: "Thrall", sourceUrl: "https://example.test/1", licence: "CC-BY-SA-4.0" });
});

test("toFtsQuery quotes terms so punctuation cannot break FTS syntax", () => {
  expect(toFtsQuery('Ahn\'Qiraj "gates" (AQ)')).toBe('"ahn" "qiraj" "gates" "aq"');
  expect(toFtsQuery("  ")).toBe("");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/entities.test.ts`
Expected: FAIL — `Cannot find module '../src/entities.js'`.

- [ ] **Step 3: Create `kb/src/entities.ts`**

```ts
import type { DB } from "./db.js";
import { SOURCES, type SourceId } from "./sources.js";

export type Kind = "item" | "npc" | "quest" | "zone" | "spell" | "lore_page" | "creator" | "realm";
export type GameVersion = "forever" | "classic" | "retail" | "lore";

export const ALL_KINDS: Kind[] = ["item", "npc", "quest", "zone", "spell", "lore_page", "creator", "realm"];

export interface EntityInput {
  kind: Kind;
  extId: string;
  name: string;
  body?: string;
  data?: Record<string, unknown>;
  gameVersion: GameVersion;
  sourceUrl: string;
  retrievedAt: string;
}

/**
 * Atomically replaces every row of `sourceId` whose kind is in `kinds` with `rows`.
 * On any error the previous rows are kept.
 */
export async function replaceSourceRows(
  db: DB,
  sourceId: SourceId,
  kinds: Kind[],
  rows: Iterable<EntityInput> | AsyncIterable<EntityInput>,
): Promise<number> {
  const licence = SOURCES[sourceId].licence;
  const del = db.prepare("DELETE FROM entities WHERE source_id = ? AND kind = ?");
  const ins = db.prepare(
    `INSERT INTO entities (kind, ext_id, name, body, data, game_version, source_id, source_url, licence, retrieved_at)
     VALUES (@kind, @extId, @name, @body, @data, @gameVersion, @sourceId, @sourceUrl, @licence, @retrievedAt)`,
  );
  db.exec("BEGIN");
  try {
    for (const k of kinds) del.run(sourceId, k);
    let n = 0;
    for await (const r of rows) {
      if (!kinds.includes(r.kind)) throw new Error(`row kind ${r.kind} is not one of: ${kinds.join(", ")}`);
      ins.run({ ...r, body: r.body ?? "", data: JSON.stringify(r.data ?? {}), sourceId, licence });
      n++;
    }
    db.exec("COMMIT");
    return n;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
```

- [ ] **Step 4: Create `kb/src/search.ts`**

```ts
import type { DB } from "./db.js";

export interface SearchHit {
  id: number;
  kind: string;
  name: string;
  snippet: string;
  sourceUrl: string;
  sourceId: string;
  licence: string;
}

/** Every term is quoted, so user input can never be read as FTS syntax. Terms are ANDed. */
export function toFtsQuery(input: string): string {
  const terms = input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms.map((t) => `"${t}"`).join(" ");
}

export function search(db: DB, query: string, limit = 10): SearchHit[] {
  const q = toFtsQuery(query);
  if (!q) return [];
  return db
    .prepare(
      `SELECT e.id, e.kind, e.name,
              snippet(entities_fts, 1, '', '', '…', 16) AS snippet,
              e.source_url AS sourceUrl, e.source_id AS sourceId, e.licence
       FROM entities_fts JOIN entities e ON e.id = entities_fts.rowid
       WHERE entities_fts MATCH ?
       ORDER BY bm25(entities_fts, 10.0, 1.0)
       LIMIT ?`,
    )
    .all(q, limit) as SearchHit[];
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/entities.test.ts`
Expected: `6 passed`.

- [ ] **Step 6: Commit**

```bash
git add kb/src/entities.ts kb/src/search.ts kb/test/entities.test.ts && git commit -m "[WoWVault] kb: atomic replaceSourceRows + FTS search"
```

---

### Task 4: Streaming MediaWiki XML parser

**Files:**
- Create: `kb/src/importers/wiki-xml.ts`, `kb/test/fixtures/wiki-sample.xml`, `kb/test/wiki-xml.test.ts`

- [ ] **Step 1: Create the fixture `kb/test/fixtures/wiki-sample.xml`**

```xml
<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.11/" version="0.11" xml:lang="en">
  <siteinfo><sitename>Warcraft Wiki</sitename></siteinfo>
  <page>
    <title>Thunderfury</title>
    <ns>0</ns>
    <id>101</id>
    <revision>
      <id>1</id>
      <timestamp>2020-01-01T00:00:00Z</timestamp>
      <contributor><username>A</username><id>9</id></contributor>
      <text bytes="8" xml:space="preserve">Old text</text>
    </revision>
    <revision>
      <id>2</id>
      <timestamp>2023-05-01T00:00:00Z</timestamp>
      <contributor><username>B</username><id>10</id></contributor>
      <text bytes="90" xml:space="preserve">'''Thunderfury''' is a [[legendary]] sword. Blessed Blade &amp; more.
[[Category:Legendary items]]</text>
    </revision>
  </page>
  <page>
    <title>Thunderfury (sword)</title>
    <ns>0</ns>
    <id>102</id>
    <redirect title="Thunderfury" />
    <revision>
      <id>3</id>
      <timestamp>2023-01-01T00:00:00Z</timestamp>
      <text bytes="24" xml:space="preserve">#REDIRECT [[Thunderfury]]</text>
    </revision>
  </page>
  <page>
    <title>User:Someone</title>
    <ns>2</ns>
    <id>103</id>
    <revision>
      <id>4</id>
      <timestamp>2023-01-01T00:00:00Z</timestamp>
      <text bytes="5" xml:space="preserve">Hello</text>
    </revision>
  </page>
</mediawiki>
```

- [ ] **Step 2: Write the failing test `kb/test/wiki-xml.test.ts`**

```ts
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { parsePages, type WikiPage } from "../src/importers/wiki-xml.js";

const fixture = fileURLToPath(new URL("./fixtures/wiki-sample.xml", import.meta.url));

async function all(): Promise<WikiPage[]> {
  const out: WikiPage[] = [];
  for await (const p of parsePages(createReadStream(fixture))) out.push(p);
  return out;
}

test("yields one page per <page> with the latest revision's text", async () => {
  const pages = await all();
  expect(pages.map((p) => p.id)).toEqual(["101", "102", "103"]);
  expect(pages[0]).toMatchObject({ title: "Thunderfury", ns: 0, redirect: false, timestamp: "2023-05-01T00:00:00Z" });
  expect(pages[0].text).toContain("Blessed Blade & more.");
  expect(pages[0].text).not.toContain("Old text");
});

test("marks redirects and keeps the namespace", async () => {
  const pages = await all();
  expect(pages[1].redirect).toBe(true);
  expect(pages[2].ns).toBe(2);
});

test("stopping early does not hang", async () => {
  for await (const p of parsePages(createReadStream(fixture))) {
    expect(p.id).toBe("101");
    break;
  }
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run test/wiki-xml.test.ts`
Expected: FAIL — `Cannot find module '../src/importers/wiki-xml.js'`.

- [ ] **Step 4: Create `kb/src/importers/wiki-xml.ts`**

```ts
import sax from "sax";
import type { Readable } from "node:stream";

export interface WikiPage {
  id: string;
  title: string;
  ns: number;
  redirect: boolean;
  /** Timestamp of the newest revision seen for this page. */
  timestamp: string;
  /** Wikitext of the newest revision. */
  text: string;
}

const HIGH_WATER = 500;
const LOW_WATER = 50;

/**
 * Streams a MediaWiki XML export (current or full history) and yields each page with its newest
 * revision. Pauses the input while the consumer falls behind, so multi-GB dumps stay in bounded memory.
 */
export async function* parsePages(input: Readable): AsyncGenerator<WikiPage> {
  const parser = sax.parser(true);
  const queue: WikiPage[] = [];
  const path: string[] = [];
  let page: WikiPage | null = null;
  let rev: { timestamp: string; text: string } | null = null;
  let buf = "";
  let finished = false;
  let failure: Error | null = null;
  let wake: (() => void) | null = null;
  const notify = () => {
    const w = wake;
    wake = null;
    w?.();
  };

  parser.onopentag = (node) => {
    path.push(node.name);
    buf = "";
    if (node.name === "page") page = { id: "", title: "", ns: 0, redirect: false, timestamp: "", text: "" };
    else if (node.name === "revision") rev = { timestamp: "", text: "" };
    else if (node.name === "redirect" && page) page.redirect = true;
  };
  parser.ontext = (t) => {
    buf += t;
  };
  parser.oncdata = (t) => {
    buf += t;
  };
  parser.onclosetag = (name) => {
    const parent = path[path.length - 2];
    if (page) {
      if (parent === "page" && name === "title") page.title = buf;
      else if (parent === "page" && name === "ns") page.ns = Number(buf);
      else if (parent === "page" && name === "id") page.id = buf;
      else if (rev && parent === "revision" && name === "timestamp") rev.timestamp = buf;
      else if (rev && parent === "revision" && name === "text") rev.text = buf;
      else if (rev && name === "revision") {
        if (rev.timestamp >= page.timestamp) {
          page.timestamp = rev.timestamp;
          page.text = rev.text;
        }
        rev = null;
      } else if (name === "page") {
        queue.push(page);
        page = null;
        if (queue.length >= HIGH_WATER) input.pause();
        notify();
      }
    }
    path.pop();
    buf = "";
  };
  parser.onerror = (e) => {
    failure = e;
    notify();
  };

  input.on("data", (chunk: Buffer | string) => {
    try {
      parser.write(chunk.toString());
    } catch (e) {
      failure = e as Error;
      notify();
    }
  });
  input.on("end", () => {
    try {
      parser.close();
    } catch (e) {
      failure = e as Error;
    }
    finished = true;
    notify();
  });
  input.on("error", (e) => {
    failure = e;
    notify();
  });

  try {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        if (queue.length <= LOW_WATER && input.isPaused()) input.resume();
        continue;
      }
      if (failure) throw failure;
      if (finished) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    input.destroy();
  }
}
```

Note: `chunk.toString()` on a raw Buffer can split a UTF-8 character across chunks. Task 5's
decompressor and `createReadStream` both hand over Buffers, so set the encoding at the source:
callers pass streams created with `setEncoding("utf8")` (done in Task 5 and in the test below).

- [ ] **Step 5: Make the test stream UTF-8 safe**

In `kb/test/wiki-xml.test.ts`, replace both `createReadStream(fixture)` calls with
`createReadStream(fixture, { encoding: "utf8" })`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run test/wiki-xml.test.ts`
Expected: `3 passed`.

- [ ] **Step 7: Commit**

```bash
git add kb/src/importers/wiki-xml.ts kb/test/wiki-xml.test.ts kb/test/fixtures/wiki-sample.xml && git commit -m "[WoWVault] kb: streaming MediaWiki XML parser (latest revision per page)"
```

---

### Task 5: Wiki dump importer (zstd + wikitext → lore pages)

**Files:**
- Create: `kb/src/importers/zstd.ts`, `kb/src/importers/wiki-dump.ts`, `kb/test/wiki-dump.test.ts`

- [ ] **Step 1: Write the failing test `kb/test/wiki-dump.test.ts`**

```ts
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { importWikiDump, wikiUrl, wikitextToText } from "../src/importers/wiki-dump.js";
import { search } from "../src/search.js";

const fixture = fileURLToPath(new URL("./fixtures/wiki-sample.xml", import.meta.url));

test("imports only main-namespace, non-redirect pages as lore_page rows", async () => {
  const db = openDb(":memory:");
  const n = await importWikiDump(db, fixture);
  expect(n).toBe(1);
  const r = db.prepare("SELECT kind, name, game_version, source_url, retrieved_at, licence, data FROM entities").get() as Record<string, string>;
  expect(r).toMatchObject({
    kind: "lore_page",
    name: "Thunderfury",
    game_version: "lore",
    source_url: "https://warcraft.wiki.gg/wiki/Thunderfury",
    retrieved_at: "2023-11-13",
    licence: "CC-BY-SA-4.0",
  });
  expect(JSON.parse(r.data).categories).toContain("Legendary items");
  expect(search(db, "legendary sword")).toHaveLength(1);
});

test("re-import does not duplicate", async () => {
  const db = openDb(":memory:");
  await importWikiDump(db, fixture);
  await importWikiDump(db, fixture);
  const { n } = db.prepare("SELECT count(*) AS n FROM entities").get() as { n: number };
  expect(n).toBe(1);
});

test("limit stops early", async () => {
  const db = openDb(":memory:");
  expect(await importWikiDump(db, fixture, { limit: 1 })).toBe(1);
});

test("wikitextToText strips markup and collects categories", () => {
  const { text, categories } = wikitextToText("'''Thrall''' leads the [[Horde]].\n[[Category:Orcs]]");
  expect(text).toContain("Thrall leads the Horde.");
  expect(categories).toEqual(["Orcs"]);
});

test("wikiUrl builds a readable wiki URL", () => {
  expect(wikiUrl("Thrall (lore)")).toBe("https://warcraft.wiki.gg/wiki/Thrall_(lore)");
  expect(wikiUrl("Ahn'Qiraj: The Fallen Kingdom")).toBe("https://warcraft.wiki.gg/wiki/Ahn'Qiraj:_The_Fallen_Kingdom");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/wiki-dump.test.ts`
Expected: FAIL — `Cannot find module '../src/importers/wiki-dump.js'`.

- [ ] **Step 3: Create `kb/src/importers/zstd.ts`**

```ts
import { Decompress } from "fzstd";
import { Readable } from "node:stream";

/** zstd-decompresses `input` with backpressure: the source pauses whenever the output is full. */
export function zstdDecompress(input: Readable): Readable {
  let ended = false;
  const end = () => {
    if (!ended) {
      ended = true;
      out.push(null);
    }
  };
  const out = new Readable({
    read() {
      input.resume();
    },
  });
  const d = new Decompress((chunk, final) => {
    if (chunk.length > 0 && !out.push(Buffer.from(chunk))) input.pause();
    if (final) end();
  });
  input.on("data", (c: Buffer) => {
    try {
      d.push(new Uint8Array(c));
    } catch (e) {
      out.destroy(e as Error);
    }
  });
  input.on("end", () => {
    try {
      d.push(new Uint8Array(0), true);
    } catch (e) {
      out.destroy(e as Error);
      return;
    }
    end();
  });
  input.on("error", (e) => out.destroy(e));
  return out;
}
```

- [ ] **Step 4: Create `kb/src/importers/wiki-dump.ts`**

```ts
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import wtf from "wtf_wikipedia";
import type { DB } from "../db.js";
import { replaceSourceRows, type EntityInput } from "../entities.js";
import { parsePages, type WikiPage } from "./wiki-xml.js";
import { zstdDecompress } from "./zstd.js";

/** Date of the Internet Archive dump: archive.org/details/wiki-warcraft.wiki.gg-20231113 */
export const WIKI_DUMP_DATE = "2023-11-13";

export function wikiUrl(title: string): string {
  const slug = encodeURIComponent(title.replace(/ /g, "_")).replace(/%3A/g, ":").replace(/%2F/g, "/");
  return `https://warcraft.wiki.gg/wiki/${slug}`;
}

export function wikitextToText(wikitext: string): { text: string; categories: string[] } {
  const doc = wtf(wikitext);
  return { text: doc.text().trim(), categories: doc.categories() };
}

async function* toRows(pages: AsyncIterable<WikiPage>, limit?: number): AsyncGenerator<EntityInput> {
  let n = 0;
  for await (const p of pages) {
    if (p.ns !== 0 || p.redirect || !p.text) continue;
    let converted: { text: string; categories: string[] };
    try {
      converted = wikitextToText(p.text);
    } catch {
      continue; // wikitext the parser cannot read is skipped, not guessed at
    }
    if (!converted.text) continue;
    yield {
      kind: "lore_page",
      extId: p.id,
      name: p.title,
      body: converted.text,
      data: { categories: converted.categories, revisionTimestamp: p.timestamp },
      gameVersion: "lore",
      sourceUrl: wikiUrl(p.title),
      retrievedAt: WIKI_DUMP_DATE,
    };
    if (limit && ++n >= limit) return;
  }
}

/** Imports a MediaWiki XML dump (`.xml` or `.xml.zst`). Returns the number of pages stored. */
export async function importWikiDump(db: DB, file: string, opts: { limit?: number } = {}): Promise<number> {
  const raw = createReadStream(file);
  const xml: Readable = file.endsWith(".zst") ? zstdDecompress(raw) : raw;
  xml.setEncoding("utf8");
  return replaceSourceRows(db, "warcraft-wiki-2023", ["lore_page"], toRows(parsePages(xml), opts.limit));
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/wiki-dump.test.ts`
Expected: `5 passed`. If `wtf_wikipedia`'s `text()` output differs slightly (spacing), adjust only
the expected strings in the test after printing the actual value — the behaviour (markup gone,
categories collected) must hold.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If it reports `Could not find a declaration file for module 'wtf_wikipedia'`,
create `kb/src/wtf.d.ts` containing `declare module "wtf_wikipedia";` and re-run.

- [ ] **Step 7: Commit**

```bash
git add kb/src/importers/zstd.ts kb/src/importers/wiki-dump.ts kb/test/wiki-dump.test.ts && git commit -m "[WoWVault] kb: Warcraft Wiki dump importer (zstd stream, lore pages, CC BY-SA provenance)"
```

(Add `kb/src/wtf.d.ts` to the `git add` if Step 6 created it.)

---

### Task 6: wago.tools table importer

**Files:**
- Create: `kb/src/http.ts`, `kb/src/importers/wago.ts`, `kb/test/wago.test.ts`

- [ ] **Step 1: Write the failing test `kb/test/wago.test.ts`**

```ts
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { importWagoTable, WAGO_TABLES, wagoCsvUrl, wagoRows } from "../src/importers/wago.js";

const items = WAGO_TABLES.find((t) => t.table === "ItemSparse")!;
const CSV = [
  "ID,Display_lang,OverallQualityID,ItemLevel,RequiredLevel,Other",
  '19019,"Thunderfury, Blessed Blade of the Windseeker",5,80,60,x',
  "17,,1,1,1,x",
].join("\n");

test("maps configured columns and skips rows without a name", () => {
  const rows = wagoRows(items, CSV, "1.60.1.69977", "2026-09-27T00:00:00.000Z");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: "item",
    extId: "19019",
    name: "Thunderfury, Blessed Blade of the Windseeker",
    gameVersion: "forever",
    sourceUrl: wagoCsvUrl("ItemSparse", "1.60.1.69977"),
    data: { build: "1.60.1.69977", quality: "5", itemLevel: "80", requiredLevel: "60" },
  });
});

test("fails loudly when an expected column is missing", () => {
  expect(() => wagoRows(items, "ID,Name\n1,A", "b", "t")).toThrow("Display_lang");
});

test("importWagoTable stores rows as non-publishable Blizzard game data", async () => {
  const db = openDb(":memory:");
  const fakeFetch = async () => new Response(CSV, { status: 200 });
  expect(await importWagoTable(db, items, "1.60.1.69977", fakeFetch as typeof fetch)).toBe(1);
  expect(await importWagoTable(db, items, "1.60.1.69977", fakeFetch as typeof fetch)).toBe(1);
  const r = db.prepare("SELECT count(*) AS n, max(licence) AS licence FROM entities").get();
  expect(r).toEqual({ n: 1, licence: "blizzard-game-data" });
});

test("HTTP errors are reported with the table and build", async () => {
  const db = openDb(":memory:");
  const notFound = async () => new Response("nope", { status: 404 });
  await expect(importWagoTable(db, items, "9.9.9", notFound as typeof fetch)).rejects.toThrow("ItemSparse 9.9.9: HTTP 404");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/wago.test.ts`
Expected: FAIL — `Cannot find module '../src/importers/wago.js'`.

- [ ] **Step 3: Create `kb/src/http.ts`**

```ts
/** Identifies us to every site we read, per API etiquette. */
export const USER_AGENT = "WoWVault-KB/0.1 (+https://github.com/CDVolvik/wowvault)";
```

- [ ] **Step 4: Create `kb/src/importers/wago.ts`**

```ts
import { parse } from "csv-parse/sync";
import type { DB } from "../db.js";
import { replaceSourceRows, type EntityInput, type Kind } from "../entities.js";
import { USER_AGENT } from "../http.js";

export interface WagoTable {
  table: string;
  kind: Kind;
  columns: { id: string; name: string; extra: Record<string, string> };
}

/**
 * DB2 tables we import and the CSV columns we read from each. Column names are checked against the
 * live header in Task 12 before the first real import; `wagoRows` refuses a CSV missing any of them.
 */
export const WAGO_TABLES: WagoTable[] = [
  {
    table: "ItemSparse",
    kind: "item",
    columns: {
      id: "ID",
      name: "Display_lang",
      extra: { quality: "OverallQualityID", itemLevel: "ItemLevel", requiredLevel: "RequiredLevel" },
    },
  },
  { table: "SpellName", kind: "spell", columns: { id: "ID", name: "Name_lang", extra: {} } },
  {
    table: "AreaTable",
    kind: "zone",
    columns: { id: "ID", name: "AreaName_lang", extra: { continentId: "ContinentID", parentAreaId: "ParentAreaID" } },
  },
];

export function wagoCsvUrl(table: string, build: string): string {
  return `https://wago.tools/db2/${table}/csv?build=${encodeURIComponent(build)}`;
}

export function wagoRows(cfg: WagoTable, csv: string, build: string, retrievedAt: string): EntityInput[] {
  const records = parse(csv, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  if (records.length > 0) {
    const wanted = [cfg.columns.id, cfg.columns.name, ...Object.values(cfg.columns.extra)];
    const missing = wanted.filter((c) => !(c in records[0]));
    if (missing.length > 0) throw new Error(`${cfg.table}: missing columns ${missing.join(", ")}`);
  }
  return records
    .filter((r) => r[cfg.columns.name]?.trim())
    .map((r) => ({
      kind: cfg.kind,
      extId: r[cfg.columns.id],
      name: r[cfg.columns.name].trim(),
      data: {
        build,
        ...Object.fromEntries(Object.entries(cfg.columns.extra).map(([key, col]) => [key, r[col]])),
      },
      gameVersion: "forever" as const,
      sourceUrl: wagoCsvUrl(cfg.table, build),
      retrievedAt,
    }));
}

/** Downloads one table for one build and replaces that kind's wago.tools rows. */
export async function importWagoTable(db: DB, cfg: WagoTable, build: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const res = await fetchImpl(wagoCsvUrl(cfg.table, build), { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`wago.tools ${cfg.table} ${build}: HTTP ${res.status}`);
  const rows = wagoRows(cfg, await res.text(), build, new Date().toISOString());
  return replaceSourceRows(db, "wago-tools", [cfg.kind], rows);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/wago.test.ts`
Expected: `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add kb/src/http.ts kb/src/importers/wago.ts kb/test/wago.test.ts && git commit -m "[WoWVault] kb: wago.tools DB2 importer (local-only Blizzard game data)"
```

---

### Task 7: Curated importer + first entry

**Files:**
- Create: `kb/src/importers/curated.ts`, `kb/test/curated.test.ts`, `kb/curated/forever.yaml`

- [ ] **Step 1: Write the failing test `kb/test/curated.test.ts`**

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { importCurated } from "../src/importers/curated.js";

function dirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "kb-curated-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

const GOOD = `
- kind: lore_page
  id: forever-launch
  name: WoW Forever launch date
  game_version: forever
  body: WoW Forever launches on November 4, 2026.
  source_url: https://news.blizzard.com/en-us/article/24302498
  retrieved_at: "2026-09-27"
`;

test("imports every yaml file in the folder as curated rows", async () => {
  const db = openDb(":memory:");
  expect(await importCurated(db, dirWith({ "a.yaml": GOOD, "notes.txt": "ignored" }))).toBe(1);
  const r = db.prepare("SELECT kind, ext_id, game_version, licence, source_id FROM entities").get();
  expect(r).toEqual({ kind: "lore_page", ext_id: "forever-launch", game_version: "forever", licence: "CC-BY-SA-4.0", source_id: "curated" });
});

test("a missing field names the file and the field", async () => {
  const db = openDb(":memory:");
  const bad = GOOD.replace(/  source_url:.*\n/, "");
  await expect(importCurated(db, dirWith({ "bad.yaml": bad }))).rejects.toThrow("bad.yaml: entry 1 is missing source_url");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/curated.test.ts`
Expected: FAIL — `Cannot find module '../src/importers/curated.js'`.

- [ ] **Step 3: Create `kb/src/importers/curated.ts`**

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { DB } from "../db.js";
import { ALL_KINDS, replaceSourceRows, type EntityInput, type GameVersion, type Kind } from "../entities.js";

const REQUIRED = ["kind", "id", "name", "game_version", "body", "source_url", "retrieved_at"] as const;

/**
 * Reads every `*.yaml` in `dir`. Each file is a list of entries written in our own words; `source_url`
 * points at the evidence. Replaces all curated rows.
 */
export async function importCurated(db: DB, dir: string): Promise<number> {
  const rows: EntityInput[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()) {
    const entries = parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>[] | null;
    (entries ?? []).forEach((e, i) => {
      for (const field of REQUIRED) {
        if (e[field] === undefined || e[field] === "") throw new Error(`${file}: entry ${i + 1} is missing ${field}`);
      }
      rows.push({
        kind: e.kind as Kind,
        extId: String(e.id),
        name: String(e.name),
        body: String(e.body),
        gameVersion: e.game_version as GameVersion,
        sourceUrl: String(e.source_url),
        retrievedAt: String(e.retrieved_at),
      });
    });
  }
  return replaceSourceRows(db, "curated", ALL_KINDS, rows);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/curated.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Verify the source before writing the first entry**

Open `https://news.blizzard.com/en-us/article/24302498/updated-9-24-pre-purchase-the-world-of-warcraft-forever-collectors-edition`
in a browser and confirm it states the launch date. If it says a date other than November 4, 2026,
use the date it states. If the page does not state a date, do not write the entry; report it.

- [ ] **Step 6: Create `kb/curated/forever.yaml`**

```yaml
# Curated entries, written in our own words. source_url is the evidence, not copied text.
# Licence: CC BY-SA 4.0 (same as the rest of the published dataset).
- kind: lore_page
  id: forever-launch-date
  name: WoW Forever launch date
  game_version: forever
  body: World of Warcraft Forever launches on November 4, 2026, after a beta that began on September 17, 2026.
  source_url: https://news.blizzard.com/en-us/article/24302498/updated-9-24-pre-purchase-the-world-of-warcraft-forever-collectors-edition
  retrieved_at: "2026-09-27"
```

- [ ] **Step 7: Commit**

```bash
git add kb/src/importers/curated.ts kb/test/curated.test.ts kb/curated/forever.yaml && git commit -m "[WoWVault] kb: curated YAML importer + first Forever entry"
```

---

### Task 8: Blizzard API client with local cache

**Files:**
- Create: `kb/src/blizzard/namespaces.ts`, `kb/src/blizzard/client.ts`, `kb/test/blizzard.test.ts`

- [ ] **Step 1: Write the failing test `kb/test/blizzard.test.ts`**

```ts
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { BlizzardClient } from "../src/blizzard/client.js";
import { namespace, NotAvailableYetError } from "../src/blizzard/namespaces.js";

test("namespace names per game version", () => {
  expect(namespace("retail", "static", "us")).toBe("static-us");
  expect(namespace("classic", "dynamic", "eu")).toBe("dynamic-classic-eu");
  expect(namespace("classic1x", "profile", "us")).toBe("profile-classic1x-us");
  expect(() => namespace("forever", "static", "us")).toThrow(NotAvailableYetError);
});

function fakeBlizzard() {
  const calls: string[] = [];
  const impl = async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith("https://oauth.battle.net/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 86399 }), { status: 200 });
    }
    return new Response(JSON.stringify({ classes: [{ id: 1, name: "Warrior" }] }), { status: 200 });
  };
  return { calls, impl: impl as typeof fetch };
}

test("fetches a token once and serves repeats from the cache until the TTL passes", async () => {
  const db = openDb(":memory:");
  const { calls, impl } = fakeBlizzard();
  let now = Date.parse("2026-09-27T00:00:00Z");
  const client = new BlizzardClient(db, { clientId: "id", clientSecret: "secret", region: "us", fetchImpl: impl, now: () => now });

  const first = await client.get("/data/wow/playable-class/index", "classic1x", "static", 3600);
  expect(first).toEqual({ classes: [{ id: 1, name: "Warrior" }] });
  expect(calls).toHaveLength(2);
  expect(calls[1]).toBe("https://us.api.blizzard.com/data/wow/playable-class/index?namespace=static-classic1x-us&locale=en_US");

  await client.get("/data/wow/playable-class/index", "classic1x", "static", 3600);
  expect(calls).toHaveLength(2);

  now += 3601 * 1000;
  await client.get("/data/wow/playable-class/index", "classic1x", "static", 3600);
  expect(calls).toHaveLength(3);
});

test("forever requests fail fast without any network call", async () => {
  const db = openDb(":memory:");
  const { calls, impl } = fakeBlizzard();
  const client = new BlizzardClient(db, { clientId: "id", clientSecret: "secret", region: "us", fetchImpl: impl });
  await expect(client.get("/data/wow/item/19019", "forever", "static")).rejects.toThrow(NotAvailableYetError);
  expect(calls).toHaveLength(0);
});

test("API errors name the path and namespace", async () => {
  const db = openDb(":memory:");
  const impl = (async (url: string | URL | Request) =>
    String(url).startsWith("https://oauth.battle.net")
      ? new Response(JSON.stringify({ access_token: "t", expires_in: 100 }), { status: 200 })
      : new Response("{}", { status: 404 })) as typeof fetch;
  const client = new BlizzardClient(db, { clientId: "id", clientSecret: "s", region: "us", fetchImpl: impl });
  await expect(client.get("/data/wow/item/1", "retail", "static")).rejects.toThrow("HTTP 404: /data/wow/item/1 (static-us)");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/blizzard.test.ts`
Expected: FAIL — `Cannot find module '../src/blizzard/client.js'`.

- [ ] **Step 3: Create `kb/src/blizzard/namespaces.ts`**

```ts
export type Game = "retail" | "classic" | "classic1x" | "forever";
export type NsKind = "static" | "dynamic" | "profile";
export type Region = "us" | "eu" | "kr" | "tw";

export class NotAvailableYetError extends Error {}

/**
 * Battle.net namespace for a game version. Forever has no namespace as of 2026-09-27; when Blizzard
 * publishes one, replace the throw with its name.
 */
export function namespace(game: Game, kind: NsKind, region: Region): string {
  switch (game) {
    case "retail":
      return `${kind}-${region}`;
    case "classic":
      return `${kind}-classic-${region}`;
    case "classic1x":
      return `${kind}-classic1x-${region}`;
    case "forever":
      throw new NotAvailableYetError("Blizzard has not published a WoW: Forever API namespace yet");
  }
}
```

- [ ] **Step 4: Create `kb/src/blizzard/client.ts`**

```ts
import type { DB } from "../db.js";
import { USER_AGENT } from "../http.js";
import { namespace, type Game, type NsKind, type Region } from "./namespaces.js";

export interface BlizzardConfig {
  clientId: string;
  clientSecret: string;
  region: Region;
  locale?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * Battle.net API client. Responses are cached in `api_cache` on this machine only — Blizzard's terms
 * forbid redistributing the data, so the snapshot command always drops this table.
 */
export class BlizzardClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly db: DB,
    private readonly cfg: BlizzardConfig,
  ) {}

  private http(): typeof fetch {
    return this.cfg.fetchImpl ?? fetch;
  }

  private clock(): number {
    return (this.cfg.now ?? Date.now)();
  }

  async get(path: string, game: Game, kind: NsKind, ttlSeconds = 86_400): Promise<unknown> {
    const ns = namespace(game, kind, this.cfg.region);
    const url = new URL(`https://${this.cfg.region}.api.blizzard.com${path}`);
    url.searchParams.set("namespace", ns);
    url.searchParams.set("locale", this.cfg.locale ?? "en_US");
    const key = url.toString();

    const cached = this.db.prepare("SELECT body, expires_at FROM api_cache WHERE key = ?").get(key) as
      | { body: string; expires_at: string }
      | undefined;
    if (cached && Date.parse(cached.expires_at) > this.clock()) return JSON.parse(cached.body);

    const res = await this.http()(key, {
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`Blizzard API HTTP ${res.status}: ${path} (${ns})`);
    const body = await res.text();
    const now = this.clock();
    this.db
      .prepare(
        `INSERT INTO api_cache (key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
      )
      .run(key, body, new Date(now).toISOString(), new Date(now + ttlSeconds * 1000).toISOString());
    return JSON.parse(body);
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.clock() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
    const res = await this.http()("https://oauth.battle.net/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`Blizzard OAuth HTTP ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, expiresAt: this.clock() + j.expires_in * 1000 };
    return this.token.value;
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/blizzard.test.ts`
Expected: `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add kb/src/blizzard/namespaces.ts kb/src/blizzard/client.ts kb/test/blizzard.test.ts && git commit -m "[WoWVault] kb: Blizzard API client, all namespaces, local-only cache, Forever gated"
```

---

### Task 9: Provenance validator

**Files:**
- Create: `kb/src/validate.ts`, `kb/test/validate.test.ts`

- [ ] **Step 1: Write the failing test `kb/test/validate.test.ts`**

```ts
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { replaceSourceRows } from "../src/entities.js";
import { validate } from "../src/validate.js";

async function seeded() {
  const db = openDb(":memory:");
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  return db;
}

test("a clean database has no problems", async () => {
  expect(validate(await seeded())).toEqual([]);
});

test("reports rows whose licence differs from their source", async () => {
  const db = await seeded();
  db.prepare("UPDATE entities SET licence = 'CC0'").run();
  expect(validate(db)).toContain("licence mismatch: curated has 1 row(s) not licensed CC-BY-SA-4.0");
});

test("reports missing or malformed provenance", async () => {
  const db = await seeded();
  db.prepare("UPDATE entities SET source_url = 'not a url', retrieved_at = 'yesterday'").run();
  const problems = validate(db);
  expect(problems).toContain("bad source_url: curated/lore_page/1");
  expect(problems).toContain("bad retrieved_at: curated/lore_page/1");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/validate.test.ts`
Expected: FAIL — `Cannot find module '../src/validate.js'`.

- [ ] **Step 3: Create `kb/src/validate.ts`**

```ts
import type { DB } from "./db.js";

type Row = { source_id: string; kind: string; ext_id: string };

/** Returns a list of problems; empty means every row carries valid provenance. */
export function validate(db: DB): string[] {
  const problems: string[] = [];
  const ref = (r: Row) => `${r.source_id}/${r.kind}/${r.ext_id}`;

  for (const r of db
    .prepare("SELECT source_id, kind, ext_id FROM entities WHERE source_url NOT LIKE 'https://%' LIMIT 50")
    .all() as Row[]) {
    problems.push(`bad source_url: ${ref(r)}`);
  }
  for (const r of db
    .prepare(
      "SELECT source_id, kind, ext_id FROM entities WHERE retrieved_at NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]*' LIMIT 50",
    )
    .all() as Row[]) {
    problems.push(`bad retrieved_at: ${ref(r)}`);
  }
  for (const r of db
    .prepare(
      `SELECT e.source_id, s.licence, count(*) AS n FROM entities e JOIN sources s ON s.id = e.source_id
       WHERE e.licence <> s.licence GROUP BY e.source_id, s.licence`,
    )
    .all() as { source_id: string; licence: string; n: number }[]) {
    problems.push(`licence mismatch: ${r.source_id} has ${r.n} row(s) not licensed ${r.licence}`);
  }
  try {
    db.exec("INSERT INTO entities_fts(entities_fts) VALUES ('integrity-check')");
  } catch (e) {
    problems.push(`search index out of sync: ${(e as Error).message}`);
  }
  return problems;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/validate.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add kb/src/validate.ts kb/test/validate.test.ts && git commit -m "[WoWVault] kb: provenance validator"
```

---

### Task 10: Publishable-only snapshot

**Files:**
- Create: `kb/src/snapshot.ts`, `kb/test/snapshot.test.ts`

- [ ] **Step 1: Write the failing test `kb/test/snapshot.test.ts`**

```ts
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { replaceSourceRows } from "../src/entities.js";
import { snapshot } from "../src/snapshot.js";

test("snapshot keeps publishable rows only and writes a manifest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", body: "Warchief", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  await replaceSourceRows(db, "wago-tools", ["item"], [
    { kind: "item", extId: "19019", name: "Thunderfury", gameVersion: "forever", sourceUrl: "https://wago.tools/x", retrievedAt: "2026-09-27" },
  ]);
  db.prepare("INSERT INTO api_cache VALUES ('k', '{}', '2026-09-27', '2026-09-28')").run();

  const out = join(dir, "release.sqlite");
  const manifest = snapshot(db, out, new Date("2026-09-27T12:00:00Z"));
  expect(manifest.counts).toEqual({ curated: 1 });

  const snap = new Database(out, { readonly: true });
  expect(snap.prepare("SELECT source_id FROM entities").all()).toEqual([{ source_id: "curated" }]);
  expect(snap.prepare("SELECT count(*) AS n FROM api_cache").get()).toEqual({ n: 0 });
  expect(snap.prepare("SELECT id FROM sources ORDER BY id").all()).toEqual([{ id: "curated" }, { id: "warcraft-wiki-2023" }]);
  expect(snap.prepare("SELECT count(*) AS n FROM entities_fts WHERE entities_fts MATCH 'warchief'").get()).toEqual({ n: 1 });
  snap.close();

  const written = JSON.parse(readFileSync(`${out}.manifest.json`, "utf8"));
  expect(written).toMatchObject({ createdAt: "2026-09-27T12:00:00.000Z", licence: "CC-BY-SA-4.0", counts: { curated: 1 } });
  expect(written.notice).toContain("not affiliated with Blizzard");
});

test("snapshot refuses to run when validation fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", gameVersion: "lore", sourceUrl: "nope", retrievedAt: "2026-09-27" },
  ]);
  expect(() => snapshot(db, join(dir, "release.sqlite"))).toThrow("bad source_url");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/snapshot.test.ts`
Expected: FAIL — `Cannot find module '../src/snapshot.js'`.

- [ ] **Step 3: Create `kb/src/snapshot.ts`**

```ts
import Database from "better-sqlite3";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import type { DB } from "./db.js";
import { validate } from "./validate.js";

export const NOTICE =
  "Data licensed CC BY-SA 4.0. Lore text comes from Warcraft Wiki (warcraft.wiki.gg) via the Internet " +
  "Archive dump of 2023-11-13, used under CC BY-SA 4.0; every row carries its source URL. Blizzard game " +
  "data and Blizzard API responses are not included — rebuild them locally with the kb scripts. " +
  "World of Warcraft is a trademark of Blizzard Entertainment; this project is not affiliated with Blizzard.";

export interface Manifest {
  createdAt: string;
  licence: "CC-BY-SA-4.0";
  notice: string;
  counts: Record<string, number>;
}

/** Writes a copy of the database containing only publishable sources, plus `<out>.manifest.json`. */
export function snapshot(db: DB, outPath: string, now = new Date()): Manifest {
  const problems = validate(db);
  if (problems.length > 0) throw new Error(`validation failed:\n${problems.join("\n")}`);
  if (existsSync(outPath)) rmSync(outPath);
  db.prepare("VACUUM INTO ?").run(outPath);

  const out = new Database(outPath);
  try {
    out.exec(`
      DELETE FROM entities WHERE source_id IN (SELECT id FROM sources WHERE publishable = 0);
      DELETE FROM sources WHERE publishable = 0;
      DELETE FROM api_cache;
      INSERT INTO entities_fts(entities_fts) VALUES ('rebuild');
    `);
    out.exec("VACUUM");
    const counts = Object.fromEntries(
      (out.prepare("SELECT source_id, count(*) AS n FROM entities GROUP BY source_id").all() as { source_id: string; n: number }[]).map(
        (r) => [r.source_id, r.n],
      ),
    );
    const manifest: Manifest = { createdAt: now.toISOString(), licence: "CC-BY-SA-4.0", notice: NOTICE, counts };
    writeFileSync(`${outPath}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } finally {
    out.close();
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/snapshot.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add kb/src/snapshot.ts kb/test/snapshot.test.ts && git commit -m "[WoWVault] kb: publishable-only snapshot with licence manifest"
```

---

### Task 11: Command line

**Files:**
- Create: `kb/src/cli.ts`

- [ ] **Step 1: Create `kb/src/cli.ts`**

```ts
import { existsSync } from "node:fs";
import { BlizzardClient } from "./blizzard/client.js";
import type { Game, NsKind, Region } from "./blizzard/namespaces.js";
import { openDb } from "./db.js";
import { importCurated } from "./importers/curated.js";
import { importWagoTable, WAGO_TABLES } from "./importers/wago.js";
import { importWikiDump } from "./importers/wiki-dump.js";
import { search } from "./search.js";
import { snapshot } from "./snapshot.js";
import { validate } from "./validate.js";

const USAGE = `usage: npm run kb -- <command> [--db data/wowvault-kb.sqlite]
  import-wiki <dump.xml|dump.xml.zst> [--limit N]
  import-wago <build> [--table ItemSparse]
  import-curated [dir=curated]
  blizzard-get <path> --game retail|classic|classic1x|forever --kind static|dynamic|profile [--region us]
  search <words...>
  stats
  validate
  snapshot <out.sqlite>`;

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = new Map<string, string>();
  const args: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) flags.set(rest[i].slice(2), rest[++i] ?? "");
    else args.push(rest[i]);
  }
  if (existsSync(".env")) process.loadEnvFile(".env");
  const db = openDb(flags.get("db") ?? "data/wowvault-kb.sqlite");

  switch (cmd) {
    case "import-wiki": {
      if (!args[0]) break;
      const limit = flags.has("limit") ? Number(flags.get("limit")) : undefined;
      console.log(`imported ${await importWikiDump(db, args[0], { limit })} lore pages`);
      return 0;
    }
    case "import-wago": {
      if (!args[0]) break;
      const tables = flags.has("table") ? WAGO_TABLES.filter((t) => t.table === flags.get("table")) : WAGO_TABLES;
      if (tables.length === 0) throw new Error(`unknown table ${flags.get("table")}`);
      for (const t of tables) console.log(`${t.table}: ${await importWagoTable(db, t, args[0])} rows`);
      return 0;
    }
    case "import-curated":
      console.log(`imported ${await importCurated(db, args[0] ?? "curated")} curated entries`);
      return 0;
    case "blizzard-get": {
      const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
      if (!args[0] || !id || !secret) {
        console.error("needs a path plus BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET in kb/.env");
        return 1;
      }
      const client = new BlizzardClient(db, { clientId: id, clientSecret: secret, region: (flags.get("region") ?? "us") as Region });
      const body = await client.get(args[0], (flags.get("game") ?? "retail") as Game, (flags.get("kind") ?? "static") as NsKind);
      console.log(JSON.stringify(body, null, 2));
      return 0;
    }
    case "search":
      for (const h of search(db, args.join(" "))) console.log(`${h.kind}  ${h.name}\n  ${h.snippet}\n  ${h.sourceUrl} (${h.licence})`);
      return 0;
    case "stats":
      console.table(db.prepare("SELECT source_id, kind, count(*) AS rows FROM entities GROUP BY source_id, kind").all());
      return 0;
    case "validate": {
      const problems = validate(db);
      console.log(problems.length === 0 ? "ok" : problems.join("\n"));
      return problems.length === 0 ? 0 : 1;
    }
    case "snapshot":
      if (!args[0]) break;
      console.log(JSON.stringify(snapshot(db, args[0]), null, 2));
      return 0;
  }
  console.error(USAGE);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (e: Error) => {
    console.error(e.message);
    process.exit(1);
  },
);
```

- [ ] **Step 2: Try it against the test fixture**

Run (from `kb/`):
```bash
npm run kb -- import-wiki test/fixtures/wiki-sample.xml --db data/cli-check.sqlite
npm run kb -- import-curated --db data/cli-check.sqlite
npm run kb -- search legendary sword --db data/cli-check.sqlite
npm run kb -- validate --db data/cli-check.sqlite
npm run kb -- blizzard-get /data/wow/item/19019 --game forever --kind static --db data/cli-check.sqlite
```
Expected, in order: `imported 1 lore pages` · `imported 1 curated entries` · a `lore_page  Thunderfury`
hit with `https://warcraft.wiki.gg/wiki/Thunderfury (CC-BY-SA-4.0)` · `ok` · either the "needs … in
kb/.env" message (no credentials yet) or `Blizzard has not published a WoW: Forever API namespace yet`.
Running with no command prints the usage text and exits 1.

- [ ] **Step 3: Type-check and run the whole suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; every test file passes.

- [ ] **Step 4: Commit**

```bash
git add kb/src/cli.ts && git commit -m "[WoWVault] kb: command line (import, search, validate, snapshot, blizzard-get)"
```

---

### Task 12: First real build, README, status

This task touches the network and a 637 MB download. Every source is checked against the legal
charter (spec §2) before it is read.

**Files:**
- Create: `kb/README.md`
- Modify: `_STATUS.md` (append to the 2026-09-27 section)

- [ ] **Step 1: Check wago.tools' robots.txt**

Run: `curl -s https://wago.tools/robots.txt`
Expected: no `Disallow` rule for `User-agent: *` covering `/db2`. **If `/db2` (or `/`) is
disallowed, skip Steps 3–4**, add a row to the Gaps backlog in `docs/sources/source-catalog.md`
("Forever game tables — wago.tools disallows /db2 in robots.txt"), and continue with Step 5.

- [ ] **Step 2: Find the current Forever build**

Run:
```bash
curl -s https://wago.tools/api/builds | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);
for (const [product, builds] of Object.entries(j)) for (const b of [].concat(builds))
  if (String(b.version||'').startsWith('1.60.')) console.log(product, b.version, b.created_at||'');})"
```
Expected: one or more lines like `wow_classic_beta 1.60.1.69977 …`. Use the newest version as
`BUILD` below. If nothing starts with `1.60.`, print the product keys (`Object.keys(j)`) and pick the
Forever product by name; record which one in `kb/README.md`.

- [ ] **Step 3: Confirm the CSV headers match `WAGO_TABLES`**

Run (replace the build):
```bash
BUILD=1.60.1.69977
for t in ItemSparse SpellName AreaTable; do echo "== $t"; curl -s "https://wago.tools/db2/$t/csv?build=$BUILD" | head -1; done
```
Expected headers include: ItemSparse → `ID`, `Display_lang`, `OverallQualityID`, `ItemLevel`,
`RequiredLevel`; SpellName → `ID`, `Name_lang`; AreaTable → `ID`, `AreaName_lang`, `ContinentID`,
`ParentAreaID`. If a name differs, change it in `kb/src/importers/wago.ts` `WAGO_TABLES` **and** in
`kb/test/wago.test.ts` (the CSV fixture header and expectations), re-run `npx vitest run test/wago.test.ts`,
and commit that change before importing.

- [ ] **Step 4: Import the Forever tables**

Run: `npm run kb -- import-wago $BUILD`
Expected: three lines `ItemSparse: N rows`, `SpellName: N rows`, `AreaTable: N rows`, each N > 0.

- [ ] **Step 5: Download the Warcraft Wiki dump (637 MB)**

```bash
mkdir -p data/raw
curl -L -o data/raw/warcraft.wiki.gg-20231113-history.xml.zst \
  https://archive.org/download/wiki-warcraft.wiki.gg-20231113/warcraft.wiki.gg-20231113-history.xml.zst
ls -l data/raw/
```
Expected: a file of roughly 637 MB.

- [ ] **Step 6: Trial import of 200 pages, then check a known page**

```bash
npm run kb -- import-wiki data/raw/warcraft.wiki.gg-20231113-history.xml.zst --limit 200
npm run kb -- stats
```
Expected: `imported 200 lore pages`; stats shows `warcraft-wiki-2023 | lore_page | 200`.
Then spot-check one row by hand: `npm run kb -- search <a word from a page title shown by stats>`
and open its URL — the wiki page should be the same article.

- [ ] **Step 7: Full wiki import**

Run: `npm run kb -- import-wiki data/raw/warcraft.wiki.gg-20231113-history.xml.zst`
Expected: `imported N lore pages` with N in the tens of thousands. Note the wall-clock time for the
README. Then: `npm run kb -- search thrall warchief` returns lore pages about Thrall.

- [ ] **Step 8: Curated entries, validate, snapshot**

```bash
npm run kb -- import-curated
npm run kb -- stats
npm run kb -- validate
npm run kb -- snapshot data/release/wowvault-kb-$(date +%Y-%m-%d).sqlite
```
Expected: `ok` from validate; the manifest's `counts` lists only `warcraft-wiki-2023` and `curated`
(never `wago-tools` or `blizzard-api`).

- [ ] **Step 9: Blizzard API check (needs a fresh client)**

The old client in the maintainer's secrets store is flagged for rotation. Create a new client
at https://develop.battle.net/access/clients, then write `kb/.env` (gitignored by the repo's `.env`
rule):
```
BLIZZARD_CLIENT_ID=...
BLIZZARD_CLIENT_SECRET=...
```
Run: `npm run kb -- blizzard-get /data/wow/playable-class/index --game classic1x --kind static`
Expected: JSON listing the Classic Era classes. Run it a second time — it must return instantly from
the cache. If Carlos hasn't created the client yet, skip this step and say so in the status update.

- [ ] **Step 10: Write `kb/README.md`**

```markdown
# kb — the WoWVault knowledge base

A local SQLite database of WoW knowledge in which every row carries its source, licence, retrieval
date and URL. Design: `../docs/design/specs/2026-09-27-forever-ai-addon-design.md` §2 and §4.

## Build it

    npm install
    npm run kb -- import-wiki data/raw/warcraft.wiki.gg-20231113-history.xml.zst
    npm run kb -- import-wago <forever build>      # e.g. 1.60.1.69977
    npm run kb -- import-curated
    npm run kb -- validate

The wiki dump is at https://archive.org/details/wiki-warcraft.wiki.gg-20231113 (637 MB).

## Sources and what may be published

| Source | Licence | In the public snapshot |
|---|---|---|
| Warcraft Wiki, Internet Archive dump 2023-11-13 | CC BY-SA 4.0 | yes |
| Curated entries (`curated/*.yaml`) | CC BY-SA 4.0 | yes |
| wago.tools DB2 tables (Blizzard game data) | Blizzard's | no — rebuilt locally |
| Blizzard Battle.net API | Blizzard Developer API Terms | no — local cache only |

`npm run kb -- snapshot <out.sqlite>` writes the publishable copy and a `.manifest.json`.

## Rules

Read the legal charter (spec §2) before adding a source. Blocked, paid or unlicensed sources go on
the gaps backlog in `../docs/sources/source-catalog.md`, never into an importer.

## Code licence

MIT. Data licence: CC BY-SA 4.0.
```

Add one line under "Build it" recording the Forever build used and the full wiki import time from
Step 7.

- [ ] **Step 11: Append to `_STATUS.md`** (end of the "2026-09-27 — MVP replaced" section)

```markdown
**Part 1 (knowledge base) built** on branch `feat/kb-part1`: `kb/` package, wiki dump + wago.tools +
curated importers, Blizzard client (local cache, Forever gated), validator, snapshot. First build:
<N> lore pages, <N> items / <N> spells / <N> zones (Forever build <BUILD>), <N> curated. Next:
Part 2 (MCP server) plan.
```

Replace every `<N>`/`<BUILD>` with the numbers printed by `npm run kb -- stats` and Step 2.

- [ ] **Step 12: Commit and push**

```bash
cd <repository root>
git add kb/README.md _STATUS.md && git commit -m "[WoWVault] kb: first real build, README, status"
git push -u origin feat/kb-part1
git fetch origin && git show origin/feat/kb-part1:kb/README.md | head -3
```
Expected: the push succeeds and the last command prints the README's first lines from the remote.
