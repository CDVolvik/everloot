# supabase/

The site's Postgres database on Supabase: sign-in sessions, the private upload index, publication
grants and suppressions, intake quotas and the waitlist. Players' raw uploads live in Cloudflare R2,
not here.

## Run it

Apply the files in `migrations/` in name order to a Supabase project (the
schema references Supabase's `anon`, `authenticated` and `service_role` roles, so plain Postgres needs
those roles created first). The site talks to it only from the server, with a service key that never reaches the
browser; every table has row-level security on.

## Sign-in with Better Auth

With `EVERLOOT_AUTH_V2=1` the site signs people in through Better Auth, which reads and writes the
`auth_*` tables and `users` as the `everloot_auth` database role (`AUTH_DATABASE_URL`, the
transaction-pooler URI on port 6543, without `sslmode`). Register `https://everloot.app/api/auth/callback/battlenet`
as the redirect URL in the Battle.net developer portal; `BNET_REDIRECT_URI` applies only to the old sign-in.
Sessions store no IP address or user agent, and provider tokens are never kept. The variables are in
`web/.env.example`.

## Test it

`tests/verified_publication.sql` checks the publication grant rules. Run it with `psql` against a
disposable database that has the schema applied.

`web/scripts/intake-quota.integration.mjs`, `web/scripts/data-guard.integration.mjs` and
`web/scripts/accounts.integration.mjs` check the quota, API key and accounts schema against a
disposable local Postgres named `intake_quota_test`, set in `QUOTA_TEST_DATABASE_URL`. They refuse
any other host or database name. The accounts script drops and recreates the `public` schema first.

## Where things live

| Path | What |
|---|---|
| `migrations/` | Users, sessions, profiles, characters, suppressions, revoked guilds and tokens; uploads and waitlist, verified publication, intake quotas, MCP quota scope, usage counters, API keys and bulk-read limits; Better Auth accounts (`auth_session`, `auth_account`, `auth_verification`, `auth_rate_limit`) |
| `tests/` | SQL tests |
| `certs/` | The Supabase root certificate for maintenance connections |
