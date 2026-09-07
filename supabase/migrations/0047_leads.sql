-- =============================================================
-- 0047_leads.sql · Pipeline leads & sales event
-- -------------------------------------------------------------
-- `laporan_event` hanya mencatat event yang SUDAH terjadi. Tidak ada
-- tempat untuk calon klien yang sedang dikejar, padahal justru di
-- situlah pekerjaan sales manajer berada: mencari, menghubungi,
-- follow-up, sampai closing. Tanpa tabel ini, KPI "leads baru per
-- bulan" dan "closing per bulan" tak punya sumber, dan tidak ada dasar
-- menghitung bonus event.
--
-- Dua tabel, karena keduanya menjawab pertanyaan berbeda:
--   leads          — keadaan TERKINI satu calon klien (satu baris/lead)
--   leads_followup — RIWAYAT setiap kali dia dihubungi (banyak baris)
-- Menggabungkannya jadi satu kolom catatan akan menghilangkan jawaban
-- atas "kapan terakhir di-follow-up?", yang justru penanda lead basi.
--
-- `tanggal_closing` distempel trigger, mengikuti pola `selesai_pada` di
-- migration 0046: tanggal keberhasilan tidak boleh bisa dikarang dari
-- layar karena ia dasar perhitungan bonus.
-- =============================================================

create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  -- Nama calon klien / instansi (mis. "SMA 3 Bandung", "PT Anu").
  nama            text not null default '',
  kontak          text not null default '',
  -- Dari mana lead ini datang (DM Instagram, walk-in, referral, ...).
  sumber          text not null default '',
  kategori        text not null default 'lainnya'
                    check (kategori in ('play','photobooth','sekolah','kampus',
                                        'komunitas','perusahaan','lainnya')),
  tahap           text not null default 'baru'
                    check (tahap in ('baru','dihubungi','followup','negosiasi',
                                     'closing','gagal')),
  -- Perkiraan nilai saat masih dikejar; realisasi diisi setelah closing.
  nilai_estimasi  numeric not null default 0,
  nilai_realisasi numeric not null default 0,
  pic             uuid references public.profiles(id) on delete set null,
  tanggal_masuk   date not null default current_date,
  tanggal_closing date,
  alasan_gagal    text not null default '',
  catatan         text not null default '',
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists leads_tahap_idx on public.leads (tahap);
create index if not exists leads_pic_idx   on public.leads (pic);

create table if not exists public.leads_followup (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  tanggal    date not null default current_date,
  catatan    text not null default '',
  oleh       uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists leads_followup_lead_idx
  on public.leads_followup (lead_id, tanggal desc);

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

-- Stempel/hapus `tanggal_closing` mengikuti perpindahan tahap — sama
-- alasannya dengan promo_stamp_selesai (0046): tanggal yang jadi dasar
-- bonus tidak boleh berasal dari client.
create or replace function public.stamp_lead_closing()
returns trigger as $$
begin
  if new.tahap = 'closing' and (old.tahap is distinct from 'closing') then
    new.tanggal_closing := current_date;
  elsif new.tahap <> 'closing' then
    new.tanggal_closing := null;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.stamp_lead_closing() from public, anon, authenticated;

drop trigger if exists leads_stamp_closing on public.leads;
create trigger leads_stamp_closing before insert or update on public.leads
  for each row execute function public.stamp_lead_closing();

alter table public.leads           enable row level security;
alter table public.leads_followup  enable row level security;

-- Pipeline adalah data komersial: pengelola (owner & manajer) melihat
-- semuanya, operator hanya lead yang ditugaskan kepadanya.
drop policy if exists "Leads dibaca" on public.leads;
create policy "Leads dibaca"
  on public.leads for select
  using (public.is_admin() or pic = auth.uid());

drop policy if exists "Pengelola kelola leads" on public.leads;
create policy "Pengelola kelola leads"
  on public.leads for all
  using (public.is_admin())
  with check (public.is_admin());

-- Riwayat follow-up mengikuti visibilitas lead induknya.
drop policy if exists "Followup dibaca" on public.leads_followup;
create policy "Followup dibaca"
  on public.leads_followup for select
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id and (public.is_admin() or l.pic = auth.uid())
    )
  );

drop policy if exists "Pengelola kelola followup" on public.leads_followup;
create policy "Pengelola kelola followup"
  on public.leads_followup for all
  using (public.is_admin())
  with check (public.is_admin());
