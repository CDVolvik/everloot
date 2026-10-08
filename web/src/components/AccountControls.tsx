"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AccountControls() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "anonymous" | "signed-in" | "unavailable">("loading");
  const [retry, setRetry] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controlClass = "inline-flex items-center min-h-11 px-2 text-sm text-parchment-100/80 hover:text-gold-400 disabled:opacity-60";

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setError(null);
    async function checkAccount() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) throw new Error("Account lookup failed");
        const { user } = await response.json();
        if (active) setStatus(user ? "signed-in" : "anonymous");
      } catch {
        if (active) { setStatus("unavailable"); setError("Account unavailable. Try again."); }
      }
    }
    void checkAccount();
    return () => { active = false; };
  }, [retry]);

  async function signOut() {
    setSigningOut(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok || (await response.json()).ok !== true) throw new Error("Logout failed");
      setStatus("anonymous");
      router.refresh();
    } catch {
      setError("Sign out failed. Try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="relative shrink-0">
      {status === "anonymous" ? <a href="/api/auth/bnet" className={controlClass}>Sign in</a>
        : status === "signed-in" ? <button type="button" disabled={signingOut} aria-busy={signingOut} onClick={signOut} className={controlClass}>Sign out</button>
        : status === "unavailable" ? <button type="button" aria-label="Retry account status" onClick={() => setRetry(retry + 1)} className={controlClass}>Retry</button>
        : <button type="button" disabled aria-busy="true" className={controlClass}>Account</button>}
      {error && <p role="alert" className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-parchment-100/20 bg-parchment-950 p-3 text-sm text-parchment-100">{error}</p>}
    </div>
  );
}
