import { BrowserWindow, app, dialog, ipcMain, shell } from "electron";
import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppState, Job, Settings } from "../shared/types";
import { JOBS } from "../shared/types";
import { createEngine } from "./engine";
import { allowedExternal } from "./external";
import { candidateRoots, detectGameFolders, realFs } from "./game-folder";
import { companionJobs } from "./jobs";
import { loadSettings, mergeSettings, saveSettings } from "./settings";
import { createTray } from "./tray";
import { checkForUpdates } from "./updates";

/** The same folder the command line uses (`companion/src/cli.ts` defaultStatePath), so both share sent.json. */
function dataFolder(): string {
  // EVERLOOT_DATA_DIR points a development run at a scratch folder instead of the real one.
  if (process.env.EVERLOOT_DATA_DIR) return process.env.EVERLOOT_DATA_DIR;
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Everloot");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Everloot");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "everloot");
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const data = dataFolder();
  const settingsPath = join(data, "settings.json");
  const loaded = loadSettings(settingsPath);
  let settings: Settings = loaded.settings;
  const engine = createEngine(companionJobs(data, () => settings));
  let win: BrowserWindow | null = null;
  let tray: ReturnType<typeof createTray> | null = null;
  let quitting = false;

  const appState = (): AppState => ({ version: app.getVersion(), platform: process.platform, dataFolder: data, notice: loaded.error, settings, engine: engine.snapshot() });
  const broadcast = () => {
    const s = appState();
    win?.webContents.send("state", s);
    tray?.update(s);
  };
  engine.onChange(broadcast);

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
      width: 820, height: 640, minWidth: 640, minHeight: 480,
      title: "Everloot Desktop",
      backgroundColor: "#0E0F0D",
      show: false,
      autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.loadFile(join(__dirname, "renderer", "index.html"));
    win.once("ready-to-show", () => { win?.show(); });
    // Close keeps the app in the tray; Quit in the tray menu ends it.
    win.on("close", (e) => { if (!quitting) { e.preventDefault(); win?.hide(); } });
    win.on("closed", () => { win = null; });
    win.webContents.setWindowOpenHandler(({ url }) => { if (allowedExternal(url)) void shell.openExternal(url); return { action: "deny" }; });
    win.webContents.on("will-navigate", (e) => e.preventDefault());
  }

  ipcMain.handle("state", () => appState());
  ipcMain.handle("saveSettings", (_e, patch: unknown) => {
    settings = mergeSettings(settings, patch);
    saveSettings(settingsPath, settings);
    applyLoginItem();
    engine.start(settings);
    return appState();
  });
  ipcMain.handle("detectGameFolders", () => detectGameFolders(candidateRoots({ platform: process.platform, env: process.env, home: homedir() }), realFs));
  ipcMain.handle("pickGameFolder", async () => {
    const opts = { title: "Pick the game folder that holds WTF", properties: ["openDirectory" as const] };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
  ipcMain.handle("pickTokenFile", async () => {
    const opts = { title: "Pick the file that holds your MCP token", properties: ["openFile" as const] };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
  ipcMain.handle("runNow", (_e, job: unknown) => { if (JOBS.includes(job as Job)) return engine.runNow(job as Job); });
  ipcMain.handle("setPaused", (_e, paused: unknown) => engine.setPaused(paused === true));
  ipcMain.handle("openDataFolder", () => shell.openPath(data).then(() => undefined));
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
  });
}
