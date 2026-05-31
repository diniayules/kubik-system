-- =============================================================
-- 0003_seed.sql · Data awal (default config + jenis kertas + 6 tinta)
-- Idempotent (pakai on conflict do nothing).
-- =============================================================

-- App config singleton
insert into public.app_config (id) values (1) on conflict (id) do nothing;

-- Stok tinta 6 warna
insert into public.stok_tinta (warna, stok) values
  ('BK', 0), ('LC', 0), ('M', 0), ('C', 0), ('Y', 0), ('LM', 0)
on conflict (warna) do nothing;

-- Stok amplop singleton
insert into public.stok_amplop (id, stok) values (1, 0) on conflict (id) do nothing;

-- Default jenis kertas
insert into public.stok_kertas (nama, stok) values
  ('Doff Kasar', 0),
  ('Holographic', 0),
  ('Crack n Share', 0),
  ('Poster', 0)
on conflict do nothing;
