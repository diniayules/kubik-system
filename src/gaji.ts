// =============================================================
// gaji.ts · Perhitungan slip gaji karyawan (murni / deterministik).
//
// Model (lihat keputusan produk di GajiKaryawan):
//  - Gaji pokok DIAKRU per HARI HADIR sejak tanggal 1 (bukan dibayar penuh di
//    muka): gaji pokok terhitung = gaji pokok ÷ 30 hari × jumlah hari hadir.
//    Untuk bulan berjalan, nilainya tumbuh tiap hari karyawan masuk kerja.
//    Hanya hari yang benar-benar masuk kerja yang membayar gaji pokok — cuti,
//    libur studio, maupun hari mangkir tidak menambah gaji pokok.
//  - Gaji pokok terhitung lalu disesuaikan:
//      + bonus penjualan (Rp 1.000 / item: tiket, cetak, produk — upgrade TIDAK)
//      + upah lembur          (menit lembur × tarif/menit)
//      + upah shift penuh     (menit coverage × tarif/menit)
//      + upah waktu ekstra    (menit extra manual × tarif/menit — backup/meeting)
//      − potongan keterlambatan (menit telat × tarif/menit)
//  - Tarif/menit = gaji pokok ÷ 30 hari ÷ 300 menit (800.000 → Rp 88,8).
//  - CUTI & "Libur Studio" dicatat EKSPLISIT lewat pemilih shift; keduanya hanya
//    ditampilkan sebagai info kehadiran dan tidak lagi mempengaruhi nominal gaji
//    (tidak dibayar, tidak pula dipotong). Hari tanpa catatan apa pun juga hanya
//    info "tidak hadir".
// =============================================================
import type { AbsenHari, Employee, LaporanIncome } from './types'
import { hitungRingkasan } from './attendance'
import { ringkasanPerKaryawan } from './income'

/** Bonus per item terjual (tiket / cetak / produk — upgrade tidak dihitung). */
export const BONUS_PER_ITEM = 1000
/** Basis pembagi gaji pokok: 30 hari kerja sebulan. */
export const HARI_KERJA_SEBULAN = 30
/** Basis menit kerja harian (shift pagi/sore = 5 jam = 300 menit). */
export const MENIT_KERJA_HARIAN = 300

/** Tarif per menit = gaji pokok ÷ 30 hari ÷ 300 menit. (800.000 → 88,89) */
export function tarifPerMenit(gajiPokok: number): number {
  return gajiPokok / (HARI_KERJA_SEBULAN * MENIT_KERJA_HARIAN)
}

/** Gaji pokok per hari hadir = gaji pokok ÷ 30 hari. (800.000 → 26.667) */
export function gajiPokokPerHari(gajiPokok: number): number {
  return gajiPokok / HARI_KERJA_SEBULAN
}

export type SlipGaji = {
  gajiPokok: number
  gajiPokokPerHari: number
  /** Gaji pokok yang sudah diakru = gaji pokok/hari × hari hadir. */
  gajiPokokTerhitung: number
  tarifPerMenit: number
  // --- kehadiran ---
  hariHadir: number
  hariSeharusnya: number
  hariTidakHadir: number
  hariCuti: number
  hariLibur: number
  terlambatMenit: number
  lemburMenit: number
  coverageMenit: number
  extraMenit: number
  kerjaBersihMenit: number
  // --- penjualan ---
  tiket: number
  cetak: number
  upgrade: number
  produk: number
  jumlahItem: number
  // --- rupiah ---
  bonusPenjualan: number
  upahLembur: number
  upahCoverage: number
  upahExtra: number
  potonganTerlambat: number
  total: number
}

/**
 * Jumlah hari "seharusnya kerja" pada bulan `monthKey` (YYYY-MM):
 *  - bulan lampau  → semua hari di bulan itu (28–31)
 *  - bulan berjalan → sampai tanggal hari ini (`hariIni` = YYYY-MM-DD)
 *  - bulan depan   → 0
 * Dipakai sebagai patokan untuk menghitung hari tidak hadir.
 */
export function hariSeharusnyaBulan(monthKey: string, hariIni: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  const hariDiBulan = new Date(y, m, 0).getDate() // m sudah 1-indexed → hari terakhir
  const bulanIni = hariIni.slice(0, 7)
  if (monthKey < bulanIni) return hariDiBulan
  if (monthKey > bulanIni) return 0
  return Math.min(hariDiBulan, Number(hariIni.slice(8, 10)))
}

/**
 * Hitung slip gaji satu karyawan untuk satu bulan.
 *
 * @param emp            karyawan
 * @param gajiPokok      gaji pokok bulanannya (Rp)
 * @param records        SEMUA catatan absen (akan disaring ke karyawan + bulan)
 * @param laporan        laporan income bulan tsb (sudah disaring ke bulan)
 * @param hariSeharusnya jumlah hari patokan (lihat hariSeharusnyaBulan)
 */
export function hitungSlipGaji(
  emp: Employee,
  gajiPokok: number,
  records: AbsenHari[],
  laporan: LaporanIncome[],
  hariSeharusnya: number,
): SlipGaji {
  const tarif = tarifPerMenit(gajiPokok)

  let terlambatMenit = 0
  let lemburMenit = 0
  let coverageMenit = 0
  let extraMenit = 0
  let kerjaBersihMenit = 0
  let hariHadir = 0
  let hariCuti = 0
  let hariLibur = 0
  for (const r of records) {
    if (r.employeeId !== emp.id) continue
    // Waktu ekstra manual (backup datang cepat / meeting) dibayar di hari apa
    // pun — termasuk saat hari itu ditandai libur/cuti (mis. meeting bulanan).
    extraMenit += Math.max(0, r.extraMenit ?? 0)
    // Hari tidak bekerja dicatat eksplisit, dihitung terpisah dari kehadiran.
    if (r.shift === 'cuti') {
      hariCuti += 1
      continue
    }
    if (r.shift === 'libur') {
      hariLibur += 1
      continue
    }
    const ring = hitungRingkasan(r)
    hariHadir += 1
    terlambatMenit += ring.terlambatMenit
    kerjaBersihMenit += ring.kerjaBersihMenit
    // Lembur & coverage hanya dihitung kalau sudah ada jam pulang (durasi pasti).
    if (ring.sudahPulang) {
      lemburMenit += ring.lemburMenit
      // Shift penuh (menggantikan rekan cuti) = target 600 menit; selisih di atas
      // basis harian 300 menit dibayar per menit sebagai upah coverage.
      coverageMenit += Math.max(0, ring.targetKerjaMenit - MENIT_KERJA_HARIAN)
    }
  }

  // Hari tanpa catatan apa pun (bukan kerja, cuti, maupun libur). Hanya info —
  // TIDAK menambah maupun memotong gaji.
  const hariTidakHadir = Math.max(
    0,
    hariSeharusnya - hariHadir - hariCuti - hariLibur,
  )

  let tiket = 0
  let cetak = 0
  let upgrade = 0
  let produk = 0
  for (const l of laporan) {
    const s = ringkasanPerKaryawan(l)[emp.id]
    if (!s) continue
    tiket += s.tiket
    cetak += s.cetak
    upgrade += s.upgrade
    produk += s.produk
  }
  // Upgrade TIDAK menghasilkan bonus Rp 1.000/item — hanya tiket, cetak, &
  // produk yang dihitung. Upgrade tetap masuk sebagai tambahan income rupiah
  // di laporan income (hitungIncome), bukan sebagai item bonus penjualan.
  const jumlahItem = tiket + cetak + produk

  // Gaji pokok diakru per hari hadir sejak tanggal 1 — hanya hari masuk kerja
  // yang membayar gaji pokok (cuti/libur/mangkir tidak menambah).
  const perHari = gajiPokokPerHari(gajiPokok)
  const gajiPokokTerhitung = hariHadir * perHari

  const bonusPenjualan = jumlahItem * BONUS_PER_ITEM
  const upahLembur = lemburMenit * tarif
  const upahCoverage = coverageMenit * tarif
  const upahExtra = extraMenit * tarif
  const potonganTerlambat = terlambatMenit * tarif

  const total =
    gajiPokokTerhitung +
    bonusPenjualan +
    upahLembur +
    upahCoverage +
    upahExtra -
    potonganTerlambat

  return {
    gajiPokok,
    gajiPokokPerHari: perHari,
    gajiPokokTerhitung,
    tarifPerMenit: tarif,
    hariHadir,
    hariSeharusnya,
    hariTidakHadir,
    hariCuti,
    hariLibur,
    terlambatMenit,
    lemburMenit,
    coverageMenit,
    extraMenit,
    kerjaBersihMenit,
    tiket,
    cetak,
    upgrade,
    produk,
    jumlahItem,
    bonusPenjualan,
    upahLembur,
    upahCoverage,
    upahExtra,
    potonganTerlambat,
    total,
  }
}
