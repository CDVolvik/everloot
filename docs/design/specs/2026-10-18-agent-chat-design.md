# Agent chat: the Everloot agent on the site, the companion and in game

**Date:** 2026-10-18
**Status:** design for Carlos's review. Nothing here is built. Provider terms and prices were read on
2026-10-17; anything I could not read is marked **unverified**. Prices change, so re-read them before
any number goes to a user.

## Why

Everloot answers questions well through its MCP tools, but only inside someone else's assistant, or
through `/ask` in game, where the answer is two sentences after a `/reload`. Players expect what
ChatGPT and Claude give them: a place to ask, a history to come back to, and a way to keep what they
found. Everloot can offer that with one difference: every answer is built from Everloot's own sourced data
and shows its sources.

Three surfaces, one account:

1. **Website.** `/chat`, with sessions, folders, notes and saved builds and raid comps.
2. **Desktop companion.** Links to the account with a short code. In-game `/ask` questions land in
   the web history, and answers, notes and plans flow back into the game.
3. **Addon.** A chat window that shows recent synced conversations and queues new questions.

## Hard limits (they shape everything below)

- **Addons cannot use the network.** The addon never makes a request. Data moves only through
  SavedVariables, which the game writes at `/reload` or logout, and through files the companion writes
  for the addon to load on the next `/reload`. This is the existing file bridge
  (`addon/modules/ask.lua`, `companion/src/bridge/`). The window in game is therefore never live: it
  shows "synced 14 minutes ago", not a typing indicator.
- **Never work around Blizzard's restrictions.** No reading game memory, no automation, no tricks to
  reach the network from Lua. The companion reads one file and writes one slot addon, as today
  (`docs/DATA_POLICY.md`, "What we refuse").
- **The addon is display-only and never acts for the player.** It queues text the player typed and
  shows text. It does not click, target, cast, spend talent points, send chat messages or fill in
  the game's import box. A talent share code is shown selectable so the player copies it and pastes it
  themselves. The addon never shows an ad, a plan or a donation request (platform spec, ground rules
  and part 7).
- **Unverified in the client:** that a read-only `EditBox` can be selected for copying, and the
  practical size limit for a data file the game loads. Both are checked in the beta session before the
  window is built.

## What exists today

| Piece | State on `main` |
|---|---|
| In-game `/ask` | `addon/modules/ask.lua`: up to 20 pending questions of 500 characters in `EverlootDB.asks`, ids like `ask:<installId>:<n>`, answers read from `EverlootAnswersDB` with an Adler-32 `sum` check, shown once, then the question leaves the queue |
| Companion bridge | `companion/src/bridge/`: reads asks from SavedVariables, answers each (top search hit, or a model summary of the top three hits), writes the `EverlootAnswers` slot addon atomically (temp file and rename), keeps the newest 20 answers. All strings are Lua-escaped (`lua.ts`) |
| Providers | `companion/src/providers/`: `anthropic` (official SDK, `claude-opus-5-5` by default) and `openai-compatible` (DeepSeek, OpenRouter, local Ollama). Keys come from a file named by `apiKeyFile`; a key inside `config.json` is refused. Fall through only on provider failure, never on answer quality, and never to a provider the user did not enable |
| MCP | `kb/src/mcp-server.ts`: 14 read-only tools (`search_knowledge`, `get_entity`, `get_by_name`, `profession_path`, `recipe_thresholds`, `item_page`, `npc_page`, `quest_page`, `vendor_page`, `collection_gap`, `guild_board`, `auction_history`, `gold_ledger`, `everloot_plan`). `/mcp` takes a bearer token, `/mcp/public` is open with a per-IP quota |
| Sourced answers | Designed, not built: `answer_sources(question)` returns evidence with source, licence and date (`2026-10-17-sourced-answers-design.md`). This spec needs it |
| Accounts | Battle.net sessions for named sharing only. Free accounts with Battle.net and GitHub sign-in are designed in part 7 of the platform expansion spec (branch `docs/platform-expansion-spec`), also not built |
| Privacy | `docs/DATA_POLICY.md` describes public, anonymous uploads. It has no category for private chat content, so it needs one (see Privacy) |

The older companion design (`2026-09-27-forever-ai-addon-design.md`, section 6.4) lists two
"best effort" adapters: sign in with a ChatGPT subscription and use a Claude subscription. This spec
supersedes those two rows. See the finding below.

## Part 1. Model access

### Decision on record

Carlos, 2026-10-18: a small free allowance per account, plus bring-your-own provider. Longer term,
free inference on open-weight models for the community.

### Can a consumer subscription be used? Plainly: no

**Claude.ai Free, Pro or Max: not allowed.** Anthropic's Claude Code legal page says: "Anthropic does
not permit third-party developers to offer Claude.ai login into their own applications, or to route
requests through Free, Pro, or Max plan credentials on behalf of their users." It also says
developers "may not collect, store, or intermediate Claude.ai credentials or session tokens" and that
products built on Claude, including with the Agent SDK, "should use API key authentication through
Claude Console or a supported cloud provider."
Source: <https://code.claude.com/docs/en/legal-and-compliance>, read 2026-10-17. The Consumer Terms
(<https://www.anthropic.com/legal/consumer-terms>, read 2026-10-17, section 3) bar access "through
automated or non-human means, whether through a bot, script, or otherwise" except through an API key
or where Anthropic permits it. Everloot will not offer "Sign in with Claude", will not read or store
Claude.ai tokens, and will not call `claude -p` on a user's subscription from the companion.

**ChatGPT and Codex sign-in: not available to Everloot.** Three things I could read:

- "Sign in with ChatGPT" for apps is "currently available to selected commercial partners through a
  limited trial" and, in the guide, returns identity only: no access or refresh token. Plan usage is
  "a separate authorization and registration flow" the page does not explain.
  Source: <https://developers.openai.com/siwc/website>, read 2026-10-17.
- OpenAI's Codex page offers ChatGPT sign-in for Codex itself and tells programmatic workflows to use
  API keys. Its access tokens are "intended for trusted scripts, schedulers, and private CI runners"
  and are "not a general API credential." Source: <https://learn.chatgpt.com/docs/auth> (the old
  `developers.openai.com/codex/auth` address redirects there), read 2026-10-17.
- The Sign in with ChatGPT terms (<https://openai.com/policies/sign-in-with-chatgpt-terms/>) returned
  HTTP 403 to me. A search summary of them says plan usage is limited to the requesting user's own
  activity, tokens must be stored locally under the user's control, and general-purpose access for
  other tools is prohibited. **Unverified until someone reads the page.**

Some open-source tools sign in with a Codex-style flow anyway. Their own documents say so; OpenAI's
terms do not, as far as I could read. Everloot is a public product with a public repository, so
"others do it" is not a reason. We do not build it.

**Google, xAI, OpenRouter:** none offers a consumer-subscription sign-in for third-party apps that I
could verify. xAI's API is a separate pay-per-token product from SuperGrok (secondary sources only,
**unverified**; xAI's terms returned 403). Some tools use a SuperGrok sign-in, but the sources say
xAI limits it by allowlist, and no official xAI page allows it. Not offered.

**What we offer instead:** API keys, which every provider documents and bills to the key owner.

### Providers we can realistically add

| Provider | How | Notes | Source (read 2026-10-17) |
|---|---|---|---|
| Anthropic | API key, official SDK | Already in the companion. Sonnet 5.5 is $2 input and $10 output per 1M tokens; Opus 5.5 is $4 and $20. The companion's default is Opus 5.5, so the chat default should be Sonnet 5.5 | <https://platform.claude.com/docs/en/about-claude/pricing> |
| OpenAI | API key, OpenAI-compatible | `gpt-6-luna` is $0.10 and $0.50; `gpt-5.4-mini` is $0.75 and $4.50 | <https://developers.openai.com/api/docs/pricing> |
| xAI Grok | API key, `https://api.x.ai/v1` | `grok-4.3` is $1.25 and $2.50; `grok-4.5` is $2 and $6. That the endpoint is OpenAI-compatible is from memory, **unverified** | <https://docs.x.ai/docs/models> |
| Google Gemini | API key | `gemini-2.5-flash-lite` is $0.10 and $0.40 paid. Free tier content is used to improve Google's products and humans may read it. Terms effective 2026-03-23 say apps must not target under-18s and EEA, Swiss and UK apps must use paid services only. How the age clause applies to a user's own key is **unverified**. Ship last, with a warning | <https://ai.google.dev/gemini-api/terms>, <https://ai.google.dev/gemini-api/docs/pricing> |
| OpenRouter | API key, OpenAI-compatible | One key for many models. Free models: 50 requests a day, 1,000 a day after the user buys 10 credits. Prompts are not logged by default and providers that log are skipped unless the user allows it | <https://openrouter.ai/docs/faq> |
| Ollama (local) | No key, `http://localhost:11434/v1` | Streaming and tool calling work; `tool_choice` does not | <https://docs.ollama.com/api/openai-compatibility> |
| Any OpenAI-compatible host | Base URL and key | The same adapter | existing `openai-compatible` provider |

Two findings. First, the companion's two existing adapters already reach every row: `anthropic` for
Claude and `openai-compatible` for the rest. No new adapter is needed in the companion. Second, the
browser needs the same two adapters, written once in a small shared package so the site and the
companion do not drift.

Fall-through rules stay as they are: only providers the user enabled, only on provider failure, every
answer names its model.

### Where keys live

Rule: **Everloot's servers never hold a user's provider key in plain text, and in the first version
never hold one at all.**

| Where the agent runs | Key lives | Used for |
|---|---|---|
| Companion | A file on the user's machine, named by `apiKeyFile` (today's behaviour) | In-game `/ask` answered locally; optionally web chat later |
| Browser | `IndexedDB` on that browser, as a non-extractable `CryptoKey` wrapping the key, with an optional passphrase. Never sent to Everloot. The browser calls the provider directly, then calls Everloot's public MCP for evidence | Web chat on the user's own key |
| Everloot server | Everloot's own keys for the free allowance, in the host's secret store. Never a user's key | The free allowance |

Consequences, stated to the user on the settings page: a key entered in one browser is not available
in another or in the companion; the user re-enters it, or points each device at its own key. If you
clear site data you lose it. Everloot cannot recover it, because Everloot never had it.

Because the browser calls the provider, the provider must allow browser requests (CORS). Anthropic's
SDK has a documented opt-in for it; whether the others allow it is **unverified** and checked per
provider before it is listed. A provider that blocks browsers is offered through the companion only.

**Synced, encrypted keys are a later option, not a first version.** If Carlos wants keys to follow the
account, they would be encrypted in the browser with a passphrase Everloot never sees, and stored as
ciphertext. The settings page would say that a lost passphrase means a lost key and that a breach of
Everloot would expose ciphertext, not keys. Server-side encryption with a key Everloot holds is not
proposed: it would still let a breach or an insider read keys.

### The free allowance

Proposed, for Carlos to set (see Decisions): each signed-in account gets **100 questions a month and
at most 10 a day**, answered by an open-weight model Everloot hosts or rents (part 2). A visitor with
no account gets none. Cost to us at the assumptions in part 2: about $0.24 per account per month at
60 questions on gpt-oss-120b through Groq, so a full 100 questions is about $0.40.

Controls:

- **Quotas per account**, kept in a `usage_ledger` (tokens in and out, model, cost estimate). A
  question over quota gets a plain message and the BYO-key option, never a silent downgrade.
- **Per device and per IP:** the device-code endpoint, the sign-in endpoints and the ask endpoint have
  their own limits. In-game asks are also capped by the addon at 20 pending.
- **Size caps:** 4,000 characters per web message (500 in game, as today), at most 8 tool calls and
  1,000 output tokens per answer, and a history window of the last 20 messages sent to the model.
- **A global monthly budget.** When it is spent, the allowance pauses for everyone and the site says
  so. BYO keys keep working.
- **New accounts** start the allowance after the sign-in has existed for 24 hours. This is a speed
  bump, not a defence.
- **Read-only tools only.** The agent can call Everloot's MCP tools and nothing else: no web fetch, no
  code, no writes. Tool results and chat history are source material, not instructions. The system
  prompt says so and the result text is passed in delimited blocks.
- **Flags.** `accounts.flags` (platform spec part 7) can mark an account as limited or blocked. A
  blocked account's device tokens stop working.
- **The key owner pays.** On a BYO key, Everloot applies only the size caps and a polite rate limit.
  The settings page shows an estimated cost per question before the user turns a provider on.

## Part 2. Free open-weight inference for the community (longer term)

Carlos's idea: Everloot provides free inference on open-weight models, as other communities do. I did
not verify which other projects do this, so this spec does not cite any. What follows is what it would
cost and what is realistic.

### Assumptions (stated so they can be changed)

- One grounded question is 4 model calls (plan, two tool lookups, answer). Context grows each call.
  **Assumed 24,000 input tokens and 700 output tokens in total per question.** This is an estimate,
  not a measurement. The first week of the beta measures it, and every figure below scales with it.
- An active free user asks **60 questions a month**. Prompt caching is ignored, which makes the
  estimates high where a provider offers it.
- Cost per question is `24,000 x input price + 700 x output price`, per user is 60 times that.

### Hosted open-model APIs, per 1M tokens (read 2026-10-17)

| Provider and model | Input | Output | Per question | Per user a month | Source |
|---|---|---|---|---|---|
| Groq, gpt-oss-20b | $0.075 | $0.30 | $0.0020 | $0.12 | <https://console.groq.com/docs/models> |
| Groq, gpt-oss-120b | $0.15 | $0.60 | $0.0040 | $0.24 | same |
| Fireworks, gpt-oss-120b | $0.15 | $0.60 | $0.0040 | $0.24 | <https://docs.fireworks.ai/serverless/pricing> |
| Together, gpt-oss-120b | $0.15 | $0.60 | $0.0040 | $0.24 | <https://www.together.ai/pricing> |
| Cloudflare Workers AI, gpt-oss-120b | $0.35 | $0.75 | $0.0089 | $0.54 | <https://developers.cloudflare.com/workers-ai/platform/pricing/> |
| Cloudflare, gpt-oss-20b | $0.20 | $0.30 | $0.0050 | $0.30 | same |
| DeepInfra, Qwen3.5-9B | $0.10 | $0.15 | $0.0025 | $0.15 | <https://deepinfra.com/pricing> |
| DeepInfra, Qwen3.5-35B-A3B | $0.14 | $1.00 | $0.0041 | $0.25 | same |
| DeepInfra, gemma-4-26B-A4B-it | $0.07 | $0.34 | $0.0019 | $0.11 | same |

For comparison, the same load on a closed model: Gemini 2.5 Flash-Lite $0.16 per user, `gpt-6-luna`
$0.17, Grok 4.3 about $1.90, Claude Sonnet 5.5 $3.30, Claude Opus 5.5 $6.60. Closed models are
affordable as a BYO choice and not as a free allowance.

Free tiers do not fit a community service:

- **OpenRouter free models:** 50 requests a day per account, 1,000 after buying credits. Useful to a
  user on their own key, not to a shared service.
- **Groq:** the rate-limit page shows 1,000 requests and 200,000 tokens a day for the two gpt-oss
  models, but says these are the Developer plan base limits, not clearly the free plan's
  (<https://console.groq.com/docs/rate-limits>). At 24,000 tokens a question, 200,000 tokens is
  about 8 questions a day. Not a basis for a service.
- **Cloudflare Workers AI:** 10,000 neurons a day free, then $0.011 per 1,000. From the table above,
  one gpt-oss-120b question is about 810 neurons, so the free part covers roughly 12 questions a day
  for the whole project. My arithmetic from their published prices, not a number they state.
- **Groq's Llama rows say "contact sales," and Qwen on Groq is a preview model that "should not be
  used in production."** Both skipped.

### Self-hosted GPU (RunPod secure cloud on-demand, read 2026-10-17)

<https://www.runpod.io/pricing>: L40S $1.09 an hour, A100 80GB $1.79, H100 PCIe $2.89. Running all
month (730 hours) is about $796, $1,307 and $2,110. Against hosted gpt-oss-120b at $0.24 per user, an
A100 matches the hosted bill at about 5,400 active users, if one card can serve that many. Its
throughput for our workload is **unmeasured**. That gpt-oss-120b fits on one 80 GB card is from
memory, **unverified** (OpenAI's page returned 403). Self-hosting adds work: patching, scaling,
idle cost at night, and an outage at launch hour. **Do not self-host before the hosted bill is
several times the cost of a card**, and measure throughput on a rented card first.

### Which small open models are good enough

I did not run any benchmark, so I do not name a winner. Candidates available on at least one
provider above with current prices: gpt-oss-120b and gpt-oss-20b, the Qwen3.5 family, and Gemma 4.
Licences were not read for Qwen or Gemma; gpt-oss's licence is from memory. All are **unverified**
until read, and the licence goes in `docs/sources/LEDGER.md` before we serve one.

Grounded Q&A with tool calls needs: reliable tool calling over our 14 tools, answering only from
returned evidence, and saying "no evidence" when there is none. So the choice is made by a test, not
by reputation:

- A fixture set of 50 questions built from the sourced-answers fixtures, including questions with no
  evidence and questions that tempt the model to use Retail knowledge.
- Pass means: correct tool called with valid arguments, every claim in the answer traceable to a
  returned piece of evidence, and "no sourced answer" when the tool returns nothing.
- Run each candidate on the same fixtures and publish the table. The cheapest model that passes is the
  free model.

Before any hosted provider receives player questions, someone reads its data policy for retention and
training use. I did not read any of them. Our "never used for training" promise depends on this.

## Part 3. The site: `/chat`

- **Sessions.** A left rail of sessions, newest first, with search over titles and text. A session is
  a thread of messages.
- **Folders.** One level, no nesting in the first version. A built-in **In game** folder collects
  questions from `/ask`. Users create their own and move sessions between them.
- **Items.** Things a user keeps next to the conversations: a **note** (plain text), a **talent
  build** (share code, class, the game build it came from, a link to the builder page), a **raid
  comp** (share code from the raid builder) and a **saved answer** (a pinned message with its
  sources). Talent and raid items depend on the builders in the platform spec, parts 2 and 3. Before
  they exist, an item can hold a share code as text.
- **Grounded answers.** The agent loop calls Everloot's MCP tools, including `answer_sources`. Each
  answer has a **Sources** panel listing every piece of evidence the answer used: claim, kind
  (observed, lore, curated, reference), source link, licence and date. If a tool returns nothing, the
  answer says so, like the bridge's "No sourced answer found." An answer built from the model's own
  knowledge is labelled "not from Everloot data". This is a prompt rule and a display rule; I cannot
  promise a model never drifts, which is why the Sources panel is the check.
- **Model picker.** "Everloot free" (the allowance) or the user's own provider. Every message shows
  the model that wrote it.
- **Cost display.** The remaining allowance, and an estimated cost per question on a BYO key.
- **Accounts.** Signed-in only, using part 7's Battle.net and GitHub sign-in. A visitor sees an
  explanation and the open `/connect` page for using Everloot's MCP from their own assistant.

## Part 4. One account across site, companion and addon

### Linking the companion with a short code

This is the standard device authorization flow (RFC 8628,
<https://datatracker.ietf.org/doc/html/rfc8628>; I know it from memory and did not re-read it for
this spec). The companion has no browser, so the user finishes in one.

1. `companion link` calls `POST /api/device/code` and prints a code such as `K7QM-4TXD` and the
   address `everloot.app/link`. The request carries a device label (for example the computer's name).
2. The user opens `/link`, signs in if needed, types the code, and sees "Link *Carlos's PC* to your
   account? It will upload your `/ask` questions to your chat history and receive answers, notes and
   plans." The user confirms.
3. The companion polls `POST /api/device/token` every 5 seconds. On confirmation it receives a
   **device token** and stores it in its data folder, readable only by the user.
4. `/account` lists devices with last seen time and a **Revoke** button.

Rules: the code uses an alphabet without look-alikes (no 0, O, 1, I, L) and is 8 characters; it
expires in 10 minutes and works once; the secret `device_code` the companion polls with is a separate
256-bit value; wrong-code attempts are rate limited per IP and per account; the device token is stored
server-side only as a hash, like the API keys in part 7. The code endpoint and the poll endpoint have
their own rate limits.

The companion also reads the install id from the SavedVariables it already parses and tells the server
which install ids it carries, so questions asked in game are filed under the right account. **The
install id and the link between it and an account are never published.** Today, observations are public
without install ids (DATA_POLICY). This link table is private and never joins that data.

### Sign-in state in game

The addon cannot sign in and does not need to. It shows the account handle the companion wrote into
the chat file and "not linked" when there is none. Unlinking or revoking a device makes the next
companion sync write an empty chat file, so the content leaves the game folder too.

## Part 5. Data model

Postgres on Supabase, as for the other account tables. All ids are server-assigned ULIDs, except
in-game question ids, which keep today's `ask:<installId>:<n>` form. Every table has `created_at`.

| Table | Columns | Notes |
|---|---|---|
| `accounts`, `identities` | per platform spec part 7 | Nothing here adds columns. Limits use `flags` |
| `devices` | `id`, `account_id`, `label`, `token_hash`, `install_ids text[]`, `last_seen_at`, `revoked_at` | One row per linked companion |
| `device_codes` | `user_code`, `device_code_hash`, `label`, `expires_at`, `account_id null`, `used_at` | Short lived; swept hourly |
| `chat_folders` | `id`, `account_id`, `name`, `kind` (`custom` or `ingame`), `position` | The `ingame` folder is created with the account and cannot be deleted |
| `chat_threads` | `id`, `account_id`, `folder_id null`, `title`, `origin` (`web` or `game`), `updated_at`, `deleted_at null` | Title is generated from the first question and editable |
| `chat_messages` | `id`, `thread_id`, `role` (`user` or `assistant`), `body`, `model`, `evidence jsonb`, `tool_calls jsonb`, `ask_ref text null`, `tokens_in`, `tokens_out`, `created_at` | Immutable. `ask_ref` is the in-game id; `unique (account_id, ask_ref)` makes upload idempotent. `evidence` holds the pieces shown in the Sources panel, each with source URL, licence and date |
| `chat_items` | `id`, `account_id`, `folder_id null`, `kind` (`note`, `talent`, `raid`, `answer`), `title`, `body`, `code null`, `game_build null`, `source_message_id null`, `rev int`, `updated_at`, `deleted_at null` | `rev` goes up on every edit. `code` is a share code. A talent or raid item records the build it was made on |
| `usage_ledger` | `id`, `account_id`, `device_id null`, `surface` (`web`, `companion`, `game`), `model`, `tokens_in`, `tokens_out`, `cost_estimate_micros`, `source` (`allowance` or `byok`) | Token counts only, never text. BYO rows record counts the browser reports and are advisory |
| `chat_state` | `account_id`, `rev bigint` | One counter per account, bumped by any change, used by sync |

There is no table for provider keys. Provider choices (which provider, which model) are stored as a
small `settings` json on the account, with no secret in it.

## Part 6. Sync over the file bridge

Direction and owner of each file, so there is never a merge between two writers:

| File | Written by | When | Read by |
|---|---|---|---|
| `SavedVariables/Everloot.lua` (`EverlootDB`) | The game | `/reload`, logout | The companion |
| `Interface/AddOns/EverlootAnswers/*` | The companion only | Each sync, atomic temp file and rename | The addon, at load |

The addon never edits the companion's files and the companion never edits SavedVariables. Both sides
are replaced whole, so a half-synced state cannot exist.

### Upstream: game to account

The addon queues questions in `EverlootDB.asks` as it does today. The row gains one optional field,
`thread`, the id of a conversation to continue. The caps stay: 500 characters, 20 pending.

A sync cycle in the companion:

1. Read asks from SavedVariables (existing `readAsks`: bad ids, empty or oversize text skipped).
2. `POST /api/sync/up` with the device token, the install id, and the asks (id, question, askedAt,
   thread). A request is at most 20 asks and 64 KB.
3. The server files each ask as a user message in a thread in the **In game** folder, keyed by
   `ask_ref`. Sending the same ask again changes nothing, so retries are safe. The server clock is
   authoritative; `askedAt` is kept only as a hint.
4. Who answers: if the companion has a provider configured, it answers locally with the user's key, as
   today, and uploads the question and answer together with the model name. If it has none, the server
   answers under the free allowance. If neither is possible (over quota, offline), the user message is
   still saved, and the game shows "waiting".

### Downstream: account to game

5. `GET /api/sync/down?since=<rev>` returns changes. The companion rebuilds the whole chat file from
   the full current state of the newest conversations and items, not from a diff, so deletions apply.
6. It writes `EverlootChat.lua` into the same slot addon next to the existing answers file, so the
   existing answers contract keeps working untouched. The TOC lists both files.

Shape of the file (illustrative):

```lua
EverlootChatDB = {
  schema = 1, rev = 412, generatedAt = "2026-11-05T19:02:11Z",
  account = { handle = "Carlos" },            -- nil when not linked
  folders = { { id = "f1", name = "In game" }, ... },
  threads = { { id = "t1", folder = "f1", title = "...", updatedAt = "...",
    messages = { { id = "m1", role = "assistant", text = "...", model = "...",
      sources = { { title = "...", url = "everloot.app/..." } }, sum = 123456 } } } },
  items = { { id = "i1", kind = "talent", title = "...", code = "...", build = "...", rev = 3, sum = 654321 } },
  sum = 99887766,
}
```

Source URLs are shown as plain text the player can read or copy. The addon does not open links.

### Ids, checksums and caps

| Thing | Rule |
|---|---|
| Ids | ULID from the server; ask ids as today. Ids match `^[A-Za-z0-9:_-]{3,64}$`, the pattern the bridge already enforces |
| Record checksum | Adler-32 of the record's text (as `answers.ts` does), checked by the addon with the same Lua 5.1 arithmetic. It detects a damaged or half-written record. It does not stop tampering and is not meant to, because the file belongs to the player |
| File checksum | Adler-32 over the record checksums in order. Mismatch: the addon shows the previous content it still has and the line "chat file damaged, sync again" |
| Transport | HTTPS, plus a SHA-256 `etag` on each response; the companion refuses a body that does not match |
| Threads in file | newest 20, messages per thread newest 12 |
| Message text | 2,000 characters in game. Longer answers end with "Full answer on everloot.app/chat" as plain text |
| Sources per message | at most 3 |
| Items in file | newest 50, body 4,000 characters, share code 1,000 characters (talent string length in Forever is **unverified**) |
| Whole file | 200 KB. Oldest content is dropped first until it fits. The real limit in the client is **unverified**; 200 KB is a guess to test |
| Upload | 20 asks and 64 KB per request; 10 requests an hour per device |

### Text safety

Everything in the file is data, never code. Model and note text can contain anything. The companion
escapes every string as a Lua literal (`lua.ts`) and, new for chat, doubles each `|` so WoW's own
formatting codes (colours, hyperlinks, textures) cannot appear. The addon draws text into font
strings only. It does not turn text into links, and the long-standing contract test
(`addon/tests/answers_contract.py`) grows a case with hostile chat text.

### Conflict rules

- **Messages are immutable.** Nothing edits a message, so nothing conflicts. A regenerated answer is a
  new message.
- **Items:** the web is the only editor in the first version, so edits cannot collide. Each edit
  raises `rev`. If the in-game window ever creates notes, they arrive as new items with their own ids
  and never edit an existing one. Two web tabs editing one item: last write wins by `rev`, and the
  older tab is told it was out of date before it saves.
- **Deletes win.** A delete sets `deleted_at`. The next file leaves the record out, and a later sync
  never brings it back. Account deletion removes everything.
- **Two devices, one account:** each uploads its own asks, keyed by install id. Both files are built
  from the same account state, so they converge at the next sync.
- **Companion offline:** the last file stays in place and the window shows "synced N ago" from
  `generatedAt`. Pending questions stay in `EverlootDB.asks` until an answer arrives, as today.
- **Revoked or unlinked device:** the next sync (if it can reach the server) writes an empty file.
  A revoked device that cannot reach the server keeps its last file until it does. The revoke page
  says this.

### Writing while the game runs

The companion already writes the slot addon while the game is open, and the game reads it on
`/reload`. The chat file follows the same rule. Nothing the companion writes changes what is on screen
until the player reloads, and the window says so.

## Part 7. The in-game chat window

A window opened by `/everloot chat` (not `/chat`, which would clash with the game's own chat commands). Parts, in order of build:

1. **List.** Folders and threads, newest first, with an unread mark for threads that changed since
   the last time the player opened them. The unread state lives in `EverlootDB.seen` and needs no
   network.
2. **Transcript.** The selected thread's messages with the model name and up to three sources under
   each answer.
3. **Items.** Notes and plans. A talent or raid item shows its code in a selectable box with the game
   build it was made on. A banner warns when that build is older than the one the player runs.
4. **Ask box.** The player types a question and presses Enter. It is added to `EverlootDB.asks`
   exactly as `/ask` does it, and the window shows it as "queued: the companion answers it, then
   `/reload`". Optionally attaches to the open thread via `thread`.
5. **Status line.** "Synced 14 min ago", "Not linked", or "Chat file damaged."

All of this is frames and font strings. No protected actions, no secure templates, no network. Not
built yet; every in-game behaviour here is **unverified** until the beta session.

## Privacy

- **Private by default.** Chat content, notes and items belong to the account holder. They are not
  part of Everloot's public CC BY-SA data, are never published, never added to the knowledge release
  and never shown to other users. There are no public chat links in the first version. A share link
  would be its own decision and its own spec.
- **Nothing is used for training**, by Everloot or, as far as we control it, by a provider. For the
  free allowance this depends on the hosted provider's terms, which are not yet read (part 2); we do
  not choose a provider that trains on API traffic or cannot say. On a user's own key, the provider's
  terms apply to them, and the settings page shows each provider's policy link next to its toggle. The
  Gemini free tier is excluded as a default because Google may use that content and let humans read it.
- **What Everloot stores about chats:** the messages, items and folders above, plus token counts in the
  ledger. Provider keys: none.
- **What leaves the machine from the companion:** nothing new until the user links a device. The link
  screen names what will be sent: the user's `/ask` text and install id. This adds a category to the
  companion's rules in `docs/DATA_POLICY.md`, which says the companion today sends only anonymous
  open-world events. That page and `/privacy` are updated before the link feature ships. This spec
  does not edit them.
- **Retention (proposed):** conversations stay until the user deletes them. Deleting a thread, item or
  folder removes it from the database at once and from backups within 30 days. Deleting the account
  deletes everything, including device tokens. The ledger keeps token counts for 90 days, with no text.
  The backup schedule depends on the Supabase plan and is **unverified**.
- **Don't paste secrets.** The ask box says: don't paste passwords, keys or personal details.
  Everloot does not want identifiable health information or anything like it in chat; if one is
  pasted, the user can delete it and we do not read chats.
- **We do not read chats.** Support looks at counts and errors. Looking at content needs the user's
  request.

## Phases

Today is 2026-10-17 and launch is 2026-11-04. Accounts (platform spec part 7) and `answer_sources` are
prerequisites and are not built yet, so the first phase is a candidate, not a promise.

| Phase | What | Needs first | Could be 11/04? |
|---|---|---|---|
| 1 | Web chat core: sign-in, sessions and history, Sources panel, the free allowance on one hosted open model, BYO key in the browser for Anthropic and OpenAI-compatible, quotas and abuse controls | Part 7 accounts, `answer_sources`, a model chosen by the eval, a provider's data terms read | Only if accounts and `answer_sources` land by about 10/28. Otherwise week after |
| 2 | Device-code link, upload of in-game asks into the **In game** folder, `/account` device list and revoke. No addon change: the addon is unchanged | Phase 1; updated DATA_POLICY and `/privacy` | After launch |
| 3 | Answers, notes and plans flow back: `EverlootChat.lua`, then the in-game chat window (addon 0.3) | Phase 2; beta session checks of the client limits | After |
| 4 | Folders and items (notes, talent and raid items, saved answers) | Platform spec parts 2 and 3 for real share codes | After; notes and folders alone could join phase 1 |
| 5 | Gemini as BYO, an Ollama relay for web chat through the companion, synced encrypted keys if wanted | Provider checks; a decision | Later |
| 6 | Self-hosted inference | A hosted bill several times the cost of a card; measured throughput | Later |

## Tests

- Companion: device flow (expired code, reused code, wrong code, slow poll, revoke), idempotent
  upload (same ask twice), the 20-ask and 64 KB caps, atomic file writes.
- Chat file: Lua 5.1 contract test (extends `answers_contract.py`) with hostile text, `|` codes,
  oversize records, a bad record checksum and a bad file checksum. The addon shows the rest and names
  the damaged part.
- Server: quotas (daily, monthly, global breaker), the per-device and per-IP limits, a blocked account,
  deletion cascades, and that no table or log holds a provider key or message text in the ledger.
- Grounding: the 50-question fixture run above, plus a prompt-injection fixture where a tool result
  says "ignore your instructions". The answer must ignore it.
- Browser: a key is never present in any request to everloot.app (a network test that fails on it).

## Decisions for Carlos

1. **Subscriptions.** Confirm we do not build "Sign in with Claude" or ChatGPT sign-in, and that this
   spec supersedes rows 3 and 4 in section 6.4 of the 2026-09-27 companion design. I will amend that
   file in a separate change if you agree.
2. **Allowance.** Is 100 questions a month and 10 a day right? Visitors without an account get none?
   What monthly budget stops the allowance for everyone?
3. **Free model.** Pick after the 50-question eval and after someone reads the data terms of the short
   list (Groq, Fireworks, Together, Cloudflare, DeepInfra). My lean is gpt-oss-120b on one hosted
   provider with a second as backup, but I have not tested it.
4. **Keys.** Browser and companion only (recommended), or also synced as ciphertext later?
5. **Launch.** Is phase 1 worth pulling toward 11/04 if accounts land, or does chat wait until after
   launch so accounts and `answer_sources` get the time?
6. **Sign-in required.** Chat for signed-in accounts only, or a tiny guest allowance?
7. **Gemini.** List it as a BYO option despite the age and region terms, or leave it out?
8. **In-game notes.** Display-only in the first window, or let the player type notes in game later?
9. **Privacy copy.** Approve the retention proposal (delete at once, backups within 30 days, ledger
   90 days) and the wording of the link screen.
10. **Default BYO Anthropic model.** The companion defaults to Opus 5.5 (about $0.11 a question at my
    assumptions). Make the chat default Sonnet 5.5 (about $0.055)?

## Out of scope

Scraping or caching any other site; any paid plan or price (platform spec part 7 owns that, and
nothing here changes it); public chat sharing; voice; images; an agent that takes actions in the game
or on the site; storing or relaying a consumer-subscription credential; a mobile app.

## Sources read, with what failed

Read 2026-10-17: the Anthropic, OpenAI developer, Google, xAI, OpenRouter, Groq, Together, Fireworks,
DeepInfra, Cloudflare, RunPod and Ollama pages linked above. Returned HTTP 403 to me, so unverified
from the primary page: OpenAI's Terms of Use, Service Terms, Sign in with ChatGPT terms, API pricing
page and gpt-oss announcement; xAI's terms of service. Groq's marketing pricing page showed no
numbers; prices come from its models page. Secondary sources (search summaries) are used only where
marked unverified.
