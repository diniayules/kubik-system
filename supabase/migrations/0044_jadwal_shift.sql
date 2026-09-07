-- =============================================================
-- 0044_jadwal_shift.sql · Roster shift (jadwal RENCANA)
-- -------------------------------------------------------------
-- Sebelum ini shift hanya TERCATAT saat karyawan absen — jadi sistem
-- tidak pernah tahu siapa yang SEHARUSNYA masuk besok. Akibatnya
-- pertanyaan paling dasar seorang manajer ("Sabtu depan sudah ada
-- operator belum?") tidak bisa dijawab aplikasi, dan KPI "100% shift
-- ter-cover" tidak punya sumber data.
--
-- Tabel ini adalah RENCANA, terpisah dari `absen` yang adalah REALISASI.
-- Keduanya sengaja memakai kosakata `shift` yang sama (DayType di
-- types.ts) supaya rencana vs realisasi bisa dibandingkan langsung —
-- itulah yang memunculkan "masuk tidak sesuai jadwal".
--
-- Kunci primer (tanggal, employee_id): satu orang satu baris per hari.
-- Menugaskan ulang = upsert, bukan menumpuk baris.
-- =============================================================

create table if not exists public.jadwal_shift (
  tanggal     date not null,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  shift       text not null
                check (shift in ('pagi','sore','full','cuti','libur','bersih')),
  catatan     text not null default '',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tanggal, employee_id)
);

-- Dashboard & layar jadwal selalu memfilter per rentang tanggal.
create index if not exists jadwal_shift_tanggal_idx
  on public.jadwal_shift (tanggal);

-- Sentuh updated_at otomatis (fungsi dari 0001_init.sql).
drop trigger if exists jadwal_shift_touch on public.jadwal_shift;
create trigger jadwal_shift_touch before update on public.jadwal_shift
  for each row execute function public.touch_updated_at();

alter table public.jadwal_shift enable row level security;

-- SELECT: semua user login. Karyawan MEMANG perlu melihat jadwalnya —
-- itu gunanya roster; menyembunyikannya justru mengalahkan tujuannya.
create policy "Jadwal dibaca semua"
  on public.jadwal_shift for select
  using (auth.uid() is not null);

-- Menyusun jadwal adalah wewenang pengelola (owner & manajer) — inilah
-- tugas inti manajer operasional, jadi manajer sengaja ikut punya akses
-- tulis lewat is_admin().
create policy "Pengelola kelola jadwal"
  on public.jadwal_shift for all
  using (public.is_admin())
  with check (public.is_admin());
