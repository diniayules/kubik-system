-- =============================================================
-- 0060_klaim_sosmed.sql · Operator melapor, pengelola menyetujui
-- -------------------------------------------------------------
-- Sampai 0059, story & live hanya bisa dicatat pengelola di Dashboard
-- Manajemen. Itu aman dari sisi anti-curang, tapi memindahkan seluruh
-- beban pencatatan ke satu orang: kalau manajer telat mencentang,
-- OPERATOR yang kehilangan bonusnya. Yang salah bukan operatornya.
--
-- Maka alurnya dibalik mengikuti pola yang sudah dipakai dua kali di
-- aplikasi ini:
--   `absen_records.status`  — karyawan isi presensi manual → 'menunggu'
--                             → owner ACC → baru dihitung.
--   migrasi 0057            — operator melampirkan desain → trigger
--                             memaksa 'menunggu' → hanya is_admin()
--                             yang bisa menjadikannya 'disetujui'.
--
-- Operator MELAPOR ("hari ini aku sudah story"), pengelola MEMERIKSA.
-- Centang yang masih 'menunggu' tidak dihitung apa pun.
--
-- KENAPA TABEL SENDIRI, BUKAN KOLOM DI `jadwal_shift`:
--   Klaim tidak boleh bergantung pada roster terisi. Kalau manajer belum
--   menyusun jadwal hari itu, operator yang tetap masuk kerja jadi tidak
--   bisa melapor — padahal hari itu tetap menghitung terhadap targetnya
--   (penyebut bonus diambil dari presensi, bukan dari roster). Klaim
--   harus bisa berdiri tanpa baris roster.
--
--   `jadwal_shift.live` (0059) TIDAK dibuang: ia RENCANA ("minggu ini
--   live hari Rabu"). Tabel ini REALISASI-nya. Pasangan rencana ↔
--   realisasi itulah tulang punggung layar Jadwal.
--
-- KENAPA BUKAN `sosmed_harian`:
--   Grain-nya salah. `sosmed_harian` satu baris per TANGGAL untuk akun
--   studio; klaim ini per (tanggal, ORANG). Story dua operator di hari
--   yang sama tidak bisa dibedakan di sana.
--
-- Konten TIDAK ikut ke sini — satuannya kartu, bukan tanggal. Jalurnya
-- lewat centang tahapan di kartu Papan Promosi; lihat migrasi 0061.
-- =============================================================

create table if not exists public.klaim_sosmed (
  tanggal        date not null,
  employee_id    uuid not null references public.profiles(id) on delete cascade,
  jenis          text not null check (jenis in ('story','live')),
  status         text not null default 'menunggu'
                   check (status in ('menunggu','disetujui')),
  -- Bukti opsional. Tidak diwajibkan: memaksa tautan tiap hari akan
  -- membuat orang berhenti melapor, dan yang memeriksa toh melihat
  -- akunnya langsung.
  tautan         text not null default '',
  catatan        text not null default '',
  disetujui_oleh uuid references public.profiles(id) on delete set null,
  disetujui_pada timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (tanggal, employee_id, jenis)
);

create index if not exists klaim_sosmed_employee_idx
  on public.klaim_sosmed (employee_id, tanggal);

-- ---------- Anti-menyetujui-diri-sendiri ----------
-- Seluruh jaminan bonus ini bertumpu pada satu kalimat: satu-satunya cara
-- sebuah klaim jadi 'disetujui' adalah tulisan dari is_admin(). Ditegakkan
-- di database, bukan di layar.
create or replace function public.protect_klaim_sosmed()
returns trigger as $$
begin
  if public.is_admin() then
    -- Pengelola: di sinilah persetujuan terjadi. Stempel siapa & kapan
    -- diisi server supaya tidak bisa dikarang dari layar.
    if new.status = 'disetujui'
       and (tg_op = 'INSERT' or old.status is distinct from 'disetujui') then
      new.disetujui_oleh := auth.uid();
      new.disetujui_pada := now();
    elsif new.status <> 'disetujui' then
      new.disetujui_oleh := null;
      new.disetujui_pada := null;
    else
      -- Sudah disetujui sebelumnya: jejak aslinya dipertahankan.
      new.disetujui_oleh := old.disetujui_oleh;
      new.disetujui_pada := old.disetujui_pada;
    end if;
    return new;
  end if;

  -- Operator: hanya boleh melapor ATAS NAMA DIRINYA, selalu 'menunggu'.
  new.employee_id    := auth.uid();
  new.status         := 'menunggu';
  new.disetujui_oleh := null;
  new.disetujui_pada := null;
  if tg_op = 'UPDATE' then
    -- Klaim yang sudah di-ACC tidak boleh disunting lagi oleh pelapornya —
    -- kalau bisa, ia tinggal menunggu ACC lalu mengganti isinya.
    if old.status = 'disetujui' then
      return old;
    end if;
    new.tanggal := old.tanggal;
    new.jenis   := old.jenis;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.protect_klaim_sosmed() from public, anon, authenticated;

drop trigger if exists klaim_sosmed_protect on public.klaim_sosmed;
create trigger klaim_sosmed_protect before insert or update on public.klaim_sosmed
  for each row execute function public.protect_klaim_sosmed();

drop trigger if exists klaim_sosmed_touch on public.klaim_sosmed;
create trigger klaim_sosmed_touch before update on public.klaim_sosmed
  for each row execute function public.touch_updated_at();

alter table public.klaim_sosmed enable row level security;

-- SELECT: semua yang login. Operator perlu melihat progresnya sendiri —
-- itu seluruh gunanya papan ini — dan melihat rekannya tidak berbahaya:
-- isinya "sudah story belum", bukan angka rupiah.
drop policy if exists "Klaim dibaca semua" on public.klaim_sosmed;
create policy "Klaim dibaca semua"
  on public.klaim_sosmed for select
  using (auth.uid() is not null);

-- INSERT: operator hanya untuk dirinya (trigger juga memaksanya).
drop policy if exists "Operator melapor" on public.klaim_sosmed;
create policy "Operator melapor"
  on public.klaim_sosmed for insert
  with check (public.is_admin() or employee_id = auth.uid());

-- UPDATE: pengelola bebas (inilah ACC-nya); operator hanya barisnya sendiri.
drop policy if exists "Klaim diubah" on public.klaim_sosmed;
create policy "Klaim diubah"
  on public.klaim_sosmed for update
  using (public.is_admin() or employee_id = auth.uid())
  with check (public.is_admin() or employee_id = auth.uid());

-- DELETE: operator boleh MENCABUT laporannya selama belum di-ACC. Yang
-- sudah disetujui hanya bisa dicabut pengelola — ia sudah jadi keputusan.
drop policy if exists "Klaim dicabut" on public.klaim_sosmed;
create policy "Klaim dicabut"
  on public.klaim_sosmed for delete
  using (
    public.is_admin()
    or (employee_id = auth.uid() and status = 'menunggu')
  );

-- ---------- Pindahkan catatan lama supaya bulan lampau tidak berubah ----------
-- Story & live yang SUDAH dicatat pengelola di `sosmed_harian` masuk sebagai
-- klaim yang langsung 'disetujui' — ia memang sudah lewat tangan pengelola.
-- Tanpa ini, slip bulan-bulan lampau akan berubah sendiri begitu sumber
-- perhitungannya pindah.
--
-- Trigger dimatikan sementara: ia bersandar pada `auth.uid()`, yang null saat
-- migrasi dijalankan, sehingga baris yang sah justru akan dianggap laporan
-- operator tanpa identitas.
--
-- `oleh_list` bertipe JSONB dan isinya boleh berupa NAMA BEBAS (freelancer
-- tanpa akun), jadi entri disaring dua kali: bentuk uuid dulu (CTE
-- materialized supaya cast-nya tidak pernah dijalankan pada teks biasa), baru
-- dicocokkan ke `profiles`.
alter table public.klaim_sosmed disable trigger klaim_sosmed_protect;

with pengerja as materialized (
  select s.tanggal,
         s.tautan,
         j.jenis,
         o.orang
    from public.sosmed_harian s
    cross join lateral (values ('story', s.story), ('live', s.live)) as j(jenis, aktif)
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_array_length(coalesce(s.oleh_list, '[]'::jsonb)) > 0
          then s.oleh_list
        when s.oleh is not null then jsonb_build_array(s.oleh::text)
        else '[]'::jsonb
      end
    ) as o(orang)
   where j.aktif
     and o.orang ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
)
insert into public.klaim_sosmed (tanggal, employee_id, jenis, status, tautan)
select k.tanggal, p.id, k.jenis, 'disetujui', coalesce(k.tautan, '')
  from pengerja k
  join public.profiles p on p.id = k.orang::uuid
on conflict (tanggal, employee_id, jenis) do nothing;

alter table public.klaim_sosmed enable trigger klaim_sosmed_protect;
