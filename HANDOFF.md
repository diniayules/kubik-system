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
5. **Delete dead code:** `src/screens/PinGate.tsx` and
   `src/screens/AddEmployeeModal.tsx` are no longer imported (PIN flow removed).
   Strip the localStorage data bits from `src/storage.ts` (`loadData`,
   `saveData`, the `migrasi*` helpers, `EMPTY`) — keep `hashPin`, `uid`,
   `todayKey`, and the `HARGA_*_DEFAULT` consts (db.ts imports those).
6. **Realtime (optional):** `supabase.channel().on('postgres_changes', …)` on
   `absen_records` for a live "sedang kerja" dashboard. Polling/refetch
   (`reload()`) is fine for v1.
7. **Generate TS types (optional):** `mcp__supabase__generate_typescript_types`
   to replace the hand-written row types in `db.ts`.

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
