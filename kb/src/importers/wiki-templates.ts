/**
 * Inline wiki templates that the generic converter would drop mid-sentence ("purchased for at
 * standing"), rendered to the words a reader would see. Everything not listed here is left for the
 * converter. Each handled template has a fixture test; the list grows only with one.
 */

/** Template names (lower-case) this module renders or removes, for the coverage page. */
export const REPAIRED_TEMPLATES = [
  "g", "s", "c", "cost", "money",
  "npc", "item", "quest", "spell", "zone", "ability", "race",
  "rep", "faction standing", "patch",
  "horde icon", "horde icon small", "alliance icon", "alliance icon small", "neutral icon", "neutral icon small",
  "ss", "for", "stub", "removed",
];

const QUALIFIERS = new Set([
  "alliance", "horde", "neutral", "poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom",
]);

/** Splits template arguments on top-level `|`, ignoring pipes inside nested `{{ }}` or `[[ ]]`. */
function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === "{{" || two === "[[") { depth++; cur += two; i++; continue; }
    if (two === "}}" || two === "]]") { depth--; cur += two; i++; continue; }
    if (inner[i] === "|" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += inner[i];
  }
  out.push(cur);
  return out;
}

/** Index just past the `}}` closing the template that opens at `start`, or -1. */
function closeOf(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    const two = text.slice(i, i + 2);
    if (two === "{{") { depth++; i++; }
    else if (two === "}}") { depth--; i++; if (depth === 0) return i + 1; }
  }
  return -1;
}

function money(parts: string[]): string {
  const [g, s, c] = [0, 1, 2].map((i) => (parts[i] ?? "").trim());
  const out: string[] = [];
  if (g && g !== "0") out.push(`${g}g`);
  if (s && s !== "0") out.push(`${s}s`);
  if (c && c !== "0") out.push(`${c}c`);
  return out.join(" ");
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The rendering for one template, or null when it is not ours. */
function render(inner: string): string | null {
  const args = splitArgs(inner);
  const name = args[0].trim().toLowerCase();
  const positional = args.slice(1).filter((a) => !a.includes("=")).map((a) => a.trim());
  const named = Object.fromEntries(
    args.slice(1).filter((a) => a.includes("=")).map((a) => [a.slice(0, a.indexOf("=")).trim().toLowerCase(), a.slice(a.indexOf("=") + 1).trim()]),
  ) as Record<string, string>;

  if (name === "g" || name === "s" || name === "c") return name;
  if (name === "cost" || name === "money") return money(positional);
  if (name === "rep" || name === "faction standing") return capitalise(positional[0] ?? "");
  if (name === "race") return positional[0] ?? "";
  if (/^patch \d/.test(name)) return `${capitalise(args[0].trim())}${named.note ? `: ${named.note}` : ""}`;
  if (["npc", "item", "quest", "spell", "zone", "ability"].includes(name)) {
    if (positional.length === 0) return "";
    if (positional.length >= 2 && (positional[0] === "" || QUALIFIERS.has(positional[0].toLowerCase()))) {
      return positional[positional.length - 1] || positional[1];
    }
    return positional[positional.length - 1];
  }
  if (/^(horde|alliance|neutral) icon( small)?$/.test(name)) return "";
  if (name === "ss" || name === "for" || name === "removed" || name.startsWith("stub")) return "";
  return null;
}

/** Renders the handled templates to text, innermost first, leaving unknown templates untouched. */
export function repairTemplates(wikitext: string): string {
  let s = wikitext;
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    let i = s.indexOf("{{");
    while (i >= 0) {
      const end = closeOf(s, i);
      if (end < 0) break;
      const inner = s.slice(i + 2, end - 2);
      const nested = inner.indexOf("{{");
      if (nested >= 0 && render(inner) !== null && inner.slice(nested).includes("}}")) {
        // Resolve the inner template first so "{{Patch x|note=... {{NPC||Grex}}.}}" renders in one go.
        const innerRendered = repairTemplates(inner);
        if (innerRendered !== inner) { s = s.slice(0, i + 2) + innerRendered + s.slice(end - 2); changed = true; continue; }
      }
      const rendered = render(inner);
      if (rendered === null) { i = s.indexOf("{{", i + 2); continue; }
      s = s.slice(0, i) + rendered + s.slice(end);
      changed = true;
      i = s.indexOf("{{", i + rendered.length);
    }
    if (!changed) break;
  }
  // A removed template leaves its spacing behind: collapse runs of spaces and blank-only lines.
  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+(?=\S)/gm, (m, offset: number, str: string) => (str.lastIndexOf("\n", offset - 1) === offset - 1 || offset === 0 ? "" : m))
    .replace(/^\s*\n/gm, "")
    .replace(/^ /gm, "")
    .trim();
}

const DAMAGE_PATTERNS = [/ for at /, / at standing/, / at {2}/, / {2}standing/, /\w {2}\w/];

/** How many breakage patterns the converted text shows; 0 means clean. */
export function countDamage(text: string): number {
  return DAMAGE_PATTERNS.filter((re) => re.test(text)).length;
}
