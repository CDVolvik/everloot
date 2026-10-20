"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { shellChanged } from "@/lib/profiles";

/** "Make main" on a character's row; the main character's row says Main and can be unset. */
export default function MainCharacterButton({ characterId, main, name }: { characterId: string; main: boolean; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(id: string | null) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/me/main-character", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ characterId: id }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "That did not work. Try again.");
      shellChanged();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const action = "inline-flex min-h-8 items-center px-1.5 text-cell text-fg-2 hover:text-accent disabled:opacity-60";
  return (
    <span className="inline-flex items-center gap-1">
      {main
        ? <button type="button" className={action} disabled={busy} aria-label={`Unset ${name} as main`} onClick={() => void set(null)}>Unset main</button>
        : <button type="button" className={action} disabled={busy} aria-label={`Make ${name} your main`} onClick={() => void set(characterId)}>Make main</button>}
      {error && <span role="alert" className="text-meta text-fg">{error}</span>}
    </span>
  );
}
