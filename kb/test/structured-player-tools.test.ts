import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MCP_TOOLS } from "@everloot/protocol";
import { afterEach, expect, test } from "vitest";
import { z } from "zod";
import { auctionHistory, auctionSightingsFromRecords } from "../src/auction-history.js";
import { collectionFactsFromRecords, collectionGap } from "../src/collection-gap.js";
import { openDb, type DB } from "../src/db.js";
import { guildBoard, guildFactsFromRecords } from "../src/guild-board.js";
import { createKnowledgeServer } from "../src/mcp-server.js";

const OUT = {
  auction_history: z.object(MCP_TOOLS.auction_history.outputSchema),
  collection_gap: z.object(MCP_TOOLS.collection_gap.outputSchema),
  guild_board: z.object(MCP_TOOLS.guild_board.outputSchema),
};

const AS_OF = "2026-10-18T10:00:00.000Z";
const records: unknown[] = [];
for (const [i, installId] of ["a", "b", "c"].entries()) {
  records.push({ installId, capturedAt: `2026-10-1${i}T06:00:00Z`, eventId: `scan-${i}`, kind: "auction_scan", realm: "Forever", itemId: 5, copper: 100 + i, priceBasis: "unit" });
  records.push({ installId, capturedAt: "2026-10-12T06:00:00Z", eventId: `scan2-${i}`, kind: "auction_scan", realm: "Forever", itemId: 5, copper: 200, priceBasis: "unit" });
  records.push({ installId, kind: "collection_catalog", collection: "Mounts", source: "Vendor", itemId: 1 });
  records.push({ installId, kind: "collection_catalog", collection: "Mounts", source: "Drop", itemId: 2 });
  records.push({
    // Any 16 characters: the fact builder only checks the length. Not a real token, and not secret-shaped.
    installId, kind: "guild_snapshot", claimToken: "x".repeat(16), guildName: "Olympus", realm: "Forever",
    members: [{ name: "Ada", rank: "Officer", level: 60, class: "Mage" }, { name: "Bea", rank: "Member", level: 60, class: "Priest" }],
  });
}
records.push({ installId: "owner", kind: "collection_owned", collection: "Mounts", itemId: 1 });

const databases: DB[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

async function client(corpus?: () => Promise<{ records: unknown[]; dataAsOf: string } | null>) {
  const db = openDb(":memory:");
  databases.push(db);
  const server = createKnowledgeServer(db, corpus ? { corpus } : {});
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const c = new Client({ name: "test", version: "0" });
  await c.connect(clientSide);
  return c;
}

test("auction_history, collection_gap and guild_board answer with their result under the uploads envelope", async () => {
  const c = await client(async () => ({ records, dataAsOf: AS_OF }));

  const auctions = await c.callTool({ name: "auction_history", arguments: { realm: "Forever", itemId: 5 } });
  const auctionsOut = OUT.auction_history.parse(auctions.structuredContent);
  expect(auctionsOut).toEqual({ connected: true, dataAsOf: AS_OF, page: auctionHistory("Forever", 5, auctionSightingsFromRecords(records)) });
  expect(auctionsOut.page!.points).toEqual([{ day: "2026-10-12", copper: 200, reporters: 3 }]);
  expect(JSON.stringify(auctions.content)).toContain("2026-10-12  2s 0c  3 reporters");

  const gap = OUT.collection_gap.parse((await c.callTool({ name: "collection_gap", arguments: { collection: "Mounts", ownerInstallId: "owner" } })).structuredContent);
  expect(gap).toEqual({ connected: true, dataAsOf: AS_OF, page: collectionGap("Mounts", "owner", collectionFactsFromRecords(records)) });
  expect(gap.page).toMatchObject({ ownedRecorded: true, groups: [{ source: "Drop", owned: [], missing: [2] }, { source: "Vendor", owned: [1], missing: [] }] });

  const guild = OUT.guild_board.parse((await c.callTool({ name: "guild_board", arguments: { guildName: "Olympus", realm: "Forever" } })).structuredContent);
  expect(guild).toEqual({ connected: true, dataAsOf: AS_OF, page: guildBoard("Olympus", "Forever", guildFactsFromRecords(records)) });
  expect(guild.page).toMatchObject({ memberCount: 2, roster: [{ name: "Ada", rank: "Officer", level: 60, className: "Mage" }, { name: "Bea", rank: "Member", level: 60, className: "Priest" }], averageItemLevel: null });
});

test("a blank name keeps the text's refusal and a page with nothing agreed; no corpus is not connected", async () => {
  const c = await client(async () => ({ records, dataAsOf: AS_OF }));
  const blank = await c.callTool({ name: "guild_board", arguments: { guildName: " ", realm: "Forever" } });
  expect(JSON.stringify(blank.content)).toContain("Name a guild.");
  expect(OUT.guild_board.parse(blank.structuredContent).page).toMatchObject({ memberCount: null, roster: [] });
  const off = OUT.auction_history.parse((await (await client()).callTool({ name: "auction_history", arguments: { realm: "Forever", itemId: 5 } })).structuredContent);
  expect(off.connected).toBe(false);
  expect(off).not.toHaveProperty("page");
});
