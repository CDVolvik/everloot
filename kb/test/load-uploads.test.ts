import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { loadUploadRecords } from "../src/load-uploads.js";

test("reads record arrays and skips a corrupt file", () => {
  const dir = mkdtempSync(join(tmpdir(), "everloot-uploads-"));
  try {
    writeFileSync(join(dir, "a.json"), JSON.stringify({ records: [{ kind: "auction_scan", itemId: 1 }] }));
    writeFileSync(join(dir, "b.json"), "{");
    writeFileSync(join(dir, "c.txt"), "nope");
    expect(loadUploadRecords(dir)).toEqual([{ kind: "auction_scan", itemId: 1 }]);
    expect(loadUploadRecords(join(dir, "missing"))).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
