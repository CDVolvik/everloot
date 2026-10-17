import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The route is the only place that decides what a submitter is told. It must persist the parsed
 * accepted records, and it must never report a receipt the store did not write.
 */

const store = vi.hoisted(() => ({ putUpload: vi.fn(), lookup: vi.fn(), requestQuota: vi.fn(), installQuota: vi.fn() }));
vi.mock("@/lib/intake-quota", () => ({ intakeQuota: { request: store.requestQuota, install: store.installQuota } }));

vi.mock("@/lib/upload-store", () => ({
  sharingStore: { lookup: store.lookup },
  uploadStore: {
    putUpload: store.putUpload,
    loadCorpus: vi.fn(),
    putWaitlist: vi.fn(),
    writeSnapshot: vi.fn(),
  },
}));

const capturedAt = "2026-10-05T00:00:00.000Z";
const loot = (installId: string) => ({
  kind: "loot",
  installId,
  capturedAt,
  sourceNpcId: 123,
  items: [{ itemId: 456, count: 1, secret: "strip" }],
  extra: "strip",
});
const canonicalLoot = {
  kind: "loot",
  installId: "install-1234",
  capturedAt,
  sourceNpcId: 123,
  items: [{ itemId: 456, count: 1 }],
};

function request(payload: unknown): Request {
  return new Request("https://everloot.app/api/intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** A fresh route module per test. */
async function freshPost() {
  vi.resetModules();
  const { POST } = await import("./route.js");
  return POST;
}

beforeEach(() => {
  store.requestQuota.mockReset().mockResolvedValue({ allowed: true, retryAfter: 0 });
  store.installQuota.mockReset().mockResolvedValue({ allowed: true, retryAfter: 0 });
  store.putUpload.mockReset();
  store.putUpload.mockResolvedValue(true);
  store.lookup.mockReset();
  store.lookup.mockResolvedValue(null);
});

describe("POST /api/intake", () => {
  test("persists the parsed accepted records, not the raw payload", async () => {
    const POST = await freshPost();
    const response = await POST(request({ addonVersion: "0.1.0", records: [{ ...loot("install-1234"), installId: "" }, loot("install-1234")] }));

    expect(response.status).toBe(200);
    expect(store.putUpload).toHaveBeenCalledWith(expect.any(String), "install-1234", {
      addonVersion: "0.1.0",
      records: [canonicalLoot],
    }, []);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, persisted: true, accepted: [{ index: 1, kind: "loot" }] });
    expect(body).not.toHaveProperty("records");
    expect(body).not.toHaveProperty("upload");
  });

  test("the stored upload keeps the client build the addon reported", async () => {
    const POST = await freshPost();
    const response = await POST(request({ addonVersion: "0.2.6", clientBuild: "1.60.1.70450", records: [loot("install-1234")] }));

    expect(response.status).toBe(200);
    expect(store.putUpload).toHaveBeenCalledWith(expect.any(String), "install-1234", {
      addonVersion: "0.2.6",
      clientBuild: "1.60.1.70450",
      records: [canonicalLoot],
    }, []);
  });

  test("two accepted install ids reject the whole submission and write nothing", async () => {
    const POST = await freshPost();
    const response = await POST(request({ addonVersion: "0.1.0", records: [loot("install-aaaa"), loot("install-bbbb")] }));

    expect(response.status).toBe(422);
    expect(store.putUpload).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ ok: false });
  });

  test("a valid envelope with no accepted row is refused and writes nothing", async () => {
    const POST = await freshPost();
    const response = await POST(request({ addonVersion: "0.1.0", records: [{ ...loot("install-1234"), capturedAt: "nope" }] }));

    expect(response.status).toBe(422);
    expect(store.putUpload).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.accepted).toEqual([]);
    expect(body.rejected[0].index).toBe(0);
  });

  test("more than 2000 rows is an envelope refusal, not a write", async () => {
    const POST = await freshPost();
    const rows = Array.from({ length: 2001 }, () => loot("install-1234"));
    const response = await POST(request({ addonVersion: "0.1.0", records: rows }));

    expect(response.status).toBe(422);
    expect(store.putUpload).not.toHaveBeenCalled();
  });

  test("a malformed body is 400 and writes nothing", async () => {
    const POST = await freshPost();
    const response = await POST(new Request("https://everloot.app/api/intake", { method: "POST", body: "{" }));

    expect(response.status).toBe(400);
    expect(store.putUpload).not.toHaveBeenCalled();
  });

  test("storage that reports failure answers 503 with the receipt, never a thank-you", async () => {
    store.putUpload.mockResolvedValue(false);
    const POST = await freshPost();
    const response = await POST(request({ addonVersion: "0.1.0", records: [loot("install-1234")] }));

    expect(response.status).toBe(503);
    expect(store.putUpload).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, persisted: false, accepted: [{ index: 0, kind: "loot" }] });
    expect(String(body.error)).toMatch(/retry/i);
  });

  test("storage that throws is the same 503, not a crash", async () => {
    store.putUpload.mockRejectedValue(new Error("supabase down"));
    const POST = await freshPost();
    const response = await POST(request({ addonVersion: "0.1.0", records: [loot("install-1234")] }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, persisted: false });
  });

  test("shared install denial answers 429 with Retry-After and writes nothing", async () => {
    store.installQuota.mockResolvedValue({ allowed: false, retryAfter: 75 });
    const POST = await freshPost();
    const response = await POST(request({ addonVersion: "0.1.0", records: [loot("install-1234")] }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("75");
    expect(store.installQuota).toHaveBeenCalledWith("install-1234");
    expect(store.putUpload).not.toHaveBeenCalled();
  });

  test("request quota denial precedes body reads and grant lookups", async () => {
    store.requestQuota.mockResolvedValue({ allowed: false, retryAfter: 40 });
    const POST = await freshPost();
    const req = request({});
    const read = vi.spyOn(req.body!, "getReader");
    const response = await POST(req);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("40");
    expect(read).not.toHaveBeenCalled();
    expect(store.lookup).not.toHaveBeenCalled();
    expect(store.putUpload).not.toHaveBeenCalled();
  });

  test("quota storage failure refuses intake rather than falling back", async () => {
    const POST = await freshPost();
    for (const quota of [store.requestQuota, store.installQuota]) {
      quota.mockRejectedValueOnce(new Error("database down"));
      const response = await POST(request({ addonVersion: "0.1.0", records: [loot("install-1234")] }));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ ok: false });
    }
    expect(store.putUpload).not.toHaveBeenCalled();
  });
});
