# Pengingat harian manajer (Telegram)

Sekali sehari sistem memeriksa apa yang masih menggantung, lalu mengirim satu
pesan Telegram ke manajer. Yang sudah lewat ambang umur ditembuskan ke owner.
**Kalau tidak ada yang menunggak, tidak ada pesan yang dikirim.**

Bagian-bagiannya:

| Bagian | Tempat |
|---|---|
| Daftar pemeriksaan + umurnya | `notifikasi_tunggakan()` — migration 0062 |
| Sakelar & chat id tujuan | `app_config.notifikasi` — diatur owner di Pengaturan |
| Riwayat pesan terkirim | tabel `notifikasi_log` |
| Pengirim | edge function ini |
| Penjadwal | Supabase Cron (lihat langkah 4) |

---

## 1. Membuat bot

1. Di Telegram, buka **@BotFather** → `/newbot` → ikuti namanya.
2. BotFather memberi **token** berbentuk `123456789:AAF...`. Simpan.

## 2. Menaruh token sebagai secret

Dashboard Supabase → **Edge Functions → Secrets** → tambah:

```
TELEGRAM_BOT_TOKEN = 123456789:AAF...
```

Token **tidak boleh** ditaruh di `app_config` maupun `.env` frontend: `app_config`
terbaca semua user yang login, dan semua `VITE_*` ikut terbundel ke browser.
Siapa pun yang memegang token bisa mengirim pesan atas nama bot itu.

## 3. Mengambil chat id

1. Manajer (dan owner, kalau mau ditembusi) mengirim satu pesan apa pun ke bot.
   Telegram tidak mengizinkan bot memulai percakapan — langkah ini wajib.
2. Buka di browser: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Salin angka pada `chat.id` masing-masing orang.
4. Isikan di **Pengaturan → Pengingat Harian Manajer**, lalu **Simpan**.
5. Tekan **Kirim uji coba** untuk memastikan sambungannya benar sebelum
   mengaktifkan.

## 4. Menjadwalkan

Cara termudah — Dashboard Supabase → **Integrations → Cron** → *Create job*:

- **Name**: `notifikasi-manajer-harian`
- **Schedule**: `0 1 * * *`  (01:00 UTC = **08:00 WIB**)
- **Type**: `Supabase Edge Function` → pilih `notifikasi-manajer`
- **Method**: `POST`, body `{}`

Jalur ini otomatis menyertakan header otorisasi, jadi tidak ada kunci yang perlu
disalin ke mana pun.

<details>
<summary>Alternatif lewat SQL (kalau UI Cron tidak dipakai)</summary>

Perlu service role key tersimpan di Vault lebih dulu — jalankan di SQL Editor,
**bukan** dari repo ini, supaya kuncinya tidak pernah masuk git:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');

select cron.schedule(
  'notifikasi-manajer-harian',
  '0 1 * * *',
  $$
  select net.http_post(
    url := 'https://jbmpohlxmkbidrumotrq.supabase.co/functions/v1/notifikasi-manajer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
```

</details>

---

## Memeriksa hasilnya

Apa yang sedang menunggak, tanpa mengirim apa pun:

```sql
select * from public.notifikasi_tunggakan();
```

Pesan apa saja yang sudah pernah dikirim:

```sql
select terkirim_at, jenis, berhasil, error, isi
from public.notifikasi_log
order by terkirim_at desc
limit 20;
```

## Menambah pemeriksaan baru

Tiga tempat, harus ketiganya:

1. `notifikasi_tunggakan()` — satu blok `return query` baru yang mengembalikan
   `kode`, `label`, `jumlah`, `umur_hari`.
2. `PERIKSA_NOTIFIKASI` di `src/types.ts` — `kode` yang sama persis.
3. `PERIKSA_LABEL` — label sakelarnya di Pengaturan.

Kalau `kode` di SQL dan di `PERIKSA_NOTIFIKASI` berbeda, sakelarnya tidak akan
mengenai apa pun dan pemeriksaannya diam-diam selalu menyala.

**`umur_hari` = -1** untuk pemeriksaan yang soal KEADAAN, bukan soal
keterlambatan — `stok_frame` contohnya. Umurnya tidak ditulis di pesan (menulis
"hari ini" akan terbaca seolah keadaannya baru muncul pagi ini) dan item itu
tidak pernah ditembuskan ke owner sebagai eskalasi.

## Kenapa ambang stok frame cuma 1

Frame bukan barang yang harus selalu di-restock, dan habisnya satu jenis tidak
menghentikan apa pun hari itu juga. Dengan ambang longgar (3 atau 5) hampir tiap
pagi ada saja jenis yang lewat ambang — dan pengingat yang selalu berbunyi
berhenti dibaca, yang merugikan tujuh pemeriksaan lain di pesan yang sama. Jenis
frame yang sudah tidak dijual sebaiknya dihapus dari Inventaris, bukan dibiarkan
bersisa 0 dan menyebut dirinya tiap hari.
