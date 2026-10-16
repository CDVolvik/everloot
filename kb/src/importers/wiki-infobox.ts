/**
 * The first infobox-style template of a wiki page, as plain fields. Nothing is interpreted: a value
 * is the template's text with links, name templates and tags reduced to words. Later slices decide
 * what `ilvl=476` means; this one only keeps it from being thrown away.
 */

export interface Infobox {
  template: string;
  fields: Record<string, string>;
}

const INFOBOX_NAME = /^(infobox\b.*|npcbox|questbox|zonebox|itembox|#data:itemtip|#data:.*)$/i;
export const MAX_FIELDS = 40;
export const MAX_VALUE = 200;

/** Words a `{{NPC|Alliance|Name}}` or `{{item|epic|Name}}` may carry before the name. */
const QUALIFIERS = new Set([
  "alliance", "horde", "neutral", "poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom",
]);
const NAME_TEMPLATES = /^(npc|item|quest|spell|zone|ability|race|achievement)$/i;

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

/** Index just past the `}}` that closes the template opening at `start` (which points at `{{`), or -1. */
function closeOf(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    const two = text.slice(i, i + 2);
    if (two === "{{") { depth++; i++; }
    else if (two === "}}") { depth--; i++; if (depth === 0) return i + 1; }
  }
  return -1;
}

/** `{{Race|Human}}` → `Human`; `{{NPC||Jaina|icon=x}}` → `Jaina`; `{{item|epic|Thunderfury}}` → `Thunderfury`. */
function renderNameTemplate(inner: string): string | null {
  const args = splitArgs(inner);
  const name = args[0].trim();
  if (!NAME_TEMPLATES.test(name)) return null;
  const positional = args.slice(1).filter((a) => !a.includes("=")).map((a) => a.trim());
  if (positional.length === 0) return "";
  if (positional.length >= 2 && (positional[0] === "" || QUALIFIERS.has(positional[0].toLowerCase()))) {
    return positional[positional.length - 1] || positional[1];
  }
  return positional[positional.length - 1];
}

/** Field text → words: links to their label, name templates to their name, other templates and tags gone. */
export function plainValue(wikitext: string): string {
  let s = wikitext;
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    let i = s.indexOf("{{");
    while (i >= 0) {
      const end = closeOf(s, i);
      if (end < 0) break;
      const rendered = renderNameTemplate(s.slice(i + 2, end - 2));
      s = s.slice(0, i) + (rendered ?? "") + s.slice(end);
      changed = true;
      i = s.indexOf("{{", i + (rendered?.length ?? 0));
    }
    if (!changed) break;
  }
  return s
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/<[^>]+>/g, "")
    .replace(/'{2,}/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

export function extractInfobox(wikitext: string): Infobox | null {
  let i = wikitext.indexOf("{{");
  while (i >= 0) {
    const end = closeOf(wikitext, i);
    if (end < 0) return null;
    const inner = wikitext.slice(i + 2, end - 2);
    const nameEnd = inner.search(/[|\n]/);
    const template = (nameEnd < 0 ? inner : inner.slice(0, nameEnd)).trim().toLowerCase();
    if (INFOBOX_NAME.test(template)) {
      const fields: Record<string, string> = {};
      for (const arg of splitArgs(inner).slice(1)) {
        const eq = arg.indexOf("=");
        if (eq < 0) continue; // positional
        const key = arg.slice(0, eq).trim().toLowerCase();
        const value = plainValue(arg.slice(eq + 1)).slice(0, MAX_VALUE);
        if (!key || !value) continue;
        if (Object.keys(fields).length >= MAX_FIELDS) break;
        fields[key] = value;
      }
      return { template, fields };
    }
    i = wikitext.indexOf("{{", end);
  }
  return null;
}
