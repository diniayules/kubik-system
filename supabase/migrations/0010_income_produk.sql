-- 0010_income_produk.sql
-- Third income category "Produk" (merchandise & other goods: frame foto,
-- t-shirt, …). Qty-based like upgrade. Catalog starts empty; admins add items
-- in "Atur Item & Harga". Prices live in app_config.harga_produk keyed by id;
-- per-laporan sales + price snapshot live on laporan_income.

alter table public.app_config
  add column if not exists produk_catalog jsonb not null default '[]',
  add column if not exists harga_produk   jsonb not null default '{}';

alter table public.laporan_income
  add column if not exists produk       jsonb not null default '[]',
  add column if not exists harga_produk jsonb not null default '{}';
