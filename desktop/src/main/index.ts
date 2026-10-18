import { BrowserWindow, Notification, app, dialog, ipcMain, shell } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readAsks } from "../../../companion/src/bridge/asks";
import { loadProviders } from "../../../companion/src/providers/config";
import type { AddonInfo, AppState, AskInfo, Job, MarketInfo, Settings } from "../shared/types";
import { JOBS } from "../shared/types";
import { compareVersions, installAddon, installedAddonVersion, newestRelease, slotAddons } from "./addon";
import { fetchChanges } from "./changes";
import { charactersFromFiles } from "./characters";
import { createChat } from "./chat";
import { createEngine } from "./engine";
import { allowedExternal } from "./external";
import { candidateRoots, detectGameFolders, realFs } from "./game-folder";
import { summarizeFiles } from "./inspect";
import { companionJobs } from "./jobs";
import { listRealms, ownRealms } from "./market";
import { loadSettings, mergeSettings, saveSettings } from "./settings";
import { SITE_TOOLS, createSiteViews, siteToolPath } from "./site-views";
import { createTray } from "./tray";
import { checkForUpdates, fetchReleases } from "./updates";

/** The same folder the command line uses (`companion/src/cli.ts` defaultStatePath), so both share sent.json. */
function dataFolder(): string {
  // EVERLOOT_DATA_DIR points a development run at a scratch folder instead of the real one.
  if (process.env.EVERLOOT_DATA_DIR) return process.env.EVERLOOT_DATA_DIR;
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Everloot");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Everloot");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "everloot");
}

/** Remembers one network answer for a while, so opening a page twice does not ask the site twice. */
function cached<T>(ms: number, load: () => Promise<T>): () => Promise<T> {
  let value: { at: number; data: T } | null = null;
  return async () => {
    if (value && Date.now() - value.at < ms) return value.data;
    const data = await load();
    value = { at: Date.now(), data };
    return data;
  };
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const data = dataFolder();
  const settingsPath = join(data, "settings.json");
  const loaded = loadSettings(settingsPath);
  let settings: Settings = loaded.settings;
  const jobs = companionJobs(data, () => settings);
  const engine = createEngine(jobs.deps);
  const chat = createChat(data, () => settings);
  let win: BrowserWindow | null = null;
  let site: ReturnType<typeof createSiteViews> | null = null;
  let tray: ReturnType<typeof createTray> | null = null;
  let quitting = false;

  const addonsDir = () => (settings.gameFolder ? join(settings.gameFolder, "Interface", "AddOns") : null);
  const appState = (): AppState => ({ version: app.getVersion(), platform: process.platform, dataFolder: data, notice: loaded.error, settings, engine: engine.snapshot(), siteTools: SITE_TOOLS });
  const broadcast = () => {
    const s = appState();
    win?.webContents.send("state", s);
    tray?.update(s);
  };
  engine.onChange(broadcast);

  // Two system notifications only: answers landed in the game (so the player knows to /reload),
  // and a newer addon exists (once per run). Nothing else interrupts.
  const notify = (title: string, body: string) => { if (Notification.isSupported()) new Notification({ title, body, silent: true }).show(); };
  let lastAskAt: string | null = null;
  engine.onChange((s) => {
    const ask = s.jobs.ask;
    if (ask.state !== "ok" || ask.at === lastAskAt) return;
    lastAskAt = ask.at;
    const m = /^answered (\d+)/.exec(ask.message);
    if (m && Number(m[1]) > 0) notify("Everloot answered in game", `${m[1]} answer(s) written. Type /reload to read them.`);
  });
  const addonUpdateNotice = async () => {
    const dir = addonsDir();
    if (!dir) return;
    try {
      const installed = installedAddonVersion(dir);
      const latest = newestRelease(await releases(), "addon-v");
      if (installed && latest && compareVersions(latest.version, installed) > 0) notify("Everloot addon update", `${latest.version} is out (you run ${installed}). Open the Addon page to update.`);
    } catch { /* offline; the Addon page will say so */ }
  };

  const releases = cached(10 * 60 * 1000, () => fetchReleases(fetch, `everloot-desktop/${app.getVersion()}`));
  const knownRealms = cached(10 * 60 * 1000, () => listRealms(settings.endpoint));
  const changes = cached(15 * 60 * 1000, () => fetchChanges(settings.endpoint));

  const applyLoginItem = () => {
    if (process.platform === "linux") return; // no login item API there; the AppImage can be added by hand
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, args: ["--hidden"] });
  };

  const show = () => {
    if (!win) createWindow();
    else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  };

  function createWindow(): void {
    win = new BrowserWindow({
      width: 1040, height: 720, minWidth: 760, minHeight: 540,
      title: "Everloot Desktop",
      backgroundColor: "#0E0F0D",
      show: false,
      autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    site = createSiteViews(win, () => settings.endpoint);
    win.loadFile(join(__dirname, "renderer", "index.html"));
    win.once("ready-to-show", () => { win?.show(); });
    // Close keeps the app in the tray; Quit in the tray menu ends it.
    win.on("close", (e) => { if (!quitting) { e.preventDefault(); win?.hide(); } });
    win.on("closed", () => { site?.destroy(); site = null; win = null; });
    win.webContents.setWindowOpenHandler(({ url }) => { if (allowedExternal(url)) void shell.openExternal(url); return { action: "deny" }; });
    win.webContents.on("will-navigate", (e) => e.preventDefault());
  }

  const pick = async (options: Electron.OpenDialogOptions) => {
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return r.canceled ? null : r.filePaths[0] ?? null;
  };

  ipcMain.handle("state", () => appState());
  ipcMain.handle("saveSettings", (_e, patch: unknown) => {
    settings = mergeSettings(settings, patch);
    saveSettings(settingsPath, settings);
    applyLoginItem();
    engine.start(settings);
    return appState();
  });
  ipcMain.handle("detectGameFolders", () => detectGameFolders(candidateRoots({ platform: process.platform, env: process.env, home: homedir() }), realFs));
  ipcMain.handle("pickGameFolder", () => pick({ title: "Pick the game folder that holds WTF", properties: ["openDirectory"] }));
  ipcMain.handle("pickTokenFile", () => pick({ title: "Pick the file that holds your MCP token", properties: ["openFile"] }));
  ipcMain.handle("runNow", (_e, job: unknown) => { if (JOBS.includes(job as Job)) return engine.runNow(job as Job); });
  ipcMain.handle("setPaused", (_e, paused: unknown) => engine.setPaused(paused === true));
  ipcMain.handle("openDataFolder", () => shell.openPath(data).then(() => undefined));
  ipcMain.handle("openAddonsFolder", () => { const dir = addonsDir(); return dir && existsSync(dir) ? shell.openPath(dir).then(() => undefined) : undefined; });
  ipcMain.handle("openConfig", () => {
    const config = join(data, "config.json");
    // A starter file with no providers, so the editor opens on the documented shape.
    if (!existsSync(config)) writeFileSync(config, JSON.stringify({ providers: [] }, null, 2) + "\n");
    return shell.openPath(config).then(() => undefined);
  });
  ipcMain.handle("openExternal", (_e, url: unknown) => {
    if (typeof url !== "string" || !allowedExternal(url)) return false;
    void shell.openExternal(url);
    return true;
  });
  ipcMain.handle("checkForUpdates", () => checkForUpdates(app.getVersion()));

  ipcMain.handle("uploadInfo", () => summarizeFiles(engine.snapshot().files, join(data, "sent.json")));
  ipcMain.handle("marketInfo", async (): Promise<MarketInfo> => {
    const base = { own: ownRealms(engine.snapshot().files), followed: settings.market.realms, last: jobs.lastMarket() };
    try {
      const k = await knownRealms();
      return { ...base, known: k.realms, dataAsOf: k.dataAsOf, error: null };
    } catch (err) {
      return { ...base, known: [], dataAsOf: null, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle("askInfo", (): AskInfo => {
    const pending = engine.snapshot().files.map((file) => {
      try { return { file, asks: readAsks(readFileSync(file, "utf8")) }; } catch { return { file, asks: [] }; }
    });
    let providers: string[] = [], providerError: string | null = null;
    try { providers = loadProviders(join(data, "config.json")).map((p) => p.name); }
    catch (err) { providerError = err instanceof Error ? err.message : String(err); }
    return { pending, answers: jobs.answerStore.list().slice().reverse(), providers, providerError };
  });
  ipcMain.handle("addonInfo", async (): Promise<AddonInfo> => {
    const dir = addonsDir();
    const local = { addonsDir: dir, installed: dir ? installedAddonVersion(dir) : null, slots: dir ? slotAddons(dir) : { prices: false, answers: false } };
    try { return { ...local, latest: newestRelease(await releases(), "addon-v"), error: null }; }
    catch (err) { return { ...local, latest: null, error: err instanceof Error ? err.message : String(err) }; }
  });
  ipcMain.handle("installAddon", async (_e, version: unknown) => {
    const dir = addonsDir();
    if (!dir) throw new Error("Pick the game folder first");
    if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Not a version");
    return installAddon({ version, endpoint: settings.endpoint, addonsDir: dir });
  });
  ipcMain.handle("changes", () => changes());
  ipcMain.handle("charactersInfo", () => charactersFromFiles(engine.snapshot().files));

  ipcMain.handle("chatInfo", () => chat.info());
  ipcMain.handle("chatSend", (_e, text: unknown) => (typeof text === "string" ? chat.send(text) : chat.info()));
  ipcMain.handle("chatClear", () => chat.clear());

  ipcMain.handle("siteShow", (_e, id: unknown) => {
    const path = typeof id === "string" ? siteToolPath(id) : null;
    return path && site ? site.show(path) : null;
  });
  ipcMain.handle("siteHide", () => site?.hide());
  ipcMain.handle("siteBack", () => site?.back());
  ipcMain.handle("siteReload", () => site?.reload());

  app.on("second-instance", show);
  app.on("activate", show);
  app.on("before-quit", () => { quitting = true; });
  app.on("window-all-closed", () => { /* stay in the tray */ });

  void app.whenReady().then(() => {
    tray = createTray(join(__dirname, process.platform === "darwin" ? "trayTemplate.png" : "tray.png"), {
      show, runNow: (job) => void engine.runNow(job), setPaused: (p) => engine.setPaused(p), quit: () => { quitting = true; app.quit(); },
    });
    applyLoginItem();
    engine.start(settings);
    const hidden = process.argv.includes("--hidden");
    if (!settings.consentedAt || !(hidden && settings.startInTray)) createWindow();
    broadcast();
    if (settings.consentedAt) void addonUpdateNotice();
  });
}
