-- =============================================================
-- 0066 — Tanggal tayang untuk kartu yang dicatat susulan
--
-- Masalah: konten sering sudah tayang, baru kemudian kartunya dibuat di
-- papan. Stempel 0046 mengisi `selesai_pada` dengan HARI KARTU DIBUAT,
-- jadi konten yang tayang tepat jadwal tercatat "telat" — dan bonusnya
-- bisa jatuh ke bulan yang salah (bonus membaca `selesai_pada`).
--
-- Keputusan: pengelola (is_admin) boleh menyebut tanggal tayang saat
-- kartu masuk / berada di tahap 'selesai', asal tidak melewati hari ini.
-- Operator tetap tidak bisa — bagi mereka tanggalnya selalu stempel
-- server, jadi "tepat waktu" tidak bisa dikarang dari layar. Bukti
-- tayangnya adalah tautan unggahan yang di-ACC pengelola.
--
-- Terlambat MENCATAT tidak lagi dihukum sebagai terlambat TAYANG; ia
-- tetap terlihat di layar sebagai "dicatat susulan" (created_at > tanggal
-- tayang) tanpa kolom tambahan.
--
-- Sekalian: "hari ini" kini dihitung di Asia/Jakarta, bukan UTC — kartu
-- yang ditutup pukul 00.00–07.00 WIB sebelumnya terstempel kemarin.
-- =============================================================

create or replace function public.stamp_promo_selesai()
returns trigger as $$
declare
  hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  boleh_isi boolean := public.is_admin()
                       and new.selesai_pada is not null
                       and new.selesai_pada <= hari_ini;
begin
  if new.tahap <> 'selesai' then
    new.selesai_pada := null;
  elsif tg_op = 'INSERT' or old.tahap is distinct from 'selesai' then
    -- Baru masuk 'selesai': tanggal tayang dari pengelola, atau hari ini.
    if not boleh_isi then
      new.selesai_pada := hari_ini;
    end if;
  elsif not boleh_isi then
    -- Sudah 'selesai' sebelumnya: hanya pengelola yang boleh mengoreksi.
    new.selesai_pada := old.selesai_pada;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.stamp_promo_selesai() from public, anon, authenticated;
