/**
 * The completion rollup: a compact fold of the eight completion kinds, kept apart from the corpus
 * (kb/src/corpus.ts skips them) so the corpus every page loads does not carry them.
 *
 * Catalog entries are votes. A voter is an upload address (the intake's keyed hash, as the market
 * counts it), or the install when an upload carries none. A voter backs one content per entry, the one
 * it reported last; an entry is listed once 3 voters back the identical content, and among such
 * contents the most supported, then the most recently seen, wins. Supporters are counted up to a sample
 * of 16. An entry nobody has confirmed yet is bounded per voter, per install and per upload, and is the
 * first thing trimmed when the rollup nears its size limit.
 *
 * Owned rows keep only the latest row per (install, character, id), and titles and completed quests as
 * one sorted union. Owned data is shown only for installs whose current grant covers the collection
 * category (authorizedOwners).
 */
import { COMPLETION_KINDS, parseRecords } from "../../web/src/lib/intake.js";
import type { IntakeRecord } from "../../web/src/lib/intake.js";
import { canonicalJson } from "./corpus.js";
import { authorizeRecord, type PublicationState } from "./publication.js";
import type { CompletionFacts, OwnedCharacter } from "./completion.js";

export const COMPLETION_AGREEMENT = 3;
/** The rollup file is refused past this size on read; a write trims to stay well under it. */
export const COMPLETION_MAX_BYTES = 32_000_000;
export const COMPLETION_LIMITS = {
  idsPerKind: 20_000,
  variantsPerId: 3,
  /** Distinct supporters remembered per content; the count stops here. */
  sample: 16,
  /** Unconfirmed contents one voter, one install, or one upload may hold or add. */
  openPerVoter: 4000,
  openPerInstall: 4000,
  newPerUpload: 4000,
  /** Canonical JSON of the listed fields of one entry. */
  contentBytes: 2048,
  charactersPerInstall: 8,
  grantsPerInstall: 8,
  installs: 20_000,
};

/** c: listed fields as canonical JSON; v: supporters (voter keys), at most `sample`; s: last seen (epoch s); by: creator [voter, install]. */
type Variant = { c: string; v: string[]; s: number; by: [string, string] };
type CatalogKey = "a" | "f" | "t" | "q";
type Stamp = { at: string; n: number };
type AchState = Stamp & { c: boolean; e?: boolean; m: number; t: number; q?: number; r?: number };
type RepState = Stamp & { k: number; s: number; lo: number; hi: number };
export type CharacterState = {
  class: string; level: number; at: string; n: number;
  a: Record<string, AchState>; f: Record<string, RepState>; t: number[]; q: number[];
};
export type InstallState = { grants: string[]; characters: Record<string, CharacterState>; dropped: number };
export type CompletionState = {
  version: 2;
  catalog: Record<CatalogKey, Record<string, Variant[]>>;
  owned: Record<string, InstallState>;
};
export type CompletionUpload = { records: readonly unknown[]; grants: readonly string[]; reporter?: string; receivedAt?: string };

export function emptyCompletion(): CompletionState {
  return { version: 2, catalog: { a: {}, f: {}, t: {}, q: {} }, owned: {} };
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

/** The id and the fields the lists show. Agreement is on these; criteria text and category ids are not shown. */
function listed(row: IntakeRecord): { id: number; fields: Record<string, unknown> } | null {
  switch (row.kind) {
    case "achievement_catalog": return { id: row.achievementId, fields: { name: row.name, category: row.category, points: row.points, criteriaCount: row.criteriaCount } };
    case "reputation_catalog": return { id: row.factionId, fields: { name: row.name, header: row.header, major: row.major === true } };
    case "title_catalog": return { id: row.titleId, fields: { name: row.name } };
    case "quest_chain_catalog": return { id: row.questLineId, fields: { name: row.name, questIds: row.questIds, truncated: row.truncated === true } };
    default: return null;
  }
}

const confirmed = (v: Variant) => v.v.length >= COMPLETION_AGREEMENT;

/** Unconfirmed contents per creator, counted from the state at the start of a fold. */
type Open = { voter: Map<string, number>; install: Map<string, number> };
function openOf(state: CompletionState): Open {
  const open: Open = { voter: new Map(), install: new Map() };
  for (const bucket of Object.values(state.catalog)) {
    for (const variants of Object.values(bucket)) for (const v of variants) if (!confirmed(v)) bump(open, v, 1);
  }
  return open;
}
function bump(open: Open, v: Variant, delta: number) {
  open.voter.set(v.by[0], (open.voter.get(v.by[0]) ?? 0) + delta);
  open.install.set(v.by[1], (open.install.get(v.by[1]) ?? 0) + delta);
}

/** Make room for a new id: drop the least recently seen twentieth of the ids nobody confirmed. */
function evictIds(bucket: Record<string, Variant[]>, open: Open): boolean {
  const candidates = Object.entries(bucket).filter(([, vs]) => !vs.some(confirmed))
    .map(([id, vs]) => ({ id, vs, s: Math.max(...vs.map((v) => v.s)) }))
    .sort((x, y) => x.s - y.s)
    .slice(0, Math.max(1, Math.ceil(COMPLETION_LIMITS.idsPerKind / 20)));
  for (const { id, vs } of candidates) { vs.forEach((v) => bump(open, v, -1)); delete bucket[id]; }
  return candidates.length > 0;
}

type UploadContext = { voter: string; install: string; seen: number; added: number };

function foldCatalog(state: CompletionState, row: IntakeRecord, ctx: UploadContext, open: Open) {
  const entry = listed(row);
  if (!entry) return;
  const content = canonicalJson(entry.fields);
  if (content.length > COMPLETION_LIMITS.contentBytes) return;
  const bucket = state.catalog[CATALOG_BUCKET[row.kind]];
  const id = String(entry.id);
  const variants = bucket[id] ?? [];
  // A voter backs one content per id, the one it reported last.
  for (const v of variants) {
    if (v.c === content) continue;
    const i = v.v.indexOf(ctx.voter);
    if (i < 0) continue;
    const was = confirmed(v);
    v.v.splice(i, 1);
    if (was && !confirmed(v)) bump(open, v, 1);
  }
  let variant = variants.find((v) => v.c === content);
  if (!variant) {
    if (ctx.added >= COMPLETION_LIMITS.newPerUpload) return;
    if ((open.voter.get(ctx.voter) ?? 0) >= COMPLETION_LIMITS.openPerVoter) return;
    if ((open.install.get(ctx.install) ?? 0) >= COMPLETION_LIMITS.openPerInstall) return;
    if (!bucket[id] && Object.keys(bucket).length >= COMPLETION_LIMITS.idsPerKind && !evictIds(bucket, open)) return;
    if (variants.length >= COMPLETION_LIMITS.variantsPerId) {
      // The least supported content leaves, the least recently seen first, so junk cannot hold the slots.
      const out = variants.reduce((x, y) => (y.v.length < x.v.length || (y.v.length === x.v.length && y.s < x.s) ? y : x));
      if (!confirmed(out)) bump(open, out, -1);
      variants.splice(variants.indexOf(out), 1);
    }
    variant = { c: content, v: [], s: ctx.seen, by: [ctx.voter, ctx.install] };
    variants.push(variant);
    bump(open, variant, 1);
    ctx.added++;
  }
  variant.s = Math.max(variant.s, ctx.seen);
  if (!variant.v.includes(ctx.voter) && variant.v.length < COMPLETION_LIMITS.sample) {
    const was = confirmed(variant);
    variant.v.push(ctx.voter);
    if (!was && confirmed(variant)) bump(open, variant, -1);
  }
  // Ids whose contents all left are removed.
  const kept = variants.filter((v) => v.v.length > 0 || v === variant);
  for (const v of variants) if (!kept.includes(v)) bump(open, v, -1);
  if (kept.length) bucket[id] = kept; else delete bucket[id];
}

/** The capture time, never later than the upload's arrival: a future clock cannot pin a row. */
function clampedAt(capturedAt: string, receivedAt: string | undefined): string {
  if (!receivedAt) return capturedAt;
  const r = Date.parse(receivedAt);
  if (!Number.isFinite(r)) return capturedAt;
  return Date.parse(capturedAt) > r ? new Date(r).toISOString() : capturedAt;
}

function installOf(state: CompletionState, installId: string, count: { n: number }): InstallState | null {
  const existing = state.owned[installId];
  if (existing) return existing;
  if (count.n >= COMPLETION_LIMITS.installs) return null;
  count.n++;
  return (state.owned[installId] = { grants: [], characters: {}, dropped: 0 });
}

/**
 * Fold uploads into the state, in order. Titles and quests are merged once at the end, so a long list is not
 * re-sorted per row. The state is changed in place and returned.
 */
export function foldCompletion(state: CompletionState, uploads: readonly CompletionUpload[]): CompletionState {
  const wanted = new Set<string>(COMPLETION_KINDS);
  const additions = new Map<CharacterState, { t: Set<number>; q: Set<number> }>();
  const open = openOf(state);
  const installs = { n: Object.keys(state.owned).length };
  for (const upload of uploads) {
    const mine = upload.records.filter((r) => typeof r === "object" && r !== null && wanted.has((r as { kind?: string }).kind ?? ""));
    if (!mine.length) continue;
    const touched = new Set<InstallState>();
    const ctxs = new Map<string, UploadContext>();
    for (const parsed of parseRecords(mine).records) {
      if (!parsed.eventId) continue;
      const row = { ...parsed, capturedAt: clampedAt(parsed.capturedAt, upload.receivedAt) } as IntakeRecord;
      if (row.kind in CATALOG_BUCKET) {
        let ctx = ctxs.get(row.installId);
        if (!ctx) {
          const seen = Math.floor(Date.parse(upload.receivedAt ?? row.capturedAt) / 1000);
          ctx = { voter: upload.reporter ? `r:${upload.reporter}` : `i:${row.installId}`, install: row.installId, seen: Number.isFinite(seen) ? seen : 0, added: 0 };
          ctxs.set(row.installId, ctx);
        }
        foldCatalog(state, row, ctx, open);
        continue;
      }
      if (!("characterKey" in row)) continue;
      const install = installOf(state, row.installId, installs);
      if (!install) continue;
      if (!touched.has(install)) {
        touched.add(install);
        // Grants in upload order, the newest kept: an old grant gives way, not a new one.
        install.grants = [...install.grants.filter((g) => !upload.grants.includes(g)), ...upload.grants].slice(-COMPLETION_LIMITS.grantsPerInstall);
      }
      let character = install.characters[row.characterKey];
      if (!character) {
        const keys = Object.keys(install.characters);
        if (keys.length >= COMPLETION_LIMITS.charactersPerInstall) {
          // The character not seen for longest gives way (a deleted one stops being seen).
          const oldest = keys.reduce((x, y) => (install.characters[y].at < install.characters[x].at ? y : x));
          delete install.characters[oldest];
          install.dropped++;
        }
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

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

/**
 * Keep the state under `maxBytes` by trimming instead of failing: past 90% of the limit it drops, until it is
 * under 80%, first contents nobody confirmed (least recently seen first), then the characters of installs
 * without a live grant (`live`; oldest first), then any character, oldest first, then confirmed contents.
 * Returns what was dropped.
 */
export function trimCompletion(state: CompletionState, maxBytes: number, live: ReadonlySet<string> | null): { size: number; variants: number; characters: number } {
  let size = bytes(state);
  const out = { size, variants: 0, characters: 0 };
  if (size <= maxBytes * 0.9) return out;
  const target = maxBytes * 0.8;
  const dropVariants = (pick: (v: Variant) => boolean) => {
    const all: { bucket: Record<string, Variant[]>; id: string; v: Variant }[] = [];
    for (const bucket of Object.values(state.catalog)) for (const [id, vs] of Object.entries(bucket)) for (const v of vs) if (pick(v)) all.push({ bucket, id, v });
    all.sort((x, y) => x.v.s - y.v.s);
    for (const { bucket, id, v } of all) {
      if (size <= target) return;
      const vs = bucket[id];
      if (!vs) continue;
      size -= bytes(v) + 1;
      out.variants++;
      const kept = vs.filter((x) => x !== v);
      if (kept.length) bucket[id] = kept; else { delete bucket[id]; size -= id.length + 4; }
    }
  };
  const dropCharacters = (pick: (installId: string) => boolean) => {
    const all: { installId: string; key: string; at: string }[] = [];
    for (const [installId, install] of Object.entries(state.owned)) {
      if (!pick(installId)) continue;
      for (const [key, c] of Object.entries(install.characters)) all.push({ installId, key, at: c.at });
    }
    all.sort((x, y) => x.at.localeCompare(y.at));
    for (const { installId, key } of all) {
      if (size <= target) return;
      const install = state.owned[installId];
      size -= bytes(install.characters[key]) + key.length + 4;
      delete install.characters[key];
      install.dropped++;
      out.characters++;
    }
  };
  dropVariants((v) => !confirmed(v));
  if (size > target) dropCharacters((installId) => !live?.has(installId));
  if (size > target) dropCharacters(() => true);
  if (size > target) dropVariants(() => true);
  out.size = bytes(state);
  return out;
}

/** Whether a state is the shape this code writes. A stored rollup that is not is unusable, not empty. */
export function isCompletionState(value: unknown): value is CompletionState {
  const s = value as Partial<CompletionState> | null;
  return !!s && s.version === 2 && !!s.catalog && typeof s.catalog === "object" && !!s.owned && typeof s.owned === "object" &&
    (["a", "f", "t", "q"] as const).every((k) => !!s.catalog![k] && typeof s.catalog![k] === "object");
}

type Agreed = Pick<CompletionFacts, "achievements" | "factions" | "titles" | "chains">;
const agreedCache = new WeakMap<CompletionState, Agreed>();

/** One entry per id: of the contents 3 voters back, the most supported, then the most recently seen. */
function agreedOf<T>(bucket: Record<string, Variant[]>, build: (id: number, row: Record<string, unknown>) => T): Map<number, T> {
  const out = new Map<number, T>();
  for (const [id, variants] of Object.entries(bucket)) {
    const best = variants.filter(confirmed).sort((x, y) => y.v.length - x.v.length || y.s - x.s || x.c.localeCompare(y.c))[0];
    if (best) out.set(Number(id), build(Number(id), JSON.parse(best.c) as Record<string, unknown>));
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

/**
 * Installs whose current grant covers owned progress, among `only` when given (a page asks about one install).
 * Authority is read now, never remembered from upload time.
 */
export function authorizedOwners(state: CompletionState, authority: PublicationState, now: Date, only?: string): Set<string> {
  const allowed = new Set<string>();
  const ids = only === undefined ? Object.keys(state.owned) : (state.owned[only] ? [only] : []);
  for (const installId of ids) {
    const probe = { kind: "title_owned", installId, eventId: "probe:1", capturedAt: now.toISOString(), characterKey: "00000000", class: "MAGE", level: 1, titleIds: [1] } as IntakeRecord;
    if (authorizeRecord(probe, state.owned[installId].grants, authority, now)) allowed.add(installId);
  }
  return allowed;
}

/** The facts the page and the MCP tool read: the agreed catalog, and owned progress for installs in `owners` (and `only`). */
export function completionFactsOf(state: CompletionState, owners: ReadonlySet<string> | "all", only?: string): CompletionFacts {
  const owned: OwnedCharacter[] = [];
  const dropped = new Map<string, number>();
  const ids = only === undefined ? Object.keys(state.owned) : (state.owned[only] ? [only] : []);
  for (const installId of ids) {
    if (owners !== "all" && !owners.has(installId)) continue;
    const install = state.owned[installId];
    if (install.dropped > 0) dropped.set(installId, install.dropped);
    for (const [characterKey, c] of Object.entries(install.characters)) {
      owned.push({
        installId, characterKey, class: c.class, level: c.level,
        achievements: new Map(Object.entries(c.a).map(([id, a]) => [Number(id), { completed: a.c, earnedByMe: a.e, criteriaMet: a.m, criteriaTotal: a.t, quantity: a.q, required: a.r }])),
        factions: new Map(Object.entries(c.f).map(([id, f]) => [Number(id), { reaction: f.k, standing: f.s, floor: f.lo, ceiling: f.hi }])),
        titles: new Set(c.t), quests: new Set(c.q),
      });
    }
  }
  return { ...agreedCatalog(state), owned, dropped };
}

/** Facts straight from records, for tests and local tools: every owner is trusted, each install votes alone. */
export function completionFactsFromRecords(records: unknown[]): CompletionFacts {
  return completionFactsOf(foldCompletion(emptyCompletion(), [{ records, grants: [] }]), "all");
}
