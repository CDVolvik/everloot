# Everloot Desktop App: the companion as an installable app

**Date:** 2026-10-18
**Status:** built overnight on branch `t3/everloot-desktop-app` for Carlos's review. Decisions he
has not made are listed at the end; the build takes the stated default for each and nothing in it is
hard to change.

## Why

The companion is a Node command line (`companion/`). It works, but a player has to install Node,
install two packages, find the `Everloot.lua` path and keep a terminal open while playing. Raider.IO
ships a desktop client for exactly this job (keep the addon's data fresh without the player doing
anything), and that is what players expect. Everloot Desktop App is that client: install it, point it at
the game once, and it uploads after every logout, keeps market prices in the tooltips and answers
`/ask`, from the system tray.

It adds no new data path. Everything it sends and writes is what the command line already sends and
writes, under the same rules in `docs/DATA_POLICY.md`.

## What exists

| Piece | State on `main` |
|---|---|
| Uploader | `companion/src/uploader.ts`, `sent-state.ts`: anonymous events only, confirmed ids kept in `sent.json` |
| Prices | `companion/src/prices.ts`: realms from the player's own scans, `EverlootPrices` slot addon |
| `/ask` bridge | `companion/src/bridge/`: asks from SavedVariables, answers into `EverlootAnswers`, optional providers from `config.json` |
| Game folder | `companion/src/savedvariables.ts` finds every account's file under one product folder |
| Installer | None. `README.md` says "There is no signed installer yet" |

## Approaches considered

1. **Electron, reusing `companion/src` as is (chosen).** The companion is TypeScript on Node and
   imports the site's parser from `web/src/lib`. Electron's main process is Node, so the app bundles
   those modules unchanged and nothing is rewritten. Cost: a 100 MB install and Chromium's memory
   while it runs. electron-builder makes the Windows installer, the macOS disk image and the Linux
   AppImage on GitHub's free runners.
2. **Tauri.** A 10 MB install, but its backend is Rust. The parser, batching, Lua escaping and the
   providers would be rewritten in Rust or run in a bundled Node sidecar, which is Electron's weight
   without its tooling. Not worth it for a tray app.
3. **A single-file Node binary with no window.** Smallest change, but no setup screen, no consent
   screen and no tray; the player still edits paths by hand. This is the command line with a new
   name.

## Design

### One package, `desktop/`

```
desktop/
  package.json          electron, electron-builder, esbuild, vitest
  build/                app icon (made from web/src/app/icon.svg) and tray icons
  src/main/             Node side: settings, game folder detection, the engine, tray, IPC
  src/preload.ts        the only bridge the window can call (contextIsolation on, nodeIntegration off)
  src/renderer/         one HTML page, the site's colours, no framework
  test/                 vitest, no Electron and no network
```

esbuild bundles `src/main` (with `companion/src` and `web/src/lib`) into `dist/main.cjs`, the
preload into `dist/preload.cjs` and the page into `dist/renderer/`. The packaged app carries only
`dist/`; no `node_modules` ships. The companion's command line stays as it is for anyone who prefers
it, and both read and write the same data folder (`%APPDATA%\Everloot`, `~/Library/Application
Support/Everloot`, `~/.config/everloot`), so a player can switch between them without resending.

### Modules on the Node side

| Module | What it does | Depends on |
|---|---|---|
| `settings.ts` | `settings.json` in the data folder: game folder, endpoint, the three switches (upload, prices, ask), the `/ask` MCP URL and token file path, consent date, launch at login, start in tray. Atomic write (temp file and rename). Unknown keys are dropped; a bad file is reported and defaults are used | `node:fs` |
| `game-folder.ts` | Finds product folders (`_classic_era_`, `_anniversary_`, `_classic_beta_`, ...) under the usual install locations on each OS and ranks the ones that already hold an `Everloot.lua`. Pure: takes a small file-system interface so tests pass a fake one | `companion/src/savedvariables.ts` |
| `engine.ts` | Runs the three jobs from settings: watch each `Everloot.lua`, upload after the write settles (5 s), refresh prices after each upload and every hour, answer asks after the file settles (2 s). Keeps the last 200 log lines and a status per job (`idle`, `running`, `ok`, `error`, with the message and time). `runNow(job)`, `restart(settings)`, `stop()`. Every job function is injected, so tests run it without the network | `companion/src/*` through injection |
| `updates.ts` | "Check for updates" reads the newest `desktop-v*` release on GitHub and returns its version and page. The same check runs once at start and, when a newer release exists, is a line on the Overview and an entry in the tray menu, never a notification. It never downloads or installs; the player opens the page. Unsigned builds and auto-install do not mix | `fetch` |
| `market.ts` | Realm picks: the player's scanned realms plus the followed ones, no duplicates, at most 20; fetches each from the site and writes the prices file through the companion's own writer | `companion/src/prices.ts` |
| `inspect.ts` | What a save file holds, as counts: records per kind, pending asks, scanned realms, confirmed events from `sent.json`. Never the records themselves. Also which realms have a full scan older than a day, and the one-line reminder the tray shows for them | `web/src/lib/sv-parse.ts` |
| `addon.ts` | Installed version from the TOC, the newest release with a given tag prefix, and the install: only regular files under `Everloot/` from the zip (no `..`, no absolute paths), written to `Everloot.new` and swapped in whole after the sha256 matches the release's `SHA256SUMS` | `fflate` |
| `changes.ts` | The change tracker's RSS feed as a list: title, https link, date, plain-text summary | `fetch` |
| `backups.ts` | After each upload, a dated copy of the account's `Everloot.lua` under `backups/`, the newest ten per account. A failed backup never fails the upload. Restore copies one back over the watched file of the same account after a native confirm, backing up the current file first; only files inside `backups/` are accepted | `node:fs` |
| `tray.ts` | The menu: status of each job, a scan reminder when a realm is stale (opens the Market page), the desktop update when one exists (opens the release page), Upload now, Refresh prices, Open window, Pause, Quit. The two notifications open Ask and Addon when clicked | Electron |
| `local-tools.ts` | Tools the chat model can call beside the MCP server's, over the player's own save files: `my_characters` (gold now, peak and the week's earned and spent, item level and slots, level, class, achievements, reputations, titles) `my_realm_scans` (each realm's last full scan with its age, the followed realms) and `my_app_status` (the game folder and files watched, each job's switch and last result or error, the installed addon version, the release check, the last five error lines of the log). No arguments, text out, each result ending in `Source: this computer (...)` so the page lists it like any other source; paths and log lines go through `hideHome` first, as Copy diagnostics does, since the text reaches the provider. Scans are one entry per realm across account files, the newest winning (`newestScans`), the same list the Market page shows. They read through the same functions the Characters, Market and Overview pages use; nothing leaves the machine through them | `characters.ts`, `inspect.ts`, `engine.ts`, `addon.ts` |
| `json-file.ts` | JSON from a file the player may edit by hand (`settings.json`, `config.json`, `chat.json`, `window.json`), with the byte order mark Notepad and some editors add dropped first; without this a hand-edited `settings.json` fell back to the defaults and `config.json` to an error | `node:fs` |
| `renderer/format.ts` | The renderer's text helpers without the DOM: escaping, gold from copper, sizes, ages, the IPC error reason, job status text, the gold sparkline | none |
| `window-state.ts` | The window's last size and place in `window.json`, written a moment after the last drag and on close. On open the size is clamped to the minimum and the largest display, and the place is kept only when enough of the window would still be on a connected display; otherwise Electron centers it | `node:fs` |
| `index.ts` | Single instance, the window, the tray, IPC handlers, close-to-tray, launch at login. The release checks run at start, after the first Start, and once a day after that (the addon notice once per version). An unhandled rejection or exception becomes a line on the Log page instead of a dialog | everything above |

### The window

One page with a sidebar, compact (13 px type, tight rows, one accent), the site's tokens
(`web/src/design/tokens.ts`) copied into the stylesheet with the same names, dark by default and
light with the system setting, Geist where installed and the system font otherwise. Carlos asked
for the shape of Claude Code's desktop app: a left rail, sharp and dense, not bulky.

**Welcome (first run)** takes the whole window: the notice the command line prints
(`uploadNotice()`: CC BY-SA 4.0, source link), what the app sends (anonymous events only) and what
stays (named data, installed addons), the detected game folders to pick from or a Browse button,
and one **Start** button. Nothing runs before Start; it records the consent date.

After that, the rail lists the pages, with a status dot beside the three jobs:

| Page | What it shows and does | Reads |
|---|---|---|
| Overview | Four states at a glance (upload, prices, `/ask`, addon installed against latest), recent activity with Upload now and Refresh prices, the five latest changes | engine state, `addonInfo`, `changes` |
| Chat | The agent on the player's computer (agent-chat spec, the companion surface, without accounts). The first provider in `config.json` runs a tool-use loop over every tool the MCP server lists plus the three local tools (`local-tools.ts`; a local name wins a clash; the system prompt says `my_` tools read the player's own files), at most eight rounds: Anthropic's API through its SDK, or any OpenAI-compatible endpoint with function calling (OpenRouter, OpenCode Zen, a local Ollama, a server of the player's own), the same loop in that API's shape (`agent.ts`). The answer cites the `Source:` lines the tools returned; when the tools have nothing the model may answer from its own knowledge, prefixed "From general knowledge, not Everloot's data:", and the page marks it as unsourced. No provider shows the sourced hits verbatim. The MCP target is the token endpoint when a token file is set, else the site's public read-only mount. Tool results are treated as data; the system prompt says so. Transcript in `chat.json`, private, at most 100 messages. An empty thread shows starter questions as chips (two about the game; three about the player's own data when a model is set, since plain search cannot call the local tools); a failed job on the Overview and the Log page carries an "ask why" button that opens Chat and sends the failure with the app's message, so the model reads `my_app_status` and explains. One `sendChat` path serves the form and the chips. The provider picker (`shared/providers.ts` for the presets, `providers.ts` for the writes) offers Anthropic, OpenRouter, OpenCode Zen (only its zero-retention free models), Ollama and a custom server, each with a curated model list or a typed id; the key goes into its own file in the data folder and one marked entry goes to the front of `config.json`, so the in-game `/ask` bridge uses the same pick. The key never returns to the page, a paste of the wrong shape is refused, Remove deletes the marked entry and its file and leaves hand-written entries alone. Consumer sign-ins (Claude.ai, ChatGPT) are not offered: both companies permit API keys in third-party apps and forbid their subscription credentials there | `chatInfo`, `chatSend`, `chatClear`, `chatSetProvider`, `chatRemoveProvider` (`agent.ts`, `chat.ts`) |
| Characters | The Raider.IO-shaped view, local only: gold with a sparkline of every dated snapshot (thinned to sixty points), peak, item level, the last seven days as earned, spent and net, money earned and spent per named character; achievements, reputations, titles and quests per opaque character key (the addon never writes a name on those rows). Nothing here is uploaded from the app | `charactersInfo` (`characters.ts`) |
| Upload | The switch and Run now; each account file with its write time and size, addon and client build, records per kind, confirmed count from `sent.json`. Nothing here leaves the machine | `uploadInfo` (`inspect.ts`) |
| Market | The switch and Refresh now; realm picks: the realms in the player's own scans are always carried, and the realms the site has public values for can be ticked (what TSM calls realm picks, on Everloot's own scan data; the clean-room decision of 2026-10-17 stands). A realm can also be typed. What the last refresh wrote, per realm | `marketInfo` (`market.ts`), `settings.market.realms` |
| Ask | The switch and Answer now; MCP URL and token file; who answers (providers from `config.json`, or plain search); questions pending in game; the last answers | `askInfo` |
| Addon | Installed version from the TOC against the newest `addon-v*` release; Install, Update or Reinstall, which downloads the zip from the site, checks it against the release's `SHA256SUMS`, and swaps `Interface/AddOns/Everloot` whole; the slot addons' presence | `addonInfo`, `installAddon` (`addon.ts`) |
| Changes | The site's change tracker, from its RSS feed | `changes` (`changes.ts`) |
| Log | The session log, with Pause. Copy diagnostics puts version, platform, settings (the token file path, never the token), watched files, each job's last state and the last hundred lines on the clipboard with the user folder hidden (`shared/diagnostics.ts`) | engine state |
| Settings | Game folder, site, launch at login, start in tray, data folder, check for updates, about | settings |
| Site tools | Talent calculator, raid builder, database, auction prices, world map, lore archive: the site's own pages in one embedded browser view (`WebContentsView`, sandboxed, no preload) under the rail and a small header with Back, Reload and open-in-browser. Navigation stays on the site's origin; any other link opens outside. Nothing is re-implemented, so the tools stay one codebase with the web | `siteShow`, `siteHide`, `siteBack`, `siteReload` (`site-views.ts`) |

The app's own pages never show an ad, a plan or a donation request, as the addon does not. The
embedded view sends Chromium's user agent plus an `EverlootDesktopApp/<version>` token
(`site-views.ts`), so the site can leave its ad units out when it is inside the app: AdSense does
not allow its ads inside a desktop application, and that keeps the account clean. Until the site
reads the token (a site-lane change in `AdSlot`), the embedded pages are the site as it is.

### What the page can call

`preload.ts` exposes one object, `window.everloot`: `state()`, `saveSettings(patch)`,
`detectGameFolders()`, `pickGameFolder()`, `pickTokenFile()`, `runNow(job)`, `setPaused()`,
`openDataFolder()`, `openConfig()`, `openExternal(url)` (only `https:` and only hosts the app
names), `checkForUpdates()`, the page readers `uploadInfo()`, `marketInfo()`, `askInfo()`,
`addonInfo()`, `changes()`, the one writer `installAddon(version)`, and `onState(listener)`.
Nothing else from Node reaches the page. Network answers (releases, realms, the feed) are cached
on the Node side for ten to fifteen minutes so opening a page twice does not ask the site twice.

### Error handling

- A missing or unreadable game folder: the engine idles and Home says so, with a Settings link.
- An upload failure keeps the events for next time (`sent.json` records only confirmed ids, as
  today). A prices failure keeps the previous file (`prices.ts` already does). A bridge failure
  leaves the ask pending.
- A second instance focuses the first.
- A bad `settings.json` is reported in the log and replaced with defaults on the next save, never
  silently rewritten.

## Release

- Tag `desktop-vX.Y.Z`, which must match `desktop/package.json`. A workflow builds on Windows,
  macOS and Ubuntu runners, runs the tests, packs with electron-builder, writes `SHA256SUMS`, and
  publishes a GitHub release with the artifacts, like `release.yml` does for the addon.
- Windows: NSIS installer and a portable exe. macOS: disk image. Linux: AppImage. All unsigned
  for the first releases (decided 2026-10-18); Windows shows the SmartScreen notice and macOS
  needs a right-click Open. The README says so.
- `checks.yml` gains the desktop package: `npm ci`, tests, typecheck and the esbuild build. It does
  not pack an installer on every pull request.

## Testing

- `settings.test.ts`: defaults, round trip, unknown keys dropped, a corrupt file reported.
- `game-folder.test.ts`: a fake tree with several product folders, ranking, each OS's roots.
- `engine.test.ts`: fake timers; a burst of writes runs one upload; prices run after an upload and on
  the hour; an ask write runs the bridge; a failing job records the error and the others keep going;
  `restart` with the upload switch off stops watching.
- `updates.test.ts`: picks the newest `desktop-v*` tag, ignores addon tags and pre-releases.
- `characters.test.ts`: gold history in order and a seven-day window on money events; a long
  history thins to sixty points keeping the first and the last.
- `diagnostics.test.ts`: the report carries settings without the token and the last hundred lines;
  home folders on Windows, macOS and Linux collapse to `~`.
- `providers.test.ts`: each preset's key file and the config entry the companion loads; switching
  providers replaces the entry and drops the old key file; a custom server; other entries and
  settings survive; the pre-marker Anthropic entry still counts as the app's; remove deletes only
  its own entry; bad pastes write nothing; the OpenCode list is zero-retention only.
- `agent.test.ts`: sources from tool text; config entries without keys; plain search; the Anthropic
  loop with a fake client; the OpenAI-compatible loop with a fake fetch (tool schema, bearer key,
  the tool-call and tool messages, the error with the server's message, a 200 carrying an error
  body, tool arguments that are not JSON sent back to the model); a local tool offered first in
  the tool list, run without the MCP client, its source on the answer.
- `local-tools.test.ts`: gold as g/s/c; the characters text with the week's net, gear and
  progress; the empty case says so; scan ages as dates and ages with the followed realms; the
  status text line by line (a failed job with its message, a switch turned off, the newer
  release) with the user folder hidden in the game folder and the log lines, and the bare case
  (no game folder, paused, no addon, no check, no errors); every tool takes no arguments and
  carries the `my_` prefix.
- `inspect.test.ts`: a realm scanned from two account files listed once with its newest scan; stale realms are the ones older than a day or undated, oldest first; the
  reminder names the oldest and counts the rest.
- `backups.test.ts`: dated copies, ten per account; restore replaces the live file and keeps the
  replaced one as the newest backup; refuses paths outside `backups/` and unwatched accounts.
- `chat.test.ts` (the agent mocked): the transcript persists and keeps the newest hundred; an empty
  question and a question while busy do nothing; a failed answer keeps the question and the error;
  the public mount without a token and the token endpoint with one; the mode line per provider.
- `jobs.test.ts`: the watcher reports a write and stops; a missing path does not throw; the ask
  job refuses a missing, unreadable or empty token file.
- `format.test.ts`: gold, sizes and ages; the IPC error's reason; status text per state; the
  sparkline needs two points, spans the box, escapes its dates and sits mid-box when flat.
- `settings.test.ts` and `chat.test.ts` also load a `settings.json` and a `config.json` saved with a
  byte order mark.
- `window-state.test.ts`: default size without a file; a place on a connected display is kept, one
  on a display that is gone is dropped; size clamped to the minimum and the largest display;
  `window.json` round-trips and survives junk.
- `preload` allow-list: `openExternal` refuses anything but `https:` on named hosts.
- Manual, before a release: install on Windows, first run, play, log out, see the upload in the log
  and the prices after `/reload`.

## Out of scope

Accounts, the device-code link and chat sync (`2026-10-18-agent-chat-design.md`, phases 2 and 3):
they need the account tables that are not built. The Chat page is that spec's companion surface
without an account: local transcript, the player's own key or the public mount, no server-side
allowance. The app is designed so the link flow is one more
job in the engine and one more screen when that lands. Auto-install of updates. Code signing. A
Linux package beyond AppImage. Any change to the addon.

## Decisions

Carlos decided on 2026-10-18; the two open ones are marked.

1. **Electron** stays. The parser, batching and Lua escaping are one TypeScript codebase shared
   with the site; Tauri would mean a second parser in Rust to keep in step, or a Node sidecar that
   gives most of the size back. The Node side is behind `engine.ts`, so a smaller shell later does
   not touch the jobs. Revisit if players complain about the 108 MB install or idle memory.
2. **Name:** "Everloot Desktop App" (window, tray, installer, release titles); artifacts
   `Everloot-DesktopApp-<version>-<os>-<arch>`. Folder `desktop/`, tags `desktop-v*`, app id
   `app.everloot.desktop` and the shared data folder stay.
3. **Signing:** unsigned for the first releases; the README says what Windows and macOS show.
4. **Where it is offered:** like Raider.IO, a button in the site's header ("Get App & AddOn") to
   one page, `/addon`, with the addon zip and the app downloads side by side. Site lane, after the
   first `desktop-v*` release exists.
5. **Ads:** the site drops ad units when the user agent carries `EverlootDesktopApp/`; the app
   already sends it. Where ads go on the site itself (header leaderboard, right rail, below tools,
   as Wowhead, Raider.IO and Icy Veins place them) is the site lane's call, not the app's.
6. **Providers:** bring your own key from any provider on the market, with free models where a
   provider offers them, and the same pick serving the in-game `/ask`. Built as the provider picker
   above. Consumer sign-ins are out (Anthropic's and OpenAI's terms); a hosted free allowance paid
   by Everloot is the agent-chat spec's phase 2, needing accounts, not the app. With an Anthropic
   key the app defaults to `claude-sonnet-5-5` and writes the model into the entry, so the bridge
   uses the same one. Which cheap model answers well with the tools is the agent-chat spec's
   50-question eval, still to run; until then the lists are priced and tool-capable, not ranked.
7. **Open: the sale-rate figure** on the Characters page is an estimate from scan history; keep it,
   or wait for an in-addon price API.
