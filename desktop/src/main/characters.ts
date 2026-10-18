import { readFileSync } from "node:fs";
import { parseEverlootLua } from "../../../web/src/lib/sv-parse";
import type { CharacterRow, CharactersInfo, ProgressRow } from "../shared/types";

/**
 * What the addon knows about the player's own characters, read from the save file and shown only
 * here. This is the named data the upload never sends from the app (gold, gear, progress); it stays
 * on the machine unless the player shares it on the website with a verified grant.
 */

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function summarizeCharacters(text: string): CharactersInfo {
  const { records } = parseEverlootLua(text);
  const named = new Map<string, CharacterRow>();
  const keyed = new Map<string, ProgressRow>();
  const row = (r: Record<string, unknown>): CharacterRow | null => {
    const character = str(r.character), realm = str(r.realm);
    if (!character || !realm) return null;
    const id = `${character}-${realm}`;
    let c = named.get(id);
    if (!c) { c = { character, realm, gold: null, peakGold: null, gearSlots: 0, itemLevel: null, spent: {}, earned: {} }; named.set(id, c); }
    return c;
  };
  const prog = (r: Record<string, unknown>): ProgressRow | null => {
    const key = str(r.characterKey);
    if (!key) return null;
    let p = keyed.get(key);
    if (!p) { p = { key, class: str(r.class) || "?", level: num(r.level), achievements: 0, achievementsInProgress: 0, reputations: 0, exalted: 0, titles: 0, quests: 0, talentPoints: null }; keyed.set(key, p); }
    if (num(r.level) > p.level) p.level = num(r.level);
    if (str(r.class)) p.class = str(r.class);
    return p;
  };
  const titles = new Map<string, Set<number>>(), quests = new Map<string, Set<number>>(), achievements = new Map<string, Map<number, boolean>>(), reps = new Map<string, Map<number, number>>();
  for (const r of records) {
    switch (r.kind) {
      case "gold_snapshot": { const c = row(r); if (c) { c.gold = num(r.currentCopper); c.peakGold = Math.max(c.peakGold ?? 0, num(r.peakCopper)); } break; }
      case "gear_snapshot": {
        const c = row(r); if (!c) break;
        const eq = Array.isArray(r.equipped) ? (r.equipped as Record<string, unknown>[]) : [];
        if (eq.length) { c.gearSlots = eq.length; c.itemLevel = Math.round(eq.reduce((s, e) => s + num(e.itemLevel), 0) / eq.length); }
        break;
      }
      case "money_event": {
        const c = row(r); if (!c) break;
        const cat = str(r.category), copper = num(r.copper);
        const bucket = ["vendor", "flight", "postage", "barber", "respec", "auction_spend"].includes(cat) ? c.spent : c.earned;
        bucket[cat] = (bucket[cat] ?? 0) + copper;
        break;
      }
      case "achievement_owned": { const p = prog(r); if (!p) break; const m = achievements.get(p.key) ?? new Map<number, boolean>(); m.set(num(r.achievementId), r.completed === true); achievements.set(p.key, m); break; }
      case "reputation_owned": { const p = prog(r); if (!p) break; const m = reps.get(p.key) ?? new Map<number, number>(); m.set(num(r.factionId), num(r.reaction)); reps.set(p.key, m); break; }
      case "title_owned": { const p = prog(r); if (!p) break; const s = titles.get(p.key) ?? new Set<number>(); for (const id of (Array.isArray(r.titleIds) ? r.titleIds : []) as unknown[]) s.add(num(id)); titles.set(p.key, s); break; }
      case "quest_owned": { const p = prog(r); if (!p) break; const s = quests.get(p.key) ?? new Set<number>(); for (const id of (Array.isArray(r.questIds) ? r.questIds : []) as unknown[]) s.add(num(id)); quests.set(p.key, s); break; }
      default: break;
    }
  }
  for (const [key, p] of keyed) {
    const a = achievements.get(key);
    if (a) { p.achievements = [...a.values()].filter(Boolean).length; p.achievementsInProgress = [...a.values()].filter((v) => !v).length; }
    const rp = reps.get(key);
    if (rp) { p.reputations = rp.size; p.exalted = [...rp.values()].filter((v) => v >= 8).length; }
    p.titles = titles.get(key)?.size ?? 0;
    p.quests = quests.get(key)?.size ?? 0;
  }
  // Talent snapshots carry class and level but no key or name; count the active one per class as a hint.
  const talents = records.filter((r) => r.kind === "talent_snapshot" && r.active === true).map((r) => ({ class: str(r.class), level: num(r.level), points: num(r.points) }));
  return {
    characters: [...named.values()].sort((a, b) => (b.gold ?? 0) - (a.gold ?? 0)),
    progress: [...keyed.values()].sort((a, b) => b.level - a.level),
    talents,
  };
}

export function charactersFromFiles(files: string[]): CharactersInfo {
  const all: CharactersInfo = { characters: [], progress: [], talents: [] };
  for (const file of files) {
    try {
      const one = summarizeCharacters(readFileSync(file, "utf8"));
      all.characters.push(...one.characters); all.progress.push(...one.progress); all.talents.push(...one.talents);
    } catch { /* an unreadable file shows on the Upload page */ }
  }
  return all;
}
