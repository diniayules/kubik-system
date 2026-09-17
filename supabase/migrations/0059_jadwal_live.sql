-- =============================================================
-- 0059_jadwal_live.sql · Jadwal siaran langsung (RENCANA)
-- -------------------------------------------------------------
-- 0058 memberi live sebuah CATATAN (`sosmed_harian.live`): bukti bahwa
-- siaran itu terjadi. Yang masih hilang adalah RENCANA-nya — tidak ada
-- tempat yang bisa menjawab "minggu ini live hari apa, siapa?". Tanpa
-- itu "live 1x seminggu di sela jam sepi" cuma kalimat di kepala owner,
-- dan baru ketahuan meleset saat bulan sudah tutup.
--
-- Ditaruh sebagai kolom di `jadwal_shift`, bukan tabel sendiri, karena
-- live TIDAK BISA berdiri di luar shift: yang siaran adalah orang yang
-- sedang di studio. Menempelkannya ke baris roster membuat aturan itu
-- berlaku dengan sendirinya — tidak ada live tanpa orang yang bertugas,
-- dan menghapus shift ikut menghapus rencana live-nya.
--
-- Pembagian kerjanya jadi sejajar dengan pasangan yang sudah ada di
-- aplikasi ini:
--   jadwal_shift (rencana)  ↔  absen (realisasi)
--   jadwal_shift.live       ↔  sosmed_harian.live
--
-- Hak akses ikut kebijakan 0044 yang sudah ada: semua yang login boleh
-- MEMBACA (operator memang perlu tahu giliran live-nya), hanya pengelola
-- yang boleh MENULIS. Tidak ada policy baru yang perlu dibuat.
-- =============================================================

alter table public.jadwal_shift
  add column if not exists live boolean not null default false;
