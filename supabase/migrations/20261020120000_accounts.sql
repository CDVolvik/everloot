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

create table if not exists public.auth_verification (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_verification_identifier_idx on public.auth_verification(identifier);

-- Written only by our hashed store; the key is a SHA-256 digest, never an address.
create table if not exists public.auth_rate_limit (
  key text primary key,
  count integer not null,
  last_request bigint not null
);

alter table public.auth_session enable row level security;
alter table public.auth_account enable row level security;
alter table public.auth_verification enable row level security;
alter table public.auth_rate_limit enable row level security;

-- No client policies: only server routes with the service key touch these tables.
revoke all on public.auth_session, public.auth_account, public.auth_verification, public.auth_rate_limit
  from anon, authenticated;
grant all on public.auth_session, public.auth_account, public.auth_verification, public.auth_rate_limit
  to service_role;

-- Every existing Battle.net user already has one sign-in method.
insert into public.auth_account (id, user_id, account_id, provider_id)
select gen_random_uuid(), id, bnet_id, 'battlenet' from public.users where bnet_id is not null
on conflict (provider_id, account_id) do nothing;
