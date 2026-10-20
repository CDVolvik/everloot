"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui";
import { LIMITS, type BuildCharacter } from "@/lib/saved-builds";
import { TALENT_CLASSES } from "@/lib/talents/catalogs";

const button = "btn min-h-11 px-4 text-sm";
const titleCase = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1);

/**
 * Make a character label (on /me) or edit one (on its page). A label is a name, a class, and an optional realm
 * and note; it is not checked against the game. Editing also offers Delete; the builds stay, with no character.
 */
export default function CharacterForm({ character, classLocked = false }: { character?: BuildCharacter; classLocked?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(character));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/me/characters", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(character ? { id: character.id } : {}),
          name: form.get("name"), classSlug: form.get("classSlug") ?? character?.classSlug, realm: form.get("realm"), note: form.get("note"),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "That did not work. Try again.");
      if (!character) element.reset();
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/me/characters/${character!.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "That did not work. Try again.");
      router.push("/me");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Try again.");
      setBusy(false);
    }
  }

  if (!open) return <button type="button" className={button} onClick={() => setOpen(true)}>New character</button>;
  return (
    <form onSubmit={submit} aria-label={character ? "Edit character" : "New character"} className="grid max-w-3xl gap-3 sm:grid-cols-2">
      <label className="block space-y-1 text-sm">
        <span className="block text-muted">Name</span>
        <Input name="name" required maxLength={LIMITS.characterName} defaultValue={character?.name} autoComplete="off" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="block text-muted">Class</span>
        <select name="classSlug" defaultValue={character?.classSlug ?? "warrior"} disabled={classLocked}
          className="min-h-11 w-full rounded-control border border-edge bg-canvas px-3 text-base text-fg">
          {TALENT_CLASSES.map((slug) => <option key={slug} value={slug}>{titleCase(slug)}</option>)}
        </select>
        {classLocked && <span className="block text-xs text-muted">The class is fixed while builds are filed under it.</span>}
      </label>
      <label className="block space-y-1 text-sm">
        <span className="block text-muted">Realm (optional)</span>
        <Input name="realm" maxLength={LIMITS.realm} defaultValue={character?.realm ?? ""} autoComplete="off" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="block text-muted">Note (optional)</span>
        <Input name="note" maxLength={LIMITS.note} defaultValue={character?.note ?? ""} autoComplete="off" />
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button type="submit" className={`${button} btn-primary`} disabled={busy} aria-busy={busy}>{character ? "Save changes" : "Add character"}</button>
        {!character && <button type="button" className={button} onClick={() => setOpen(false)}>Cancel</button>}
        {character && (confirming
          ? <button type="button" className={button} disabled={busy} onClick={remove}>Delete for good</button>
          : <button type="button" className={button} disabled={busy} onClick={() => setConfirming(true)}>Delete character</button>)}
        {saved && <p role="status" className="text-sm text-fg-2">Saved.</p>}
        {error && <p role="alert" className="text-sm text-fg">{error}</p>}
      </div>
      <p className="text-xs text-muted sm:col-span-2">Only you see your characters. They are labels you type, not looked up in the game.</p>
    </form>
  );
}
