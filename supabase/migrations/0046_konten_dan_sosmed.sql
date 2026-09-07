-- =============================================================
-- 0046_konten_dan_sosmed.sql · PIC konten, deadline, & log sosmed
-- -------------------------------------------------------------
-- Dua lubang terakhir sebelum KPI marketing bisa dinilai:
--
-- 1. Papan Promosi sudah menampung IDE, tapi tidak tahu SIAPA yang
--    mengerjakan dan KAPAN harus selesai. Tanpa itu tidak ada dasar
--    untuk "campaign selesai tepat jadwal" maupun bonus marketing per
--    operator. Ditambahkan sebagai kolom pada tabel yang sudah ada —
--    bukan entitas baru — karena sebuah campaign memang kartu promosi
--    itu sendiri, hanya dengan penanggung jawab.
--
--    `selesai_pada` distempel trigger saat tahap berpindah ke 'selesai'.
--    Ini yang membuat "tepat waktu" bisa dinilai jujur: tanpa jejak
--    KAPAN sesuatu selesai, kartu yang dikerjakan telat tak terbedakan
--    dari yang tepat waktu.
--
-- 2. Sosial media harus aktif SETIAP HARI, jadi satuannya hari — bukan
--    kartu. Tabel `sosmed_harian` sengaja satu baris per tanggal
--    (bukan per unggahan) supaya pertanyaan KPI-nya ("hari ini sudah
--    posting belum?") terjawab satu lookup, dan bolong terlihat sebagai
--    tanggal yang hilang.
-- =============================================================

-- ---------- 1. PIC, deadline, jenis, & jejak penyelesaian ----------
alter table public.promo_programs
  add column if not exists pic          uuid references public.profiles(id) on delete set null,
  add column if not exists deadline     date,
  add column if not exists selesai_pada date,
  add column if not exists jenis        text not null default 'campaign'
                                          check (jenis in ('campaign','konten','promo'));

create index if not exists promo_programs_pic_idx
  on public.promo_programs (pic);

-- Stempel/hapus `selesai_pada` mengikuti perpindahan tahap. Dibuat di
-- database (bukan di client) supaya tanggalnya tidak bisa dikarang dari
-- layar — inilah satu-satunya bukti ketepatan waktu.
create or replace function public.stamp_promo_selesai()
returns trigger as $$
begin
  if new.tahap = 'selesai' and (old.tahap is distinct from 'selesai') then
    new.selesai_pada := current_date;
  elsif new.tahap <> 'selesai' then
    new.selesai_pada := null;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.stamp_promo_selesai() from public, anon, authenticated;

-- PENTING — urutan nama trigger menentukan urutan eksekusi (Postgres
-- menjalankan BEFORE trigger secara alfabetis):
--   promo_protect_status_*  →  promo_stamp_selesai  →  promo_touch
-- `promo_protect_status_*` (0035) memaksa tahap non-admin kembali ke 'ide',
-- jadi stempel di bawah HARUS berjalan setelahnya agar tidak menstempel
-- tahap yang sebentar lagi dibatalkan. Jangan ganti nama trigger ini tanpa
-- memeriksa ulang urutannya.
drop trigger if exists promo_stamp_selesai on public.promo_programs;
create trigger promo_stamp_selesai before insert or update on public.promo_programs
  for each row execute function public.stamp_promo_selesai();

-- ---------- 2. Log aktivitas sosial media harian ----------
create table if not exists public.sosmed_harian (
  tanggal    date primary key,
  posting    boolean not null default false,
  story      boolean not null default false,
  repost     boolean not null default false,
  engagement boolean not null default false,
  catatan    text not null default '',
  tautan     text not null default '',
  -- Operator yang mengerjakan hari itu — dasar bonus marketing.
  oleh       uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists sosmed_harian_touch on public.sosmed_harian;
create trigger sosmed_harian_touch before update on public.sosmed_harian
  for each row execute function public.touch_updated_at();

alter table public.sosmed_harian enable row level security;

-- SELECT: semua user login. Operator perlu melihat hari mana yang masih
-- kosong; menyembunyikannya justru menghambat pekerjaan yang dinilai.
drop policy if exists "Sosmed dibaca semua" on public.sosmed_harian;
create policy "Sosmed dibaca semua"
  on public.sosmed_harian for select
  using (auth.uid() is not null);

-- Mencatat aktivitas sosmed adalah tanggung jawab pengelola (owner &
-- manajer) — inilah KPI manajer, jadi bukan operator yang menilai dirinya.
drop policy if exists "Pengelola kelola sosmed" on public.sosmed_harian;
create policy "Pengelola kelola sosmed"
  on public.sosmed_harian for all
  using (public.is_admin())
  with check (public.is_admin());
