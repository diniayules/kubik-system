-- =============================================================
-- 0002_rls.sql · Row-Level Security policies
-- Permission matrix:
--   ADMIN: full read + write semua tabel
--   KARYAWAN: read semua karyawan + absen + inventaris,
--             write absen sendiri saja,
--             input laporan_income baru (admin yang edit/hapus),
--             read app_config,
--             TIDAK lihat pengeluaran sama sekali.
-- =============================================================

-- Helper: is_admin()
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ---------- profiles ----------
alter table public.profiles enable row level security;

create policy "Profile dibaca semua user login"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "User update profile sendiri"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

create policy "Admin manage semua profile"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- absen_records ----------
alter table public.absen_records enable row level security;

create policy "Karyawan lihat semua absen"
  on public.absen_records for select
  using (auth.role() = 'authenticated');

create policy "Karyawan catat absen sendiri"
  on public.absen_records for insert
  with check (auth.uid() = employee_id);

create policy "Karyawan update absen sendiri"
  on public.absen_records for update
  using (auth.uid() = employee_id)
  with check (auth.uid() = employee_id);

create policy "Admin manage semua absen"
  on public.absen_records for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- laporan_income ----------
alter table public.laporan_income enable row level security;

create policy "Semua login lihat laporan income"
  on public.laporan_income for select
  using (auth.role() = 'authenticated');

create policy "Karyawan boleh input laporan"
  on public.laporan_income for insert
  with check (auth.uid() = created_by);

create policy "Admin update/hapus laporan"
  on public.laporan_income for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin hapus laporan"
  on public.laporan_income for delete
  using (public.is_admin());

-- ---------- pengeluaran (admin-only end-to-end) ----------
alter table public.pengeluaran enable row level security;

create policy "Admin saja yang lihat pengeluaran"
  on public.pengeluaran for select
  using (public.is_admin());

create policy "Admin manage pengeluaran"
  on public.pengeluaran for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- inventaris: karyawan read-only, admin manage ----------
alter table public.stok_kertas enable row level security;
create policy "Semua login lihat stok kertas"
  on public.stok_kertas for select
  using (auth.role() = 'authenticated');
create policy "Admin manage stok kertas"
  on public.stok_kertas for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.stok_tinta enable row level security;
create policy "Semua login lihat stok tinta"
  on public.stok_tinta for select
  using (auth.role() = 'authenticated');
create policy "Admin manage stok tinta"
  on public.stok_tinta for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.stok_amplop enable row level security;
create policy "Semua login lihat stok amplop"
  on public.stok_amplop for select
  using (auth.role() = 'authenticated');
create policy "Admin manage stok amplop"
  on public.stok_amplop for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.salah_cetak enable row level security;
create policy "Semua login lihat salah cetak"
  on public.salah_cetak for select
  using (auth.role() = 'authenticated');
create policy "Admin manage salah cetak"
  on public.salah_cetak for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- app_config ----------
alter table public.app_config enable row level security;
create policy "Semua login lihat app_config"
  on public.app_config for select
  using (auth.role() = 'authenticated');
create policy "Admin update app_config"
  on public.app_config for update
  using (public.is_admin()) with check (public.is_admin());
create policy "Admin insert app_config"
  on public.app_config for insert
  with check (public.is_admin());
