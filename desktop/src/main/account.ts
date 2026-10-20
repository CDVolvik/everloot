import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Account } from "../shared/types";

/**
 * The player's everloot.app account, as one of its free API keys (made after Battle.net sign-in on
 * /docs/api/keys). It goes to the site's public MCP server with Chat and the in-game /ask, which raises their
 * limits; uploads never carry it. Kept in a file in the data folder, like the provider keys.
 */
export const ACCOUNT_KEY_FILE = "everloot-key.txt";
/** The site's key shape (web/src/lib/api-keys.ts KEY_PATTERN). */
export const EVERLOOT_KEY = /^evl_[a-f0-9]{64}$/;

const keyPath = (dataFolder: string) => join(dataFolder, ACCOUNT_KEY_FILE);

export function readAccountKey(dataFolder: string): string | null {
  try {
    const key = readFileSync(keyPath(dataFolder), "utf8").trim();
    return EVERLOOT_KEY.test(key) ? key : null;
  } catch { return null; }
}

export function accountInfo(dataFolder: string): Account {
  const key = readAccountKey(dataFolder);
  return key ? { signedIn: true, hint: key.slice(-4) } : { signedIn: false, hint: null };
}

/**
 * Checks the key with the site before keeping it: one market request with a realm the site refuses,
 * so it costs one request on the key and reads nothing. 401 is a wrong or revoked key.
 */
export async function signIn(dataFolder: string, endpoint: string, raw: string, send: typeof fetch = fetch): Promise<Account> {
  const key = raw.trim();
  if (!EVERLOOT_KEY.test(key)) throw new Error("That is not an Everloot key. It starts with evl_ and is shown once when you make it on everloot.app.");
  let status: number;
  try {
    const res = await send(`${endpoint.replace(/\/$/, "")}/api/market/prices?realm=!`, {
      headers: { authorization: `Bearer ${key}`, "user-agent": "everloot-desktop" },
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
  } catch {
    throw new Error("Could not reach everloot.app to check the key. Try again in a moment.");
  }
  if (status === 401) throw new Error("everloot.app does not know that key, or it was revoked. Make a new one.");
  if (status === 429) throw new Error("That key has used its requests for this hour. Try again later.");
  if (status >= 500) throw new Error(`everloot.app could not check the key (${status}). Try again in a moment.`);
  mkdirSync(dataFolder, { recursive: true });
  writeFileSync(`${keyPath(dataFolder)}.tmp`, key + "\n", { mode: 0o600 });
  renameSync(`${keyPath(dataFolder)}.tmp`, keyPath(dataFolder));
  return accountInfo(dataFolder);
}

/** The site's refusal of the account key, in place of the transport's raw error; other errors pass through. */
export function explainKeyError(message: string): string {
  if (/API key is not valid or was revoked/.test(message)) return "everloot.app refused your account key; it may have been revoked. Paste a new one under Settings > Account, or sign out there to ask without it.";
  if (/This account's keys have used their/.test(message)) return "Your account's keys have used their requests for this hour. Try again later, or sign out under Settings > Account to ask without the key.";
  return message;
}

/** Forgets the key on this computer. The key itself stays on the account until it is revoked on everloot.app. */
export function signOut(dataFolder: string): Account {
  if (existsSync(keyPath(dataFolder))) rmSync(keyPath(dataFolder));
  return accountInfo(dataFolder);
}
