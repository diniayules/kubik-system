-- =============================================================
-- 0052_laporan_harian.sql · Laporan closing harian manajer
-- -------------------------------------------------------------
-- Lubang yang tersisa: seluruh dashboard ini hanya tahu apa yang
-- SEMPAT MASUK sistem. Printer macet lalu dibereskan dengan head
-- cleaning, pelanggan komplain lalu diredakan, operator saling
-- tukar shift dadakan — semua itu pekerjaan manajer yang tidak
-- meninggalkan satu baris pun di tabel mana pun, padahal justru
-- itulah bukti "trouble diatasi tanpa lari ke owner".
--
-- Satu baris per tanggal, ditulis manajer setelah closing:
--
--   status  — 'aman'     : tidak ada kejadian di luar kebiasaan
--             'kendala'  : ada masalah, SUDAH diselesaikan sendiri
--             'eskalasi' : masih perlu keputusan owner
--   catatan — ceritanya, bebas.
--
-- Kenapa ada `status` dan bukan teks bebas saja: tanpa itu owner
-- harus membaca 30 paragraf untuk tahu bulan ini tenang atau gaduh,
-- dan hari 'eskalasi' tidak bisa dihitung. Dengan status, sebulan
-- bisa dipindai sekali lihat dan 'eskalasi' menyambung ke KPI
-- kemandirian yang sudah ada (`eskalasi_owner`, migration 0048).
--
-- Bentuknya meniru `sosmed_harian` (0046): tabel sendiri berkunci
-- `tanggal`, bukan JSON di `app_config` — isinya teks panjang yang
-- tumbuh tiap hari, jadi tidak pantas ikut terbawa di setiap
-- pembacaan konfigurasi.
-- =============================================================

create table if not exists public.laporan_harian (
  tanggal    date primary key,
  status     text not null default 'aman'
               check (status in ('aman', 'kendala', 'eskalasi')),
  catatan    text not null default '',
  -- Penulisnya, untuk hari yang ditutup owner sendiri.
  oleh       uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists laporan_harian_touch on public.laporan_harian;
create trigger laporan_harian_touch before update on public.laporan_harian
  for each row execute function public.touch_updated_at();

alter table public.laporan_harian enable row level security;

-- Beda dari `sosmed_harian` yang boleh dibaca semua: laporan ini sering
-- menyebut nama operator dan cara sebuah masalah ditangani. Itu percakapan
-- antara manajer dan owner, jadi baca & tulis sama-sama dikunci pengelola.
drop policy if exists "Pengelola kelola laporan harian" on public.laporan_harian;
create policy "Pengelola kelola laporan harian"
  on public.laporan_harian for all
  using (public.is_admin())
  with check (public.is_admin());
