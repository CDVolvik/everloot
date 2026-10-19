import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readJsonFile } from "./json-file";
import { MODEL_ID, presetFor, type ProviderChoice, type ProviderInUse, type ProviderKind } from "../shared/providers";

/**
 * The Chat page's provider picker, on the Node side. The key goes into its own file in the data
 * folder, the way the companion requires (a key inside config.json is refused there), and
 * config.json gets one entry at the front pointing at it, marked as the app's own so Change and
 * Remove touch only that entry. Entries the player wrote by hand are kept as they are. The in-game
 * /ask bridge reads the same file, so one pick serves both.
 */
export const DEFAULT_MODEL = "claude-sonnet-5-5";
const OWNER = "everloot-desktop";

type Entry = Record<string, unknown>;

function readConfig(path: string): { providers: Entry[]; rest: Record<string, unknown> } {
  if (!existsSync(path)) return { providers: [], rest: {} };
  const raw = readJsonFile(path) as Record<string, unknown>;
  const { providers, ...rest } = raw;
  return { providers: Array.isArray(providers) ? (providers as Entry[]) : [], rest };
}

function writeConfig(path: string, providers: Entry[], rest: Record<string, unknown>): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify({ ...rest, providers }, null, 2) + "\n");
  renameSync(`${path}.tmp`, path);
}

/** The app's entry: marked by it, or (from before the marker) the anthropic entry on the app's own key file. */
function isOwn(p: Entry, dataFolder: string): boolean {
  return p.source === OWNER || (p.type === "anthropic" && p.apiKeyFile === join(dataFolder, "anthropic.key"));
}

/** Writes the key file (if any) and the config entry; returns what is now in use. */
export function setProvider(dataFolder: string, choice: ProviderChoice): ProviderInUse {
  const preset = presetFor(choice.kind);
  if (!preset) throw new Error(`Unknown provider ${String(choice.kind)}`);
  const key = (choice.key ?? "").trim();
  const model = (choice.model ?? "").trim() || preset.models[0]?.id || "";
  if (!MODEL_ID.test(model)) throw new Error(model ? "That does not look like a model id" : "Pick or type a model");
  const baseUrl = preset.kind === "custom" ? (choice.baseUrl ?? "").trim().replace(/\/$/, "") : preset.baseUrl;
  if (preset.kind !== "anthropic" && !/^https?:\/\/\S+$/.test(baseUrl ?? "")) throw new Error("The server needs an http(s) address");
  if (preset.keyPattern && !preset.keyPattern.test(key)) throw new Error(`That does not look like the right key. ${preset.keyHint}`);
  if (preset.keyFile && preset.kind !== "custom" && !key) throw new Error("Paste the key first");
  if (key && key.length > 500) throw new Error("That is too long for a key");

  mkdirSync(dataFolder, { recursive: true });
  const config = join(dataFolder, "config.json");
  const { providers, rest } = readConfig(config);
  const old = providers.find((p) => p && isOwn(p, dataFolder));

  let keyFile: string | undefined;
  if (preset.keyFile && key) {
    keyFile = join(dataFolder, preset.keyFile);
    writeFileSync(`${keyFile}.tmp`, key + "\n", { mode: 0o600 });
    renameSync(`${keyFile}.tmp`, keyFile);
  }
  const entry: Entry = preset.kind === "anthropic"
    ? { type: "anthropic", apiKeyFile: keyFile, model, source: OWNER }
    : { type: "openai-compatible", baseUrl, model, ...(keyFile ? { apiKeyFile: keyFile } : {}), source: OWNER, kind: preset.kind };
  const kept = providers.filter((p) => !(p && isOwn(p, dataFolder)));
  writeConfig(config, [entry, ...kept], rest);
  // The old key file goes last, so a failed write above leaves the previous pick working.
  if (old?.apiKeyFile !== keyFile) removeKeyFile(dataFolder, old);
  return { kind: preset.kind, model, baseUrl: baseUrl ?? null };
}

/** Deletes the key file the app wrote for an entry, never one the player named elsewhere. */
function removeKeyFile(dataFolder: string, entry: Entry | undefined): void {
  const file = entry?.apiKeyFile;
  if (typeof file === "string" && resolve(dirname(file)) === resolve(dataFolder)) rmSync(file, { force: true });
}

/** Removes the app's entry and its key file; entries the player wrote by hand are left alone. */
export function removeProvider(dataFolder: string): void {
  const config = join(dataFolder, "config.json");
  if (!existsSync(config)) return;
  const { providers, rest } = readConfig(config);
  const own = providers.find((p) => p && isOwn(p, dataFolder));
  if (!own) return;
  removeKeyFile(dataFolder, own);
  writeConfig(config, providers.filter((p) => p !== own), rest);
}

/** The provider the app wrote, if config.json still names it. */
export function ownProvider(dataFolder: string): ProviderInUse | null {
  try {
    const own = readConfig(join(dataFolder, "config.json")).providers.find((p) => p && isOwn(p, dataFolder));
    if (!own) return null;
    const kind = (typeof own.kind === "string" ? own.kind : own.type === "anthropic" ? "anthropic" : "custom") as ProviderKind;
    return { kind, model: typeof own.model === "string" ? own.model : DEFAULT_MODEL, baseUrl: typeof own.baseUrl === "string" ? own.baseUrl : null };
  } catch { return null; }
}

/** The key a config entry names, trimmed; empty when the entry has no key file. */
export function readKey(entry: { apiKeyFile?: string }): string {
  if (!entry.apiKeyFile) return "";
  const key = readFileSync(entry.apiKeyFile, "utf8").trim();
  if (!key) throw new Error(`${entry.apiKeyFile} is empty`);
  return key;
}
