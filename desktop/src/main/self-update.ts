import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { checksumFor } from "./addon";

/**
 * The app updating itself, on Windows installs only: the new installer is downloaded into the data
 * folder, checked against the SHA256SUMS published with the release, and run silently when the
 * player chooses Restart. It installs over this one and starts the app again; settings and the data
 * folder are not touched. A macOS disk image, a Linux AppImage and the portable exe cannot be swapped
 * like that, so those keep the download in the browser.
 */

export function canInstallInPlace(platform: string, portable: boolean): boolean {
  return platform === "win32" && !portable;
}

/** Downloads `url` to `dir`, reporting progress from 0 to 100, and refuses a file whose SHA-256 is not the one SHA256SUMS lists. */
export async function downloadUpdate(options: {
  url: string; sumsUrl: string; dir: string; send?: typeof fetch; onProgress?: (percent: number) => void;
}): Promise<string> {
  const send = options.send ?? fetch;
  const file = decodeURIComponent(basename(new URL(options.url).pathname));
  const sumsRes = await send(options.sumsUrl, { signal: AbortSignal.timeout(15_000) });
  if (!sumsRes.ok) throw new Error(`release checksums: ${sumsRes.status}`);
  const expected = checksumFor(await sumsRes.text(), file);
  if (!expected) throw new Error(`${file} is not listed in the release checksums`);

  const res = await send(options.url, { signal: AbortSignal.timeout(15 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`download: ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const chunks: Uint8Array[] = [];
  let got = 0;
  let shown = -1;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    const percent = total ? Math.min(99, Math.floor((got / total) * 100)) : 0;
    if (percent !== shown) { shown = percent; options.onProgress?.(percent); }
  }
  const bytes = Buffer.concat(chunks);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error(`${file} does not match its published checksum; nothing was installed`);
  mkdirSync(options.dir, { recursive: true });
  const target = join(options.dir, file);
  writeFileSync(`${target}.part`, bytes);
  rmSync(target, { force: true });
  renameSync(`${target}.part`, target);
  options.onProgress?.(100);
  return target;
}

/**
 * Starts the downloaded installer silently and detached, so it outlives this app: it waits for the
 * app to close, installs over it, and starts it again (`--force-run`). The caller quits right after.
 */
export function runInstaller(path: string, launch: typeof spawn = spawn): void {
  const child = launch(path, ["/S", "--force-run"], { detached: true, stdio: "ignore" });
  child.unref();
}
