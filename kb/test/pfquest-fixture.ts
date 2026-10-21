import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeClientSnapshot } from "../src/client-snapshot.js";
import { PFQUEST_COMMIT } from "../src/importers/pfquest.js";

/** Hand-written pfQuest-shaped files, a few entries each: never copied from pfQuest. */
const FIXTURE = fileURLToPath(new URL("./fixtures/pfquest/", import.meta.url));

/** A copy of the fixture as a checkout whose HEAD is `commit` (the pinned one by default). */
export function pfquestCheckout(commit = PFQUEST_COMMIT): string {
  const dir = mkdtempSync(join(tmpdir(), "kb-pfquest-"));
  cpSync(FIXTURE, dir, { recursive: true });
  mkdirSync(join(dir, ".git"));
  writeFileSync(join(dir, ".git", "HEAD"), `${commit}\n`);
  return dir;
}

/** A client snapshot holding only the map tables: Elwynn (area 12) on UiMap 1429, Durotar (14) on 1411. */
export function mapSnapshot(): string {
  const path = join(mkdtempSync(join(tmpdir(), "kb-pfquest-client-")), "client.sqlite");
  const rows = (list: Record<string, unknown>[]) => new Map(list.map((r) => [Number(r.ID), r]));
  writeClientSnapshot(path, { product: "wow_classic_beta", buildConfig: "0".repeat(32), buildId: 1, version: "1.0.0.1", extractedAt: "2026-10-21T00:00:00Z", library: "test", definitions: null }, [
    { table: "UiMapAssignment", fileDataID: 1, cKey: null, encryptedBlocks: 0, rows: rows([
      { ID: 1, UiMapID: 1429, AreaID: 12, OrderIndex: 0 },
      { ID: 2, UiMapID: 1411, AreaID: 14, OrderIndex: 0 },
      { ID: 3, UiMapID: 9999, AreaID: 14, OrderIndex: 1 },
    ]) },
    { table: "AreaTable", fileDataID: 2, cKey: null, encryptedBlocks: 0, rows: rows([
      { ID: 12, ParentAreaID: 0 },
      { ID: 5000, ParentAreaID: 12 },
    ]) },
  ]);
  return path;
}
