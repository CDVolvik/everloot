import type { EngineState, Job, JobStatus, LogLine, Settings } from "../shared/types";
import { JOBS } from "../shared/types";

/** The work the engine schedules. Injected so tests run it with no files and no network. */
export interface EngineDeps {
  findFiles(gameFolder: string): string[];
  /** Uploads one account file; the returned line goes to the log. */
  upload(file: string): Promise<string>;
  prices(files: string[]): Promise<string>;
  ask(file: string): Promise<string>;
  /** Starts watching a file and returns the function that stops it. */
  watch(file: string, onChange: () => void): () => void;
  now?(): Date;
}

export interface EngineOptions {
  /** The game writes SavedVariables at logout or /reload; wait for the write to settle. */
  uploadSettleMs?: number;
  askSettleMs?: number;
  pricesEveryMs?: number;
  logLines?: number;
}

export interface Engine {
  start(settings: Settings): void;
  stop(): void;
  runNow(job: Job): Promise<void>;
  setPaused(paused: boolean): void;
  snapshot(): EngineState;
  onChange(listener: (state: EngineState) => void): () => void;
}

const enabled = (s: Settings, job: Job) => (job === "upload" ? s.upload : job === "prices" ? s.prices : s.ask.enabled);

export function createEngine(deps: EngineDeps, options: EngineOptions = {}): Engine {
  const settle: Record<Job, number> = { upload: options.uploadSettleMs ?? 5000, ask: options.askSettleMs ?? 2000, prices: 0 };
  const pricesEvery = options.pricesEveryMs ?? 60 * 60 * 1000;
  const maxLog = options.logLines ?? 200;
  const now = () => (deps.now ? deps.now() : new Date()).toISOString();

  const off = (): JobStatus => ({ state: "off", message: "", at: null });
  const state: EngineState = { files: [], jobs: { upload: off(), prices: off(), ask: off() }, log: [], paused: false };
  const listeners = new Set<(s: EngineState) => void>();
  let settings: Settings | null = null;
  let unwatchers: (() => void)[] = [];
  const timers = new Map<Job, ReturnType<typeof setTimeout>>();
  let pricesTimer: ReturnType<typeof setInterval> | null = null;
  const running = new Set<Job>();
  const again = new Set<Job>();

  const snapshot = (): EngineState => ({ files: [...state.files], jobs: { upload: { ...state.jobs.upload }, prices: { ...state.jobs.prices }, ask: { ...state.jobs.ask } }, log: [...state.log], paused: state.paused });
  const emit = () => { const s = snapshot(); for (const l of listeners) l(s); };
  const log = (level: LogLine["level"], text: string) => {
    state.log.push({ at: now(), level, text });
    if (state.log.length > maxLog) state.log.splice(0, state.log.length - maxLog);
  };
  const set = (job: Job, patch: Partial<JobStatus>) => { state.jobs[job] = { ...state.jobs[job], ...patch }; };

  async function run(job: Job): Promise<void> {
    const s = settings;
    if (!s || !enabled(s, job)) return;
    if (state.paused) { log("info", `${job}: paused, skipped`); emit(); return; }
    if (running.has(job)) { again.add(job); return; }
    if (state.files.length === 0) { set(job, { state: "idle", message: "No Everloot.lua to read", at: now() }); emit(); return; }
    running.add(job);
    set(job, { state: "running", message: "", at: now() });
    emit();
    const failures: string[] = [];
    const lines: string[] = [];
    const attempt = async (label: string, work: () => Promise<string>) => {
      try { const line = await work(); lines.push(line); log("info", `${label}: ${line}`); }
      catch (err) { const m = err instanceof Error ? err.message : String(err); failures.push(m); log("error", `${label}: ${m}`); }
    };
    if (job === "upload") for (const file of state.files) await attempt(`upload ${file}`, () => deps.upload(file));
    else if (job === "ask") for (const file of state.files) await attempt(`ask ${file}`, () => deps.ask(file));
    else await attempt("prices", () => deps.prices(state.files));
    set(job, failures.length
      ? { state: "error", message: failures[failures.length - 1], at: now() }
      : { state: "ok", message: lines[lines.length - 1] ?? "", at: now() });
    running.delete(job);
    emit();
    // Prices follow every upload, as `watch --game` does on the command line.
    if (job === "upload" && failures.length === 0 && s.prices) void run("prices");
    if (again.delete(job)) void run(job);
  }

  const schedule = (job: Job) => {
    const t = timers.get(job);
    if (t) clearTimeout(t);
    timers.set(job, setTimeout(() => { timers.delete(job); void run(job); }, settle[job]));
  };

  function stop(): void {
    for (const u of unwatchers) u();
    unwatchers = [];
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    if (pricesTimer) { clearInterval(pricesTimer); pricesTimer = null; }
    again.clear();
    settings = null;
    state.files = [];
    for (const job of JOBS) state.jobs[job] = off();
    emit();
  }

  function start(s: Settings): void {
    stop();
    settings = s;
    for (const job of JOBS) state.jobs[job] = enabled(s, job) ? { state: "idle", message: "", at: null } : off();
    if (!s.consentedAt) { log("info", "Waiting for setup to finish"); emit(); return; }
    if (!s.gameFolder) { log("info", "No game folder set"); emit(); return; }
    state.files = deps.findFiles(s.gameFolder);
    if (state.files.length === 0) {
      log("info", `No Everloot.lua under ${s.gameFolder}. Log out once so the game writes it.`);
      emit();
      return;
    }
    log("info", `Watching ${state.files.length} account file(s) in ${s.gameFolder}`);
    for (const file of state.files) {
      unwatchers.push(deps.watch(file, () => {
        if (s.upload) schedule("upload");
        if (s.ask.enabled) schedule("ask");
      }));
    }
    if (s.prices) pricesTimer = setInterval(() => void run("prices"), pricesEvery);
    emit();
    if (s.upload) void run("upload"); else if (s.prices) void run("prices");
    if (s.ask.enabled) void run("ask");
  }

  return {
    start,
    stop,
    runNow: (job) => run(job),
    setPaused: (paused) => { state.paused = paused; log("info", paused ? "Paused" : "Resumed"); emit(); },
    snapshot,
    onChange: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
