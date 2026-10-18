import { createHash } from "node:crypto";
import { betterAuth, type DBAdapterInstance } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import type { Pool } from "pg";
import { siteUrl } from "@/lib/supabase/server";
import { battlenetProvider } from "./battlenet";
import { authPool, pgRateLimitStore, type RateLimitStore } from "./db";

export function authV2Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.EVERLOOT_AUTH_V2 === "1";
}

const noProviderTokens = { accessToken: null, refreshToken: null, idToken: null };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function createAuth(options: {
  database: Pool | DBAdapterInstance;
  rateLimitStore: RateLimitStore;
  env?: NodeJS.ProcessEnv;
  onBattlenetAccount?: (userId: string, accountId: string, name: string) => Promise<void>;
}) {
  const env = options.env ?? process.env;
  const { onBattlenetAccount, rateLimitStore } = options;
  const { BNET_CLIENT_ID, BNET_CLIENT_SECRET } = env;
  const battlenetConfigured = Boolean(BNET_CLIENT_ID?.trim() && BNET_CLIENT_SECRET?.trim());
  return betterAuth({
    database: options.database,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL ?? siteUrl(),
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
      // Battle.net users all carry its own placeholder address, so trusting it can only link to itself.
      accountLinking: { enabled: true, trustedProviders: ["battlenet"] },
    },
    verification: {
      modelName: "auth_verification",
      fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
    },
    advanced: {
      cookiePrefix: "everloot",
      useSecureCookies: env.NODE_ENV === "production",
      database: { generateId: "uuid" },
    },
    rateLimit: {
      enabled: true,
      // The key is "<address>|<path>"; only its digest reaches storage.
      customStorage: { consume: (key, rule) => rateLimitStore.consume(sha256(key), rule) },
    },
    databaseHooks: {
      account: {
        create: {
          before: async (account) => ({ data: { ...account, ...noProviderTokens } }),
          after: async (account, ctx) => {
            if (account.providerId !== "battlenet" || !onBattlenetAccount) return;
            const user = await ctx?.context.internalAdapter.findUserById(account.userId);
            if (user) await onBattlenetAccount(account.userId, account.accountId, user.name);
          },
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
    plugins: [genericOAuth({ config: battlenetConfigured ? [battlenetProvider({ BNET_CLIENT_ID, BNET_CLIENT_SECRET })] : [] })],
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

// Built on first use, never at import: the Next build imports route modules.
export function getAuth() {
  auth ??= createAuth({
    database: authPool(),
    rateLimitStore: pgRateLimitStore(authPool()),
    onBattlenetAccount: async (userId, accountId, name) => {
      await authPool().query("update public.users set bnet_id = $2, battletag = $3 where id = $1", [userId, accountId, name]);
    },
  });
  return auth;
}
