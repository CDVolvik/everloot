import { isPlaceholderEmail } from "./battlenet";

type Env = Record<string, string | undefined>;

// Email sign-up is only offered when we can actually send the verification mail.
export function emailConfigured(env: Env = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}

/** Sends one plain-text mail through Resend. Throws when Resend refuses it, so the caller's request fails. */
export async function sendEmail(env: Env, message: { to: string; subject: string; text: string }): Promise<void> {
  // A Battle.net placeholder address has no inbox behind it.
  if (isPlaceholderEmail(message.to)) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY?.trim()}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM?.trim(), to: [message.to], subject: message.subject, text: message.text }),
  });
  if (!res.ok) throw new Error(`Resend refused the email (${res.status})`);
}

export function verificationText(url: string): string {
  return `Welcome to Everloot.\n\nConfirm your email to finish making your account:\n${url}\n\nThe link works for one hour. If you did not sign up, ignore this email.\n`;
}

export function resetText(url: string): string {
  return `Someone asked to reset the password on your Everloot account.\n\nChoose a new password here:\n${url}\n\nThe link works for one hour. If it was not you, ignore this email; your password stays the same.\n`;
}
