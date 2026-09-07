-- =============================================================
-- 0042_role_owner_manager.sql · Hak akses bertingkat
-- -------------------------------------------------------------
-- Sebelum ini hanya ada dua peran: 'admin' & 'karyawan'. Sekarang:
--   owner    : pemilik studio. Akses penuh, termasuk gaji & kas.
--   manager  : manajer operasional. Akses pengelola (sama seperti
--              'admin' lama) KECUALI gaji per orang & rekonsiliasi
--              kas — dua hal itu owner-only.
--   karyawan : staf operasional.
--
-- Semua akun 'admin' lama otomatis menjadi 'owner' (tidak ada
-- perubahan hak akses bagi mereka). `is_admin()` sengaja DIPERTAHANKAN
-- namanya dan kini berarti "pengelola" (owner ATAU manager), sehingga
-- seluruh policy RLS di 0002–0041 tetap berlaku apa adanya.
--
-- Pembeda gaji & kas TIDAK ditegakkan di RLS karena keduanya hidup di
-- `app_config`, yang memang readable oleh semua user login sejak 0002
-- (pola lama: penyaringan dilakukan di layar). Yang ditegakkan di sini
-- adalah hal yang benar-benar berbahaya: kenaikan hak akses — lewat
-- trigger `profiles_protect` yang sudah ada sejak 0006.
-- =============================================================

-- ---------- 1. Helper peran ----------
-- is_admin() namanya DIPERTAHANKAN dan kini berarti "pengelola" (owner |
-- manager), sehingga seluruh policy RLS 0002–0041 tetap berlaku apa adanya.
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'manager')
  );
$$ language sql security definer stable set search_path = '';

-- is_owner() untuk data paling sensitif (gaji per orang & rekonsiliasi kas).
create or replace function public.is_owner()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$ language sql security definer stable set search_path = '';

revoke execute on function public.is_owner() from public;
revoke execute on function public.is_owner() from anon;
grant  execute on function public.is_owner() to authenticated;

-- ---------- 2. Perluas penjaga hak akses yang sudah ada ----------
-- Trigger `profiles_protect` (migration 0006) sudah mencegah kenaikan hak akses
-- dengan mengembalikan `role`/`active` ke nilai lama untuk non-admin. Aturannya
-- dipertajam sekarang karena is_admin() mencakup manager:
--   * `role`   hanya boleh diubah OWNER — tanpa ini seorang manager bisa
--              menaikkan dirinya sendiri jadi owner lewat policy
--              "Admin manage semua profile".
--   * `active` tetap boleh diubah pengelola (owner & manajer).
-- `auth.uid() is null` = dipanggil dari server (service role: migrasi ini
-- sendiri, dan edge function create-karyawan yang sudah memverifikasi
-- pemanggilnya). Tanpa cabang itu, UPDATE di langkah 3 akan diam-diam batal.
create or replace function public.protect_profile_privileges()
returns trigger as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not public.is_owner() then
    new.role := old.role;
  end if;
  if not public.is_admin() then
    new.active := old.active;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.protect_profile_privileges() from public, anon, authenticated;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ---------- 3. Migrasi nilai + constraint ----------
alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles set role = 'owner' where role = 'admin';

alter table public.profiles
  add constraint profiles_role_check check (role in ('owner', 'manager', 'karyawan'));

-- ---------- 4. User pertama → owner ----------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_role text;
begin
  if (select count(*) from public.profiles) = 0 then
    v_role := 'owner';
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
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;
