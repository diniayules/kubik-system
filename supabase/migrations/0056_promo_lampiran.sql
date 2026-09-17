-- =============================================================
-- 0056_promo_lampiran.sql · Satu kartu promo boleh punya banyak desain
-- -------------------------------------------------------------
-- Kolom `desain` (0039) hanya menampung SATU gambar, padahal satu campaign
-- biasanya butuh beberapa: feed, story, dan varian ukuran lain. Desain besar
-- (file .ai/.psd, folder Canva/Drive) juga tidak masuk akal ditempel sebagai
-- data URL — yang dibutuhkan hanya tautannya.
--
-- `desain_list`   : gambar (data URL JPEG, urut tampil)
-- `desain_tautan` : tautan eksternal (Google Drive, Canva, dll)
--
-- Keduanya jsonb array berisi OBJEK, bukan string telanjang:
--   { "nilai": "<data URL | https://...>",
--     "oleh":  "<profiles.id pengunggah | null>",
--     "status":"menunggu" | "disetujui" }
--
-- Bentuk objek dipakai karena operator boleh melampirkan desain ke kartu mana
-- pun yang ia lihat, tapi lampiran itu baru tayang setelah owner/manajer
-- menyetujuinya — jadi status melekat pada LAMPIRAN, bukan pada kartu
-- (kartunya sendiri sudah `disetujui`). Aturannya di 0057.
--
-- `desain` DIPERTAHANKAN dan tetap diisi gambar pertama yang disetujui supaya
-- data lama terbaca dan app versi lama (atau tab yang belum di-reload) tidak
-- kosong. Aplikasi membaca `desain_list` lebih dulu, lalu jatuh ke `desain`.
--
-- Visibilitas baris tetap mengikuti RLS promo (0035) — lampiran kartu draft
-- ikut tersembunyi dari karyawan tanpa aturan tambahan.
-- =============================================================

alter table public.promo_programs
  add column if not exists desain_list jsonb not null default '[]'::jsonb,
  add column if not exists desain_tautan jsonb not null default '[]'::jsonb;

-- Isi awal dari kolom lama. Desain lama hanya bisa diunggah admin, jadi ia
-- masuk sebagai entri yang SUDAH disetujui — bukan tiba-tiba jadi antrean ACC.
update public.promo_programs
   set desain_list = jsonb_build_array(
         jsonb_build_object('nilai', desain, 'oleh', created_by, 'status', 'disetujui')
       )
 where desain is not null
   and (desain_list is null or jsonb_array_length(desain_list) = 0);

-- Naikkan entri berbentuk string (revisi pertama kolom ini, sebelum status
-- lampiran ada) ke bentuk objek. Idempoten: baris yang sudah objek dilewati.
update public.promo_programs p
   set desain_list = (
         select jsonb_agg(
                  case when jsonb_typeof(e) = 'string'
                       then jsonb_build_object('nilai', e #>> '{}', 'oleh', null, 'status', 'disetujui')
                       else e end
                )
           from jsonb_array_elements(p.desain_list) e
       )
 where exists (
         select 1 from jsonb_array_elements(p.desain_list) e
          where jsonb_typeof(e) = 'string'
       );

update public.promo_programs p
   set desain_tautan = (
         select jsonb_agg(
                  case when jsonb_typeof(e) = 'string'
                       then jsonb_build_object('nilai', e #>> '{}', 'oleh', null, 'status', 'disetujui')
                       else e end
                )
           from jsonb_array_elements(p.desain_tautan) e
       )
 where exists (
         select 1 from jsonb_array_elements(p.desain_tautan) e
          where jsonb_typeof(e) = 'string'
       );
