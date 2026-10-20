"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ShellCharacter } from "@/lib/account-shell-types";
import { CLASS_TEXT } from "@/components/talents/TalentTreeView";

/** The ⇄ beside the active character: lists the player's characters; picking one makes it the active one. */
export default function CharacterSwitch({ characters, activeId }: { characters: ShellCharacter[]; activeId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/me/active-character", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ characterId: id }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "That did not work. Try again.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (characters.length < 2) return null;
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} aria-controls="character-switch" aria-label="Switch character" title="Switch character"
        className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-line text-fg-2 hover:border-edge hover:text-fg"
        onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">⇄</span>
      </button>
      {open && (
        <ul id="character-switch" className="absolute right-0 z-20 mt-1 w-56 rounded-control border border-edge bg-panel py-1">
          {characters.map((c) => (
            <li key={c.id}>
              <button type="button" disabled={busy || c.id === activeId} aria-current={c.id === activeId ? "true" : undefined}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-cell hover:bg-canvas disabled:cursor-default"
                onClick={() => void pick(c.id)}>
                <span className={`truncate ${CLASS_TEXT[c.classSlug] ?? "text-fg"}`}>{c.name}</span>
                {c.id === activeId && <span className="text-meta text-muted">Now</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-1 text-meta text-fg">{error}</p>}
    </div>
  );
}
