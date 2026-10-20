import { DEFAULT_RULESET, realmSlug, type Player, type PlayerUpsert } from "./player-pages";

/**
 * Where the player rows live: Supabase in production (the functions in 20261021130000_players.sql), and a map in
 * memory in development, which behaves the same way and forgets everything on restart. Every call is one
 * request, and a write is one batched call per upload, never one per row.
 */

export interface PlayerStore {
  /** Write a batch; a suppressed character is skipped and an older report never replaces a newer row. */
  upsert(rows: PlayerUpsert[]): Promise<void>;
  get(ruleset: string, realm: string, name: string): Promise<Player | null>;
  /** Names starting with `prefix` (2 or more letters), at most 25, in name order. */
  search(prefix: string): Promise<Player[]>;
  /** Hide a character: record the opt-out and delete its row. */
  suppress(realm: string, name: string): Promise<void>;
  prune(): Promise<void>;
}

const SEARCH_LIMIT = 25;
export const PLAYER_KEPT_DAYS = 90;

interface Stored { name: string; realm: string; ruleset?: string; race: string; class: string; level: number; guild: string | null; last_seen: string }

const toPlayer = (row: Stored, ruleset: string): Player => ({
  name: row.name, realm: row.realm, ruleset: row.ruleset ?? ruleset, race: row.race, class: row.class, level: row.level, guild: row.guild, lastSeen: row.last_seen,
});

export function createCloudPlayerStore(url: string, key: string, doFetch: typeof fetch = fetch): PlayerStore {
  async function rpc<T>(fn: string, body: unknown): Promise<T> {
    const response = await doFetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Player storage unavailable (${response.status})`);
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }
  return {
    async upsert(rows) {
      if (rows.length) await rpc("upsert_players", { p_ruleset: DEFAULT_RULESET, p_rows: rows });
    },
    async get(ruleset, realm, name) {
      const rows = await rpc<Stored[]>("get_player", { p_ruleset: ruleset, p_realm_slug: realm, p_name: name });
      return Array.isArray(rows) && rows[0] ? toPlayer(rows[0], ruleset) : null;
    },
    async search(prefix) {
      const rows = await rpc<Stored[]>("search_players", { p_prefix: prefix, p_limit: SEARCH_LIMIT });
      return Array.isArray(rows) ? rows.map((row) => toPlayer(row, DEFAULT_RULESET)) : [];
    },
    async suppress(realm, name) { await rpc("suppress_player", { p_realm: realm, p_name: name }); },
    async prune() { await rpc("prune_players", {}); },
  };
}

/** The same rules as the SQL, for development without a database. */
export function createMemoryPlayerStore(now: () => Date = () => new Date()): PlayerStore {
  const rows = new Map<string, Player>();
  const hidden = new Set<string>();
  const key = (realm: string, name: string) => `${realm.trim().toLowerCase()}\u0000${name.toLowerCase()}`;
  const visible = (p: Player) => !hidden.has(key(p.realm, p.name));
  return {
    async upsert(batch) {
      for (const r of batch) {
        const k = key(r.realm, r.name);
        const old = rows.get(k);
        if (hidden.has(k) || (old && old.lastSeen > r.seen)) continue;
        rows.set(k, { name: r.name, realm: r.realm, ruleset: DEFAULT_RULESET, race: r.race, class: r.class, level: r.level, guild: r.guild ?? old?.guild ?? null, lastSeen: r.seen });
      }
    },
    async get(ruleset, realm, name) {
      return [...rows.values()].find((p) => p.ruleset === ruleset && realmSlug(p.realm) === realm.toLowerCase() && p.name.toLowerCase() === name.toLowerCase() && visible(p)) ?? null;
    },
    async search(prefix) {
      const p = prefix.toLowerCase();
      return [...rows.values()].filter((r) => r.name.toLowerCase().startsWith(p) && visible(r))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.realm.localeCompare(b.realm)).slice(0, SEARCH_LIMIT);
    },
    async suppress(realm, name) { hidden.add(key(realm, name)); rows.delete(key(realm, name)); },
    async prune() {
      const cutoff = new Date(now().getTime() - PLAYER_KEPT_DAYS * 86_400_000).toISOString().slice(0, 10);
      for (const [k, p] of rows) if (p.lastSeen < cutoff) rows.delete(k);
    },
  };
}

/** The store this deployment uses: Supabase when its variables are set, memory in development, nothing in production without them. */
export function playerStoreFrom(env: Record<string, string | undefined> = process.env, doFetch?: typeof fetch): PlayerStore {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key) return createCloudPlayerStore(url, key, doFetch);
  if (env.NODE_ENV === "production") throw new Error("Player storage is not configured");
  return createMemoryPlayerStore();
}

const held = globalThis as typeof globalThis & { __everlootPlayers?: PlayerStore };
/** One store per server process, so the development store keeps its rows between requests, whichever route bundle asks. */
export function playerStore(): PlayerStore {
  return (held.__everlootPlayers ??= playerStoreFrom());
}
