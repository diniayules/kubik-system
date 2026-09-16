import type { HargaProduk, HargaTiket, HargaUpgrade } from './types'

export const HARGA_TIKET_DEFAULT: HargaTiket = {
  photobooth: 35000,
  photobox: 35000,
  'photo-game': 25000,
}
export const HARGA_CETAK_DEFAULT = 10000
export const HARGA_UPGRADE_DEFAULT: HargaUpgrade = {
  poster: 20000,
  'crack-n-share': 2000,
}
export const HARGA_PRODUK_DEFAULT: HargaProduk = {}

export function uid(): string {
  // Valid UUID so it can be used directly as a Supabase `uuid` primary key.
  return crypto.randomUUID()
}

export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
