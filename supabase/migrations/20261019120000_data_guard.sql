-- Data guard: anonymous per-IP limits on the bulk read endpoints, and free API keys tied to a
-- Battle.net account. Additive: two new tables, three new functions, and consume_intake_quota gains an
-- 'api' scope (the request, install and mcp scopes keep their limits). Apply before setting
-- EVERLOOT_DATA_GUARD=1; until then the site behaves as before and never calls anything here.

-- 1. Anonymous bulk reads (corpus feed, drop list) get their own hourly global and per-IP buckets.
create or replace function public.consume_intake_quota(p_scope text, p_key text)
returns table (allowed boolean, retry_after integer)
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  keys text[];
  limits integer[];
  i integer;
  current_bucket public.intake_quota_buckets%rowtype;
  time_now timestamptz;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_scope is null or p_scope not in ('request', 'install', 'mcp', 'api') then
    raise exception 'Invalid quota scope or key';
  end if;
  if p_scope = 'request' then
    keys := array['global', 'ip:' || p_key];
    limits := array[10000, 200];
  elsif p_scope = 'mcp' then
    keys := array['mcp_global', 'mcp:' || p_key];
    limits := array[5000, 200];
  elsif p_scope = 'api' then
    keys := array['api_global', 'api:' || p_key];
    limits := array[3000, 30];
  else
    keys := array['install:' || p_key];
    limits := array[20];
  end if;
  -- Always lock the global bucket before the IP one. Check it before creating an IP bucket so a
  -- full global quota cannot be used to create unlimited new rows with forged identities.
  for i in 1..array_length(keys, 1) loop
    time_now := clock_timestamp();
    insert into public.intake_quota_buckets values (keys[i], 0, time_now + interval '1 hour')
      on conflict (bucket) do update set bucket = excluded.bucket
      returning * into current_bucket;
    time_now := clock_timestamp();
    if current_bucket.reset_at <= time_now then
      update public.intake_quota_buckets set count = 0, reset_at = time_now + interval '1 hour' where bucket = keys[i];
      current_bucket.count := 0;
      current_bucket.reset_at := time_now + interval '1 hour';
    end if;
    if current_bucket.count >= limits[i] then
      allowed := false;
      retry_after := greatest(1, ceil(extract(epoch from current_bucket.reset_at - time_now))::integer);
      return next;
      return;
    end if;
  end loop;
  update public.intake_quota_buckets set count = count + 1 where bucket = any(keys);
  allowed := true;
  retry_after := 0;
  return next;
end;
$$;
revoke all on function public.consume_intake_quota(text, text) from public, anon, authenticated;
grant execute on function public.consume_intake_quota(text, text) to service_role;

-- 2. Free API keys. Only a SHA-256 of the key is stored; the key itself is shown once. The shape is
-- an opaque bearer token with scopes and an optional expiry, so a future OAuth server for MCP
-- connectors can issue its access tokens into this same table for the same Battle.net user.
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  hint text not null check (hint ~ '^[a-f0-9]{4}$'),
  label text not null default '' check (char_length(label) <= 60),
  scopes text[] not null default array['read:public']::text[]
    check (cardinality(scopes) > 0 and scopes <@ array['read:public', 'read:own']::text[]),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_user_idx on public.api_keys (user_id);
alter table public.api_keys enable row level security;
revoke all on public.api_keys from public, anon, authenticated, service_role;
grant select, delete on public.api_keys to service_role;
grant update (revoked_at) on public.api_keys to service_role;

-- Requests per key, per UTC day and endpoint, so heavy users can be identified and asked what they build.
-- Kept 90 days (prune_api_keys).
create table if not exists public.api_key_usage (
  day date not null,
  key_id uuid not null references public.api_keys(id) on delete cascade,
  surface text not null check (surface in ('corpus', 'drops', 'market', 'mcp')),
  count bigint not null check (count >= 0),
  primary key (day, key_id, surface)
);
alter table public.api_key_usage enable row level security;
revoke all on public.api_key_usage from public, anon, authenticated, service_role;
grant select on public.api_key_usage to service_role;

-- At most five live keys per account, and at most ten made per day, so revoking and remaking keys
-- gains nothing. The user row is locked so two requests cannot both pass the counts. The daily count
-- lives in its own bucket, so deleting a key does not reset it.
create or replace function public.create_api_key(p_user_id uuid, p_token_hash text, p_hint text, p_label text)
returns table (key_ref uuid, refusal text)
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  live integer;
  made public.intake_quota_buckets%rowtype;
  bucket_name text;
  time_now timestamptz;
begin
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  key_ref := null;
  select count(*) into live from public.api_keys k
    where k.user_id = p_user_id and k.revoked_at is null and (k.expires_at is null or k.expires_at > now());
  if live >= 5 then
    refusal := 'live_limit';
    return next;
    return;
  end if;
  bucket_name := 'keys_made:' || p_user_id::text;
  time_now := clock_timestamp();
  insert into public.intake_quota_buckets values (bucket_name, 0, time_now + interval '1 day')
    on conflict (bucket) do update set bucket = excluded.bucket
    returning * into made;
  if made.reset_at <= time_now then
    update public.intake_quota_buckets set count = 0, reset_at = time_now + interval '1 day' where bucket = bucket_name;
    made.count := 0;
  end if;
  if made.count >= 10 then
    refusal := 'daily_limit';
    return next;
    return;
  end if;
  update public.intake_quota_buckets set count = count + 1 where bucket = bucket_name;
  insert into public.api_keys (user_id, token_hash, hint, label)
    values (p_user_id, p_token_hash, p_hint, coalesce(p_label, ''))
    returning id into key_ref;
  refusal := null;
  return next;
end;
$$;
revoke all on function public.create_api_key(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_api_key(uuid, text, text, text) to service_role;

-- One call per keyed request: is the key live and allowed to read public data, is its account's hourly
-- allowance left, and count it. The allowance is per account, across all its keys, so a new key does
-- not bring a fresh one. An unknown, revoked or expired key, or one without read:public, returns
-- allowed = false with retry_after = 0 and no key_ref.
create or replace function public.consume_api_key(p_token_hash text, p_surface text)
returns table (allowed boolean, retry_after integer, key_ref uuid)
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  found_key public.api_keys%rowtype;
  current_bucket public.intake_quota_buckets%rowtype;
  bucket_name text;
  time_now timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_surface is null
    or p_surface not in ('corpus', 'drops', 'market', 'mcp') then
    raise exception 'Invalid key or surface';
  end if;
  select * into found_key from public.api_keys k
    where k.token_hash = p_token_hash and k.revoked_at is null and (k.expires_at is null or k.expires_at > now())
      and 'read:public' = any(k.scopes);
  if not found then
    allowed := false;
    retry_after := 0;
    key_ref := null;
    return next;
    return;
  end if;
  key_ref := found_key.id;
  bucket_name := 'user:' || found_key.user_id::text;
  time_now := clock_timestamp();
  insert into public.intake_quota_buckets values (bucket_name, 0, time_now + interval '1 hour')
    on conflict (bucket) do update set bucket = excluded.bucket
    returning * into current_bucket;
  time_now := clock_timestamp();
  if current_bucket.reset_at <= time_now then
    update public.intake_quota_buckets set count = 0, reset_at = time_now + interval '1 hour' where bucket = bucket_name;
    current_bucket.count := 0;
    current_bucket.reset_at := time_now + interval '1 hour';
  end if;
  if current_bucket.count >= 2000 then
    allowed := false;
    retry_after := greatest(1, ceil(extract(epoch from current_bucket.reset_at - time_now))::integer);
    return next;
    return;
  end if;
  update public.intake_quota_buckets set count = count + 1 where bucket = bucket_name;
  insert into public.api_key_usage as u (day, key_id, surface, count)
    values ((now() at time zone 'utc')::date, found_key.id, p_surface, 1)
    on conflict on constraint api_key_usage_pkey do update set count = u.count + 1;
  -- At most one write a minute per key for the "last used" time.
  update public.api_keys set last_used_at = now()
    where id = found_key.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  allowed := true;
  retry_after := 0;
  return next;
end;
$$;
revoke all on function public.consume_api_key(text, text) from public, anon, authenticated;
grant execute on function public.consume_api_key(text, text) to service_role;

-- Retention, run by the snapshot cron: daily counts are kept 90 days, and a revoked key (with its
-- counts) is deleted 30 days after it was revoked.
create or replace function public.prune_api_keys()
returns void
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
begin
  delete from public.api_key_usage where day < (now() at time zone 'utc')::date - 90;
  delete from public.api_keys where revoked_at < now() - interval '30 days';
end;
$$;
revoke all on function public.prune_api_keys() from public, anon, authenticated;
grant execute on function public.prune_api_keys() to service_role;
notify pgrst, 'reload schema';

-- Revoke one key by hand (the owner's tool for abuse): update public.api_keys set revoked_at = now() where id = '<id>';
-- Heaviest keys this week: select k.id, k.label, u.battletag, sum(c.count) from public.api_key_usage c
--   join public.api_keys k on k.id = c.key_id join public.users u on u.id = k.user_id
--   where c.day > current_date - 7 group by 1, 2, 3 order by 4 desc;
-- Rollback (run by hand; this deletes every key and its counts):
--   drop function if exists public.prune_api_keys();
--   drop function if exists public.consume_api_key(text, text);
--   drop function if exists public.create_api_key(uuid, text, text, text);
--   drop table if exists public.api_key_usage;
--   drop table if exists public.api_keys;
--   then re-run 20261010120000_mcp_quota_scope.sql to drop the 'api' scope.
--   notify pgrst, 'reload schema';
