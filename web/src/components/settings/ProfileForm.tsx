"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui";
import { PROFILE_LIMITS } from "@/lib/profiles";
import type { ProfileSettings } from "@/lib/account-shell";

const box = "h-4 w-4 accent-accent";

/** Handle, display name, and whether /u/<handle> is public and what it shows. */
export default function ProfileForm({ profile, accountName }: { profile: ProfileSettings; accountName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPublic, setPublic] = useState(profile.publicProfile);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/me/profile", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          handle: form.get("handle"), displayName: form.get("displayName"), publicProfile: isPublic,
          showCharacters: form.get("showCharacters") === "on", showBuilds: form.get("showBuilds") === "on", showStatus: form.get("showStatus") === "on",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "That did not work. Try again.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Profile" className="grid max-w-3xl gap-3 sm:grid-cols-2">
      <label className="block space-y-1 text-sm">
        <span className="block text-muted">Handle</span>
        <Input name="handle" defaultValue={profile.handle ?? ""} maxLength={PROFILE_LIMITS.handleMax} autoComplete="off" spellCheck={false}
          pattern="@?[A-Za-z0-9][A-Za-z0-9\-]{1,22}[A-Za-z0-9]" placeholder="3 to 24 letters, numbers or hyphens" />
        <span className="block text-xs text-muted">Your address: /u/handle. Up to 5 changes a day.</span>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="block text-muted">Display name (optional)</span>
        <Input name="displayName" defaultValue={profile.displayName ?? ""} maxLength={PROFILE_LIMITS.displayName} autoComplete="off" placeholder={accountName} />
      </label>
      <fieldset className="space-y-2 text-sm sm:col-span-2">
        <legend className="sr-only">Public profile</legend>
        <label className="flex items-center gap-2 text-fg">
          <input type="checkbox" name="publicProfile" className={box} checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />
          Public profile
        </label>
        <p className="text-xs text-muted">Off: nobody else sees anything. On: anyone can open your profile and sees only what you tick below. Never your BattleTag or email.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 pl-6">
          <label className="flex items-center gap-2 text-fg-2"><input type="checkbox" name="showCharacters" className={box} defaultChecked={profile.showCharacters} />Characters</label>
          <label className="flex items-center gap-2 text-fg-2"><input type="checkbox" name="showBuilds" className={box} defaultChecked={profile.showBuilds} />Shared builds</label>
          <label className="flex items-center gap-2 text-fg-2"><input type="checkbox" name="showStatus" className={box} defaultChecked={profile.showStatus} />Status</label>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button type="submit" className="btn btn-primary min-h-11 px-4 text-sm" disabled={busy} aria-busy={busy}>Save profile</button>
        {saved && <p role="status" className="text-sm text-fg-2">Saved.</p>}
        {error && <p role="alert" className="text-sm text-fg">{error}</p>}
      </div>
    </form>
  );
}
