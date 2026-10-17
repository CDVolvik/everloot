"use client";

import { useEffect, useRef, useState } from "react";
import { readConsent, writeConsent, syncOptionalScripts, REJECTION_FRAGMENT, REJECTION_SESSION_KEY, type ConsentChoice } from "./consent";

const OPEN_PREFERENCES = "everloot:cookie-preferences";

export function CookiePreferencesButton() {
  return (
    <button type="button" className="min-h-11 hover:text-accent transition" onClick={() => window.dispatchEvent(new Event(OPEN_PREFERENCES))}>
      Cookie preferences
    </button>
  );
}

export default function CookieConsent({ adsenseClient }: { adsenseClient?: string }) {
  const [visible, setVisible] = useState(false);
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const fragmentRejected = window.location.hash === REJECTION_FRAGMENT;
    let saved: ConsentChoice | null = fragmentRejected ? "rejected" : null;
    let fallback = fragmentRejected;
    try {
      fallback ||= window.sessionStorage.getItem(REJECTION_SESSION_KEY) === "rejected";
      saved = readConsent(window.localStorage, window.sessionStorage, window.location.hash);
    } catch {}
    setChoice(saved);
    setSaveFailed(fallback);
    setVisible(saved === null || fallback);
    syncOptionalScripts(saved, adsenseClient, document);
    const reopen = () => {
      trigger.current = document.activeElement as HTMLElement;
      setVisible(true);
    };
    window.addEventListener(OPEN_PREFERENCES, reopen);
    return () => window.removeEventListener(OPEN_PREFERENCES, reopen);
  }, [adsenseClient]);

  useEffect(() => {
    if (visible && trigger.current) heading.current?.focus();
  }, [visible]);

  const close = () => {
    setVisible(false);
    trigger.current?.focus();
    trigger.current = null;
  };
  const decide = (value: ConsentChoice) => {
    let result = { persisted: false, needsRejectionFragment: value === "rejected" };
    try { result = writeConsent(value, window.localStorage, window.sessionStorage); } catch {}
    if (result.needsRejectionFragment) window.location.hash = REJECTION_FRAGMENT;
    else if (window.location.hash === REJECTION_FRAGMENT && (result.persisted || value === "accepted")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    syncOptionalScripts(value, adsenseClient, document);
    const revokeLoadedAds = choice === "accepted" && value === "rejected" && adsenseClient;
    setChoice(value);
    setSaveFailed(!result.persisted);
    if (result.persisted) close();
    // Removing a script cannot stop code it already ran. On storage failure the
    // session veto or private URL fragment overrides stale acceptance on reload.
    if (revokeLoadedAds) window.location.reload();
  };

  if (!visible) return null;
  return (
    <section aria-labelledby="cookie-heading" className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[min(92%,640px)] z-50 rounded-xl border border-line bg-canvas p-4 shadow-xl" onKeyDown={(event) => { if (event.key === "Escape" && choice) close(); }}>
      <h2 ref={heading} tabIndex={-1} id="cookie-heading" className="font-semibold text-fg">Cookie preferences</h2>
      <p className="mt-1 text-sm text-fg">
        Optional advertising loads only if you accept. No analytics service is currently enabled.
        Your choice is saved when browser storage is available. You can change it in the footer.
      </p>
      {saveFailed && <p role="status" className="mt-2 text-sm text-fg">Your browser could not save this choice permanently. {choice === "rejected" ? "Optional cookies remain rejected in this tab; if all storage is blocked, keep the current URL to preserve rejection when reloading." : "Acceptance applies to this page only. Recheck your preferences after reloading."}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 justify-end">
        {choice && <button type="button" onClick={close} className="min-h-11 px-3 text-sm rounded-md border border-line">Close</button>}
        <button type="button" onClick={() => decide("rejected")} className="min-h-11 px-3 text-sm rounded-md border border-line hover:border-muted transition">Reject optional cookies</button>
        <button type="button" onClick={() => decide("accepted")} className="min-h-11 px-3 text-sm rounded-md bg-gold-500 text-parchment-950 font-medium hover:bg-gold-400 transition">Accept optional cookies</button>
      </div>
    </section>
  );
}
