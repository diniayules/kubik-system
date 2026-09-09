// =============================================================
// kas.ts · Rekonsiliasi kas (dompet & rekening) — murni / deterministik.
//
// Dipakai bersama oleh dua layar agar angkanya tidak pernah berbeda:
//   - LaporanIncome  → panel "Rangkuman akhir bulan"
//   - Manajemen      → panel "Kas & Rekonsiliasi" (owner-only)
//
// Perhitungan KUMULATIF s/d akhir bulan terpilih: uang di dompet/rekening
// menumpuk antar bulan, jadi dibandingkan dengan saldo awal + akumulasi
// seluruh income, setoran, pengeluaran & gaji yang sudah dibayar.
//   dompet diharapkan   = saldoAwal.dompet   + Σ tunai − Σ setoran − Σ pengeluaran(cash)     − Σ gaji dibayar tunai
//   rekening diharapkan = saldoAwal.rekening + Σ QRIS  + Σ setoran − Σ pengeluaran(rekening) − Σ gaji dibayar transfer
// =============================================================
import type { AppData } from './types'
import { hariSeharusnyaKaryawan, hitungSlipGaji } from './gaji'
import { isPengelola } from './lib/roles'

export type RekonsiliasiKas = {
  /** Σ pembayaran tunai yang diterima, s/d bulan terpilih. */
  tunai: number
  /** Σ pembayaran QRIS yang diterima, s/d bulan terpilih. */
  qris: number
  /** Σ setoran tunai → rekening. */
  setoran: number
  pengeluaranCash: number
  pengeluaranRek: number
  /** Gaji yang sudah DIBAYAR (uang benar-benar keluar), dipisah per sumber. */
  gajiCash: number
  gajiRek: number
  dompetDiharapkan: number
  rekeningDiharapkan: number
  /** Saldo buku kas uang besar = Σ(uangBesar tiap laporan) − Σ(penarikan). */
  uangBesarSaldo: number
}

/**
 * @param sampaiBulan `YYYY-MM` — batas atas kumulatif (inklusif).
 * @param hariIni     `YYYY-MM-DD` — patokan hari kerja untuk slip gaji berjalan.
 */
export function hitungRekonsiliasiKas(
  data: AppData,
  sampaiBulan: string,
  hariIni: string,
): RekonsiliasiKas {
  const sampai = (tgl: string) => tgl.slice(0, 7) <= sampaiBulan

  const laporanSampai = data.laporanIncome.filter((l) => sampai(l.tanggal))
  const tunai = laporanSampai.reduce((s, l) => s + (l.tunai ?? 0), 0)
  const qris = laporanSampai.reduce((s, l) => s + (l.qris ?? 0), 0)
  const setoran = (data.setoranRekening ?? [])
    .filter((s) => sampai(s.tanggal))
    .reduce((sum, s) => sum + (s.jumlah || 0), 0)

  // Pengeluaran dipotong dari saldo sesuai sumber dananya (cash → dompet,
  // rekening → rekening). Data lama tanpa sumber dianggap 'cash'.
  const pengMasuk = data.pengeluaran.filter((p) => sampai(p.tanggal))
  const pengeluaranCash = pengMasuk
    .filter((p) => (p.sumber ?? 'cash') === 'cash')
    .reduce((s, p) => s + (p.jumlah || 0), 0)
  const pengeluaranRek = pengMasuk
    .filter((p) => p.sumber === 'rekening')
    .reduce((s, p) => s + (p.jumlah || 0), 0)

  // Gaji yang SUDAH dibayar — dipotong sesuai "Pembayaran via" tiap slip:
  // 'Tunai' → dompet, selain itu (Transfer / e-Wallet / kosong) → rekening.
  // Slip yang belum ditandai dibayar tidak dipotong (masih utang).
  let gajiCash = 0
  let gajiRek = 0
  const karyawan = data.employees.filter((e) => !isPengelola(e.role))
  for (const [key, paid] of Object.entries(data.gajiDibayar ?? {})) {
    if (!paid) continue
    const [empId, bulan] = key.split('::')
    if (!bulan || bulan > sampaiBulan) continue
    const emp = karyawan.find((e) => e.id === empId)
    if (!emp) continue
    const slip = hitungSlipGaji(
      emp,
      data.gajiPokok[emp.id] ?? 0,
      data.records.filter((r) => r.tanggal.startsWith(bulan)),
      data.laporanIncome.filter((l) => l.tanggal.startsWith(bulan)),
      hariSeharusnyaKaryawan(emp, bulan, hariIni),
    )
    const metode = (data.gajiPembayaranVia[key]?.metode ?? '').toLowerCase()
    const dariCash = metode.includes('tunai') || metode.includes('cash')
    if (dariCash) gajiCash += slip.total
    else gajiRek += slip.total
  }

  const dompetDiharapkan =
    (data.saldoAwal?.dompet ?? 0) +
    tunai -
    setoran -
    pengeluaranCash -
    gajiCash
  const rekeningDiharapkan =
    (data.saldoAwal?.rekening ?? 0) +
    qris +
    setoran -
    pengeluaranRek -
    gajiRek

  // Buku kas uang besar berjalan (tidak dibatasi bulan — ini saldo laci).
  const uangBesarMasuk = data.laporanIncome.reduce(
    (s, l) => s + (l.uangBesar ?? 0),
    0,
  )
  const uangBesarKeluar = (data.penarikanUangBesar ?? []).reduce(
    (s, p) => s + (p.jumlah || 0),
    0,
  )

  return {
    tunai,
    qris,
    setoran,
    pengeluaranCash,
    pengeluaranRek,
    gajiCash,
    gajiRek,
    dompetDiharapkan,
    rekeningDiharapkan,
    uangBesarSaldo: uangBesarMasuk - uangBesarKeluar,
  }
}
