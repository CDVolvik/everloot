import { expect, test, vi } from "vitest";
import { INSTALL_ID, parseRecords } from "@everloot/protocol";
import { censusKey } from "./census-intake";
import { linkKey } from "./character-links";
import { published, publicInstallId, publicInstallSecret } from "./public-install";

const SECRET = "s".repeat(32);
const loot = { installId: "install-0001", eventId: "e:1", kind: "loot", capturedAt: "2026-10-09T00:00:00.000Z", sourceNpcId: 1, items: [] };

test("the pseudonym is stable for one install, differs across installs, and is never the install id", () => {
  const a = publicInstallId("install-0001", SECRET);
  expect(publicInstallId("install-0001", SECRET)).toBe(a);
  expect(publicInstallId("install-0002", SECRET)).not.toBe(a);
  expect(publicInstallId("install-0001", "t".repeat(32))).not.toBe(a);
  expect(a).toMatch(/^pub-[0-9a-f]{32}$/);
  expect(a).not.toContain("install-0001");
  expect(INSTALL_ID.safeParse(a).success).toBe(true);
});

test("the pseudonym is domain-separated from the census and link keys under the same secret", () => {
  const hex = publicInstallId("install-0001", SECRET).slice(4);
  expect(censusKey("install-0001", SECRET).startsWith(hex)).toBe(false);
  expect(linkKey("install-0001", SECRET).startsWith(hex)).toBe(false);
});

test("the public key wins, the character key is the fallback, and a short key is no key", () => {
  expect(publicInstallSecret({ EVERLOOT_PUBLIC_INSTALL_KEY: "p".repeat(32), EVERLOOT_CHARACTER_KEY: SECRET })).toBe("p".repeat(32));
  expect(publicInstallSecret({ EVERLOOT_CHARACTER_KEY: SECRET })).toBe(SECRET);
  expect(publicInstallSecret({ EVERLOOT_PUBLIC_INSTALL_KEY: "short", EVERLOOT_CHARACTER_KEY: SECRET })).toBeNull();
  expect(publicInstallSecret({})).toBeNull();
});

test("a published record passes parseRecords, so the feed can be read and its installs counted", () => {
  const out = published(loot, SECRET);
  expect(out.installId).toBe(publicInstallId("install-0001", SECRET));
  const { records, receipt } = parseRecords([out]);
  expect(receipt.rejected).toEqual([]);
  expect(records).toHaveLength(1);
  expect(loot.installId).toBe("install-0001");
});

test("with no key the install id is dropped, as before, and the gap is logged once", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(published(loot, null)).not.toHaveProperty("installId");
  published(loot, null);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
