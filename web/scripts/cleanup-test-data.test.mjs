import { expect, test } from "vitest";
import { cleanupTestData } from "./launch-maintenance.mjs";

const id = "1d694078-785b-4812-8466-69fcf7c8670b";
const key = `uploads/2026-10-04/${id}.json`;

function fixture(installId = "e2e-test-20261004", backupFails = false, backupExists = false) {
  let uploads = [{ id, install_id: installId, object_key: key, record_count: 1 }];
  let waitlist = [{ email: "e2e-test@everloot.app", tool_slug: "e2e-test" }];
  let objectExists = true;
  const actions = [];
  return { actions,
    rest: async (path, init = {}) => {
      if (init.method === "DELETE") {
        actions.push(path.startsWith("uploads") ? "delete-index" : "delete-waitlist");
        if (path.startsWith("uploads")) uploads = []; else waitlist = [];
        return [];
      }
      return path.startsWith("uploads") ? uploads : waitlist;
    },
    r2: async (objectKey, init) => {
      if (init.method === "PUT") {
        actions.push("backup");
        expect(init.headers["if-none-match"]).toBe("*");
        return new Response(null, { status: backupFails ? 500 : backupExists ? 412 : 200 });
      }
      if (objectKey !== key) throw new Error("unexpected key");
      if (init.method === "DELETE") { actions.push("delete-object"); objectExists = false; return new Response(null, { status: 204 }); }
      return objectExists ? Response.json({ records: [{ kind: "item_seen", installId: "e2e-test-20261004", itemId: 999999001 }] }) : new Response(null, { status: 404 });
    },
  };
}

test("cleanup backs up exact test fixtures, deletes the authoritative object key, and is repeatable", async () => {
  const f = fixture();
  expect(await cleanupTestData(f)).toEqual({ uploadRemoved: true, waitlistRemoved: true });
  expect(f.actions).toEqual(["backup", "delete-object", "delete-index", "delete-waitlist"]);
  expect(await cleanupTestData(f)).toEqual({ uploadRemoved: false, waitlistRemoved: false });
});

test("a mismatched contributor is never deleted", async () => {
  const f = fixture("real-contributor");
  await expect(cleanupTestData(f)).rejects.toThrow("Test upload identity mismatch");
  expect(f.actions).toEqual([]);
});

test("a failed backup prevents deletion", async () => {
  const f = fixture("e2e-test-20261004", true);
  await expect(cleanupTestData(f)).rejects.toThrow("backup");
  expect(f.actions).toEqual(["backup"]);
});

test("a partial retry preserves the first backup", async () => {
  expect(await cleanupTestData(fixture("e2e-test-20261004", false, true))).toEqual({ uploadRemoved: true, waitlistRemoved: true });
});
