"use client";

import { useState } from "react";
import { editPath, type SavedBuild } from "@/lib/saved-builds";
import { copyName } from "./BuildActions";

/** "Save a copy" on a shared build's page, for a signed-in visitor: the copy is theirs, then opens in the calculator. */
export default function SaveCopy({ name, notes, code, code2 }: { name: string; notes: string | null; code: string; code2: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/me/builds", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: copyName(name), notes, code, code2 }),
      });
      const result = await response.json().catch(() => ({})) as { build?: SavedBuild; error?: string };
      if (!response.ok || !result.build) throw new Error(result.error ?? "That did not work. Try again.");
      window.location.assign(editPath(result.build));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn min-h-10 px-4 text-sm" disabled={busy} aria-busy={busy} onClick={save}>Save a copy</button>
      {error && <p role="alert" className="basis-full text-sm text-fg">{error}</p>}
    </>
  );
}
