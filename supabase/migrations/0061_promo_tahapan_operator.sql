-- =============================================================
-- 0061_promo_tahapan_operator.sql · PIC mencentang tahap, pengelola yang
-- menutup kartunya
-- -------------------------------------------------------------
-- Melengkapi 0060. Story & live dilaporkan lewat `klaim_sosmed`; KONTEN
-- tidak ikut ke sana karena satuannya KARTU, bukan tanggal — dan kartunya
-- sudah punya tempat: centang tahapan take → edit → tayang (0051).
--
-- Masalahnya centang itu admin-only: trigger `protect_promo_status` (0057)
-- membekukan seluruh kolom untuk non-admin. Jadi orang yang benar-benar
-- mengerjakan konten tidak punya cara memberi tahu bahwa ia sudah selesai.
--
-- Yang dibuka di sini SEMPIT: hanya `tahapan`, hanya untuk PIC kartu itu
-- sendiri. Semua kolom lain tetap beku — tahap, deadline, dan PIC adalah
-- justru angka yang dipakai menilai kinerja.
--
-- ALUR PERSETUJUANNYA SUDAH ADA, tidak perlu status baru:
--   centang 'tayang' oleh PIC          = KLAIM (tidak dihitung apa pun)
--   pengelola memindahkan kartu ke
--   tahap 'selesai' → `selesai_pada`
--   distempel trigger 0046             = ACC (inilah yang dihitung bonus)
-- Bonus hanya pernah membaca `selesai_pada`, jadi membuka `tahapan` tidak
-- membuka satu pun jalan ke uang.
-- =============================================================

-- Sanitasi tahapan untuk update oleh PIC non-admin.
--   - entri yang SUDAH ada  → `oleh` aslinya dipertahankan (PIC tidak bisa
--     mengaku-aku pekerjaan orang lain, juga tidak bisa menghapus namanya);
--   - entri BARU            → `oleh` dipaksa auth.uid();
--   - entri yang tidak dikirim balik → hilang, yaitu mengurungkan centang,
--     yang memang haknya selama kartunya belum ditutup.
-- `selesaiPada` tidak diurus di sini: trigger `promo_stamp_tahapan` (0051)
-- berjalan sesudah ini dan tetap yang menstempel tanggalnya.
create or replace function public.promo_tahapan_operator(vlama jsonb, vbaru jsonb)
returns jsonb as $$
declare
  hasil jsonb := '[]'::jsonb;
  e     jsonb;
  lama  jsonb;
  aku   text := auth.uid()::text;
begin
  vlama := coalesce(vlama, '[]'::jsonb);
  vbaru := coalesce(vbaru, '[]'::jsonb);

  for e in select value from jsonb_array_elements(vbaru) loop
    if coalesce(e->>'kunci', '') = '' then
      continue;
    end if;
    select el into lama
      from jsonb_array_elements(vlama) el
     where el->>'kunci' = e->>'kunci'
     limit 1;

    hasil := hasil || jsonb_build_array(
      jsonb_build_object(
        'kunci', e->>'kunci',
        'oleh',  coalesce(lama->>'oleh', aku)
      )
    );
    lama := null;
  end loop;

  return hasil;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.promo_tahapan_operator(jsonb, jsonb)
  from public, anon, authenticated;

-- Trigger status promo — versi 0057 ditambah jalur tahapan untuk PIC.
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

  -- Jalur baru 0061: PIC kartu ini boleh mencentang tahap produksinya.
  -- Kartu yang sudah DITUTUP pengelola tidak bisa dibuka lagi lewat sini —
  -- kalau bisa, klaim tetap tersunting setelah dinilai.
  if old.pic = auth.uid() and old.tahap <> 'selesai' then
    new.tahapan := public.promo_tahapan_operator(old.tahapan, kirim_tahapan);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.protect_promo_status() from public, anon, authenticated;

-- Policy UPDATE 0057 sudah mencakup kartu tayang (comingsoon/berjalan/selesai);
-- kartu konten yang sedang dikerjakan PIC ada di situ. Tidak ada policy baru.
