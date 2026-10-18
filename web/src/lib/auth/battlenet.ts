import type { GenericOAuthConfig } from "better-auth/plugins";

const PLACEHOLDER_DOMAIN = "@users.everloot.invalid";

// Battle.net never gives us an email, but accounts need one. The `.invalid` TLD
// is reserved (RFC 2606), so this can never reach a real inbox.
export function placeholderEmail(accountId: string): string {
  return `bnet-${accountId}${PLACEHOLDER_DOMAIN}`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith(PLACEHOLDER_DOMAIN);
}

export function battlenetUser(profile: { sub?: string; id?: number; battletag?: string }) {
  const id = profile.sub || (Number.isSafeInteger(profile.id) ? String(profile.id) : "");
  if (!/^\d+$/.test(id) || !profile.battletag) return null;
  return { id, name: profile.battletag, email: placeholderEmail(id), emailVerified: false as const };
}

export function battlenetProvider(env: { BNET_CLIENT_ID?: string; BNET_CLIENT_SECRET?: string }): GenericOAuthConfig {
  return {
    providerId: "battlenet",
    discoveryUrl: "https://oauth.battle.net/.well-known/openid-configuration",
    clientId: env.BNET_CLIENT_ID?.trim() ?? "",
    clientSecret: env.BNET_CLIENT_SECRET?.trim(),
    scopes: ["openid", "wow.profile"],
    pkce: true,
    async getUserInfo(tokens) {
      const res = await fetch("https://oauth.battle.net/userinfo", {
        cache: "no-store", signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (!res.ok) return null;
      return battlenetUser(await res.json() as { sub?: string; id?: number; battletag?: string });
    },
  };
}
