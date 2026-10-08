-- Server-only admission; keys are HMACs, never raw addresses or install identifiers.
create table if not exists public.intake_quota_buckets (
  bucket text primary key,
  count integer not null check (count >= 0),
  reset_at timestamptz not null
);
create index if not exists intake_quota_expiry on public.intake_quota_buckets (reset_at);
alter table public.intake_quota_buckets enable row level security;
revoke all on public.intake_quota_buckets from public, anon, authenticated, service_role;
grant select, delete on public.intake_quota_buckets to service_role;

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
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_scope is null or p_scope not in ('request', 'install') then
    raise exception 'Invalid quota scope or key';
  end if;
  if p_scope = 'request' then
    keys := array['global', 'ip:' || p_key];
    limits := array[10000, 200];
  else
    keys := array['install:' || p_key];
    limits := array[20];
  end if;
  -- Always lock global before IP. Check it before creating an IP bucket so a full
  -- global quota cannot be used to create unlimited new rows with forged identities.
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
-- Supabase can grant functions to browser roles by default: revoke explicitly.
revoke all on function public.consume_intake_quota(text, text) from public, anon, authenticated;
grant execute on function public.consume_intake_quota(text, text) to service_role;
notify pgrst, 'reload schema';
