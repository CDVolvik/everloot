/**
 * Read client tables of the current build of a product from Blizzard's CDN: the files the launcher
 * downloads for every player. Encrypted blocks are skipped, never decrypted: this module loads no
 * decryption keys and no listfile (tables are found by their stable file data ids).
 */
import { CASCClient, DBDParser, WDCReader } from "@rhyster/wow-casc-dbc";
import { CLIENT_TABLES, type ExtractedTable } from "./client-snapshot.js";

/** The extraction library and version, recorded in every manifest. Kept equal to kb's pinned dependency (tested). */
export const CASC_LIBRARY = "@rhyster/wow-casc-dbc@2.16.15";

export interface TableRead {
  cKey: string | null;
  encryptedBlocks: number;
  rows: Map<number, Record<string, unknown>>;
}

/** Where tables come from: Blizzard's CDN in production, a fake in tests. Null: not in this build. */
export interface TableSource {
  read(fileDataID: number): Promise<TableRead | null>;
}

export async function extractTables(source: TableSource): Promise<{ tables: ExtractedTable[]; missing: string[] }> {
  const tables: ExtractedTable[] = [];
  const missing: string[] = [];
  for (const [table, fileDataID] of Object.entries(CLIENT_TABLES)) {
    const read = await source.read(fileDataID);
    if (read) tables.push({ table, fileDataID, ...read });
    else missing.push(table);
  }
  return { tables, missing };
}

export interface CdnBuild {
  product: string;
  buildConfig: string;
  buildId: number;
  version: string;
}

/** The product's current build on Blizzard's CDN, and a table source for it. */
export async function openCdn(product: string, region = "us"): Promise<{ build: CdnBuild; source: TableSource }> {
  const version = await CASCClient.getProductVersion(region, product);
  if (!version) throw new Error(`${product} has no version on the ${region} CDN`);
  const client = new CASCClient(region, product, version, 0);
  await client.init();
  const source: TableSource = {
    async read(fileDataID) {
      const keys = client.getContentKeysByFileDataID(fileDataID);
      if (!keys?.length) return null;
      const chosen = keys.find((k) => k.localeFlags & CASCClient.LocaleFlags.enUS) ?? keys[0];
      const result = await client.getFileByContentKey(chosen.cKey, true);
      const reader = new WDCReader(result.buffer, result.blocks ?? []);
      const parser = await DBDParser.parse(reader);
      const rows = new Map<number, Record<string, unknown>>();
      for (const id of parser.getAllIDs()) {
        const row = parser.getRowData(id);
        if (row) rows.set(id, row as Record<string, unknown>);
      }
      return { cKey: chosen.cKey, encryptedBlocks: result.blocks?.length ?? 0, rows };
    },
  };
  return {
    build: { product, buildConfig: version.BuildConfig, buildId: Number(version.BuildId), version: version.VersionsName },
    source,
  };
}
