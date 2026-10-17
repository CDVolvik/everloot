# supabase/

The site's Postgres database on Supabase: sign-in sessions, the private upload index, publication
grants and suppressions, intake quotas and the waitlist. Players' raw uploads live in Cloudflare R2,
not here.

## Run it

Apply `auth_schema.sql`, then the files in `migrations/` in name order, to a Supabase project or any
Postgres 15+. The site talks to it only from the server, with a service key that never reaches the
browser; every table has row-level security on.

## Test it

`tests/verified_publication.sql` checks the publication grant rules. Run it with `psql` against a
disposable database that has the schema applied.

## Where things live

| Path | What |
|---|---|
| `auth_schema.sql` | Users, sessions, profiles, characters, suppressions, revoked guilds and tokens |
| `migrations/` | Uploads and waitlist, verified publication, intake quotas, MCP quota scope |
| `tests/` | SQL tests |
| `certs/` | The Supabase root certificate for maintenance connections |
