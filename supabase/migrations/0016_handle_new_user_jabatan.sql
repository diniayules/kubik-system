-- 0016_handle_new_user_jabatan.sql
-- Simpan `jabatan` yang diisi saat pendaftaran (auth metadata) ke profiles.
-- Sebelumnya jabatan selalu '' (default), sehingga slip gaji jatuh ke teks
-- fallback "Karyawan". Sekarang jabatan = metadata->>'jabatan' kalau ada.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_role text;
begin
  if (select count(*) from public.profiles) = 0 then
    v_role := 'admin';
  else
    v_role := 'karyawan';
  end if;

  insert into public.profiles (id, email, nama, jabatan, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nama', split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data->>'jabatan', ''), ''),
    v_role
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
