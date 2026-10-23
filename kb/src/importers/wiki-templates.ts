/**
 * Inline wiki templates that the generic converter would drop mid-sentence ("purchased for at
 * standing"), rendered to the words a reader would see. Everything not listed here is left for the
 * converter. Each handled template has a fixture test; the list grows only with one.
 *
 * One left-to-right pass: `{{` opens a buffer, `}}` closes the innermost one and renders it, so
 * nesting resolves innermost-first and the cost is linear in the page size. Past MAX_DEPTH the braces
 * are kept as text, so a pathological nest cannot make each close re-copy the whole page.
 */

/** Template names (lower-case) this module renders or removes, for the coverage page. */
export const REPAIRED_TEMPLATES = [
  "g", "s", "c", "cost", "money",
  "npc", "item", "quest", "spell", "zone", "ability", "race",
  "rep", "faction standing", "patch",
  "horde icon", "horde icon small", "alliance icon", "alliance icon small", "neutral icon", "neutral icon small",
  "alliance", "horde", "neutral",
  "wp", "wplink", "au", "alternate universe", "loot", "coppercost", "cv-ah",
  "ss", "for", "stub", "removed",
];

const QUALIFIERS = new Set([
  "alliance", "horde", "neutral", "poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom",
]);

/** Stands in for a removed template until the line clean-up below; never appears in wikitext. */
const REMOVED = "\u0000";

/** Deepest template nest rendered; real pages stay in single digits. */
const MAX_DEPTH = 32;

/** Splits template arguments on top-level `|`, ignoring pipes inside nested `[[ ]]` (nested `{{ }}` are already rendered). */
function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === "[[") { depth++; cur += two; i++; continue; }
    if (two === "]]") { depth--; cur += two; i++; continue; }
    if (inner[i] === "|" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += inner[i];
  }
  out.push(cur);
  return out;
}

function money(parts: string[]): string {
  const [g, s, c] = [0, 1, 2].map((i) => (parts[i] ?? "").trim());
  const out: string[] = [];
  if (g && g !== "0") out.push(`${g}g`);
  if (s && s !== "0") out.push(`${s}s`);
  if (c && c !== "0") out.push(`${c}c`);
  return out.length > 0 ? out.join(" ") : (g || s || c ? "0c" : "");
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The rendering for one template (its inner text, nested templates already rendered), or null when it is not ours. */
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
  // {{wp|Article|label}} links Wikipedia, {{au|Name|label}} the "Name (alternate universe)" page; both show the label or the name.
  if (["wp", "wplink", "au", "alternate universe"].includes(name)) return positional[1] || positional[0] || "";
  // {{loot|quality|Item|label}}: the label, else the item name.
  if (name === "loot") return positional[2] || positional[1] || "";
  // {{coppercost|86000}}: one copper amount, shown as gold, silver and copper.
  if (name === "coppercost") {
    const copper = (positional[0] ?? "").replace(/,/g, "");
    if (!/^\d+$/.test(copper)) return null;
    const n = Number(copper);
    return money([String(Math.floor(n / 10000)), String(Math.floor((n % 10000) / 100)), String(n % 100)]);
  }
  // {{cv-AH|Alliance text|Horde text}}: the wiki shows one side by the reader's faction, "A or H" without it.
  if (name === "cv-ah") return [positional[0], positional[1]].filter(Boolean).join(" or ");
  // {{Alliance}}, {{Horde}}, {{Neutral}} are the small faction icon alone.
  if (/^(horde|alliance|neutral)( icon( small)?)?$/.test(name)) return REMOVED;
  if (name === "ss" || name === "for" || name === "removed" || name.startsWith("stub")) return REMOVED;
  return null;
}

/** Renders the handled templates to text in one pass, leaving unknown templates and all line structure untouched. */
export function repairTemplates(wikitext: string): string {
  const stack: string[] = [];
  let cur = "";
  let literal = 0; // opens past MAX_DEPTH, kept as text along with their closes
  for (let i = 0; i < wikitext.length; i++) {
    const two = wikitext.slice(i, i + 2);
    if (two === "{{" && stack.length >= MAX_DEPTH) { literal++; cur += two; i++; continue; }
    if (two === "}}" && literal > 0) { literal--; cur += two; i++; continue; }
    if (two === "{{") { stack.push(cur); cur = ""; i++; continue; }
    if (two === "}}" && stack.length > 0) {
      const inner = cur;
      cur = stack.pop()!;
      const rendered = render(inner);
      cur += rendered === null ? `{{${inner}}}` : rendered;
      i++;
      continue;
    }
    cur += wikitext[i];
  }
  // Unclosed `{{`: put the raw opening back and keep whatever was rendered inside it.
  while (stack.length > 0) cur = `${stack.pop()!}{{${cur}`;
  // A removed template leaves its spacing behind: drop lines that held only removed templates, and
  // collapse the spaces around removed templates inside a line. Blank lines and indentation stay.
  return cur
    .split("\n")
    .filter((line) => !(line.includes(REMOVED) && line.replace(new RegExp(REMOVED, "g"), "").trim() === ""))
    .map((line) => (line.includes(REMOVED) ? line.replace(new RegExp(`^(${REMOVED} *)+`), "").replace(new RegExp(` *${REMOVED} *`, "g"), " ").replace(/ +$/, "") : line))
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

const DAMAGE_PATTERNS = [/ for at /, / at standing/, / at {2}/, / {2}standing/, /\w {2}\w/];

/** How many breakage patterns the converted text shows; 0 means clean. */
export function countDamage(text: string): number {
  return DAMAGE_PATTERNS.filter((re) => re.test(text)).length;
}
