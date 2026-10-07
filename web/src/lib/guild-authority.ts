/**
 * Guild authority & sharing control.
 * - Server-issued claim tokens (opaque, validated against DB)
 * - Revocation list for tokens/guilds/characters
 * - Per-character opt-out (suppression from public facts)
 * - Officer verification flow (not implemented here — this is the validation layer)
 */

import { z } from "zod";

/** Claim token format: evt_<base64url> — opaque, server-validated. */
export const CLAIM_TOKEN_PREFIX = "evt_";
export const claimTokenSchema = z.string().min(32).max(128).regex(/^evt_[a-zA-Z0-9_-]+$/);

export type ClaimToken = z.infer<typeof claimTokenSchema>;

/** Guild realm-scoped identity. */
export interface GuildIdentity {
  guildName: string;
  realm: string;
}

/** Decoded claim (server-side only — addon never sees this). */
export interface DecodedClaim {
  token: string;
  guildIdentity: GuildIdentity;
  officerCharacter: string;    // character that verified
  issuedAt: string;            // ISO timestamp
  expiresAt?: string;          // optional expiry
  scopes: string[];            // e.g. ["roster", "attendance", "loot", "gear"]
  revoked: boolean;
}

/** In-memory revocation cache (populated from Supabase on startup). */
const revokedTokens = new Set<string>();
const revokedGuilds = new Set<string>();      // "guildName|realm"
const suppressedCharacters = new Set<string>(); // "character|realm"
const optOutCharacters = new Set<string>();    // "character|realm" — player choice

/** Check if a claim token is valid and not revoked. */
export function validateClaimToken(token: string, expectedGuild: GuildIdentity): { valid: boolean; reason?: string } {
  if (!claimTokenSchema.safeParse(token).success) {
    return { valid: false, reason: "invalid token format" };
  }
  if (revokedTokens.has(token)) {
    return { valid: false, reason: "token revoked" };
  }
  const guildKey = `${expectedGuild.guildName}|${expectedGuild.realm}`;
  if (revokedGuilds.has(guildKey)) {
    return { valid: false, reason: "guild authority revoked" };
  }
  // Server-side: decode token and check guild match + expiry + scopes
  // This is a placeholder — real impl decodes JWT or looks up in Supabase
  return { valid: true };
}

/** Check if a character is opted out or suppressed. */
export function isCharacterPublic(character: string, realm: string): boolean {
  const key = `${character}|${realm}`;
  if (suppressedCharacters.has(key)) return false;
  if (optOutCharacters.has(key)) return false;
  return true;
}

/** Suppress a character from all public facts (admin action). */
export function suppressCharacter(character: string, realm: string): void {
  suppressedCharacters.add(`${character}|${realm}`);
}

/** Restore a previously suppressed character. */
export function unsuppressCharacter(character: string, realm: string): void {
  suppressedCharacters.delete(`${character}|${realm}`);
}

/** Player opts out of public listing (GDPR-style). */
export function optOutCharacter(character: string, realm: string): void {
  optOutCharacters.add(`${character}|${realm}`);
}

/** Player opts back in. */
export function optInCharacter(character: string, realm: string): void {
  optOutCharacters.delete(`${character}|${realm}`);
}

/** Revoke a specific claim token. */
export function revokeToken(token: string): void {
  revokedTokens.add(token);
}

/** Revoke all tokens for a guild (e.g., officer left, guild disbanded). */
export function revokeGuild(guildName: string, realm: string): void {
  revokedGuilds.add(`${guildName}|${realm}`);
}

/** Load revocation state from Supabase (called on server startup). */
export async function loadRevocationState(supabaseUrl: string, serviceKey: string): Promise<void> {
  // TODO: Fetch revoked_tokens, revoked_guilds, suppressed_characters, opt_out_characters
  // from Supabase and populate the in-memory sets.
}

/** Quota tracking per install (in-memory, reset on deploy). */
const installQuotas = new Map<string, { count: number; resetAt: number }>();

/** Check and consume quota for an install. Returns { allowed: boolean; remaining: number; resetAt: number }. */
export function checkQuota(installId: string, maxPerWindow: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = installQuotas.get(installId);
  if (!existing || now > existing.resetAt) {
    installQuotas.set(installId, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxPerWindow - 1, resetAt: now + windowMs };
  }
  if (existing.count >= maxPerWindow) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count++;
  return { allowed: true, remaining: maxPerWindow - existing.count, resetAt: existing.resetAt };
}

/** Shared abuse limits (per IP, per install, global). */
export interface AbuseConfig {
  perInstallPerHour: number;
  perIpPerHour: number;
  globalPerHour: number;
  bytesPerRequest: number;
}

export const DEFAULT_ABUSE_CONFIG: AbuseConfig = {
  perInstallPerHour: 50,
  perIpPerHour: 200,
  globalPerHour: 10000,
  bytesPerRequest: 512 * 1024, // 512 KB
};