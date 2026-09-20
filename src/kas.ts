// =============================================================
// kas.ts · Buku kas & rekonsiliasi (dompet & rekening) — murni / deterministik.
//
// SATU sumber kebenaran: `kumpulkanMutasiKas` membangun daftar mutasi (tiap
// rupiah yang masuk/keluar dompet & rekening). Dari daftar itu diturunkan:
//   - `bukuKasBulan`         → buku kas satu bulan (dipakai layar Pemasukan)
//   - `hitungRekonsiliasiKas`→ total kumulatif s/d bulan (Pemasukan + Manajemen)
// Karena keduanya membaca daftar yang sama, baris terakhir buku kas SELALU
// sama dengan `dompetDiharapkan` / `rekeningDiharapkan`. Kalau dulu keduanya
// dihitung terpisah, keduanya bisa berbeda tanpa ketahuan.
//
// Ke mana uang mengalir:
//   dompet   = saldo awal + tunai − setoran − pengeluaran(cash)     − gaji dibayar tunai
//   rekening = saldo awal + QRIS  + setoran − pengeluaran(rekening) − gaji dibayar transfer
// Setoran muncul DUA kali (keluar dari dompet, masuk ke rekening) supaya
// perpindahannya terlihat di kedua buku.
// =============================================================
import type { AppData } from './types'
import { hariSeharusnyaKaryawan, hitungSlipGaji } from './gaji'
import { gajiPokokBerlaku } from './bonusSosmed'
import { isPengelola } from './lib/roles'

export type SumberKas = 'dompet' | 'rekening'
export type JenisMutasi = 'income' | 'setoran' | 'pengeluaran' | 'gaji'

/** Satu pergerakan uang di dompet atau rekening. */
export type MutasiKas = {
  id: string
  /** `YYYY-MM-DD`. Gaji dipatok ke tanggal terakhir bulan slip (lihat catatan). */
  tanggal: string
  sumber: SumberKas
  jenis: JenisMutasi
  /** Nama karyawan / deskripsi pengeluaran / catatan setoran. Boleh kosong. */
  detail: string
  /** Positif = uang masuk, negatif = uang keluar. */
  nilai: number
}

export type BarisBukuKas = MutasiKas & {
  /** Saldo berjalan SETELAH baris ini diperhitungkan. */
  saldo: number
}

export type BukuKas = {
  /** Saldo yang dibawa masuk dari sebelum bulan ini (termasuk saldo awal). */
  saldoMasuk: number
  baris: BarisBukuKas[]
  /** Saldo seharusnya di akhir bulan = baris terakhir. */
  saldoAkhir: number
}

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

/** Tanggal terakhir bulan `YYYY-MM`, sebagai `YYYY-MM-DD`. */
function akhirBulan(bulan: string): string {
  const [y, m] = bulan.split('-').map(Number)
  // Hari ke-0 bulan berikutnya = hari terakhir bulan ini. Dirakit manual (bukan
  // toISOString) supaya tidak bergeser oleh zona waktu.
  const hari = new Date(y, m, 0).getDate()
  return `${bulan}-${String(hari).padStart(2, '0')}`
}

/**
 * Semua mutasi dompet & rekening sejak sistem mulai, terurut tanggal.
 * TIDAK termasuk saldo awal — itu titik mula, bukan mutasi.
 *
 * @param hariIni `YYYY-MM-DD` — patokan hari kerja untuk slip gaji berjalan.
 */
export function kumpulkanMutasiKas(data: AppData, hariIni: string): MutasiKas[] {
  const out: MutasiKas[] = []

  // --- Income: tunai → dompet, QRIS → rekening -----------------------------
  // Laporan tanpa nilai di salah satu metode tidak menghasilkan baris, supaya
  // buku kas tidak penuh baris Rp 0.
  for (const l of data.laporanIncome) {
    if (l.tunai) {
      out.push({
        id: `inc-tunai-${l.id}`,
        tanggal: l.tanggal,
        sumber: 'dompet',
        jenis: 'income',
        detail: '',
        nilai: l.tunai,
      })
    }
    if (l.qris) {
      out.push({
        id: `inc-qris-${l.id}`,
        tanggal: l.tanggal,
        sumber: 'rekening',
        jenis: 'income',
        detail: '',
        nilai: l.qris,
      })
    }
  }

  // --- Setoran: pindah dompet → rekening (dua baris, satu peristiwa) -------
  for (const s of data.setoranRekening ?? []) {
    const jumlah = s.jumlah || 0
    if (!jumlah) continue
    out.push({
      id: `setor-out-${s.id}`,
      tanggal: s.tanggal,
      sumber: 'dompet',
      jenis: 'setoran',
      detail: s.catatan ?? '',
      nilai: -jumlah,
    })
    out.push({
      id: `setor-in-${s.id}`,
      tanggal: s.tanggal,
      sumber: 'rekening',
      jenis: 'setoran',
      detail: s.catatan ?? '',
      nilai: jumlah,
    })
  }

  // --- Pengeluaran: dipotong dari sumber dananya ---------------------------
  // Data lama tanpa `sumber` dianggap 'cash' (dompet).
  for (const p of data.pengeluaran) {
    const jumlah = p.jumlah || 0
    if (!jumlah) continue
    out.push({
      id: `keluar-${p.id}`,
      tanggal: p.tanggal,
      sumber: p.sumber === 'rekening' ? 'rekening' : 'dompet',
      jenis: 'pengeluaran',
      detail: p.deskripsi || p.kategori || '',
      nilai: -jumlah,
    })
  }

  // --- Gaji yang SUDAH ditandai dibayar ------------------------------------
  // Slip tidak menyimpan tanggal transfer, hanya periode `YYYY-MM`, jadi
  // barisnya dipatok ke hari terakhir periode itu. Cukup untuk buku kas
  // bulanan: bulannya pasti benar, urutan dalam bulan bisa meleset.
  // 'Tunai' → dompet, selain itu (Transfer / e-Wallet / kosong) → rekening.
  // Slip yang belum ditandai dibayar tidak dipotong (masih utang).
  const karyawan = data.employees.filter((e) => !isPengelola(e.role))
  for (const [key, paid] of Object.entries(data.gajiDibayar ?? {})) {
    if (!paid) continue
    const [empId, bulan] = key.split('::')
    if (!bulan) continue
    const emp = karyawan.find((e) => e.id === empId)
    if (!emp) continue
    const slip = hitungSlipGaji(
      emp,
      // Gaji pokok yang BERLAKU di bulan itu — sudah termasuk kenaikan bonus
      // sosmed kalau targetnya tercapai. Kalau di sini dipakai angka dasar,
      // uang yang keluar dari kas tidak sama dengan slip yang dibayarkan.
      gajiPokokBerlaku(emp, data, bulan, hariIni),
      data.records.filter((r) => r.tanggal.startsWith(bulan)),
      data.laporanIncome.filter((l) => l.tanggal.startsWith(bulan)),
      hariSeharusnyaKaryawan(emp, bulan, hariIni),
    )
    if (!slip.total) continue
    const metode = (data.gajiPembayaranVia[key]?.metode ?? '').toLowerCase()
    const dariCash = metode.includes('tunai') || metode.includes('cash')
    out.push({
      id: `gaji-${key}`,
      tanggal: akhirBulan(bulan),
      sumber: dariCash ? 'dompet' : 'rekening',
      jenis: 'gaji',
      detail: emp.nama,
      nilai: -slip.total,
    })
  }

  // Urut tanggal; urutan dalam satu hari mengikuti urutan penyusunan di atas
  // (income → setoran → pengeluaran → gaji) karena Array.sort stabil.
  return out.sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0))
}

/**
 * Buku kas satu bulan per sumber: saldo yang dibawa masuk, mutasi bulan itu,
 * dan saldo akhir. `saldoAkhir` identik dengan `dompetDiharapkan` /
 * `rekeningDiharapkan` dari `hitungRekonsiliasiKas` untuk bulan yang sama.
 *
 * @param bulan   `YYYY-MM` — bulan yang dibuka.
 * @param hariIni `YYYY-MM-DD`.
 */
export function bukuKasBulan(
  data: AppData,
  bulan: string,
  hariIni: string,
): Record<SumberKas, BukuKas> {
  const mutasi = kumpulkanMutasiKas(data, hariIni)

  const bangun = (sumber: SumberKas, saldoAwal: number): BukuKas => {
    const milikSumber = mutasi.filter((m) => m.sumber === sumber)
    // Semua yang terjadi SEBELUM bulan ini menggumpal jadi satu angka pembuka,
    // supaya tabelnya sepanjang satu bulan — bukan sepanjang umur sistem.
    const saldoMasuk = milikSumber
      .filter((m) => m.tanggal.slice(0, 7) < bulan)
      .reduce((s, m) => s + m.nilai, 0)
    let saldo = saldoAwal + saldoMasuk
    const baris = milikSumber
      .filter((m) => m.tanggal.slice(0, 7) === bulan)
      .map((m) => {
        saldo += m.nilai
        return { ...m, saldo }
      })
    return { saldoMasuk: saldoAwal + saldoMasuk, baris, saldoAkhir: saldo }
  }

  return {
    dompet: bangun('dompet', data.saldoAwal?.dompet ?? 0),
    rekening: bangun('rekening', data.saldoAwal?.rekening ?? 0),
  }
}

/**
 * Total kumulatif s/d akhir bulan terpilih — dipakai panel ringkas di layar
 * Pemasukan & Dashboard Manajemen.
 *
 * @param sampaiBulan `YYYY-MM` — batas atas kumulatif (inklusif).
 * @param hariIni     `YYYY-MM-DD` — patokan hari kerja untuk slip gaji berjalan.
 */
export function hitungRekonsiliasiKas(
  data: AppData,
  sampaiBulan: string,
  hariIni: string,
): RekonsiliasiKas {
  const mutasi = kumpulkanMutasiKas(data, hariIni).filter(
    (m) => m.tanggal.slice(0, 7) <= sampaiBulan,
  )
  const total = (sumber: SumberKas, jenis: JenisMutasi) =>
    mutasi
      .filter((m) => m.sumber === sumber && m.jenis === jenis)
      .reduce((s, m) => s + m.nilai, 0)

  // Field publik memakai besaran positif, sementara mutasi keluar bernilai
  // negatif — karena itu yang keluar dibalik tandanya di sini.
  const tunai = total('dompet', 'income')
  const qris = total('rekening', 'income')
  const setoran = total('rekening', 'setoran')
  const pengeluaranCash = -total('dompet', 'pengeluaran')
  const pengeluaranRek = -total('rekening', 'pengeluaran')
  const gajiCash = -total('dompet', 'gaji')
  const gajiRek = -total('rekening', 'gaji')

  const saldoSumber = (sumber: SumberKas, awal: number) =>
    mutasi
      .filter((m) => m.sumber === sumber)
      .reduce((s, m) => s + m.nilai, awal)

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
    dompetDiharapkan: saldoSumber('dompet', data.saldoAwal?.dompet ?? 0),
    rekeningDiharapkan: saldoSumber('rekening', data.saldoAwal?.rekening ?? 0),
    uangBesarSaldo: uangBesarMasuk - uangBesarKeluar,
  }
}
