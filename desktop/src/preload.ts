import { contextBridge, ipcRenderer } from "electron";
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
  openConfig: () => ipcRenderer.invoke("openConfig"),
  openExternal: (url: string) => ipcRenderer.invoke("openExternal", url),
  checkForUpdates: () => ipcRenderer.invoke("checkForUpdates"),
  onState: (listener) => {
    const handler = (_event: unknown, state: AppState) => listener(state);
    ipcRenderer.on("state", handler);
    return () => { ipcRenderer.removeListener("state", handler); };
  },
};

contextBridge.exposeInMainWorld("everloot", api);
