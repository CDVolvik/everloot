/**
 * The completion rollup: a compact fold of the eight completion kinds, kept apart from the corpus
 * (kb/src/corpus.ts skips them) so the corpus every page loads does not carry them.
 *
 * Catalog entries keep up to three installs per distinct content, each install backing only the content it
 * reported last; an entry is listed once 3 installs reported the identical content. Owned rows keep only the latest row per (install, character, id), and
 * titles and completed quests as one sorted union. Owned data is shown only for installs whose current
 * grant covers the collection category (authorizedOwners).
 */
import { COMPLETION_KINDS, parseRecords } from "../../web/src/lib/intake.js";
import type { IntakeRecord } from "../../web/src/lib/intake.js";
import { canonicalJson } from "./corpus.js";
import { authorizeRecord, type PublicationState } from "./publication.js";
import type { CompletionFacts, OwnedCharacter } from "./completion.js";

export const COMPLETION_AGREEMENT = 3;
/** The rollup file is refused past this size, like the market's. */
export const COMPLETION_MAX_BYTES = 32_000_000;
const MAX_IDS_PER_KIND = 6000;
const MAX_VARIANTS_PER_ID = 3;
const MAX_CHARACTERS_PER_INSTALL = 8;
const MAX_GRANTS_PER_INSTALL = 8;

type Variant = { content: string; installs: string[] };
type CatalogKey = "a" | "f" | "t" | "q";
type Stamp = { at: string; n: number };
type AchState = Stamp & { c: boolean; e?: boolean; m: number; t: number; q?: number; r?: number };
type RepState = Stamp & { k: number; s: number; lo: number; hi: number };
export type CharacterState = {
  class: string; level: number; at: string; n: number;
  a: Record<string, AchState>; f: Record<string, RepState>; t: number[]; q: number[];
};
export type CompletionState = {
  version: 1;
  catalog: Record<CatalogKey, Record<string, Variant[]>>;
  owned: Record<string, { grants: string[]; characters: Record<string, CharacterState> }>;
};

export function emptyCompletion(): CompletionState {
  return { version: 1, catalog: { a: {}, f: {}, t: {}, q: {} }, owned: {} };
}

/** The sequence number at the end of an event id ("epoch:12" is 12), compared as a number. */
export function eventSeq(eventId: string | undefined): number {
  const n = Number((eventId ?? "").split(":").pop());
  return Number.isFinite(n) ? n : 0;
}

/** True when (at, n) is later than the stamp. Capture time first, then the numeric sequence. */
function later(row: { capturedAt: string; eventId?: string }, stamp: Stamp): boolean {
  const order = row.capturedAt.localeCompare(stamp.at);
  return order > 0 || (order === 0 && eventSeq(row.eventId) >= stamp.n);
}

const CATALOG_BUCKET: Record<string, CatalogKey> = {
  achievement_catalog: "a", reputation_catalog: "f", title_catalog: "t", quest_chain_catalog: "q",
};

function catalogId(row: IntakeRecord): number {
  switch (row.kind) {
    case "achievement_catalog": return row.achievementId;
    case "reputation_catalog": return row.factionId;
    case "title_catalog": return row.titleId;
    case "quest_chain_catalog": return row.questLineId;
    default: return 0;
  }
}

function foldCatalog(state: CompletionState, row: IntakeRecord) {
  const bucket = state.catalog[CATALOG_BUCKET[row.kind]];
  const id = String(catalogId(row));
  const { installId, eventId: _e, capturedAt: _c, kind: _k, ...rest } = row as IntakeRecord & { installId: string };
  const content = canonicalJson(rest);
  if (!bucket[id] && Object.keys(bucket).length >= MAX_IDS_PER_KIND) return;
  // An install backs one content per id, the one it reported last, so one install cannot fill an id's variants by itself.
  const variants = (bucket[id] ?? [])
    .map((v) => (v.content === content ? v : { ...v, installs: v.installs.filter((i) => i !== installId) }))
    .filter((v) => v.installs.length > 0 || v.content === content);
  bucket[id] = variants;
  let variant = variants.find((v) => v.content === content);
  if (!variant) {
    if (variants.length >= MAX_VARIANTS_PER_ID) return;
    variant = { content, installs: [] };
    variants.push(variant);
  }
  if (variant.installs.length < COMPLETION_AGREEMENT && !variant.installs.includes(installId)) variant.installs.push(installId);
}

/**
 * Fold uploads into the state, in order. Titles and quests are merged once at the end, so a long list is not
 * re-sorted per row. The state is changed in place and returned.
 */
export function foldCompletion(
  state: CompletionState,
  uploads: readonly { records: readonly unknown[]; grants: readonly string[] }[],
): CompletionState {
  const wanted = new Set<string>(COMPLETION_KINDS);
  const additions = new Map<CharacterState, { t: Set<number>; q: Set<number> }>();
  for (const upload of uploads) {
    const mine = upload.records.filter((r) => typeof r === "object" && r !== null && wanted.has((r as { kind?: string }).kind ?? ""));
    for (const row of parseRecords(mine).records) {
      if (!row.eventId) continue;
      if (row.kind in CATALOG_BUCKET) { foldCatalog(state, row); continue; }
      if (!("characterKey" in row)) continue;
      const install = state.owned[row.installId] ?? (Object.keys(state.owned).length >= 20000 ? null : (state.owned[row.installId] = { grants: [], characters: {} }));
      if (!install) continue;
      install.grants = [...new Set([...install.grants, ...upload.grants])].sort().slice(0, MAX_GRANTS_PER_INSTALL);
      let character = install.characters[row.characterKey];
      if (!character) {
        if (Object.keys(install.characters).length >= MAX_CHARACTERS_PER_INSTALL) continue;
        character = install.characters[row.characterKey] = { class: row.class, level: row.level, at: "", n: 0, a: {}, f: {}, t: [], q: [] };
      }
      if (later(row, character)) { character.class = row.class; character.level = row.level; character.at = row.capturedAt; character.n = eventSeq(row.eventId); }
      const stamp = { at: row.capturedAt, n: eventSeq(row.eventId) };
      if (row.kind === "achievement_owned") {
        const old = character.a[row.achievementId];
        if (!old || later(row, old)) {
          character.a[row.achievementId] = { ...stamp, c: row.completed, e: row.earnedByMe, m: row.criteriaMet, t: row.criteriaTotal, q: row.quantity, r: row.required };
        }
      } else if (row.kind === "reputation_owned") {
        const old = character.f[row.factionId];
        if (!old || later(row, old)) character.f[row.factionId] = { ...stamp, k: row.reaction, s: row.standing, lo: row.floor, hi: row.ceiling };
      } else if (row.kind === "title_owned" || row.kind === "quest_owned") {
        const add = additions.get(character) ?? { t: new Set<number>(), q: new Set<number>() };
        (row.kind === "title_owned" ? row.titleIds : row.questIds).forEach((id) => add[row.kind === "title_owned" ? "t" : "q"].add(id));
        additions.set(character, add);
      }
    }
  }
  for (const [character, add] of additions) {
    if (add.t.size) character.t = [...new Set([...character.t, ...add.t])].sort((x, y) => x - y);
    if (add.q.size) character.q = [...new Set([...character.q, ...add.q])].sort((x, y) => x - y);
  }
  return state;
}

/** Whether a state is the shape this code writes. A stored rollup that is not is unusable, not empty. */
export function isCompletionState(value: unknown): value is CompletionState {
  const s = value as Partial<CompletionState> | null;
  return !!s && s.version === 1 && !!s.catalog && typeof s.catalog === "object" && !!s.owned && typeof s.owned === "object" &&
    (["a", "f", "t", "q"] as const).every((k) => !!s.catalog![k] && typeof s.catalog![k] === "object");
}

type Agreed = Pick<CompletionFacts, "achievements" | "factions" | "titles" | "chains">;
const agreedCache = new WeakMap<CompletionState, Agreed>();

/** One entry per id: the smallest content that 3 installs reported identically. */
function agreedOf<T>(bucket: Record<string, Variant[]>, build: (id: number, row: Record<string, unknown>) => T): Map<number, T> {
  const out = new Map<number, T>();
  for (const [id, variants] of Object.entries(bucket)) {
    const best = variants.filter((v) => v.installs.length >= COMPLETION_AGREEMENT).sort((x, y) => x.content.localeCompare(y.content))[0];
    if (best) out.set(Number(id), build(Number(id), JSON.parse(best.content) as Record<string, unknown>));
  }
  return out;
}

/** The agreed catalog of a state, computed once per state object (the store hands out the same one while cached). */
export function agreedCatalog(state: CompletionState): Agreed {
  const hit = agreedCache.get(state);
  if (hit) return hit;
  const agreed: Agreed = {
    achievements: agreedOf(state.catalog.a, (id, r) => ({ achievementId: id, name: String(r.name), category: String(r.category), points: Number(r.points), criteriaCount: Number(r.criteriaCount) })),
    factions: agreedOf(state.catalog.f, (id, r) => ({ factionId: id, name: String(r.name), header: r.header as string | undefined, major: r.major === true })),
    titles: agreedOf(state.catalog.t, (id, r) => ({ titleId: id, name: String(r.name) })),
    chains: agreedOf(state.catalog.q, (id, r) => ({ questLineId: id, name: String(r.name), questIds: r.questIds as number[], truncated: r.truncated === true })),
  };
  agreedCache.set(state, agreed);
  return agreed;
}

/** Installs whose current grant covers owned progress. Authority is read now, never remembered from upload time. */
export function authorizedOwners(state: CompletionState, authority: PublicationState, now: Date): Set<string> {
  const allowed = new Set<string>();
  for (const [installId, owned] of Object.entries(state.owned)) {
    const probe = { kind: "title_owned", installId, eventId: "probe:1", capturedAt: now.toISOString(), characterKey: "00000000", class: "MAGE", level: 1, titleIds: [1] } as IntakeRecord;
    if (authorizeRecord(probe, owned.grants, authority, now)) allowed.add(installId);
  }
  return allowed;
}

/** The facts the page and the MCP tool read: the agreed catalog, and owned progress for installs in `owners`. */
export function completionFactsOf(state: CompletionState, owners: ReadonlySet<string> | "all"): CompletionFacts {
  const owned: OwnedCharacter[] = [];
  for (const [installId, install] of Object.entries(state.owned)) {
    if (owners !== "all" && !owners.has(installId)) continue;
    for (const [characterKey, c] of Object.entries(install.characters)) {
      owned.push({
        installId, characterKey, class: c.class, level: c.level,
        achievements: new Map(Object.entries(c.a).map(([id, a]) => [Number(id), { completed: a.c, earnedByMe: a.e, criteriaMet: a.m, criteriaTotal: a.t, quantity: a.q, required: a.r }])),
        factions: new Map(Object.entries(c.f).map(([id, f]) => [Number(id), { reaction: f.k, standing: f.s, floor: f.lo, ceiling: f.hi }])),
        titles: new Set(c.t), quests: new Set(c.q),
      });
    }
  }
  return { ...agreedCatalog(state), owned };
}

/** Facts straight from records, for tests and local tools: every owner is trusted. */
export function completionFactsFromRecords(records: unknown[]): CompletionFacts {
  return completionFactsOf(foldCompletion(emptyCompletion(), [{ records, grants: [] }]), "all");
}
