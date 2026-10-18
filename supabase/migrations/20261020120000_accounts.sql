-- Accounts on Better Auth: the identity columns it needs on users, and its own tables.
-- Battle.net stays the only sign-in for now. Safe to apply twice.

-- Users no longer need a Battle.net id; a Better Auth account has a name and an email instead.
alter table public.users alter column bnet_id drop not null;
alter table public.users alter column battletag drop not null;
alter table public.users add column if not exists name text;
alter table public.users add column if not exists email text;
alter table public.users add column if not exists email_verified boolean not null default false;
alter table public.users add column if not exists image text;
alter table public.users add column if not exists flags jsonb not null default '{}';

-- Better Auth sessions. Only the token is kept: no address, no user agent.
create table if not exists public.auth_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text unique not null,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_session_user_id_idx on public.auth_session(user_id);

-- One row per sign-in method on an account. Provider tokens stay null: they are never stored.
create table if not exists public.auth_account (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, account_id)
);

create index if not exists auth_account_user_id_idx on public.auth_account(user_id);

-- Better Auth expects these columns, so they exist, but the database refuses to fill them.
do $$ begin
  if not exists (select from pg_constraint where conrelid = 'public.auth_account'::regclass and conname = 'auth_account_no_provider_tokens') then
    alter table public.auth_account add constraint auth_account_no_provider_tokens
      check (access_token is null and refresh_token is null and id_token is null);
  end if;
  if not exists (select from pg_constraint where conrelid = 'public.auth_session'::regclass and conname = 'auth_session_no_client_details') then
    alter table public.auth_session add constraint auth_session_no_client_details
      check (ip_address is null and user_agent is null);
  end if;
end $$;

create table if not exists public.auth_verification (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_verification_identifier_idx on public.auth_verification(identifier);

-- Written only by our store; the key is an HMAC of address and path, never the address.
create table if not exists public.auth_rate_limit (
  key text primary key,
  count integer not null,
  last_request bigint not null
);

-- The triggers come before the backfills, so a v1 sign-in that lands while this runs is caught by
-- one or the other. Trigger functions run with the rights of whoever inserts (security invoker).

-- The v1 sign-in inserts (bnet_id, battletag) only. Fill the rest so it stays valid
-- whichever ships first, this migration or the Better Auth code.
create or replace function public.users_fill_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.bnet_id is not null then
    new.name := coalesce(new.name, new.battletag);
    new.email := coalesce(new.email, 'bnet-' || new.bnet_id || '@users.everloot.invalid');
  end if;
  return new;
end; $$;

revoke all on function public.users_fill_identity() from public, anon, authenticated;
grant execute on function public.users_fill_identity() to service_role;

drop trigger if exists users_fill_identity on public.users;
create trigger users_fill_identity before insert or update on public.users
  for each row execute function public.users_fill_identity();

-- Every user the v1 sign-in creates gets its Battle.net account row, so Better Auth finds them by
-- this row and never has to link by their unverified placeholder email. Insert only: v1's repeat
-- upsert takes the update path and must not restore a row that was later unlinked.
create or replace function public.users_battlenet_account()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.auth_account (id, user_id, account_id, provider_id)
  values (gen_random_uuid(), new.id, new.bnet_id, 'battlenet')
  on conflict (provider_id, account_id) do nothing;
  return null;
end; $$;

revoke all on function public.users_battlenet_account() from public, anon, authenticated;
grant execute on function public.users_battlenet_account() to service_role;

drop trigger if exists users_battlenet_account on public.users;
create trigger users_battlenet_account after insert on public.users
  for each row when (new.bnet_id is not null) execute function public.users_battlenet_account();

-- The other direction: a user Better Auth creates gets bnet_id and battletag in the same transaction
-- as its Battle.net account row, so a rollback to v1 finds them by bnet_id instead of making a
-- duplicate. Users that already have a bnet_id (every v1 user, whose row came from the trigger
-- above) are left alone, so the two triggers never feed each other.
create or replace function public.auth_account_battlenet_user()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.users set bnet_id = new.account_id, battletag = coalesce(battletag, name)
  where id = new.user_id and bnet_id is null;
  return null;
end; $$;

revoke all on function public.auth_account_battlenet_user() from public, anon, authenticated;
grant execute on function public.auth_account_battlenet_user() to service_role;

drop trigger if exists auth_account_battlenet_user on public.auth_account;
create trigger auth_account_battlenet_user after insert on public.auth_account
  for each row when (new.provider_id = 'battlenet') execute function public.auth_account_battlenet_user();

-- Existing Battle.net users get their battletag as a name and a placeholder address
-- (the helper that builds this string in the app must match it).
update public.users set name = battletag where name is null and bnet_id is not null;
update public.users set email = 'bnet-' || bnet_id || '@users.everloot.invalid' where email is null and bnet_id is not null;

alter table public.users alter column name set not null;
alter table public.users alter column email set not null;
do $$ begin
  if not exists (select from pg_constraint where conrelid = 'public.users'::regclass and conname = 'users_email_key') then
    alter table public.users add constraint users_email_key unique (email);
  end if;
end $$;

-- Every existing Battle.net user already has one sign-in method.
insert into public.auth_account (id, user_id, account_id, provider_id)
select gen_random_uuid(), id, bnet_id, 'battlenet' from public.users where bnet_id is not null
on conflict (provider_id, account_id) do nothing;

alter table public.auth_session enable row level security;
alter table public.auth_account enable row level security;
alter table public.auth_verification enable row level security;
alter table public.auth_rate_limit enable row level security;

-- Browsers never reach these tables; the server reaches them as service_role or everloot_auth.
revoke all on public.auth_session, public.auth_account, public.auth_verification, public.auth_rate_limit
  from anon, authenticated;
grant all on public.auth_session, public.auth_account, public.auth_verification, public.auth_rate_limit
  to service_role;

-- Better Auth connects as everloot_auth (AUTH_DATABASE_URL). The role is made here without a login;
-- the owner gives it one with a password after merge. It is not the owner and has no BYPASSRLS.
do $$ begin
  if not exists (select from pg_roles where rolname = 'everloot_auth') then
    create role everloot_auth nologin;
  end if;
end $$;

grant usage on schema public to everloot_auth;
grant select, insert, update, delete
  on public.users, public.auth_session, public.auth_account, public.auth_verification, public.auth_rate_limit
  to everloot_auth;

-- RLS stays on, so these policies are the only way everloot_auth sees or writes a row.
do $$
declare t text;
begin
  foreach t in array array['users', 'auth_session', 'auth_account', 'auth_verification', 'auth_rate_limit'] loop
    execute format('drop policy if exists everloot_auth_all on public.%I', t);
    execute format('create policy everloot_auth_all on public.%I for all to everloot_auth using (true) with check (true)', t);
  end loop;
end $$;
