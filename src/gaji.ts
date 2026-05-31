// =============================================================
// gaji.ts · Perhitungan slip gaji karyawan (murni / deterministik).
//
// Model (lihat keputusan produk di GajiKaryawan):
//  - Gaji pokok dibayar PENUH sebulan, lalu disesuaikan:
//      + bonus penjualan (Rp 1.000 / item: tiket, cetak, upgrade, produk)
//      + upah lembur          (menit lembur × tarif/menit)
//      + upah shift penuh     (menit coverage × tarif/menit)
//      − potongan keterlambatan (menit telat × tarif/menit)
//      − potongan cuti berlebih (hari di atas jatah × 1 hari × tarif/menit)
//  - Tarif/menit = gaji pokok ÷ 30 hari ÷ 300 menit (800.000 → Rp 88,8).
//  - Jatah cuti 2 hari/bulan; hari tidak hadir ke-3 dst memotong 1 hari penuh.
// =============================================================
import type { AbsenHari, Employee, LaporanIncome } from './types'
import { hitungRingkasan } from './attendance'
import { ringkasanPerKaryawan } from './income'

/** Bonus per item terjual (tiket / cetak / upgrade / produk). */
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
  for (const r of records) {
    if (r.employeeId !== emp.id) continue
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

  const hariTidakHadir = Math.max(0, hariSeharusnya - hariHadir)
  const cutiTerpakai = Math.min(hariTidakHadir, JATAH_CUTI_SEBULAN)
  const hariCutiBerlebih = Math.max(0, hariTidakHadir - JATAH_CUTI_SEBULAN)

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
  const jumlahItem = tiket + cetak + upgrade + produk

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
