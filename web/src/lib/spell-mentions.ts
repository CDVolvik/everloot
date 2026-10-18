import { CURRENT_BUILD, TABLES } from "@/data/game-data/raid";
import { tipLabel, type SiteAssets, type SpellTip } from "@/lib/game-assets";
import { loadCatalog, TALENT_CLASSES } from "@/lib/talents/catalogs";

// Spell names in running text (the patch notes) with the game's icon and tooltip. Only the spells the
// site already shows are matched: the talents of the talent calculator and the raid builder's buffs.
// Nothing is matched without the asset URL, so the text stays exactly as it was.

/** A spell name the site already shows, and the page that shows it. */
export interface NamedSpell { name: string; href: string; talent?: number; spellIds?: number[] }
export interface Mention { tip: SpellTip; href: string }
export interface MentionIndex { pattern: RegExp | null; byName: Map<string, Mention> }
export type Piece = string | { text: string; mention: Mention };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every talent of the nine calculators and every raid buff, with where each is shown. */
export async function siteSpellNames(): Promise<NamedSpell[]> {
  const out: NamedSpell[] = [];
  for (const slug of TALENT_CLASSES) {
    const catalog = await loadCatalog(slug);
    for (const node of catalog.nodes) for (const e of node.entries) {
      if (e.definitionId !== null) out.push({ name: e.name, href: `/tools/talents/${slug}`, talent: e.definitionId });
    }
  }
  for (const e of TABLES[CURRENT_BUILD].entries) out.push({ name: e.label, href: "/tools/raid", spellIds: e.spellIds });
  return out;
}

/**
 * Names to their tooltips. Only names of two words or more are matched, so a plain word in a sentence
 * ("Precision", "Toughness") is never taken for a talent, and a name that stands for spells on two
 * different pages is left out rather than guessed. Empty without the asset files.
 */
export function mentionIndex(assets: SiteAssets | null, spells: NamedSpell[]): MentionIndex {
  const byName = new Map<string, Mention>();
  if (!assets) return { pattern: null, byName };
  const pages = new Map<string, Set<string>>();
  for (const s of spells) pages.set(s.name.trim(), (pages.get(s.name.trim()) ?? new Set()).add(s.href));
  for (const s of spells) {
    const name = s.name.trim();
    if (name.split(/\s+/).length < 2 || pages.get(name)!.size > 1 || byName.has(name)) continue;
    let tip: SpellTip | null = null;
    if (s.talent !== undefined) {
      const t = assets.talents.get(s.talent);
      if (t && (t.text || t.icon)) tip = { name, icon: t.icon, text: t.text, partial: t.partial, label: tipLabel(assets) };
    } else {
      const id = s.spellIds?.find((i) => assets.spellTips.get(i)?.text);
      const t = id === undefined ? undefined : assets.spellTips.get(id);
      if (t) tip = { name, icon: assets.spellIcons.get(id!) ?? null, text: t.text, partial: t.partial, label: tipLabel(assets) };
    }
    if (tip) byName.set(name, { tip, href: s.href });
  }
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escape);
  // Whole names only: not inside a longer word, and case as the game writes it.
  return { pattern: names.length ? new RegExp(`(?<![\\w'])(?:${names.join("|")})(?![\\w'])`, "g") : null, byName };
}

/** The text cut into plain runs and spell names. Text with no name comes back as one piece. */
export function splitMentions(text: string, index: MentionIndex): Piece[] {
  if (!index.pattern) return [text];
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(index.pattern)) {
    const mention = index.byName.get(m[0]);
    if (!mention || m.index === undefined) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ text: m[0], mention });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}
