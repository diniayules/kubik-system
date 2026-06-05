-- 0029_penarikan_uang_besar_karyawan.sql
-- Buka akses "buku kas uang besar" untuk karyawan (kasir), bukan admin saja.
-- Kasir yang memegang laci-lah yang menyetor uang besar ke admin, jadi mereka
-- perlu MELIHAT saldo (agar perhitungan Σmasuk − Σambil benar) dan MENCATAT
-- pengambilan/ setoran. Pola sama seperti laporan_income & pengeluaran yang
-- sudah dilonggarkan untuk semua user login (lihat 0006 & allow_karyawan_*).
--   * select : semua user login (kalau admin-only, saldo karyawan kelebihan)
--   * insert : semua user login (created_by = dirinya)
--   * delete : semua user login (boleh membatalkan entri yang salah)
-- update tetap tidak diperlukan (entri bersifat tambah/hapus).

drop policy if exists "Admin saja lihat penarikan uang besar"
  on public.penarikan_uang_besar;
drop policy if exists "Admin manage penarikan uang besar"
  on public.penarikan_uang_besar;

create policy "Login lihat penarikan uang besar"
  on public.penarikan_uang_besar for select
  using (auth.role() = 'authenticated');

create policy "Login catat penarikan uang besar"
  on public.penarikan_uang_besar for insert
  with check (auth.role() = 'authenticated');

create policy "Login hapus penarikan uang besar"
  on public.penarikan_uang_besar for delete
  using (auth.role() = 'authenticated');
