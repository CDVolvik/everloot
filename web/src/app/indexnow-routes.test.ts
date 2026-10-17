import { afterEach, beforeEach, expect, test, vi } from "vitest";

const timeline = vi.hoisted(() => ({ entries: [] as { id: string; type: string; game: string; at: string; title: string; url: null }[] }));
vi.mock("@/lib/changes", () => ({ loadTimeline: () => timeline.entries }));

import { GET as cron } from "./api/cron/indexnow/route";
import { GET as keyFile } from "./indexnow.txt/route";

const send = vi.fn();
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "synthetic-cron-key");
  vi.stubEnv("INDEXNOW_KEY", "synthetic-test-key");
  send.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", send);
  timeline.entries = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const req = (auth = "Bearer synthetic-cron-key") => new Request("https://everloot.app/api/cron/indexnow", { headers: { authorization: auth } });

test("the key file serves INDEXNOW_KEY and is a 404 without one", async () => {
  const ok = keyFile();
  expect(ok.status).toBe(200);
  expect(await ok.text()).toBe("synthetic-test-key");
  vi.stubEnv("INDEXNOW_KEY", "");
  expect(keyFile().status).toBe(404);
});

test("the cron refuses a caller without the secret", async () => {
  expect((await cron(req("wrong"))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", "");
  expect((await cron(req())).status).toBe(503);
  expect(send).not.toHaveBeenCalled();
});

test("an empty change list sends no ping", async () => {
  const body = await (await cron(req())).json();
  expect(body).toMatchObject({ ok: true, urls: 0, sent: false });
  expect(send).not.toHaveBeenCalled();
});

test("a fresh entry sends one ping for the changes pages", async () => {
  timeline.entries = [{ id: "a", type: "post", game: "forever", at: new Date(Date.now() - 20 * 60_000).toISOString(), title: "t", url: null }];
  const body = await (await cron(req())).json();
  expect(body).toMatchObject({ ok: true, urls: 3, sent: true });
  expect(send).toHaveBeenCalledTimes(1);
});
