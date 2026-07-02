-- 0040_opening_checklist.sql
-- Fitur "checklist pagi": SETELAH absen pagi (clock in), karyawan diberi daftar
-- tugas persiapan buka (mis. menyalakan lampu & AC, menyapu, cek stok kertas,
-- buka pintu). BEDA dengan closing checklist — checklist pagi TIDAK memblokir:
-- jam masuk tetap tercatat walau tugas belum dicentang. Modal muncul sebagai
-- pengingat, dan bukti centang disimpan sebagai audit trail bila diisi.
--
-- Dua kolom additive (pola sama seperti closing checklist di 0033):
--  1. app_config.opening_checklist  = DAFTAR task yang dikonfigurasi admin.
--     Bentuk: [{ "id": "...", "label": "Menyalakan lampu studio", "shifts": [...] }, ...]
--  2. absen_records.checklist_masuk  = BUKTI task yang dicentang setelah clock in
--     (audit trail per hari). Bentuk:
--     [{ "id": "...", "label": "...", "waktu": "<ISO>" }, ...]
--
-- Aman & additive: default '[]' / null supaya baris lama tetap valid dan app
-- versi lama tidak terpengaruh.

alter table public.app_config
  add column if not exists opening_checklist jsonb not null default '[]'::jsonb;

alter table public.absen_records
  add column if not exists checklist_masuk jsonb;
