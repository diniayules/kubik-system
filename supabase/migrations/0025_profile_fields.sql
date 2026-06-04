-- =============================================================
-- 0025_profile_fields.sql
-- Perkaya profil karyawan dengan data kepegawaian. Bisa diisi/diedit
-- oleh karyawan sendiri (RLS "User update profile sendiri") maupun admin
-- ("Admin manage semua profile"). Tidak menyentuh role/active, jadi
-- trigger protect_profile_privileges tetap aman.
--
--   * foto             : avatar foto (data URL JPEG, di-resize kecil di client)
--   * nama_lengkap     : nama lengkap resmi (berbeda dari `nama` panggilan)
--   * tempat_lahir     : kota/tempat lahir
--   * tanggal_lahir    : tanggal lahir
--   * pendidikan       : pendidikan terakhir
--   * tanggal_diterima : tanggal mulai bekerja di Kubik
-- (`jabatan` sudah ada sejak 0001.)
-- =============================================================
alter table public.profiles
  add column if not exists foto             text,
  add column if not exists nama_lengkap     text not null default '',
  add column if not exists tempat_lahir     text not null default '',
  add column if not exists tanggal_lahir    date,
  add column if not exists pendidikan       text not null default '',
  add column if not exists tanggal_diterima date;
