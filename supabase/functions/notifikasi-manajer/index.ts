// =============================================================
// notifikasi-manajer · Edge Function
// -------------------------------------------------------------
// Mengirim satu pesan Telegram berisi apa saja yang masih menunggak,
// dan menembuskannya ke owner untuk item yang sudah melewati ambang
// umur. Dipanggil dua kali sehari oleh cron, atau sekali-sekali oleh
// tombol "Kirim uji coba" di Pengaturan.
//
// DUA SESI, dua watak yang berbeda (lihat migration 0063):
//   'pagi'  (08:00) — antrean yang menumpuk dari hari-hari sebelumnya,
//                     punya waktu sehari penuh untuk dibereskan.
//   'malam' (21:00) — hanya yang masih bisa diselamatkan malam itu juga:
//                     laporan hari ini yang belum ditutup. TIDAK PERNAH
//                     jadi eskalasi — harinya belum habis, jadi belum
//                     pantas diadukan ke owner.
//
// Dua jalur masuk, dua cara memeriksa pemanggilnya:
//   1. pg_cron  → `Authorization: Bearer <service role key>`. Header itu
//                 memang sudah wajib dikirim supaya lolos verify_jwt, dan
//                 hanya server yang memegang kuncinya — jadi tidak perlu
//                 secret kedua yang harus ikut dijaga dan dirotasi.
//   2. Layar    → Authorization JWT biasa, pemanggilnya harus pengelola.
//
// TOKEN BOT hidup di sini sebagai secret, tidak pernah di database
// maupun frontend: `app_config` boleh dibaca semua user login, dan
// siapa pun yang memegang token bot bisa mengirim pesan atas nama bot
// itu. Alasan yang sama seperti SERVICE_ROLE_KEY di create-karyawan.
//
// KENAPA SUNYI SAAT TIDAK ADA TUNGGAKAN: pengingat yang datang tiap
// hari apa pun isinya akan berhenti dibaca dalam dua minggu. Kalau
// tidak ada yang menunggak, fungsi ini tidak mengirim apa-apa — jadi
// setiap pesan yang masuk selalu berarti ada yang perlu dikerjakan.
// =============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Satu antrean yang masih menggantung, apa adanya dari SQL. */
type Tunggakan = {
  kode: string
  label: string
  jumlah: number
  umur_hari: number
}

/** Bentuk `app_config.notifikasi`. Semua bagiannya boleh tidak ada. */
type Konfigurasi = {
  aktif?: boolean
  chatManajer?: string
  chatOwner?: string
  eskalasiHari?: number
  periksa?: Record<string, boolean>
}

function tanggalPanjang(): string {
  return new Date().toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** "3 hari" / "hari ini" — umur dalam bahasa manusia. */
function umur(hari: number): string {
  if (hari <= 0) return 'hari ini'
  if (hari === 1) return '1 hari'
  return `${hari} hari`
}

function baris(t: Tunggakan): string {
  const angka = t.jumlah > 1 ? ` (${t.jumlah})` : ''
  // `umur_hari` negatif = pemeriksaan soal KEADAAN, bukan soal keterlambatan
  // (mis. stok frame menipis). Tidak ada umur yang pantas ditulis: menulis
  // "hari ini" akan terbaca seolah keadaannya baru muncul pagi ini.
  if (t.umur_hari < 0) return `• ${t.label}${angka}`
  return `• ${t.label}${angka} — ${umur(t.umur_hari)}`
}

function pesanManajer(items: Tunggakan[]): string {
  return [
    `Pengingat Kubik · ${tanggalPanjang()}`,
    '',
    'Yang masih menunggu dikerjakan:',
    ...items.map(baris),
    '',
    'Buka system.kubikbox.id untuk menyelesaikannya.',
  ].join('\n')
}

function pesanMalam(items: Tunggakan[]): string {
  return [
    `Sebelum tutup hari · ${tanggalPanjang()}`,
    '',
    ...items.map(baris),
    '',
    'Masih sempat diselesaikan malam ini di system.kubikbox.id.',
  ].join('\n')
}

function pesanOwner(items: Tunggakan[], ambang: number): string {
  return [
    `Eskalasi Kubik · ${tanggalPanjang()}`,
    '',
    `Sudah lewat ${umur(ambang)} dan belum dikerjakan:`,
    ...items.map(baris),
  ].join('\n')
}

function pesanUjiBersih(): string {
  return [
    `Uji coba notifikasi Kubik · ${tanggalPanjang()}`,
    '',
    'Sambungannya berhasil. Saat ini tidak ada yang menunggak, jadi di',
    'hari biasa pesan seperti ini tidak akan dikirim sama sekali.',
  ].join('\n')
}

/** Kirim ke satu chat. Mengembalikan pesan error, atau null kalau sukses. */
async function kirimTelegram(
  token: string,
  chatId: string,
  teks: string,
): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: teks,
        disable_web_page_preview: true,
      }),
    })
    const hasil = await res.json().catch(() => null)
    if (!res.ok || !hasil?.ok)
      return String(hasil?.description ?? `HTTP ${res.status}`)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Gagal menghubungi Telegram'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''

    if (!token)
      return json({ error: 'TELEGRAM_BOT_TOKEN belum diatur' }, 500)

    const body = await req.json().catch(() => null)
    const uji = body?.uji === true
    const sesi: 'pagi' | 'malam' = body?.sesi === 'malam' ? 'malam' : 'pagi'

    // ---- Siapa yang memanggil ----
    const authHeader = req.headers.get('Authorization') ?? ''
    const dariCron = authHeader === `Bearer ${serviceKey}`
    if (!dariCron) {
      if (!authHeader) return json({ error: 'Tidak terautentikasi' }, 401)
      const caller = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userData } = await caller.auth.getUser()
      if (!userData?.user) return json({ error: 'Sesi tidak valid' }, 401)
      const { data: profile } = await caller
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle()
      const role = profile?.role ?? ''
      if (role !== 'owner' && role !== 'manager')
        return json({ error: 'Hanya pengelola' }, 403)
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ---- Konfigurasi ----
    const { data: configRow, error: configErr } = await admin
      .from('app_config')
      .select('notifikasi')
      .eq('id', 1)
      .maybeSingle()
    if (configErr) return json({ error: configErr.message }, 500)

    const cfg: Konfigurasi = configRow?.notifikasi ?? {}
    const chatManajer = String(cfg.chatManajer ?? '').trim()
    const chatOwner = String(cfg.chatOwner ?? '').trim()
    const ambang = Number(cfg.eskalasiHari ?? 2)

    if (!cfg.aktif && !uji) return json({ lewat: 'nonaktif' }, 200)
    if (!chatManajer)
      return json({ error: 'Chat ID manajer belum diisi' }, 400)

    // ---- Apa yang menunggak ----
    const { data: rows, error: rpcErr } = await admin.rpc(
      'notifikasi_tunggakan',
      { p_sesi: sesi },
    )
    if (rpcErr) return json({ error: rpcErr.message }, 500)

    const semua = (rows ?? []) as Tunggakan[]
    // Sakelar di Pengaturan. Tidak disebut = ikut menyala; owner harus
    // mematikan dengan sengaja, bukan karena konfigurasinya belum ada.
    const items = semua.filter((t) => cfg.periksa?.[t.kode] !== false)

    // Sunyi berarti aman — lihat catatan di kepala berkas.
    if (items.length === 0 && !uji) return json({ kirim: 0 }, 200)

    const rincian = items.map((t) => ({
      kode: t.kode,
      jumlah: t.jumlah,
      umur_hari: t.umur_hari,
    }))

    async function catat(
      jenis: 'harian' | 'malam' | 'eskalasi' | 'uji',
      tujuan: string,
      isi: string,
      error: string | null,
    ) {
      await admin.from('notifikasi_log').insert({
        jenis,
        tujuan,
        isi,
        rincian,
        berhasil: error === null,
        error: error ?? '',
      })
    }

    // ---- Pesan ke manajer ----
    const isiManajer =
      items.length === 0
        ? pesanUjiBersih()
        : sesi === 'malam'
          ? pesanMalam(items)
          : pesanManajer(items)
    const errManajer = await kirimTelegram(token, chatManajer, isiManajer)
    await catat(
      uji ? 'uji' : sesi === 'malam' ? 'malam' : 'harian',
      chatManajer,
      isiManajer,
      errManajer,
    )

    // ---- Tembusan eskalasi ke owner ----
    // Umur negatif tidak pernah ikut naik ke owner — lihat catatan di `baris`.
    // Ditulis tersurat, bukan disandarkan pada `ambang` yang minimal 1 di layar.
    // Sesi malam berhenti di manajer: umurnya nol, dan hal yang harinya
    // belum habis belum pantas diadukan ke owner.
    const lewatAmbang =
      sesi === 'malam'
        ? []
        : items.filter((t) => t.umur_hari >= 0 && t.umur_hari >= ambang)
    let errOwner: string | null = null
    if (lewatAmbang.length > 0 && chatOwner && !uji) {
      const isiOwner = pesanOwner(lewatAmbang, ambang)
      errOwner = await kirimTelegram(token, chatOwner, isiOwner)
      await catat('eskalasi', chatOwner, isiOwner, errOwner)
    }

    if (errManajer) return json({ error: errManajer }, 502)
    return json(
      {
        kirim: 1,
        sesi,
        tunggakan: items.length,
        eskalasi: lewatAmbang.length,
        errorOwner: errOwner,
      },
      200,
    )
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'Kesalahan server' },
      500,
    )
  }
})
