import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { ACCOUNT_KEY_FILE, accountInfo, explainKeyError, readAccountKey, signIn, signOut } from "../src/main/account";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-account-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const KEY = `evl_${"ab12".repeat(16)}`;
const answering = (status: number) => vi.fn(async () => new Response("{}", { status })) as unknown as typeof fetch;

test("a key the site accepts is kept in the data folder and shown by its last four characters", async () => {
  const d = dir();
  const send = answering(400);
  expect(await signIn(d, "https://everloot.app/", `  ${KEY}\n`, send)).toEqual({ signedIn: true, hint: "ab12" });
  expect(readFileSync(join(d, ACCOUNT_KEY_FILE), "utf8").trim()).toBe(KEY);
  expect(readAccountKey(d)).toBe(KEY);
  const [url, init] = (send as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(url).toBe("https://everloot.app/api/market/prices?realm=!");
  expect(init.headers.authorization).toBe(`Bearer ${KEY}`);
});

test("a key that is not one, or that the site refuses, is not kept", async () => {
  const d = dir();
  const send = answering(400);
  await expect(signIn(d, "https://everloot.app", "sk-ant-123", send)).rejects.toThrow(/not an Everloot key/);
  expect(send).not.toHaveBeenCalled();
  await expect(signIn(d, "https://everloot.app", KEY, answering(401))).rejects.toThrow(/revoked/);
  await expect(signIn(d, "https://everloot.app", KEY, answering(503))).rejects.toThrow(/could not check/);
  await expect(signIn(d, "https://everloot.app", KEY, vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch)).rejects.toThrow(/Could not reach/);
  expect(existsSync(join(d, ACCOUNT_KEY_FILE))).toBe(false);
  expect(accountInfo(d)).toEqual({ signedIn: false, hint: null });
});

test("sign out forgets the key; a damaged key file counts as signed out", async () => {
  const d = dir();
  await signIn(d, "https://everloot.app", KEY, answering(200));
  expect(signOut(d)).toEqual({ signedIn: false, hint: null });
  expect(existsSync(join(d, ACCOUNT_KEY_FILE))).toBe(false);
  expect(signOut(d)).toEqual({ signedIn: false, hint: null });
  writeFileSync(join(d, ACCOUNT_KEY_FILE), "not a key\n");
  expect(readAccountKey(d)).toBeNull();
});

test("the site's refusal of the key reads as what to do; other errors pass through", () => {
  const raw = 'Streamable HTTP error: Error POSTing to endpoint: {"ok":false,"error":"This API key is not valid or was revoked. Make a new one at https://everloot.app/connect#keys."}';
  expect(explainKeyError(raw)).toMatch(/^everloot.app refused your account key/);
  expect(explainKeyError("fetch failed")).toBe("fetch failed");
});
