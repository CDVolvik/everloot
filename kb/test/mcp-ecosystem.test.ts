import { afterEach, expect, test } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { buildView, currentForeverInterface, parseRegistry, type ProjectMetrics } from "../src/ecosystem.js";
import { createMcpHttpHandler } from "../src/mcp-http-server.js";
import type { EcosystemLoader } from "../src/mcp-server.js";

const databases: DB[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

const NOW = new Date("2026-10-20T12:00:00.000Z");
const metrics: ProjectMetrics = {
  status: "ok", fetchedAt: NOW.toISOString(), stars: 3, archived: false, license: "MIT", lastCommit: "2026-10-19T00:00:00.000Z",
  release: { tag: "v2", date: "2026-10-10T00:00:00.000Z", url: "https://github.com/o/a/releases/tag/v2" }, commits4w: 4, contributors: 1,
  openIssues: 0, closedIssues: 0, medianFirstResponseHours: null, responseSample: 0, interfaces: [16001],
};
const view = () => buildView(
  parseRegistry({ schema: 1, projects: [{ id: "a", name: "Synthetic", kind: "addon", summary: "A synthetic addon.", repo: "o/a", addonNames: ["Synth"], verifiedAt: "2026-10-18", evidence: "https://github.com/o/a" }] }),
  { schema: 1, refreshedAt: NOW.toISOString(), projects: { a: metrics }, history: {} },
  [{ name: "Synth", installs: 6 }], NOW, currentForeverInterface([{ product: "wow_classic_beta", version: "1.60.1.70450", buildId: 70450 }]),
);

function handler(ecosystem?: EcosystemLoader) {
  const db = openDb(":memory:");
  databases.push(db);
  return createMcpHttpHandler({ db, bearerToken: null, maxRequestBodyBytes: 4096, rateLimitPerMinute: 50, allowedOrigins: [], ecosystem });
}
const call = (method: string, params?: unknown) => new Request("http://localhost/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
});
const tool = async (h: ReturnType<typeof handler>, args: unknown) =>
  (await (await h(call("tools/call", { name: "ecosystem_projects", arguments: args }))).json()).result;

test("ecosystem_projects is listed read-only, with a title and bounded input", async () => {
  const listed = (await (await handler()(call("tools/list", {}))).json()).result.tools as {
    name: string; title: string; annotations: { readOnlyHint: boolean }; inputSchema: { properties: Record<string, { maximum?: number; minimum?: number; enum?: string[] }> };
  }[];
  const t = listed.find((x) => x.name === "ecosystem_projects")!;
  expect(t.title).toBe("WoW: Forever addons and open-source projects");
  expect(t.annotations.readOnlyHint).toBe(true);
  expect(t.inputSchema.properties.limit).toMatchObject({ minimum: 1, maximum: 25 });
  expect(t.inputSchema.properties.board.enum).toEqual(["all", "installed", "rising", "active", "release", "maintained"]);
  expect(listed.map((x) => x.name).filter((n) => n !== "population").slice(-2)).toEqual(["ecosystem_projects", "everloot_plan"]);
});

test("it answers from the view with installs, the repository link and the data age", async () => {
  const result = await tool(handler(() => view()), { board: "installed" });
  const text = result.content[0].text as string;
  expect(text).toContain("1. Synthetic [addon]: A synthetic addon.");
  expect(text).toContain("6 installs");
  expect(text).toContain("Repository: https://github.com/o/a");
  expect(text).toContain("GitHub data refreshed 2026-10-20");
});

test("without a tracker it says not connected, and a loader that throws is not a crash", async () => {
  expect((await tool(handler(), {})).content[0].text).toMatch(/not connected/);
  const boom = await tool(handler(() => { throw new Error("disk"); }), {});
  expect(boom.isError).not.toBe(true);
  expect(boom.content[0].text).toMatch(/not connected/);
});

test("out-of-range input is refused", async () => {
  const h = handler(() => view());
  expect((await tool(h, { limit: 26 })).isError).toBe(true);
  expect((await tool(h, { limit: 0 })).isError).toBe(true);
  expect((await tool(h, { board: "people" })).isError).toBe(true);
});
