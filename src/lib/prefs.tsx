import { useSyncExternalStore } from 'react'
import type { FontPair, FontSize, TampilanMode } from '../types'

// Preferensi tampilan disimpan PER-PERANGKAT (localStorage), bukan di data bersama.
// Tiap browser/HP punya pilihan font, ukuran teks, dan mode tampilan sendiri —
// sama seperti tema warna. Perubahan satu orang tidak memengaruhi yang lain.

export type Prefs = {
  fontPair: FontPair
  fontSize: FontSize
  tampilanAbsensi: TampilanMode
  tampilanInventaris: TampilanMode
  tampilanTinta: TampilanMode
  tampilanIncome: TampilanMode
}

export const PREFS_DEFAULTS: Prefs = {
  fontPair: 'playful',
  fontSize: 'normal',
  tampilanAbsensi: 'card',
  tampilanInventaris: 'card',
  tampilanTinta: 'card',
  tampilanIncome: 'card',
}

const KEY = 'kubik-prefs'

const FONT_PAIRS: FontPair[] = ['playful', 'editorial', 'modern', 'minimal', 'oui']
const FONT_SIZES: FontSize[] = ['small', 'normal', 'large', 'xlarge']

function isMode(v: unknown, allowKalender: boolean): v is TampilanMode {
  return v === 'card' || v === 'list' || (allowKalender && v === 'kalender')
}

// Key lama (db.ts) — dibaca sekali sebagai fallback supaya setelan pengguna
// lama tidak reset ke default saat migrasi ke sistem prefs baru ini.
const LEGACY_KEY = 'kubik-ui-prefs:v1'

function migrateLegacy(): string | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const merged = JSON.stringify({ ...JSON.parse(raw) })
    localStorage.setItem(KEY, merged)
    localStorage.removeItem(LEGACY_KEY)
    return merged
  } catch {
    return null
  }
}

function parse(raw: string | null): Prefs {
  if (!raw) return PREFS_DEFAULTS
  try {
    const p = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>
    return {
      fontPair: FONT_PAIRS.includes(p.fontPair as FontPair)
        ? (p.fontPair as FontPair)
        : PREFS_DEFAULTS.fontPair,
      fontSize: FONT_SIZES.includes(p.fontSize as FontSize)
        ? (p.fontSize as FontSize)
        : PREFS_DEFAULTS.fontSize,
      tampilanAbsensi: isMode(p.tampilanAbsensi, false)
        ? p.tampilanAbsensi
        : PREFS_DEFAULTS.tampilanAbsensi,
      tampilanInventaris: isMode(p.tampilanInventaris, false)
        ? p.tampilanInventaris
        : PREFS_DEFAULTS.tampilanInventaris,
      tampilanTinta: isMode(p.tampilanTinta, false)
        ? p.tampilanTinta
        : PREFS_DEFAULTS.tampilanTinta,
      tampilanIncome: isMode(p.tampilanIncome, true)
        ? p.tampilanIncome
        : PREFS_DEFAULTS.tampilanIncome,
    }
  } catch {
    return PREFS_DEFAULTS
  }
}

// Snapshot di-cache supaya useSyncExternalStore mendapat referensi stabil.
let cache: Prefs = parse(
  typeof localStorage !== 'undefined'
    ? localStorage.getItem(KEY) ?? migrateLegacy()
    : null,
)

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  // Sinkron antar-tab: dengarkan perubahan localStorage dari tab lain.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = parse(e.newValue)
      cb()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot(): Prefs {
  return cache
}

export function getPrefs(): Prefs {
  return cache
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  if (cache[key] === value) return
  cache = { ...cache, [key]: value }
  localStorage.setItem(KEY, JSON.stringify(cache))
  emit()
}

export function resetPrefs(): void {
  cache = { ...PREFS_DEFAULTS }
  localStorage.removeItem(KEY)
  emit()
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
