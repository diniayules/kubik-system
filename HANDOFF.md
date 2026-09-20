# HANDOFF — Kubik Photobox Studio (Absensi + Operasional)

Context for the next agent. This app started as a localStorage-only React/Vite
app and is migrating to Supabase (auth + database). **Phase 1 (auth foundation)
is done. Phase 2 (data layer migration) is DONE — all screens now read/write
Supabase through a write-through data layer. Only follow-up polish remains (see
"Phase 3 — remaining" below).**

Stack: React 19 + Vite + TypeScript, plain CSS (`src/App.css`, `src/index.css`),
`@supabase/supabase-js`. No router (screen state is a discriminated union in
`src/App.tsx`). Three visual themes (pop/aurora/studio) via `data-theme`.

---

## ✅ Phase 1 — DONE (auth foundation)

- `@supabase/supabase-js` installed.
- `src/lib/supabase.ts` — client. Reads `VITE_SUPABASE_URL` +
  `VITE_SUPABASE_PUBLISHABLE_KEY` (falls back to `VITE_SUPABASE_ANON_KEY`).
  Exports `supabase`, `supabaseConfigured`, and the `Profile` type.
- `src/lib/auth.tsx` — `AuthProvider` + `useAuth()`. Exposes `loading`,
  `configured`, `user`, `session`, `profile`, `isAdmin`, `isKaryawan`,
  `signIn`, `signUp`, `signOut`, `refreshProfile`.
- `src/screens/Login.tsx` — login + register tabs (email/password).
- `src/App.tsx` — wrapped in `<AuthProvider>`. Gate order in `Inner()`:
  `!supabaseConfigured` → setup warning; `auth.loading` → spinner;
  `!session || !profile` → `<Login>`; else the app shell.
  Karyawan are redirected off `pengeluaran` via an effect.
- `src/components/Sidebar.tsx` — hides `adminOnly` nav items for karyawan
  (currently just Pengeluaran), shows account footer (avatar, name, role pill,
  logout button).
- `supabase/migrations/` — `0001_init.sql` (tables + `handle_new_user` trigger
  that makes the **first** signup an admin), `0002_rls.sql` (RLS policies),
  `0003_seed.sql` (default config, 6 tinta rows, amplop singleton, 4 kertas).
- `supabase/README.md` — setup guide.
- `.env.local` exists with the project URL + publishable key.
- `.mcp.json` — Supabase MCP server scoped to project `jbmpohlxmkbidrumotrq`.

### ⚠️ Setup status
1. ✅ **Migrations run** on project `jbmpohlxmkbidrumotrq` (0001 → 0002 → 0003),
   plus two new hardening migrations applied via MCP:
   - `0004_harden_functions.sql` — pins `search_path` on the 3 functions.
   - `0005_revoke_public_execute.sql` — revokes `PUBLIC`/`anon` RPC execute on
     `handle_new_user` + `is_admin`. Security advisor is now clean except one
     **expected** warning (`is_admin` callable by `authenticated`, which RLS
     requires — safe to ignore).
2. ✅ `.mcp.json` is in `.gitignore`. **STILL TODO (user action):** the
   `SUPABASE_ACCESS_TOKEN` is hardcoded there and was pasted in chat — **rotate
   it** at https://supabase.com/dashboard/account/tokens.
3. **STILL TODO (user action):** in Supabase Auth settings, enable Email
   provider and disable "Confirm email" for faster testing.
4. First account you register becomes admin automatically (the rest are
   karyawan). No users exist yet — register the admin first.

---

## ✅ Phase 2 — DONE (data layer: localStorage → Supabase)

**How it works now:** instead of per-module hooks, the migration uses a
**write-through `setData`** so the presentational screens barely changed:

- `src/lib/db.ts`
  - `fetchAppData()` — loads every table in parallel and assembles the existing
    `AppData` shape (device-local UI prefs merged from localStorage).
  - `persistChanges(prev, next, userId)` — diffs prev vs next `AppData` and
    writes only the slices that changed (insert new / upsert changed / delete
    removed), stamping `created_by` on inserts where the column exists.
  - `loadPrefs()/savePrefs()` — device-local UI prefs (font, size, tampilan\*)
    stay in `localStorage` under `kubik-ui-prefs:v1`.
- `src/lib/useAppData.tsx` — `useAppData(userId, onError)` hook returning
  `{ data, loading, error, setData, reload }`. `setData` is optimistic +
  write-through; on a rejected write (e.g. RLS denial) it re-syncs from the DB.
- `App.tsx` loads via `useAppData(auth.user?.id)`, gates by role, and passes the
  same `data`/`setData` down. **All screens (Home, Absen, Riwayat, Landing,
  LaporanIncome, Inventaris, Pengeluaran, Pengaturan) now run on Supabase.**
- Client-generated ids are now `crypto.randomUUID()` (`uid()`/`uidShort()`) so
  they're valid `uuid` PKs.

**Product decisions made this session:**
- **Admin = pengelola, bukan operator.** Admin tidak ikut absen dan tidak
  mengisi laporan income (entri penjualan = tugas karyawan). Admin tetap punya
  izin penuh: lihat, edit, hapus, atur harga, ekspor, kelola karyawan.
  Implementasi: `Employee.role` ('admin'|'karyawan') di-load dari `profiles.role`
  (`db.ts`); admin **tetap** di `data.employees` (kalau dibuang, write-through
  diff menganggapnya dinonaktifkan), tapi disaring di lapisan presentasi:
  - `Home.tsx` / `Landing.tsx` — roster & statistik kehadiran pakai
    `employees.filter(e => e.role !== 'admin')`.
  - `IncomeEntryModal.tsx` — admin tidak muncul sebagai pilihan operator penjualan.
  - `LaporanIncome.tsx` — kolom per-karyawan di CSV menyaring admin; tombol
    "Tambah Laporan" disembunyikan untuk admin (`canTambahLaporan = !isAdmin`).
- **Absen = self-service per karyawan.** Login = identity; the PIN-gate flow is
  removed. Karyawan can only open/clock their own card (RLS:
  `auth.uid() = employee_id`); admin can open anyone. `App.bukaAbsen()` enforces
  this; karyawan clicking another card is sent to read-only Riwayat.
- **"Tambah Karyawan" = self-register.** New staff register on the Login screen
  (→ karyawan). Home's add button is now an admin-only info toast. "Hapus
  karyawan" became **deactivate** (`profiles.active = false`) — load filters to
  `active = true`. Hard auth-user delete needs a service-role Edge Function.

**Permission model (revised — migration `0006`):** karyawan are operational
users who can EDIT data but cannot see money:
- Karyawan **can edit**: laporan income (add/edit/delete entries), inventaris &
  stok (all write controls), and **their own name only** (Home pencil → rename).
  RLS loosened to `authenticated` for the operational tables in `0006`. Profile
  edits were re-tightened in `0008`: karyawan may update only their own profile
  (`auth.uid() = id`); admin edits anyone. The Home pencil button is gated by
  `canRename = isAdmin || emp.id === currentUserId`, and `App.renameKaryawan`
  enforces the same.
- Karyawan **cannot**: see any Rupiah/income figures on the **Laporan Income**
  screen (summary stats, mini-chart, per-laporan totals/breakdown values,
  per-karyawan totals, CSV export, Print, and prices/totals inside
  `IncomeEntryModal` are all gated by `showMoney = isAdmin`). Dashboard still
  shows money (per product decision). Karyawan also can't change anyone's
  `role`/`active` — a `protect_profile_privileges` BEFORE-UPDATE trigger forces
  those back to old values for non-admins (anti privilege-escalation).
- Still admin-only: Pengeluaran (no read at all), Pengaturan "Teks & Branding",
  Laporan "Atur Harga" (prices), Home deactivate karyawan.
- `App.tsx` passes `canEdit={true}` to Inventaris and `canManage={true}` to the
  laporan rows; `showMoney`/`isAdmin` gate money + admin-only bits.

Verified: `npx tsc -b` clean, `npx vite build` clean, and the write-through
column shapes were probed against the live schema. **Not yet browser-tested with
real admin + karyawan accounts — do that next** (no users exist yet).

### Table ↔ screen mapping

| Screen / file | Supabase table | Notes |
|---|---|---|
| `screens/Home.tsx` (daftar karyawan) | `profiles` | Karyawan = profiles. "Tambah Karyawan" = admin invites/creates a profile (see below). Avatar color = `avatar_color`. |
| `screens/Absen.tsx`, `screens/Riwayat.tsx` | `absen_records` | One row per (employee_id, tanggal). `events` is jsonb array of `AbsenEvent`. `shift` is text. |
| `screens/LaporanIncome.tsx`, `IncomeEntryModal.tsx` | `laporan_income` | `items`/`upgrades` jsonb; `harga_*` snapshotted per row. Karyawan may INSERT only; admin edits/deletes. |
| `screens/Pengeluaran.tsx` | `pengeluaran` | **Admin only** (RLS blocks karyawan reads entirely). |
| `screens/Inventaris.tsx` | `stok_kertas`, `stok_tinta`, `stok_amplop`, `salah_cetak` | Karyawan read-only; admin writes. `salah_cetak` decrements `stok_kertas` (do it in a transaction / RPC to avoid races). |
| `screens/Pengaturan.tsx` | `app_config` (singleton id=1) | Branding text + prices. Theme/font/fontSize/tampilan modes are device-local UI prefs → keep in localStorage, do NOT move to DB. |

### Type ↔ column notes
- Current TS types live in `src/types.ts` (AppData, Employee, AbsenHari,
  AbsenEvent, LaporanIncome, IncomeItem, UpgradeItem, JenisKertas, Tinta,
  SalahCetak, Pengeluaran, HargaTiket, HargaUpgrade, etc.). Reuse these shapes
  for the jsonb columns so the presentational components don't change.
- `Employee.pinHash` → `profiles.pin_hash`. PIN hashing util is `hashPin()` in
  `src/storage.ts` (SHA-256, salt `absensi-salt::`). Keep it.
- Income calc helpers: `src/income.ts` (`hitungIncome`, etc.) — pure, reuse as-is.
- Attendance calc helpers: `src/attendance.ts` (`hitungRingkasan`, `cariTakeover`,
  `cariOperatorOverlap`, `istirahatDilewatiCount`, shift defs) — pure, reuse as-is.
- Inventory helpers: `src/inventory.ts`. Appearance: `src/appearance.ts`.

### Permission matrix (RLS — `0002_rls.sql`, revised by `0006`)
| Table | Admin | Karyawan |
|---|---|---|
| profiles | read+write all | read all · update **own profile only** (`auth.uid() = id`); role/active still locked by trigger |
| absen_records | read+write all | read all · insert/update **own** rows |
| laporan_income | read+write all | read all · insert + **update + delete** (money hidden in UI) |
| pengeluaran | read+write all | **no access** |
| stok_* / salah_cetak | read+write all | **read+write** (was read-only) |
| app_config | read+update | read-only |

UI gating to add (cosmetic; RLS is the real guard):
- Hide/disable in Inventaris for karyawan: Tambah/Edit/Hapus kertas, Atur stok,
  restock tinta/amplop, Catat salah cetak. Leave read views visible.
- In LaporanIncome for karyawan: allow "Tambah Laporan" (insert) but hide
  Edit/Delete on existing rows.
- In Absen: karyawan can only open their **own** absensi (others read-only or
  hidden). Decide product behavior — current PIN-gate flow may be replaced by
  "you are logged in as X, clock in for yourself."
- Pengaturan: "Teks & Branding" + prices = admin only; theme/font = everyone
  (local).

### "Tambah Karyawan" decision needed
Creating a profile requires an auth user. Options:
- (a) Admin uses Supabase dashboard / an Edge Function with service role to
  invite users by email. Cleanest, but needs an Edge Function for in-app use.
- (b) Self-register on the Login screen (already works) → new users land as
  karyawan; admin just edits their `nama`/`jabatan`/`role` afterward.
Recommend (b) for v1, add (a) later. Update Home's "Tambah Karyawan" copy
accordingly (e.g. "karyawan mendaftar sendiri, admin atur role di sini").

---

## ✅ Laporan income ↔ stok (pengurangan otomatis)

Saat laporan income disimpan, stok kertas & amplop berkurang otomatis.
- **Aturan:** tiap `tiket` + tiap `cetak` (tambahan cetak) = 1 lembar kertas;
  tiap `tiket` = 1 amplop (bisa diubah). Upgrade Poster / Crack n Share memotong
  1 lembar kertas dengan **nama yang sama** (dicocokkan via nama, karena
  `stok_kertas.id` = uuid tapi id upgrade = slug).
- **Field laporan baru** (`src/types.ts` → `LaporanIncome`): `pemakaianKertas`
  (daftar `{ kertasId, jumlah }` — bisa >1 jenis kertas per laporan kalau sehari
  pakai finishing berbeda) & `amplopTerpakai` (default = jumlah tiket, bisa
  diedit di form). Keduanya optional; laporan lama tanpa field ini dianggap
  **tidak** memotong stok (`hitungPemakaianStok` → 0) supaya edit/hapus laporan
  lama tidak salah mengembalikan stok. Form punya mode **otomatis** (1 jenis
  kertas, jumlah = tiket+cetak) & mode **manual** (pecah ke beberapa baris,
  dengan tally "dialokasikan M dari N lembar").
- **Logika** (murni, `src/income.ts`): `hitungPemakaianStok(laporan, stokKertas,
  upgradeCatalog)` → `{ kertas: {id→jumlah}, amplop }`. `terapkanPemakaianStok`
  menerapkan selisih (potong baru, kembalikan lama), di-clamp ke 0 (kolom DB
  punya CHECK `stok >= 0`) dan mengembalikan flag `kurang` untuk toast peringatan.
- **Dipakai di** `LaporanIncome.tsx` (`simpanLaporan` = selisih baru−lama,
  `hapusLaporan` = kembalikan) lewat `setData` write-through bersama
  `stokKertas`/`stokAmplop`. **Belum atomik** (sama seperti catatan salah-cetak
  dulu) — risiko rendah di 1 kiosk; bisa dipindah ke RPC `security definer` kalau
  perlu. Form: `IncomeEntryModal.tsx` (dropdown jenis kertas + kolom amplop +
  preview "akan mengurangi …").
- **DB:** migrasi `0013_laporan_pemakaian_stok.sql` (`kertas_id uuid` FK +
  `amplop_terpakai int`) lalu `0014_laporan_pemakaian_kertas_multi.sql` (kolom
  `pemakaian_kertas jsonb` + backfill dari `kertas_id`). Kolom lama `kertas_id`
  dibiarkan ada untuk fallback baca; penulisan baru mengisi `pemakaian_kertas`
  dan menulis `kertas_id = null` (lihat `db.ts` map & persist). **Keduanya
  sudah di-apply** ke `jbmpohlxmkbidrumotrq` via MCP.

---

## ✅ Dashboard Manajemen — disusun ulang jadi 4 tugas manajer

Dashboard lama punya **5 tab & 16 panel** yang dibagi per *sumber data*
("Hari Ini", "Marketing", "Uang"), sehingga satu tugas manajer tersebar ke
beberapa layar dan antrean kerjanya menumpuk jadi satu daftar 12 baris yang
mencampur kertas habis dengan lead yang belum ditelepon. Owner menyebutnya
"terlalu ruwet". Sekarang strukturnya **persis job description manajer**:

| Tab | Tugas | Bobot KPI |
|---|---|---|
| Operasional | SOP karyawan, stok terjaga, masalah teknis teratasi | 30% |
| Leads & Sales | Menjalin MoU dan berada di event | 20% |
| Social Media | Ide konten, jadwal konten naik, sosmed aktif | 20% |
| Keuangan | Menaikkan penjualan minimal 2× omzet bulan sebelumnya | 30% |

**Yang berubah:**
- **Tab "Hari Ini" & "KPI Manajer" dihapus.** Antrean dipecah per tugas dan
  muncul di kepala tab pemiliknya; badge angka di tiap label tab menggantikan
  fungsi "Hari Ini". Skor gabungan 4 tugas pindah ke hero (terlihat dari tab
  mana pun, tidak pernah merebut layar).
- **Scorecard tetap OWNER-ONLY** — keputusan produk, bukan kelalaian. Ini
  penilaian ATAS manajer; memperlihatkannya kepada yang dinilai mengubah
  perilakunya (kejar angka, bukan kejar hasil) dan membocorkan target yang
  belum disetujui. Untuk owner, blok rapor diselipkan di kepala tiap tab
  antara kalimat tugas dan antreannya. Manajer melihat kalimat tugas + seluruh
  antreannya — bahan kerjanya, bukan rapornya. Hero chip skor, banner
  "Simulasi", tombol "Atur target", dan antrean Keuangan (yang menyebut selisih
  terhadap target) semuanya ikut tertutup.
- **Penilaian owner (1–5) TETAP kelompok berbobot penuh (10%).** Ia tidak punya
  tab — bukan tugas yang bisa dikerjakan manajer — jadi dirender di panel
  "Penilaian Owner" pada tab Keuangan, bersama panel owner-only lainnya.
- **Kelompok KPI: `operasional` · `sales` · `sosmed` · `keuangan` · `owner`.**
  `hasil` dilebur ke `keuangan`, `marketing` jadi `sosmed`, `kepemimpinan`
  dibubarkan (KPI kemandirian pindah ke `operasional`). Bobot: 25 / 20 / 20 /
  25 / 10. Tipe baru `TugasManajer` = empat yang pertama, dipakai sebagai
  `TabMgr`; `KelompokKPI = TugasManajer | 'owner'`.
- **Target omzet: `saranTarget` sekarang 2× BULAN LALU** (dulu 2× rata-rata 3
  bulan). Rumusnya mengikuti kalimat yang dipakai owner menagihnya. Bulan
  ekstrem ditangani lewat override manual owner (`targetBerlaku` — nilai
  tersimpan selalu menang). `basisTarget()` baru mengembalikan bulan pembanding
  supaya layar bisa menulis "2× September" dan bukan angka tanpa asal-usul.
- **Panel "Kontribusi Konten" dihapus** (tumpang tindih dengan Sosial Media;
  daftar campaign menunggak sudah ada di antrean). "Dampak Sosmed ke Penjualan"
  dipertahankan di tab Social Media.
- **MoU & Event akhirnya muncul di dashboard** (`KemitraanPanel`). Datanya sudah
  lama ada lewat `ringkasKemitraan()` (migration 0053) tapi hanya bisa dilihat
  dengan membuka layar Leads lalu pindah tab.

### 🆕 Log kendala teknis (migration 0055)

Tugas #1 menyebut "masalah teknis teratasi" tapi tidak ada tabel yang
menyimpannya. `laporan_harian` (0052) memuat ceritanya, tapi satu paragraf per
HARI — printer macet tiga hari berturut-turut terbaca sebagai tiga kejadian,
dan tidak ada cara tahu mana yang masih menggantung sekarang.

- **Tabel `masalah_teknis`** menyimpan MASALAH, bukan hari: satu baris hidup
  sejak dilaporkan sampai `selesai_pada` terisi. `tingkat` (`stop`/`ganggu`/
  `ringan`) mengurutkan antrean — `stop` berarti studio tidak bisa jualan.
- **RLS:** semua yang login boleh SELECT & INSERT (operator di lantai yang
  menemukan kendala; `dilaporkan_oleh` dipaksa ke dirinya sendiri untuk
  non-pengelola). UPDATE & DELETE dikunci `is_admin()` — menandai selesai
  adalah keputusan, jadi kendala tidak bisa ditutup sendiri oleh pelapornya.
- **Dua jalur UI:** `KendalaStrip` di `screens/Home.tsx` (operator melapor dari
  layar yang memang dibuka tiap pagi; kendala ber-tingkat `stop` tampil terbuka
  supaya shift berikutnya melihatnya sebelum menyentuh apa pun), dan
  `MasalahTeknisPanel` di tab Operasional (pengelola menutup + riwayat solusi
  yang pernah berhasil).
- **KPI `masalah-teknis`** dinilai dari kendala yang MASUK bulan itu, bukan dari
  yang masih terbuka hari ini — kalau tidak, menutup tunggakan lama akan
  menaikkan skor bulan berjalan. Nol laporan = KPI **nonaktif**, bukan 100%:
  studio yang tidak mencatat apa pun tidak boleh dapat angka sempurna.

**✅ Migrasi 0055 sudah di-apply** ke `jbmpohlxmkbidrumotrq` (2026-09-16, via
MCP). Tabel `masalah_teknis` ada: 12 kolom, 4 policy, RLS aktif. Panel Masalah
Teknis & `KendalaStrip` sekarang hidup.

Kode ini tetap **AMAN kalau tabelnya tidak terbaca** (mis. project lain yang
belum dimigrasi). `AppData.masalahTeknisSiap` (dari `!masalahRes.error` di
`fetchAppData`) memisah
"tabelnya belum ada" dari "tabelnya ada tapi kosong". Saat `false`:
- panel Masalah Teknis jadi baca-saja + menerangkan sebabnya (tombol lapor,
  tandai selesai, buka lagi, riwayat & tally semuanya disembunyikan);
- `KendalaStrip` di Home **tidak dirender sama sekali** — operator tidak perlu
  membaca instruksi migrasi, dan tombol yang bisa ditekan akan menerima
  laporannya lalu membuangnya diam-diam (insert gagal -> `useAppData` menarik
  ulang dari server -> ketikannya lenyap);
- KPI "Kendala teknis dibereskan" berstatus `belum-aktif`, jadi ia keluar dari
  pembagi skor, bukan dihitung nol.

Sisa dashboard tidak terpengaruh. Migrasinya idempoten (`create table if not
exists`, `drop policy if exists`) dan seluruh dependensinya sudah ada:
`touch_updated_at()` (0001), `is_admin()` (0002), `gen_random_uuid()` (0001).

**Project ref: `jbmpohlxmkbidrumotrq` — satu-satunya, tidak ada yang lain.**
Dipakai `.env.local`, `.mcp.json`, dan env Production Vercel
(`kubikteam/kubik-system`). Versi dokumen sebelumnya memperingatkan adanya ref
kedua `mdfibmiujwrhnkufaaco`; ref itu tidak pernah ada (DNS-nya tidak resolve,
dan `GET /v1/projects` hanya memulangkan satu project). Peringatan itu ditulis
agen yang berjalan di environment Claude web, yang env-nya bukan env produksi.

### Preview lokal tanpa Supabase
`src/__preview__/` + `preview.html` / `home-preview.html` merender Dashboard
Manajemen & Home dengan data contoh, tanpa login. `npm run dev` lalu buka
`/preview.html`. Tombol di pojok menukar sudut pandang Owner <-> Manajer
(dipakai memastikan scorecard tidak bocor ke manajer), dan sakelar
`masalahTeknisSiap` di `data.ts` mensimulasikan keadaan sebelum migrasi. Tidak
ikut ke bundel produksi — `vite build` hanya memakai `index.html` sebagai
entry.

---

## 🔲 Phase 3 — remaining (polish / follow-ups)

1. **Browser-test as both roles** (highest priority). Register the first account
   (→ admin), then a second (→ karyawan). Verify: karyawan can clock only
   themselves, can't see Pengeluaran, can't edit inventaris/laporan; admin can
   do everything. Watch for RLS-denial toasts (the hook re-syncs on failure).
2. **Admin "Edit Karyawan" UI.** Admin can deactivate but can't yet change a
   karyawan's `role`/`jabatan`/`nama` in-app. `profiles` RLS allows admin
   updates; `persistChanges` already updates `nama`/`jabatan`/`pin_hash` on
   employee diff — but `role` isn't on the `Employee` type. Add a small admin
   modal (set jabatan + promote/demote role). Note: `Employee` would need a
   `role` field, or do role updates through a dedicated mutator.
3. **Hard-delete employee** (optional) — needs a service-role Edge Function to
   delete the `auth.users` row. Today it's soft-deactivate only.
4. **Atomic salah-cetak decrement.** `catatSalahCetak` currently writes
   `salah_cetak` insert + `stok_kertas` update as two statements in one
   `setData` diff (not transactional). Low risk on a single kiosk; for safety
   add a `salah_cetak_catat(kertas_id, jumlah, …)` SQL RPC (`security definer`)
   that does both in one transaction and call it directly.
5. ✅ **Dead code dihapus** (2026-09-16): `src/screens/PinGate.tsx` +
   `src/components/Keypad.tsx` (satu-satunya pemakainya) + `hashPin()` di
   `src/storage.ts`. Bit localStorage di `storage.ts` sudah lebih dulu bersih —
   yang tersisa cuma `uid`, `todayKey`, dan konstanta `HARGA_*_DEFAULT` yang
   di-import `db.ts`. `AddEmployeeModal.tsx` **masih dipakai** `App.tsx`,
   jangan dihapus (catatan lama di sini keliru).

   Sisa jejak PIN yang **sengaja dibiarkan**: `Employee.pinHash` (`types.ts`)
   dan kolom `profiles.pin_hash`. Keduanya terikat ke skema dan ke diff
   write-through `persistChanges`; mencabutnya bukan sekadar hapus file.
6. **Realtime (optional):** `supabase.channel().on('postgres_changes', …)` on
   `absen_records` for a live "sedang kerja" dashboard. Polling/refetch
   (`reload()`) is fine for v1.
7. **Generate TS types (optional):** `mcp__supabase__generate_typescript_types`
   to replace the hand-written row types in `db.ts`.

---

## 🆕 Bonus sosial media → gaji pokok operator (migration 0058)

Aturan yang dijanjikan ke operator: **gaji pokok naik Rp 800.000 → Rp 1.000.000
untuk satu bulan kalau KETIGA target sosial media terpenuhi di bulan itu.**
Kurang satu pun, tarifnya tetap angka dasar — sengaja "semua atau tidak sama
sekali" supaya janjinya muat dalam satu kalimat dan tidak bisa dipenuhi lewat
syarat yang paling mudah saja.

| Target | Bukti yang dibaca | Patokan |
|---|---|---|
| Story konten tiap hari kerja | `klaim_sosmed` jenis `story`, status `disetujui` (**0060**) | jumlah hari `emp` benar-benar masuk kerja di bulan itu |
| Konten min. 4/bulan | `promo_programs` `jenis='konten'`, `pic=emp`, `tahap='selesai'`, `selesai_pada` di bulan itu | 4 |
| Live min. 2×/bulan | `klaim_sosmed` jenis `live`, status `disetujui` (**0060**) | 2 per orang (`TARGET_LIVE_SEBULAN`) |

> ⚠️ **Sumber story & live PINDAH di migrasi 0060.** Versi pertama membacanya
> dari `sosmed_harian.story`/`.live` dengan atribusi lewat `oleh_list`. Itu
> sudah tidak berlaku — lihat bagian "Operator melapor, pengelola menyetujui"
> di bawah. Kolom lamanya tetap ada untuk baris lama dan sudah dipindahkan ke
> `klaim_sosmed` oleh backfill 0060.

Semua logikanya murni di **`src/bonusSosmed.ts`** (`capaianBonus`,
`gajiPokokBerlaku`) — `gaji.ts` **tidak berubah sama sekali**.
Bonus bekerja dengan menaikkan **tarif gaji pokok** yang dioper ke
`hitungSlipGaji`, bukan dengan menambah baris bonus baru: yang dijanjikan
memang "gaji pokoknya naik", dan gaji pokok di sini diakru per hari hadir.

Keputusan yang jangan diubah tanpa memikirkan ulang alasannya:

- **Penyebut story = hari `emp` masuk kerja**, bukan 30 hari. Studio cuma punya
  satu akun; yang bertanggung jawab atas story hari ini adalah yang sedang
  shift. Adil dua arah — operator yang jarang masuk punya penyebut kecil tapi
  tetap harus mengisi SEMUA harinya. Definisi "hari kerja" disalin persis dari
  `hariHadir` di `gaji.ts` (cuti/libur/bersih/pantau tidak termasuk), dan
  dipotong di `hariIni`.
- **Dinilai saat BULAN TUTUP**, bukan real-time. Selama bulan berjalan slip
  memakai tarif dasar dan hanya menampilkan progres + proyeksi. Kalau kenaikan
  dipakai real-time, nominal gaji yang sudah dilihat operator bisa TURUN lagi
  besoknya begitu satu hari bolong — angka gaji tidak boleh bergerak mundur.
- **Live ditagih PER BULAN (2×), bukan per minggu.** Owner menyebutnya "dua
  minggu sekali", tapi yang dihitung angka sebulan — jarak antar-siaran sengaja
  TIDAK dipaksa. Menghanguskan Rp 200.000 karena dua live kebetulan jatuh di
  minggu yang sama jauh lebih keras daripada yang dijanjikan ke operator.
  Dengan 2 operator, studio menghasilkan 4 live sebulan. Aturan minggu lama
  (`mingguDinilai`, `MIN_HARI_MINGGU_DINILAI`) sudah dihapus.
- **Atribusi** tidak lagi ditebak dari `olehList`: sejak 0060 tiap laporan
  memang milik satu orang (`klaim_sosmed.employee_id`). Aturan lama
  "`olehList` kosong = diakui untuk siapa pun" sudah dihapus bersama masalah
  yang melahirkannya.
- **Konten hanya dihitung dari `selesai_pada`** (stempel trigger database),
  bukan `deadline`/`createdAt` yang cuma perkiraan. Untuk uang, perkiraan
  tidak cukup.
- **Anti-curang**: operator boleh MELAPOR, tidak boleh MENYETUJUI. Trigger
  `protect_klaim_sosmed` (0060) memaksa tiap tulisan non-pengelola jadi
  `'menunggu'` atas nama dirinya sendiri, dan `selesai_pada` konten distempel
  database (0046). Tidak ada satu pun jalan dari layar operator ke angka yang
  dihitung.
- **`Math.max(dasar, 1.000.000)`** menjaga karyawan yang gaji dasarnya sudah di
  atas patokan tidak justru TURUN karena berprestasi. Konsekuensinya bonus ini
  tidak berarti apa-apa bagi mereka; kalau suatu saat ada operator senior
  seperti itu, ubah jadi tambahan (dasar + selisih), bukan patokan absolut.

### 🐞 Bug lama yang ikut ketahuan & diperbaiki

`db.ts` men-`select` `sosmed_harian` **tanpa `oleh_list`**, padahal mapper-nya
membaca `r.oleh_list`. Akibatnya sejak migrasi 0049 hari yang dikerjakan BERDUA
selalu terbaca satu orang saja (jatuh ke kolom lama `oleh`). Tidak terasa
sebelum ini — begitu `hariSosmed` dipakai menghitung uang, orang kedua
kehilangan haknya atas bonus. Sekarang `oleh_list` & `live` ikut di-`select`.

⚠️ **Konsekuensi**: kolom yang disebut di `.select()` WAJIB ada. PostgREST
menolak kolom asing, dan di `db.ts` penolakan itu diperlakukan sama dengan
"tabel tidak terbaca" → slice-nya jatuh ke `[]`. Jadi komentar "toleran kalau
migrasi belum jalan" **tidak berlaku** untuk kolom yang ikut di select; `?? false`
di mapper hanya menjaga dari nilai null.

### Perubahan yang menyertainya

- `SosmedHarian.live` (`types.ts`) + kolom `sosmed_harian.live` (**migrasi 0058
  sudah di-apply** ke `jbmpohlxmkbidrumotrq`, 2026-09-17 via MCP). `db.ts`
  membacanya dengan fallback `false` supaya app lama tetap jalan.
- `AKSI_SOSMED` bertambah `'live'`; label `story` diubah jadi **"Story konten"**
  dan ada `AKSI_SOSMED_HINT` baru. Batas story-konten vs repost menentukan uang,
  jadi ditulis sebagai `title` chip + catatan di tab Social Media — tempat
  centangnya dibuat, bukan cuma di dokumentasi ini.
- `GajiKaryawan.tsx`: komponen `BonusSosmed` di dalam slip (3 baris progres +
  status), disembunyikan kalau gaji dasar 0 atau sudah ≥ Rp 1.000.000.
  **PENTING** — kolom input gaji pokok mengedit `bonus.gajiPokokDasar`, BUKAN
  `slip.gajiPokok` (yang sudah termasuk kenaikan). Kalau tertukar, satu blur
  akan menyimpan Rp 1.000.000 sebagai gaji dasar permanen.
- `kas.ts` & rekap bulanan di `LaporanIncome.tsx` ikut memakai
  `gajiPokokBerlaku()` — kalau tidak, uang yang keluar dari kas tidak sama
  dengan slip yang dibayarkan.
- `geserHari()` di `manajemen.ts` sekarang di-export (dipakai `bonusSosmed.ts`).
  Ia sengaja memakai waktu lokal; jangan diganti `toISOString()`, yang menggeser
  tanggal satu hari di GMT+7.

**Belum diuji di browser dengan data sungguhan** — `npx tsc -b` & `npx vite
build` bersih, dan logikanya diverifikasi lewat skrip sekali-pakai (7 skenario:
lulus, bulan berjalan, story bolong 1 hari, konten kurang 1, atribusi ke orang
lain, bulan baru mulai, gaji dasar di atas patokan).

---

## 🆕 Giliran Live di layar Jadwal (migration 0059)

Dari tiga target bonus, hanya **live** yang belum punya jadwal — story sudah
terjawab roster (yang shift hari itu, dialah yang story) dan konten sudah punya
`deadline` di Papan Promosi (papan "Denyut Mingguan" sudah dihapus, lihat
bagian bawah). Membuat baris story atau
konten di sini akan jadi grid kedua yang mengulang papan yang sudah ada, dan
tanggal konten yang bisa diatur dari dua layar pasti akan berbeda. **Jangan
tambahkan keduanya.**

- **`jadwal_shift.live`** (kolom baru) = RENCANA. Ditempel ke baris roster, bukan
  tabel sendiri, karena live tidak bisa berdiri di luar shift: yang siaran
  adalah yang sedang di studio. Aturan itu jadi berlaku sendiri — `setSel()`
  menggugurkan `live` begitu selnya berubah jadi cuti/libur/kosong, dan
  mempertahankannya untuk pagi ↔ sore ↔ penuh (cuma geser jam).
- **`sosmed_harian.live`** (0058) = REALISASI — **sudah digantikan `klaim_sosmed`
  di 0060 dan panelnya dihapus**; dulu dicentang pengelola di
  Dashboard Manajemen. Layar Jadwal hanya MEMBACANYA dan mengunci selnya —
  pola yang sama persis dengan cuti ACC yang menimpa rencana. Tidak ada jalur
  tulis baru, jadi tidak ada lubang anti-curang baru.

Pasangannya jadi sejajar: `jadwal_shift` ↔ `absen`, `jadwal_shift.live` ↔
`sosmed_harian.live`.

Empat keadaan sel Live, semuanya perlu dibedakan:

| Sel | Arti |
|---|---|
| kosong | belum dijadwalkan |
| biru bergaris | dijadwalkan, tanggalnya belum lewat |
| **merah** | dijadwalkan tapi tanggalnya lewat **tanpa** catatan live |
| hijau (terkunci) | live terlaksana, dari log sosmed |
| redup | tidak ada yang bertugas hari itu — tidak ada yang bisa ditunjuk |

Yang merah itu **wajib ada**. Tanpa state itu, jadwal yang meleset tampil sama
dengan jadwal yang masih akan datang, dan gunanya papan ini hilang.

**Rekap per minggu di bawah tabel adalah inti panelnya**: lubang minggu ini
harus terlihat hari SENIN, bukan ketahuan saat bulan sudah tutup. Definisi
rekapnya sekarang BULANAN (`min. 2× per orang`), sejalan dengan
`TARGET_LIVE_SEBULAN`.

**Rencana TIDAK ikut menghitung bonus.** `bonusSosmed.ts` hanya membaca
realisasi. Menjadwalkan live bukan bukti live.

**Preview:** `jadwal-preview.html` → `src/__preview__/jadwal.tsx`. Roster
sebulan penuh dirakit di berkas preview itu, bukan di `data.ts`, supaya preview
Dashboard Manajemen (yang menilai cakupan shift) tidak ikut berubah.

---

## 🆕 Operator melapor, pengelola menyetujui (migrations 0060 & 0061)

**Perubahan arah, dan ia MEMBATALKAN sebagian rancangan 0058/0059.** Sebelum
ini story & live hanya bisa dicatat pengelola. Aman dari sisi anti-curang, tapi
seluruh beban pencatatan jatuh ke satu orang: kalau manajer telat mencentang,
**operator** yang kehilangan bonusnya — padahal bukan dia yang lalai.

Alurnya sekarang memakai idiom yang sudah dipakai dua kali di aplikasi ini
(`absen_records.status`, dan lampiran desain di 0057): **operator MELAPOR →
`'menunggu'` → pengelola MEMERIKSA → `'disetujui'` → baru dihitung.**

### `klaim_sosmed` (0060) — story & live

- PK `(tanggal, employee_id, jenis)`. Grain-nya per ORANG, bukan per tanggal
  seperti `sosmed_harian`: story dua operator di hari yang sama harus terpisah,
  karena yang dinilai dan dibayar adalah orangnya.
- **Tabel sendiri, BUKAN kolom di `jadwal_shift`** — ini koreksi penting atas
  rancangan 0059. Klaim tidak boleh bergantung pada roster terisi: penyebut
  bonus diambil dari **presensi**, jadi hari yang rosternya bolong tetap
  menghitung, dan operator harus tetap bisa melapor di hari itu.
- `jadwal_shift.live` (0059) **tetap dipakai** dan tetap berarti RENCANA
  ("minggu ini live hari Rabu"). Pasangan rencana ↔ realisasi utuh:
  `jadwal_shift` ↔ `absen`, `jadwal_shift.live` ↔ `klaim_sosmed` jenis live.
- Trigger `protect_klaim_sosmed`: non-admin → `employee_id := auth.uid()`,
  `status := 'menunggu'`, dan klaim yang sudah di-ACC **dikembalikan ke `old`**
  (kalau tidak, pelapor tinggal menunggu ACC lalu mengganti isinya). Admin →
  `disetujui_oleh`/`disetujui_pada` distempel server, tidak pernah dari client
  (`syncKlaim` di `db.ts` sengaja tidak mengirim dua kolom itu).
- RLS: SELECT semua yang login (operator perlu melihat progresnya — itu seluruh
  guna papan ini). DELETE oleh operator **hanya** selama `status='menunggu'`.
- **Backfill**: `sosmed_harian.story/.live` lama dipindah jadi klaim
  `'disetujui'`. Tanpa itu slip bulan lampau akan berubah sendiri. Trigger
  dimatikan sementara selama backfill — ia bersandar pada `auth.uid()` yang
  null saat migrasi jalan.

### `promo_programs.tahapan` dibuka untuk PIC (0061)

Konten **tidak** ikut ke `klaim_sosmed`: satuannya KARTU, bukan tanggal, dan
kartunya sudah punya centang take → edit → tayang (0051) yang sebelumnya
admin-only. 0061 membuka `tahapan` — **hanya kolom itu, hanya untuk `old.pic =
auth.uid()`, dan hanya selama kartunya belum `'selesai'`**. Semua kolom lain
tetap dibekukan oleh `protect_promo_status`.

Alur ACC-nya sudah ada, tidak perlu status baru:

| Aksi | Siapa | Arti |
|---|---|---|
| centang `tayang` | PIC | klaim — **tidak dihitung apa pun** |
| pindahkan kartu ke `selesai` | pengelola | ACC — `selesai_pada` distempel, inilah yang dihitung bonus |

`bonusSosmed.ts` tidak pernah membaca `tahapan`, jadi membukanya tidak membuka
satu pun jalan ke uang. UI-nya di `screens/Promosi.tsx` (papan yang memang
dilihat operator). Papan Denyut Mingguan yang dulu memegang centang ini
sudah dihapus.

### Layar Jadwal jadi papan lapor

Di bawah roster: satu baris per **(orang × tugas)** — Story & Live — plus satu
baris **Konten tayang** yang BACA-SAJA (diturunkan dari kartu promo; menaruh
jalur tulis kedua di sini akan melahirkan dua tanggal "konten selesai" yang
bisa berbeda).

Satu klik memutar status, dan urutannya berbeda menurut penekannya:

| | kosong | menunggu | disetujui |
|---|---|---|---|
| **pengelola** | → disetujui | → disetujui (ACC) | → kosong (cabut) |
| **operator (barisnya sendiri)** | → menunggu | → kosong (cabut) | terkunci |

Warna selnya: `○` biru = live dijadwalkan · `•` kuning = dilaporkan, belum
diperiksa · `✓` hijau = disetujui · `✕` merah = **terlewat**.

Merah hanya menyala untuk kewajiban yang benar-benar ada: story pada hari orang
itu MASUK KERJA (dari presensi, aturan disalin persis dari `bonusSosmed.ts`),
live pada hari yang memang dijadwalkan untuknya. **Kuning sengaja bukan hijau**
— yang belum di-ACC tidak menambah apa pun dan warnanya tidak boleh menjanjikan
sebaliknya.

### Dashboard Manajemen: panel sosmed & Denyut Mingguan DIHAPUS

Empat panel dibuang seluruhnya — "Sosial Media", "Sosmed Hari Ini", "Denyut
Mingguan", dan "Konten Minggu Ini" — beserta `sosmed_harian` di lapisan data.
Alasannya **keterbacaan**, bukan statistik pemakaian: sistemnya memang belum
dijalankan, jadi kolom kosong di sana bukan bukti apa pun.

Yang hilang dan TIDAK punya rumah lagi: `posting`, `repost`, `engagement`.
Kalau `engagement` suatu saat perlu dilacak, tempatnya jadi **jenis ketiga di
`klaim_sosmed`** (operator lapor, pengelola ACC) — bukan menghidupkan lagi
panel centang manajer.

Kenapa Denyut Mingguan ikut dibuang meski ia satu-satunya papan rantai
produksi: **targetnya bertabrakan dengan bonus.** Ritme memakai N konten per
MINGGU (tersimpan `{"jumlah": 3}`), bonus memakai 4 konten per BULAN. Dua angka
untuk hal yang sama, beda lebih dari tiga kali lipat. Yang dipertahankan hanya
kosakata tahapnya (`TAHAP_KONTEN`, `TAHAP_KONTEN_LABEL`), karena PIC masih
mencentang take → edit → tayang di kartunya sendiri (0061).

Yang ikut berubah:

- **`aktivitasSosmed()` & `dampakSosmed()` sekarang MURNI dari klaim disetujui.**
  Tidak ada lagi centang manual yang bisa menaikkan angka tanpa pemeriksaan —
  alasan yang sama dipakai saat tombol "Selesai oleh" dibuang dari panel Butuh
  Tindakan. `HariSosmed` menyusut jadi `{tanggal, berjalan, aktif}`;
  `hariEngagement`, `jumlahAksi`, dan `olehList` hilang.
- **Baris KPI "Konten mingguan tepat ritme" dihapus** dari scorecard, beserta
  `TARGET_DENYUT`. Baris "Hari sosmed aktif" tetap ada, sumbernya kini klaim.
- **Dihapus dari `manajemen.ts`**: `denyutKonten()` + seluruh mesin ritme/slot,
  `AKSI_SOSMED*`, `pengerjaSosmed()`, `RITME_DEFAULT`, `jarakTahap()`,
  `hariBawaanSlot()`, dan `kontribusiKonten()` — yang terakhir sudah **dead code
  sejak panelnya dihapus** (tidak ada satu pun pemanggil).
- **Dihapus dari `types.ts`/`db.ts`**: `SosmedHarian`, `RitmeKonten`,
  `AppData.sosmedHarian`, `AppData.ritmeKonten`, `app_config.ritme_konten`, dan
  helper `isUuid()`.
- Tab Social Media menyisakan panel "Dampak Sosmed ke Penjualan" + satu
  paragraf penunjuk arah ("Story & Live dilaporkan di Jadwal Karyawan, Konten
  dicentang di Papan Promosi"), supaya tidak ada yang mencarinya di sini lalu
  menyangka fiturnya hilang.

⚠️ **Tabel `sosmed_harian` & kolom `app_config.ritme_konten` SENGAJA TIDAK
di-drop.** Datanya utuh di database dan aplikasi cuma berhenti membacanya — 12
baris lama sudah dipindahkan ke `klaim_sosmed` oleh backfill 0060. Tidak ada
migrasi baru untuk perubahan ini.

### Ringkasan tugas di Dashboard Manajemen

Panel **"Tugas Sosial Media"** di tab Social Media: satu baris per operator
dengan pil `Story n/m · Konten n/4 · Live n/2`, lencana jumlah laporan yang
menunggu, dan tombol yang membuka layar Jadwal. **Baca saja** — menyetujui
tetap dilakukan di Jadwal, tempat konteksnya lengkap (hari itu siapa yang
shift, hari mana yang bolong).

⚠️ Panel ini memanggil `capaianBonus()` dengan gaji pokok **0** dengan sengaja:
yang dipakai hanya `syarat` (angka capaian), dan **manajer tidak boleh melihat
gaji** (lihat `lib/roles.ts`). Mengoper 0 memastikan tidak ada nominal rupiah
yang pernah ikut terhitung di layar ini. Jangan diganti jadi gaji sebenarnya.

Pil dengan `target === 0` (mis. belum ada hari kerja tercatat) digambar `—` dan
tidak pernah hijau: belum ada yang ditagih bukan prestasi.

### Posting, repost, & engagement: di checklist operator

Ketiganya BUKAN bagian papan tugas ini — mereka SOP harian operator, tempatnya
`app_config.opening_checklist` / `closing_checklist` (diatur di Pengaturan), dan
tugas manajer memastikannya dijalankan lewat KPI kepatuhan checklist yang sudah
ada. Jangan menghidupkan lagi centang sosmed harian di dashboard untuk ini.

**Belum diuji di browser dengan akun operator sungguhan.** Yang sudah: `tsc -b`
& `vite build` bersih, dan papannya dilihat lewat `jadwal-preview.html` dalam
keadaan lengkap (disetujui, menunggu, terlewat, dijadwalkan, hari libur).
Trigger & RLS 0060/0061 **belum pernah diadu dengan sesi operator asli** — itu
uji yang paling penting berikutnya.

---

## 🆕 Pengingat harian manajer via Telegram (migration 0062)

**Masalahnya:** pekerjaan manajer yang terlewat (laporan harian, ACC absen, ACC
klaim sosmed, menutup kartu konten, follow-up lead) semuanya berupa sesuatu yang
TIDAK terjadi. Ketiadaan tidak bisa memicu trigger, jadi bentuknya pemeriksaan
terjadwal — bukan notifikasi per kejadian. Tidak ada satu pun trigger baru.

**Bagian-bagiannya:**

- `notifikasi_tunggakan()` (0062) — mengembalikan `kode, label, jumlah,
  umur_hari` untuk 8 pemeriksaan. `umur_hari` dikembalikan sebagai ANGKA, bukan
  kalimat jadi, karena ambang eskalasi diatur owner di layar. `umur_hari = -1`
  berarti pemeriksaan soal KEADAAN, bukan keterlambatan (`stok_frame`): umurnya
  tidak ditulis di pesan dan tidak pernah ikut eskalasi ke owner. Ambang stok
  frame sengaja 1 — frame tidak harus selalu di-restock, dan ambang longgar
  membuat pesannya berbunyi tiap pagi lalu berhenti dibaca.
  `select * from public.notifikasi_tunggakan();` memperlihatkan persis apa yang
  akan dikirim tanpa mengirim apa pun.
- `app_config.notifikasi` — sakelar per pemeriksaan + chat id tujuan +
  `eskalasiHari`. **Token bot TIDAK di sini** (app_config terbaca semua user
  login); token hidup sebagai secret edge function `TELEGRAM_BOT_TOKEN`.
- `notifikasi_log` — riwayat kirim. Hanya bisa DIBACA pengelola; penulisnya
  cuma service role, jadi tidak bisa dirapikan oleh orang yang sedang dinilai.
- Edge function `notifikasi-manajer` — pengirimnya. Otorisasi cron =
  `Authorization: Bearer <service role key>` (header itu toh wajib untuk lolos
  `verify_jwt`, jadi tidak ada secret kedua yang perlu dirotasi).
- Kartu "Pengingat Harian Manajer" di Pengaturan — **owner-only** (`isOwner`),
  bukan `isAdmin`: manajer memang pengelola, tapi dialah yang sedang diingatkan.

**Aturan yang menjaga fiturnya tetap berguna:** kalau tidak ada yang menunggak,
tidak ada pesan sama sekali. Sunyi = aman, jadi pesan yang masuk selalu berarti.

**Menambah pemeriksaan** harus di tiga tempat sekaligus — `notifikasi_tunggakan()`,
`PERIKSA_NOTIFIKASI`, dan `PERIKSA_LABEL` (keduanya di `src/types.ts`). Kalau
`kode`-nya beda, sakelarnya tidak mengenai apa pun dan pemeriksaannya diam-diam
selalu menyala.

**Dua sesi (migration 0063).** `notifikasi_tunggakan(p_sesi)` — `'pagi'` memuat
seluruh antrean yang menumpuk, `'malam'` HANYA laporan hari ini yang belum
ditutup. Alasannya: cek laporan harian versi pagi memindai `current_date - 1` ke
belakang, jadi ia mengabarkan laporan KEMARIN yang sudah tidak bisa diperbaiki —
laporan kematian, bukan pengingat. Sesi malam sengaja sesempit itu supaya dua
pesan sehari tidak saling mengulang, dan tidak pernah mengeskalasi ke owner
(umurnya nol). Butuh DUA cron job; bedanya cuma body `{}` vs `{"sesi":"malam"}`.

**STILL TODO (user action):** buat bot di @BotFather, pasang secret
`TELEGRAM_BOT_TOKEN`, isi chat id di Pengaturan, jadwalkan cron 08:00 WIB.
Langkah lengkapnya di `supabase/functions/notifikasi-manajer/README.md`.

---

## Build / run
- `npm run dev` (Vite, port 5173). `npm run build` = `tsc -b && vite build`.
- After editing `.env.local`, **restart** dev server.
- Verify after each module: `npx tsc -b` (must be clean) then `npx vite build`.
- This session has been verifying via `curl localhost:5173/src/<file>` to confirm
  transforms; real browser test as both an admin and a karyawan account is the
  important check for RLS.

## Gotchas observed this session
- Project is **Vite**, env prefix must be `VITE_*` (not `NEXT_PUBLIC_*`).
- Supabase now issues `sb_publishable_...` keys (not the old `anon` JWT) — the
  client accepts it as the second arg fine.
- Inline SVGs need explicit size; there's a global `svg { width:1em; height:1em }`
  safety rule in `index.css`. Keep it.
