-- 0020_absen_extra_time.sql
-- Waktu ekstra berbayar per hari (diisi manual): datang lebih cepat untuk
-- backup rekan, atau meeting/evaluasi di luar jam kerja. Dibayar terpisah dari
-- lembur di slip gaji (extra_menit × tarif/menit). Aman & additive.
alter table public.absen_records
  add column if not exists extra_menit int not null default 0
    check (extra_menit >= 0);
alter table public.absen_records
  add column if not exists extra_catatan text;
