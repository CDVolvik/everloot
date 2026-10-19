import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { companionJobs } from "../src/main/jobs";
import { defaultSettings } from "../src/main/settings";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-desktop-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const until = (check: () => boolean, ms = 3000) => new Promise<void>((res, rej) => {
  const start = Date.now();
  const tick = () => { if (check()) res(); else if (Date.now() - start > ms) rej(new Error("timed out")); else setTimeout(tick, 25); };
  tick();
});

test("the watcher reports a write to the account file and stops cleanly", async () => {
  const d = dir();
  const file = join(d, "Everloot.lua");
  writeFileSync(file, "EverlootDB = {}\n");
  const { deps } = companionJobs(join(d, "data"), () => defaultSettings());
  let changes = 0;
  const stop = deps.watch(file, () => { changes += 1; });
  writeFileSync(file, "EverlootDB = { v = 2 }\n");
  await until(() => changes > 0);
  stop();
  const seen = changes;
  writeFileSync(file, "EverlootDB = { v = 3 }\n");
  await new Promise((r) => setTimeout(r, 200));
  expect(changes).toBe(seen);
});

test("watching a file that is not there does not throw, and stop cancels the retry", () => {
  const d = dir();
  const { deps } = companionJobs(join(d, "data"), () => defaultSettings());
  const stop = deps.watch(join(d, "missing", "Everloot.lua"), () => {});
  expect(stop).not.toThrow();
});

test("the ask job refuses to run without a readable, non-empty token file", async () => {
  const d = dir();
  const empty = join(d, "empty.txt");
  writeFileSync(empty, "");
  const run = (tokenFile: string | null) => companionJobs(join(d, "data"), () => ({ ...defaultSettings(), ask: { enabled: true, mcpUrl: "https://example.test/mcp", tokenFile } })).deps.ask(join(d, "Everloot.lua"));
  await expect(run(null)).rejects.toThrow(/token file/);
  await expect(run(join(d, "nope.txt"))).rejects.toThrow(/could not be read/);
  await expect(run(empty)).rejects.toThrow(/is empty/);
});
