-- Harga event kini diatur per laporan (snapshot di tiap baris laporan_event),
-- bukan lagi harga tetap per kategori. Kolom global app_config.event_config
-- sudah tidak dipakai aplikasi — hapus supaya skema bersih.
alter table public.app_config
  drop column if exists event_config;
