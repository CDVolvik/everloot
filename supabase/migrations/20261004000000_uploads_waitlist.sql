-- Everloot: upload index and launch waitlist.
-- The raw upload body lives in R2 (object_key). This table is the list the site reads.
-- RLS is on with no policies: only the service role (server routes) can read or write.

create table public.uploads (
  id uuid primary key,
  install_id text not null,
  received_at timestamptz not null default now(),
  record_count integer not null check (record_count >= 0),
  bytes integer not null check (bytes >= 0),
  object_key text not null unique
);
create index uploads_received_at_idx on public.uploads (received_at);
create index uploads_install_id_idx on public.uploads (install_id);
alter table public.uploads enable row level security;

create table public.waitlist (
  email text not null,
  tool_slug text not null,
  created_at timestamptz not null default now(),
  primary key (email, tool_slug)
);
alter table public.waitlist enable row level security;
