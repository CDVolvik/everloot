"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function IdLookup({ kind, label }: { kind: "npcs" | "quests" | "vendors"; label: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const ok = /^[1-9]\d*$/.test(value);

  return (
    <form
      className="flex flex-wrap gap-3 items-end"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ok) return;
        router.push(`/database/${kind}/${value}`);
      }}
    >
      <label className="text-sm text-fg-2 space-y-1">
        <span className="block text-xs font-mono text-muted">{label}</span>
        <input
          value={value}
          inputMode="numeric"
          onChange={(event) => setValue(event.target.value.trim())}
          className="w-40 rounded-lg border border-line bg-canvas px-3 py-2 text-fg"
        />
      </label>
      <button
        type="submit"
        disabled={!ok}
        className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-parchment-950 disabled:opacity-40"
      >
        Open
      </button>
    </form>
  );
}
