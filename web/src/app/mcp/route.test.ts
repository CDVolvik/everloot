import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { openDb } from "../../../../kb/src/db";
import { replaceSourceRows } from "../../../../kb/src/entities";
import { snapshot } from "../../../../kb/src/snapshot";

let release = "";

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "everloot-mcp-route-"));
  const source = openDb(join(dir, "source.sqlite"));
  await replaceSourceRows(source, "curated", ["lore_page"], [{
    kind: "lore_page", extId: "1", name: "Thrall", body: "Warchief of the Horde",
    gameVersion: "lore", sourceUrl: "https://example.test/thrall", retrievedAt: "2023-11-13",
  }]);
  release = join(dir, "release", "release.sqlite");
  snapshot(source, release, new Date("2026-10-09T00:00:00Z"));
  source.close();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function route(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string);
  return import("./route");
}

const initialize = (token?: string) => new Request("https://everloot.app/mcp", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
    protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "route-test", version: "0" },
  } }),
});

test("without a configured token the route refuses before opening anything", async () => {
  const { POST } = await route({ KB_SNAPSHOT_PATH: release, EVERLOOT_MCP_TOKEN: "" });
  expect((await POST(initialize("anything"))).status).toBe(503);
});

test("a missing release is unavailable, not an empty knowledge base", async () => {
  const { POST } = await route({ KB_SNAPSHOT_PATH: join(tmpdir(), "no-such-release.sqlite"), EVERLOOT_MCP_TOKEN: "test-token" });
  const response = await POST(initialize("test-token"));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Knowledge release unavailable" });
});

test("raw contributor files can never be mounted on the public route", async () => {
  const { POST } = await route({ KB_SNAPSHOT_PATH: release, EVERLOOT_MCP_TOKEN: "test-token", EVERLOOT_UPLOADS: "/tmp/raw" });
  expect((await POST(initialize("test-token"))).status).toBe(503);
});

test("bearer auth is required; with it the server initializes as everloot-knowledge", async () => {
  const { POST } = await route({ KB_SNAPSHOT_PATH: release, EVERLOOT_MCP_TOKEN: "test-token" });
  expect((await POST(initialize())).status).toBe(401);
  expect((await POST(initialize("wrong"))).status).toBe(401);
  const ok = await POST(initialize("test-token"));
  expect(ok.status).toBe(200);
  expect((await ok.json()).result.serverInfo.name).toBe("everloot-knowledge");
});
