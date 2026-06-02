import type {
  JenisFrame,
  JenisKertas,
  Pengeluaran,
  SalahCetak,
  Tinta,
  WarnaTinta,
} from './types'

export const WARNA_TINTA_LIST: WarnaTinta[] = ['BK', 'LC', 'M', 'C', 'Y', 'LM']

export const WARNA_TINTA_LABEL: Record<WarnaTinta, string> = {
  BK: 'Black',
  LC: 'Light Cyan',
  M: 'Magenta',
  C: 'Cyan',
  Y: 'Yellow',
  LM: 'Light Magenta',
}

export const WARNA_TINTA_COLOR: Record<WarnaTinta, string> = {
  BK: '#1a1a1a',
  LC: '#7fd5ed',
  M: '#e91e63',
  C: '#0098d4',
  Y: '#f5b800',
  LM: '#f48fb1',
}

export const KERTAS_SEED: { id: string; nama: string }[] = [
  { id: 'doff-kasar', nama: 'Doff Kasar' },
  { id: 'holographic', nama: 'Holographic' },
  { id: 'crack-n-share', nama: 'Crack n Share' },
  { id: 'poster', nama: 'Poster' },
]

export const KATEGORI_PENGELUARAN_SUGGEST = [
  'Kertas',
  'Tinta',
  'Amplop',
  'Listrik',
  'Sewa Tempat',
  'Gaji',
  'Perbaikan',
  'Marketing',
  'Lainnya',
]

export function totalStokKertas(kertas: JenisKertas[]): number {
  return kertas.reduce((s, k) => s + (k.stok || 0), 0)
}

export function totalStokTinta(tinta: Tinta[]): number {
  return tinta.reduce((s, t) => s + (t.stok || 0), 0)
}

export function totalStokFrame(frame: JenisFrame[]): number {
  return frame.reduce((s, f) => s + (f.stok || 0), 0)
}

export function findKertas(
  list: JenisKertas[],
  id: string,
): JenisKertas | undefined {
  return list.find((k) => k.id === id)
}

export function bulanIni(tanggal: string): boolean {
  const now = new Date()
  const k = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return tanggal.startsWith(k)
}

export function totalPengeluaran(
  pengeluaran: Pengeluaran[],
  filter?: (p: Pengeluaran) => boolean,
): number {
  return pengeluaran
    .filter((p) => (filter ? filter(p) : true))
    .reduce((s, p) => s + (p.jumlah || 0), 0)
}

export function jumlahSalahCetakBulanIni(salahCetak: SalahCetak[]): number {
  return salahCetak
    .filter((s) => bulanIni(s.tanggal))
    .reduce((s, x) => s + (x.jumlah || 0), 0)
}

export function uidShort(): string {
  // Valid UUID so it can be used directly as a Supabase `uuid` primary key.
  return crypto.randomUUID()
}
