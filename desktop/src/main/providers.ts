import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Chat page's "use my Anthropic key". The key goes into its own file in the data folder, the
 * way the companion requires (a key inside config.json is refused there), and config.json gets one
 * anthropic entry pointing at it. Other entries in config.json are kept as they are.
 */
export const KEY_FILE = "anthropic.key";
export const DEFAULT_MODEL = "claude-sonnet-5-5";

type Entry = Record<string, unknown>;

function readConfig(path: string): { providers: Entry[]; rest: Record<string, unknown> } {
  if (!existsSync(path)) return { providers: [], rest: {} };
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const { providers, ...rest } = raw;
  return { providers: Array.isArray(providers) ? (providers as Entry[]) : [], rest };
}

function writeConfig(path: string, providers: Entry[], rest: Record<string, unknown>): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify({ ...rest, providers }, null, 2) + "\n");
  renameSync(`${path}.tmp`, path);
}

/** Anthropic keys start with sk-ant-; anything else is most likely a paste of the wrong thing. */
export function looksLikeAnthropicKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key);
}

export function setAnthropicKey(dataFolder: string, key: string, model = DEFAULT_MODEL): string {
  const trimmed = key.trim();
  if (!looksLikeAnthropicKey(trimmed)) throw new Error("That does not look like an Anthropic key (they start with sk-ant-)");
  mkdirSync(dataFolder, { recursive: true });
  const keyFile = join(dataFolder, KEY_FILE);
  writeFileSync(`${keyFile}.tmp`, trimmed + "\n", { mode: 0o600 });
  renameSync(`${keyFile}.tmp`, keyFile);
  const config = join(dataFolder, "config.json");
  const { providers, rest } = readConfig(config);
  const entry: Entry = { type: "anthropic", apiKeyFile: keyFile, model };
  const i = providers.findIndex((p) => p && p.type === "anthropic");
  if (i >= 0) providers[i] = { ...providers[i], ...entry }; else providers.unshift(entry);
  writeConfig(config, providers, rest);
  return keyFile;
}

/** Removes the key file and the anthropic entry; an entry that points at another key file is left alone. */
export function removeAnthropicKey(dataFolder: string): void {
  const keyFile = join(dataFolder, KEY_FILE);
  const config = join(dataFolder, "config.json");
  if (existsSync(config)) {
    const { providers, rest } = readConfig(config);
    const kept = providers.filter((p) => !(p && p.type === "anthropic" && p.apiKeyFile === keyFile));
    if (kept.length !== providers.length) writeConfig(config, kept, rest);
  }
  rmSync(keyFile, { force: true });
}

/** Whether the app's own key file is the one config.json uses. */
export function hasOwnAnthropicKey(dataFolder: string): boolean {
  const keyFile = join(dataFolder, KEY_FILE);
  if (!existsSync(keyFile)) return false;
  try { return readConfig(join(dataFolder, "config.json")).providers.some((p) => p && p.type === "anthropic" && p.apiKeyFile === keyFile); }
  catch { return false; }
}
