import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mergeCensusRows } from "../../../../../kb/src/census-rows";

/**
 * The route is the only place that decides what a submitter is told. It must persist the parsed
 * accepted records, and it must never report a receipt the store did not write.
 */

const store = vi.hoisted(() => ({ putUpload: vi.fn(), lookup: vi.fn(), requestQuota: vi.fn(), installQuota: vi.fn(), reporter: vi.fn() }));
vi.mock("@/lib/intake-quota", () => ({ intakeQuota: { request: store.requestQuota, install: store.installQuota, reporter: store.reporter } }));

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
  store.reporter.mockReset().mockReturnValue("0123456789abcdef");
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

describe("auction scans in an upload", () => {
  const part = (realm: string, i = 0) => ({
    kind: "auction_snapshot", installId: "install-1234", capturedAt, realm, scanId: `scan-${realm.length}-${i}`.replace(/\W/g, "-"),
    part: 1, parts: 1, items: [[2589, 1, 10, 5, 5]],
  });

  test("the stored upload carries the keyed hash of the upload address, never one sent in the body", async () => {
    const POST = await freshPost();
    const response = await POST(request({ addonVersion: "0.3.0", reporter: "ffffffffffffffff", records: [part("Forever")] }));
    expect(response.status).toBe(200);
    const stored = store.putUpload.mock.calls[0]![2];
    expect(stored.reporter).toBe("0123456789abcdef");
    expect(JSON.stringify(stored)).not.toContain("ffffffffffffffff");
  });

  test("uploads without scans are not tagged with a reporter", async () => {
    const POST = await freshPost();
    await POST(request({ addonVersion: "0.3.0", records: [loot("install-1234")] }));
    expect(store.putUpload.mock.calls[0]![2]).not.toHaveProperty("reporter");
    expect(store.reporter).not.toHaveBeenCalled();
  });

  test("a completion catalog upload carries the address hash too, so its votes count once per address", async () => {
    const POST = await freshPost();
    const title = { kind: "title_catalog", installId: "install-1234", eventId: "e:1", capturedAt, titleId: 4, name: "Private" };
    const response = await POST(request({ addonVersion: "0.3.3", reporter: "ffffffffffffffff", records: [title] }));
    expect(response.status).toBe(200);
    const stored = store.putUpload.mock.calls[0]![2];
    expect(stored.reporter).toBe("0123456789abcdef");
    expect(JSON.stringify(stored)).not.toContain("ffffffffffffffff");
  });

  test("one upload may carry scans from at most 3 realms; the rest are rejected with a reason", async () => {
    const POST = await freshPost();
    const realms = ["Aaa", "Bbb", "Ccc", "Ddd", "Aaa"];
    const response = await POST(request({ addonVersion: "0.3.0", records: realms.map((r, i) => part(r, i)) }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accepted.map((a: { index: number }) => a.index)).toEqual([0, 1, 2, 4]);
    expect(body.rejected).toEqual([{ index: 3, reason: expect.stringContaining("at most 3 realms") }]);
  });

  test("a realm that is not a plain name is rejected at intake", async () => {
    const POST = await freshPost();
    const response = await POST(request({ addonVersion: "0.3.0", records: [part("visit scam.example")] }));
    expect(response.status).toBe(422);
    expect(store.putUpload).not.toHaveBeenCalled();
  });
});

describe("census rows in an upload", () => {
  const GUID = "Player-4395-0A1B2C3D";
  const SEEN_GUID = "Player-4395-0F00BA44";
  const self = {
    kind: "census_self", installId: "install-1234", eventId: `census_self:${GUID}`, capturedAt: "2026-10-18T21:30:00.000Z",
    guid: GUID, race: "Scourge", class: "PRIEST", level: 24, faction: "Horde", realm: "Forever",
  };
  const seen = {
    kind: "census_seen", installId: "install-1234", eventId: `census_seen:${SEEN_GUID}`, capturedAt: "2026-10-18T21:31:00.000Z",
    guid: SEEN_GUID, race: "Skyborne", class: "HUNTER", level: 60, faction: "Alliance", via: "mouseover",
    name: "Thrall", guild: "Horde Raiders", x: 41.2, y: 66.1,
  };
  /** Every piece of a GUID of five or more characters, lower case, so a re-cased copy is caught too. */
  const pieces = (guid: string) => {
    const out: string[] = [];
    for (let i = 0; i < guid.length; i++) for (let j = i + 5; j <= guid.length; j++) out.push(guid.slice(i, j).toLowerCase());
    return out;
  };
  const expectNoGuid = (value: unknown) => {
    const text = JSON.stringify(value).toLowerCase();
    for (const guid of [GUID, SEEN_GUID]) for (const piece of pieces(guid)) expect(text, piece).not.toContain(piece);
  };

  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  test("the stored upload holds a character key and server id, never the GUID or any piece of it", async () => {
    vi.stubEnv("EVERLOOT_CHARACTER_KEY", "test-character-key");
    const POST = await freshPost();
    const response = await POST(request({ addonVersion: "0.4.0", records: [self, seen, loot("install-1234")] }));
    expect(response.status).toBe(200);
    expect((await response.json()).accepted.map((a: { kind: string }) => a.kind)).toEqual(["census_self", "census_seen", "loot"]);
    const stored = store.putUpload.mock.calls[0]![2];
    expectNoGuid(stored);
    const [mine, theirs, kept] = stored.records;
    expect(Object.keys(mine).sort()).toEqual(["capturedAt", "characterKey", "class", "eventId", "faction", "installId", "kind", "level", "race", "realm", "serverId"]);
    expect(Object.keys(theirs).sort()).toEqual(["capturedAt", "characterKey", "class", "eventId", "faction", "installId", "kind", "level", "race", "serverId", "via"]);
    expect(mine).toMatchObject({ serverId: 4395, characterKey: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(mine.eventId).toBe(`census_self:2026-10-18:${mine.characterKey.slice(0, 24)}`);
    expect(theirs.eventId).toBe(`census_seen:2026-10-18:${theirs.characterKey.slice(0, 24)}`);
    expect(kept).toEqual(canonicalLoot);
  });

  test("without EVERLOOT_CHARACTER_KEY census rows are dropped and the rest of the upload is kept", async () => {
    for (const value of [undefined, "", "  "]) {
      store.putUpload.mockClear();
      vi.stubEnv("EVERLOOT_CHARACTER_KEY", value);
      const POST = await freshPost();
      const response = await POST(request({ addonVersion: "0.4.0", records: [self, loot("install-1234"), seen] }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.accepted).toEqual([{ index: 1, kind: "loot" }]);
      expect(body.rejected.map((r: { index: number }) => r.index)).toEqual([0, 2]);
      expect(body.rejected[0].reason).toMatch(/census/i);
      const stored = store.putUpload.mock.calls[0]![2];
      expect(stored.records).toEqual([canonicalLoot]);
      expectNoGuid(stored);
    }
  });

  test("an upload of census rows only, with no key, is refused and writes nothing", async () => {
    vi.stubEnv("EVERLOOT_CHARACTER_KEY", "");
    const POST = await freshPost();
    const response = await POST(request({ addonVersion: "0.4.0", records: [self, seen] }));
    expect(response.status).toBe(422);
    expect(store.putUpload).not.toHaveBeenCalled();
    expectNoGuid(await response.json());
  });

  test("bad levels, factions and misplaced realm or via are refused with a reason", async () => {
    vi.stubEnv("EVERLOOT_CHARACTER_KEY", "test-character-key");
    const POST = await freshPost();
    const bad = [
      { ...seen, level: 61 }, { ...seen, level: 0 }, { ...seen, faction: "horde" },
      { ...seen, realm: "Forever" }, { ...self, via: "target" }, { ...seen, guid: "Creature-0-4395-0-12-1234-0000ABCD" },
    ];
    const response = await POST(request({ addonVersion: "0.4.0", records: [...bad, loot("install-1234")] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accepted).toEqual([{ index: 6, kind: "loot" }]);
    expect(body.rejected.map((r: { index: number }) => r.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(body.rejected[3].reason).toBe("realm is sent only for your own characters");
    expect(body.rejected[4].reason).toBe("via is sent only for players you see");
    expect(store.putUpload.mock.calls[0]![2].records).toEqual([canonicalLoot]);
  });

  test("a name, guild or position sent with a player you see is not stored", async () => {
    vi.stubEnv("EVERLOOT_CHARACTER_KEY", "test-character-key");
    const POST = await freshPost();
    await POST(request({ addonVersion: "0.4.0", records: [seen] }));
    const text = JSON.stringify(store.putUpload.mock.calls[0]![2]);
    for (const leak of ["Thrall", "Horde Raiders", "41.2", "66.1", "\"name\"", "\"guild\"", "\"x\"", "\"y\""]) expect(text).not.toContain(leak);
  });

  test("the same character sent again the same day keeps one event id, is never refused, and the later copy wins", async () => {
    vi.stubEnv("EVERLOOT_CHARACTER_KEY", "test-character-key");
    const POST = await freshPost();
    const later = { ...self, level: 25, capturedAt: "2026-10-18T23:10:00.000Z" };
    for (const rows of [[self], [self, later], [later]]) {
      const response = await POST(request({ addonVersion: "0.4.0", records: rows }));
      expect(response.status).toBe(200);
      expect((await response.json()).rejected).toEqual([]);
    }
    const stored = store.putUpload.mock.calls.flatMap((call) => call[2].records);
    expect(new Set(stored.map((r: { eventId: string }) => r.eventId)).size).toBe(1);
    const folded = mergeCensusRows([], stored);
    expect(folded).toHaveLength(1);
    expect(folded[0]).toMatchObject({ level: 25, capturedAt: later.capturedAt });
  });

  test("one install keeps at most 500 players seen and 50 own characters per UTC day; the rest are refused and counted", async () => {
    vi.stubEnv("EVERLOOT_CHARACTER_KEY", "test-character-key");
    const POST = await freshPost();
    const guid = (i: number) => `Player-4395-${i.toString(16).toUpperCase().padStart(8, "0")}`;
    const seenRows = Array.from({ length: 502 }, (_, i) => ({ ...seen, guid: guid(i) }));
    const selfRows = Array.from({ length: 51 }, (_, i) => ({ ...self, guid: guid(10_000 + i) }));
    // A repeat of an accepted character is not a new one, and the next day has its own allowance.
    const repeat = { ...seen, guid: guid(0), level: 59 };
    const nextDay = { ...seen, guid: guid(600), capturedAt: "2026-10-19T08:00:00.000Z" };
    const records = [...seenRows, ...selfRows, repeat, nextDay];
    const response = await POST(request({ addonVersion: "0.4.0", records }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rejected.map((r: { index: number }) => r.index)).toEqual([500, 501, 552]);
    expect(body.rejected[0].reason).toMatch(/500/);
    expect(body.rejected[2].reason).toMatch(/50\b/);
    expect(body.accepted).toHaveLength(records.length - 3);
    const stored = store.putUpload.mock.calls[0]![2].records;
    expect(stored.filter((r: { kind: string }) => r.kind === "census_seen")).toHaveLength(502);
    expect(stored.filter((r: { kind: string }) => r.kind === "census_self")).toHaveLength(50);
  });

  test("no GUID is logged, even when storage fails", async () => {
    vi.stubEnv("EVERLOOT_CHARACTER_KEY", "test-character-key");
    const logged: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(" ")); });
    }
    store.putUpload.mockRejectedValue(new Error("supabase down"));
    const POST = await freshPost();
    const response = await POST(request({ addonVersion: "0.4.0", records: [self, seen] }));
    expect(response.status).toBe(503);
    expect(logged.length).toBeGreaterThan(0);
    expectNoGuid(logged);
    expectNoGuid(await response.json());
  });
});
