// =============================================================
// event.ts · Logika laporan Event (Photobooth & Photo Game).
// Terpisah penuh dari income/Photo Studio: tidak menyentuh stok atau gaji.
// =============================================================
import type {
  AppData,
  EventConfig,
  EventKategori,
  LaporanEvent,
} from './types'

export const EVENT_KATEGORI_LIST: {
  id: EventKategori
  label: string
  ikon: string
}[] = [
  { id: 'photobooth', label: 'Photobooth', ikon: '📸' },
  { id: 'game', label: 'Photo Game', ikon: '🎮' },
]

export function labelEventKategori(kat: EventKategori): string {
  return EVENT_KATEGORI_LIST.find((k) => k.id === kat)?.label ?? kat
}

export function defaultEventConfig(): EventConfig {
  return { hargaVoucher: 0, hargaCetak: 0, tarifPerJam: 0 }
}

export function getEventConfig(data: AppData, kat: EventKategori): EventConfig {
  return data.eventConfig?.[kat] ?? defaultEventConfig()
}

/** Kembalikan AppData baru dengan config sebuah kategori event diperbarui. */
export function applyEventConfig(
  data: AppData,
  kat: EventKategori,
  cfg: EventConfig,
): AppData {
  return { ...data, eventConfig: { ...data.eventConfig, [kat]: cfg } }
}

export type EventBreakdown = {
  pendapatan: number
  biaya: number
  laba: number
}

/**
 * Hitung pendapatan, biaya, dan laba sebuah laporan event.
 *  - 'jam'     : pendapatan = jam × tarif; biaya = kertas+tinta+listrik+upah.
 *  - 'voucher' : pendapatan = voucher×hargaVoucher + cetak×hargaCetak; biaya 0.
 */
export function hitungEvent(l: LaporanEvent): EventBreakdown {
  if (l.tipe === 'jam') {
    const pendapatan = (l.jam ?? 0) * (l.tarifPerJam ?? 0)
    const biaya =
      (l.biayaKertas ?? 0) +
      (l.biayaTinta ?? 0) +
      (l.biayaListrik ?? 0) +
      (l.upahOperator ?? 0)
    return { pendapatan, biaya, laba: pendapatan - biaya }
  }
  // voucher
  const pendapatan =
    (l.voucher ?? 0) * (l.hargaVoucher ?? 0) + (l.cetak ?? 0) * (l.hargaCetak ?? 0)
  return { pendapatan, biaya: 0, laba: pendapatan }
}
