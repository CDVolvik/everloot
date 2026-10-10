import { expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn() }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: { loadCorpus: store.loadCorpus } }));

import { GET } from "./route";

test("the drop API reports when its data was current, not only when it answered", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], dataAsOf: "2026-10-09T10:00:00.000Z" });
  const body = await (await GET()).json();
  expect(body.dataAsOf).toBe("2026-10-09T10:00:00.000Z");
  expect(body.stats.dataAsOf).toBe("2026-10-09T10:00:00.000Z");
});

test("an unreadable store has no data time", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], unreachable: true });
  const body = await (await GET()).json();
  expect(body.unreachable).toBe(true);
  expect(body.dataAsOf).toBeNull();
});
