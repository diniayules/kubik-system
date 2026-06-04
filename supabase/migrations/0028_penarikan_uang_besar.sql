-- 0028_penarikan_uang_besar.sql
-- Buku kas "uang besar": total uang besar yang menumpuk di laci dihitung otomatis
--   Total uang besar saat ini = Σ(laporan_income.uang_besar) − Σ(penarikan.jumlah)
-- Tabel ini mencatat tiap kali admin MENGAMBIL / menyetor uang besar ke admin
-- (mengurangi saldo). Bisa sebagian atau "ambil semua" (reset ke 0). Tiap baris
-- jumlah > 0; menghapus baris mengembalikan saldo. Admin-only end-to-end
-- (pola sama seperti tabel `pengeluaran`).
create table if not exists public.penarikan_uang_besar (
  id          uuid primary key default gen_random_uuid(),
  tanggal     date not null,
  jumlah      int  not null check (jumlah > 0),
  catatan     text not null default '',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists penarikan_uang_besar_tanggal_idx
  on public.penarikan_uang_besar (tanggal desc);

alter table public.penarikan_uang_besar enable row level security;

create policy "Admin saja lihat penarikan uang besar"
  on public.penarikan_uang_besar for select
  using (public.is_admin());

create policy "Admin manage penarikan uang besar"
  on public.penarikan_uang_besar for all
  using (public.is_admin())
  with check (public.is_admin());
