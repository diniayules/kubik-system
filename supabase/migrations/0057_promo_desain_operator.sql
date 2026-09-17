-- =============================================================
-- 0057_promo_desain_operator.sql · Operator melampirkan desain, owner/manajer
-- yang menyetujui
-- -------------------------------------------------------------
-- Sebelumnya hanya pengelola yang bisa menaruh desain di kartu promo. Yang
-- benar-benar membuat desain justru operator, jadi mereka harus bisa
-- melampirkan desain ke kartu MANA PUN yang mereka lihat — bukan cuma ide yang
-- mereka usulkan sendiri.
--
-- Yang TIDAK boleh ikut terbuka: isi kartunya. Kalau operator diberi UPDATE
-- biasa atas kartu orang lain, ia juga bisa menggeser tahap, mengubah deadline,
-- atau menukar PIC — persis angka-angka yang dipakai menilai kinerja. Maka:
--
--   1. RLS UPDATE dibuka untuk kartu yang sudah tayang (yang memang terlihat
--      oleh operator lewat policy SELECT 0035);
--   2. trigger `protect_promo_status` MEMBEKUKAN seluruh kolom lain — untuk
--      non-admin, baris hasil update dikembalikan ke `old` kecuali dua kolom
--      lampiran;
--   3. setiap lampiran BARU dari non-admin dipaksa `status = 'menunggu'` dan
--      `oleh = auth.uid()`, dan lampiran yang sudah ada tidak bisa ia hapus
--      atau ubah — kecuali usulannya sendiri yang masih menunggu (boleh
--      dicabut, karena belum pernah dilihat siapa pun sebagai desain resmi).
--
-- Dengan begitu "persetujuan owner/manajer" bukan sekadar aturan di layar:
-- satu-satunya cara sebuah lampiran jadi `disetujui` adalah update oleh
-- is_admin() (owner/manager, lihat 0042).
--
-- Jalur ide milik sendiri (0035) tidak berubah: masih dipaksa 'menunggu'+'ide'.
-- =============================================================

-- Sanitasi lampiran untuk update oleh non-admin: kembalikan array yang boleh
-- tersimpan, dihitung dari `vlama` (isi di database) + `vbaru` (kiriman client).
create or replace function public.promo_lampiran_operator(vlama jsonb, vbaru jsonb)
returns jsonb as $$
declare
  hasil jsonb := '[]'::jsonb;
  e     jsonb;
  aku   text := auth.uid()::text;
begin
  vlama := coalesce(vlama, '[]'::jsonb);
  vbaru := coalesce(vbaru, '[]'::jsonb);

  -- 1. Entri lama dipertahankan APA ADANYA. Satu-satunya yang boleh hilang
  --    adalah usulan sendiri yang masih menunggu dan memang tidak dikirim
  --    balik — itu berarti pengusulnya mencabutnya.
  for e in select value from jsonb_array_elements(vlama) loop
    if e->>'status' = 'menunggu'
       and e->>'oleh' = aku
       and not (vbaru @> jsonb_build_array(jsonb_build_object('nilai', e->>'nilai')))
    then
      continue;
    end if;
    hasil := hasil || jsonb_build_array(e);
  end loop;

  -- 2. Entri yang belum ada di database selalu masuk sebagai USULAN milik
  --    pengirimnya — status & pemilik tidak pernah diambil dari client.
  for e in select value from jsonb_array_elements(vbaru) loop
    if vlama @> jsonb_build_array(jsonb_build_object('nilai', e->>'nilai')) then
      continue;
    end if;
    if coalesce(e->>'nilai', '') = '' then
      continue;
    end if;
    hasil := hasil || jsonb_build_array(
      jsonb_build_object('nilai', e->>'nilai', 'oleh', aku, 'status', 'menunggu')
    );
  end loop;

  return hasil;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.promo_lampiran_operator(jsonb, jsonb)
  from public, anon, authenticated;

-- Trigger status promo — versi 0035 diperluas dengan jalur lampiran.
create or replace function public.protect_promo_status()
returns trigger as $$
declare
  kirim_gambar jsonb := new.desain_list;
  kirim_tautan jsonb := new.desain_tautan;
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
    new.desain_list := public.promo_lampiran_operator('[]'::jsonb, kirim_gambar);
    new.desain_tautan := public.promo_lampiran_operator('[]'::jsonb, kirim_tautan);
    return new;
  end if;

  if old.created_by = auth.uid() and old.status = 'menunggu' then
    -- Idenya sendiri yang belum di-ACC: boleh diedit isinya, tapi tetap tidak
    -- boleh menyetujui diri sendiri atau menukar pemilik.
    new.status := 'menunggu';
    new.tahap := 'ide';
    new.created_by := old.created_by;
  else
    -- Kartu orang lain / kartu yang sudah tayang: semua kolom dibekukan.
    -- Ditulis sebagai "pulihkan seluruh baris" supaya kolom yang ditambahkan
    -- migrasi BERIKUTNYA ikut terlindungi tanpa harus disebut satu per satu.
    new := old;
  end if;

  new.desain_list := public.promo_lampiran_operator(old.desain_list, kirim_gambar);
  new.desain_tautan := public.promo_lampiran_operator(old.desain_tautan, kirim_tautan);
  return new;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.protect_promo_status() from public, anon, authenticated;

-- UPDATE untuk operator atas kartu yang TAYANG. Kolom non-lampiran tidak perlu
-- dijaga di sini — trigger di atas sudah memulangkannya ke nilai lama.
drop policy if exists "Operator lampirkan desain" on public.promo_programs;
create policy "Operator lampirkan desain"
  on public.promo_programs for update
  using (status = 'disetujui' and tahap in ('comingsoon','berjalan','selesai'))
  with check (status = 'disetujui' and tahap in ('comingsoon','berjalan','selesai'));
