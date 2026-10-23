-- Run after every migration on a disposable local PostgreSQL database that has the roles anon, authenticated and
-- service_role. Rows go in the way PostgREST puts them in: the JSON body read into the table's row type.
begin;

-- The table holds the five columns the corpus store writes (web/src/lib/upload-store.ts, putUpload), with the
-- types and nullability it relies on, and received_at fills itself.
do $$
declare got text;
begin
  select string_agg(format('%s %s %s', column_name, data_type, is_nullable), ', ' order by ordinal_position) into got
    from information_schema.columns where table_schema = 'public' and table_name = 'uploads';
  if got <> 'id uuid NO, install_id text NO, received_at timestamp with time zone NO, record_count integer NO, bytes integer NO, object_key text NO' then
    raise exception 'uploads is not the table the store writes: %', got;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.uploads'::regclass) then raise exception 'RLS disabled on uploads'; end if;
end $$;

-- The row the store sends is accepted, from an addon install and from a Polestar Recorder install alike.
do $$
declare row_json json;
begin
  foreach row_json in array array[
    '{"id":"7a4dc94e-3283-4810-b185-e9eddf2cc332","install_id":"install-1234","record_count":3,"bytes":576,"object_key":"uploads/2026-10-22/7a4dc94e-3283-4810-b185-e9eddf2cc332.json"}',
    '{"id":"e04a0ae5-80b0-4f67-aef4-c27cf0f1cca5","install_id":"ps-0123456789abcdef0123456789abcdef","record_count":0,"bytes":1048576,"object_key":"uploads/2026-10-22/e04a0ae5-80b0-4f67-aef4-c27cf0f1cca5.json"}'
  ]::json[] loop
    insert into public.uploads (id, install_id, record_count, bytes, object_key)
      select id, install_id, record_count, bytes, object_key from json_populate_record(null::public.uploads, row_json);
  end loop;
  if (select count(*) from public.uploads where received_at is not null and id in ('7a4dc94e-3283-4810-b185-e9eddf2cc332', 'e04a0ae5-80b0-4f67-aef4-c27cf0f1cca5')) <> 2 then
    raise exception 'the store''s rows did not land';
  end if;
end $$;

-- The same row twice is a unique violation (PostgREST answers 409): what the store's retry reads as "the first try landed".
do $$
begin
  insert into public.uploads (id, install_id, record_count, bytes, object_key)
    values ('7a4dc94e-3283-4810-b185-e9eddf2cc332', 'install-1234', 3, 576, 'uploads/2026-10-22/7a4dc94e-3283-4810-b185-e9eddf2cc332.json');
  raise exception 'a repeated row was accepted';
exception when unique_violation then null;
end $$;

-- An install id with a NUL cannot become text (PostgREST answers 400), which is why the intake refuses it first.
do $$
begin
  perform install_id from json_populate_record(null::public.uploads, '{"install_id":"install-\u00001234"}');
  raise exception 'a NUL reached install_id';
exception when untranslatable_character then null;
end $$;

-- A negative count is refused by the table's checks.
do $$
begin
  insert into public.uploads (id, install_id, record_count, bytes, object_key)
    values (gen_random_uuid(), 'install-1234', -1, 0, 'uploads/negative.json');
  raise exception 'a negative record_count was accepted';
exception when check_violation then null;
end $$;

rollback;
