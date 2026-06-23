create table if not exists public.founder_capture_messages (
  id uuid primary key default gen_random_uuid(),
  actor text not null check (actor in ('wendy', 'partner')),
  role text not null check (role in ('user', 'assistant')),
  text text not null default '',
  intent_kind text,
  status text not null default 'processed' check (status in ('pending', 'processed', 'failed')),
  response_text text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.founder_capture_assets (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.founder_capture_messages(id) on delete set null,
  source_type text not null check (source_type in ('image', 'file', 'link')),
  original_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  storage_path text,
  summary text,
  created_at timestamptz not null default now()
);

alter table public.founder_capture_messages enable row level security;
alter table public.founder_capture_assets enable row level security;

drop policy if exists "Founder capture messages readable" on public.founder_capture_messages;
create policy "Founder capture messages readable"
on public.founder_capture_messages
for select
to anon, authenticated
using (true);

drop policy if exists "Founder capture assets readable" on public.founder_capture_assets;
create policy "Founder capture assets readable"
on public.founder_capture_assets
for select
to anon, authenticated
using (true);

drop policy if exists "Founder capture messages service writes" on public.founder_capture_messages;
create policy "Founder capture messages service writes"
on public.founder_capture_messages
for all
to service_role
using (true)
with check (true);

drop policy if exists "Founder capture assets service writes" on public.founder_capture_assets;
create policy "Founder capture assets service writes"
on public.founder_capture_assets
for all
to service_role
using (true)
with check (true);

grant select on public.founder_capture_messages to anon, authenticated;
grant select, insert, update, delete on public.founder_capture_messages to service_role;
grant select on public.founder_capture_assets to anon, authenticated;
grant select, insert, update, delete on public.founder_capture_assets to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('founder-captures', 'founder-captures', false, 10485760)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Founder capture storage service writes" on storage.objects;
create policy "Founder capture storage service writes"
on storage.objects
for all
to service_role
using (bucket_id = 'founder-captures')
with check (bucket_id = 'founder-captures');
