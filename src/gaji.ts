// =============================================================
// gaji.ts · Perhitungan slip gaji karyawan (murni / deterministik).
//
// Model (lihat keputusan produk di GajiKaryawan):
//  - Gaji pokok dibayar PENUH sebulan, lalu disesuaikan:
//      + bonus penjualan (Rp 1.000 / item: tiket, cetak, produk — upgrade TIDAK)
//      + upah lembur          (menit lembur × tarif/menit)
//      + upah shift penuh     (menit coverage × tarif/menit)
//      − potongan keterlambatan (menit telat × tarif/menit)
//      − potongan cuti berlebih (hari di atas jatah × 1 hari × tarif/menit)
//  - Tarif/menit = gaji pokok ÷ 30 hari ÷ 300 menit (800.000 → Rp 88,8).
//  - CUTI dicatat EKSPLISIT (tombol "Cuti" di pemilih shift), bukan ditebak dari
//    ketiadaan absensi. Jatah cuti 2 hari/bulan; cuti ke-3 dst memotong 1 hari
//    penuh. Hari "Libur Studio" (studio tutup) tidak pernah memotong gaji dan
//    tidak memakai jatah. Hari tanpa catatan apa pun TIDAK lagi otomatis
//    dipotong — hanya ditampilkan sebagai info "tidak hadir".
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
/** Jatah hari tidak hadir yang tidak memotong gaji (cuti) per bulan. */
export const JATAH_CUTI_SEBULAN = 2

/** Tarif per menit = gaji pokok ÷ 30 hari ÷ 300 menit. (800.000 → 88,89) */
export function tarifPerMenit(gajiPokok: number): number {
  return gajiPokok / (HARI_KERJA_SEBULAN * MENIT_KERJA_HARIAN)
}

export type SlipGaji = {
  gajiPokok: number
  tarifPerMenit: number
  // --- kehadiran ---
  hariHadir: number
  hariSeharusnya: number
  hariTidakHadir: number
  hariCuti: number
  hariLibur: number
  cutiTerpakai: number
  hariCutiBerlebih: number
  terlambatMenit: number
  lemburMenit: number
  coverageMenit: number
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
  potonganTerlambat: number
  potonganCuti: number
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
  let kerjaBersihMenit = 0
  let hariHadir = 0
  let hariCuti = 0
  let hariLibur = 0
  for (const r of records) {
    if (r.employeeId !== emp.id) continue
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
  // TIDAK memotong gaji (cuti sekarang harus ditandai eksplisit).
  const hariTidakHadir = Math.max(
    0,
    hariSeharusnya - hariHadir - hariCuti - hariLibur,
  )
  // Potongan hanya dari cuti EKSPLISIT yang melebihi jatah 2 hari/bulan.
  const cutiTerpakai = Math.min(hariCuti, JATAH_CUTI_SEBULAN)
  const hariCutiBerlebih = Math.max(0, hariCuti - JATAH_CUTI_SEBULAN)

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

  const bonusPenjualan = jumlahItem * BONUS_PER_ITEM
  const upahLembur = lemburMenit * tarif
  const upahCoverage = coverageMenit * tarif
  const potonganTerlambat = terlambatMenit * tarif
  const potonganCuti = hariCutiBerlebih * MENIT_KERJA_HARIAN * tarif

  const total =
    gajiPokok +
    bonusPenjualan +
    upahLembur +
    upahCoverage -
    potonganTerlambat -
    potonganCuti

  return {
    gajiPokok,
    tarifPerMenit: tarif,
    hariHadir,
    hariSeharusnya,
    hariTidakHadir,
    hariCuti,
    hariLibur,
    cutiTerpakai,
    hariCutiBerlebih,
    terlambatMenit,
    lemburMenit,
    coverageMenit,
    kerjaBersihMenit,
    tiket,
    cetak,
    upgrade,
    produk,
    jumlahItem,
    bonusPenjualan,
    upahLembur,
    upahCoverage,
    potonganTerlambat,
    potonganCuti,
    total,
  }
}
