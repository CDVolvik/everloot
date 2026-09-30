import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { startHttpBridge } from "../src/mcp-http.js";

const initBody = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "everloot-test", version: "0" } },
});

async function post(port: number, authorization?: string) {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(authorization ? { authorization } : {}),
    },
    body: initBody,
  });
}

test("a token rejects a missing or wrong bearer and accepts the right one", async () => {
  const http = await startHttpBridge(openDb(":memory:"), 0, { token: "guild-key" });
  const { port } = http.address() as AddressInfo;
  try {
    expect((await post(port)).status).toBe(401);
    expect((await post(port, "Bearer no")).status).toBe(401);
    expect((await post(port, "Bearer guild-key")).status).toBe(200);
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    expect(await health.text()).toBe("ok");
  } finally {
    http.close();
    await once(http, "close");
  }
});

test("an empty token locks the handler instead of leaving it open", async () => {
  const http = await startHttpBridge(openDb(":memory:"), 0, { token: "" });
  const { port } = http.address() as AddressInfo;
  try {
    expect((await post(port, "Bearer ")).status).toBe(401);
  } finally {
    http.close();
    await once(http, "close");
  }
});
