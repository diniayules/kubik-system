-- =============================================================
-- 0055_masalah_teknis.sql · Log kendala teknis studio
-- -------------------------------------------------------------
-- Tugas manajer nomor satu berbunyi "masalah teknis teratasi",
-- tapi sampai sekarang tidak ada satu pun tabel yang menyimpannya.
-- `laporan_harian` (0052) memang memuat ceritanya, tapi satu
-- paragraf per HARI: printer yang macet tiga hari berturut-turut
-- terbaca sebagai tiga kejadian terpisah, dan tidak ada cara tahu
-- kendala mana yang masih menggantung sekarang.
--
-- Tabel ini menyimpan MASALAH, bukan hari. Satu baris hidup sejak
-- dilaporkan sampai ditandai selesai, jadi dua pertanyaan yang
-- selama ini tidak terjawab jadi sekali query:
--
--   "apa yang masih rusak sekarang?"   → selesai_pada is null
--   "berapa lama biasanya dibereskan?" → selesai_pada - dilaporkan_pada
--
-- `tingkat` ada supaya antrean bisa diurutkan tanpa membaca satu
-- per satu — 'stop' berarti studio tidak bisa jualan, dan itu
-- harus naik ke puncak antrean di atas apa pun yang lain.
--
-- Beda dari `laporan_harian` yang dikunci pengelola: kendala
-- justru DILAPORKAN operator dari lantai, jadi karyawan boleh
-- membaca & menyisipkan. Yang dikunci pengelola hanya menandai
-- selesai dan menghapus — lihat kebijakan di bawah.
-- =============================================================

create table if not exists public.masalah_teknis (
  id               uuid primary key default gen_random_uuid(),
  judul            text not null,
  -- Kategori dipakai untuk melihat alat mana yang paling sering rewel.
  kategori         text not null default 'lain'
                     check (kategori in ('printer', 'kamera', 'jaringan', 'listrik', 'aplikasi', 'lain')),
  -- 'stop' = studio tidak bisa jualan; 'ganggu' = jalan tapi pincang;
  -- 'ringan' = mengganggu kenyamanan saja.
  tingkat          text not null default 'ganggu'
                     check (tingkat in ('stop', 'ganggu', 'ringan')),
  catatan          text not null default '',
  dilaporkan_oleh  uuid references public.profiles(id) on delete set null,
  dilaporkan_pada  timestamptz not null default now(),
  -- Null = masih terbuka. Inilah kolom yang menggerakkan antrean.
  selesai_pada     timestamptz,
  selesai_oleh     uuid references public.profiles(id) on delete set null,
  -- Apa yang akhirnya menyelesaikannya — supaya kejadian berikutnya
  -- tidak perlu didiagnosis dari nol.
  solusi           text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Antrean "yang masih terbuka" adalah pembacaan paling sering, dan
-- selalu diurutkan terbaru dulu.
create index if not exists masalah_teknis_terbuka_idx
  on public.masalah_teknis (dilaporkan_pada desc)
  where selesai_pada is null;

drop trigger if exists masalah_teknis_touch on public.masalah_teknis;
create trigger masalah_teknis_touch before update on public.masalah_teknis
  for each row execute function public.touch_updated_at();

alter table public.masalah_teknis enable row level security;

-- Semua yang login boleh melihat: operator shift berikutnya perlu tahu
-- printer mana yang sedang bermasalah sebelum ia membuka studio.
drop policy if exists "Semua baca masalah teknis" on public.masalah_teknis;
create policy "Semua baca masalah teknis"
  on public.masalah_teknis for select
  using (auth.uid() is not null);

-- Melapor adalah tugas siapa pun yang menemukan. `dilaporkan_oleh`
-- dipaksa ke dirinya sendiri untuk yang bukan pengelola supaya tidak
-- ada laporan atas nama orang lain.
drop policy if exists "Semua lapor masalah teknis" on public.masalah_teknis;
create policy "Semua lapor masalah teknis"
  on public.masalah_teknis for insert
  with check (
    auth.uid() is not null
    and (public.is_admin() or dilaporkan_oleh = auth.uid())
  );

-- Menandai selesai = keputusan, bukan laporan. Hanya pengelola, supaya
-- kendala tidak bisa ditutup sendiri oleh yang melaporkannya.
drop policy if exists "Pengelola tutup masalah teknis" on public.masalah_teknis;
create policy "Pengelola tutup masalah teknis"
  on public.masalah_teknis for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Pengelola hapus masalah teknis" on public.masalah_teknis;
create policy "Pengelola hapus masalah teknis"
  on public.masalah_teknis for delete
  using (public.is_admin());
