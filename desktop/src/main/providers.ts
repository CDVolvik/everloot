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

/** Which preset an app entry belongs to. */
function kindOf(p: Entry): ProviderKind {
  return (typeof p.kind === "string" ? p.kind : p.type === "anthropic" ? "anthropic" : "custom") as ProviderKind;
}

const inUse = (p: Entry): ProviderInUse => ({ kind: kindOf(p), model: typeof p.model === "string" ? p.model : DEFAULT_MODEL, baseUrl: typeof p.baseUrl === "string" ? p.baseUrl : null });

/**
 * Writes the key file (if any) and the config entry for one provider, and makes it the one in use
 * (first in config.json). The app keeps one entry per provider, so a player can hold an Anthropic
 * key and an OpenRouter key and switch between them. A provider already saved can change model or
 * address without the key being pasted again.
 */
export function setProvider(dataFolder: string, choice: ProviderChoice): ProviderInUse {
  const preset = presetFor(choice.kind);
  if (!preset) throw new Error(`Unknown provider ${String(choice.kind)}`);
  const key = (choice.key ?? "").trim();
  const model = (choice.model ?? "").trim() || preset.models[0]?.id || "";
  if (!MODEL_ID.test(model)) throw new Error(model ? "That does not look like a model id" : "Pick or type a model");
  const baseUrl = preset.kind === "custom" ? (choice.baseUrl ?? "").trim().replace(/\/$/, "") : preset.baseUrl;
  if (preset.kind !== "anthropic" && !/^https?:\/\/\S+$/.test(baseUrl ?? "")) throw new Error("The server needs an http(s) address");

  const config = join(dataFolder, "config.json");
  const { providers, rest } = readConfig(config);
  const old = providers.find((p) => p && isOwn(p, dataFolder) && kindOf(p) === preset.kind);
  const savedKey = typeof old?.apiKeyFile === "string" && existsSync(old.apiKeyFile) ? old.apiKeyFile : undefined;
  if (key && preset.keyPattern && !preset.keyPattern.test(key)) throw new Error(`That does not look like the right key. ${preset.keyHint}`);
  if (preset.keyFile && preset.kind !== "custom" && !key && !savedKey) throw new Error(`Paste the key first. ${preset.keyHint}`);
  if (key && key.length > 500) throw new Error("That is too long for a key");

  mkdirSync(dataFolder, { recursive: true });
  let keyFile = key ? undefined : savedKey;
  if (preset.keyFile && key) {
    keyFile = join(dataFolder, preset.keyFile);
    writeFileSync(`${keyFile}.tmp`, key + "\n", { mode: 0o600 });
    renameSync(`${keyFile}.tmp`, keyFile);
  }
  const entry: Entry = preset.kind === "anthropic"
    ? { type: "anthropic", apiKeyFile: keyFile, model, source: OWNER }
    : { type: "openai-compatible", baseUrl, model, ...(keyFile ? { apiKeyFile: keyFile } : {}), source: OWNER, kind: preset.kind };
  writeConfig(config, [entry, ...providers.filter((p) => p !== old)], rest);
  return { kind: preset.kind, model, baseUrl: baseUrl ?? null };
}

/** Puts a saved provider first with the model picked, from the Chat page's model menu. No key is touched. */
export function useModel(dataFolder: string, kind: ProviderKind, model: string): ProviderInUse {
  const config = join(dataFolder, "config.json");
  const { providers, rest } = readConfig(config);
  const own = providers.find((p) => p && isOwn(p, dataFolder) && kindOf(p) === kind);
  if (!own) throw new Error(`No ${presetFor(kind)?.label ?? kind} key is saved; add it first`);
  if (!MODEL_ID.test(model)) throw new Error("That does not look like a model id");
  const entry = { ...own, model };
  writeConfig(config, [entry, ...providers.filter((p) => p !== own)], rest);
  return inUse(entry);
}

/** Deletes the key file the app wrote for an entry, never one the player named elsewhere. */
function removeKeyFile(dataFolder: string, entry: Entry | undefined): void {
  const file = entry?.apiKeyFile;
  if (typeof file === "string" && resolve(dirname(file)) === resolve(dataFolder)) rmSync(file, { force: true });
}

/**
 * Removes one of the app's entries (the given provider, else the first the app wrote) and its key
 * file; entries the player wrote by hand are left alone.
 */
export function removeProvider(dataFolder: string, kind?: ProviderKind): void {
  const config = join(dataFolder, "config.json");
  if (!existsSync(config)) return;
  const { providers, rest } = readConfig(config);
  const own = providers.find((p) => p && isOwn(p, dataFolder) && (!kind || kindOf(p) === kind));
  if (!own) return;
  writeConfig(config, providers.filter((p) => p !== own), rest);
  removeKeyFile(dataFolder, own);
}

/** Every provider the app wrote, in config.json's order (the first in the file answers). */
export function ownProviders(dataFolder: string): ProviderInUse[] {
  try {
    return readConfig(join(dataFolder, "config.json")).providers.filter((p) => p && isOwn(p, dataFolder)).map(inUse);
  } catch { return []; }
}

/** The provider in use when it is one the app wrote: the first entry in config.json. Null for none or a hand-written first entry. */
export function ownProvider(dataFolder: string): ProviderInUse | null {
  try {
    const first = readConfig(join(dataFolder, "config.json")).providers[0];
    return first && isOwn(first, dataFolder) ? inUse(first) : null;
  } catch { return null; }
}

/** The key a config entry names, trimmed; empty when the entry has no key file. */
export function readKey(entry: { apiKeyFile?: string }): string {
  if (!entry.apiKeyFile) return "";
  const key = readFileSync(entry.apiKeyFile, "utf8").trim();
  if (!key) throw new Error(`${entry.apiKeyFile} is empty`);
  return key;
}
