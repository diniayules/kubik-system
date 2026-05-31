-- 0009_income_catalog.sql
-- Admin-configurable income line items (layanan + upgrade) and editable
-- income-report heading text. Catalogs are JSONB arrays of {id,label,ikon};
-- prices continue to live in harga_tiket / harga_upgrade keyed by item id.

alter table public.app_config
  add column if not exists layanan_catalog jsonb not null default
    '[{"id":"photobooth","label":"Photobooth","ikon":"📸"},{"id":"photobox","label":"Photobox","ikon":"🎞️"},{"id":"photo-game","label":"Photo Game","ikon":"🎮"}]',
  add column if not exists upgrade_catalog jsonb not null default
    '[{"id":"poster","label":"Poster","ikon":"🖼️"},{"id":"crack-n-share","label":"Crack n Share","ikon":"🎁"}]',
  add column if not exists income_judul text,
  add column if not exists income_sub text;
