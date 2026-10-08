export type ConsentChoice = "accepted" | "rejected";
const STORAGE_KEY = "gg-cookie-consent-v1";
const SCRIPT_ID = "everloot-optional-ads";
export const REJECTION_SESSION_KEY = "everloot-cookie-rejection";
export const REJECTION_FRAGMENT = "#everloot-cookie-rejected";

export function readConsent(storage: Pick<Storage, "getItem">, session?: Pick<Storage, "getItem">, hash = ""): ConsentChoice | null {
  if (hash === REJECTION_FRAGMENT) return "rejected";
  try {
    if (session?.getItem(REJECTION_SESSION_KEY) === "rejected") return "rejected";
  } catch { return null; }
  try {
    const value = storage.getItem(STORAGE_KEY);
    return value === "accepted" || value === "rejected" ? value : null;
  } catch { return null; }
}

export function writeConsent(choice: ConsentChoice, storage: Pick<Storage, "setItem" | "removeItem">, session: Pick<Storage, "setItem" | "removeItem">): { persisted: boolean; needsRejectionFragment: boolean } {
  const persisted = saveConsent(choice, storage);
  if (persisted || choice === "accepted") {
    try { session.removeItem(REJECTION_SESSION_KEY); } catch {}
    return { persisted, needsRejectionFragment: false };
  }
  // A failed overwrite can leave a readable "accepted" value behind. Remove it
  // where possible, and retain a rejection veto across this tab's navigations.
  try { storage.removeItem(STORAGE_KEY); } catch {}
  try {
    session.setItem(REJECTION_SESSION_KEY, "rejected");
    return { persisted: false, needsRejectionFragment: false };
  } catch {
    return { persisted: false, needsRejectionFragment: true };
  }
}

export function saveConsent(choice: ConsentChoice, storage: Pick<Storage, "setItem">): boolean {
  try {
    storage.setItem(STORAGE_KEY, choice);
    return true;
  } catch { return false; }
}

export function syncOptionalScripts(choice: ConsentChoice | null, adsenseClient: string | undefined, doc: Document): void {
  const existing = doc.getElementById(SCRIPT_ID);
  if (choice !== "accepted") {
    existing?.remove();
    return;
  }
  if (!adsenseClient || existing) return;
  const script = doc.createElement("script");
  script.id = SCRIPT_ID;
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClient)}`;
  doc.head.appendChild(script);
}
