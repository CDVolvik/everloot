import { createHmac } from "node:crypto";
import { betterAuth, type DBAdapterInstance } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";
import type { Pool } from "pg";
import { siteUrl } from "@/lib/supabase/server";
import { battlenetProvider } from "./battlenet";
import { authPool, pgRateLimitStore, type RateLimitStore } from "./db";

export function authV2Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.EVERLOOT_AUTH_V2 === "1";
}

const noProviderTokens = { accessToken: null, refreshToken: null, idToken: null };

export function createAuth(options: {
  database: Pool | DBAdapterInstance;
  rateLimitStore: RateLimitStore;
  env?: NodeJS.ProcessEnv;
}) {
  const env = options.env ?? process.env;
  const { rateLimitStore } = options;
  const { BNET_CLIENT_ID, BNET_CLIENT_SECRET } = env;
  const battlenetConfigured = Boolean(BNET_CLIENT_ID?.trim() && BNET_CLIENT_SECRET?.trim());
  // Better Auth would also start on AUTH_SECRET, which would leave the limiter's HMAC with an empty key.
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  // Keyed, so the stored digests cannot be matched by hashing every address.
  const rateLimitKey = (key: string) => createHmac("sha256", secret).update(key).digest("hex");
  return betterAuth({
    database: options.database,
    secret,
    baseURL: env.BETTER_AUTH_URL?.trim() || siteUrl(),
    basePath: "/api/auth",
    trustedOrigins: [siteUrl()],
    user: {
      modelName: "users",
      fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
    },
    session: {
      modelName: "auth_session",
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      fields: {
        userId: "user_id", expiresAt: "expires_at", ipAddress: "ip_address", userAgent: "user_agent",
        createdAt: "created_at", updatedAt: "updated_at",
      },
    },
    account: {
      modelName: "auth_account",
      fields: {
        userId: "user_id", accountId: "account_id", providerId: "provider_id",
        accessToken: "access_token", refreshToken: "refresh_token", idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at", refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at", updatedAt: "updated_at",
      },
      // Battle.net sign-ins are matched by their auth_account row, which the migration's backfill and
      // trigger give every Battle.net user. Linking by email stays off while the email is unverified.
      accountLinking: { enabled: true },
      // The OAuth state lives in a signed cookie: a sign-in start writes no database row.
      storeStateStrategy: "cookie",
    },
    verification: {
      modelName: "auth_verification",
      fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
    },
    advanced: {
      cookiePrefix: "everloot",
      useSecureCookies: env.NODE_ENV === "production",
      database: { generateId: "uuid" },
      // Vercel sets x-vercel-forwarded-for to the one client address; x-forwarded-for is a fallback
      // (Better Auth ignores it when it holds a chain).
      ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"] },
    },
    rateLimit: {
      enabled: true,
      // The key is "<address>|<path>"; only its HMAC reaches storage.
      customStorage: { consume: (key, rule) => rateLimitStore.consume(rateLimitKey(key), rule) },
    },
    databaseHooks: {
      account: {
        create: {
          // bnet_id and battletag are filled by the auth_account trigger, in the same transaction.
          before: async (account) => ({ data: { ...account, ...noProviderTokens } }),
        },
        update: {
          before: async (account) => ({ data: { ...account, ...noProviderTokens } }),
        },
      },
      session: {
        create: {
          before: async (session) => ({ data: { ...session, ipAddress: null, userAgent: null } }),
        },
      },
    },
    plugins: [
      genericOAuth({ config: battlenetConfigured ? [battlenetProvider({ BNET_CLIENT_ID, BNET_CLIENT_SECRET })] : [] }),
      // Must stay last: it copies the cookies of direct getSession calls (the daily refresh) onto the response.
      nextCookies(),
    ],
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

// Built on first use, never at import: the Next build imports route modules.
export function getAuth() {
  auth ??= createAuth({ database: authPool(), rateLimitStore: pgRateLimitStore(authPool()) });
  return auth;
}
