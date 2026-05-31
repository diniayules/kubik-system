-- =============================================================
-- 0001_init.sql · Kubik Photobox Studio · skema awal
-- =============================================================

-- Pastikan extension gen_random_uuid() tersedia
create extension if not exists "pgcrypto";

-- ---------- profiles ----------
-- Setiap auth.users punya profile dengan role + metadata karyawan
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  nama          text not null default '',
  role          text not null default 'karyawan' check (role in ('admin','karyawan')),
  jabatan       text not null default '',
  pin_hash      text,                                 -- PIN cepat untuk clock-in di kiosk
  avatar_color  int  not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Trigger: auto-create profile saat user baru daftar. User pertama → admin.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_role text;
begin
  if (select count(*) from public.profiles) = 0 then
    v_role := 'admin';
  else
    v_role := 'karyawan';
  end if;

  insert into public.profiles (id, email, nama, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nama', split_part(new.email, '@', 1)),
    v_role
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- absen_records ----------
create table public.absen_records (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,
  tanggal      date not null,
  shift        text not null check (shift in ('pagi','sore','full')),
  events       jsonb not null default '[]',
  updated_at   timestamptz not null default now(),
  unique (employee_id, tanggal)
);
create index absen_records_employee_idx on public.absen_records (employee_id);
create index absen_records_tanggal_idx on public.absen_records (tanggal);

-- ---------- laporan_income ----------
create table public.laporan_income (
  id            uuid primary key default gen_random_uuid(),
  tanggal       date not null unique,
  items         jsonb not null default '[]',
  upgrades      jsonb not null default '[]',
  keterangan    text not null default '',
  harga_tiket   jsonb not null,
  harga_cetak   int not null,
  harga_upgrade jsonb not null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index laporan_income_tanggal_idx on public.laporan_income (tanggal desc);

-- ---------- pengeluaran ----------
create table public.pengeluaran (
  id          uuid primary key default gen_random_uuid(),
  tanggal     date not null,
  kategori    text not null default 'Lainnya',
  deskripsi   text not null default '',
  jumlah      int not null check (jumlah >= 0),
  catatan     text not null default '',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index pengeluaran_tanggal_idx on public.pengeluaran (tanggal desc);

-- ---------- inventaris ----------
create table public.stok_kertas (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null,
  stok        int not null default 0 check (stok >= 0),
  updated_at  timestamptz not null default now()
);

create table public.stok_tinta (
  warna   text primary key check (warna in ('BK','LC','M','C','Y','LM')),
  stok    int not null default 0 check (stok >= 0),
  catatan text not null default ''
);

create table public.stok_amplop (
  id    int primary key default 1 check (id = 1),
  stok  int not null default 0 check (stok >= 0)
);

create table public.salah_cetak (
  id          uuid primary key default gen_random_uuid(),
  tanggal     date not null,
  kertas_id   uuid references public.stok_kertas(id) on delete set null,
  jumlah      int not null check (jumlah > 0),
  alasan      text not null default '',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index salah_cetak_tanggal_idx on public.salah_cetak (tanggal desc);

-- ---------- app_config (singleton) ----------
create table public.app_config (
  id            int primary key default 1 check (id = 1),
  harga_tiket   jsonb not null default '{"photobooth":35000,"photobox":35000,"photo-game":25000}',
  harga_cetak   int not null default 10000,
  harga_upgrade jsonb not null default '{"poster":20000,"crack-n-share":2000}',
  brand_kicker  text,
  brand_name    text,
  dash_judul    text,
  dash_sub      text,
  header_judul  text,
  header_sub    text,
  updated_at    timestamptz not null default now()
);

-- ---------- updated_at trigger helper ----------
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger absen_records_touch_updated_at before update on public.absen_records
  for each row execute function public.touch_updated_at();
create trigger laporan_income_touch_updated_at before update on public.laporan_income
  for each row execute function public.touch_updated_at();
create trigger stok_kertas_touch_updated_at before update on public.stok_kertas
  for each row execute function public.touch_updated_at();
create trigger app_config_touch_updated_at before update on public.app_config
  for each row execute function public.touch_updated_at();
