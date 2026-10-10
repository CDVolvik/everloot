# Everloot companion

Desktop side of the addon, per the 2026-09-27 design (Part 3). Node/TypeScript core, chosen
2026-10-09. This first slice is the **uploader**; the file bridge for `/ask`, provider adapters and
memory come later. A signed installer is a separate owner step.

```
npm install
npx tsx src/cli.ts upload --file "<WoW>/WTF/Account/<ACCOUNT>/SavedVariables/Everloot.lua"
npx tsx src/cli.ts watch --game "<World of Warcraft folder>"
```

- Sends only events the site has not confirmed (`sent.json` in the app data folder:
  `%APPDATA%\Everloot`, `~/Library/Application Support/Everloot`, or `~/.config/everloot`).
- Named data (guild, gear, gold, collection) never leaves the machine from here; share it on the
  website with a verified grant.
- Reuses the site's parser and batching (`web/src/lib/sv-parse.ts`, `upload-batches.ts`), so
  `web` must be installed too. `--endpoint` targets another deployment; `--state` another state file.
- It only reads the file the game writes. It never touches the game client.

## /ask bridge (file bridge, per the design's public-build rule)

```
npx tsx src/cli.ts bridge --game "<World of Warcraft folder>" --mcp https://<host>/mcp --token-file <file>
```

The addon stores `/ask` questions in SavedVariables (written at logout or `/reload`). The bridge
answers new ones from the Everloot MCP server's `search_knowledge` and writes them into the
`EverlootAnswers` slot addon under `Interface/AddOns`; they show after the next `/reload`.

- Every string is a Lua-escaped literal (`src/bridge/lua.ts`); `addon/tests/answers_contract.py`
  loads the golden file in real Lua 5.1 and proves hostile text stays data.
- Each answer carries an Adler-32 `sum` the addon can verify with Lua 5.1 arithmetic.
- No source, no answer: an unsourced search result is reported as "No sourced answer found."
- The token is read from a file, never passed on the command line.
- With no providers configured, answers are the top search hit. With providers, the bridge
  passes the top three hits to a model, which writes at most two sentences from those
  sources only, named "(answered by <model>)". No source means no model call.

### Providers (design sections 6.4–6.5)

`config.json` sits next to `sent.json` in the companion's data folder. Providers are tried in
order and fall through only on auth, billing, rate-limit, timeout or server errors, never on
answer quality. Keys are read from files (`apiKeyFile`); a key written inside the config is refused.

```json
{ "providers": [
  { "type": "openai-compatible", "baseUrl": "http://127.0.0.1:11434/v1", "model": "gemma4:12b" },
  { "type": "anthropic", "apiKeyFile": "C:/Users/<you>/keys/anthropic.txt" }
] }
```

- `openai-compatible` covers DeepSeek, OpenRouter and a local Ollama (no key needed locally).
- `anthropic` uses the official SDK, `claude-opus-5-5` unless `model` is set, at low effort,
  with server-side refusal fallback turned on. Calls bill the user's own key.
- The addon side (`/ask` command, reading `EverlootAnswersDB`) is not built yet.
