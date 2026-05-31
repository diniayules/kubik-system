-- 0014_laporan_pemakaian_kertas_multi.sql
-- Memungkinkan satu laporan income memakai LEBIH DARI SATU jenis kertas (mis.
-- dalam sehari operator memakai finishing berbeda atas permintaan customer).
-- Menggantikan kolom tunggal `kertas_id` dengan daftar alokasi:
--   pemakaian_kertas = [{ "kertasId": <uuid>, "jumlah": <int> }, ...]
-- Kolom lama `kertas_id` dibiarkan ada untuk kompatibilitas baca data lama;
-- penulisan baru mengisi `pemakaian_kertas` dan menulis `kertas_id` = null.

alter table public.laporan_income
  add column if not exists pemakaian_kertas jsonb not null default '[]';

-- Backfill: laporan lama yang sempat memakai kolom tunggal `kertas_id`
-- (versi single-kertas) dipindahkan ke daftar, dengan jumlah = total tiket+cetak.
update public.laporan_income l
set pemakaian_kertas = jsonb_build_array(
  jsonb_build_object(
    'kertasId', l.kertas_id::text,
    'jumlah', coalesce((
      select sum(coalesce((it->>'tiket')::int, 0) + coalesce((it->>'cetak')::int, 0))
      from jsonb_array_elements(l.items) as it
    ), 0)
  )
)
where l.kertas_id is not null
  and (l.pemakaian_kertas is null or jsonb_array_length(l.pemakaian_kertas) = 0);
