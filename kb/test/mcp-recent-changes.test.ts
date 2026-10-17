import { afterEach, expect, test } from "vitest";
import type { BluePost } from "../src/blue-posts.js";
import { buildTimeline } from "../src/changes.js";
import { openDb, type DB } from "../src/db.js";
import { createMcpHttpHandler } from "../src/mcp-http-server.js";
import type { ChangesLoader } from "../src/mcp-server.js";

const databases: DB[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

const post: BluePost = {
  id: "forum:1", source: "forum", url: "https://us.forums.blizzard.com/en/wow/t/synthetic/1", title: "Synthetic beta notice",
  author: "Linxy", role: "Community Manager", postedAt: "2026-10-16T22:00:00.000Z", editedAt: null,
  category: "WoW: Forever Beta Discussion", game: "forever", kind: "post", excerpt: "A short excerpt.", firstSeen: "2026-10-17T00:00:00.000Z",
};

function handler(changes?: ChangesLoader) {
  const db = openDb(":memory:");
  databases.push(db);
  return createMcpHttpHandler({ db, bearerToken: null, maxRequestBodyBytes: 4096, rateLimitPerMinute: 50, allowedOrigins: [], changes });
}

const call = (method: string, params?: unknown) => new Request("http://localhost/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
});

test("recent_changes is listed with a title and the read-only hint, like the other tools", async () => {
  const listed = (await (await handler()(call("tools/list", {}))).json()).result.tools as { name: string; title: string; annotations: { readOnlyHint: boolean } }[];
  const tool = listed.find((t) => t.name === "recent_changes")!;
  expect(tool.title).toBe("Recent official changes for WoW: Forever");
  expect(tool.annotations.readOnlyHint).toBe(true);
  for (const t of listed) expect(t.annotations.readOnlyHint, t.name).toBe(true);
});

test("recent_changes answers from the timeline with the original link", async () => {
  const handle = handler(() => buildTimeline([post], []));
  const answer = await (await handle(call("tools/call", { name: "recent_changes", arguments: { filter: "posts" } }))).json();
  const text = answer.result.content[0].text as string;
  expect(text).toContain("Synthetic beta notice");
  expect(text).toContain("Original: https://us.forums.blizzard.com/en/wow/t/synthetic/1");
});

test("recent_changes without a timeline says it is not connected", async () => {
  const answer = await (await handler()(call("tools/call", { name: "recent_changes", arguments: {} }))).json();
  expect(answer.result.content[0].text).toMatch(/not connected/);
});

test("a loader that throws is reported as not connected, not as a crash", async () => {
  const answer = await (await handler(() => { throw new Error("disk"); })(call("tools/call", { name: "recent_changes", arguments: {} }))).json();
  expect(answer.result.isError).not.toBe(true);
  expect(answer.result.content[0].text).toMatch(/not connected/);
});
