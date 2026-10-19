import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createEngine, type EngineDeps } from "../src/main/engine";
import { defaultSettings, mergeSettings } from "../src/main/settings";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function harness(files = ["A/Everloot.lua", "B/Everloot.lua"]) {
  const changes = new Map<string, () => void>();
  const deps = {
    findFiles: vi.fn(() => files),
    upload: vi.fn(async (f: string) => `sent 3 from ${f}`),
    prices: vi.fn(async () => "12 items on 1 realm"),
    ask: vi.fn(async () => "answered 1"),
    watch: vi.fn((file: string, onChange: () => void) => { changes.set(file, onChange); return () => changes.delete(file); }),
  } satisfies EngineDeps;
  const settings = mergeSettings(defaultSettings(), { gameFolder: "C:/WoW/_classic_era_", consentedAt: "2026-10-18T00:00:00Z" });
  const engine = createEngine(deps, { uploadSettleMs: 5000, askSettleMs: 2000, pricesEveryMs: 60_000 });
  const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
  return { deps, settings, engine, changes, flush };
}

test("start uploads every account file once, then refreshes prices, and watches each file", async () => {
  const { deps, settings, engine, flush } = harness();
  engine.start(settings);
  await flush();
  expect(deps.upload.mock.calls.map((c) => c[0])).toEqual(["A/Everloot.lua", "B/Everloot.lua"]);
  expect(deps.prices).toHaveBeenCalledTimes(1);
  expect(deps.watch).toHaveBeenCalledTimes(2);
  const s = engine.snapshot();
  expect(s.jobs.upload).toMatchObject({ state: "ok", message: "sent 3 from B/Everloot.lua" });
  expect(s.jobs.prices.state).toBe("ok");
  expect(s.jobs.ask.state).toBe("off");
  expect(s.log.some((l) => l.text.startsWith("Watching 2 account file(s)"))).toBe(true);
});

test("a burst of writes during a save runs one upload after it settles", async () => {
  const { deps, settings, engine, changes, flush } = harness();
  engine.start(settings);
  await flush();
  deps.upload.mockClear();
  const change = changes.get("A/Everloot.lua")!;
  change(); await vi.advanceTimersByTimeAsync(4000); change();
  await vi.advanceTimersByTimeAsync(4999);
  expect(deps.upload).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(deps.upload).toHaveBeenCalledTimes(2); // both account files, once each
});

test("prices refresh on the hour even with no upload", async () => {
  const { deps, settings, engine, flush } = harness();
  engine.start(settings);
  await flush();
  deps.prices.mockClear();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(deps.prices).toHaveBeenCalledTimes(1);
});

test("a failing upload is recorded and the other jobs keep going", async () => {
  const { deps, settings, engine, flush } = harness();
  deps.upload.mockRejectedValueOnce(new Error("intake answered 429"));
  engine.start(settings);
  await flush();
  const s = engine.snapshot();
  expect(s.jobs.upload).toMatchObject({ state: "error", message: "intake answered 429" });
  expect(deps.upload).toHaveBeenCalledTimes(2);
  expect(s.log.some((l) => l.level === "error" && l.text.includes("429"))).toBe(true);
  // Prices do not chain after a failed upload; a direct run still works.
  expect(deps.prices).not.toHaveBeenCalled();
  await engine.runNow("prices");
  expect(deps.prices).toHaveBeenCalledTimes(1);
});

test("the ask bridge answers after a write settles and only when enabled", async () => {
  const { deps, settings, engine, changes, flush } = harness(["A/Everloot.lua"]);
  engine.start(settings);
  await flush();
  expect(deps.ask).not.toHaveBeenCalled();
  engine.start(mergeSettings(settings, { ask: { enabled: true, tokenFile: "t" } }));
  await flush();
  expect(deps.ask).toHaveBeenCalledTimes(1);
  changes.get("A/Everloot.lua")!();
  await vi.advanceTimersByTimeAsync(2000);
  expect(deps.ask).toHaveBeenCalledTimes(2);
});

test("switching upload off stops the watchers and marks the job off; stop clears everything", async () => {
  const { deps, settings, engine, changes, flush } = harness();
  engine.start(settings);
  await flush();
  engine.start(mergeSettings(settings, { upload: false, prices: false }));
  await flush();
  expect(engine.snapshot().jobs.upload.state).toBe("off");
  deps.upload.mockClear();
  for (const c of changes.values()) c();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(deps.upload).not.toHaveBeenCalled();
  engine.stop();
  expect(changes.size).toBe(0);
  expect(engine.snapshot().files).toEqual([]);
});

test("before setup or without a game folder nothing runs, and a folder with no file says so", async () => {
  const { deps, engine, flush } = harness([]);
  engine.start(defaultSettings());
  await flush();
  expect(deps.findFiles).not.toHaveBeenCalled();
  engine.start(mergeSettings(defaultSettings(), { consentedAt: "2026-10-18T00:00:00Z" }));
  expect(engine.snapshot().log.at(-1)?.text).toBe("No game folder set");
  engine.start(mergeSettings(defaultSettings(), { consentedAt: "2026-10-18T00:00:00Z", gameFolder: "C:/WoW/_retail_" }));
  await flush();
  expect(engine.snapshot().log.at(-1)?.text).toMatch(/No Everloot\.lua under C:\/WoW\/_retail_/);
  expect(deps.upload).not.toHaveBeenCalled();
});

test("paused skips scheduled work and a run during a run queues one more", async () => {
  const { deps, settings, engine, flush } = harness(["A/Everloot.lua"]);
  let release!: () => void;
  deps.upload.mockImplementationOnce(() => new Promise<string>((r) => { release = () => r("late"); }));
  engine.start(settings);
  await flush();
  void engine.runNow("upload");
  release();
  await flush();
  expect(deps.upload).toHaveBeenCalledTimes(2);
  engine.setPaused(true);
  deps.upload.mockClear();
  await engine.runNow("upload");
  expect(deps.upload).not.toHaveBeenCalled();
  expect(engine.snapshot().paused).toBe(true);
  const seen: number[] = [];
  engine.onChange((s) => seen.push(s.log.length));
  engine.setPaused(false);
  expect(seen.length).toBe(1);
});
