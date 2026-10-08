-- These rows are private verification evidence, never browser-readable.
create table if not exists public.publication_grants (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  "grant" jsonb not null check (jsonb_typeof("grant") = 'object'),
  revoked_at timestamptz
);
create table if not exists public.character_suppressions (
  realm text not null check (realm = lower(trim(realm)) and length(realm) > 0),
  character text not null check (character = lower(trim(character)) and length(character) > 0),
  primary key (realm, character)
);
alter table public.publication_grants enable row level security;
alter table public.character_suppressions enable row level security;
revoke all on public.publication_grants, public.character_suppressions from public, anon, authenticated;
grant select, insert, update on public.publication_grants to service_role;
grant select, insert on public.character_suppressions to service_role;
