-- 0030_penyesuaian_uang_kecil.sql
-- Buku kas "uang kecil" (float/kembalian di laci): laci kasir TIDAK mulai dari
-- kosong tiap hari — ada kembalian kecil yang nyangkut dari laporan sebelumnya.
-- Tabel ini mencatat tiap penyesuaian uang kecil di luar penjualan:
--   * tipe 'tambah' : admin/kasir MENAMBAH uang kecil ke laci (tukar pecahan).
--   * tipe 'pakai'  : uang kecil DIPAKAI keluar dari laci (belanja, dll).
-- Sehingga rantai float antar hari transparan & rekonsiliasi tetap cocok:
--   (uang besar + uang kecil) − tunai = uang kecil kemarin + Σtambah − Σpakai
-- Tiap baris jumlah > 0; menghapus baris mengembalikan float. Akses login-level
-- (admin & karyawan/kasir) — kasir yang memegang laci. Pola sama seperti
-- penarikan_uang_besar setelah dilonggarkan (lihat 0028 & 0029).
create table if not exists public.penyesuaian_uang_kecil (
  id          uuid primary key default gen_random_uuid(),
  tanggal     date not null,
  tipe        text not null check (tipe in ('tambah', 'pakai')),
  jumlah      int  not null check (jumlah > 0),
  catatan     text not null default '',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists penyesuaian_uang_kecil_tanggal_idx
  on public.penyesuaian_uang_kecil (tanggal desc);

alter table public.penyesuaian_uang_kecil enable row level security;

create policy "Login lihat penyesuaian uang kecil"
  on public.penyesuaian_uang_kecil for select
  using (auth.role() = 'authenticated');

create policy "Login catat penyesuaian uang kecil"
  on public.penyesuaian_uang_kecil for insert
  with check (auth.role() = 'authenticated');

create policy "Login hapus penyesuaian uang kecil"
  on public.penyesuaian_uang_kecil for delete
  using (auth.role() = 'authenticated');
