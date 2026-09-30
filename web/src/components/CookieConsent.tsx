"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "gg-cookie-consent-v1";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage unavailable (private mode) — just show it
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const decide = (value: "accepted" | "rejected") => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {}
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[min(92%,640px)] z-50 rounded-xl border border-gold-500/30 bg-parchment-950 p-4 shadow-xl">
      <p className="text-sm text-parchment-100/90">
        This site uses cookies for analytics and, once approved, Google AdSense
        personalized ads. You can reject non-essential cookies.
      </p>
      <div className="mt-3 flex items-center gap-2 justify-end">
        <button
          onClick={() => decide("rejected")}
          className="px-3 py-1.5 text-sm rounded-md border border-parchment-100/20 hover:border-parchment-100/40 transition"
        >
          Reject
        </button>
        <button
          onClick={() => decide("accepted")}
          className="px-3 py-1.5 text-sm rounded-md bg-gold-500 text-parchment-950 font-medium hover:bg-gold-400 transition"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
