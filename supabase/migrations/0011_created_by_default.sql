-- 0011_created_by_default.sql
-- Make created_by default to the authenticated user so inserts succeed under the
-- "auth.uid() = created_by" RLS check even when the client omits the column.
-- This removes the fragile dependency on the client stamping created_by itself.

alter table public.laporan_income alter column created_by set default auth.uid();
alter table public.pengeluaran    alter column created_by set default auth.uid();
alter table public.salah_cetak    alter column created_by set default auth.uid();
