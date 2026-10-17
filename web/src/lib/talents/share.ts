import { add, canAdd, nodeMap, rankOf, refusalText } from "./rules";
import type { Ranks, TalentCatalog } from "./types";

// Share code, the same one the addon writes (feat/addon-talents, PR #24):
//
//   EL1-<class>-<spec>-<build>-<payload>
//
//   class    lowercase class token, for example mage
//   spec     the client's spec id, or 0 when unknown
//   build    the game build the code was made on, for example 1.60.1.70450
//   payload  base64url, no padding, of "node:rank,node:rank:choice,..." (node ids in decimal,
//            choice is the zero-based entry)
//
// Split on the first four dashes only: base64url itself contains dashes. The site writes nodes in
// ascending id order; the addon's list is by id too, and any order is read, because every point is
// replayed through the point rules on the way in. In links the code sits in the fragment:
// #plan=EL1-...
//
// Node ids are the game's trait node ids, as our catalog carries them, so a code from the addon
// and a code from the site name the same nodes.

export const SHARE_VERSION = 1;
const PREFIX = `EL${SHARE_VERSION}`;

export interface SharedBuild {
  version: number;
  classSlug: string;
  specId: number;
  build: string;
  ranks: Ranks;
}

export type DecodeError = "empty" | "not-base64url" | "malformed" | "newer-version";

export type Decoded = { ok: true; build: SharedBuild } | { ok: false; error: DecodeError };

const toBase64Url = (text: string) =>
  btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

function fromBase64Url(code: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(code)) return null;
  const padded = code.replaceAll("-", "+").replaceAll("_", "/");
  try {
    return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  } catch {
    return null;
  }
}

export function encodeBuild(shared: Omit<SharedBuild, "version">): string {
  const list = Object.entries(shared.ranks)
    .filter(([, r]) => r.rank > 0)
    .map(([id, r]) => ({ id: Number(id), r }))
    .sort((a, b) => a.id - b.id)
    .map(({ id, r }) => `${id}:${r.rank}${r.choice === undefined ? "" : `:${r.choice}`}`)
    .join(",");
  return [PREFIX, shared.classSlug, shared.specId, shared.build, toBase64Url(list)].join("-");
}

export function decodeBuild(code: string): Decoded {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  const parts = trimmed.split("-");
  if (parts.length < 5) return { ok: false, error: /^[A-Za-z0-9_-]+$/.test(trimmed) ? "malformed" : "not-base64url" };
  const [prefix, classSlug, spec, build] = parts;
  const payload = parts.slice(4).join("-");
  const versionMatch = /^EL(\d+)$/.exec(prefix);
  if (!versionMatch) return { ok: false, error: "malformed" };
  const version = Number(versionMatch[1]);
  // A newer code may add fields we cannot read; say so rather than guess.
  if (version > SHARE_VERSION) return { ok: false, error: "newer-version" };
  if (version < 1 || !/^[a-z]+$/.test(classSlug) || !/^\d+$/.test(spec) || !/^\d+(?:\.\d+)*$/.test(build)) return { ok: false, error: "malformed" };
  const text = fromBase64Url(payload);
  if (text === null) return { ok: false, error: "not-base64url" };
  const ranks: Ranks = {};
  if (text) {
    for (const item of text.split(",")) {
      const m = /^(\d+):(\d+)(?::(\d+))?$/.exec(item);
      if (!m) return { ok: false, error: "malformed" };
      const id = Number(m[1]);
      const rank = Number(m[2]);
      if (rank < 1 || id in ranks) return { ok: false, error: "malformed" };
      ranks[id] = m[3] === undefined ? { rank } : { rank, choice: Number(m[3]) };
    }
  }
  return { ok: true, build: { version, classSlug, specId: Number(spec), build, ranks } };
}

export interface ResolvedBuild {
  ranks: Ranks;
  /** Node ids in the code that this tree does not have. */
  unknown: { id: number; rank: number }[];
  /** Nodes whose rank or choice was cut back to what the tree allows. */
  clamped: { id: number; name: string; what: "rank" | "choice"; asked: number; got: number }[];
  /** Nodes the current rules would not let the build keep, with the reason. */
  rejected: { id: number; name: string; rank: number; why: string }[];
  /** True when the code was made on a different game build than the tree on screen. */
  buildDiffers: boolean;
}

export type Resolution = { ok: true; build: ResolvedBuild } | { ok: false; error: "other-class" };

/** Put a decoded build onto the tree on screen. Nothing is dropped silently: whatever cannot be
 *  placed comes back in `unknown`, `clamped` or `rejected`. */
export function resolveBuild(catalog: TalentCatalog, shared: SharedBuild): Resolution {
  if (shared.classSlug !== catalog.classSlug) return { ok: false, error: "other-class" };
  const nodes = nodeMap(catalog);
  const unknown: ResolvedBuild["unknown"] = [];
  const clamped: ResolvedBuild["clamped"] = [];
  const wanted: { id: number; rank: number; choice?: number }[] = [];

  for (const [key, r] of Object.entries(shared.ranks)) {
    const id = Number(key);
    const node = nodes.get(id);
    if (!node) {
      unknown.push({ id, rank: r.rank });
      continue;
    }
    const name = node.entries[0]?.name ?? String(id);
    const rank = Math.min(r.rank, node.maxRanks);
    if (rank < r.rank) clamped.push({ id, name, what: "rank", asked: r.rank, got: rank });
    let choice: number | undefined;
    if (node.kind === "choice") {
      choice = r.choice !== undefined && r.choice < node.entries.length ? r.choice : 0;
      if (choice !== r.choice) clamped.push({ id, name, what: "choice", asked: r.choice ?? -1, got: choice });
    }
    wanted.push({ id, rank, choice });
  }

  // Replay in reading order, then repeat while anything still places: a prerequisite can sit later
  // in the order than the node that needs it.
  const order = new Map(catalog.nodes.map((n, i) => [n.id, i]));
  wanted.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  let ranks: Ranks = {};
  let remaining = wanted.map((w) => ({ ...w }));
  let progress = true;
  while (progress && remaining.length > 0) {
    progress = false;
    for (const w of remaining) {
      while (rankOf(ranks, w.id) < w.rank) {
        const next = add(catalog, ranks, w.id, Infinity, w.choice ?? 0);
        if (next === ranks) break;
        ranks = next;
        progress = true;
      }
    }
    remaining = remaining.filter((w) => rankOf(ranks, w.id) < w.rank);
  }

  const rejected: ResolvedBuild["rejected"] = remaining.map((w) => {
    const node = nodes.get(w.id)!;
    return { id: w.id, name: node.entries[0]?.name ?? String(w.id), rank: w.rank - rankOf(ranks, w.id), why: whyRefused(catalog, ranks, w.id) };
  });

  return { ok: true, build: { ranks, unknown, clamped, rejected, buildDiffers: shared.build !== catalog.build } };
}

function whyRefused(catalog: TalentCatalog, ranks: Ranks, id: number): string {
  const node = nodeMap(catalog).get(id)!;
  return refusalText(canAdd(catalog, ranks, id, Infinity).reason ?? "gate", node, catalog);
}
