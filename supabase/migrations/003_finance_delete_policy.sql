drop policy if exists finance_entries_delete on public.finance_entries;
create policy finance_entries_delete
on public.finance_entries
for delete
to anon, authenticated
using (true);

grant delete on public.finance_entries to anon, authenticated;
