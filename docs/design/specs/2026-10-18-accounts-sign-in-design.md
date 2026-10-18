# Accounts and sign-in: one account, many ways in

Date: 2026-10-18. Status: draft for Carlos's review. Owner decisions, all 2026-10-18:

- Sign-in with Battle.net, GitHub, Google, Microsoft, email and password, **and** email code or magic link
  ("people don't like the magic link sometimes, so we need to be prepared").
- Built on **Better Auth**, the open-source (MIT) library, inside our own code and our own Postgres. Not
  Supabase Auth, and no longer the hand-written flow.
- The design below was approved in chat ("Yes, write the spec").

This supersedes the "Accounts" sign-in bullets in
[`2026-10-18-platform-expansion-design.md`](2026-10-18-platform-expansion-design.md) part 7 (Battle.net
and GitHub only, no email). The rest of part 7 still stands: an account never unlocks data or a tool,
it adds convenience; there is a neutral `flags` column; and open MCP and API stay open.

## 1. What exists

- **Battle.net only.** The flow is hand-written: `web/src/app/api/auth/bnet/route.ts` and
  `bnet/callback/route.ts`. It uses a state cookie (no PKCE), scope `openid wow.profile`, and uses the
  provider token once without storing it.
- **Sessions:** `web/src/lib/supabase/server.ts`. The cookie is `everloot_session`, httpOnly, lax and 30
  days. Only the SHA-256 of the token is stored, in `sessions.token_hash`. Helpers are `getUser()` and
  `requireAuth()`, and `revokeSession()` deletes one row.
- **Users:** `supabase/auth_schema.sql`, applied by hand and not a migration. It holds `users(id uuid,
  bnet_id unique, battletag)`. `api_keys.user_id` (data guard migration), `entitlements`, `characters`,
  `profiles` and the `keys_made:<user_id>` and `user:<user_id>` quota buckets reference `users.id`.
- **UI:** `AccountControls` in the header. The only signed-in feature is API keys on `/connect`.

## 2. The model

- **One account per person.** Today's `users` rows stay as the accounts table, keeping their `id`, so
  every API key, entitlement and quota bucket keeps pointing at the same person. Better Auth maps its
  `user` model onto this table. We add `email` (nullable, unique when set), `email_verified`, `name`,
  `image`, `created_at`, `updated_at` and `flags jsonb not null default '{}'`. `bnet_id` and `battletag`
  are kept for one release, then dropped once every row has a Battle.net identity.
- **Linked logins.** Better Auth's `account` table holds one row per provider identity: `provider_id`
  (`battlenet`, `github`, `google`, `microsoft`, `credential` for passwords) and `account_id` (the
  provider's user id). The password hash lives on the `credential` row. Provider tokens are not kept
  after sign-in unless a feature needs them; none does today.
- **Sessions.** Better Auth's `session` table replaces ours: a random token, stored server-side, in an
  httpOnly, secure, lax cookie, with a 30-day expiry and rolling refresh. "Sign out everywhere" deletes
  every row for the account. The old `sessions` table is dropped after cutover, which means everyone
  signs in once more.
- **Verification tokens** for email codes, magic links, email verification and password reset go in
  Better Auth's `verification` table. They are single-use and expire in 15 minutes for codes and links,
  1 hour for resets.
- **Migrations:** one forward migration in `supabase/migrations/` creates the new tables and columns
  and copies every existing `users.bnet_id` into an `account` row (`provider_id = 'battlenet'`). The
  hand-run `auth_schema.sql` is folded into migrations so the schema is reproducible.

## 3. Ways to sign in

| Way | How | Notes |
|---|---|---|
| Battle.net | Generic OAuth plugin, OIDC discovery at `oauth.battle.net` | Existing client id; adds PKCE and nonce. Gives no email |
| GitHub | Built-in provider | OAuth app under the Everloot org. Email only if verified on GitHub |
| Google | Built-in provider | Google Cloud OAuth client; verified email |
| Microsoft | Built-in provider, `common` tenant (personal and work accounts) | Microsoft Entra app registration |
| Email and password | Built-in | Verification required before the password works. 10+ characters. Passwords found in known breaches are refused (`haveIBeenPwned` plugin, k-anonymity range query). Reset by email link |
| Email code or magic link | `emailOTP` and `magicLink` plugins | A 6-digit code **and** a link in the same email, so a user can type the code if the link opens in the wrong browser |

## 4. Linking: the security rule

- **Automatic linking happens only when both sides have a provider-verified email and the emails
  match.** Trusted for this: Google, Microsoft, GitHub (verified email only), and our own email
  verification. Example: a user signed up with Google `you@x.com` later signs in with Microsoft
  `you@x.com` and lands in the same account.
- **Everything else is linked by hand from `/account` while signed in.** That includes every Battle.net
  login, since Battle.net gives no email, and any provider whose email isn't verified. This blocks
  pre-hijacking, where an attacker registers your email first, on a provider that doesn't verify it,
  and waits.
- **Unlinking** is allowed while at least one login remains.
- **A new sign-in with no match creates a new account.** Two accounts can be merged later only by
  linking from a signed-in session, never by email alone.

## 5. `/account`

Linked logins (add or remove), set or change password, email (change with re-verification), API keys
(moved here from `/connect`, which links to it), active sessions with "sign out everywhere", and delete
account. Deleting removes the account, its logins, sessions, API keys and entitlements; uploads stay
anonymous as they always were.

## 6. Email sending

- **Amazon SES in R21's AWS account** (us-east-1, already used by the R21 info forwarders), from
  `no-reply@everloot.app`, with reply-to `hello@everloot.app`.
- **DNS in Cloudflare:** a domain identity for everloot.app (DKIM CNAMEs), a custom MAIL FROM, an SPF
  include and DMARC `p=quarantine` after a week at `p=none`.
- **To verify before email sign-in goes live:** whether the SES account is out of the sandbox, which it
  must be to send to anyone, and the sending limits.
- **Templates:** plain text plus simple HTML: code and link, verification, reset, and "a new login was
  linked to your account" (security notice).

## 7. Abuse and safety

- Better Auth's rate limiter on sign-in, sign-up, codes and resets, stored in Postgres so it works
  across serverless instances, plus the existing per-IP quota layer.
- Same response for "no such email" and "wrong password", so emails can't be enumerated.
- Codes and links are single-use and short-lived. Changing the password signs out other sessions.
- CSRF and origin checks come from Better Auth. Cookies are httpOnly and secure.
- Two-factor (TOTP) is not in scope; the plugin exists for later.

## 8. Privacy

Stored per account: linked provider ids, display name and avatar URL from the provider, email if the
user signs in with email or a provider that gives one, and created date. Not stored: provider access
tokens, character names (named sharing keeps its own rules), passwords in any reversible form. `/privacy`
gets an "Accounts" paragraph, in the same PR as the code, before any provider is turned on.

## 9. Rollout (behind `EVERLOOT_AUTH_V2`)

1. Better Auth with Battle.net only, against the migrated tables. Old sessions end; existing users sign
   in once and keep their account and keys.
2. GitHub, Google and Microsoft, plus `/account` linking.
3. Email and password, and email code or link, after SES is verified out of the sandbox.

Each step ships with tests. Unit tests cover the linking rule (match, mismatch, unverified, Battle.net),
unlink-last-login refusal, migration copying, and session revocation. An end-to-end sign-in runs against
a preview deployment per provider.

## 10. Owner setup (Carlos, or the agent in Carlos's browser)

- **Register sign-in apps.** Callback URLs are `https://everloot.app/api/auth/callback/<provider>`
  plus the preview domain.
  - Google Cloud OAuth client.
  - GitHub OAuth app under the Everloot org.
  - Microsoft Entra app registration (multi-tenant and personal accounts).
  - Battle.net: add the new callback URL to the existing client.
- **Secrets in Vercel:** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, each provider's id and secret, and the
  SES credentials (an IAM user limited to `ses:SendEmail` from `everloot.app`).
- **DNS records in Cloudflare** for SES.
