import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { rehearseRestore } from "./restore-rehearsal";

const loot = (eventId: string, installId = "install-aaaa") => ({
  kind: "loot", eventId, installId, capturedAt: "2026-10-10T00:00:00.000Z",
  sourceNpcId: 42, sourceEvidence: "loot-api", items: [{ itemId: 5, count: 1 }],
});

function mirror(uploads: Record<string, unknown[]>, snapshot: unknown[]) {
  const dir = mkdtempSync(join(tmpdir(), "everloot-mirror-"));
  for (const [name, records] of Object.entries(uploads)) {
    mkdirSync(join(dir, "uploads", "2026-10-10"), { recursive: true });
    writeFileSync(join(dir, "uploads", "2026-10-10", name), JSON.stringify({ addonVersion: "0.2.2", records }));
  }
  mkdirSync(join(dir, "snapshots"), { recursive: true });
  writeFileSync(join(dir, "snapshots", "corpus.json"), JSON.stringify({ records: snapshot }));
  return dir;
}

test("raw uploads rebuild every event the backed-up snapshot published", async () => {
  const dir = mirror({ "a.json": [loot("e:1")], "b.json": [loot("e:2", "install-bbbb")] }, [loot("e:1")]);
  const result = await rehearseRestore(dir);
  expect(result).toMatchObject({ ok: true, uploads: 2, rebuilt: 2, snapshot: 1, missing: [] });
});

test("an event in the snapshot that no raw upload can rebuild fails the rehearsal", async () => {
  const dir = mirror({ "a.json": [loot("e:1")] }, [loot("e:1"), loot("e:9")]);
  const result = await rehearseRestore(dir);
  expect(result.ok).toBe(false);
  expect(result.missing).toEqual(["install-aaaa|e:9"]);
});

test("an empty bucket rehearses as an empty, consistent restore", async () => {
  expect(await rehearseRestore(mirror({}, []))).toMatchObject({ ok: true, uploads: 0, rebuilt: 0, snapshot: 0 });
});
