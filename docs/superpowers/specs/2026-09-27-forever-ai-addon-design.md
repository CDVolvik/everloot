# WoW: Forever AI Addon — Design

**Date:** 2026-09-27 · **Status:** approved in brainstorm, awaiting spec review · **Owner:** Carlos
**Supersedes:** the Retail collection-tracker MVP in `_STATUS.md` / `BUILD_PLAN.md` (parked, not deleted).

## 1. What it is

Ask anything about WoW from inside the game — lore, items, quests, Forever rules — and get a short,
sourced answer in a window in the client. Answers come from a map of known WoW sources, not from a
model's memory. The player brings their own AI access (API key or an existing subscription).

Three layers, each usable on its own:

1. **Addon** (Lua, WoW: Forever, TOC 16001) — the `/ask` window. Works alone in offline mode.
2. **Companion** (Node, Windows first) — the agent harness: provider adapters, fallback chain,
   memory, the bridge to the game.
3. **wow-knowledge MCP server** — the game knowledge as tools over mapped sources. Usable from any
   MCP client (Claude Desktop, Codex, Hermes), not just the game.

### Hard rules

- **It answers; it never acts.** No key presses, no movement, no input to the client, no automation
  of play. This is what separates it from a bot (see `_STATUS.md` 2026-09-17) and it protects every
  user's account and the CurseForge listing.
- **Keys and logins never touch the addon.** Addon SavedVariables are plaintext on disk. Credentials
  live only in the companion's config.
- **Pointers, not copies.** A source is used only in the way its terms allow (§4). No bulk scraping,
  no redistributing another site's data inside the addon.
- **No shell tool on the game path.** The in-game path can reach knowledge tools only. Text from the
  game (item names, chat, quest text) is untrusted input; a tool that can run commands must never be
  reachable from it.

## 2. Architecture

```
┌─ Addon (CurseForge) ───────────────┐
│ /ask window · character context    │
│ offline mode (knowledge pack)      │
└──────────────┬─────────────────────┘
               │ bridge (pixels out / slot addons in)
┌─ Companion (GitHub release) ───────▼──────────────────────┐
│ agent loop · provider adapters · fallback chain · memory  │
└──────────────┬────────────────────────────────────────────┘
               │ MCP
┌─ wow-knowledge MCP server ─────────▼──────────────────────┐
│ tools: search · get_item · get_quest · get_npc ·          │
│        get_zone · get_lore · get_character_context        │
│ source map · local cache (SQLite)                         │
└───────────────────────────────────────────────────────────┘
```

### 2.1 Addon

- `/ask <question>` opens a small answer window.
- **Offline answerers** run first: game API data (quest log, zone, gear, spec, level) and a
  knowledge pack we author (Forever rules, the source map's links).
- **Bridge client** auto-detects the companion. Present → open questions go to it with character
  context. Absent → offline answer, or "not in the local pack" plus a source-map link to look it up.

### 2.2 Bridge

Built on the bridge from [chelinho139/wow-ai](https://github.com/chelinho139/wow-ai) (MIT; credit
kept in LICENSE/README). Outbound: the addon paints the message as a strip of coloured pixels; the
companion captures and decodes it. Inbound: the companion writes the reply into one of a pool of
pre-made slot addons that the client loads on a timer. Every message carries a checksum; a bad
checksum is retried once, then reported.

Known costs: requires windowed/borderless mode, and it runs against a quotable EULA clause. The
Blizzard EULA bars "any unauthorized process or software that intercepts, collects, reads, or
'mines' information generated or stored by the Platform." Tools Blizzard tolerates read files the
client writes (SavedVariables, the combat log) and never memory or the screen; the pixel bridge
reads the screen. Users are told this plainly at install, and the addon is useful without it.

**File bridge (the tolerated path).** The addon stores the question in SavedVariables; the companion
reads the file, answers, and writes the reply into a slot addon that shows after `/reload`. Slower,
but it stays inside what Blizzard tolerates. Which bridge is the **public default** is an open
question (§8); v1 (private, test account) uses the live bridge.

### 2.3 Companion

- **Agent loop** runs the chosen provider with the wow-knowledge MCP tools attached, plus the
  character context from the bridge and the memory files.
- **Answer shaping:** the in-game reply is short and ends with its sources and the model that
  answered (`Source: warcraft.wiki.gg · answered by DeepSeek`). The full answer goes to the log.
- Designed as a library with the game as its first front end, so other front ends can be added
  later without touching the core (§7).

### 2.4 Provider adapters

| # | Adapter | Covers | Notes |
|---|---|---|---|
| 1 | OpenAI-compatible key | DeepSeek, OpenRouter, Ollama, any compatible endpoint | Reliable path |
| 2 | Anthropic API key | Claude via API | Reliable path |
| 3 | ChatGPT subscription | "Sign in with ChatGPT" OAuth → `chatgpt.com/backend-api/codex` | Same mechanism Hermes uses (`openai-codex`). Tokens are rejected by `api.openai.com`. Uses Codex's public client and an endpoint not documented for third parties — **best effort** |
| 4 | Claude subscription | Claude Agent SDK / `claude -p` | Since 2026-06-15 draws on the monthly Agent SDK credit, then API rates. Never extract Claude OAuth tokens into our own client — that is the use Anthropic banned. **Best effort** |

Adapters 3 and 4 are labelled "subscription (best effort)" in the UI. Re-read both vendors' current
terms before public release.

### 2.5 Fallback chain

- The user orders their enabled providers, e.g. `ChatGPT sign-in → DeepSeek key → Ollama`.
- Fall through on **failure only**: auth error, rate limit, credit exhausted, timeout, 5xx.
  Never on "the answer looks weak".
- **Only providers the user enabled are ever tried.** No silent paid fallback (Hermes lesson: a
  pay-per-token fallback drained credits unnoticed until a 402).
- Every answer names the model that produced it. If all providers fail, say so plainly.

### 2.6 Memory

Small markdown files in the **companion's** data folder (`%APPDATA%\<app>\memory\`), never the
addon folder — the CurseForge app replaces the addon folder on every update, and an addon cannot
write `.md` files anyway.

- `characters/<realm>-<name>.md` — class, goals, things the player asked it to remember.
- `conversations/YYYY-MM.md` — one line per exchange, monthly files.

Before answering, the agent reads the character file and the last few exchanges. Nothing more in v1.

### 2.7 wow-knowledge MCP server

- **Tools:** `search`, `get_item`, `get_quest`, `get_npc`, `get_zone`, `get_lore`,
  `get_character_context`. Each returns facts **with the URL they came from**.
- **Source map:** one entry per source — what it answers, how to query it, which game versions it
  covers, its access type (§4), and the date it was last verified.
- **Routing:** a tool asks the map which sources handle that kind of question for Forever, tries
  them in order, falls through when one fails.
- **Cache:** SQLite, keyed by source + query, with a TTL per source. This cache plus the curated
  entries is what grows into the shared "database for agents".

## 3. One question, end to end

1. Player: `/ask what drops Thunderfury's bindings?`
2. Addon tries offline. No match → sends question + character context over the bridge.
3. Companion loads memory, runs the first provider in the chain with MCP tools attached.
4. Model calls `get_item` / `get_lore`; each tool resolves sources via the map, queries or reads the
   cache, returns facts with URLs.
5. Companion shapes a short answer with sources and model name, writes it to a slot addon; the
   addon shows it. The exchange is appended to `conversations/YYYY-MM.md`.

| Failure | Behaviour |
|---|---|
| Companion off | Offline answer or "not in the local pack" + a source-map link |
| Provider fails | Next enabled provider; answer names the one used; all fail → plain error |
| Source down | Next mapped source for that question type; answer notes the gap |
| Nothing found | "I don't know." Lore and item answers require a cited source |
| Bridge checksum fails | Retry once, then error |

## 4. Sources

Every source gets an **access type**, decided only after checking its terms:

| Type | Meaning |
|---|---|
| `api` | Official documented API — preferred |
| `wiki` | Public MediaWiki API |
| `fetch` | Occasional on-demand page read, cited |
| `link` | Point the user there; we don't read it programmatically |
| `curated` | Data we write and maintain (streamers and socials, realms, quest-route notes) |

Rules:

- **Game data:** use public dumps where they exist (e.g. wago.tools). We do not unpack the game
  client ourselves.
- **Wowhead:** `link` only. No API, and its robots.txt disallows `ClaudeBot`, `anthropic-ai` and
  `GPTBot` by name. We point users to `wowhead.com/forever`; we never fetch it.
- **Forever coverage is checked per source**, never assumed. As of 2026-09-27 Forever is in beta
  (launch 2026-11-04) and has **no machine-readable feed**: no Blizzard API namespace, so Raider.IO
  and Warcraft Logs have nothing yet either. Blizzard also runs no PTR and hides item stats until
  drop, so datamined tables have gaps. Re-verify every Forever source after launch.
- **Attribution is required** for warcraft.wiki.gg (CC BY-SA 4.0), the Blizzard API and Twitch. The
  in-game source line satisfies it for short answers.
- The full candidate catalogue and the per-source verification live in
  `docs/sources/source-catalog.md`. A source enters the live map only when its entry is complete.

## 5. Testing and accuracy

- **Golden set:** ~50 questions with known answers (lore, items, quests, Forever rules). Run against
  each provider; track accuracy, citation present, latency, cost. Thresholds come from these runs,
  not from guesses.
- **Source-map validator:** fails any entry missing access type, last-verified date or version
  coverage.
- **MCP tools:** tested against recorded fixtures — no live network in tests.
- **Bridge:** encode/decode round-trip tests in code; manual in-game pass on a test account.
- **Addon:** offline mode verified with the companion stopped.
- **Fallback:** each failure type simulated; the next provider must take over.

## 6. Phases

| Phase | Scope | Audience |
|---|---|---|
| **v1 — the spine** | Addon (offline + bridge) · companion with 4 adapters, fallback, memory · MCP server with the v1 sources from the catalogue: warcraft.wiki.gg (`wiki`), one Forever fan wiki (`fetch`), wago.tools tables for items/quests (`fetch` + cache), character context, and Wowhead as `link` · golden set | Carlos only |
| **v2 — the ecosystem** | More sources from the catalogue: Raider.IO / Warcraft Logs if they cover Forever, Petopia, realm status, streamer registry with live status, guide links | Carlos + testers |
| **v3 — public** | Addon on CurseForge, companion on GitHub, wow-ai credited · `craft-ownership-gate` + `oss-pr-safeguard` + Codex adversarial review before anything ships under Carlos's name · vendor terms re-read | Everyone |

## 7. Not in v1

- **General coding / terminal assistant.** The harness core is built as a library so a terminal
  front end can be added later, as a separate front end with its own tools and its own opt-in. It
  never shares the in-game path (§1 hard rules). Claude Code and Codex already cover this need;
  revisit when the knowledge product works.
- **"Learning"** means memory files, the growing cache and curated source entries — not model
  training.
- A hosted/shared database, Retail support, Grok adapter, mobile surfaces.

## 8. Open questions

- Product name for the addon and the MCP server (repo stays `wowvault` for now).
- **Public default bridge (Carlos):** file bridge by default with the live bridge as a labelled
  opt-in, or file bridge only. Recommended: file bridge only for the public build, given the EULA
  clause in §2.2.
- Which Forever fan wiki: three sites use the name (see the catalogue). Pick one by content and terms.
- Whether CurseForge moderation accepts an addon with a screen-reading companion. Only relevant if
  the live bridge ships publicly.
- Warcraft Logs: API redistribution terms are silent. Ask `support@rpglogs.com` before v2.
