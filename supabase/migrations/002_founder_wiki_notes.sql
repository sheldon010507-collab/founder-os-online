create table if not exists public.founder_wiki_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'general',
  body text not null default '',
  tags text[] not null default '{}',
  created_by text not null check (created_by in ('wendy', 'partner')),
  updated_by text check (updated_by in ('wendy', 'partner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.founder_wiki_notes enable row level security;

drop policy if exists "Founder wiki notes readable" on public.founder_wiki_notes;
create policy "Founder wiki notes readable"
on public.founder_wiki_notes
for select
to anon, authenticated
using (true);

drop policy if exists "Founder wiki notes insertable" on public.founder_wiki_notes;
create policy "Founder wiki notes insertable"
on public.founder_wiki_notes
for insert
to anon, authenticated
with check (created_by in ('wendy', 'partner'));

drop policy if exists "Founder wiki notes editable" on public.founder_wiki_notes;
create policy "Founder wiki notes editable"
on public.founder_wiki_notes
for update
to anon, authenticated
using (true)
with check (coalesce(updated_by, created_by) in ('wendy', 'partner'));

drop policy if exists "Founder wiki notes service access" on public.founder_wiki_notes;
create policy "Founder wiki notes service access"
on public.founder_wiki_notes
for all
to service_role
using (true)
with check (true);

grant select, insert, update on public.founder_wiki_notes to anon, authenticated;
grant select, insert, update, delete on public.founder_wiki_notes to service_role;

create index if not exists founder_wiki_notes_updated_at_idx on public.founder_wiki_notes (updated_at desc);
create index if not exists founder_wiki_notes_category_idx on public.founder_wiki_notes (category);
