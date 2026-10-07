import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { loadUploadRecords } from "../src/load-uploads.js";

test("reads record arrays and skips a corrupt file", () => {
  const dir = mkdtempSync(join(tmpdir(), "everloot-uploads-"));
  try {
    const row = { kind: "auction_scan", itemId: 1, eventId: "event:1", installId: "install-one",
      capturedAt: "2026-10-07T00:00:00Z", realm: "Moon Guard", copper: 50 };
    writeFileSync(join(dir, "a.json"), JSON.stringify({ records: [row, { kind: "auction_scan", itemId: 1 }] }));
    writeFileSync(join(dir, "b.json"), "{");
    writeFileSync(join(dir, "c.txt"), "nope");
    expect(loadUploadRecords(dir)).toEqual([row]);
    expect(loadUploadRecords(join(dir, "missing"))).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
