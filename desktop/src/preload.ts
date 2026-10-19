import { contextBridge, ipcRenderer } from "electron";
import type { ProviderChoice } from "./shared/providers";
import type { AppState, EverlootApi, Job, Settings } from "./shared/types";

// The only way the page reaches Node: named calls over IPC, each checked on the main side.
const api: EverlootApi = {
  state: () => ipcRenderer.invoke("state"),
  saveSettings: (patch: Partial<Settings>) => ipcRenderer.invoke("saveSettings", patch),
  detectGameFolders: () => ipcRenderer.invoke("detectGameFolders"),
  pickGameFolder: () => ipcRenderer.invoke("pickGameFolder"),
  pickTokenFile: () => ipcRenderer.invoke("pickTokenFile"),
  runNow: (job: Job) => ipcRenderer.invoke("runNow", job),
  setPaused: (paused: boolean) => ipcRenderer.invoke("setPaused", paused),
  openDataFolder: () => ipcRenderer.invoke("openDataFolder"),
  openAddonsFolder: () => ipcRenderer.invoke("openAddonsFolder"),
  openConfig: () => ipcRenderer.invoke("openConfig"),
  openExternal: (url: string) => ipcRenderer.invoke("openExternal", url),
  checkForUpdates: () => ipcRenderer.invoke("checkForUpdates"),
  uploadInfo: () => ipcRenderer.invoke("uploadInfo"),
  backups: () => ipcRenderer.invoke("backups"),
  restoreBackup: (file: string) => ipcRenderer.invoke("restoreBackup", file),
  openBackupsFolder: () => ipcRenderer.invoke("openBackupsFolder"),
  marketInfo: () => ipcRenderer.invoke("marketInfo"),
  askInfo: () => ipcRenderer.invoke("askInfo"),
  addonInfo: () => ipcRenderer.invoke("addonInfo"),
  installAddon: (version: string) => ipcRenderer.invoke("installAddon", version),
  changes: () => ipcRenderer.invoke("changes"),
  charactersInfo: () => ipcRenderer.invoke("charactersInfo"),
  chatInfo: () => ipcRenderer.invoke("chatInfo"),
  chatSend: (text: string) => ipcRenderer.invoke("chatSend", text),
  chatClear: () => ipcRenderer.invoke("chatClear"),
  chatSetProvider: (choice: ProviderChoice) => ipcRenderer.invoke("chatSetProvider", choice),
  chatRemoveProvider: () => ipcRenderer.invoke("chatRemoveProvider"),
  siteShow: (id: string) => ipcRenderer.invoke("siteShow", id),
  siteHide: () => ipcRenderer.invoke("siteHide"),
  siteBack: () => ipcRenderer.invoke("siteBack"),
  siteReload: () => ipcRenderer.invoke("siteReload"),
  onNavigate: (listener) => {
    const handler = (_event: unknown, page: string) => listener(page);
    ipcRenderer.on("navigate", handler);
    return () => { ipcRenderer.removeListener("navigate", handler); };
  },
  onState: (listener) => {
    const handler = (_event: unknown, state: AppState) => listener(state);
    ipcRenderer.on("state", handler);
    return () => { ipcRenderer.removeListener("state", handler); };
  },
};

contextBridge.exposeInMainWorld("everloot", api);
