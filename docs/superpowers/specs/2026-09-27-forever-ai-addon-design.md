# WoW: Forever AI Addon + Open Knowledge Base — Design

**Date:** 2026-09-27 · **Status:** approved in brainstorm, awaiting spec review · **Owner:** Carlos
**Supersedes:** the Retail collection-tracker MVP in `_STATUS.md` / `BUILD_PLAN.md` (parked, not deleted).
**Sources:** `docs/sources/source-catalog.md` (candidates, access checks, gaps backlog).

## 1. What it is

Ask anything about WoW from inside the game — lore, items, quests, Forever rules — and get a short,
sourced answer. Answers come from **our own open knowledge base**, built only from data we are
allowed to use. The player brings their own AI access (API key or an existing subscription).

The knowledge base is the core asset. The addon, the MCP server and a public website are three ways
of reading it.

## 2. Legal charter

The goal is a project that can keep growing because nothing in it can be taken down. These rules
override convenience everywhere in this spec.

1. **Robots.txt and content signals are obeyed**, even where a licence would allow more. If a site
   disallows a path or a bot, we don't automate against it.
2. **Every record carries its provenance:** source, licence, retrieval date, URL. No record without it.
3. **We never train or fine-tune models** on collected data (several sources reserve `ai-train=no`).
4. **Attribution travels with the data** into every answer and every web page.
5. **Blocked, paid or unlicensed sources are never copied.** They go on the gaps backlog and are
   filled only by our own collection or by written permission.
6. **Blizzard:** no reading game memory or the screen in any public build; we never unpack the game
   client ourselves; Blizzard API data is never redistributed, resold or shown on ad-supported pages.
7. **Player-collected data is opt-in and anonymised**, and comes only from the addon's own saved file.
8. **When unsure, ask the owner.** A permission email beats our own reading of the terms.
9. **It answers; it never acts.** No input to the game client, no automation of play (see
   `_STATUS.md` 2026-09-17).

## 3. Four parts, built in order

| # | Part | What it is | Depends on |
|---|---|---|---|
| 1 | **Knowledge base + ingestion** | SQLite database, importers, curated files, gaps backlog | — |
| 2 | **wow-knowledge MCP server** | Tools over the knowledge base, usable by any MCP client | 1 |
| 3 | **Addon + companion** | In-game `/ask`, agent harness, opt-in data collector | 1, 2 |
| 4 | **Public website** | Pages over the knowledge base, AdSense, in `web/` | 1 |

Each part gets its own implementation plan. Part 1 is planned first.

## 4. Part 1 — Knowledge base + ingestion

### 4.1 Storage

- **SQLite**, one file. Entities: `item`, `npc`, `quest`, `zone`, `spell`, `lore_page`, `creator`,
  `realm`, plus `source` and `record_provenance`.
- Every row links to provenance: `source_id`, `licence`, `retrieved_at`, `source_url`,
  `game_version` (`forever` / `classic` / `retail` / `lore`).
- Full-text search index over names and page text.

### 4.2 Importers

| Importer | Input | Licence / basis | Notes |
|---|---|---|---|
| Wiki dump | Internet Archive dump of warcraft.wiki.gg, 2023-11-13 (`history.xml.zst`, 637 MB) | CC BY-SA 4.0 | Lore baseline. Pre-dates Forever. Current revisions only |
| Wiki sync (fresh) | warcraft.wiki.gg | CC BY-SA 4.0 — **blocked on permission** | Its robots.txt disallows `/api.php` and names `ClaudeBot`/`GPTBot`; content signal `ai-train=no, use=reference`. We email wiki.gg for permission or a current dump before any sync |
| Game tables | wago.tools DB2 CSV exports for Forever builds | Community-tolerated datamining, not a grant | **Rebuilt locally by script**; we publish the script, not Blizzard's tables |
| Curated | YAML/Markdown files in this repo | Ours | Forever rules we write, creators, realms, quest notes |
| Player collection | Uploads from the addon collector (Part 3) | Ours, opt-in | Drops, NPC positions, quest givers — the original Thottbot model |

Importers are idempotent: re-running replaces rows from that source, never duplicates them.

### 4.3 Gaps backlog

`docs/sources/source-catalog.md` § Gaps backlog lists every blocked, paid or unlicensed source, what
data it would have given, and how we fill that gap ourselves. It is the to-do list for growing the
knowledge base.

### 4.4 Replicable and open

- **Code:** MIT (matches wow-ai, which Part 3 builds on).
- **Data we publish:** CC BY-SA 4.0 — required by the wiki's share-alike terms, allows commercial
  use. Our curated and player-collected data use the same licence, so the whole dataset has one.
- **Release:** a versioned SQLite snapshot of the publishable data on GitHub Releases, plus the
  scripts that rebuild everything (including the local-only game tables) from scratch.

## 5. Part 2 — wow-knowledge MCP server

- **Tools:** `search`, `get_item`, `get_quest`, `get_npc`, `get_zone`, `get_lore`,
  `get_character_context`. Each returns facts with provenance (source name + URL).
- **Knowledge base first.** Live sources are a fallback only where their terms allow it (§2.1).
- **Link-outs:** when we lack data, the answer points to where to look (e.g. `wowhead.com/forever`)
  instead of fetching it.
- Usable from Claude Desktop, Codex, Hermes or any MCP client, not only the game.

## 6. Part 3 — Addon + companion

```
┌─ Addon (CurseForge) ───────────────┐
│ /ask window · character context    │
│ offline answers · opt-in collector │
└──────────────┬─────────────────────┘
               │ bridge (file bridge in public builds)
┌─ Companion (GitHub release) ───────▼──────────────────────┐
│ agent loop · provider adapters · fallback chain · memory  │
└──────────────┬────────────────────────────────────────────┘
               │ MCP
        wow-knowledge MCP server (Part 2) → knowledge base (Part 1)
```

### 6.1 Addon

- `/ask <question>` opens a small answer window.
- **Offline answers** first: game API data (quest log, zone, gear, spec, level) and a small bundled
  knowledge pack.
- **Collector (opt-in, off by default):** records what the player observes — NPC positions, loot,
  quest givers — into the addon's SavedVariables. Character and realm names are stripped before
  upload.

### 6.2 Bridge

- **Public builds: file bridge only (decided 2026-09-27).** The addon stores the question in
  SavedVariables; the companion reads the file, answers, and writes the reply into a slot addon that
  shows after `/reload`. This stays inside what Blizzard tolerates: reading files the client writes.
- **v1 private: live bridge** on Carlos's test account, built on
  [chelinho139/wow-ai](https://github.com/chelinho139/wow-ai) (MIT, credited): pixel strip out, slot
  addons in. It runs against the Blizzard EULA clause barring "any unauthorized process or software
  that intercepts, collects, reads, or 'mines' information generated or stored by the Platform", so
  it never ships publicly.
- Every message carries a checksum; a bad checksum is retried once, then reported.

### 6.3 Companion

- **Agent loop** runs the chosen provider with the MCP tools, character context and memory.
- **Answer shaping:** short in-game reply ending with sources and the model used
  (`Source: warcraft.wiki.gg · answered by DeepSeek`). The full answer goes to the log.
- **Uploader:** sends opted-in collector data to the knowledge base intake (format and hosting in
  Part 3's plan).
- Built as a library with the game as its first front end (§10).

### 6.4 Provider adapters

| # | Adapter | Covers | Notes |
|---|---|---|---|
| 1 | OpenAI-compatible key | DeepSeek, OpenRouter, Ollama, any compatible endpoint | Reliable path |
| 2 | Anthropic API key | Claude via API | Reliable path |
| 3 | ChatGPT subscription | "Sign in with ChatGPT" OAuth → `chatgpt.com/backend-api/codex` | Same mechanism Hermes uses. Codex's public client, undocumented endpoint — **best effort** |
| 4 | Claude subscription | Claude Agent SDK / `claude -p` | Since 2026-06-15 draws on the monthly Agent SDK credit, then API rates. Never extract Claude OAuth tokens — **best effort** |

Re-read both vendors' current terms before public release.

### 6.5 Fallback chain

- The user orders their enabled providers. Fall through on failure only (auth, rate limit, credit
  exhausted, timeout, 5xx), never on answer quality.
- Only providers the user enabled are tried — no silent paid fallback.
- Every answer names its model; if all fail, say so plainly.

### 6.6 Memory

Markdown in the companion's data folder (`%APPDATA%\<app>\memory\`), never the addon folder (the
CurseForge app replaces it on update):

- `characters/<realm>-<name>.md` — class, goals, things to remember.
- `conversations/YYYY-MM.md` — one line per exchange.

## 7. Part 4 — Public website

- Next.js in `web/` (the existing GoldGoblin scaffold, already set up for AdSense).
- Pages generated from the knowledge base: items, quests, NPCs, zones, lore, creators.
- Every page shows attribution and the CC BY-SA notice for the data on it.
- **No Blizzard API data on ad-supported pages** (Blizzard Developer API terms: no monetising the
  data). Whether datamined game tables may appear on an ad-supported page is checked against
  Blizzard's fan-content rules before Part 4 starts.

## 8. One question, end to end

1. Player: `/ask what drops Thunderfury's bindings?`
2. Addon tries offline. No match → sends question + character context over the bridge.
3. Companion loads memory, runs the first provider with MCP tools.
4. Model calls `get_item` / `get_lore`; the tools read the knowledge base and return facts with
   provenance.
5. Short answer with sources and model name goes back to the addon; the exchange is appended to
   `conversations/YYYY-MM.md`.

| Failure | Behaviour |
|---|---|
| Companion off | Offline answer or "not in the local pack" + a link-out |
| Provider fails | Next enabled provider; all fail → plain error |
| Not in the knowledge base | Allowed live fallback if any, else a link-out; logged to the gaps backlog |
| Nothing found | "I don't know." Lore and item answers need a cited record |
| Bridge checksum fails | Retry once, then error |

## 9. Testing and accuracy

- **Golden set:** ~50 questions with known answers (lore, items, quests, Forever rules), run against
  each provider; track accuracy, citation present, latency, cost. Thresholds come from these runs.
- **Provenance check:** fails any record without source, licence, date and URL.
- **Importers:** tested against small fixture files; re-running must not duplicate rows.
- **MCP tools:** tested against a fixture database — no network in tests.
- **Bridge:** encode/decode round-trip tests; manual in-game pass on a test account.
- **Addon:** offline mode verified with the companion stopped; collector off by default.
- **Fallback:** each failure type simulated.

## 10. Phases

| Phase | Scope | Audience |
|---|---|---|
| **v1** | Part 1 (wiki dump + wago.tools + curated) · Part 2 · Part 3 with the live bridge · golden set | Carlos |
| **v2** | Collector + intake · fresh wiki sync if permitted · more sources per the catalogue · creator registry with Twitch live status | Carlos + testers |
| **v3** | Public: addon on CurseForge (file bridge), companion + data snapshot on GitHub · `craft-ownership-gate` + `oss-pr-safeguard` + Codex adversarial review | Everyone |
| **v4** | Part 4 website with AdSense | Everyone |

**Not planned:** a general coding/terminal assistant on the game path (a separate front end on the
harness library, later, never reachable from game text); model training; Retail; mobile.

## 11. Open questions

- **wiki.gg permission:** email for a current dump or permission to sync. Until answered, lore comes
  from the 2023 dump and Forever lore is a gap.
- Product name for the addon, MCP server and site (repo stays `wowvault`).
- Which Forever fan wiki (three sites use the name — see the catalogue).
- Blizzard fan-content rules for game data on an ad-supported site (before Part 4).
- Warcraft Logs API redistribution terms — ask `support@rpglogs.com` before using it.
- Where the collector intake is hosted (Part 3 plan).
