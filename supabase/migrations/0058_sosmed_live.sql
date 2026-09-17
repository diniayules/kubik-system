-- =============================================================
-- 0058_sosmed_live.sql · Catatan siaran langsung (live) harian
-- -------------------------------------------------------------
-- Bonus gaji pokok operator (800rb → 1jt) berdiri di atas tiga bukti:
-- story harian, konten bulanan, dan LIVE mingguan. Dua yang pertama
-- sudah punya tempat — `sosmed_harian.story` (0046) dan kartu Papan
-- Promosi berjenis 'konten' dengan `pic` + `selesai_pada`. Live belum
-- punya tempat sama sekali.
--
-- Ditaruh sebagai kolom di `sosmed_harian`, bukan tabel sendiri: live
-- adalah satu lagi aksi sosial media pada satu tanggal, persis seperti
-- posting/story/repost/engagement. Target "1x seminggu" dihitung dari
-- tanggal-tanggal ini di sisi aplikasi (lihat `src/bonusSosmed.ts`),
-- bukan disimpan sebagai baris mingguan — kalau minggunya ikut
-- disimpan, mengubah definisi minggu berarti menulis ulang data.
--
-- Hak akses ikut kebijakan yang sudah ada di 0046: hanya pengelola
-- (owner & manajer) yang boleh menulis ke `sosmed_harian`. Inilah yang
-- membuat bonus ini tidak bisa dicentang sendiri oleh yang dinilai.
-- =============================================================

alter table public.sosmed_harian
  add column if not exists live boolean not null default false;
