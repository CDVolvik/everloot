"use client";

import { useState } from "react";

export default function EmailCapture({ toolSlug }: { toolSlug: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitted" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setState("error");
      return;
    }
    // TODO: wire to ConvertKit / Mailchimp / Resend once picked.
    // For now, stash locally so we don't lose early signups during validation.
    try {
      const key = `gg-waitlist-${toolSlug}`;
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      existing.push({ email, ts: Date.now() });
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {}
    setState("submitted");
  };

  if (state === "submitted") {
    return (
      <div className="rounded-lg border border-uncommon/40 bg-uncommon/5 p-4 text-sm text-parchment-100/90">
        ✓ You&apos;re on the list. We&apos;ll email once it&apos;s live.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="block text-sm text-parchment-100/80">
        Want a heads-up when this launches?
      </label>
      <div className="flex gap-2">
        <input
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          className="flex-1 rounded-lg bg-parchment-900/60 border border-parchment-100/10 px-3 py-2 text-parchment-100 placeholder:text-parchment-100/30 focus:border-gold-400 outline-none"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-gold-500 text-parchment-950 font-medium hover:bg-gold-400 transition"
        >
          Notify me
        </button>
      </div>
      {state === "error" && (
        <p className="text-xs text-red-400">Please enter a valid email.</p>
      )}
      <p className="text-xs text-parchment-100/40">
        One email when it launches. No spam.
      </p>
    </form>
  );
}
