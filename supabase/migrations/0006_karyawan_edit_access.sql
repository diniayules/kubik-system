-- =============================================================
-- 0006_karyawan_edit_access.sql
-- Loosen RLS so karyawan can EDIT operational data:
--   * laporan_income: update + delete (was admin-only)
--   * inventaris (stok_*, salah_cetak): full write (was admin-only)
--   * profiles: edit anyone's data (e.g. nama) — but role/active are
--     protected from non-admins by a trigger (anti privilege-escalation).
-- Money figures are hidden from karyawan in the UI only (Laporan Income).
-- =============================================================

-- ---- laporan_income ----
drop policy if exists "Admin update/hapus laporan" on public.laporan_income;
drop policy if exists "Admin hapus laporan" on public.laporan_income;
create policy "Login update laporan" on public.laporan_income
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Login hapus laporan" on public.laporan_income
  for delete using (auth.role() = 'authenticated');

-- ---- inventaris ----
drop policy if exists "Admin manage stok kertas" on public.stok_kertas;
create policy "Login manage stok kertas" on public.stok_kertas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Admin manage stok tinta" on public.stok_tinta;
create policy "Login manage stok tinta" on public.stok_tinta
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Admin manage stok amplop" on public.stok_amplop;
create policy "Login manage stok amplop" on public.stok_amplop
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Admin manage salah cetak" on public.salah_cetak;
create policy "Login manage salah cetak" on public.salah_cetak
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---- profiles: anyone logged in can edit profile data ----
create policy "Login edit profil" on public.profiles
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ...but non-admins cannot change role or active (privilege escalation guard).
create or replace function public.protect_profile_privileges()
returns trigger as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.active := old.active;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_privileges();
