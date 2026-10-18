import { Pool } from "pg";
import { supabaseCa } from "./supabase-ca";

// Better Auth 1.7 asks a custom store for one atomic check-and-count per request.
export type RateLimitStore = {
  consume(key: string, rule: { window: number; max: number }): Promise<{ allowed: boolean; retryAfter: number | null }>;
};

let pool: Pool | undefined;

// Created on first use, never at import: the Next build imports route modules.
export function authPool(): Pool {
  if (pool) return pool;
  const url = process.env.AUTH_DATABASE_URL?.trim();
  if (!url) throw new Error("Authentication storage is not configured");
  const { hostname } = new URL(url);
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  pool = new Pool({ connectionString: url, max: 3, ssl: local ? undefined : { ca: supabaseCa } });
  return pool;
}

// One statement, so concurrent requests cannot both pass a stale read. `last_request` holds the
// start of the current window in ms: an expired window restarts at 1, otherwise the count grows.
export function pgRateLimitStore(pool: Pool): RateLimitStore {
  return {
    async consume(key, { window, max }) {
      const now = Date.now();
      const windowMs = window * 1000;
      const { rows } = await pool.query<{ count: number; last_request: string }>(
        `insert into public.auth_rate_limit as r (key, count, last_request) values ($1, 1, $2::bigint)
         on conflict (key) do update set
           count = case when r.last_request <= $2::bigint - $3::bigint then 1 else r.count + 1 end,
           last_request = case when r.last_request <= $2::bigint - $3::bigint then $2::bigint else r.last_request end
         returning count, last_request`,
        [key, now, windowMs],
      );
      const { count, last_request } = rows[0];
      if (count <= max) return { allowed: true, retryAfter: null };
      return { allowed: false, retryAfter: Math.ceil((Number(last_request) + windowMs - now) / 1000) };
    },
  };
}
