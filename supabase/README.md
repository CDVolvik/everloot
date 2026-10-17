# supabase/

The site's Postgres database on Supabase: sign-in sessions, the private upload index, publication
grants and suppressions, intake quotas and the waitlist. Players' raw uploads live in Cloudflare R2,
not here.

## Run it

Apply `auth_schema.sql`, then the files in `migrations/` in name order, to a Supabase project (the
schema references Supabase's `anon`, `authenticated` and `service_role` roles, so plain Postgres needs
those roles created first). The site talks to it only from the server, with a service key that never reaches the
browser; every table has row-level security on.

## Test it

`tests/verified_publication.sql` checks the publication grant rules. Run it with `psql` against a
disposable database that has the schema applied.

`web/scripts/intake-quota.integration.mjs` and `web/scripts/data-guard.integration.mjs` check the
quota and API key functions against a disposable local Postgres named `intake_quota_test`, set in
`QUOTA_TEST_DATABASE_URL`. They refuse any other host or database name.

## Where things live

| Path | What |
|---|---|
| `auth_schema.sql` | Users, sessions, profiles, characters, suppressions, revoked guilds and tokens |
| `migrations/` | Uploads and waitlist, verified publication, intake quotas, MCP quota scope, usage counters, API keys and bulk-read limits |
| `tests/` | SQL tests |
| `certs/` | The Supabase root certificate for maintenance connections |
