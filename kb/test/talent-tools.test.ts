import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GAME_DATA_CREDIT, MCP_TOOLS, TALENT_CLASSES } from "@everloot/protocol";
import { afterEach, expect, test } from "vitest";
import { z } from "zod";
import { encodeBuild } from "../../web/src/lib/talents/share";
import { openDb, type DB } from "../src/db.js";
import { createKnowledgeServer } from "../src/mcp-server.js";
import { handleTalentPlan, handleTalentTree } from "../src/talent-tools.js";
import { siteCatalog, siteCatalogs } from "../src/talents/site-catalogs.js";

const treeOut = z.object(MCP_TOOLS.talent_tree.outputSchema);
const planOut = z.object(MCP_TOOLS.talent_plan.outputSchema);

const mage = siteCatalog("mage");
/** A legal mage plan: the first node of the first tree at full rank. */
function firstNode() {
  const tree = mage.trees[0];
  return mage.nodes.filter((n) => n.treeId === tree.id).sort((a, b) => a.row - b.row || a.col - b.col)[0];
}
const legalCode = () => encodeBuild({ classSlug: "mage", specId: mage.specId, build: mage.build, ranks: { [firstNode().id]: { rank: firstNode().maxRanks } } });

test("every class catalog the site ships parses, in the protocol's order", () => {
  const catalogs = siteCatalogs();
  expect(catalogs.map((c) => c.classSlug)).toEqual([...TALENT_CLASSES]);
  for (const c of catalogs) {
    expect(c.label).toBe("found in game files, unconfirmed");
    expect(c.nodes.length).toBeGreaterThan(10);
    expect(c.trees.length).toBe(3);
  }
});

test("talent_tree lists every node of the class with the build, the point levels and the credit", () => {
  const { text, structured } = handleTalentTree({ class: "mage" });
  const out = treeOut.parse(structured);
  expect(out.nodes.length).toBe(mage.nodes.length);
  expect(out.build).toBe(mage.build);
  expect(out.points.total).toBe(mage.rules.pointLevels?.length);
  expect(out.trees.reduce((sum, t) => sum + t.nodes, 0)).toBe(mage.nodes.length);
  expect(text).toContain(`build ${mage.build}`);
  expect(text).toContain("found in game files, unconfirmed");
  for (const tree of mage.trees) expect(text).toContain(`${tree.name} (`);
  expect(text.endsWith(GAME_DATA_CREDIT)).toBe(true);
  // The calculator page links last, before the credit.
  expect(text.endsWith(`\nMore: https://everloot.app/tools/talents/mage\n${GAME_DATA_CREDIT}`)).toBe(true);
  // A gate and a prerequisite are said in words where the catalog has them.
  const gated = mage.nodes.find((n) => n.unlock?.pointsInTree);
  if (gated) expect(text).toContain(`needs ${gated.unlock!.pointsInTree} in tree`);
  const after = mage.nodes.find((n) => n.prereqs.length > 0);
  if (after) expect(text).toContain("after ");
});

test("talent_tree narrows to one tree by name, case-insensitively, and names the trees when there is no such tree", () => {
  const tree = mage.trees[1];
  const { structured } = handleTalentTree({ class: "mage", tree: tree.name.toUpperCase() });
  const out = treeOut.parse(structured);
  expect(out.trees.map((t) => t.id)).toEqual([tree.id]);
  expect(out.nodes.every((n) => n.treeId === tree.id)).toBe(true);
  const none = handleTalentTree({ class: "mage", tree: "Nothing" });
  expect(none.text).toContain(`No tree named Nothing for Mage. Trees: ${mage.trees.map((t) => t.name).join(", ")}.`);
  expect(treeOut.parse(none.structured).nodes).toEqual([]);
});

test("talent_plan reads a legal code: talents, points per tree, the lowest level, the link, no problems", () => {
  const code = legalCode();
  const { text, structured } = handleTalentPlan({ code });
  const out = planOut.parse(structured);
  expect(out.ok).toBe(true);
  expect(out.class).toBe("mage");
  expect(out.pointsSpent).toBe(firstNode().maxRanks);
  expect(out.minLevel).toBe(mage.rules.pointLevels![firstNode().maxRanks - 1]);
  expect(out.talents).toEqual([{ id: firstNode().id, treeId: firstNode().treeId, name: firstNode().entries[0].name, rank: firstNode().maxRanks, maxRanks: firstNode().maxRanks }]);
  expect(out.byTree!.find((t) => t.id === firstNode().treeId)!.points).toBe(firstNode().maxRanks);
  expect(out.problems).toEqual([]);
  expect(out.link).toBe(`https://everloot.app/tools/talents/mage#plan=${code}`);
  expect(out.codeBuild).toBe(mage.build);
  expect(text).toContain(`${firstNode().entries[0].name} ${firstNode().maxRanks}/${firstNode().maxRanks}`);
  expect(text).not.toContain("Problem:");
  expect(text.endsWith(GAME_DATA_CREDIT)).toBe(true);
  // The build's own link: the calculator on this plan, with a preview card when shared.
  expect(text.endsWith(`\nMore: https://everloot.app/tools/talents/mage/b/${code}\n${GAME_DATA_CREDIT}`)).toBe(true);
});

test("talent_plan takes a calculator link and says what did not load: another build, an unknown node, a gated node", () => {
  const deep = mage.nodes.find((n) => n.unlock?.pointsInTree)!;
  const code = encodeBuild({ classSlug: "mage", specId: 0, build: "1.0.0.1", ranks: { 999999: { rank: 1 }, [deep.id]: { rank: 1 } } });
  const { text, structured } = handleTalentPlan({ code: `https://everloot.app/tools/talents/mage#plan=${code}` });
  const out = planOut.parse(structured);
  expect(out.ok).toBe(true);
  expect(out.codeBuild).toBe("1.0.0.1");
  expect(out.treeBuild).toBe(mage.build);
  expect(out.problems!.some((p) => p.startsWith("Made on game build 1.0.0.1"))).toBe(true);
  expect(out.problems!.some((p) => p.includes("node 999999"))).toBe(true);
  expect(out.problems!.some((p) => p.startsWith(`${deep.entries[0].name}: 1 point not placed.`))).toBe(true);
  expect(out.pointsSpent).toBe(0);
  for (const p of out.problems!) expect(text).toContain(`Problem: ${p}`);
});

test("talent_plan refuses what it cannot read, in the calculator's words", () => {
  const damaged = handleTalentPlan({ code: "EL1-mage-0-1.60.1.70450-!!!" });
  expect(planOut.parse(damaged.structured).ok).toBe(false);
  expect(damaged.text).not.toContain("More:");
  expect(damaged.text).toContain("not a share code");
  const newer = handleTalentPlan({ code: "EL9-mage-0-1.60.1.70450-" });
  expect(newer.text).toContain("newer version");
  const other = handleTalentPlan({ code: "EL1-monk-0-1.60.1.70450-" });
  expect(other.text).toContain("without a talent catalog: monk");
  expect(handleTalentPlan({ code: "   " }).text).toContain("Paste a share code");
});

const databases: DB[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

test("both tools answer over MCP with structured content of the declared shape", async () => {
  const db = openDb(":memory:");
  databases.push(db);
  const server = createKnowledgeServer(db);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const tree = await client.callTool({ name: "talent_tree", arguments: { class: "druid", tree: siteCatalog("druid").trees[0].name } });
  expect(tree.isError).not.toBe(true);
  expect(treeOut.parse(tree.structuredContent).class).toBe("druid");
  expect(JSON.stringify(tree.content)).toContain("More: https://everloot.app/tools/talents/druid");
  const plan = await client.callTool({ name: "talent_plan", arguments: { code: legalCode() } });
  expect(plan.isError).not.toBe(true);
  expect(planOut.parse(plan.structuredContent).ok).toBe(true);
  const bad = await client.callTool({ name: "talent_tree", arguments: { class: "monk" } });
  expect(bad.isError).toBe(true);
});
