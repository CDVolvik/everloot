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
  /** Realms to keep prices for beyond the ones in the player's own scans (TSM-style realm picks). */
  market: { realms: string[] };
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

/** What one account's Everloot.lua holds, for the Upload page. Nothing here leaves the machine. */
export interface FileSummary {
  file: string;
  ok: boolean;
  error: string | null;
  addonVersion: string | null;
  clientBuild: string | null;
  writtenAt: string | null;
  bytes: number;
  /** Records per kind, most first. */
  kinds: { kind: string; count: number }[];
  records: number;
  /** Events the site has confirmed from this install (sent.json). */
  confirmed: number;
  pendingAsks: number;
  scanRealms: string[];
}

export interface RealmSummary { realm: string; items: number; dataAsOf: string | null; source: "scan" | "followed" }
export interface MarketInfo {
  /** Realms named in the player's own scans. */
  own: string[];
  followed: string[];
  /** Realms the site has public values for, when it answered. */
  known: string[];
  dataAsOf: string | null;
  /** What the last refresh wrote into the game. */
  last: RealmSummary[];
  error: string | null;
}

export interface Ask { id: string; question: string; askedAt: string }
export interface Answer { id: string; answer: string; source: string; answeredAt: string }
export interface AskInfo {
  pending: { file: string; asks: Ask[] }[];
  answers: Answer[];
  /** Provider names from config.json, in order; empty means plain search. */
  providers: string[];
  providerError: string | null;
}

export interface AddonInfo {
  addonsDir: string | null;
  installed: string | null;
  latest: { version: string; url: string } | null;
  slots: { prices: boolean; answers: boolean };
  error: string | null;
}

export interface ChangeItem { title: string; link: string; date: string | null; summary: string }

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
  uploadInfo(): Promise<FileSummary[]>;
  marketInfo(): Promise<MarketInfo>;
  askInfo(): Promise<AskInfo>;
  addonInfo(): Promise<AddonInfo>;
  installAddon(version: string): Promise<{ version: string; files: number }>;
  changes(): Promise<ChangeItem[]>;
  onState(listener: (state: AppState) => void): () => void;
}
