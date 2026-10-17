import { expect, test, vi } from "vitest";
import type { ChangeEntry } from "./changes";
import { changeUrlsToPing, indexNowKey, pingIndexNow } from "./indexnow";

const entry = (at: string): ChangeEntry => ({ id: at, type: "post", game: "forever", at, title: "t", url: null });
const now = new Date("2026-10-18T12:00:00Z");
const HOUR = 3_600_000;

test("the key comes from the environment and must look like an IndexNow key", () => {
  expect(indexNowKey({})).toBeNull();
  expect(indexNowKey({ INDEXNOW_KEY: "   " })).toBeNull();
  expect(indexNowKey({ INDEXNOW_KEY: "short" })).toBeNull();
  expect(indexNowKey({ INDEXNOW_KEY: "bad key with spaces!" })).toBeNull();
  expect(indexNowKey({ INDEXNOW_KEY: " synthetic-test-key " })).toBe("synthetic-test-key");
});

test("an empty change list pings nothing, however fresh the site looks", () => {
  expect(changeUrlsToPing([], now, 2 * HOUR)).toEqual([]);
});

test("nothing recent pings nothing, and a recent entry pings the changes pages", () => {
  expect(changeUrlsToPing([entry("2026-10-10T00:00:00Z")], now, 2 * HOUR)).toEqual([]);
  expect(changeUrlsToPing([entry("2026-10-18T11:30:00Z"), entry("2026-10-10T00:00:00Z")], now, 2 * HOUR)).toEqual([
    "https://everloot.app/changes", "https://everloot.app/changes/feed.xml", "https://everloot.app/wow-forever",
  ]);
  // An entry dated in the future is not "recent".
  expect(changeUrlsToPing([entry("2026-10-19T00:00:00Z")], now, 2 * HOUR)).toEqual([]);
});

test("no key or no URLs sends no request", async () => {
  const send = vi.fn();
  expect(await pingIndexNow(["https://everloot.app/changes"], { key: null, fetch: send })).toEqual({ sent: false, reason: "no-key" });
  expect(await pingIndexNow([], { key: "synthetic-test-key", fetch: send })).toEqual({ sent: false, reason: "no-urls" });
  expect(send).not.toHaveBeenCalled();
});

test("URLs on another host are dropped before sending", async () => {
  const send = vi.fn();
  expect(await pingIndexNow(["https://example.com/x", "not a url"], { key: "synthetic-test-key", fetch: send })).toEqual({ sent: false, reason: "no-urls" });
  expect(send).not.toHaveBeenCalled();
});

test("a ping names the host, the key and where the key file is, once per URL", async () => {
  const send = vi.fn(async () => new Response(null, { status: 202 }));
  const result = await pingIndexNow(["https://everloot.app/changes", "https://everloot.app/changes", "https://everloot.app/wow-forever"], { key: "synthetic-test-key", fetch: send as unknown as typeof fetch });
  expect(result).toEqual({ sent: true, status: 202, count: 2 });
  const [endpoint, init] = send.mock.calls[0] as unknown as [string, RequestInit];
  expect(endpoint).toBe("https://api.indexnow.org/indexnow");
  expect(JSON.parse(init.body as string)).toEqual({
    host: "everloot.app", key: "synthetic-test-key", keyLocation: "https://everloot.app/indexnow.txt",
    urlList: ["https://everloot.app/changes", "https://everloot.app/wow-forever"],
  });
});

test("a refusal or a network error is reported as not sent", async () => {
  const refused = async () => new Response(null, { status: 403 });
  expect(await pingIndexNow(["https://everloot.app/changes"], { key: "synthetic-test-key", fetch: refused as unknown as typeof fetch })).toEqual({ sent: false, reason: "failed", status: 403 });
  const down = async () => { throw new Error("offline"); };
  expect(await pingIndexNow(["https://everloot.app/changes"], { key: "synthetic-test-key", fetch: down as unknown as typeof fetch })).toEqual({ sent: false, reason: "failed" });
});
