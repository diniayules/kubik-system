-- =============================================================
-- 0064_promo_pic_lihat.sql · PIC berhak melihat kartunya sendiri
-- -------------------------------------------------------------
-- Visibilitas promo (0035) diturunkan dari dua hal: kartu yang sudah tayang,
-- dan kartu miliknya sendiri (`created_by`). Yang terlewat: orang yang
-- DITUNJUK MENGERJAKAN kartu itu. Kartu di tahap 'rencana' — persis tahap
-- tempat pekerjaan disiapkan sebelum tayang — tidak sampai ke layarnya,
-- jadi PIC baru tahu tugasnya pada saat kartunya sudah Coming Soon.
--
-- Konsekuensinya bukan cuma soal tampilan: migrasi 0061 membuka centang
-- `tahapan` untuk PIC, tapi policy UPDATE 0057 hanya mencakup kartu tayang.
-- Di tahap 'rencana' PIC tidak bisa menandai take/edit-nya sendiri.
--
-- Yang dibuka di sini: baca + jalur update yang SUDAH sempit itu (lampiran
-- & tahapan). Kolom lain tetap dibekukan trigger `protect_promo_status`
-- (0061) — bagi non-admin barisnya dikembalikan ke `old` seluruhnya.
-- =============================================================

-- SELECT: admin semua; karyawan lihat kartu tayang, kartu usulannya sendiri,
-- dan kartu yang jadi tugasnya.
drop policy if exists "Promo dibaca" on public.promo_programs;
create policy "Promo dibaca"
  on public.promo_programs for select
  using (
    public.is_admin()
    or created_by = auth.uid()
    or pic = auth.uid()
    or (status = 'disetujui' and tahap in ('comingsoon','berjalan','selesai'))
  );

-- UPDATE operator (0057): kartu tayang — siapa pun boleh melampirkan desain —
-- ditambah kartu yang jadi tugasnya, di tahap mana pun.
drop policy if exists "Operator lampirkan desain" on public.promo_programs;
create policy "Operator lampirkan desain"
  on public.promo_programs for update
  using (
    (status = 'disetujui' and tahap in ('comingsoon','berjalan','selesai'))
    or pic = auth.uid()
  )
  with check (
    (status = 'disetujui' and tahap in ('comingsoon','berjalan','selesai'))
    or pic = auth.uid()
  );

-- Trigger 0061, ditambah satu baris: `pic` ikut dibekukan pada jalur "ide
-- sendiri yang masih menunggu". Cabang itu sengaja membiarkan pengusul
-- mengedit isi idenya, dan dulu `pic` ikut bisa diubah — tidak berbahaya
-- selama PIC cuma label. Sekarang PIC menentukan siapa yang melihat kartu
-- DAN siapa yang dihitung bonus kontennya (bonusSosmed), jadi yang menunjuk
-- PIC harus tetap pengelola saja.
create or replace function public.protect_promo_status()
returns trigger as $$
declare
  kirim_gambar  jsonb := new.desain_list;
  kirim_tautan  jsonb := new.desain_tautan;
  kirim_tahapan jsonb := new.tahapan;
begin
  -- Admin (owner/manager) bebas: di sinilah persetujuan terjadi.
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Usulan kartu baru dari operator: selalu masuk antrean (perilaku 0035).
    new.status := 'menunggu';
    new.tahap := 'ide';
    new.created_by := auth.uid();
    new.pic := null;
    new.desain_list := public.promo_lampiran_operator('[]'::jsonb, kirim_gambar);
    new.desain_tautan := public.promo_lampiran_operator('[]'::jsonb, kirim_tautan);
    return new;
  end if;

  if old.created_by = auth.uid() and old.status = 'menunggu' then
    -- Idenya sendiri yang belum di-ACC: boleh diedit isinya, tapi tetap tidak
    -- boleh menyetujui diri sendiri, menukar pemilik, atau menunjuk PIC.
    new.status := 'menunggu';
    new.tahap := 'ide';
    new.created_by := old.created_by;
    new.pic := old.pic;
  else
    -- Kartu orang lain / kartu yang sudah tayang: semua kolom dibekukan.
    -- Ditulis sebagai "pulihkan seluruh baris" supaya kolom yang ditambahkan
    -- migrasi BERIKUTNYA ikut terlindungi tanpa harus disebut satu per satu.
    new := old;
  end if;

  new.desain_list := public.promo_lampiran_operator(old.desain_list, kirim_gambar);
  new.desain_tautan := public.promo_lampiran_operator(old.desain_tautan, kirim_tautan);

  -- Jalur 0061: PIC kartu ini boleh mencentang tahap produksinya. Kartu yang
  -- sudah DITUTUP pengelola tidak bisa dibuka lagi lewat sini.
  if old.pic = auth.uid() and old.tahap <> 'selesai' then
    new.tahapan := public.promo_tahapan_operator(old.tahapan, kirim_tahapan);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.protect_promo_status() from public, anon, authenticated;
