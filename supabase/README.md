# Supabase Setup · Kubik Photobox Studio

## 1. Buat Supabase project

1. Login ke https://supabase.com
2. New project → pilih region terdekat (Singapore untuk Indonesia)
3. Catat **Project URL** dan **Publishable key** dari Settings → API Keys
   (key dimulai dengan `sb_publishable_...` — itu pengganti _anon key_ format lama)

## 2. Konfigurasi env variable di app

Buat file `.env.local` di root project (sudah ada di `.gitignore`):

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxx
```

> Note: project ini Vite jadi prefix env wajib `VITE_*`, bukan `NEXT_PUBLIC_*`.

Restart `npm run dev`.

## 3. Jalankan SQL migrations

Di Supabase Dashboard → **SQL Editor** → New query, lalu jalankan urut satu per satu:

1. `migrations/0001_init.sql` — tabel + trigger profile auto-create
2. `migrations/0002_rls.sql` — Row-Level Security policies
3. `migrations/0003_seed.sql` — data default (tinta 6 warna, amplop, jenis kertas seed)

Setiap script idempotent, aman dijalankan ulang.

## 4. Konfigurasi Auth

Di Dashboard → **Authentication → Providers**:

- Aktifkan **Email** provider
- (Opsional) Disable "Confirm email" untuk testing cepat di Authentication → Settings → Email Auth → Disable "Enable email confirmations"

## 5. Aturan role

**User pertama yang sign up otomatis jadi admin** (via trigger `handle_new_user`).
Semua sign up berikutnya default `karyawan`.
Admin bisa promote/demote user lain via update kolom `role` di table `profiles`.

## 6. Permission matrix (yang sudah enforced via RLS)

| Tabel             | Admin              | Karyawan                                |
|-------------------|--------------------|-----------------------------------------|
| profiles          | Read + write semua | Read semua · Update sendiri (tanpa role)|
| absen_records     | Read + write semua | Read semua · Insert/Update sendiri      |
| laporan_income    | Read + write semua | Read semua · **Insert** baru saja       |
| pengeluaran       | Read + write semua | **TIDAK BISA AKSES SAMA SEKALI**        |
| stok_*            | Read + write semua | Read saja                               |
| salah_cetak       | Read + write semua | Read saja                               |
| app_config        | Read + update      | Read saja                               |

## 7. Tambah admin manual via SQL

Kalau ingin assign admin manual, lewat Dashboard:

```sql
update public.profiles set role = 'admin' where email = 'owner@kubik.id';
```
