import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { afterEach, expect, test, vi } from "vitest";
import { checksumFor, extractAddon, installAddon, installedAddonVersion, newestRelease, safeAddonEntries, slotAddons } from "../src/main/addon";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-addon-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const enc = (s: string) => new TextEncoder().encode(s);
const goodZip = (version: string) => zipSync({
  "Everloot/Everloot.toc": enc(`## Interface: 16001\n## Version: ${version}\n`),
  "Everloot/core.lua": enc("-- core"),
  "Everloot/modules/ask.lua": enc("-- ask"),
  "README.md": enc("stray"),
});

test("the installed version is read from the TOC, and the slot addons are reported", () => {
  const addons = dir();
  expect(installedAddonVersion(addons)).toBeNull();
  mkdirSync(join(addons, "Everloot"), { recursive: true });
  writeFileSync(join(addons, "Everloot", "Everloot.toc"), "## Interface: 16001\r\n## Version: 0.3.3\r\n");
  expect(installedAddonVersion(addons)).toBe("0.3.3");
  expect(slotAddons(addons)).toEqual({ prices: false, answers: false, builds: false });
  mkdirSync(join(addons, "EverlootPrices"));
  writeFileSync(join(addons, "EverlootPrices", "EverlootPrices.toc"), "x");
  expect(slotAddons(addons).prices).toBe(true);
  mkdirSync(join(addons, "EverlootBuilds"));
  writeFileSync(join(addons, "EverlootBuilds", "EverlootBuilds.toc"), "x");
  expect(slotAddons(addons)).toEqual({ prices: true, answers: false, builds: true });
});

test("only regular files under Everloot/ are written; traversal, absolute and backslash names are ignored", () => {
  const entries = safeAddonEntries({
    "Everloot/Everloot.toc": enc("a"), "Everloot/": new Uint8Array(), "Everloot/../x.lua": enc("b"), "/Everloot/abs.lua": enc("c"),
    "Everloot\\win.lua": enc("d"), "Other/file.lua": enc("e"), "Everloot/sub/./ok.lua": enc("f"), "Everloot/deep/file.lua": enc("g"),
  });
  expect(entries.map(([n]) => n)).toEqual(["Everloot/Everloot.toc", "Everloot/deep/file.lua"]);
});

test("extracting swaps the folder whole and keeps the old one when the zip is bad", () => {
  const addons = dir();
  mkdirSync(join(addons, "Everloot"), { recursive: true });
  writeFileSync(join(addons, "Everloot", "Everloot.toc"), "## Version: 0.3.2\n");
  writeFileSync(join(addons, "Everloot", "stale.lua"), "old");
  expect(extractAddon(goodZip("0.3.3"), addons)).toBe(3);
  expect(installedAddonVersion(addons)).toBe("0.3.3");
  expect(existsSync(join(addons, "Everloot", "stale.lua"))).toBe(false);
  expect(existsSync(join(addons, "Everloot", "modules", "ask.lua"))).toBe(true);
  expect(existsSync(join(addons, "Everloot.old"))).toBe(false);
  expect(existsSync(join(addons, "README.md"))).toBe(false);
  expect(() => extractAddon(zipSync({ "Everloot/core.lua": enc("x") }), addons)).toThrow(/Everloot\.toc/);
  expect(() => extractAddon(zipSync({ "Other/x.lua": enc("x") }), addons)).toThrow(/no Everloot\/ files/);
  expect(installedAddonVersion(addons)).toBe("0.3.3");
});

test("the newest release with the prefix wins; the other prefix, drafts and pre-releases are skipped", () => {
  const releases = [
    { tag_name: "desktop-v0.4.0", html_url: "d" },
    { tag_name: "addon-v0.3.3", html_url: "a333" },
    { tag_name: "addon-v0.3.10", html_url: "a3310" },
    { tag_name: "addon-v1.0.0", html_url: "pre", prerelease: true },
    { tag_name: "addon-v2.0.0", html_url: "draft", draft: true },
  ];
  expect(newestRelease(releases, "addon-v")).toEqual({ version: "0.3.10", url: "a3310" });
  expect(newestRelease(releases, "desktop-v")).toEqual({ version: "0.4.0", url: "d" });
  expect(newestRelease(releases, "nothing-v")).toBeNull();
});

test("an install verifies the zip against the release's SHA256SUMS and refuses a mismatch", async () => {
  const addons = dir();
  const zip = goodZip("0.3.3");
  const sum = createHash("sha256").update(zip).digest("hex");
  const sums = `${sum}  Everloot-0.3.3.zip\nabc  other.zip\n`;
  expect(checksumFor(sums, "Everloot-0.3.3.zip")).toBe(sum);
  expect(checksumFor(sums, "missing.zip")).toBeNull();
  const send = vi.fn(async (url: string) => {
    if (url.endsWith("/SHA256SUMS")) return new Response(sums);
    if (url === "https://everloot.app/downloads/Everloot-0.3.3.zip") return new Response(zip);
    return new Response("", { status: 404 });
  });
  const r = await installAddon({ version: "0.3.3", endpoint: "https://everloot.app", addonsDir: addons, send: send as unknown as typeof fetch });
  expect(r).toEqual({ version: "0.3.3", files: 3 });
  expect(readFileSync(join(addons, "Everloot", "core.lua"), "utf8")).toBe("-- core");
  const tampered = vi.fn(async (url: string) => (url.endsWith("/SHA256SUMS") ? new Response(sums) : new Response(goodZip("9.9.9"))));
  await expect(installAddon({ version: "0.3.3", endpoint: "https://everloot.app", addonsDir: addons, send: tampered as unknown as typeof fetch })).rejects.toThrow(/does not match/);
  expect(installedAddonVersion(addons)).toBe("0.3.3");
  const unlisted = vi.fn(async () => new Response("deadbeef  nope.zip"));
  await expect(installAddon({ version: "0.3.3", endpoint: "https://everloot.app", addonsDir: addons, send: unlisted as unknown as typeof fetch })).rejects.toThrow(/not listed/);
});
