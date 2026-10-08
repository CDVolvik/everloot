import { describe, expect, it, vi } from "vitest";
import { readConsent, saveConsent, writeConsent, syncOptionalScripts } from "./consent";

describe("optional tracking consent", () => {
  it("keeps withdrawal rejected after reload when local writes fail but reads still return accepted", () => {
    const local = { getItem: () => "accepted", setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } };
    const values = new Map<string, string>();
    const session = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    expect(writeConsent("rejected", local, session)).toEqual({ persisted: false, needsRejectionFragment: false });
    const reloadedChoice = readConsent(local, session);
    expect(reloadedChoice).toBe("rejected");
    const doc = { getElementById: () => null, createElement: vi.fn() };
    syncOptionalScripts(reloadedChoice, "ca-pub-test", doc as unknown as Document);
    expect(doc.createElement).not.toHaveBeenCalled();
  });

  it("prioritizes the private rejection fragment if every storage write is blocked", () => {
    const storage = { getItem: () => "accepted", setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(saveConsent("rejected", storage)).toBe(false);
    expect(readConsent(storage, storage, "#everloot-cookie-rejected")).toBe("rejected");
    expect(writeConsent("rejected", storage, storage)).toEqual({ persisted: false, needsRejectionFragment: true });
  });

  it("removes stale acceptance where removal works and clears the session veto on explicit acceptance", () => {
    const local = { getItem: vi.fn(() => "accepted"), setItem: vi.fn((): void => { throw new Error("quota"); }), removeItem: vi.fn() };
    const session = { getItem: () => "rejected", setItem: vi.fn(), removeItem: vi.fn() };
    writeConsent("rejected", local, session);
    expect(local.removeItem).toHaveBeenCalledWith("gg-cookie-consent-v1");
    local.setItem.mockImplementation(() => {});
    expect(writeConsent("accepted", local, session)).toEqual({ persisted: true, needsRejectionFragment: false });
    expect(session.removeItem).toHaveBeenCalledWith("everloot-cookie-rejection");
  });

  it("fails closed when a previously written session veto cannot be read", () => {
    const local = { getItem: () => "accepted" };
    const session = { getItem: () => { throw new Error("blocked"); } };
    expect(readConsent(local, session)).toBeNull();
  });

  it.each([null, "rejected", "invalid"])("does not load tracking for %s", (choice) => {
    const doc = { getElementById: vi.fn(() => null), createElement: vi.fn() };
    syncOptionalScripts(choice as null | "rejected", "ca-pub-test", doc as unknown as Document);
    expect(doc.createElement).not.toHaveBeenCalled();
  });

  it("loads configured ads only after acceptance and does not duplicate them", () => {
    const appendChild = vi.fn();
    const script = {};
    const doc = { getElementById: vi.fn(() => null), createElement: vi.fn(() => script), head: { appendChild } };
    syncOptionalScripts("accepted", "ca-pub-test", doc as unknown as Document);
    expect(script).toMatchObject({ src: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-test", async: true });
    expect(appendChild).toHaveBeenCalledOnce();
    doc.getElementById.mockReturnValue(script as never);
    syncOptionalScripts("accepted", "ca-pub-test", doc as unknown as Document);
    expect(appendChild).toHaveBeenCalledOnce();
  });

  it("removes the optional script on rejection", () => {
    const remove = vi.fn();
    const doc = { getElementById: () => ({ remove }) };
    syncOptionalScripts("rejected", "ca-pub-test", doc as unknown as Document);
    expect(remove).toHaveBeenCalledOnce();
  });

  it("persists only recognized choices and fails closed when storage is unavailable", () => {
    const storage = { getItem: vi.fn(() => "accepted"), setItem: vi.fn() };
    expect(readConsent(storage)).toBe("accepted");
    saveConsent("rejected", storage);
    expect(storage.setItem).toHaveBeenCalledWith("gg-cookie-consent-v1", "rejected");
    storage.getItem.mockReturnValue("unexpected");
    expect(readConsent(storage)).toBeNull();
    storage.getItem.mockImplementation(() => { throw new Error("blocked"); });
    expect(readConsent(storage)).toBeNull();
    storage.setItem.mockImplementation(() => { throw new Error("blocked"); });
    expect(saveConsent("accepted", storage)).toBe(false);
  });
});
