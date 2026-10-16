import { afterEach, expect, test } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { replaceSourceRows } from "../src/entities.js";
import { createMcpHttpHandler } from "../src/mcp-http-server.js";
import { TOOL_KINDS, fromTooledUploads } from "../src/mcp-server.js";
import { handleProfessionPath } from "../src/profession-path.js";
import { handleRecipeThresholds, pathFactsFromRecords, recipeFactsFromRecords } from "../src/recipe-thresholds.js";

const databases: DB[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

/** Regression for PR #47 dropping PR #45's vendor-price wiring. */
test("profession_path and recipe_thresholds read vendor records", () => {
  expect(TOOL_KINDS.profession_path).toContain("vendor");
  expect(TOOL_KINDS.recipe_thresholds).toContain("vendor");
});

const recipeSeen = (installId: string) => ({
  kind: "recipe_seen",
  installId,
  profession: "Alchemy",
  recipe: "Minor Healing Potion",
  skillMin: 1,
  skillMax: 10,
  points: 1,
  reagents: [{ item: "Empty Vial", count: 1 }],
});

const recipeObserved = (installId: string, rank: number, difficulty: string) => ({
  kind: "recipe_observed",
  installId,
  profession: "Alchemy",
  recipe: "Lesser Healing Potion",
  rank,
  difficulty,
  reagents: [{ item: "Empty Vial", count: 1 }],
});

const vendorOffer = (installId: string) => ({
  kind: "vendor",
  installId,
  vendorNpcId: 80,
  items: [{ itemId: 3371, priceCopper: 20 }],
});

const namedVial = (installId: string) => ({ kind: "item_seen", installId, itemId: 3371, name: "Empty Vial" });

const pathCorpus = ["a", "b", "c"].flatMap((id) => [recipeSeen(id), vendorOffer(id), namedVial(id)]);

const thresholdsCorpus = [
  recipeObserved("install-a", 50, "optimal"),
  recipeObserved("install-b", 60, "medium"),
  recipeObserved("install-c", 70, "easy"),
  ...["install-a", "install-b", "install-c"].flatMap((id) => [vendorOffer(id), namedVial(id)]),
];

test("a vendor-only reagent price reaches the profession_path output through the memoized facts path", async () => {
  const loader = async () => ({ records: pathCorpus, dataAsOf: "2026-10-20T06:30:00.000Z" });
  const text = await fromTooledUploads(
    "profession_path",
    (facts: ReturnType<typeof pathFactsFromRecords>) =>
      handleProfessionPath(
        { profession: "Alchemy", fromSkill: 1, toSkill: 2 },
        facts.sightings,
        facts.prices,
        facts.derived,
        facts.vendorPrices,
      ),
    loader,
  );
  expect(text).toContain("Empty Vial");
  expect(text).toContain("estimated 20c");
  expect(text).not.toContain("no agreed price yet");
});

test("a vendor-only reagent price reaches the recipe_thresholds output through the memoized facts path", async () => {
  const loader = async () => ({ records: thresholdsCorpus, dataAsOf: "2026-10-21T06:30:00.000Z" });
  const text = await fromTooledUploads(
    "recipe_thresholds",
    (facts: ReturnType<typeof recipeFactsFromRecords>) =>
      handleRecipeThresholds({ profession: "Alchemy" }, facts.observations, facts.prices, facts.vendorPrices),
    loader,
  );
  expect(text).toContain("Empty Vial");
  expect(text).toContain("Estimated cost per craft: 20c");
});

async function httpHandler(corpus: unknown[], dataAsOf: string) {
  const db = openDb(":memory:");
  databases.push(db);
  await replaceSourceRows(db, "curated", ["lore_page"], [{
    kind: "lore_page", extId: "1", name: "Thrall", body: "Warchief",
    gameVersion: "lore", sourceUrl: "https://example.test/thrall", retrievedAt: "2023-11-13",
  }]);
  return createMcpHttpHandler({
    db,
    bearerToken: "test-token",
    maxRequestBodyBytes: 8192,
    rateLimitPerMinute: 60,
    allowedOrigins: ["https://chatgpt.com"],
    corpus: async () => ({ records: corpus, dataAsOf }),
  });
}

function mcpRequest(method: string, params?: unknown) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function callTool(handle: (req: Request) => Promise<Response>, name: string, args: unknown): Promise<string> {
  await handle(mcpRequest("initialize", {
    protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" },
  }));
  const res = await handle(mcpRequest("tools/call", { name, arguments: args }));
  expect(res.status).toBe(200);
  const body = await res.json() as { result: { isError?: boolean; content: { text: string }[] } };
  expect(body.result.isError).not.toBe(true);
  return body.result.content[0]!.text;
}

test("the mcp-server profession_path handler serves a vendor-only reagent price", async () => {
  const handle = await httpHandler(pathCorpus, "2026-10-22T06:30:00.000Z");
  const text = await callTool(handle, "profession_path", { profession: "Alchemy", fromSkill: 1, toSkill: 2 });
  expect(text).toContain("Empty Vial");
  expect(text).toContain("estimated 20c");
});

test("the mcp-server recipe_thresholds handler serves a vendor-only reagent price", async () => {
  const handle = await httpHandler(thresholdsCorpus, "2026-10-23T06:30:00.000Z");
  const text = await callTool(handle, "recipe_thresholds", { profession: "Alchemy" });
  expect(text).toContain("Empty Vial");
  expect(text).toContain("Estimated cost per craft: 20c");
});
