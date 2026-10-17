import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export interface QuotaResult { allowed: boolean; retryAfter: number }

/** Production admission is atomic in Postgres; the local adapter is only for development. */
export function createIntakeQuota(opts: {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => number;
} = {}) {
  const env = opts.env ?? process.env;
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const local = new Map<string, { count: number; resetAt: number }>();
  const url = env.SUPABASE_URL?.trim();
  const secret = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const production = env.NODE_ENV === "production";

  async function consume(scope: "request" | "install" | "mcp", value: string): Promise<QuotaResult> {
    if (url && secret) {
      const key = createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex");
      const response = await doFetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/consume_intake_quota`, {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
        headers: { apikey: secret, authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ p_scope: scope, p_key: key }),
      });
      if (!response.ok) throw new Error("Quota storage unavailable");
      const rows = await response.json();
      const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (!row || typeof row.allowed !== "boolean" || !Number.isInteger(row.retry_after) || row.retry_after < 0 || row.retry_after > 3600 ||
        (!row.allowed && row.retry_after === 0)) throw new Error("Invalid quota response");
      return { allowed: row.allowed, retryAfter: row.retry_after };
    }
    if (production || url || secret) throw new Error("Quota storage is not configured");
    const time = now();
    // Expired development identities must not accumulate for the lifetime of the process.
    for (const [key, bucket] of local) if (bucket.resetAt <= time) local.delete(key);
    const limits: [string, number][] = scope === "request" ? [["global", 10000], [`ip:${value}`, 200]]
      : scope === "mcp" ? [["mcp_global", 5000], [`mcp:${value}`, 200]]
      : [[`install:${value}`, 20]];
    const retryAfter = Math.max(0, ...limits.map(([key, limit]) => {
      const bucket = local.get(key);
      return bucket && bucket.count >= limit ? Math.ceil((bucket.resetAt - time) / 1000) : 0;
    }));
    if (retryAfter) return { allowed: false, retryAfter };
    for (const [key] of limits) {
      const bucket = local.get(key) ?? { count: 0, resetAt: time + 3_600_000 };
      bucket.count++;
      local.set(key, bucket);
    }
    return { allowed: true, retryAfter: 0 };
  }

  function clientIp(req: Request): string {
    if (!production && env.VERCEL !== "1") return "local";
    if (env.VERCEL !== "1") throw new Error("Trusted client IP is unavailable");
    const ip = req.headers.get("x-vercel-forwarded-for")?.trim() ?? "";
    if (!isIP(ip)) throw new Error("Trusted client IP is unavailable");
    // Normalize equivalent IPv6 spellings before hashing.
    return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
  }

  return {
    async request(req: Request) {
      return consume("request", clientIp(req));
    },
    /**
     * Public MCP: its own per-IP bucket, so AI clients cannot use up a player's upload allowance.
     * With EVERLOOT_MCP_QUOTA_SCOPE=mcp (set only after 20261010120000_mcp_quota_scope.sql is
     * applied) it also gets its own hourly global bucket; before that, the "mcp:" prefix changes
     * the hashed key and the global bucket is shared with intake.
     */
    async mcp(req: Request) {
      if (env.EVERLOOT_MCP_QUOTA_SCOPE === "mcp") return consume("mcp", clientIp(req));
      return consume("request", `mcp:${clientIp(req)}`);
    },
    /**
     * Market prices: its own per-IP bucket, on the same scope rules as the public MCP, so a price
     * poller cannot use up an upload allowance. The CDN answers repeats; this counts the misses.
     */
    async market(req: Request) {
      if (env.EVERLOOT_MCP_QUOTA_SCOPE === "mcp") return consume("mcp", `market:${clientIp(req)}`);
      return consume("request", `market:${clientIp(req)}`);
    },
    /**
     * A keyed hash of the upload address, for the market's one-voice-per-address rule. The address
     * itself is never stored; the hash lives only in the private upload object and is never published.
     * Undefined when no trusted address is available.
     */
    reporter(req: Request): string | undefined {
      try {
        return createHmac("sha256", secret || "everloot-dev-reporter").update(`reporter:${clientIp(req)}`).digest("hex").slice(0, 16);
      } catch {
        return undefined;
      }
    },
    install(installId: string) { return consume("install", installId); },
    async prune() {
      if (!url || !secret) {
        if (production) throw new Error("Quota storage is not configured");
        return;
      }
      const cutoff = new Date(now() - 86_400_000).toISOString();
      const response = await doFetch(`${url.replace(/\/$/, "")}/rest/v1/intake_quota_buckets?reset_at=lt.${encodeURIComponent(cutoff)}`, {
        method: "DELETE", cache: "no-store", signal: AbortSignal.timeout(5000),
        headers: { apikey: secret, authorization: `Bearer ${secret}` },
      });
      if (!response.ok) throw new Error("Quota cleanup failed");
    },
  };
}

export const intakeQuota = createIntakeQuota();
