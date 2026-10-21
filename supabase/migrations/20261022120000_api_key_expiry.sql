-- API keys with a purpose and an end date. Additive: api_keys gains a `purpose` column, and three new functions
-- make a key with a name, a purpose, its scopes and an expiry (issue_api_key), roll one to a new secret with the
-- same settings (roll_api_key), and share the per-account limits between them (api_key_room). create_api_key,
-- consume_api_key and own_builds_for_key are not touched: the last two already refuse a key past its expires_at.
-- Needs 20261019120000_data_guard.sql (and, for read:own keys, 20261021150000_saved_builds.sql) first. The site
-- works before this file is applied, without the expiry and purpose fields, and uses them once it is. Safe to
-- apply twice.
--
-- The scopes a key may hold are the table's own check (api_keys_scopes_check); the functions here do not repeat
-- the list, so a migration that widens it (link:own) needs no change here.

alter table public.api_keys add column if not exists purpose text not null default '';
alter table public.api_keys drop constraint if exists api_keys_purpose_check;
alter table public.api_keys add constraint api_keys_purpose_check check (char_length(purpose) <= 200);

-- The limits every new key passes: at most five live keys per account (live: not revoked and not expired) and
-- ten made per day. p_new_live is false for a roll of a live key, which replaces it rather than adding one.
-- Returns the refusal, or null after counting the key against the day. The caller holds the user row lock.
-- Called only by the functions below; nobody else may execute it.
create or replace function public.api_key_room(p_user_id uuid, p_new_live boolean)
returns text
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  live integer;
  made public.intake_quota_buckets%rowtype;
  bucket_name text := 'keys_made:' || p_user_id::text;
  time_now timestamptz := clock_timestamp();
begin
  if p_new_live then
    select count(*) into live from public.api_keys k
      where k.user_id = p_user_id and k.revoked_at is null and (k.expires_at is null or k.expires_at > now());
    if live >= 5 then return 'live_limit'; end if;
  end if;
  insert into public.intake_quota_buckets values (bucket_name, 0, time_now + interval '1 day')
    on conflict (bucket) do update set bucket = excluded.bucket
    returning * into made;
  if made.reset_at <= time_now then
    update public.intake_quota_buckets set count = 0, reset_at = time_now + interval '1 day' where bucket = bucket_name;
    made.count := 0;
  end if;
  if made.count >= 10 then return 'daily_limit'; end if;
  update public.intake_quota_buckets set count = count + 1 where bucket = bucket_name;
  return null;
end;
$$;
revoke all on function public.api_key_room(uuid, boolean) from public, anon, authenticated, service_role;

-- 1. Make a key from the account page's form: a name (1-60 characters), what it is for (1-200), its scopes and
-- when it expires (after now, at most 366 days ahead). Refusals: live_limit, daily_limit. Malformed input
-- raises: the server validates first.
create or replace function public.issue_api_key(p_user_id uuid, p_token_hash text, p_hint text, p_label text,
  p_purpose text, p_scopes text[], p_expires_at timestamptz)
returns table (key_ref uuid, refusal text)
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  v_label text := btrim(p_label);
  v_purpose text := btrim(p_purpose);
begin
  key_ref := null;
  if v_label is null or char_length(v_label) not between 1 and 60
    or v_purpose is null or char_length(v_purpose) not between 1 and 200 then
    raise exception 'Invalid name or purpose';
  end if;
  if p_scopes is null or cardinality(p_scopes) = 0 then raise exception 'Invalid scopes'; end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '366 days' then
    raise exception 'Invalid expiry';
  end if;
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  refusal := public.api_key_room(p_user_id, true);
  if refusal is not null then return next; return; end if;
  insert into public.api_keys (user_id, token_hash, hint, label, purpose, scopes, expires_at)
    values (p_user_id, p_token_hash, p_hint, v_label, v_purpose, array(select distinct s from unnest(p_scopes) s order by s), p_expires_at)
    returning id into key_ref;
  return next;
end;
$$;
revoke all on function public.issue_api_key(uuid, text, text, text, text, text[], timestamptz) from public, anon, authenticated;
grant execute on function public.issue_api_key(uuid, text, text, text, text, text[], timestamptz) to service_role;

-- 2. Roll one of the owner's keys that is not revoked: a new secret with the same name, purpose and scopes, and
-- the same lifetime counted from now (a key made for 90 days gets another 90; a key with no end keeps none).
-- The old key is revoked in the same transaction. Rolling an expired key brings it back, so it counts as a new
-- live key. Refusals: not_found, live_limit, daily_limit.
create or replace function public.roll_api_key(p_user_id uuid, p_id uuid, p_token_hash text, p_hint text)
returns table (key_ref uuid, key_expires_at timestamptz, refusal text)
language plpgsql security definer set search_path = '' set lock_timeout = '3s'
as $$
declare
  old_key public.api_keys%rowtype;
begin
  key_ref := null;
  key_expires_at := null;
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  select * into old_key from public.api_keys k where k.id = p_id and k.user_id = p_user_id and k.revoked_at is null for update;
  if not found then refusal := 'not_found'; return next; return; end if;
  refusal := public.api_key_room(p_user_id, old_key.expires_at is not null and old_key.expires_at <= now());
  if refusal is not null then return next; return; end if;
  if old_key.expires_at is not null then
    key_expires_at := now() + greatest(old_key.expires_at - old_key.created_at, interval '1 day');
  end if;
  update public.api_keys set revoked_at = now() where id = old_key.id;
  insert into public.api_keys (user_id, token_hash, hint, label, purpose, scopes, expires_at)
    values (p_user_id, p_token_hash, p_hint, old_key.label, old_key.purpose, old_key.scopes, key_expires_at)
    returning id into key_ref;
  return next;
end;
$$;
revoke all on function public.roll_api_key(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.roll_api_key(uuid, uuid, text, text) to service_role;
notify pgrst, 'reload schema';

-- What each account's keys are for: select u.battletag, k.label, k.purpose, k.scopes, k.created_at, k.expires_at,
--   k.last_used_at from public.api_keys k join public.users u on u.id = k.user_id where k.revoked_at is null order by 1;
-- Rollback (run by hand; keys made with an expiry keep it, and keep working until then):
--   drop function if exists public.roll_api_key(uuid, uuid, text, text);
--   drop function if exists public.issue_api_key(uuid, text, text, text, text, text[], timestamptz);
--   drop function if exists public.api_key_room(uuid, boolean);
--   alter table public.api_keys drop constraint if exists api_keys_purpose_check;
--   alter table public.api_keys drop column if exists purpose;
--   notify pgrst, 'reload schema';
