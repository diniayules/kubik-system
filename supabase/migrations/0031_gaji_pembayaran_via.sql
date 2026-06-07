-- 0031_gaji_pembayaran_via.sql
-- Metode pembayaran per slip gaji ("Pembayaran via:"), satu baris per
-- (karyawan, periode YYYY-MM). Dipisah dari app_config karena KARYAWAN ikut
-- mengisi field ini di slip mereka sendiri, sedangkan app_config hanya boleh
-- ditulis admin (lihat 0002_rls). Disimpan per periode supaya mengganti metode
-- bulan ini tidak mengubah slip bulan-bulan sebelumnya.
create table if not exists public.gaji_pembayaran_via (
  employee_id uuid not null references public.profiles(id) on delete cascade,
  periode     text not null,            -- 'YYYY-MM'
  metode      text not null,
  updated_at  timestamptz not null default now(),
  primary key (employee_id, periode)
);

alter table public.gaji_pembayaran_via enable row level security;

-- Semua user login boleh membaca (admin lihat semua slip; karyawan lihat
-- miliknya — UI yang menyaring per-orang).
create policy "Login lihat pembayaran via"
  on public.gaji_pembayaran_via for select
  using (auth.role() = 'authenticated');

-- Tulis: karyawan hanya untuk slip MILIKNYA sendiri; admin untuk siapa pun.
create policy "Karyawan/admin isi pembayaran via"
  on public.gaji_pembayaran_via for insert
  with check (auth.uid() = employee_id or public.is_admin());

create policy "Karyawan/admin ubah pembayaran via"
  on public.gaji_pembayaran_via for update
  using (auth.uid() = employee_id or public.is_admin())
  with check (auth.uid() = employee_id or public.is_admin());

create policy "Karyawan/admin hapus pembayaran via"
  on public.gaji_pembayaran_via for delete
  using (auth.uid() = employee_id or public.is_admin());
