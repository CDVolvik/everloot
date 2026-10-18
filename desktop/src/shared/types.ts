/** Shapes shared by the Node side and the page. No Node or Electron imports here. */

export type Job = "upload" | "prices" | "ask";
export const JOBS: Job[] = ["upload", "prices", "ask"];

export interface Settings {
  /** The product folder (the one holding WTF/), or null before setup. */
  gameFolder: string | null;
  endpoint: string;
  upload: boolean;
  prices: boolean;
  ask: { enabled: boolean; mcpUrl: string; tokenFile: string | null };
  /** ISO time the player pressed Start on the welcome screen; null until then. Nothing runs before. */
  consentedAt: string | null;
  launchAtLogin: boolean;
  startInTray: boolean;
}

export type JobState = "off" | "idle" | "running" | "ok" | "error";
export interface JobStatus { state: JobState; message: string; at: string | null }
export interface LogLine { at: string; level: "info" | "error"; text: string }

export interface EngineState {
  files: string[];
  jobs: Record<Job, JobStatus>;
  log: LogLine[];
  paused: boolean;
}

/** `files` counts accounts with an Everloot.lua; `hasAccounts` says WTF/Account exists at all. */
export interface GameFolderCandidate { folder: string; product: string; files: number; hasAccounts: boolean }

export interface UpdateCheck { current: string; latest: string | null; url: string | null; newer: boolean }

/** Everything the page knows. The main side sends a fresh one after every change. */
export interface AppState {
  version: string;
  platform: string;
  dataFolder: string;
  /** A problem reading settings.json at start, shown once on the page; null otherwise. */
  notice: string | null;
  settings: Settings;
  engine: EngineState;
}

/** What `window.everloot` offers the page. Implemented in preload.ts over IPC. */
export interface EverlootApi {
  state(): Promise<AppState>;
  saveSettings(patch: Partial<Settings>): Promise<AppState>;
  detectGameFolders(): Promise<GameFolderCandidate[]>;
  pickGameFolder(): Promise<string | null>;
  pickTokenFile(): Promise<string | null>;
  runNow(job: Job): Promise<void>;
  setPaused(paused: boolean): Promise<void>;
  openDataFolder(): Promise<void>;
  openConfig(): Promise<void>;
  openExternal(url: string): Promise<boolean>;
  checkForUpdates(): Promise<UpdateCheck>;
  onState(listener: (state: AppState) => void): () => void;
}
