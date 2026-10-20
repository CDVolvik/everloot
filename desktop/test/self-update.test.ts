import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { canInstallInPlace, downloadUpdate, runInstaller } from "../src/main/self-update";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-update-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const URL_EXE = "https://github.com/Everloot/everloot/releases/download/desktop-v0.2.0/Everloot-DesktopApp-0.2.0-win-x64-setup.exe";
const URL_SUMS = "https://github.com/Everloot/everloot/releases/download/desktop-v0.2.0/SHA256SUMS";
const installer = Buffer.from("MZ pretend installer ".repeat(5000));
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function fake(sums: string, body = installer) {
  return vi.fn(async (url: string) => (url === URL_SUMS
    ? new Response(sums, { status: 200 })
    : new Response(body, { status: 200, headers: { "content-length": String(body.length) } }))) as unknown as typeof fetch;
}

test("only the Windows installer updates in place", () => {
  expect(canInstallInPlace("win32", false)).toBe(true);
  expect(canInstallInPlace("win32", true)).toBe(false);
  expect(canInstallInPlace("darwin", false)).toBe(false);
  expect(canInstallInPlace("linux", false)).toBe(false);
});

test("the installer downloads with progress and is kept only when its checksum matches", async () => {
  const d = dir();
  const progress: number[] = [];
  const path = await downloadUpdate({ url: URL_EXE, sumsUrl: URL_SUMS, dir: d, send: fake(`${sha(installer)}  Everloot-DesktopApp-0.2.0-win-x64-setup.exe\n`), onProgress: (p) => progress.push(p) });
  expect(path).toBe(join(d, "Everloot-DesktopApp-0.2.0-win-x64-setup.exe"));
  expect(readFileSync(path).equals(installer)).toBe(true);
  expect(progress.at(-1)).toBe(100);
  expect(progress.every((p, i) => i === 0 || p >= progress[i - 1])).toBe(true);
});

test("a wrong checksum or a file the sums do not list installs nothing", async () => {
  const d = dir();
  await expect(downloadUpdate({ url: URL_EXE, sumsUrl: URL_SUMS, dir: d, send: fake(`${"0".repeat(64)}  Everloot-DesktopApp-0.2.0-win-x64-setup.exe\n`) }))
    .rejects.toThrow(/does not match its published checksum/);
  await expect(downloadUpdate({ url: URL_EXE, sumsUrl: URL_SUMS, dir: d, send: fake(`${sha(installer)}  something-else.exe\n`) }))
    .rejects.toThrow(/not listed/);
  expect(existsSync(join(d, "Everloot-DesktopApp-0.2.0-win-x64-setup.exe"))).toBe(false);
});

test("the installer starts silent and detached, and opens the app again when done", () => {
  const unref = vi.fn();
  const launch = vi.fn(() => ({ unref }));
  runInstaller("C:/data/updates/setup.exe", launch as never);
  expect(launch).toHaveBeenCalledWith("C:/data/updates/setup.exe", ["/S", "--force-run"], { detached: true, stdio: "ignore" });
  expect(unref).toHaveBeenCalled();
});
