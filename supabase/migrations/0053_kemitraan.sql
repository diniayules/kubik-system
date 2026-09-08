-- =============================================================
-- 0053_kemitraan.sql · Pengajuan MoU & Sponsorship
-- -------------------------------------------------------------
-- Sekolah datang meminta dua hal yang tidak punya tempat di sistem ini:
-- sponsor untuk acara mereka, dan MoU kerja sama jangka panjang. Selama
-- ini keduanya hidup di chat WhatsApp: proposal masuk, dibaca, lalu
-- hilang — sampai panitianya menagih, atau sampai MoU tahun lalu diam-
-- diam kadaluarsa tanpa ada yang tahu.
--
-- Kenapa TIDAK ditumpangkan ke `leads` (0047), padahal sama-sama pipeline:
--   · Arah uangnya berlawanan. Lead dikejar supaya Kubik DAPAT uang;
--     sponsorship yang disetujui membuat Kubik KELUAR uang. Menaruhnya
--     di satu tabel merusak `nilaiPipeline` dan konversi sales — angka
--     KPI manajer akan mengaku sedang mengejar order padahal itu beban.
--   · Pertanyaannya lain. Lead: "sudah di-follow-up belum?". Pengajuan:
--     "sudah diputuskan belum, dan imbalannya sudah ditagih belum?".
--   · Ia punya umur simpan. MoU berlaku sampai tanggal tertentu; lead
--     tidak. Tanpa `mou_berakhir`, tidak ada yang bisa mengingatkan.
--
-- Tiga kolom yang menjadi alasan tabel ini ada:
--   imbalan       — apa yang Kubik DAPAT sebagai balasan (logo di banner,
--                   booth, post IG sekolah), tiap butir bisa dicentang.
--                   Sponsorship tanpa daftar ini cuma sedekah: uang
--                   keluar, tidak ada yang menagih kompensasinya.
--   mou_berakhir  — supaya kerja sama yang mau habis terlihat lebih dulu.
--   pengeluaran_id— jejak ke baris `pengeluaran` yang dibuat saat sponsor
--                   dibayar, supaya uangnya masuk laporan keuangan sekali
--                   saja dan bisa ditarik lagi kalau salah catat.
--
-- Bentuknya (kanban status + jsonb checklist) sengaja meniru
-- `promo_programs` (0035) dan `leads` (0047) agar tidak ada kosakata UI
-- baru yang harus dipelajari owner maupun manajer.
--
-- `tanggal_keputusan` distempel trigger, mengikuti `leads_stamp_closing`
-- (0047): tanggal disetujui/ditolak adalah bukti kecepatan respons
-- manajer, jadi tidak boleh bisa dikarang dari layar.
-- =============================================================

create table if not exists public.kemitraan (
  id              uuid primary key default gen_random_uuid(),
  -- Sekolah / instansi yang mengajukan (mis. "SMA 3 Bandung").
  instansi        text not null default '',
  jenis           text not null default 'sponsorship'
                    check (jenis in ('sponsorship','mou','keduanya')),
  -- Orang yang menghubungi: ketua panitia, guru pembina, kesiswaan.
  kontak_nama     text not null default '',
  kontak          text not null default '',
  -- Acara yang disponsori; kosong untuk MoU payung tanpa acara tertentu.
  acara           text not null default '',
  tanggal_acara   date,
  tanggal_masuk   date not null default current_date,
  status          text not null default 'masuk'
                    check (status in ('masuk','ditinjau','disetujui',
                                      'ditolak','selesai')),
  -- Isi proposalnya: apa yang diminta sekolah, apa adanya.
  permintaan      text not null default '',
  -- Nilai yang DIMINTA vs yang akhirnya DISETUJUI. Dipisah karena selisih
  -- keduanya adalah hasil negosiasi manajer — itu sendiri layak dilihat.
  nilai_diminta   numeric not null default 0,
  nilai_disetujui numeric not null default 0,
  -- Wujud sponsornya: tidak semua sponsor berupa uang tunai.
  bentuk          text not null default 'uang'
                    check (bentuk in ('uang','voucher','produk','booth',
                                      'jasa','lainnya')),
  -- Timbal balik untuk Kubik: [{ "id": "...", "teks": "...", "selesai": bool }].
  -- jsonb, bukan tabel sendiri, karena butirnya sedikit dan selalu dibaca
  -- bersama induknya — pola yang sama dengan `promo_programs.tahapan`.
  imbalan         jsonb not null default '[]'::jsonb,
  -- Masa berlaku MoU. Null untuk sponsorship sekali jalan.
  mou_mulai       date,
  mou_berakhir    date,
  alasan_tolak    text not null default '',
  catatan         text not null default '',
  pic             uuid references public.profiles(id) on delete set null,
  -- Distempel trigger saat status pindah ke disetujui/ditolak.
  tanggal_keputusan date,
  -- Baris `pengeluaran` yang mencatat sponsor ini saat dibayar. Null =
  -- belum dibayar.
  --
  -- SENGAJA TANPA foreign key: `persistChanges` (lib/db.ts) menulis semua
  -- tabel yang berubah dalam satu Promise.all, jadi baris pengeluaran dan
  -- baris kemitraan yang menunjuknya berangkat bersamaan — FK akan kalah
  -- balapan dan menolak insert-nya. Layar sudah memperlakukan id yang
  -- menggantung sebagai "belum dibayar", jadi biaya kelonggaran ini kecil
  -- dibanding gagal simpan.
  pengeluaran_id  uuid,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists kemitraan_status_idx  on public.kemitraan (status);
create index if not exists kemitraan_berakhir_idx on public.kemitraan (mou_berakhir)
  where mou_berakhir is not null;

drop trigger if exists kemitraan_touch on public.kemitraan;
create trigger kemitraan_touch before update on public.kemitraan
  for each row execute function public.touch_updated_at();

-- Stempel/hapus `tanggal_keputusan` mengikuti perpindahan status. Sama
-- alasannya dengan stamp_lead_closing (0047): tanggal yang jadi bukti
-- kecepatan respons tidak boleh berasal dari client.
create or replace function public.stamp_kemitraan_keputusan()
returns trigger as $$
begin
  if new.status in ('disetujui','ditolak')
     and (old.status is null or old.status not in ('disetujui','ditolak')) then
    new.tanggal_keputusan := current_date;
  elsif new.status in ('masuk','ditinjau') then
    -- Dikembalikan ke antrean = keputusannya dicabut.
    new.tanggal_keputusan := null;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.stamp_kemitraan_keputusan()
  from public, anon, authenticated;

drop trigger if exists kemitraan_stamp_keputusan on public.kemitraan;
create trigger kemitraan_stamp_keputusan before insert or update on public.kemitraan
  for each row execute function public.stamp_kemitraan_keputusan();

alter table public.kemitraan enable row level security;

-- Persis kebijakan `leads` (0047): pengajuan adalah data komersial —
-- pengelola melihat & mengubah semuanya, operator hanya yang di-PIC-kan
-- padanya, dan tetap read-only.
drop policy if exists "Kemitraan dibaca" on public.kemitraan;
create policy "Kemitraan dibaca"
  on public.kemitraan for select
  using (public.is_admin() or pic = auth.uid());

drop policy if exists "Pengelola kelola kemitraan" on public.kemitraan;
create policy "Pengelola kelola kemitraan"
  on public.kemitraan for all
  using (public.is_admin())
  with check (public.is_admin());
