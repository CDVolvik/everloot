import { levelFor, pointsSpent } from "./rules";
import { decodeBuild, resolveBuild, type DecodeError } from "./share";
import type { Ranks, TalentCatalog } from "./types";

// What the page does with text a visitor pastes or opens: a bare share code, or a whole link that
// carries one after `#plan=`. Returns plain-English lines for everything that did not load as asked.

export interface ImportReport {
  /** The game build the code was made on, and the one on screen. */
  codeBuild: string;
  treeBuild: string;
  /** Problems, one sentence each. Empty means the code loaded exactly as made. */
  problems: string[];
}

export type ImportResult =
  | { ok: true; ranks: Ranks; minLevel: number; report: ImportReport }
  | { ok: false; message: string };

const DECODE_MESSAGES: Record<DecodeError, string> = {
  empty: "Paste a share code or a link first.",
  "not-base64url": "That is not a share code. Codes start with EL1 and use letters, digits, - and _ only.",
  malformed: "That share code is damaged or cut short.",
  "newer-version": "That code was made by a newer version of this tool. Reload the page, and if it still fails, ask the person who shared it to share it again.",
};

/** The share codes a page address carries: the first set after #plan=, the second after &plan2=. */
export function readPlanHash(hash: string): { first: string | null; second: string | null } {
  return {
    first: /[#&]plan=([A-Za-z0-9_.-]+)/.exec(hash)?.[1] ?? null,
    second: /[#&]plan2=([A-Za-z0-9_.-]+)/.exec(hash)?.[1] ?? null,
  };
}

/** The address fragment that carries both sets; empty when neither has a point. */
export function planHash(first: string | null, second: string | null): string {
  const parts = [first && `plan=${first}`, second && `plan2=${second}`].filter(Boolean);
  return parts.length ? `#${parts.join("&")}` : "";
}

export function extractCode(text: string): string {
  const fromLink = /[#&?]plan=([A-Za-z0-9_.-]+)/.exec(text);
  return fromLink ? fromLink[1] : text.trim();
}

export function importCode(catalog: TalentCatalog, text: string): ImportResult {
  const decoded = decodeBuild(extractCode(text));
  if (!decoded.ok) return { ok: false, message: DECODE_MESSAGES[decoded.error] };
  const resolved = resolveBuild(catalog, decoded.build);
  if (!resolved.ok) {
    return { ok: false, message: `That code is for a different class. Open this class's calculator to load it.` };
  }
  const { ranks, unknown, clamped, rejected, buildDiffers } = resolved.build;
  const problems: string[] = [];
  if (buildDiffers) {
    problems.push(`Made on game build ${decoded.build.build}; this tree is from build ${catalog.build}. Check each talent.`);
  }
  if (unknown.length > 0) {
    const ids = unknown.map((u) => `${u.id} (${u.rank} ${u.rank === 1 ? "point" : "points"})`).join(", ");
    problems.push(`${unknown.length} ${unknown.length === 1 ? "talent in the code is" : "talents in the code are"} not in this tree and ${unknown.length === 1 ? "was" : "were"} left out: node ${ids}.`);
  }
  for (const c of clamped) {
    problems.push(c.what === "rank"
      ? `${c.name}: the code asked for rank ${c.asked}, but the most this tree allows is ${c.got}.`
      : `${c.name}: the code picked a choice this tree does not have, so the first choice is used.`);
  }
  for (const r of rejected) {
    problems.push(`${r.name}: ${r.rank} ${r.rank === 1 ? "point" : "points"} not placed. ${r.why}`);
  }
  return {
    ok: true,
    ranks,
    minLevel: levelFor(catalog, pointsSpent(ranks)),
    report: { codeBuild: decoded.build.build, treeBuild: catalog.build, problems },
  };
}
