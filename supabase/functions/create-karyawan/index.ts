// =============================================================
// create-karyawan · Edge Function
// -------------------------------------------------------------
// Membuat akun karyawan baru dari sisi admin (menggantikan
// self-registration yang sudah ditutup).
//
// Alur keamanan:
//   1. Verifikasi pemanggil punya sesi valid (JWT dari Authorization).
//   2. Pastikan pemanggil ber-role 'admin' di tabel profiles.
//   3. Baru buat auth user pakai SERVICE ROLE. Trigger DB
//      handle_new_user() otomatis menaruh profile dengan role
//      'karyawan'.
//
// SERVICE_ROLE_KEY hanya hidup di server (edge function) — tidak
// pernah menyentuh frontend.
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

function translateCreateErr(msg: string): string {
  if (
    msg.includes('already been registered') ||
    msg.includes('already exists') ||
    msg.includes('duplicate')
  )
    return 'Email sudah terdaftar'
  return msg
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Tidak terautentikasi' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Klien "sebagai pemanggil" — untuk identifikasi + otorisasi.
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await caller.auth.getUser()
    if (userErr || !userData.user)
      return json({ error: 'Sesi tidak valid' }, 401)

    const { data: profile } = await caller
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (profile?.role !== 'admin')
      return json({ error: 'Hanya admin yang boleh membuat akun' }, 403)

    const body = await req.json().catch(() => null)
    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase()
    const password = String(body?.password ?? '')
    const nama = String(body?.nama ?? '').trim()
    const jabatan = String(body?.jabatan ?? '').trim()

    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      return json({ error: 'Email tidak valid' }, 400)
    if (password.length < 6)
      return json({ error: 'Password minimal 6 karakter' }, 400)
    if (nama.length < 2) return json({ error: 'Nama minimal 2 huruf' }, 400)

    // Klien SERVICE ROLE — membuat auth user. Trigger handle_new_user()
    // yang menyisipkan baris profiles (role 'karyawan').
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // langsung aktif, tanpa perlu konfirmasi email
        user_metadata: { nama, jabatan },
      })
    if (createErr)
      return json({ error: translateCreateErr(createErr.message) }, 400)

    return json({ id: created.user?.id ?? null, email }, 200)
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'Kesalahan server' },
      500,
    )
  }
})
