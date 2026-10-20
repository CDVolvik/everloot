"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui";
import type { AccountStatus } from "@/lib/account-shell-types";
import { CLEAR_AFTER, clearsAtFor, PROFILE_LIMITS, type ClearAfter } from "@/lib/profiles";

/** One emoji and a short line, cleared after a time the player picks, or by hand. */
export default function StatusForm({ status }: { status: AccountStatus | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function send(body: object, done: string) {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const response = await fetch("/api/me/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "That did not work. Try again.");
      setSaved(done);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const clearsAt = clearsAtFor(String(form.get("clearAfter") ?? "never") as ClearAfter, new Date());
    void send({ emoji: form.get("emoji"), text: form.get("text"), clearsAt: clearsAt?.toISOString() ?? null }, "Status set.");
  }

  return (
    <form onSubmit={submit} aria-label="Status" className="grid max-w-3xl gap-3 sm:grid-cols-[6rem_minmax(0,1fr)_10rem]">
      <label className="block space-y-1 text-sm">
        <span className="block text-muted">Emoji</span>
        <Input name="emoji" defaultValue={status?.emoji ?? ""} maxLength={16} autoComplete="off" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="block text-muted">What are you up to?</span>
        <Input name="text" defaultValue={status?.text ?? ""} maxLength={PROFILE_LIMITS.statusText} autoComplete="off" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="block text-muted">Clear after</span>
        <select name="clearAfter" defaultValue="never" className="min-h-11 w-full rounded-control border border-edge bg-canvas px-3 text-base text-fg">
          {CLEAR_AFTER.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <button type="submit" className="btn btn-primary min-h-11 px-4 text-sm" disabled={busy} aria-busy={busy}>Set status</button>
        {status && <button type="button" className="btn min-h-11 px-4 text-sm" disabled={busy} onClick={() => void send({ emoji: null, text: null, clearsAt: null }, "Status cleared.")}>Clear status</button>}
        {status?.clearsAt && <p className="text-xs text-muted">Clears <time dateTime={status.clearsAt}>{status.clearsAt.slice(0, 16).replace("T", " ")} UTC</time></p>}
        {saved && <p role="status" className="text-sm text-fg-2">{saved}</p>}
        {error && <p role="alert" className="text-sm text-fg">{error}</p>}
      </div>
    </form>
  );
}
