"use client";

import { useState } from "react";
import { handleProfessionPath } from "../../../kb/src/profession-path";

export default function ProfessionPathForm() {
  const [profession, setProfession] = useState("Alchemy");
  const [fromSkill, setFromSkill] = useState(1);
  const [toSkill, setToSkill] = useState(75);
  const [answer, setAnswer] = useState("");

  return (
    <form
      className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setAnswer(handleProfessionPath({ profession, fromSkill, toSkill }));
      }}
    >
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm text-parchment-100/80 space-y-1">
          <span className="block text-xs uppercase tracking-wider text-parchment-100/50">Profession</span>
          <input
            value={profession}
            onChange={(event) => setProfession(event.target.value)}
            className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100"
          />
        </label>
        <label className="text-sm text-parchment-100/80 space-y-1">
          <span className="block text-xs uppercase tracking-wider text-parchment-100/50">From skill</span>
          <input
            type="number"
            min={1}
            max={500}
            value={fromSkill}
            onChange={(event) => setFromSkill(Number(event.target.value))}
            className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100"
          />
        </label>
        <label className="text-sm text-parchment-100/80 space-y-1">
          <span className="block text-xs uppercase tracking-wider text-parchment-100/50">To skill</span>
          <input
            type="number"
            min={1}
            max={500}
            value={toSkill}
            onChange={(event) => setToSkill(Number(event.target.value))}
            className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100"
          />
        </label>
      </div>
      <button type="submit" className="px-4 py-2 rounded-lg bg-gold-500 text-parchment-950 font-semibold hover:bg-gold-400 transition">
        Show the path
      </button>
      {answer && (
        <pre className="whitespace-pre-wrap text-sm text-parchment-100/85 font-sans">{answer}</pre>
      )}
    </form>
  );
}
