# Everloot Desktop: the companion as an installable app

**Date:** 2026-10-18
**Status:** built overnight on branch `t3/everloot-desktop-app` for Carlos's review. Decisions he
has not made are listed at the end; the build takes the stated default for each and nothing in it is
hard to change.

## Why

The companion is a Node command line (`companion/`). It works, but a player has to install Node,
install two packages, find the `Everloot.lua` path and keep a terminal open while playing. Raider.IO
ships a desktop client for exactly this job (keep the addon's data fresh without the player doing
anything), and that is what players expect. Everloot Desktop is that client: install it, point it at
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
| `index.ts` | Single instance, the window, the tray, IPC handlers, close-to-tray, launch at login | everything above |

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
| Chat | The agent on the player's computer (agent-chat spec, the companion surface, without accounts). Three modes from `config.json`: an Anthropic key runs a tool-use loop over every tool the MCP server lists, at most eight rounds, and the answer cites the `Source:` lines the tools returned; another provider gets the top five search hits and phrases a short answer; no provider shows the sourced hits verbatim. The MCP target is the token endpoint when a token file is set, else the site's public read-only mount. Tool results are treated as data; the system prompt says so. Transcript in `chat.json`, private, at most 100 messages. "Use my key" writes an Anthropic key to `anthropic.key` in the data folder and one anthropic entry in `config.json` (`providers.ts`); the key never returns to the page, a paste that is not `sk-ant-…` is refused, Remove deletes both | `chatInfo`, `chatSend`, `chatClear` (`agent.ts`, `chat.ts`) |
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
embedded site tools are the site as it is, AdSense units included, exactly as in a browser; whether
the app should ask the site for an ad-free view is a decision for Carlos (below).

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
  until Carlos decides on signing (an open ask in `_ACTIVE_WORK.md`); Windows shows the SmartScreen
  notice and macOS needs a right-click Open. The README says so.
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
- `providers.test.ts`: the key file and the config entry the companion loads; other entries and
  settings survive; a second save replaces; remove deletes only its own entry; a bad paste writes
  nothing.
- `inspect.test.ts`: stale realms are the ones older than a day or undated, oldest first; the
  reminder names the oldest and counts the rest.
- `backups.test.ts`: dated copies, ten per account; restore replaces the live file and keeps the
  replaced one as the newest backup; refuses paths outside `backups/` and unwatched accounts.
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

## Decisions for Carlos

1. **Electron** over Tauri, for reuse of the existing TypeScript (above). Say if the install size
   matters more.
2. **Name and folder:** "Everloot Desktop", repository folder `desktop/`, releases tagged
   `desktop-v*`, data folder shared with the command line.
3. **Signing:** unsigned for now, with the notice in the README and on the download page.
4. **Where it is offered:** a card on `/upload` beside the addon download once the first release
   exists. Not built here; the site is another lane.
5. **Ads inside the embedded tools:** leave the site as it is in the app (today), or have the site
   drop ad units when the app's view asks for it (a site change, and an AdSense policy question).
6. **Chat default model on an Anthropic key:** `claude-sonnet-5-5` in the app (the in-game `/ask`
   bridge keeps `claude-opus-5-5` from the companion). Say if both should match.
