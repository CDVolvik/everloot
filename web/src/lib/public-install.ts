import { createHmac } from "node:crypto";
import { characterSecret, CHARACTER_KEY_MIN } from "./census-intake";

/**
 * A published record carries a per-install pseudonym in place of the addon's install id, so anyone can count
 * installs in the public feed and the bulk export without learning the id itself. The pseudonym is an HMAC under
 * EVERLOOT_PUBLIC_INSTALL_KEY, else EVERLOOT_CHARACTER_KEY; the `public-install:` prefix keeps it apart from the
 * census and link keys made with the same secret. With neither key set the install id is dropped, as before.
 */

let warned = false;

/** The secret the pseudonym is keyed with, or null when neither key is set (or either is under 32 characters). */
export function publicInstallSecret(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.EVERLOOT_PUBLIC_INSTALL_KEY?.trim() ?? "";
  if (key) return key.length >= CHARACTER_KEY_MIN ? key : null;
  return characterSecret(env);
}

/** `pub-` and 32 hex: stable for one install, different across installs, and never the addon's id. */
export function publicInstallId(installId: string, secret: string): string {
  return `pub-${createHmac("sha256", secret).update(`public-install:${installId}`).digest("hex").slice(0, 32)}`;
}

/** What leaves the site: the same record with the pseudonym in place of the install id, or without it when no key is set. */
export function published<T extends { installId?: unknown }>(record: T, secret = publicInstallSecret()): T {
  const copy = { ...record } as Record<string, unknown>;
  if (secret && typeof copy.installId === "string") {
    copy.installId = publicInstallId(copy.installId, secret);
  } else {
    delete copy.installId;
    if (!secret && !warned) {
      warned = true;
      console.warn("public-install: no EVERLOOT_PUBLIC_INSTALL_KEY or EVERLOOT_CHARACTER_KEY, so published records carry no install pseudonym.");
    }
  }
  return copy as T;
}
