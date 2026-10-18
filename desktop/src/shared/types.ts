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
  /** The player's last full scan per realm, newest first. */
  scans: ScanAge[];
}

export interface ScanAge { realm: string; at: string | null }

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
  /** The player's last full scan per realm across every account file, newest first. */
  scans: ScanAge[];
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

/** One tool call the agent made while answering. */
export interface ChatStep { tool: string; input: string; chars: number }
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  at: string;
  /** The model that wrote an assistant message; null for plain search. */
  model: string | null;
  sources: string[];
  steps: ChatStep[];
}
export interface ChatInfo {
  messages: ChatMessage[];
  /** "anthropic:<model>" with the tool loop, "<provider>" for a summary, or "plain search". */
  mode: string;
  /** The MCP endpoint in use and whether a token is set (the public one is rate limited per IP). */
  mcpUrl: string;
  withToken: boolean;
  busy: boolean;
  error: string | null;
}

/** One of the player's own characters, from the save file. Never uploaded from here. */
export interface CharacterRow {
  character: string;
  realm: string;
  /** Copper, latest snapshot. */
  gold: number | null;
  peakGold: number | null;
  gearSlots: number;
  itemLevel: number | null;
  /** Copper by category, from money events this file holds. */
  spent: Record<string, number>;
  earned: Record<string, number>;
}
/** Progress rows carry an opaque per-install key instead of a name (intake.ts CHARACTER_KEY). */
export interface ProgressRow {
  key: string;
  class: string;
  level: number;
  achievements: number;
  achievementsInProgress: number;
  reputations: number;
  exalted: number;
  titles: number;
  quests: number;
  talentPoints: number | null;
}
export interface CharactersInfo {
  characters: CharacterRow[];
  progress: ProgressRow[];
  talents: { class: string; level: number; points: number }[];
}

export interface SiteTool { id: string; label: string; path: string }

/** Everything the page knows. The main side sends a fresh one after every change. */
export interface AppState {
  version: string;
  platform: string;
  dataFolder: string;
  /** A problem reading settings.json at start, shown once on the page; null otherwise. */
  notice: string | null;
  settings: Settings;
  engine: EngineState;
  siteTools: SiteTool[];
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
  /** Opens the game's Interface/AddOns folder in the file manager. */
  openAddonsFolder(): Promise<void>;
  openConfig(): Promise<void>;
  openExternal(url: string): Promise<boolean>;
  checkForUpdates(): Promise<UpdateCheck>;
  uploadInfo(): Promise<FileSummary[]>;
  marketInfo(): Promise<MarketInfo>;
  askInfo(): Promise<AskInfo>;
  addonInfo(): Promise<AddonInfo>;
  installAddon(version: string): Promise<{ version: string; files: number }>;
  changes(): Promise<ChangeItem[]>;
  charactersInfo(): Promise<CharactersInfo>;
  chatInfo(): Promise<ChatInfo>;
  chatSend(text: string): Promise<ChatInfo>;
  chatClear(): Promise<ChatInfo>;
  /** Shows a site tool inside the window; returns the URL it opened. */
  siteShow(id: string): Promise<string | null>;
  siteHide(): Promise<void>;
  siteBack(): Promise<void>;
  siteReload(): Promise<void>;
  onState(listener: (state: AppState) => void): () => void;
}
