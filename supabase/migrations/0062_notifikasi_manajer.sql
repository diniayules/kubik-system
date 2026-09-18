-- =============================================================
-- 0062_notifikasi_manajer.sql · Pengingat tunggakan manajer (Telegram)
-- -------------------------------------------------------------
-- Semua pekerjaan manajer yang sering terlewat — laporan harian, ACC
-- absen, ACC klaim sosmed, menutup kartu konten, follow-up lead —
-- punya satu kesamaan: yang jadi masalah adalah sesuatu yang TIDAK
-- terjadi. Ketiadaan tidak bisa memicu trigger. Maka bentuknya bukan
-- notifikasi per kejadian melainkan PEMERIKSAAN TERJADWAL: sekali
-- sehari seluruh antrean dipindai, dan yang masih menggantung dikirim
-- sebagai satu pesan.
--
-- Tiga hal yang ditambahkan di sini:
--
--  1. `app_config.notifikasi` — sakelar per pemeriksaan + chat id
--     tujuan. Mengikuti pola `closing_checklist` (0033) dan
--     `target_bulanan` (0043): volumenya kecil dan selalu dibaca
--     bersama konfigurasi lain. TOKEN BOT TIDAK DISIMPAN DI SINI —
--     `app_config` boleh dibaca semua user login, jadi token hidup
--     sebagai secret Edge Function, sama seperti SERVICE_ROLE_KEY.
--
--  2. `notifikasi_log` — riwayat pesan terkirim. Ini bukan sekadar
--     debug: seluruh gunanya pengingat ini bertumpu pada "sudah
--     diberi tahu atau belum", dan pertanyaan itu harus bisa dijawab
--     berbulan-bulan kemudian tanpa bergantung pada aplikasi chat.
--
--  3. `notifikasi_tunggakan()` — satu fungsi yang mengembalikan
--     antrean yang masih menggantung beserta UMURNYA. Logikanya
--     ditaruh di database, bukan di Edge Function, karena di sinilah
--     tabelnya berada: satu `select public.notifikasi_tunggakan()`
--     memperlihatkan persis apa yang akan dikirim, tanpa perlu
--     menjalankan fungsinya.
--
-- `umur_hari` adalah alasan fungsi ini mengembalikan angka dan bukan
-- kalimat jadi: eskalasi ke owner ditentukan dari umur, dan ambang
-- harinya diatur owner di layar — bukan dipatok di sini. Nilai NEGATIF
-- punya arti khusus: pemeriksaan itu soal keadaan, bukan soal
-- keterlambatan (mis. stok menipis), jadi tidak ada umur yang pantas
-- ditulis dan item itu tidak pernah ikut eskalasi.
-- =============================================================

-- ---------- 1. Konfigurasi ----------
alter table public.app_config
  add column if not exists notifikasi jsonb not null default '{}'::jsonb;

-- ---------- 2. Riwayat kirim ----------
create table if not exists public.notifikasi_log (
  id          uuid primary key default gen_random_uuid(),
  terkirim_at timestamptz not null default now(),
  -- 'harian'   = pengingat rutin ke manajer
  -- 'eskalasi' = tembusan ke owner karena umurnya melewati ambang
  -- 'uji'      = tombol uji coba di Pengaturan
  jenis       text not null default 'harian'
                check (jenis in ('harian', 'eskalasi', 'uji')),
  -- Chat tujuan apa adanya. Sengaja bukan foreign key ke profiles:
  -- yang perlu dibuktikan adalah "pesan ini sampai ke nomor ini",
  -- dan itu harus tetap terbaca walau akunnya kelak dihapus.
  tujuan      text not null default '',
  isi         text not null default '',
  -- Ringkasan mesin dari apa yang sedang nunggak saat pesan dibuat:
  -- [{ "kode": "laporan_harian", "jumlah": 2, "umur_hari": 3 }]
  -- Dari sini bisa dihitung "berapa kali laporan harian telat bulan
  -- ini" tanpa mengurai teks pesannya.
  rincian     jsonb not null default '[]'::jsonb,
  berhasil    boolean not null default true,
  error       text not null default ''
);

create index if not exists notifikasi_log_waktu_idx
  on public.notifikasi_log (terkirim_at desc);

alter table public.notifikasi_log enable row level security;

-- Pengelola boleh MEMBACA, tidak ada seorang pun boleh menulis dari
-- layar. Penulisnya hanya Edge Function dengan service role, yang
-- memang melewati RLS — jadi riwayatnya tidak bisa dirapikan oleh
-- orang yang sedang dinilai olehnya. Manajer sengaja ikut boleh
-- membaca: catatan ini bukan berkas rahasia, dan justru kehilangan
-- gunanya kalau terasa seperti pengintaian.
drop policy if exists "Pengelola baca notifikasi log" on public.notifikasi_log;
create policy "Pengelola baca notifikasi log"
  on public.notifikasi_log for select
  using (public.is_admin());

-- ---------- 3. Antrean yang masih menggantung ----------
create or replace function public.notifikasi_tunggakan()
returns table (kode text, label text, jumlah integer, umur_hari integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  minggu_depan date := date_trunc('week', current_date)::date + 7;
begin
  -- Dipanggil Edge Function dengan service role (auth.uid() null) atau
  -- pengelola dari layar. Karyawan tidak punya urusan di sini.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Hanya pengelola';
  end if;

  -- Laporan harian: hari yang lewat tanpa baris sama sekali.
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

  -- Absen manual yang menunggu persetujuan (0018). Umur dihitung dari
  -- kapan barisnya terakhir disentuh, bukan dari tanggal absennya:
  -- karyawan boleh mengisi tanggal lampau, dan menghitung dari situ
  -- akan membuat manajer kena eskalasi di menit pertama.
  return query
  select 'absen_menunggu'::text,
         'Absen manual menunggu persetujuan'::text,
         count(*)::integer,
         (current_date - min(a.updated_at)::date)::integer
  from public.absen_records a
  where a.status = 'menunggu'
  having count(*) > 0;

  -- Klaim story/live operator (0060). Telat ACC = operator kehilangan
  -- bonusnya, jadi ini menunggak atas nama orang lain.
  return query
  select 'klaim_sosmed'::text,
         'Klaim story/live operator belum di-ACC'::text,
         count(*)::integer,
         (current_date - min(k.created_at)::date)::integer
  from public.klaim_sosmed k
  where k.status = 'menunggu'
  having count(*) > 0;

  -- Kartu konten yang PIC-nya sudah mencentang 'tayang' (0061) tapi
  -- belum dipindahkan ke tahap 'selesai'. Selama menggantung, kartu
  -- itu tidak dihitung bonus apa pun.
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

  -- Lead yang didiamkan. Penanda basi adalah follow-up TERAKHIR, bukan
  -- tanggal masuk — lead yang dihubungi sekali lalu ditinggal tetap
  -- terhitung basi (0047).
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

  -- Kendala teknis yang masih terbuka (0055). 'ringan' sengaja tidak
  -- ikut: mengganggu kenyamanan saja, tidak pantas membangunkan siapa
  -- pun tiap pagi.
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

  -- Stok frame menipis (0021). Satu-satunya pemeriksaan yang bukan soal
  -- pekerjaan yang terlambat melainkan soal KEADAAN, dan bedanya kelihatan di
  -- `umur_hari`: -1 berarti "tidak berumur". Frame bukan barang yang harus
  -- selalu di-restock — habisnya satu jenis tidak menghentikan apa pun hari
  -- itu juga — jadi tidak pantas naik ke owner sebagai eskalasi, sebanyak apa
  -- pun harinya lewat.
  --
  -- Ambangnya 1, bukan 3 atau 5: dengan ambang longgar hampir tiap pagi ada
  -- saja jenis yang lewat ambang, dan pengingat yang selalu berbunyi berhenti
  -- dibaca. Jenis frame yang sudah tidak dipakai lagi sebaiknya dihapus dari
  -- Inventaris, bukan dibiarkan bersisa 0 dan menyebut dirinya tiap hari.
  return query
  select 'stok_frame'::text,
         'Stok frame tinggal 1 atau habis'::text,
         count(*)::integer,
         -1
  from public.stok_frame f
  where f.stok <= 1
  having count(*) > 0;

  -- Roster minggu depan (0044). Baru ditanyakan mulai Jumat — sebelum
  -- itu bukan menunggak, masih waktunya bekerja. Umurnya sengaja
  -- dibuat 1 di hari Jumat supaya eskalasi jatuh di hari Sabtu, saat
  -- masih ada waktu memperbaiki sebelum Senin.
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

-- Ikut kebijakan 0005/0007: tidak ada jalur eksekusi dari publik. `authenticated`
-- pun tidak diberi hak — frontend tidak pernah memanggil RPC ini langsung,
-- tombol "Kirim uji coba" di Pengaturan menembak edge function-nya, dan edge
-- function itulah yang memakai service role. Hak yang tidak terpakai hanya
-- menyisakan satu jalur /rest/v1/rpc yang terbuka tanpa alasan.
revoke execute on function public.notifikasi_tunggakan() from public, anon, authenticated;
grant execute on function public.notifikasi_tunggakan() to service_role;
