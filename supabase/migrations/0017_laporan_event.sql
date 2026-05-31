-- 0017_laporan_event.sql
-- Tab "Event" (Photobooth & Photo Game) — laporan berdiri sendiri, terpisah
-- penuh dari laporan_income (Photo Studio). Tidak menyentuh stok atau gaji.
--
-- Tiap laporan punya `tipe`:
--   'jam'     -> sewa per jam: jam × tarif_per_jam, dikurangi biaya
--                (kertas/tinta/listrik) + upah operator = laba.
--   'voucher' -> jumlah voucher & cetak × harga snapshot.

create table if not exists public.laporan_event (
  id             uuid primary key default gen_random_uuid(),
  tanggal        date not null,
  kategori       text not null check (kategori in ('photobooth','game')),
  tipe           text not null check (tipe in ('jam','voucher')),
  keterangan     text not null default '',
  -- mode 'jam'
  jam            numeric,
  tarif_per_jam  int,
  biaya_kertas   int,
  biaya_tinta    int,
  biaya_listrik  int,
  upah_operator  int,
  -- mode 'voucher'
  voucher        int,
  cetak          int,
  harga_voucher  int,
  harga_cetak    int,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists laporan_event_tanggal_idx
  on public.laporan_event (tanggal desc);

create trigger laporan_event_touch_updated_at before update on public.laporan_event
  for each row execute function public.touch_updated_at();

-- RLS: mirror laporan_income (semua user login boleh CRUD; created_by pada insert).
alter table public.laporan_event enable row level security;

create policy "Semua login lihat laporan event"
  on public.laporan_event for select
  using (auth.role() = 'authenticated');
create policy "Login input laporan event"
  on public.laporan_event for insert
  with check (auth.uid() = created_by);
create policy "Login update laporan event"
  on public.laporan_event for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Login hapus laporan event"
  on public.laporan_event for delete
  using (auth.role() = 'authenticated');

-- Harga tetap per kategori event (mode voucher + default tarif/jam).
alter table public.app_config
  add column if not exists event_config jsonb;

-- Bersihkan sisa percobaan "sub-tab income" yang dibatalkan: kembalikan
-- laporan_income ke skema asli (satu laporan unik per tanggal).
drop index if exists public.laporan_income_tanggal_kategori_key;
alter table public.laporan_income drop column if exists kategori;
alter table public.app_config drop column if exists income_kategori;
alter table public.laporan_income
  add constraint laporan_income_tanggal_key unique (tanggal);
