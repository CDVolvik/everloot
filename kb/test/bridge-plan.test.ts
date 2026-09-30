import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { expect, test } from "vitest";
import { BRIDGE_PLAN, handlePlan, planIds, renderTracker } from "../src/bridge-plan.js";
import { openDb } from "../src/db.js";
import { startHttpBridge } from "../src/mcp-http.js";

test("every tracker row has a unique id", () => {
  const ids = planIds();
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain("mcp.everloot_plan");
  expect(ids).toContain("mcp.http_local");
  expect(ids).toContain("ops.beta_guild");
});

test("the markdown file is the plan, not a second list", () => {
  const disk = readFileSync(new URL("../../docs/TRACKER.md", import.meta.url), "utf8");
  expect(disk.trim()).toBe(renderTracker().trim());
  expect(handlePlan()).toContain("Hakoovak");
  expect(handlePlan()).toContain("not the Forever beta character");
});

test("live, next, waiting, and shape rows are all present", () => {
  const counts = Object.fromEntries(
    (["live", "next", "waiting", "shape"] as const).map((status) => [
      status,
      BRIDGE_PLAN.filter((row) => row.status === status).length,
    ]),
  );
  expect(counts.live).toBeGreaterThan(0);
  expect(counts.next).toBeGreaterThan(0);
  expect(counts.waiting).toBeGreaterThan(0);
  expect(counts.shape).toBeGreaterThan(0);
});

test("loopback HTTP MCP answers initialize and lists everloot_plan", async () => {
  const db = openDb(":memory:");
  const http = await startHttpBridge(db, 0);
  const { port } = http.address() as AddressInfo;
  try {
    const init = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "everloot-test", version: "0" },
        },
      }),
    });
    expect(init.status).toBe(200);
    const initBody = await init.json();
    expect(initBody.result.serverInfo.name).toBe("everloot-knowledge");

    const listed = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    expect(listed.status).toBe(200);
    const tools = await listed.json();
    const names = tools.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain("everloot_plan");
    expect(names).toContain("search_knowledge");
    expect(names).toContain("profession_path");
    expect(names).toContain("item_page");
    expect(names).toContain("npc_page");
    expect(names).toContain("quest_page");
    expect(names).toContain("vendor_page");
    expect(names).toContain("collection_gap");
    expect(names).toContain("guild_board");
    expect(names).toContain("auction_history");
  } finally {
    http.close();
    await once(http, "close");
  }
});
