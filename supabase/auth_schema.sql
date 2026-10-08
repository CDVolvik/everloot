-- Everloot authentication and entitlement schema
-- Run in Supabase SQL editor

-- Private Battle.net users. Custom sessions are not Supabase Auth JWTs.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  bnet_id text unique not null,
  battletag text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Sessions table for custom session management
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text unique not null check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists sessions_user_id_idx on public.sessions(user_id);
create index if not exists sessions_expires_at_idx on public.sessions(expires_at);

-- Profiles table (extends users with app-specific data)
create table if not exists public.profiles (
  id uuid primary key references public.users(id) on delete cascade,
  bnet_id text not null,
  battletag text not null,
  avatar_url text,
  locale text default 'en_US',
  timezone text default 'UTC',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Entitlements (subscription plans)
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan text not null check (plan in ('free', 'premium', 'lifetime')),
  status text not null check (status in ('active', 'cancelled', 'expired', 'past_due')),
  stripe_subscription_id text unique,
  stripe_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, plan)
);

create index if not exists entitlements_user_id_idx on public.entitlements(user_id);
create index if not exists entitlements_status_idx on public.entitlements(status);

-- Characters (linked to users)
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  bnet_character_id bigint not null,
  name text not null,
  realm text not null,
  region text default 'us',
  class_id int,
  spec_id int,
  level int,
  item_level int,
  faction text,
  thumbnail_url text,
  last_synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, bnet_character_id, realm, region)
);

create index if not exists characters_user_id_idx on public.characters(user_id);

-- Suppression/opt-out table
create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  character_name text not null,
  realm text not null,
  type text not null check (type in ('suppressed', 'opt_out')),
  reason text,
  created_by uuid references public.users(id),
  created_at timestamptz default now(),
  unique (character_name, realm, type)
);

create index if not exists suppressions_character_realm_idx on public.suppressions(character_name, realm);

-- Revoked guilds
create table if not exists public.revoked_guilds (
  id uuid primary key default gen_random_uuid(),
  guild_name text not null,
  realm text not null,
  reason text,
  revoked_by uuid references public.users(id),
  created_at timestamptz default now(),
  unique (guild_name, realm)
);

create index if not exists revoked_guilds_guild_realm_idx on public.revoked_guilds(guild_name, realm);

-- Revoked claim tokens
create table if not exists public.revoked_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  reason text,
  revoked_by uuid references public.users(id),
  created_at timestamptz default now()
);

-- Row Level Security
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.profiles enable row level security;
alter table public.entitlements enable row level security;
alter table public.characters enable row level security;
alter table public.suppressions enable row level security;
alter table public.revoked_guilds enable row level security;
alter table public.revoked_tokens enable row level security;

-- Custom cookies are validated by server routes. RLS has no client policies;
-- neither anon nor authenticated may read users, session hashes or revocation tokens.
revoke all on public.users, public.sessions, public.profiles, public.entitlements,
  public.characters, public.suppressions, public.revoked_guilds, public.revoked_tokens
  from anon, authenticated;
grant all on public.users, public.sessions, public.profiles, public.entitlements,
  public.characters, public.suppressions, public.revoked_guilds, public.revoked_tokens
  to service_role;

-- Updated_at trigger
create or replace function public.handle_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at before update on public.users
  for each row execute function public.handle_updated_at();
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.handle_updated_at();
drop trigger if exists entitlements_updated_at on public.entitlements;
create trigger entitlements_updated_at before update on public.entitlements
  for each row execute function public.handle_updated_at();
drop trigger if exists characters_updated_at on public.characters;
create trigger characters_updated_at before update on public.characters
  for each row execute function public.handle_updated_at();
revoke all on function public.handle_updated_at() from public, anon, authenticated;
grant execute on function public.handle_updated_at() to service_role;
