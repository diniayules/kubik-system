-- =============================================================
-- 0018_absen_status_approval.sql
-- Absensi manual untuk tanggal selain hari ini → butuh persetujuan admin.
--
-- Karyawan boleh mengisi absensi untuk tanggal lampau yang terlewat, tapi
-- entri itu berstatus 'menunggu' dan TIDAK dihitung/ditampilkan sebagai
-- kehadiran resmi sampai admin menyetujuinya ('disetujui').
--
-- Absensi real-time hari ini tetap langsung 'disetujui'. Admin yang mengisi
-- manual juga langsung 'disetujui'.
-- =============================================================

alter table public.absen_records
  add column if not exists status text not null default 'disetujui'
    check (status in ('menunggu', 'disetujui'));

-- Karyawan tidak boleh menyetujui absensinya sendiri: kalau baris sudah
-- 'menunggu', non-admin tidak bisa mengubahnya jadi 'disetujui' (anti
-- self-approval). Admin bebas mengubah status (itulah persetujuan).
create or replace function public.protect_absen_status()
returns trigger as $$
begin
  if not public.is_admin() and old.status = 'menunggu' then
    new.status := 'menunggu';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists absen_protect_status on public.absen_records;
create trigger absen_protect_status before update on public.absen_records
  for each row execute function public.protect_absen_status();
