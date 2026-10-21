-- Run after every migration up to 20261021190000_character_links.sql on a disposable local PostgreSQL database
-- that has the roles anon, authenticated and service_role.
begin;

-- Only the server's role may call anything here; the tables are closed to every API role.
do $$
declare role_name text; tbl text; fn text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    foreach tbl in array array['public.link_codes', 'public.character_links', 'public.character_visibility'] loop
      if has_table_privilege(role_name, tbl, 'SELECT,INSERT,UPDATE,DELETE') then raise exception '% can touch %', role_name, tbl; end if;
    end loop;
    foreach fn in array array[
      'public.create_link_code(uuid, text)', 'public.unlink_character(uuid, uuid)', 'public.set_visibility(uuid, uuid, jsonb)',
      'public.redeem_link(uuid, text, text, text, text, text, text, text, text, integer, text, text)',
      'public.public_character(text, text, text)', 'public.link_account_for_key(text)', 'public.take_link_code(uuid)'
    ] loop
      if has_function_privilege(role_name, fn, 'EXECUTE') then raise exception '% can execute %', role_name, fn; end if;
    end loop;
  end loop;
  foreach tbl in array array['public.link_codes', 'public.character_links', 'public.character_visibility'] loop
    if not (select relrowsecurity from pg_class where oid = tbl::regclass) then raise exception 'RLS disabled on %', tbl; end if;
  end loop;
  if has_table_privilege('service_role', 'public.link_codes', 'SELECT') then raise exception 'code hashes are readable'; end if;
  if has_table_privilege('service_role', 'public.character_links', 'INSERT,UPDATE,DELETE') then raise exception 'links writable outside the functions'; end if;
  if has_function_privilege('service_role', 'public.take_link_code(uuid)', 'EXECUTE') then raise exception 'the code counter is callable'; end if;
  if not has_function_privilege('service_role', 'public.redeem_link(uuid, text, text, text, text, text, text, text, text, integer, text, text)', 'EXECUTE') then
    raise exception 'server cannot redeem';
  end if;
  -- No column anywhere can hold a GUID.
  if exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name in ('link_codes', 'character_links', 'character_visibility') and column_name ilike '%guid%') then
    raise exception 'a GUID column exists';
  end if;
end $$;

insert into public.users (id, bnet_id, battletag) values
  ('00000000-0000-4000-8000-00000000000a', 'test-a', 'Alpha#1'),
  ('00000000-0000-4000-8000-00000000000b', 'test-b', 'Bravo#2'),
  ('00000000-0000-4000-8000-00000000000c', 'test-c', 'Charlie#3');

-- A tiny helper for this test only: redeem with fixed character fields.
create function pg_temp.redeem(p_user text, p_code text, p_key text, p_name text default 'Thrallina', p_realm text default 'Forever Pioneer')
returns table (link_ref uuid, link_status text, refusal text) language sql as $$
  select * from public.redeem_link(p_user::uuid, encode(sha256(convert_to(p_code, 'UTF8')), 'hex'), p_key, 'forever', p_realm, p_name,
    'Orc', 'SHAMAN', 'Horde', 24, '0a1b2c3d', 'install-0001');
$$;
create function pg_temp.code(p_user text, p_code text) returns text language sql as $$
  select coalesce(refusal, 'ok') from public.create_link_code(p_user::uuid, encode(sha256(convert_to(p_code, 'UTF8')), 'hex'));
$$;

-- Codes: 15 minutes, a taken hash costs nothing, 10 a day.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
  i integer;
begin
  if pg_temp.code(a, 'EL-AAAA-01') <> 'ok' then raise exception 'code not made'; end if;
  if (select expires_at - created_at from public.link_codes where code_hash = encode(sha256(convert_to('EL-AAAA-01', 'UTF8')), 'hex'))
      <> interval '15 minutes' then raise exception 'code not live for 15 minutes'; end if;
  if pg_temp.code('00000000-0000-4000-8000-00000000000b', 'EL-AAAA-01') <> 'code_taken' then raise exception 'live hash reused'; end if;
  for i in 2..10 loop
    if pg_temp.code(a, 'EL-AAAA-' || lpad(i::text, 2, '0')) <> 'ok' then raise exception 'code % refused', i; end if;
  end loop;
  if pg_temp.code(a, 'EL-AAAA-11') <> 'daily_limit' then raise exception 'eleventh code made'; end if;
  if (select count(*) from public.link_codes where user_id = a::uuid) <> 10 then raise exception 'refused code stored'; end if;
end $$;

-- Redeem: unknown, foreign, expired and used codes are refused, and nothing is written.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
  b constant text := '00000000-0000-4000-8000-00000000000b';
  k1 constant text := repeat('1', 64);
  r record;
begin
  if (select refusal from pg_temp.redeem(a, 'EL-ZZZZ-99', k1)) <> 'code_unknown' then raise exception 'unknown code taken'; end if;
  if (select refusal from pg_temp.redeem(b, 'EL-AAAA-01', k1)) <> 'code_foreign' then raise exception 'foreign code taken'; end if;
  update public.link_codes set expires_at = now() - interval '1 second' where code_hash = encode(sha256(convert_to('EL-AAAA-02', 'UTF8')), 'hex');
  if (select refusal from pg_temp.redeem(a, 'EL-AAAA-02', k1)) <> 'code_expired' then raise exception 'expired code taken'; end if;
  if exists (select 1 from public.character_links) then raise exception 'refused redeem wrote a link'; end if;

  select * into r from pg_temp.redeem(a, 'EL-AAAA-01', k1);
  if r.refusal is not null or r.link_status <> 'linked' or r.link_ref is null then raise exception 'first link refused: %', r.refusal; end if;
  if (select refusal from pg_temp.redeem(a, 'EL-AAAA-01', k1)) <> 'code_used' then raise exception 'used code taken twice'; end if;
  -- The link starts private: every flag false.
  if exists (select 1 from public.character_visibility v where v.link_id = r.link_ref
      and (page_public or show_gear or show_collections or show_gold or show_guild or ranked_gear or ranked_achievements or ranked_gold or indexable)) then
    raise exception 'a new link is not private';
  end if;
  if (select name_key || '|' || realm_key from public.character_links where id = r.link_ref) <> 'thrallina|forever pioneer' then raise exception 'keys not lower-cased'; end if;
  if exists (select 1 from public.public_character('forever', 'forever-pioneer', 'thrallina')) then raise exception 'private link is public'; end if;
end $$;

-- The same character again on the same account refreshes the link; another character of the same name is refused.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
  r record;
begin
  select * into r from pg_temp.redeem(a, 'EL-AAAA-03', repeat('1', 64));
  if r.refusal is not null or r.link_status <> 'linked' then raise exception 'relink refused'; end if;
  if (select count(*) from public.character_links where user_id = a::uuid) <> 1 then raise exception 'relink duplicated'; end if;
  if (select refusal from pg_temp.redeem(a, 'EL-AAAA-04', repeat('2', 64))) <> 'name_linked' then raise exception 'second game id for one name'; end if;
end $$;

-- Visibility: the owner's flags only, unknown flags raise, and a public link reads without any account data.
do $$
declare
  a constant uuid := '00000000-0000-4000-8000-00000000000a';
  link uuid := (select id from public.character_links where user_id = a);
begin
  if public.set_visibility('00000000-0000-4000-8000-00000000000b', link, '{"page_public": true}') then raise exception 'another account set flags'; end if;
  if not public.set_visibility(a, link, '{"page_public": true, "show_gear": true}') then raise exception 'owner could not set flags'; end if;
  if not public.set_visibility(a, link, '{"show_gear": false}') then raise exception 'owner could not clear a flag'; end if;
  if not (select page_public and not show_gear from public.character_visibility where link_id = link) then raise exception 'flags not kept'; end if;
  begin
    perform public.set_visibility(a, link, '{"show_battletag": true}');
    raise exception 'unknown flag accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid visibility' then raise; end if;
  end;
  begin
    perform public.set_visibility(a, link, '{"page_public": "yes"}');
    raise exception 'non-boolean flag accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid visibility' then raise; end if;
  end;
  if (select level from public.public_character('forever', 'Forever-Pioneer', 'THRALLINA')) <> 24 then raise exception 'public link not read'; end if;
end $$;

-- A second account claiming the same game id freezes the character on both, and it reads nowhere.
do $$
declare
  b constant text := '00000000-0000-4000-8000-00000000000b';
  r record;
begin
  perform pg_temp.code(b, 'EL-BBBB-01');
  select * into r from pg_temp.redeem(b, 'EL-BBBB-01', repeat('1', 64), 'Impostor');
  if r.refusal is not null or r.link_status <> 'frozen' then raise exception 'second claim not frozen'; end if;
  if exists (select 1 from public.character_links where link_key = repeat('1', 64) and status <> 'frozen') then raise exception 'first link not frozen'; end if;
  if exists (select 1 from public.public_character('forever', 'forever-pioneer', 'thrallina')) then raise exception 'frozen link is public'; end if;
end $$;

-- So does a second account claiming the same name and realm under another game id.
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
  c constant text := '00000000-0000-4000-8000-00000000000c';
begin
  -- EL-AAAA-05 and EL-AAAA-06 were made above and are still live.
  if (select link_status from pg_temp.redeem(a, 'EL-AAAA-05', repeat('3', 64), 'Throgar')) <> 'linked' then raise exception 'Throgar not linked'; end if;
  perform pg_temp.code(c, 'EL-CCCC-01');
  if (select link_status from pg_temp.redeem(c, 'EL-CCCC-01', repeat('4', 64), 'throgar')) <> 'frozen' then raise exception 'name claim not frozen'; end if;
  if (select status from public.character_links where user_id = a::uuid and name_key = 'throgar') <> 'frozen' then raise exception 'name owner not frozen'; end if;
end $$;

-- A hidden character cannot be linked, and a linked one that is hidden later is not read.
insert into public.character_suppressions values ('forever pioneer', 'hidden');
do $$
declare
  a constant text := '00000000-0000-4000-8000-00000000000a';
  link uuid;
begin
  if (select refusal from pg_temp.redeem(a, 'EL-AAAA-06', repeat('5', 64), 'Hidden')) <> 'suppressed' then raise exception 'hidden character linked'; end if;
  if exists (select 1 from public.character_links where name_key = 'hidden') then raise exception 'hidden character written'; end if;
  if (select used_at from public.link_codes where code_hash = encode(sha256(convert_to('EL-AAAA-06', 'UTF8')), 'hex')) is not null then
    raise exception 'a refused redeem spent the code';
  end if;
  if (select link_status from pg_temp.redeem(a, 'EL-AAAA-06', repeat('6', 64), 'Later')) <> 'linked' then raise exception 'Later not linked'; end if;
  link := (select id from public.character_links where name_key = 'later');
  perform public.set_visibility(a::uuid, link, '{"page_public": true}');
  if not exists (select 1 from public.public_character('forever', 'forever-pioneer', 'later')) then raise exception 'Later not public'; end if;
  insert into public.character_suppressions values ('forever pioneer', 'later');
  if exists (select 1 from public.public_character('forever', 'forever-pioneer', 'later')) then raise exception 'hidden link read'; end if;
end $$;

-- Unlink takes the visibility row with it and touches only the owner's link.
do $$
declare
  a constant uuid := '00000000-0000-4000-8000-00000000000a';
  link uuid := (select id from public.character_links where user_id = a and name_key = 'later');
begin
  if public.unlink_character('00000000-0000-4000-8000-00000000000b', link) then raise exception 'another account unlinked'; end if;
  if not public.unlink_character(a, link) then raise exception 'owner could not unlink'; end if;
  if exists (select 1 from public.character_visibility where link_id = link) then raise exception 'visibility kept after unlink'; end if;
  if public.unlink_character(a, link) then raise exception 'unlinked twice'; end if;
end $$;

-- 50 links per account.
do $$
declare
  c constant uuid := '00000000-0000-4000-8000-00000000000c';
  i integer;
begin
  delete from public.intake_quota_buckets where bucket = 'link_codes:' || c::text;
  for i in 1..49 loop
    insert into public.character_links (user_id, link_key, ruleset, realm_key, name_key, realm, name, race, class, faction, level, completion_key, install_id)
      values (c, lpad(to_hex(1000 + i), 64, 'a'), 'forever', 'forever pioneer', 'fill' || chr(96 + i % 26) || chr(97 + i / 26), 'Forever Pioneer',
        'Fill' || chr(96 + i % 26) || chr(97 + i / 26), 'Orc', 'SHAMAN', 'Horde', 1, '00000000', 'install-0001');
  end loop;
  if (select count(*) from public.character_links where user_id = c) <> 50 then raise exception 'fixture count'; end if;
  perform pg_temp.code(c::text, 'EL-CCCC-02');
  if (select refusal from pg_temp.redeem(c::text, 'EL-CCCC-02', repeat('7', 64), 'Extra')) <> 'link_limit' then raise exception 'fifty-first link made'; end if;
end $$;

-- Keys: link:own may be made and is what link_account_for_key asks for.
do $$
declare
  a constant uuid := '00000000-0000-4000-8000-00000000000a';
  r record;
begin
  perform public.create_api_key(a, repeat('d', 64), 'dddd', 'desktop', array['read:public', 'read:own', 'link:own']);
  perform public.create_api_key(a, repeat('e', 64), 'eeee', 'reader', array['read:public']);
  select * into r from public.link_account_for_key(repeat('d', 64));
  if r.refusal is not null or r.account <> a then raise exception 'link key not accepted'; end if;
  if (select refusal from public.link_account_for_key(repeat('e', 64))) <> 'no_scope' then raise exception 'scope not checked'; end if;
  if (select refusal from public.link_account_for_key(repeat('f', 64))) <> 'unknown_key' then raise exception 'unknown key accepted'; end if;
  update public.api_keys set revoked_at = now() where token_hash = repeat('d', 64);
  if (select refusal from public.link_account_for_key(repeat('d', 64))) <> 'unknown_key' then raise exception 'revoked key accepted'; end if;
  begin
    perform public.create_api_key(a, repeat('c', 64), 'cccc', 'bad', array['write:all']);
    raise exception 'unknown scope accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid scopes' then raise; end if;
  end;
end $$;

-- Deleting an account deletes its links, their visibility and its codes.
delete from public.users where id = '00000000-0000-4000-8000-00000000000a';
do $$
begin
  if exists (select 1 from public.character_links where user_id = '00000000-0000-4000-8000-00000000000a') then raise exception 'links outlived the account'; end if;
  if exists (select 1 from public.link_codes where user_id = '00000000-0000-4000-8000-00000000000a') then raise exception 'codes outlived the account'; end if;
  if exists (select 1 from public.character_visibility v where not exists (select 1 from public.character_links l where l.id = v.link_id)) then
    raise exception 'orphan visibility';
  end if;
end $$;
rollback;
