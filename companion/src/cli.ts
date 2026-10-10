#!/usr/bin/env -S npx tsx
/**
 * everloot-companion upload|watch --file <Everloot.lua> | --game <World of Warcraft folder> [--endpoint URL] [--state FILE]
 * Sends only events the site has not confirmed. Named data (guild, gear, gold, collection) stays on
 * this machine; share it on the website with a verified grant. Nothing here touches the game client.
 */
import { watch } from "node:fs";
import { homedir } from "node:os";
import { join, win32, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { findEverlootFiles } from "./savedvariables";
import { createSentState } from "./sent-state";
import { uploadFile } from "./uploader";

export interface CliArgs { command: "upload" | "watch"; file?: string; game?: string; endpoint: string; state?: string }

export function parseArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;
  if (command !== "upload" && command !== "watch") throw new Error("Use upload or watch.");
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) flags.set(rest[i].replace(/^--/, ""), rest[i + 1] ?? "");
  const endpoint = flags.get("endpoint") || "https://everloot.app";
  if (!/^https?:\/\//.test(endpoint)) throw new Error("--endpoint must be an http(s) URL.");
  const file = flags.get("file"), game = flags.get("game");
  if (!file && !game) throw new Error("Name --file or --game.");
  const state = flags.get("state");
  return { command, ...(file ? { file } : {}), ...(game ? { game } : {}), endpoint, ...(state ? { state } : {}) };
}

/** The companion's own data folder; the CurseForge app replaces the addon folder on update. */
export function defaultStatePath(os: { platform: string; env: Record<string, string | undefined>; home: string }): string {
  if (os.platform === "win32") return win32.join(os.env.APPDATA ?? win32.join(os.home, "AppData", "Roaming"), "Everloot", "sent.json");
  if (os.platform === "darwin") return posix.join(os.home, "Library", "Application Support", "Everloot", "sent.json");
  return posix.join(os.env.XDG_CONFIG_HOME ?? posix.join(os.home, ".config"), "everloot", "sent.json");
}

export function debounce(run: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const state = createSentState(args.state ?? defaultStatePath({ platform: process.platform, env: process.env, home: homedir() }));
  const files = args.file ? [args.file] : findEverlootFiles(args.game!);
  if (files.length === 0) throw new Error(`No Everloot.lua under ${join(args.game ?? "", "WTF", "Account")}. Log out once so the game writes it.`);
  const send = async (file: string) => {
    try {
      const r = await uploadFile(file, { endpoint: args.endpoint, state });
      console.log(`${file}: sent ${r.sent} new events in ${r.batches} batch(es); kept ${r.heldNamed} named and ${r.heldLegacy} legacy rows here.`);
    } catch (err) {
      console.error(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  for (const file of files) await send(file);
  if (args.command === "watch") {
    // The game writes SavedVariables at logout or /reload; wait for the write to settle.
    for (const file of files) watch(file, debounce(() => void send(file), 5000));
    console.log(`Watching ${files.length} file(s). Leave this running while you play; Ctrl+C stops it.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
