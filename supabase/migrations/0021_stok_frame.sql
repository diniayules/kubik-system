-- 0021_stok_frame.sql
-- Stok frame foto: persis seperti stok_kertas (beberapa jenis bernama, tiap
-- jenis punya stok sendiri). Berkurang otomatis saat produk dengan NAMA yang
-- sama terjual di laporan income (pencocokan lewat nama di sisi aplikasi, sama
-- seperti upgrade -> kertas). Idempotent, aman dijalankan ulang.

create table if not exists public.stok_frame (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null,
  stok        int not null default 0 check (stok >= 0),
  updated_at  timestamptz not null default now()
);

-- updated_at trigger (helper public.touch_updated_at sudah ada dari 0001).
drop trigger if exists stok_frame_touch_updated_at on public.stok_frame;
create trigger stok_frame_touch_updated_at before update on public.stok_frame
  for each row execute function public.touch_updated_at();

-- RLS: semua user login bisa baca; admin & karyawan bisa kelola (selaras dengan
-- stok_kertas setelah 0006_karyawan_edit_access.sql).
alter table public.stok_frame enable row level security;

drop policy if exists "Semua login lihat stok frame" on public.stok_frame;
create policy "Semua login lihat stok frame"
  on public.stok_frame for select
  using (auth.role() = 'authenticated');

drop policy if exists "Login manage stok frame" on public.stok_frame;
create policy "Login manage stok frame"
  on public.stok_frame for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
