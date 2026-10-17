#!/usr/bin/env -S npx tsx
/**
 * everloot-companion upload|watch --file <Everloot.lua> | --game <World of Warcraft folder> [--endpoint URL] [--state FILE]
 * everloot-companion bridge --game <World of Warcraft folder> --mcp <URL> --token-file <FILE>
 *   answers /ask questions into the EverlootAnswers slot addon; they show after /reload.
 * Sends only events the site has not confirmed. Named data (guild, gear, gold, collection) stays on
 * this machine; share it on the website with a verified grant. Nothing here touches the game client.
 */
import { readFileSync, watch } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, posix, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { createAnswerStore, answerPending } from "./bridge/run";
import { mcpEngine, mcpSearch } from "./bridge/engine";
import { llmEngine } from "./bridge/llm-engine";
import { loadProviders } from "./providers/config";
import { findEverlootFiles } from "./savedvariables";
import { createSentState } from "./sent-state";
import { uploadFile } from "./uploader";

export interface CliArgs {
  command: "upload" | "watch" | "bridge"; file?: string; game?: string; endpoint: string; state?: string;
  mcp?: string; tokenFile?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;
  if (command !== "upload" && command !== "watch" && command !== "bridge") throw new Error("Use upload, watch or bridge.");
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) flags.set(rest[i].replace(/^--/, ""), rest[i + 1] ?? "");
  const endpoint = flags.get("endpoint") || "https://everloot.app";
  if (!/^https?:\/\//.test(endpoint)) throw new Error("--endpoint must be an http(s) URL.");
  const file = flags.get("file"), game = flags.get("game");
  if (!file && !game) throw new Error("Name --file or --game.");
  const state = flags.get("state");
  if (command === "bridge") {
    // Answers are written under the game folder, so the bridge needs it, not a single file.
    if (!game) throw new Error("bridge needs --game.");
    const mcp = flags.get("mcp"), tokenFile = flags.get("token-file");
    if (!mcp || !/^https?:\/\//.test(mcp)) throw new Error("bridge needs --mcp with an http(s) URL.");
    if (!tokenFile) throw new Error("bridge needs --token-file (the token is never passed on the command line).");
    return { command, game, endpoint, ...(state ? { state } : {}), mcp, tokenFile };
  }
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

/** Printed before anything is sent: how uploads are licensed and where the code is (AGPL section 13). */
export function uploadNotice(): string {
  return "Uploaded observations are published under CC BY-SA 4.0, credited to Everloot contributors.\n" +
    "Source: https://github.com/CDVolvik/everloot";
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const statePath = args.state ?? defaultStatePath({ platform: process.platform, env: process.env, home: homedir() });
  const state = createSentState(statePath);
  const files = args.file ? [args.file] : findEverlootFiles(args.game!);
  if (files.length === 0) throw new Error(`No Everloot.lua under ${join(args.game ?? "", "WTF", "Account")}. Log out once so the game writes it.`);
  if (args.command === "bridge") {
    const mcp = { url: args.mcp!, token: readFileSync(args.tokenFile!, "utf8").trim() };
    // Providers the user enabled in config.json beside the state file; none means plain search answers.
    const providers = loadProviders(join(dirname(statePath), "config.json"));
    const engine = providers.length
      ? llmEngine({ search: (q) => mcpSearch(mcp, q, 3), providers })
      : mcpEngine(mcp);
    console.log(providers.length ? `Answering with ${providers.map((p) => p.name).join(" > ")}.` : "Answering with plain search (no providers in config.json).");
    const store = createAnswerStore(join(dirname(statePath), "answers.json"));
    const addonsDir = join(args.game!, "Interface", "AddOns");
    const answer = async (file: string) => {
      try {
        const r = await answerPending({ svFile: file, addonsDir, engine, store });
        if (r.answered || r.failed) console.log(`${file}: answered ${r.answered}, failed ${r.failed}. /reload in game to read them.`);
      } catch (err) {
        console.error(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    for (const file of files) {
      await answer(file);
      watch(file, debounce(() => void answer(file), 2000));
    }
    console.log(`Answering /ask for ${files.length} account(s). Leave this running; Ctrl+C stops it.`);
    return;
  }
  const send = async (file: string) => {
    try {
      const r = await uploadFile(file, { endpoint: args.endpoint, state });
      console.log(`${file}: sent ${r.sent} new events in ${r.batches} batch(es); kept ${r.heldNamed} named and ${r.heldLegacy} legacy rows here.`);
    } catch (err) {
      console.error(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  console.log(uploadNotice());
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
