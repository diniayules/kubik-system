import type { FontPair, FontSize } from './types'

type Pair = { display: string; body: string; label: string; preview: string }

export const FONT_PAIRS: Record<FontPair, Pair> = {
  playful: {
    label: 'Playful',
    display: 'Fredoka',
    body: 'Plus Jakarta Sans',
    preview: 'Aa Bb 123',
  },
  modern: {
    label: 'Modern',
    display: 'Inter',
    body: 'Inter',
    preview: 'Aa Bb 123',
  },
  editorial: {
    label: 'Editorial',
    display: 'Space Mono',
    body: 'Plus Jakarta Sans',
    preview: 'Aa Bb 123',
  },
  minimal: {
    label: 'Minimal',
    display: 'Plus Jakarta Sans',
    body: 'Plus Jakarta Sans',
    preview: 'Aa Bb 123',
  },
  oui: {
    label: 'Candy',
    display: 'Nunito',
    body: 'Nunito',
    preview: 'Aa Bb 123',
  },
}

export const FONT_PAIR_LIST: FontPair[] = ['playful', 'modern', 'editorial', 'minimal', 'oui']

export const FONT_SIZE_LIST: FontSize[] = ['small', 'normal', 'large', 'xlarge']

export const FONT_SIZE_META: Record<FontSize, { label: string; scale: number }> = {
  small: { label: 'Kecil', scale: 0.9 },
  normal: { label: 'Normal', scale: 1.0 },
  large: { label: 'Besar', scale: 1.1 },
  xlarge: { label: 'Sangat Besar', scale: 1.22 },
}

export function applyAppearance(
  fontPair: FontPair | undefined,
  fontSize: FontSize | undefined,
): void {
  const pair = FONT_PAIRS[fontPair ?? 'playful']
  const root = document.documentElement
  root.style.setProperty(
    '--font-display',
    `"${pair.display}", system-ui, sans-serif`,
  )
  root.style.setProperty('--font-body', `"${pair.body}", system-ui, sans-serif`)
  const scale = FONT_SIZE_META[fontSize ?? 'normal'].scale
  root.style.setProperty('--text-scale', String(scale))
}

export const DEFAULTS = {
  brandKicker: 'Kubik Photobox Studio',
  brandName: 'Sistem Operasional',
  dashJudul: 'Halo, selamat datang 👋',
  dashSub: 'Berikut ringkasan operasional Kubik Photobox Studio hari ini.',
  headerJudul: 'Selamat datang 👋',
  headerSub:
    'Sistem absensi 2 shift dengan PIN pribadi per karyawan — cepat, ceria, dan anti titip absen.',
  incomeJudul: 'Laporan Income Harian 💰',
  incomeSub:
    'Catat penjualan Photobooth, Photobox, Photo Game, dan upgrade cetak (Poster · Crack n Share) per karyawan. Income dihitung otomatis.',
}
