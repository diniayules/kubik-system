-- =============================================================
-- 0063_notifikasi_sesi_malam.sql · Pengingat malam sebelum hari tutup
-- -------------------------------------------------------------
-- 0062 memeriksa sekali sehari di pagi hari. Itu benar untuk antrean
-- yang menumpuk (ACC absen, klaim sosmed, lead basi, kendala teknis):
-- umurnya berhari-hari, dan pagi memberi satu hari penuh untuk
-- membereskannya.
--
-- Tapi LAPORAN HARIAN bukan antrean — ia tugas penutup hari. Cek di
-- 0062 memindai `current_date - 1` ke belakang, jadi pesan jam 08:00
-- mengabarkan laporan KEMARIN yang sudah tidak bisa diperbaiki lagi.
-- Itu laporan kematian, bukan pengingat.
--
-- Maka fungsinya diberi SESI:
--
--   'pagi'  — seluruh antrean yang menumpuk (perilaku 0062, tak berubah)
--   'malam' — HANYA yang masih bisa diselamatkan malam itu juga
--
-- Sesi malam sengaja sesempit mungkin: satu pemeriksaan saja. Kalau ia
-- ikut memuat seluruh antrean, manajer menerima dua pesan berisi hal
-- yang sama tiap hari — dan dua pesan yang saling mengulang lebih cepat
-- dibungkam daripada satu pesan yang jarang.
--
-- `umur_hari` sesi malam selalu 0, jadi ia TIDAK PERNAH melewati ambang
-- eskalasi: hal yang harinya belum habis belum pantas diadukan ke owner.
-- =============================================================

-- Tanda tangannya berubah (bertambah argumen), dan `create or replace`
-- akan melahirkan overload — bukan mengganti. Versi tanpa argumen harus
-- dibuang dulu supaya pemanggilan tanpa argumen tidak jadi ambigu.
drop function if exists public.notifikasi_tunggakan();

create or replace function public.notifikasi_tunggakan(p_sesi text default 'pagi')
returns table (kode text, label text, jumlah integer, umur_hari integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  minggu_depan date := date_trunc('week', current_date)::date + 7;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Hanya pengelola';
  end if;

  -- ---------------- SESI MALAM ----------------
  -- Satu pertanyaan saja: hari ini sudah ditutup atau belum?
  if p_sesi = 'malam' then
    return query
    select 'laporan_harian'::text,
           'Laporan hari ini belum ditutup'::text,
           1::integer,
           0::integer
    where not exists (
      select 1 from public.laporan_harian l where l.tanggal = current_date
    );
    return;
  end if;

  -- ---------------- SESI PAGI ----------------
  -- Laporan harian: hari yang lewat tanpa baris sama sekali. Hari INI
  -- sengaja tidak ikut — harinya belum habis, itu urusan sesi malam.
  return query
  with kosong as (
    select g::date as hari
    from generate_series(current_date - 7, current_date - 1, interval '1 day') g
    where not exists (
      select 1 from public.laporan_harian l where l.tanggal = g::date
    )
  )
  select 'laporan_harian'::text,
         'Laporan harian belum diisi'::text,
         count(*)::integer,
         (current_date - min(k.hari))::integer
  from kosong k
  having count(*) > 0;

  return query
  select 'absen_menunggu'::text,
         'Absen manual menunggu persetujuan'::text,
         count(*)::integer,
         (current_date - min(a.updated_at)::date)::integer
  from public.absen_records a
  where a.status = 'menunggu'
  having count(*) > 0;

  return query
  select 'klaim_sosmed'::text,
         'Klaim story/live operator belum di-ACC'::text,
         count(*)::integer,
         (current_date - min(k.created_at)::date)::integer
  from public.klaim_sosmed k
  where k.status = 'menunggu'
  having count(*) > 0;

  return query
  with kartu as (
    select (
             select min((e->>'selesaiPada')::date)
             from jsonb_array_elements(p.tahapan) e
             where e->>'kunci' = 'tayang' and e->>'selesaiPada' is not null
           ) as tayang_pada
    from public.promo_programs p
    where p.tahap <> 'selesai' and jsonb_typeof(p.tahapan) = 'array'
  )
  select 'promo_tayang'::text,
         'Konten sudah tayang tapi kartunya belum ditutup'::text,
         count(*)::integer,
         (current_date - min(kartu.tayang_pada))::integer
  from kartu
  where kartu.tayang_pada is not null
  having count(*) > 0;

  return query
  with lead_aktif as (
    select coalesce(
             (select max(f.tanggal) from public.leads_followup f where f.lead_id = l.id),
             l.tanggal_masuk
           ) as sentuh
    from public.leads l
    where l.tahap in ('baru', 'dihubungi', 'followup', 'negosiasi')
  )
  select 'leads_basi'::text,
         'Lead belum di-follow-up lebih dari 3 hari'::text,
         count(*)::integer,
         (current_date - min(lead_aktif.sentuh))::integer
  from lead_aktif
  where lead_aktif.sentuh < current_date - 3
  having count(*) > 0;

  return query
  select 'masalah_teknis'::text,
         'Kendala teknis belum ditutup'::text,
         count(*)::integer,
         (current_date - min(m.dilaporkan_pada)::date)::integer
  from public.masalah_teknis m
  where m.selesai_pada is null
    and m.tingkat in ('stop', 'ganggu')
    and m.dilaporkan_pada < now() - interval '2 days'
  having count(*) > 0;

  -- Stok bukan tunggakan yang berumur, jadi umurnya -1: penanda bahwa
  -- baris ini tidak punya keterangan umur dan tidak pernah jadi eskalasi.
  return query
  select 'stok_frame'::text,
         'Stok frame tinggal 1 atau habis'::text,
         count(*)::integer,
         -1
  from public.stok_frame f
  where f.stok <= 1
  having count(*) > 0;

  if extract(isodow from current_date) >= 5 then
    return query
    select 'jadwal_minggu_depan'::text,
           'Jadwal shift minggu depan belum disusun'::text,
           1::integer,
           (extract(isodow from current_date)::integer - 4)
    where not exists (
      select 1 from public.jadwal_shift j
      where j.tanggal >= minggu_depan and j.tanggal < minggu_depan + 7
    );
  end if;
end;
$$;

revoke execute on function public.notifikasi_tunggakan(text) from public, anon, authenticated;
grant execute on function public.notifikasi_tunggakan(text) to service_role;

-- Riwayat kirim ikut membedakan sesinya, supaya pertanyaan "berapa kali
-- dia baru menutup hari setelah ditagih malam-malam" bisa dijawab.
alter table public.notifikasi_log drop constraint if exists notifikasi_log_jenis_check;
alter table public.notifikasi_log add constraint notifikasi_log_jenis_check
  check (jenis in ('harian', 'malam', 'eskalasi', 'uji'));
