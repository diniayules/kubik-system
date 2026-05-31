import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && publishableKey)

if (!supabaseConfigured) {
  console.warn(
    '[Supabase] Belum dikonfigurasi. Tambahkan VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di .env.local',
  )
}

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  publishableKey ?? 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)

export type Profile = {
  id: string
  email: string
  nama: string
  role: 'admin' | 'karyawan'
  jabatan: string
  pin_hash: string | null
  avatar_color: number
  active: boolean
}
