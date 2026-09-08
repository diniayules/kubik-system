// =============================================================
// manajemen.ts · Agregasi untuk Dashboard Manajemen (owner & manajer).
//
// Semua fungsi di sini MURNI (input → output, tanpa efek samping) dan hanya
// menyusun ulang data yang sudah ada. Tidak ada sumber angka baru: omzet
// memakai hitungIncome, event memakai hitungEvent, kehadiran memakai
// hitungRingkasan, kas memakai kas.ts — supaya angka di dashboard ini selalu
// sama dengan layar aslinya.
// =============================================================
import type {
  AbsenHari,
  AppData,
  ClosingTask,
  DayType,
  EskalasiOwner,
  EventKategori,
  JadwalShift,
  Kemitraan,
  KemitraanBentuk,
  KemitraanJenis,
  KemitraanStatus,
  Lead,
  LaporanHarian,
  LeadTahap,
  PromoProgram,
  RitmeKonten,
  Shift,
  SosmedHarian,
  StatusLaporanHarian,
  TahapKonten,
  TargetBulanan,
} from './types'
import { cariTakeover, hitungRingkasan, isHariKerja } from './attendance'
import { hitungEvent } from './event'
import {
  formatRupiah,
  hitungIncome,
  hitungPemakaianStok,
  ringkasanPerKaryawan,
} from './income'
import { hariSeharusnyaBulan, hitungSlipGaji } from './gaji'
import { isOwner as isAkunOwner, isPengelola } from './lib/roles'

// Ambang "stok menipis" — mengikuti badge `.tipis` di layar Inventaris
// (kertas & frame < 10, tinta < 2). Amplop belum punya padanan di sana.
//
// Ambang tetap ini hanya CADANGAN: begitu sebuah item punya riwayat pemakaian,
// penilaiannya pindah ke "berapa hari lagi habis" (lihat `operasional()`) —
// 10 lembar kertas yang laku 1 lembar/hari tidak mendesak, sedangkan 10 lembar
// yang laku 5/hari harus dibeli hari ini juga.
export const AMBANG_KERTAS = 10
export const AMBANG_FRAME = 10
export const AMBANG_TINTA = 2
export const AMBANG_AMPLOP = 50

/** Jendela hari ke belakang untuk mengukur rata-rata pemakaian stok. */
export const JENDELA_PEMAKAIAN = 30
/** Sisa < 7 hari = merah (harus dibeli sekarang). */
export const HARI_SISA_MERAH = 7
/** Sisa < 14 hari = kuning (masukkan daftar belanja minggu ini). */
export const HARI_SISA_KUNING = 14

/** `2026-09` → `2026-08`. */
export function bulanSebelumnya(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** N bulan terakhir yang berakhir di `monthKey`, urut lama → baru. */
export function bulanTerakhir(monthKey: string, n: number): string[] {
  const out: string[] = []
  let k = monthKey
  for (let i = 0; i < n; i += 1) {
    out.unshift(k)
    k = bulanSebelumnya(k)
  }
  return out
}

/** Bulan yang punya data (income / event / pengeluaran), terbaru dulu. */
export function bulanTersedia(data: AppData, hariIni: string): string[] {
  const set = new Set<string>([hariIni.slice(0, 7)])
  for (const l of data.laporanIncome) set.add(l.tanggal.slice(0, 7))
  for (const e of data.laporanEvent) set.add(e.tanggal.slice(0, 7))
  for (const p of data.pengeluaran) set.add(p.tanggal.slice(0, 7))
  return [...set].sort().reverse()
}

// ---------------------------------------------------------------
// 1. Ringkasan keuangan satu bulan
// ---------------------------------------------------------------

export type RingkasanBulan = {
  monthKey: string
  /** Omzet Photo Studio (laporan income harian), sudah dikurangi potongan. */
  omzetStudio: number
  potonganHarga: number
  incomeTiket: number
  incomeCetak: number
  incomeUpgrade: number
  incomeProduk: number
  qtyTiket: number
  qtyCetak: number
  qtyUpgrade: number
  qtyProduk: number
  /** Event (Photobooth & Photo Game) — pendapatan kotor, biaya, dan labanya. */
  eventPendapatan: number
  eventBiaya: number
  eventLaba: number
  eventPerKategori: Record<
    EventKategori,
    { pendapatan: number; biaya: number; laba: number; jumlah: number }
  >
  pengeluaran: number
  pengeluaranPerKategori: { kategori: string; jumlah: number }[]
  /** Omzet total = studio + pendapatan event. */
  omzet: number
  /** Biaya total = pengeluaran studio + biaya event. */
  biaya: number
  laba: number
  /**
   * Beban gaji karyawan bulan ini — AKRUAL slip gaji (gaji pokok terhitung +
   * bonus + lembur − potongan), bukan kas yang keluar. Dipakai supaya "margin
   * bersih" tidak melompat mengikuti tanggal gajian.
   */
  bebanGaji: number
  /** Biaya di luar gaji — inilah yang benar-benar dikendalikan operasional. */
  biayaOperasional: number
  /** Omzet − biaya operasional (SEBELUM gaji). */
  labaOperasional: number
  /**
   * labaOperasional ÷ omzet. Ini angka yang boleh dilihat manajer: ia mengukur
   * seberapa efisien studio dijalankan, tanpa membuka struktur gaji.
   */
  marginOperasional: number
  /** Laba ÷ omzet, SETELAH gaji. Owner-only. 0 kalau belum ada omzet. */
  margin: number
  /** Jumlah laporan income harian di bulan ini. */
  hariBerlaporan: number
  /** Hari yang sudah berjalan di bulan ini (bulan berjalan = s/d hari ini). */
  hariBerjalan: number
  /** Rata-rata omzet studio per hari berjalan. */
  rataPerHari: number
}

const EVENT_KOSONG = () => ({ pendapatan: 0, biaya: 0, laba: 0, jumlah: 0 })

export function ringkasanBulan(
  data: AppData,
  monthKey: string,
  hariIni: string,
): RingkasanBulan {
  const lap = data.laporanIncome.filter((l) => l.tanggal.startsWith(monthKey))

  let omzetStudio = 0
  let potonganHarga = 0
  let incomeTiket = 0
  let incomeCetak = 0
  let incomeUpgrade = 0
  let incomeProduk = 0
  let qtyTiket = 0
  let qtyCetak = 0
  let qtyUpgrade = 0
  let qtyProduk = 0
  for (const l of lap) {
    const b = hitungIncome(l)
    omzetStudio += b.total
    potonganHarga += b.potonganHarga
    incomeTiket += b.incomeTiket
    incomeCetak += b.incomeCetak
    incomeUpgrade += b.incomeUpgrade
    incomeProduk += b.incomeProduk
    for (const r of Object.values(ringkasanPerKaryawan(l))) {
      qtyTiket += r.tiket
      qtyCetak += r.cetak
      qtyUpgrade += r.upgrade
      qtyProduk += r.produk
    }
  }

  const eventPerKategori: RingkasanBulan['eventPerKategori'] = {
    photobooth: EVENT_KOSONG(),
    game: EVENT_KOSONG(),
  }
  let eventPendapatan = 0
  let eventBiaya = 0
  for (const e of data.laporanEvent.filter((x) =>
    x.tanggal.startsWith(monthKey),
  )) {
    const b = hitungEvent(e)
    const slot = eventPerKategori[e.kategori] ?? EVENT_KOSONG()
    slot.pendapatan += b.pendapatan
    slot.biaya += b.biaya
    slot.laba += b.laba
    slot.jumlah += 1
    eventPerKategori[e.kategori] = slot
    eventPendapatan += b.pendapatan
    eventBiaya += b.biaya
  }

  const pengList = data.pengeluaran.filter((p) => p.tanggal.startsWith(monthKey))
  const pengeluaran = pengList.reduce((s, p) => s + (p.jumlah || 0), 0)
  const perKategori = new Map<string, number>()
  for (const p of pengList) {
    const k = p.kategori || 'Lainnya'
    perKategori.set(k, (perKategori.get(k) ?? 0) + (p.jumlah || 0))
  }

  const hariBerjalan = hariSeharusnyaBulan(monthKey, hariIni)

  // ---- beban gaji ----------------------------------------------------------
  // Dua sumber yang bisa saling menimpa: gaji yang sudah DIBAYAR biasanya
  // tercatat sebagai pengeluaran kategori "Gaji", sedangkan gaji yang belum
  // dibayar hanya ada sebagai akrual slip. Dijumlahkan mentah-mentah, bulan
  // gajian akan terhitung dua kali — jadi dipakai yang TERBESAR, dan sisi
  // pengeluaran dikeluarkan dari biaya operasional.
  const gajiTercatat = pengList
    .filter((p) => (p.kategori || '').trim().toLowerCase() === 'gaji')
    .reduce((s, p) => s + (p.jumlah || 0), 0)
  const recordsBulan = data.records.filter(
    (r) => r.tanggal.startsWith(monthKey) && r.status !== 'menunggu',
  )
  let gajiSlip = 0
  for (const e of data.employees.filter((x) => !isAkunOwner(x.role))) {
    const pokok = data.gajiPokok?.[e.id] ?? 0
    if (pokok <= 0) continue
    gajiSlip += hitungSlipGaji(e, pokok, recordsBulan, lap, hariBerjalan).total
  }
  const bebanGaji = Math.max(gajiTercatat, gajiSlip)

  const omzet = omzetStudio + eventPendapatan
  const biaya = pengeluaran + eventBiaya
  const biayaOperasional = biaya - gajiTercatat
  const labaOperasional = omzet - biayaOperasional
  const laba = labaOperasional - bebanGaji

  return {
    monthKey,
    omzetStudio,
    potonganHarga,
    incomeTiket,
    incomeCetak,
    incomeUpgrade,
    incomeProduk,
    qtyTiket,
    qtyCetak,
    qtyUpgrade,
    qtyProduk,
    eventPendapatan,
    eventBiaya,
    eventLaba: eventPendapatan - eventBiaya,
    eventPerKategori,
    pengeluaran,
    pengeluaranPerKategori: [...perKategori.entries()]
      .map(([kategori, jumlah]) => ({ kategori, jumlah }))
      .sort((a, b) => b.jumlah - a.jumlah),
    omzet,
    biaya,
    bebanGaji,
    biayaOperasional,
    labaOperasional,
    marginOperasional: omzet > 0 ? labaOperasional / omzet : 0,
    laba,
    margin: omzet > 0 ? laba / omzet : 0,
    hariBerlaporan: lap.length,
    hariBerjalan,
    rataPerHari: hariBerjalan > 0 ? omzetStudio / hariBerjalan : 0,
  }
}

/** Perubahan relatif terhadap bulan lalu. `null` = tidak bisa dibandingkan. */
export function delta(sekarang: number, lalu: number): number | null {
  if (lalu === 0) return sekarang === 0 ? 0 : null
  return (sekarang - lalu) / Math.abs(lalu)
}

// ---------------------------------------------------------------
// 2. Kinerja karyawan
// ---------------------------------------------------------------

export type KinerjaKaryawan = {
  id: string
  nama: string
  jabatan: string
  foto?: string
  /**
   * true untuk akun manajer (mis. Kepala Operator). Mereka IKUT dinilai di
   * tabel ini — orang yang mengatur jadwal orang lain juga harus terlihat
   * hadir/telatnya, kalau tidak satu-satunya baris yang tak pernah merah
   * adalah baris atasannya sendiri.
   */
  pengelola: boolean
  hariHadir: number
  hariSeharusnya: number
  /** hariHadir ÷ hariSeharusnya, 0–1. */
  kehadiran: number
  hariCuti: number
  hariLibur: number
  terlambatMenit: number
  lemburMenit: number
  kerjaMenit: number
  jumlahItem: number
  penjualan: number
}

/**
 * Kehadiran, disiplin jam & kontribusi penjualan per orang.
 *
 * Yang dikeluarkan hanya OWNER — manajer/kepala operator tetap masuk tabel:
 * mereka ikut shift, dan kehadirannya adalah bagian dari KPI operasional.
 */
export function kinerjaKaryawan(
  data: AppData,
  monthKey: string,
  hariIni: string,
): KinerjaKaryawan[] {
  const staf = data.employees.filter((e) => !isAkunOwner(e.role))
  const hariSeharusnya = hariSeharusnyaBulan(monthKey, hariIni)
  const byId = new Map<string, KinerjaKaryawan>()
  for (const e of staf) {
    byId.set(e.id, {
      id: e.id,
      nama: e.nama,
      jabatan: e.jabatan,
      foto: e.foto,
      pengelola: isPengelola(e.role),
      hariHadir: 0,
      hariSeharusnya,
      kehadiran: 0,
      hariCuti: 0,
      hariLibur: 0,
      terlambatMenit: 0,
      lemburMenit: 0,
      kerjaMenit: 0,
      jumlahItem: 0,
      penjualan: 0,
    })
  }

  for (const rec of data.records) {
    if (!rec.tanggal.startsWith(monthKey)) continue
    const k = byId.get(rec.employeeId)
    if (!k) continue
    if (rec.status === 'menunggu') continue // belum di-ACC → tidak dihitung
    if (rec.shift === 'cuti') {
      k.hariCuti += 1
      continue
    }
    if (rec.shift === 'libur' || rec.shift === 'bersih') {
      k.hariLibur += 1
      continue
    }
    // Kehadiran pengelola di studio ('pantau') dihitung sebagai HARI HADIR —
    // itu memang inti KPI-nya (seberapa sering ia turun ke studio) — tapi tidak
    // punya jadwal, jadi tidak menyumbang jam kerja, telat, maupun lembur.
    if (rec.shift === 'pantau') {
      k.hariHadir += 1
      continue
    }
    const ring = hitungRingkasan(rec, cariTakeover(rec, data.records))
    k.hariHadir += 1
    k.terlambatMenit += ring.terlambatMenit
    k.lemburMenit += ring.lemburMenit
    k.kerjaMenit += ring.kerjaBersihMenit
  }

  for (const l of data.laporanIncome) {
    if (!l.tanggal.startsWith(monthKey)) continue
    for (const [id, r] of Object.entries(ringkasanPerKaryawan(l))) {
      const k = byId.get(id)
      if (!k) continue
      k.jumlahItem += r.tiket + r.cetak + r.upgrade + r.produk
      k.penjualan += r.total
    }
  }

  const out = [...byId.values()]
  for (const k of out) {
    k.kehadiran =
      k.hariSeharusnya > 0 ? Math.min(1, k.hariHadir / k.hariSeharusnya) : 0
  }
  return out.sort((a, b) => b.penjualan - a.penjualan)
}

// ---------------------------------------------------------------
// 3. Jobdesk & checklist
// ---------------------------------------------------------------

/** Task yang berlaku untuk sebuah shift (kosong/undefined = semua shift). */
export function taskUntukShift<T extends ClosingTask>(
  list: T[],
  shift: Shift,
): T[] {
  return list.filter((t) => !t.shifts || t.shifts.length === 0 || t.shifts.includes(shift))
}

export type KepatuhanOrang = {
  id: string
  nama: string
  jabatan: string
  foto?: string
  /** Task pagi yang seharusnya dicentang & yang benar-benar dicentang. */
  pagiWajib: number
  pagiSelesai: number
  /** Idem untuk closing — hanya dihitung pada hari yang sudah clock out. */
  pulangWajib: number
  pulangSelesai: number
  /** (pagiSelesai + pulangSelesai) ÷ (pagiWajib + pulangWajib), 0–1. */
  kepatuhan: number
}

export type TaskTerlewat = {
  id: string
  label: string
  jenis: 'pagi' | 'pulang'
  terlewat: number
  wajib: number
}

export type KepatuhanChecklist = {
  perOrang: KepatuhanOrang[]
  taskTerlewat: TaskTerlewat[]
  totalWajib: number
  totalSelesai: number
  /** 0–1; 0 kalau checklist belum dikonfigurasi sama sekali. */
  rata: number
  /** true kalau admin belum mengatur satu pun task (fitur nonaktif). */
  belumDiatur: boolean
}

export function kepatuhanChecklist(
  data: AppData,
  monthKey: string,
): KepatuhanChecklist {
  const staf = data.employees.filter((e) => !isPengelola(e.role))
  const perOrang = new Map<string, KepatuhanOrang>()
  for (const e of staf) {
    perOrang.set(e.id, {
      id: e.id,
      nama: e.nama,
      jabatan: e.jabatan,
      foto: e.foto,
      pagiWajib: 0,
      pagiSelesai: 0,
      pulangWajib: 0,
      pulangSelesai: 0,
      kepatuhan: 0,
    })
  }

  const miss = new Map<string, TaskTerlewat>()
  function catat(
    jenis: 'pagi' | 'pulang',
    task: ClosingTask,
    selesai: boolean,
  ) {
    const key = `${jenis}:${task.id}`
    const cur =
      miss.get(key) ??
      { id: task.id, label: task.label, jenis, terlewat: 0, wajib: 0 }
    cur.wajib += 1
    if (!selesai) cur.terlewat += 1
    miss.set(key, cur)
  }

  const sudahMasuk = (r: AbsenHari) => r.events.some((e) => e.tipe === 'masuk')
  const sudahPulang = (r: AbsenHari) => r.events.some((e) => e.tipe === 'pulang')

  for (const rec of data.records) {
    if (!rec.tanggal.startsWith(monthKey)) continue
    if (rec.status === 'menunggu') continue
    if (!isHariKerja(rec.shift)) continue
    const orang = perOrang.get(rec.employeeId)
    if (!orang) continue

    if (sudahMasuk(rec)) {
      const wajib = taskUntukShift(data.openingChecklist ?? [], rec.shift)
      const done = new Set((rec.checklistMasuk ?? []).map((x) => x.id))
      orang.pagiWajib += wajib.length
      for (const t of wajib) {
        const ok = done.has(t.id)
        if (ok) orang.pagiSelesai += 1
        catat('pagi', t, ok)
      }
    }

    if (sudahPulang(rec)) {
      const wajib = taskUntukShift(data.closingChecklist ?? [], rec.shift)
      const done = new Set((rec.checklistPulang ?? []).map((x) => x.id))
      orang.pulangWajib += wajib.length
      for (const t of wajib) {
        const ok = done.has(t.id)
        if (ok) orang.pulangSelesai += 1
        catat('pulang', t, ok)
      }
    }
  }

  let totalWajib = 0
  let totalSelesai = 0
  const list = [...perOrang.values()]
  for (const o of list) {
    const wajib = o.pagiWajib + o.pulangWajib
    const selesai = o.pagiSelesai + o.pulangSelesai
    o.kepatuhan = wajib > 0 ? selesai / wajib : 0
    totalWajib += wajib
    totalSelesai += selesai
  }

  return {
    perOrang: list.sort((a, b) => b.kepatuhan - a.kepatuhan),
    taskTerlewat: [...miss.values()]
      .filter((t) => t.terlewat > 0)
      .sort((a, b) => b.terlewat - a.terlewat),
    totalWajib,
    totalSelesai,
    rata: totalWajib > 0 ? totalSelesai / totalWajib : 0,
    belumDiatur:
      (data.openingChecklist ?? []).length === 0 &&
      (data.closingChecklist ?? []).length === 0,
  }
}

// ---------------------------------------------------------------
// 4. Kesehatan operasional & antrean tindakan
// ---------------------------------------------------------------

export type StokKritis = {
  nama: string
  stok: number
  satuan: string
  ambang: number
  /** Rata-rata pemakaian per hari dari 30 hari terakhir. 0 = tidak ada data. */
  pemakaianHarian: number
  /** stok ÷ pemakaianHarian. `null` = belum bisa dihitung (tanpa pemakaian). */
  hariSisa: number | null
  /** merah = harus dibeli sekarang, kuning = masuk daftar belanja minggu ini. */
  tingkat: 'merah' | 'kuning'
  /** Dari mana kesimpulannya: hari sisa (akurat) atau ambang tetap (cadangan). */
  dasar: 'pemakaian' | 'ambang'
}

export type Operasional = {
  stokKritis: StokKritis[]
  totalKertas: number
  totalFrame: number
  totalTinta: number
  amplop: number
  salahCetakBulan: number
  /** Hari yang sudah lewat di bulan ini tapi belum ada laporan income. */
  hariTanpaLaporan: number
  absenMenunggu: number
  promoMenunggu: number
}

/**
 * Rata-rata pemakaian per hari dari {@link JENDELA_PEMAKAIAN} hari terakhir.
 *
 * Sumbernya laporan income (lewat `hitungPemakaianStok`, jadi hitungannya sama
 * persis dengan yang memotong stok) ditambah salah cetak — kertas yang terbuang
 * tetap kertas yang harus dibeli lagi.
 */
export type PemakaianHarian = {
  kertas: Record<string, number>
  frame: Record<string, number>
  amplop: number
}

export function pemakaianHarian(
  data: AppData,
  hariIni: string,
  jendela = JENDELA_PEMAKAIAN,
): PemakaianHarian {
  const mulai = new Date(`${hariIni}T00:00:00`)
  mulai.setDate(mulai.getDate() - jendela)
  const batas = `${mulai.getFullYear()}-${String(mulai.getMonth() + 1).padStart(2, '0')}-${String(mulai.getDate()).padStart(2, '0')}`

  const kertas: Record<string, number> = {}
  const frame: Record<string, number> = {}
  let amplop = 0
  for (const l of data.laporanIncome) {
    if (l.tanggal <= batas || l.tanggal > hariIni) continue
    const pakai = hitungPemakaianStok(
      l,
      data.stokKertas,
      data.upgradeCatalog,
      data.produkCatalog,
      data.stokFrame,
    )
    for (const [id, n] of Object.entries(pakai.kertas)) kertas[id] = (kertas[id] ?? 0) + n
    for (const [id, n] of Object.entries(pakai.frame)) frame[id] = (frame[id] ?? 0) + n
    amplop += pakai.amplop
  }
  for (const sc of data.salahCetak) {
    if (sc.tanggal <= batas || sc.tanggal > hariIni) continue
    kertas[sc.kertasId] = (kertas[sc.kertasId] ?? 0) + (sc.jumlah || 0)
  }

  const perHari = (n: number) => n / jendela
  return {
    kertas: Object.fromEntries(
      Object.entries(kertas).map(([id, n]) => [id, perHari(n)]),
    ),
    frame: Object.fromEntries(
      Object.entries(frame).map(([id, n]) => [id, perHari(n)]),
    ),
    amplop: perHari(amplop),
  }
}

/**
 * Nilai satu item stok. Kalau ada riwayat pemakaian, yang dipakai adalah HARI
 * SISA (stok ÷ pemakaian/hari) — bukan ambang tetap. `null` = aman, tidak perlu
 * masuk daftar.
 */
function nilaiStok(
  nama: string,
  stok: number,
  satuan: string,
  ambang: number,
  perHari: number,
): StokKritis | null {
  if (perHari > 0) {
    const hariSisa = stok / perHari
    if (hariSisa >= HARI_SISA_KUNING) return null
    return {
      nama,
      stok,
      satuan,
      ambang,
      pemakaianHarian: perHari,
      hariSisa,
      tingkat: hariSisa < HARI_SISA_MERAH ? 'merah' : 'kuning',
      dasar: 'pemakaian',
    }
  }
  // Tanpa data pemakaian (mis. tinta, atau frame yang belum pernah terjual)
  // ambang tetap tetap berlaku — lebih baik peringatan kasar daripada diam.
  if (stok >= ambang) return null
  return {
    nama,
    stok,
    satuan,
    ambang,
    pemakaianHarian: 0,
    hariSisa: null,
    tingkat: stok === 0 ? 'merah' : 'kuning',
    dasar: 'ambang',
  }
}

export function operasional(
  data: AppData,
  monthKey: string,
  hariIni: string,
): Operasional {
  const pakai = pemakaianHarian(data, hariIni)
  const stokKritis: StokKritis[] = []
  const tambah = (x: StokKritis | null) => {
    if (x) stokKritis.push(x)
  }
  for (const k of data.stokKertas) {
    tambah(nilaiStok(`Kertas ${k.nama}`, k.stok, 'lembar', AMBANG_KERTAS, pakai.kertas[k.id] ?? 0))
  }
  for (const f of data.stokFrame) {
    tambah(nilaiStok(`Frame ${f.nama}`, f.stok, 'pcs', AMBANG_FRAME, pakai.frame[f.id] ?? 0))
  }
  // Tinta tidak punya jejak pemakaian per laporan, jadi tetap ambang manual.
  for (const t of data.stokTinta) {
    tambah(nilaiStok(`Tinta ${t.warna}`, t.stok, 'botol', AMBANG_TINTA, 0))
  }
  tambah(nilaiStok('Amplop', data.stokAmplop, 'pcs', AMBANG_AMPLOP, pakai.amplop))

  const hariBerjalan = hariSeharusnyaBulan(monthKey, hariIni)
  const berlaporan = new Set(
    data.laporanIncome
      .filter((l) => l.tanggal.startsWith(monthKey))
      .map((l) => l.tanggal),
  )

  return {
    // Yang paling cepat habis di atas; item tanpa data pemakaian menyusul.
    stokKritis: stokKritis.sort(
      (a, b) => (a.hariSisa ?? Infinity) - (b.hariSisa ?? Infinity) || a.stok - b.stok,
    ),
    totalKertas: data.stokKertas.reduce((s, k) => s + (k.stok || 0), 0),
    totalFrame: data.stokFrame.reduce((s, f) => s + (f.stok || 0), 0),
    totalTinta: data.stokTinta.reduce((s, t) => s + (t.stok || 0), 0),
    amplop: data.stokAmplop,
    salahCetakBulan: data.salahCetak
      .filter((s) => s.tanggal.startsWith(monthKey))
      .reduce((s, x) => s + (x.jumlah || 0), 0),
    hariTanpaLaporan: Math.max(0, hariBerjalan - berlaporan.size),
    absenMenunggu: data.records.filter((r) => r.status === 'menunggu').length,
    promoMenunggu: data.promoPrograms.filter((p) => p.status === 'menunggu')
      .length,
  }
}

// ---------------------------------------------------------------
// 5. Cakupan jadwal shift (roster)
// ---------------------------------------------------------------

/** Slot yang harus ada penjaganya setiap hari studio buka. */
export const SLOT_WAJIB: Shift[] = ['pagi', 'sore']

/** Shift `full` menutup dua slot sekaligus. */
function menutupSlot(shift: DayType, slot: Shift): boolean {
  if (shift === 'full') return true
  return shift === slot
}

export type HariJadwal = {
  tanggal: string
  /** Orang yang dijadwalkan bekerja hari itu (pagi/sore/full). */
  kerja: JadwalShift[]
  /** Slot yang belum ada penanggung jawabnya. */
  kosong: Shift[]
  /** Studio memang dijadwalkan tutup — bukan kelalaian. */
  libur: boolean
  /**
   * Hari itu Kubik BUKA: ada laporan pemasukan. Ini bukti yang mengalahkan
   * roster — hari yang menghasilkan uang tapi tidak ada operator terjadwal
   * bukan "hari libur", melainkan hari yang jadwalnya tidak diurus.
   */
  buka: boolean
  /** Belum ada satu pun baris jadwal untuk tanggal ini. */
  belumDisusun: boolean
  /** Semua slot wajib terisi, atau memang libur. */
  tercover: boolean
}

export type CakupanShift = {
  /** Semua tanggal di bulan terpilih, urut. */
  perHari: HariJadwal[]
  hariTercover: number
  /** Hari yang dinilai = hari yang SUDAH berjalan di bulan itu. */
  hariDinilai: number
  /** hariTercover ÷ hariDinilai, 0–1. */
  cakupan: number
  /**
   * Lubang jadwal MULAI HARI INI ke depan — inti nilai roster: bukan menyesali
   * kemarin, tapi mencegah "Sabtu depan tidak ada operator". Tidak dibatasi ke
   * bulan terpilih dinilai lewat `perHari`, tapi diambil dari seluruh horizon.
   */
  bolongMendatang: HariJadwal[]
  /** Hari yang ada pemasukannya tapi tidak ada operator terjadwal sama sekali. */
  bukaTanpaOperator: string[]
  /**
   * true = KPI cakupan shift belum bisa dinilai.
   *
   * Sengaja BUKAN "roster kosong": roster kosong justru 0%, bukan "belum
   * aktif". KPI ini mati hanya kalau bulan itu memang belum terjadi apa-apa —
   * tidak ada satu pun shift terjadwal DAN tidak ada satu pun hari berpemasukan.
   */
  belumDisusun: boolean
}

/** `2026-09` + 4 → `2026-09-04`. */
function tanggalKe(monthKey: string, hari: number): string {
  return `${monthKey}-${String(hari).padStart(2, '0')}`
}

/**
 * Rangkum roster satu bulan, plus lubang jadwal ke depan.
 *
 * @param horizonHari berapa hari ke depan yang diperiksa untuk `bolongMendatang`.
 */
export function cakupanShift(
  data: AppData,
  monthKey: string,
  hariIni: string,
  horizonHari = 14,
): CakupanShift {
  const semua = data.jadwalShift ?? []
  const perTanggal = new Map<string, JadwalShift[]>()
  for (const j of semua) {
    const list = perTanggal.get(j.tanggal) ?? []
    list.push(j)
    perTanggal.set(j.tanggal, list)
  }
  // Hari yang terbukti buka — dipakai untuk membedakan "libur" dari "lalai".
  const hariBuka = new Set(data.laporanIncome.map((l) => l.tanggal))

  function nilaiHari(tanggal: string): HariJadwal {
    const baris = perTanggal.get(tanggal) ?? []
    const kerja = baris.filter((j) => isHariKerja(j.shift))
    const buka = hariBuka.has(tanggal)
    // "Libur studio" hanya berlaku kalau memang tidak ada yang dijadwalkan
    // bekerja — kalau ada, hari itu tetap hari buka bagi mereka. Dan kalau
    // ternyata hari itu ada pemasukan, klaim "libur" gugur: studio buka.
    const libur =
      !buka && kerja.length === 0 && baris.some((j) => j.shift === 'libur')
    const kosong = libur
      ? []
      : SLOT_WAJIB.filter((slot) => !kerja.some((j) => menutupSlot(j.shift, slot)))
    return {
      tanggal,
      kerja,
      kosong,
      libur,
      buka,
      belumDisusun: baris.length === 0,
      tercover: libur || kosong.length === 0,
    }
  }

  const totalHari = hariDalamBulan(monthKey)
  const perHari: HariJadwal[] = []
  for (let d = 1; d <= totalHari; d += 1) perHari.push(nilaiHari(tanggalKe(monthKey, d)))

  const hariDinilai = hariSeharusnyaBulan(monthKey, hariIni)
  const hariTercover = perHari
    .slice(0, hariDinilai)
    .filter((h) => h.tercover).length

  const bolongMendatang: HariJadwal[] = []
  const mulai = new Date(`${hariIni}T00:00:00`)
  for (let i = 0; i < horizonHari; i += 1) {
    const d = new Date(mulai)
    d.setDate(d.getDate() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const h = nilaiHari(key)
    if (!h.tercover) bolongMendatang.push(h)
  }

  const dinilai = perHari.slice(0, hariDinilai)
  return {
    perHari,
    hariTercover,
    hariDinilai,
    cakupan: hariDinilai > 0 ? hariTercover / hariDinilai : 0,
    bolongMendatang,
    bukaTanpaOperator: dinilai
      .filter((h) => h.buka && h.kerja.length === 0)
      .map((h) => h.tanggal),
    belumDisusun:
      !semua.some((j) => j.tanggal.startsWith(monthKey)) &&
      !dinilai.some((h) => h.buka),
  }
}

// ---------------------------------------------------------------
// 5b. Kesiapan jadwal minggu depan (KPI khusus manajer)
// ---------------------------------------------------------------

/** Jadwal satu minggu harus sudah terisi paling lambat H-3 sebelum dimulai. */
export const AMBANG_JADWAL_H = 3

export type MingguJadwal = {
  /** Senin awal minggu, `YYYY-MM-DD`. */
  mulai: string
  selesai: string
  /** Batas waktu penyusunan (H-3 dari `mulai`). */
  batas: string
  /** Hari minggu ini yang jatuh di bulan terpilih. */
  hariDinilai: number
  /** Dari itu, berapa yang sudah punya baris jadwal (termasuk 'libur'). */
  hariTerisi: number
  /** Batas H-3 sudah lewat → minggu ini boleh dinilai. */
  jatuhTempo: boolean
  /** Semua harinya sudah disusun sebelum dinilai. */
  siap: boolean
}

export type KesiapanJadwal = {
  perMinggu: MingguJadwal[]
  siap: number
  dinilai: number
  /** siap ÷ dinilai, 0–1. */
  rasio: number
  /** Minggu terdekat yang batasnya belum lewat — yang harus dikerjakan sekarang. */
  berikutnya?: MingguJadwal
}

/** `YYYY-MM-DD` + n hari. */
function geserHari(tanggal: string, n: number): string {
  const d = new Date(`${tanggal}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Senin dari minggu yang memuat `tanggal`. Satu-satunya definisi "minggu"
 * di berkas ini — dipakai roster shift maupun denyut konten supaya keduanya
 * tidak pernah memotong minggu di tempat berbeda. */
export function seninMinggu(tanggal: string): string {
  const hari = new Date(`${tanggal}T00:00:00`).getDay() // 0=Minggu
  return geserHari(tanggal, hari === 0 ? -6 : 1 - hari)
}

/**
 * Apakah roster minggu depan sudah disusun sebelum H-3?
 *
 * KPI ini hanya bisa dipenuhi orang yang memegang jadwal — operator tidak bisa
 * "tidak sengaja" memenuhinya seperti KPI kehadiran.
 *
 * Keterbatasan yang disengaja: `jadwal_shift` tidak menyimpan KAPAN barisnya
 * dibuat, jadi minggu yang sudah lewat dinilai dari keadaan SEKARANG (terisi =
 * dianggap disusun tepat waktu). Yang benar-benar tajam adalah minggu terdekat
 * yang batasnya baru saja lewat — dan itulah yang dipakai sehari-hari.
 */
export function kesiapanJadwal(
  data: AppData,
  monthKey: string,
  hariIni: string,
): KesiapanJadwal {
  const adaJadwal = new Set((data.jadwalShift ?? []).map((j) => j.tanggal))
  const totalHari = hariDalamBulan(monthKey)

  // Kelompokkan tanggal bulan ini per minggu (Senin sebagai awal minggu).
  const minggu = new Map<string, string[]>()
  for (let d = 1; d <= totalHari; d += 1) {
    const tanggal = tanggalKe(monthKey, d)
    const senin = seninMinggu(tanggal)
    const list = minggu.get(senin) ?? []
    list.push(tanggal)
    minggu.set(senin, list)
  }

  const perMinggu: MingguJadwal[] = [...minggu.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mulai, hariList]) => {
      const batas = geserHari(mulai, -AMBANG_JADWAL_H)
      const terisi = hariList.filter((t) => adaJadwal.has(t)).length
      return {
        mulai,
        selesai: geserHari(mulai, 6),
        batas,
        hariDinilai: hariList.length,
        hariTerisi: terisi,
        jatuhTempo: hariIni >= batas,
        siap: terisi === hariList.length,
      }
    })

  const dinilai = perMinggu.filter((m) => m.jatuhTempo)
  const siap = dinilai.filter((m) => m.siap).length
  return {
    perMinggu,
    siap,
    dinilai: dinilai.length,
    rasio: dinilai.length > 0 ? siap / dinilai.length : 0,
    berikutnya: perMinggu.find((m) => !m.jatuhTempo && !m.siap),
  }
}

// ---------------------------------------------------------------
// 6. Sosial media & eksekusi konten
// ---------------------------------------------------------------

export const AKSI_SOSMED = ['posting', 'story', 'repost', 'engagement'] as const
export type AksiSosmed = (typeof AKSI_SOSMED)[number]

export const AKSI_SOSMED_LABEL: Record<AksiSosmed, string> = {
  posting: 'Posting',
  story: 'Story',
  repost: 'Repost',
  engagement: 'Engagement',
}

/**
 * Siapa saja yang mengerjakan sosmed pada satu hari.
 *
 * Satu hari bisa dikerjakan lebih dari satu orang, dan sebagiannya orang yang
 * tidak punya akun (freelancer). `olehList` adalah sumber kebenarannya; kolom
 * lama `oleh` hanya cadangan untuk baris yang dicatat sebelum migration 0049.
 */
export function pengerjaSosmed(r: SosmedHarian): string[] {
  if (r.olehList && r.olehList.length > 0) return r.olehList
  return r.oleh ? [r.oleh] : []
}

export type HariSosmed = {
  tanggal: string
  /** Sudah lewat/hari ini — hari yang belum tiba tidak dinilai. */
  berjalan: boolean
  /** Minimal satu aksi tercatat. */
  aktif: boolean
  /** Berapa dari 4 aksi yang dikerjakan. */
  jumlahAksi: number
  engagement: boolean
  /** Id profil ATAU nama bebas — bisa lebih dari satu orang. */
  olehList: string[]
}

export type AktivitasSosmed = {
  perHari: HariSosmed[]
  hariBerjalan: number
  /** Hari dengan minimal satu aksi. */
  hariAktif: number
  /** Hari yang aksi engagement-nya dicentang. */
  hariEngagement: number
  /** hariAktif ÷ hariBerjalan, 0–1. */
  konsistensi: number
  /** Rentetan hari aktif terpanjang di bulan ini. */
  runTerpanjang: number
  /** Rentetan hari aktif yang masih berjalan sampai hari terakhir. */
  runSekarang: number
  /** Tanggal yang sudah lewat tapi kosong — daftar yang perlu dikejar. */
  bolong: string[]
  /** true kalau belum pernah dicatat sama sekali (fitur belum dipakai). */
  belumDicatat: boolean
}

/** Rangkum log sosmed satu bulan. */
export function aktivitasSosmed(
  data: AppData,
  monthKey: string,
  hariIni: string,
): AktivitasSosmed {
  const log = new Map<string, SosmedHarian>()
  for (const r of data.sosmedHarian ?? []) log.set(r.tanggal, r)

  const total = hariDalamBulan(monthKey)
  const hariBerjalan = hariSeharusnyaBulan(monthKey, hariIni)
  const perHari: HariSosmed[] = []
  for (let d = 1; d <= total; d += 1) {
    const tanggal = tanggalKe(monthKey, d)
    const r = log.get(tanggal)
    const jumlahAksi = r ? AKSI_SOSMED.filter((a) => r[a]).length : 0
    perHari.push({
      tanggal,
      berjalan: d <= hariBerjalan,
      aktif: jumlahAksi > 0,
      jumlahAksi,
      engagement: !!r?.engagement,
      olehList: r ? pengerjaSosmed(r) : [],
    })
  }

  const dinilai = perHari.filter((h) => h.berjalan)
  let runTerpanjang = 0
  let run = 0
  for (const h of dinilai) {
    run = h.aktif ? run + 1 : 0
    if (run > runTerpanjang) runTerpanjang = run
  }
  // `run` berakhir di hari terakhir yang dinilai, jadi itulah rentetan berjalan.
  const runSekarang = run

  const hariAktif = dinilai.filter((h) => h.aktif).length
  return {
    perHari,
    hariBerjalan,
    hariAktif,
    hariEngagement: dinilai.filter((h) => h.engagement).length,
    konsistensi: hariBerjalan > 0 ? hariAktif / hariBerjalan : 0,
    runTerpanjang,
    runSekarang,
    bolong: dinilai.filter((h) => !h.aktif).map((h) => h.tanggal),
    belumDicatat: (data.sosmedHarian ?? []).length === 0,
  }
}


// -------------------------------------------------------------
// Laporan closing harian (migration 0052)
// -------------------------------------------------------------

export const STATUS_LAPORAN: StatusLaporanHarian[] = ['aman', 'kendala', 'eskalasi']

export const STATUS_LAPORAN_LABEL: Record<StatusLaporanHarian, string> = {
  aman: 'Aman',
  kendala: 'Ada kendala, sudah beres',
  eskalasi: 'Perlu keputusan owner',
}

/** Label pendek untuk badge & riwayat, di tempat yang sempit. */
export const STATUS_LAPORAN_PENDEK: Record<StatusLaporanHarian, string> = {
  aman: 'Aman',
  kendala: 'Kendala',
  eskalasi: 'Perlu owner',
}

export type HariLaporan = {
  tanggal: string
  /** Tanggalnya sudah lewat / sedang berjalan. */
  berjalan: boolean
  /**
   * Toko benar-benar buka hari itu. Hari libur tidak dihitung sebagai bolong —
   * menagih laporan pada hari tutup hanya melatih orang mengisi asal-asalan.
   */
  hariKerja: boolean
  status?: StatusLaporanHarian
  catatan: string
}

export type RingkasLaporan = {
  perHari: HariLaporan[]
  /** Hari kerja yang sudah lewat di bulan ini. */
  hariKerja: number
  terisi: number
  /** terisi ÷ hariKerja, 0–1. */
  rasio: number
  aman: number
  kendala: number
  eskalasi: number
  /** Hari kerja yang lewat tapi laporannya belum ditulis, terbaru di depan. */
  bolong: string[]
  /** Laporan yang sudah tertulis, terbaru di depan. */
  terakhir: LaporanHarian[]
  /** Fitur belum pernah dipakai sama sekali. */
  belumDicatat: boolean
}

/**
 * Rangkum laporan closing satu bulan.
 *
 * "Hari kerja" diambil dari jejak yang sudah ada — ada absen kerja ATAU ada
 * laporan pemasukan — bukan dari kalender. Hari yang tokonya memang tutup
 * tidak pernah dihitung bolong.
 */
export function laporanClosing(
  data: AppData,
  monthKey: string,
  hariIni: string,
): RingkasLaporan {
  const log = new Map<string, LaporanHarian>()
  for (const r of data.laporanHarian ?? []) log.set(r.tanggal, r)

  const buka = new Set<string>()
  for (const rec of data.records) {
    if (rec.tanggal.startsWith(monthKey) && isHariKerja(rec.shift)) {
      buka.add(rec.tanggal)
    }
  }
  for (const l of data.laporanIncome) {
    if (l.tanggal.startsWith(monthKey)) buka.add(l.tanggal)
  }

  const total = hariDalamBulan(monthKey)
  const hariBerjalan = hariSeharusnyaBulan(monthKey, hariIni)
  const perHari: HariLaporan[] = []
  for (let d = 1; d <= total; d += 1) {
    const tanggal = tanggalKe(monthKey, d)
    const r = log.get(tanggal)
    perHari.push({
      tanggal,
      berjalan: d <= hariBerjalan,
      hariKerja: buka.has(tanggal),
      status: r?.status,
      catatan: r?.catatan ?? '',
    })
  }

  /*
    Hari ini baru boleh ditagih SETELAH ada yang clock out — namanya laporan
    closing. Tanpa syarat ini, antrean sudah menuntut laporan sejak operator
    pertama absen masuk pagi-pagi, dan manajer belajar mengabaikannya.
  */
  const sudahClosing =
    hariIni.startsWith(monthKey) &&
    data.records.some(
      (r) =>
        r.tanggal === hariIni && r.events.some((e) => e.tipe === 'pulang'),
    )

  // Hari yang benar-benar berutang laporan. Hari ini ikut begitu tokonya
  // tutup — atau begitu laporannya sudah ditulis lebih awal.
  const dinilai = perHari.filter(
    (h) =>
      h.berjalan &&
      h.hariKerja &&
      (h.tanggal !== hariIni || sudahClosing || !!h.status),
  )
  const terisi = dinilai.filter((h) => h.status).length
  const hitung = (st: StatusLaporanHarian) =>
    perHari.filter((h) => h.berjalan && h.status === st).length

  return {
    perHari,
    hariKerja: dinilai.length,
    terisi,
    rasio: dinilai.length > 0 ? terisi / dinilai.length : 0,
    aman: hitung('aman'),
    kendala: hitung('kendala'),
    eskalasi: hitung('eskalasi'),
    bolong: dinilai
      .filter((h) => !h.status)
      .map((h) => h.tanggal)
      .reverse(),
    terakhir: (data.laporanHarian ?? [])
      .filter((r) => r.tanggal.startsWith(monthKey))
      .slice()
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    belumDicatat: (data.laporanHarian ?? []).length === 0,
  }
}

export type HariDampak = {
  tanggal: string
  /** Tanggal ke-berapa dalam bulan (1..31). */
  hari: number
  /** Omzet studio hari itu. Hanya berarti kalau `berlaporan`. */
  omzet: number
  /** Berapa dari 4 aktivitas sosmed dikerjakan hari itu. */
  aksi: number
  aktif: boolean
  /** Hari itu punya laporan pemasukan. */
  berlaporan: boolean
  berjalan: boolean
}

/**
 * Satu hari sosmed aktif, dibandingkan dengan HARI YANG SAMA pada minggu-minggu
 * sebelumnya (Sabtu vs Sabtu). Ini yang membuat perbandingannya apel dengan
 * apel: pola mingguan (akhir pekan ramai) dinetralkan, sisanya barulah efek
 * yang pantas diperdebatkan.
 */
export type BandingHariSama = {
  tanggal: string
  omzet: number
  /** Rata-rata omzet hari yang sama pada 4 minggu sebelumnya. */
  baseline: number
  /** Berapa minggu pembanding yang benar-benar ada laporannya. */
  sampel: number
  /** (omzet − baseline) ÷ baseline. */
  lift: number
}

export type DampakSosmed = {
  perHari: HariDampak[]
  /** Hari sosmed aktif yang punya pembanding hari-sama yang memadai. */
  banding: BandingHariSama[]
  /**
   * Rata-rata `lift` seluruh `banding`. `null` = belum bisa dihitung.
   * Ini angka yang lebih layak dipercaya daripada `selisih`.
   */
  liftHariSama: number | null
  /** `banding` sudah mencapai MIN_SAMPEL_DAMPAK hari. */
  cukupSampelHariSama: boolean
  /** Rata-rata omzet pada hari yang sosmed-nya aktif. */
  rataAktif: number
  /** Rata-rata omzet pada hari tanpa aktivitas sosmed sama sekali. */
  rataPasif: number
  hariAktif: number
  hariPasif: number
  /** (rataAktif − rataPasif) ÷ rataPasif. `null` = tidak bisa dibandingkan. */
  selisih: number | null
  /**
   * Sampel layak dilihat serius? Di bawah ini angkanya terlalu mudah digeser
   * satu hari ramai, jadi UI sebaiknya menyebutnya "belum cukup data" alih-alih
   * menyodorkan persentase yang terdengar meyakinkan.
   */
  cukupSampel: boolean
}

/** Minimal hari di KEDUA sisi sebelum perbandingan layak ditampilkan. */
export const MIN_SAMPEL_DAMPAK = 3

/** Berapa minggu ke belakang dipakai sebagai pembanding "hari yang sama". */
export const MINGGU_BANDING = 4
/** Minimal minggu pembanding yang ada laporannya sebelum sebuah hari dipakai. */
export const MIN_SAMPEL_HARI_SAMA = 2

/**
 * Bandingkan omzet harian pada hari sosmed aktif vs hari pasif.
 *
 * Menjawab pertanyaan terakhir di brief manajer: "apakah aktivitas social media
 * berdampak terhadap penjualan?".
 *
 * Dua hal yang membuat angkanya tidak menipu:
 *
 *  1. Hari TANPA laporan pemasukan dikeluarkan sepenuhnya. Omzetnya bukan nol,
 *     melainkan TIDAK DIKETAHUI — memasukkannya sebagai nol akan menyeret
 *     rata-rata sisi mana pun yang kebetulan laporannya bolong.
 *  2. Perbandingan baru disebut layak kalau kedua sisi punya minimal
 *     MIN_SAMPEL_DAMPAK hari. Di bawah itu satu hari ramai sudah cukup untuk
 *     membalik kesimpulan.
 *
 * Ini korelasi, bukan sebab-akibat: hari ramai juga cenderung akhir pekan, dan
 * akhir pekan juga cenderung hari orang rajin posting.
 */
export function dampakSosmed(
  data: AppData,
  monthKey: string,
  hariIni: string,
): DampakSosmed {
  // Omzet SELURUH periode, bukan bulan terpilih saja: pembanding "4 minggu
  // sebelumnya" untuk tanggal 1–3 jatuh di bulan sebelumnya.
  const omzetSemua = new Map<string, number>()
  for (const l of data.laporanIncome) {
    omzetSemua.set(
      l.tanggal,
      (omzetSemua.get(l.tanggal) ?? 0) + hitungIncome(l).total,
    )
  }
  const omzetPerHari = new Map<string, number>()
  for (const [tanggal, nilai] of omzetSemua) {
    if (tanggal.startsWith(monthKey)) omzetPerHari.set(tanggal, nilai)
  }
  const log = new Map<string, SosmedHarian>()
  for (const r of data.sosmedHarian ?? []) log.set(r.tanggal, r)

  const totalHari = hariDalamBulan(monthKey)
  const hariBerjalan = hariSeharusnyaBulan(monthKey, hariIni)
  const perHari: HariDampak[] = []
  for (let d = 1; d <= totalHari; d += 1) {
    const tanggal = tanggalKe(monthKey, d)
    const r = log.get(tanggal)
    const aksi = r ? AKSI_SOSMED.filter((a) => r[a]).length : 0
    perHari.push({
      tanggal,
      hari: d,
      omzet: omzetPerHari.get(tanggal) ?? 0,
      aksi,
      aktif: aksi > 0,
      berlaporan: omzetPerHari.has(tanggal),
      berjalan: d <= hariBerjalan,
    })
  }

  const dinilai = perHari.filter((h) => h.berlaporan)
  const sisiAktif = dinilai.filter((h) => h.aktif)
  const sisiPasif = dinilai.filter((h) => !h.aktif)
  const rata = (list: HariDampak[]) =>
    list.length > 0 ? list.reduce((s, h) => s + h.omzet, 0) / list.length : 0

  const rataAktif = rata(sisiAktif)
  const rataPasif = rata(sisiPasif)

  // --- pembanding hari-yang-sama (Sabtu vs Sabtu) ---
  const banding: BandingHariSama[] = []
  for (const h of sisiAktif) {
    const sebelum: number[] = []
    for (let w = 1; w <= MINGGU_BANDING; w += 1) {
      const nilai = omzetSemua.get(geserHari(h.tanggal, -7 * w))
      if (nilai != null) sebelum.push(nilai)
    }
    if (sebelum.length < MIN_SAMPEL_HARI_SAMA) continue
    const baseline = sebelum.reduce((s, n) => s + n, 0) / sebelum.length
    if (baseline <= 0) continue
    banding.push({
      tanggal: h.tanggal,
      omzet: h.omzet,
      baseline,
      sampel: sebelum.length,
      lift: (h.omzet - baseline) / baseline,
    })
  }
  const liftHariSama =
    banding.length > 0
      ? banding.reduce((s, b) => s + b.lift, 0) / banding.length
      : null

  return {
    perHari,
    banding,
    liftHariSama,
    cukupSampelHariSama: banding.length >= MIN_SAMPEL_DAMPAK,
    rataAktif,
    rataPasif,
    hariAktif: sisiAktif.length,
    hariPasif: sisiPasif.length,
    selisih: rataPasif > 0 ? (rataAktif - rataPasif) / rataPasif : null,
    cukupSampel:
      sisiAktif.length >= MIN_SAMPEL_DAMPAK && sisiPasif.length >= MIN_SAMPEL_DAMPAK,
  }
}

export type KartuMenunggak = {
  id: string
  judul: string
  deadline: string
  pic?: string
  /** Berapa hari lewat dari deadline. */
  telatHari: number
}

export type EksekusiKonten = {
  /** Kartu berdeadline yang deadline-nya sudah jatuh tempo. */
  jatuhTempo: number
  tepatWaktu: number
  telat: number
  menunggak: KartuMenunggak[]
  /** tepatWaktu ÷ jatuhTempo, 0–1. */
  ketepatan: number
  /** true kalau belum ada satu pun kartu berdeadline (fitur belum dipakai). */
  belumDiatur: boolean
}

/** Selisih hari a − b (keduanya `YYYY-MM-DD`). */
function selisihHari(a: string, b: string): number {
  const ms = new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * Ketepatan eksekusi konten terhadap deadline.
 *
 * Yang dinilai HANYA kartu berdeadline yang deadline-nya sudah jatuh tempo —
 * kartu dengan deadline minggu depan belum bisa disebut telat. Penilaian
 * bersandar pada `selesaiPada` yang distempel database (migration 0046), bukan
 * pada tahap saja, supaya kartu yang dirampungkan telat tidak terbaca sama
 * dengan yang tepat waktu.
 */
export function eksekusiKonten(
  data: AppData,
  monthKey: string,
  hariIni: string,
): EksekusiKonten {
  const berdeadline = data.promoPrograms.filter((p) => !!p.deadline)
  // Cakupan bulan diambil dari deadline-nya: itulah bulan kartu ini "jatuh".
  const bulanIni = berdeadline.filter((p) => p.deadline!.startsWith(monthKey))

  let tepatWaktu = 0
  let telat = 0
  const menunggak: KartuMenunggak[] = []
  for (const p of bulanIni) {
    const deadline = p.deadline!
    if (p.tahap === 'selesai' && p.selesaiPada) {
      if (p.selesaiPada <= deadline) tepatWaktu += 1
      else telat += 1
      continue
    }
    // Belum selesai. Menunggak hanya kalau deadline-nya sudah lewat.
    if (deadline < hariIni) {
      telat += 1
      menunggak.push({
        id: p.id,
        judul: p.judul,
        deadline,
        pic: p.pic,
        telatHari: selisihHari(hariIni, deadline),
      })
    }
  }

  const jatuhTempo = tepatWaktu + telat
  return {
    jatuhTempo,
    tepatWaktu,
    telat,
    menunggak: menunggak.sort((a, b) => b.telatHari - a.telatHari),
    ketepatan: jatuhTempo > 0 ? tepatWaktu / jatuhTempo : 0,
    belumDiatur: berdeadline.length === 0,
  }
}

/**
 * Berapa hari sebuah kartu campaign boleh mengambang tanpa PIC & deadline.
 * Lewat dari ini, kartunya bukan rencana — cuma catatan.
 */
export const AMBANG_TUGAS_HARI = 3

export type CampaignBelumSiap = {
  id: string
  judul: string
  /** Apa yang kurang: PIC, deadline, atau keduanya. */
  kurang: string
  umurHari: number
}

export type KualitasCampaign = {
  /** Kartu campaign yang dibuat bulan ini & masa tenggangnya sudah lewat. */
  dinilai: number
  /** Dari itu, yang sudah punya PIC operator DAN deadline. */
  siap: number
  belumSiap: CampaignBelumSiap[]
  /** siap ÷ dinilai, 0–1. */
  rasio: number
  belumAda: boolean
}

/**
 * Campaign yang benar-benar DITUGASKAN, bukan sekadar dicatat.
 *
 * Bedanya dengan KPI "campaign dieksekusi": yang ini menilai kualitas
 * penugasannya — ada nama orang dan ada tanggal. Kartu tanpa keduanya tidak
 * bisa telat, tidak bisa ditagih, dan tidak bisa dinilai siapa pun.
 *
 * Kartu yang baru dibuat (< {@link AMBANG_TUGAS_HARI} hari) belum dinilai:
 * wajar kalau ide dituliskan dulu, ditugaskan kemudian.
 */
export function kualitasCampaign(
  data: AppData,
  monthKey: string,
  hariIni: string,
): KualitasCampaign {
  const kartu = data.promoPrograms.filter(
    (p) =>
      (p.jenis ?? 'campaign') === 'campaign' &&
      (p.createdAt ?? '').startsWith(monthKey),
  )
  const belumSiap: CampaignBelumSiap[] = []
  let dinilai = 0
  let siap = 0
  for (const p of kartu) {
    const dibuat = (p.createdAt ?? '').slice(0, 10)
    const umurHari = selisihHari(hariIni, dibuat)
    if (umurHari < AMBANG_TUGAS_HARI) continue // masih dalam masa tenggang
    dinilai += 1
    const kurang: string[] = []
    if (!p.pic) kurang.push('PIC')
    if (!p.deadline) kurang.push('deadline')
    if (kurang.length === 0) {
      siap += 1
      continue
    }
    belumSiap.push({ id: p.id, judul: p.judul, kurang: kurang.join(' & '), umurHari })
  }

  return {
    dinilai,
    siap,
    belumSiap: belumSiap.sort((a, b) => b.umurHari - a.umurHari),
    rasio: dinilai > 0 ? siap / dinilai : 0,
    belumAda: kartu.length === 0,
  }
}

export type KontribusiKonten = {
  id: string
  nama: string
  jabatan: string
  foto?: string
  /** Kartu yang di-PIC-i orang ini dan sudah selesai bulan ini. */
  selesai: number
  /** Dari `selesai`, berapa yang lewat deadline. */
  telat: number
  /** Kartu aktif yang masih dipegang (belum selesai). */
  berjalan: number
  /** Hari sosmed yang dikerjakan orang ini. */
  hariSosmed: number
  /** Jumlah kontribusi terhitung — dasar urutan & bonus marketing. */
  total: number
}

/**
 * Siapa mengerjakan apa bulan ini — dasar bonus marketing.
 *
 * Sengaja hanya menghitung JUMLAH, bukan rupiah: besaran bonusnya keputusan
 * owner di layar Gaji, sedangkan di sini yang dibutuhkan manajer adalah bukti
 * siapa yang benar-benar mengerjakan.
 */
export function kontribusiKonten(
  data: AppData,
  monthKey: string,
): KontribusiKonten[] {
  const byId = new Map<string, KontribusiKonten>()
  for (const e of data.employees.filter((x) => !isPengelola(x.role))) {
    byId.set(e.id, {
      id: e.id,
      nama: e.nama,
      jabatan: e.jabatan,
      foto: e.foto,
      selesai: 0,
      telat: 0,
      berjalan: 0,
      hariSosmed: 0,
      total: 0,
    })
  }

  const dalamBulan = (p: PromoProgram) =>
    (p.selesaiPada ?? p.deadline ?? p.tanggalMulai ?? p.createdAt ?? '').startsWith(
      monthKey,
    )

  for (const p of data.promoPrograms) {
    if (!p.pic || !dalamBulan(p)) continue
    const k = byId.get(p.pic)
    if (!k) continue
    if (p.tahap === 'selesai') {
      k.selesai += 1
      if (p.deadline && p.selesaiPada && p.selesaiPada > p.deadline) k.telat += 1
    } else {
      k.berjalan += 1
    }
  }

  for (const r of data.sosmedHarian ?? []) {
    if (!r.tanggal.startsWith(monthKey)) continue
    if (!AKSI_SOSMED.some((a) => r[a])) continue
    // Hari yang dikerjakan berdua dihitung untuk KEDUANYA — ini catatan
    // kontribusi, bukan pembagian jatah hari.
    for (const orang of pengerjaSosmed(r)) {
      const k = byId.get(orang)
      if (k) k.hariSosmed += 1
    }
  }

  return [...byId.values()]
    .map((k) => ({ ...k, total: k.selesai + k.hariSosmed }))
    .filter((k) => k.total > 0 || k.berjalan > 0)
    .sort((a, b) => b.total - a.total)
}

// ---------------------------------------------------------------
// 6b. Denyut mingguan konten (papan produksi take → edit → tayang)
// ---------------------------------------------------------------

/**
 * Tahap produksi yang DIPATOK untuk semua kartu konten. Owner hanya mengatur
 * hari targetnya lewat `data.ritmeKonten`.
 */
export const TAHAP_KONTEN: TahapKonten[] = ['take', 'edit', 'tayang']

export const TAHAP_KONTEN_LABEL: Record<TahapKonten, string> = {
  take: 'Take video',
  edit: 'Editing',
  tayang: 'Tayang',
}

/** Nama hari, indeks 0 = Senin (bukan Minggu — minggu kerja mulai Senin). */
export const NAMA_HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

/**
 * Ritme bawaan sebelum owner mengaturnya: 2 konten/minggu, take Senin, edit
 * Selasa, tayang Rabu. Angkanya mengikuti kebiasaan yang sudah dipakai tombol
 * cepat deadline di Papan Promosi (Rabu/Sabtu/Minggu), jadi papan langsung
 * masuk akal walau ritmenya belum disetujui.
 */
export const RITME_DEFAULT: RitmeKonten = {
  jumlah: 2,
  hari: { take: 1, edit: 2, tayang: 3 },
}

export type StatusTahap = 'beres' | 'telat' | 'jalan' | 'nanti'

export type TahapSlot = {
  kunci: TahapKonten
  label: string
  /** Tanggal target tahap ini di minggu bersangkutan, `YYYY-MM-DD`. */
  target: string
  /** Distempel database saat dicentang; undefined = belum dikerjakan. */
  selesaiPada?: string
  oleh?: string
  status: StatusTahap
  /** Berapa hari lewat dari target (0 kalau tepat / belum jatuh tempo). */
  telatHari: number
}

export type StatusSlot = 'beres' | 'macet' | 'jalan' | 'belum'

export type SlotKonten = {
  /** Nomor urut slot dalam minggunya (1..ritme.jumlah). */
  nomor: number
  /** Kartu nyata di Papan Promosi; kosong kalau slot ini masih virtual. */
  id?: string
  judul: string
  pic?: string
  /**
   * true = slot yang lahir dari ritme, BUKAN kartu yang ada. Sengaja tetap
   * digambar & tetap dinilai: kalau tidak, manajer bisa lolos dengan cara
   * tidak membuat kartu sama sekali — nol kartu = nol telat.
   */
  virtual: boolean
  tahapan: TahapSlot[]
  status: StatusSlot
}

export type MingguKonten = {
  /** Senin, `YYYY-MM-DD`. */
  mulai: string
  selesai: string
  slot: SlotKonten[]
  /** Tanggal target tahap terakhir (tayang) — batas penilaian minggu ini. */
  batas: string
  /** Batas sudah lewat → minggu ini boleh dinilai. */
  jatuhTempo: boolean
  /** Batasnya jatuh di bulan yang sedang dilihat. */
  dalamBulan: boolean
  /**
   * Minggu ini benar-benar ikut menghitung KPI: sudah jatuh tempo, jatuh di
   * bulan yang dilihat, DAN berada di dalam masa berlaku ritme yang disetujui.
   */
  dinilai: boolean
  /** Minggu yang memuat hari ini. */
  berjalan: boolean
  beres: number
}

export type TahapMacet = {
  mulai: string
  judul: string
  tahap: string
  telatHari: number
}

export type DenyutKonten = {
  ritme: RitmeKonten
  /** true = ritme masih bawaan, owner belum pernah mengaturnya. */
  belumDiatur: boolean
  disetujui: boolean
  perMinggu: MingguKonten[]
  mingguIni?: MingguKonten
  /** Sejak Senin minggu keberapa ritme mulai menilai (`undefined` = belum). */
  berlakuSejak?: string
  /** Slot yang tepat ritme, dari minggu yang dinilai di bulan ini. */
  tepat: number
  dinilai: number
  /** tepat ÷ dinilai, 0–1. */
  rasio: number
  /** Tahap yang tenggatnya lewat & belum dicentang, terbaru di depan. */
  macet: TahapMacet[]
}

/**
 * Papan produksi konten mingguan: rantai take → edit → tayang, dinilai per
 * tahap, bukan per satu deadline.
 *
 * Inilah satu-satunya KPI marketing yang bersifat LEADING: `eksekusiKonten()`
 * baru bisa bilang "telat" setelah deadline tayang lewat, sedangkan di sini
 * take yang belum beres Senin sore sudah menyalakan lampu untuk Rabu.
 *
 * Sebuah kartu masuk minggu tertentu lewat `deadline`-nya (= hari tayang),
 * sama seperti cara `eksekusiKonten()` menentukan bulan sebuah kartu. Kartu
 * konten tanpa deadline tidak muncul di papan — tapi ketidakhadirannya tetap
 * terlihat, karena slot yang kurang digambar sebagai slot virtual.
 *
 * Minggu dinilai berdasarkan bulan tempat hari TAYANG-nya jatuh, supaya minggu
 * yang menyeberang pergantian bulan tidak terhitung dua kali.
 *
 * PENTING — penilaian baru berlaku sejak minggu owner MENYETUJUI ritme. Papan
 * tetap menggambar slot & tenggat sebelum itu (supaya bentuknya terlihat lebih
 * dulu), tapi tidak ada satu pun yang masuk KPI maupun antrean "Butuh
 * Tindakan". Tanpa batas ini, menyalakan fitur akan langsung memunculkan
 * puluhan tahap "menunggak" dari minggu-minggu yang belum pernah disepakati.
 */
export function denyutKonten(
  data: AppData,
  monthKey: string,
  hariIni: string,
): DenyutKonten {
  const ritme = data.ritmeKonten ?? RITME_DEFAULT
  const jumlah = Math.max(1, Math.round(ritme.jumlah))

  // Kartu konten berdeadline, dikelompokkan ke minggu hari tayangnya.
  const perMingguKartu = new Map<string, PromoProgram[]>()
  for (const p of data.promoPrograms) {
    if ((p.jenis ?? 'campaign') !== 'konten' || !p.deadline) continue
    const senin = seninMinggu(p.deadline)
    const list = perMingguKartu.get(senin) ?? []
    list.push(p)
    perMingguKartu.set(senin, list)
  }

  // Minggu yang ditampilkan: semua minggu yang menyentuh bulan terpilih.
  const seninSet = new Set<string>()
  const totalHari = hariDalamBulan(monthKey)
  for (let d = 1; d <= totalHari; d += 1) {
    seninSet.add(seninMinggu(tanggalKe(monthKey, d)))
  }

  const seninHariIni = seninMinggu(hariIni)
  const disetujui = data.ritmeKonten?.disetujui === true
  // Masa berlaku dimulai dari Senin minggu persetujuan — bukan tanggal
  // persetujuannya sendiri, supaya minggu berjalan tidak dinilai setengah.
  const berlakuSejak = disetujui
    ? seninMinggu((data.ritmeKonten?.disetujuiPada ?? hariIni).slice(0, 10))
    : undefined
  const macet: TahapMacet[] = []

  const perMinggu: MingguKonten[] = [...seninSet]
    .sort((a, b) => a.localeCompare(b))
    .map((mulai) => {
      const targetTahap = TAHAP_KONTEN.map((k) => ({
        kunci: k,
        // hari 1..7 → offset 0..6 dari Senin. Nilai di luar rentang di-clamp
        // supaya ritme yang tersimpan salah tidak melempar tanggal entah ke mana.
        target: geserHari(mulai, Math.min(6, Math.max(0, (ritme.hari[k] ?? 1) - 1))),
      }))
      const batas = targetTahap[targetTahap.length - 1].target

      const kartu = (perMingguKartu.get(mulai) ?? [])
        .slice()
        .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

      const slot: SlotKonten[] = []
      for (let i = 0; i < Math.max(jumlah, kartu.length); i += 1) {
        const p = kartu[i]
        const tahapan: TahapSlot[] = targetTahap.map(({ kunci, target }) => {
          const jejak = p?.tahapan?.find((t) => t.kunci === kunci)
          // ADA entri = tahap ini sudah dicentang. Tanggalnya jatuh ke hari ini
          // selama stempel server belum kembali, supaya centang yang baru saja
          // ditekan langsung terlihat beres alih-alih berkedip jadi "telat".
          const selesaiPada = jejak ? (jejak.selesaiPada ?? hariIni) : undefined
          let status: StatusTahap
          let telatHari = 0
          if (selesaiPada) {
            status = selesaiPada <= target ? 'beres' : 'telat'
            telatHari = Math.max(0, selisihHari(selesaiPada, target))
          } else if (target < hariIni) {
            status = 'telat'
            telatHari = selisihHari(hariIni, target)
          } else {
            // Hari target itu sendiri belum boleh disebut telat.
            status = target === hariIni ? 'jalan' : 'nanti'
          }
          return {
            kunci,
            label: TAHAP_KONTEN_LABEL[kunci],
            target,
            selesaiPada,
            oleh: jejak?.oleh,
            status,
            telatHari,
          }
        })

        const judul = p?.judul?.trim() || `Konten #${i + 1}`
        const adaTelat = tahapan.some((t) => t.status === 'telat')
        slot.push({
          nomor: i + 1,
          id: p?.id,
          judul,
          pic: p?.pic,
          virtual: !p,
          tahapan,
          status: tahapan.every((t) => t.status === 'beres')
            ? 'beres'
            : adaTelat
              ? 'macet'
              : tahapan.some((t) => t.status === 'beres')
                ? 'jalan'
                : 'belum',
        })

        for (const t of tahapan) {
          // Hanya tahap yang BELUM dikerjakan yang masuk antrean tindakan —
          // tahap yang sudah beres (walau telat) tidak menunggu siapa pun.
          // Tidak disaring `jatuhTempo`: take yang telat Senin justru harus
          // muncul sekarang, bukan menunggu hari tayang lewat.
          if (
            berlakuSejak !== undefined &&
            mulai >= berlakuSejak &&
            t.status === 'telat' &&
            !t.selesaiPada
          ) {
            macet.push({
              mulai,
              judul,
              tahap: t.label,
              telatHari: t.telatHari,
            })
          }
        }
      }

      const jatuhTempo = batas < hariIni
      const dalamBulan = batas.startsWith(monthKey)
      return {
        mulai,
        selesai: geserHari(mulai, 6),
        slot,
        batas,
        jatuhTempo,
        dalamBulan,
        dinilai:
          jatuhTempo &&
          dalamBulan &&
          berlakuSejak !== undefined &&
          mulai >= berlakuSejak,
        berjalan: mulai === seninHariIni,
        beres: slot.filter((s) => s.status === 'beres').length,
      }
    })

  const dinilaiMinggu = perMinggu.filter((m) => m.dinilai)
  const dinilai = dinilaiMinggu.reduce((s, m) => s + m.slot.length, 0)
  const tepat = dinilaiMinggu.reduce((s, m) => s + m.beres, 0)

  return {
    ritme,
    belumDiatur: !data.ritmeKonten,
    disetujui,
    berlakuSejak,
    perMinggu,
    mingguIni: perMinggu.find((m) => m.berjalan),
    tepat,
    dinilai,
    rasio: dinilai > 0 ? tepat / dinilai : 0,
    macet: macet.sort((a, b) => b.telatHari - a.telatHari),
  }
}

// ---------------------------------------------------------------
// 7. Pipeline leads & sales
// ---------------------------------------------------------------

/** Urutan kolom kanban, dari paling awal ke tahap akhir. */
export const LEAD_TAHAP_ORDER: LeadTahap[] = [
  'baru',
  'dihubungi',
  'followup',
  'negosiasi',
  'closing',
  'gagal',
]

export const LEAD_TAHAP_LABEL: Record<LeadTahap, string> = {
  baru: 'Baru',
  dihubungi: 'Dihubungi',
  followup: 'Follow-up',
  negosiasi: 'Negosiasi',
  closing: 'Closing',
  gagal: 'Gagal',
}

/** Tahap yang masih dikejar — belum closing, belum menyerah. */
export const LEAD_TAHAP_AKTIF: LeadTahap[] = [
  'baru',
  'dihubungi',
  'followup',
  'negosiasi',
]

export const LEAD_KATEGORI_LABEL: Record<Lead['kategori'], string> = {
  play: 'Kubik Play',
  photobooth: 'Photo Booth',
  sekolah: 'Event Sekolah',
  kampus: 'Event Kampus',
  komunitas: 'Event Komunitas',
  perusahaan: 'Event Perusahaan',
  lainnya: 'Lainnya',
}

/**
 * Berapa hari sebuah lead aktif boleh didiamkan sebelum dianggap basi.
 * Tiga hari kira-kira sepanjang jeda akhir pekan — lewat dari itu, calon
 * klien biasanya sudah menghubungi tempat lain.
 */
export const AMBANG_FOLLOWUP_HARI = 3

/**
 * Batas waktu KONTAK PERTAMA setelah sebuah lead masuk. Dua hari, karena calon
 * klien yang menanyakan harga hari Senin dan baru dibalas Kamis biasanya sudah
 * memesan di tempat lain.
 */
export const AMBANG_KONTAK_HARI = 2

/**
 * Peluang tiap tahap — dipakai menimbang nilai pipeline.
 *
 * Tanpa bobot, satu lead "baru" senilai 10 juta terlihat sama menjanjikannya
 * dengan satu negosiasi 10 juta, dan angka "pipeline" jadi daftar harapan.
 */
export const BOBOT_TAHAP: Record<LeadTahap, number> = {
  baru: 0.1,
  dihubungi: 0.25,
  followup: 0.5,
  negosiasi: 0.75,
  closing: 1,
  gagal: 0,
}

export type LeadBasi = {
  lead: Lead
  /** Sejak kontak terakhir (atau sejak masuk, kalau belum pernah dihubungi). */
  diamHari: number
  /** Tanggal follow-up terakhir; kosong = belum pernah. */
  terakhir?: string
}

export type PipelineLeads = {
  perTahap: Record<LeadTahap, { jumlah: number; nilai: number }>
  /** Lead yang MASUK bulan ini — inilah KPI "leads baru per bulan". */
  baruBulanIni: number
  closingBulanIni: number
  gagalBulanIni: number
  /** Estimasi nilai seluruh lead yang masih dikejar (semua periode). */
  nilaiPipeline: number
  /** Nilai pipeline setelah ditimbang peluang tiap tahap — lihat BOBOT_TAHAP. */
  nilaiPipelineTertimbang: number
  /** Lead bulan ini yang jendela kontak 2 harinya sudah bisa dinilai. */
  kontakDinilai: number
  /** Dari itu, yang benar-benar dihubungi ≤ AMBANG_KONTAK_HARI hari. */
  kontakCepat: number
  /** kontakCepat ÷ kontakDinilai, 0–1. */
  rasioKontakCepat: number
  /** Lead baru yang jendelanya sudah lewat tapi belum pernah dihubungi. */
  belumDihubungi: Lead[]
  /** Realisasi closing bulan ini; jatuh kembali ke estimasi kalau belum diisi. */
  nilaiClosing: number
  /** closing ÷ (closing + gagal) bulan ini. 0 kalau belum ada yang tuntas. */
  konversi: number
  /** Lead aktif yang sudah terlalu lama didiamkan, paling lama di atas. */
  perluFollowup: LeadBasi[]
  /** true kalau pipeline belum dipakai sama sekali. */
  belumAda: boolean
}

const LEAD_TAHAP_KOSONG = (): PipelineLeads['perTahap'] =>
  Object.fromEntries(
    LEAD_TAHAP_ORDER.map((t) => [t, { jumlah: 0, nilai: 0 }]),
  ) as PipelineLeads['perTahap']

export function pipelineLeads(
  data: AppData,
  monthKey: string,
  hariIni: string,
): PipelineLeads {
  const leads = data.leads ?? []

  // Kontak terakhir per lead — dasar penilaian "sudah didiamkan berapa lama".
  const terakhirKontak = new Map<string, string>()
  // Kontak PERTAMA — dasar penilaian kecepatan respons.
  const pertamaKontak = new Map<string, string>()
  for (const f of data.leadsFollowup ?? []) {
    const kini = terakhirKontak.get(f.leadId)
    if (!kini || f.tanggal > kini) terakhirKontak.set(f.leadId, f.tanggal)
    const awal = pertamaKontak.get(f.leadId)
    if (!awal || f.tanggal < awal) pertamaKontak.set(f.leadId, f.tanggal)
  }

  const perTahap = LEAD_TAHAP_KOSONG()
  let nilaiPipeline = 0
  let baruBulanIni = 0
  let closingBulanIni = 0
  let gagalBulanIni = 0
  let nilaiClosing = 0
  let nilaiPipelineTertimbang = 0
  let kontakDinilai = 0
  let kontakCepat = 0
  const perluFollowup: LeadBasi[] = []
  const belumDihubungi: Lead[] = []

  for (const l of leads) {
    const slot = perTahap[l.tahap] ?? { jumlah: 0, nilai: 0 }
    slot.jumlah += 1
    slot.nilai += l.tahap === 'closing' ? l.nilaiRealisasi || l.nilaiEstimasi : l.nilaiEstimasi
    perTahap[l.tahap] = slot

    if (l.tanggalMasuk.startsWith(monthKey)) {
      baruBulanIni += 1
      // Kecepatan kontak pertama. Lead yang baru masuk hari ini belum boleh
      // dinilai — jendelanya belum habis, bukan berarti diabaikan.
      const awal = pertamaKontak.get(l.id)
      if (awal) {
        kontakDinilai += 1
        if (selisihHari(awal, l.tanggalMasuk) <= AMBANG_KONTAK_HARI) kontakCepat += 1
      } else if (selisihHari(hariIni, l.tanggalMasuk) > AMBANG_KONTAK_HARI) {
        kontakDinilai += 1
        belumDihubungi.push(l)
      }
    }

    if (LEAD_TAHAP_AKTIF.includes(l.tahap)) {
      nilaiPipeline += l.nilaiEstimasi
      nilaiPipelineTertimbang += l.nilaiEstimasi * BOBOT_TAHAP[l.tahap]
      const terakhir = terakhirKontak.get(l.id)
      const diamHari = selisihHari(hariIni, terakhir ?? l.tanggalMasuk)
      if (diamHari >= AMBANG_FOLLOWUP_HARI) {
        perluFollowup.push({ lead: l, diamHari, terakhir })
      }
      continue
    }

    // Tahap akhir dinilai pada bulan ia TUNTAS, bukan bulan ia masuk — sebuah
    // lead bisa masuk Agustus dan baru closing September.
    if (l.tahap === 'closing') {
      if ((l.tanggalClosing ?? '').startsWith(monthKey)) {
        closingBulanIni += 1
        nilaiClosing += l.nilaiRealisasi || l.nilaiEstimasi
      }
    } else if (l.tahap === 'gagal' && l.tanggalMasuk.startsWith(monthKey)) {
      gagalBulanIni += 1
    }
  }

  const tuntas = closingBulanIni + gagalBulanIni
  return {
    perTahap,
    baruBulanIni,
    closingBulanIni,
    gagalBulanIni,
    nilaiPipeline,
    nilaiPipelineTertimbang,
    nilaiClosing,
    kontakDinilai,
    kontakCepat,
    rasioKontakCepat: kontakDinilai > 0 ? kontakCepat / kontakDinilai : 0,
    belumDihubungi: belumDihubungi.sort((a, b) =>
      a.tanggalMasuk.localeCompare(b.tanggalMasuk),
    ),
    konversi: tuntas > 0 ? closingBulanIni / tuntas : 0,
    perluFollowup: perluFollowup.sort((a, b) => b.diamHari - a.diamHari),
    belumAda: leads.length === 0,
  }
}

export type KontribusiSales = {
  id: string
  nama: string
  jabatan: string
  foto?: string
  leadsBaru: number
  closing: number
  gagal: number
  /** Nilai closing yang ia bawa bulan ini — dasar bonus event. */
  nilaiClosing: number
}

/**
 * Closing per orang — dasar bonus event.
 *
 * Berbeda dari `kontribusiKonten()`, di sini PENGELOLA ikut dihitung: mencari
 * dan menutup event justru tugas manajer, jadi mengeluarkannya akan membuat
 * kolom ini hampir selalu kosong.
 */
export function kontribusiSales(
  data: AppData,
  monthKey: string,
): KontribusiSales[] {
  const byId = new Map<string, KontribusiSales>()
  const pastikan = (id: string) => {
    const ada = byId.get(id)
    if (ada) return ada
    const e = data.employees.find((x) => x.id === id)
    const baru: KontribusiSales = {
      id,
      nama: e?.nama ?? 'Tidak dikenal',
      jabatan: e?.jabatan ?? '',
      foto: e?.foto,
      leadsBaru: 0,
      closing: 0,
      gagal: 0,
      nilaiClosing: 0,
    }
    byId.set(id, baru)
    return baru
  }

  for (const l of data.leads ?? []) {
    if (!l.pic) continue
    if (l.tanggalMasuk.startsWith(monthKey)) pastikan(l.pic).leadsBaru += 1
    if (l.tahap === 'closing' && (l.tanggalClosing ?? '').startsWith(monthKey)) {
      const k = pastikan(l.pic)
      k.closing += 1
      k.nilaiClosing += l.nilaiRealisasi || l.nilaiEstimasi
    }
    if (l.tahap === 'gagal' && l.tanggalMasuk.startsWith(monthKey)) {
      pastikan(l.pic).gagal += 1
    }
  }

  return [...byId.values()]
    .filter((k) => k.leadsBaru > 0 || k.closing > 0 || k.gagal > 0)
    .sort((a, b) => b.closing - a.closing || b.leadsBaru - a.leadsBaru)
}

// ---------------------------------------------------------------
// 7b. Pengajuan MoU & sponsorship
// ---------------------------------------------------------------

/** Urutan kolom kanban pengajuan, dari masuk sampai tuntas. */
export const KEMITRAAN_STATUS_ORDER: KemitraanStatus[] = [
  'masuk',
  'ditinjau',
  'disetujui',
  'ditolak',
  'selesai',
]

export const KEMITRAAN_STATUS_LABEL: Record<KemitraanStatus, string> = {
  masuk: 'Masuk',
  ditinjau: 'Ditinjau',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
  selesai: 'Selesai',
}

export const KEMITRAAN_JENIS_LABEL: Record<KemitraanJenis, string> = {
  sponsorship: 'Sponsorship',
  mou: 'MoU',
  keduanya: 'MoU + Sponsor',
}

export const KEMITRAAN_BENTUK_LABEL: Record<KemitraanBentuk, string> = {
  uang: 'Uang tunai',
  voucher: 'Voucher foto',
  produk: 'Produk / merchandise',
  booth: 'Booth di acara',
  jasa: 'Jasa dokumentasi',
  lainnya: 'Lainnya',
}

/**
 * Berapa hari sebuah pengajuan baru boleh menganggur sebelum dianggap
 * didiamkan. Tiga hari, karena panitia sekolah bekerja dengan tenggat cetak
 * proposal — dibiarkan lebih lama dari itu, mereka sudah cari sponsor lain
 * dan Kubik kehilangan pintu masuk ke sekolahnya, bukan cuma satu acara.
 */
export const AMBANG_PENGAJUAN_HARI = 3

/**
 * Berapa hari sebelum MoU berakhir ia mulai diperingatkan. 30 hari: cukup
 * untuk menyusun perpanjangan sebelum kerja samanya benar-benar putus.
 */
export const AMBANG_MOU_HABIS_HARI = 30

/** Status yang masih menunggu keputusan — inilah antrean kerja manajer. */
export const KEMITRAAN_STATUS_ANTRE: KemitraanStatus[] = ['masuk', 'ditinjau']

export type MouHabis = {
  k: Kemitraan
  /** Sisa hari sampai `mouBerakhir`; negatif berarti sudah lewat. */
  sisaHari: number
}

export type RingkasKemitraan = {
  perStatus: Record<KemitraanStatus, { jumlah: number; nilai: number }>
  /** Pengajuan yang MASUK bulan ini. */
  masukBulanIni: number
  /** Pengajuan yang diputuskan (disetujui/ditolak) bulan ini. */
  diputuskanBulanIni: number
  disetujuiBulanIni: number
  /** Σ nilai disetujui bulan ini — ini BEBAN, bukan pemasukan. */
  nilaiDisetujuiBulanIni: number
  /** Nilai disetujui yang belum tercatat sebagai pengeluaran. */
  belumDibayar: number
  /** Masih menunggu keputusan, yang paling lama menganggur di atas. */
  antre: { k: Kemitraan; umurHari: number }[]
  /** Sudah lewat {@link AMBANG_PENGAJUAN_HARI} tapi belum diputuskan. */
  didiamkan: number
  /** MoU yang berakhir dalam {@link AMBANG_MOU_HABIS_HARI} hari, atau sudah lewat. */
  mouHabis: MouHabis[]
  /**
   * Imbalan yang dijanjikan tapi belum dicentang, pada pengajuan yang sudah
   * disetujui. Sponsor sudah keluar, kompensasinya belum ditagih.
   */
  imbalanTertunggak: { k: Kemitraan; sisa: number }[]
  /** Belum ada satu pun pengajuan tercatat — panel ikut nonaktif, bukan nol. */
  belumAda: boolean
}

const KEMITRAAN_STATUS_KOSONG = (): RingkasKemitraan['perStatus'] =>
  Object.fromEntries(
    KEMITRAAN_STATUS_ORDER.map((st) => [st, { jumlah: 0, nilai: 0 }]),
  ) as RingkasKemitraan['perStatus']

/**
 * @param monthKey `YYYY-MM` — bulan yang sedang dilihat.
 * @param hariIni  `YYYY-MM-DD` — patokan umur pengajuan & masa berlaku MoU.
 */
export function ringkasKemitraan(
  data: AppData,
  monthKey: string,
  hariIni: string,
): RingkasKemitraan {
  const semua = data.kemitraan ?? []
  const perStatus = KEMITRAAN_STATUS_KOSONG()

  let masukBulanIni = 0
  let diputuskanBulanIni = 0
  let disetujuiBulanIni = 0
  let nilaiDisetujuiBulanIni = 0
  let belumDibayar = 0
  let didiamkan = 0
  const antre: RingkasKemitraan['antre'] = []
  const mouHabis: MouHabis[] = []
  const imbalanTertunggak: RingkasKemitraan['imbalanTertunggak'] = []

  // Id pengeluaran yang benar-benar masih ada — `pengeluaranId` yang
  // menggantung (barisnya sudah dihapus di layar Pengeluaran) diperlakukan
  // sebagai belum dibayar, karena uangnya memang tidak ada di laporan.
  const pengeluaranAda = new Set(data.pengeluaran.map((p) => p.id))

  for (const k of semua) {
    const nilai = k.nilaiDisetujui || k.nilaiDiminta
    perStatus[k.status].jumlah += 1
    perStatus[k.status].nilai += nilai

    if (k.tanggalMasuk.startsWith(monthKey)) masukBulanIni += 1
    if ((k.tanggalKeputusan ?? '').startsWith(monthKey)) {
      diputuskanBulanIni += 1
      if (k.status === 'disetujui' || k.status === 'selesai') {
        disetujuiBulanIni += 1
        nilaiDisetujuiBulanIni += k.nilaiDisetujui
      }
    }

    if (KEMITRAAN_STATUS_ANTRE.includes(k.status)) {
      const umurHari = selisihHari(hariIni, k.tanggalMasuk)
      antre.push({ k, umurHari })
      if (umurHari >= AMBANG_PENGAJUAN_HARI) didiamkan += 1
    }

    if (k.status === 'disetujui') {
      // Hanya yang sudah disetujui yang jadi kewajiban; 'selesai' berarti
      // kedua sisi sudah beres.
      if (!k.pengeluaranId || !pengeluaranAda.has(k.pengeluaranId)) {
        belumDibayar += k.nilaiDisetujui
      }
      const sisa = k.imbalan.filter((i) => !i.selesai).length
      if (sisa > 0) imbalanTertunggak.push({ k, sisa })
    }

    // MoU yang mau habis — hanya yang kerja samanya masih hidup.
    if (
      k.mouBerakhir &&
      (k.status === 'disetujui' || k.status === 'selesai')
    ) {
      const sisaHari = selisihHari(k.mouBerakhir, hariIni)
      if (sisaHari <= AMBANG_MOU_HABIS_HARI) mouHabis.push({ k, sisaHari })
    }
  }

  return {
    perStatus,
    masukBulanIni,
    diputuskanBulanIni,
    disetujuiBulanIni,
    nilaiDisetujuiBulanIni,
    belumDibayar,
    antre: antre.sort((a, b) => b.umurHari - a.umurHari),
    didiamkan,
    mouHabis: mouHabis.sort((a, b) => a.sisaHari - b.sisaHari),
    imbalanTertunggak,
    belumAda: semua.length === 0,
  }
}

// ---------------------------------------------------------------
// 8. Ketergantungan pada owner (kelompok KPI Kepemimpinan)
// ---------------------------------------------------------------

export type Ketergantungan = {
  ditutupManajer: number
  ditutupOwner: number
  total: number
  /** ditutupManajer ÷ total, 0–1. Inilah "kemandirian". */
  mandiri: number
  /** Jumlah item yang ditutup owner BULAN LALU — untuk melihat trennya. */
  ownerBulanLalu: number
  /** Item yang ditutup owner bulan ini, terbaru dulu. */
  daftarOwner: EskalasiOwner[]
  /** true kalau belum ada satu pun item dicatat (KPI ikut nonaktif). */
  belumAda: boolean
}

/**
 * Seberapa sering owner masih harus turun tangan.
 *
 * Ini KPI yang paling sulit dipalsukan sekaligus paling relevan: seorang
 * manajer yang menutup semua antreannya sendiri sedang menggantikan owner,
 * sedangkan manajer yang tiap minggu mengembalikan keputusan ke owner sedang
 * menjadi perantara. Datanya datang dari tombol "Selesai oleh" di panel Butuh
 * Tindakan — satu tap, tanpa formulir.
 */
export function ketergantunganOwner(
  data: AppData,
  monthKey: string,
): Ketergantungan {
  const log = data.eskalasiOwner ?? []
  const bulanIni = log.filter((e) => e.tanggal.startsWith(monthKey))
  const ditutupOwner = bulanIni.filter((e) => e.oleh === 'owner')
  const ditutupManajer = bulanIni.length - ditutupOwner.length
  const lalu = bulanSebelumnya(monthKey)

  return {
    ditutupManajer,
    ditutupOwner: ditutupOwner.length,
    total: bulanIni.length,
    mandiri: bulanIni.length > 0 ? ditutupManajer / bulanIni.length : 0,
    ownerBulanLalu: log.filter(
      (e) => e.tanggal.startsWith(lalu) && e.oleh === 'owner',
    ).length,
    daftarOwner: [...ditutupOwner].sort((a, b) =>
      b.tanggal.localeCompare(a.tanggal),
    ),
    belumAda: bulanIni.length === 0,
  }
}

// ---------------------------------------------------------------
// 9. Target & KPI Scorecard manajer
// ---------------------------------------------------------------

/** Jumlah hari kalender dalam sebuah bulan. `2026-02` → 28. */
export function hariDalamBulan(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/**
 * Sudah sejauh mana bulan ini berjalan, 0–1. Tanggal 7 dari 30 → 0,23.
 *
 * Ini angka pertama dari tiga angka yang sengaja DIPISAH (lihat `skorKPI`):
 * progres bulan, target laju, lalu capaian terhadap laju itu. Menggabungkannya
 * jadi satu persentase adalah cara tercepat membuat scorecard berbohong —
 * "skor 23%" pada tanggal 7 tidak berarti apa-apa.
 */
export function progresBulan(monthKey: string, hariIni: string): number {
  const total = hariDalamBulan(monthKey)
  const berjalan = hariSeharusnyaBulan(monthKey, hariIni)
  return total > 0 ? Math.min(1, berjalan / total) : 0
}

/** Nama lama `progresBulan`, dipertahankan supaya pemanggil lama tetap jalan. */
export const lajuBulan = progresBulan

/** Target default untuk periode yang belum punya data pembanding sama sekali. */
const TARGET_MINIMUM: TargetBulanan = {
  omzet: 0,
  tiket: 0,
  event: 2,
  leads: 20,
  closing: 4,
  campaign: 2,
  ide: 4,
  sosmedHari: 26,
  kepatuhan: 0.9,
  shiftCover: 1,
  mandiri: 0.8,
  penilaian: 4,
}

/**
 * Saran target otomatis: **2× rata-rata 3 bulan penuh terakhir**.
 *
 * Aturan 2× hanya diterapkan pada angka yang punya baseline nyata (omzet,
 * tiket, event). Sisanya adalah komitmen aktivitas, bukan hasil, jadi
 * dipatok tetap: campaign 2/bulan, sosmed aktif hampir tiap hari, checklist
 * 90%, shift 100%.
 *
 * "3 bulan penuh terakhir" sengaja TIDAK menyertakan `monthKey` sendiri —
 * bulan berjalan masih separuh jalan dan akan menyeret rata-rata ke bawah.
 * Bulan tanpa omzet juga dilewati supaya periode kosong (sebelum sistem
 * dipakai) tidak mengencerkan baseline.
 */
export function saranTarget(
  data: AppData,
  monthKey: string,
  hariIni: string,
): TargetBulanan {
  const sampel: RingkasanBulan[] = []
  let k = bulanSebelumnya(monthKey)
  // Telusuri mundur maksimal 12 bulan untuk mengumpulkan 3 bulan yang berisi.
  for (let i = 0; i < 12 && sampel.length < 3; i += 1) {
    const r = ringkasanBulan(data, k, hariIni)
    if (r.omzet > 0) sampel.push(r)
    k = bulanSebelumnya(k)
  }
  if (sampel.length === 0) return { ...TARGET_MINIMUM }

  const rata = (f: (r: RingkasanBulan) => number) =>
    sampel.reduce((s, r) => s + f(r), 0) / sampel.length
  const jumlahEvent = (r: RingkasanBulan) =>
    r.eventPerKategori.photobooth.jumlah + r.eventPerKategori.game.jumlah

  // Dibulatkan ke atas ke kelipatan yang enak dibaca supaya target terlihat
  // seperti keputusan, bukan hasil pembagian (mis. 587 → 600).
  const bulatkan = (n: number, kelipatan: number) =>
    Math.ceil(n / kelipatan) * kelipatan

  return {
    ...TARGET_MINIMUM,
    omzet: bulatkan(rata((r) => r.omzet) * 2, 500_000),
    tiket: bulatkan(rata((r) => r.qtyTiket) * 2, 50),
    event: Math.max(2, Math.ceil(rata(jumlahEvent) * 2)),
    sosmedHari: hariDalamBulan(monthKey),
  }
}

/**
 * Target yang berlaku: yang disimpan owner, kalau belum ada pakai saran.
 *
 * Target lama yang tersimpan sebelum sebuah field ditambahkan akan kehilangan
 * key-nya, jadi selalu dilebur di atas TARGET_MINIMUM — kalau tidak, KPI baru
 * akan terbaca "target belum diisi" untuk semua periode lama.
 */
export function targetBerlaku(
  data: AppData,
  monthKey: string,
  hariIni: string,
): { target: TargetBulanan; tersimpan: boolean; disetujui: boolean } {
  const simpan = data.targetBulanan?.[monthKey]
  if (simpan) {
    return {
      target: { ...TARGET_MINIMUM, ...simpan },
      tersimpan: true,
      disetujui: !!simpan.disetujui,
    }
  }
  return {
    target: saranTarget(data, monthKey, hariIni),
    tersimpan: false,
    disetujui: false,
  }
}

// ---- kelompok & bobot ------------------------------------------------------

export type KelompokKPI =
  | 'operasional'
  | 'marketing'
  | 'sales'
  | 'hasil'
  | 'kepemimpinan'

export const KELOMPOK_ORDER: KelompokKPI[] = [
  'operasional',
  'marketing',
  'sales',
  'hasil',
  'kepemimpinan',
]

export const KELOMPOK_LABEL: Record<KelompokKPI, string> = {
  operasional: 'Operasional',
  marketing: 'Marketing',
  sales: 'Sales & Event',
  hasil: 'Hasil bisnis',
  kepemimpinan: 'Kepemimpinan',
}

/**
 * Bobot tiap kelompok. Jumlahnya 1.
 *
 * Hasil bisnis sengaja 25% — sama besar dengan operasional. Itulah yang
 * membedakan manajer dari operator: seorang operator yang rajin bisa memenuhi
 * seluruh kelompok aktivitas dan tetap gagal di kelompok ini.
 */
export const BOBOT_KELOMPOK: Record<KelompokKPI, number> = {
  operasional: 0.25,
  marketing: 0.2,
  sales: 0.2,
  hasil: 0.25,
  kepemimpinan: 0.1,
}

export const KELOMPOK_ALASAN: Record<KelompokKPI, string> = {
  operasional: 'Shift ter-cover, laporan harian, kepatuhan checklist tim.',
  marketing: 'Campaign yang benar-benar ditugaskan & konsistensi sosial media.',
  sales: 'Leads masuk, dikejar tepat waktu, dan ditutup jadi order.',
  hasil: 'Tiket & omzet — bagian yang tidak bisa dipenuhi dengan rajin saja.',
  kepemimpinan: 'Seberapa sedikit owner masih harus turun tangan.',
}

/** Batas atas capaian satu KPI: 150%. */
export const CAP_CAPAIAN = 1.5
/** ≥ 90% dari laju = on track. */
export const AMBANG_ONTRACK = 0.9
/** 70–89% = perlu perhatian; di bawah itu tertinggal. */
export const AMBANG_PERHATIAN = 0.7

/** Target tetap untuk KPI berbentuk rasio yang tidak diatur owner. */
export const TARGET_KONTAK_CEPAT = 0.9
export const TARGET_CAMPAIGN_SIAP = 1
export const TARGET_JADWAL_H3 = 1
export const TARGET_TEPAT_JADWAL = 1
/** Seluruh slot konten mingguan harus tepat ritme — tidak ada toleransi bawaan. */
export const TARGET_DENYUT = 1

export type StatusKPI =
  | 'tercapai'
  | 'ontrack'
  | 'perhatian'
  | 'tertinggal'
  | 'belum-aktif'

export type BarisKPI = {
  id: string
  kelompok: KelompokKPI
  /** Kolom "Area" pada tabel KPI. */
  area: string
  label: string
  /** Capaian & target dalam satuan aslinya. */
  nilai: number
  /** Target SATU BULAN PENUH. */
  target: number
  /**
   * Target yang seharusnya sudah tercapai HARI INI:
   * `target × progres bulan` untuk KPI kumulatif, `target` apa adanya untuk
   * KPI yang sudah berupa rasio.
   */
  pace: number
  /** nilai ÷ pace, di-cap 150%. Inilah dasar skor. */
  capaian: number
  /** nilai ÷ target, di-clamp 0–1.2 — hanya untuk lebar bar. */
  progress: number
  /**
   * true = KPI kumulatif (omzet, tiket, event…) yang ditimbun sepanjang bulan,
   * jadi capaiannya dinilai proporsional terhadap hari yang sudah lewat.
   * false = KPI yang sudah berupa RASIO atas hari berjalan (cakupan shift,
   * kepatuhan checklist, hari berlaporan) — itu tidak boleh diproratakan lagi,
   * kalau tidak cakupan 50% di tanggal 5 akan terbaca "on track".
   */
  prorata: boolean
  status: StatusKPI
  /** Teks capaian siap tampil, mis. "312 / 600 tiket". */
  teks: string
  /** Dari mana angkanya diambil — supaya dashboard tidak terasa ajaib. */
  sumber: string
  /**
   * Hanya untuk status `belum-aktif`: fitur yang harus dibangun/diisi dulu
   * sebelum KPI ini bisa dinilai.
   */
  butuh?: string
}

export type SkorKelompok = {
  id: KelompokKPI
  label: string
  alasan: string
  /** 0–1. */
  bobot: number
  baris: BarisKPI[]
  aktif: number
  /**
   * Rata-rata capaian KPI yang AKTIF di kelompok ini.
   * `null` = seluruh KPI-nya belum aktif → kelompok ini DIKELUARKAN dari
   * pembagi skor akhir, bukan dihitung nol.
   */
  skor: number | null
}

export type Scorecard = {
  baris: BarisKPI[]
  kelompok: SkorKelompok[]
  /** Σ(skor kelompok × bobot) ÷ Σ bobot kelompok aktif. 0–1.5. */
  skor: number
  /** Total bobot kelompok yang benar-benar ikut menilai, 0–1. */
  bobotAktif: number
  aktif: number
  tercapai: number
  perhatian: number
  tertinggal: number
  /** Sudah sejauh mana bulan berjalan, 0–1. */
  progres: number
  /** Nama lama `progres` — dipakai penanda laju pada bar. */
  laju: number
  /** true kalau target periode ini masih saran otomatis (belum disimpan). */
  targetSaran: boolean
  /** true kalau target sudah DISETUJUI owner; kalau tidak, skor = simulasi. */
  targetDisetujui: boolean
}

/**
 * Susun KPI Scorecard manajer: 18 KPI dalam 5 kelompok berbobot.
 *
 * Tiga angka sengaja dipisah supaya tidak ada satu pun yang menipu:
 *
 *   progres bulan = hari berjalan ÷ hari dalam bulan          (mis. 23%)
 *   pace          = target bulanan × progres bulan            (500 × 0,23 = 115)
 *   capaian       = min(aktual ÷ pace, 150%)                  (48/115 = 42%)
 *
 * Skor kelompok = rata-rata capaian KPI yang AKTIF di dalamnya; skor akhir =
 * Σ(skor kelompok × bobot) ÷ Σ bobot kelompok aktif. Kelompok yang seluruh
 * KPI-nya belum aktif keluar dari pembagi — bukan dihitung nol, karena "belum
 * ada datanya" bukan "gagal".
 *
 * KPI yang belum punya sumber data TETAP DITAMPILKAN dengan status
 * `belum-aktif` + keterangan `butuh`: lebih jujur daripada menyembunyikannya.
 */
export function skorKPI(
  data: AppData,
  monthKey: string,
  hariIni: string,
): Scorecard {
  const ring = ringkasanBulan(data, monthKey, hariIni)
  const check = kepatuhanChecklist(data, monthKey)
  const { target, tersimpan, disetujui } = targetBerlaku(data, monthKey, hariIni)
  const jadwal = cakupanShift(data, monthKey, hariIni)
  const siapJadwal = kesiapanJadwal(data, monthKey, hariIni)
  const sosmed = aktivitasSosmed(data, monthKey, hariIni)
  const eksekusi = eksekusiKonten(data, monthKey, hariIni)
  const denyut = denyutKonten(data, monthKey, hariIni)
  const siapCampaign = kualitasCampaign(data, monthKey, hariIni)
  const pipeline = pipelineLeads(data, monthKey, hariIni)
  const mandiri = ketergantunganOwner(data, monthKey)
  const nilaiOwner = data.penilaianOwner?.[monthKey]
  const progres = progresBulan(monthKey, hariIni)

  const promoBulanIni = data.promoPrograms.filter((p) =>
    (p.createdAt ?? '').startsWith(monthKey),
  )
  // Hanya kartu berjenis 'campaign' — supaya KPI "2 campaign/bulan" tidak
  // terpenuhi oleh unggahan konten rutin. Kartu lama tanpa `jenis` dianggap
  // campaign (default kolomnya di migration 0046).
  const campaignJalan = data.promoPrograms.filter(
    (p) =>
      (p.jenis ?? 'campaign') === 'campaign' &&
      (p.tahap === 'berjalan' || p.tahap === 'selesai') &&
      ((p.tanggalMulai ?? p.createdAt ?? '').startsWith(monthKey) ||
        (p.tanggalSelesai ?? '').startsWith(monthKey) ||
        (p.selesaiPada ?? '').startsWith(monthKey)),
  )
  const jumlahEvent =
    ring.eventPerKategori.photobooth.jumlah + ring.eventPerKategori.game.jumlah

  /**
   * Status sebuah KPI — SELALU dinilai terhadap `pace`, bukan target penuh.
   * `tercapai` disediakan untuk hal yang jarang tapi layak dirayakan: target
   * satu bulan penuh sudah kelar padahal bulannya belum habis.
   */
  function nilaiStatus(capaian: number, nilai: number, target: number): StatusKPI {
    if (nilai >= target && target > 0) return 'tercapai'
    if (capaian >= AMBANG_ONTRACK) return 'ontrack'
    if (capaian >= AMBANG_PERHATIAN) return 'perhatian'
    return 'tertinggal'
  }

  function baris(
    id: string,
    kelompok: KelompokKPI,
    label: string,
    nilai: number,
    target: number,
    teks: string,
    sumber: string,
    prorata = true,
  ): BarisKPI {
    const pace = prorata ? target * progres : target
    // Target 0 (atau bulan yang belum berjalan) berarti KPI ini belum bisa
    // dinilai. Menandainya 'ontrack' akan menaikkan skor secara palsu, jadi
    // dikeluarkan dari penilaian.
    if (target <= 0 || pace <= 0) {
      return {
        id,
        kelompok,
        area: KELOMPOK_LABEL[kelompok],
        label,
        nilai,
        target,
        pace: 0,
        capaian: 0,
        progress: 0,
        prorata,
        status: 'belum-aktif',
        teks,
        sumber,
        butuh:
          target <= 0
            ? 'Target periode ini belum diisi'
            : 'Periode ini belum berjalan',
      }
    }
    const capaian = Math.min(CAP_CAPAIAN, nilai / pace)
    return {
      id,
      kelompok,
      area: KELOMPOK_LABEL[kelompok],
      label,
      nilai,
      target,
      pace,
      capaian,
      progress: Math.max(0, Math.min(1.2, nilai / target)),
      prorata,
      status: nilaiStatus(capaian, nilai, target),
      teks,
      sumber,
    }
  }

  function belum(
    id: string,
    kelompok: KelompokKPI,
    label: string,
    butuh: string,
  ): BarisKPI {
    return {
      id,
      kelompok,
      area: KELOMPOK_LABEL[kelompok],
      label,
      nilai: 0,
      target: 0,
      pace: 0,
      capaian: 0,
      progress: 0,
      prorata: false,
      status: 'belum-aktif',
      teks: 'Belum ada datanya',
      sumber: 'Menunggu data pendukung',
      butuh,
    }
  }

  const persenTeks = (n: number) => `${Math.round(n * 100)}%`

  const baris_: BarisKPI[] = [
    // ---------------- Operasional (25%) ----------------
    jadwal.belumDisusun
      ? belum(
          'shift',
          'operasional',
          'Shift ter-cover',
          'Roster di layar Jadwal, atau laporan pemasukan pertama bulan ini',
        )
      : baris(
          'shift',
          'operasional',
          'Shift ter-cover',
          jadwal.cakupan,
          target.shiftCover,
          `${jadwal.hariTercover} dari ${jadwal.hariDinilai} hari terisi penuh` +
            (jadwal.bukaTanpaOperator.length > 0
              ? ` · ${jadwal.bukaTanpaOperator.length} hari buka tanpa operator terjadwal`
              : ''),
          'Roster shift dibandingkan hari yang benar-benar buka',
          false,
        ),
    siapJadwal.dinilai === 0
      ? belum(
          'jadwal-h3',
          'operasional',
          `Jadwal minggu depan siap H-${AMBANG_JADWAL_H}`,
          'Belum ada minggu yang batas penyusunannya lewat di bulan ini',
        )
      : baris(
          'jadwal-h3',
          'operasional',
          `Jadwal minggu depan siap H-${AMBANG_JADWAL_H}`,
          siapJadwal.rasio,
          TARGET_JADWAL_H3,
          `${siapJadwal.siap} dari ${siapJadwal.dinilai} minggu tersusun sebelum batas`,
          'Roster shift per minggu (Senin–Minggu)',
          false,
        ),
    baris(
      'laporan',
      'operasional',
      'Laporan harian masuk',
      ring.hariBerlaporan,
      ring.hariBerjalan,
      `${ring.hariBerlaporan} dari ${ring.hariBerjalan} hari berjalan`,
      'Laporan pemasukan harian',
      false,
    ),
    check.belumDiatur
      ? belum(
          'disiplin',
          'operasional',
          'Kepatuhan checklist tim',
          'Task checklist pagi & closing di Pengaturan',
        )
      : baris(
          'disiplin',
          'operasional',
          'Kepatuhan checklist tim',
          check.rata,
          target.kepatuhan,
          `${persenTeks(check.rata)} dari target ${persenTeks(target.kepatuhan)}`,
          'Checklist pagi & closing',
          false,
        ),

    // ---------------- Marketing (20%) ----------------
    baris(
      'campaign',
      'marketing',
      'Campaign dieksekusi',
      campaignJalan.length,
      target.campaign,
      `${campaignJalan.length} dari ${target.campaign} campaign`,
      'Papan Promosi (tahap berjalan/selesai)',
    ),
    siapCampaign.dinilai === 0
      ? belum(
          'campaign-siap',
          'marketing',
          'Campaign ditugaskan & berdeadline',
          `Kartu campaign yang umurnya lewat ${AMBANG_TUGAS_HARI} hari di Papan Promosi`,
        )
      : baris(
          'campaign-siap',
          'marketing',
          'Campaign ditugaskan & berdeadline',
          siapCampaign.rasio,
          TARGET_CAMPAIGN_SIAP,
          `${siapCampaign.siap} dari ${siapCampaign.dinilai} kartu punya PIC & deadline`,
          `Papan Promosi (kartu berumur > ${AMBANG_TUGAS_HARI} hari)`,
          false,
        ),
    eksekusi.belumDiatur || eksekusi.jatuhTempo === 0
      ? belum(
          'eksekusi',
          'marketing',
          'Campaign selesai tepat jadwal',
          'Deadline pada kartu di Papan Promosi',
        )
      : baris(
          'eksekusi',
          'marketing',
          'Campaign selesai tepat jadwal',
          eksekusi.ketepatan,
          TARGET_TEPAT_JADWAL,
          `${eksekusi.tepatWaktu} tepat waktu dari ${eksekusi.jatuhTempo} jatuh tempo`,
          'Papan Promosi (deadline vs tanggal selesai)',
          false,
        ),
    denyut.dinilai === 0
      ? belum(
          'denyut',
          'marketing',
          'Konten mingguan tepat ritme',
          'Ritme konten mingguan disetujui owner, lalu satu minggu yang hari tayangnya lewat',
        )
      : baris(
          'denyut',
          'marketing',
          'Konten mingguan tepat ritme',
          denyut.rasio,
          TARGET_DENYUT,
          `${denyut.tepat} dari ${denyut.dinilai} slot selesai tiap tahap tepat waktu` +
            (denyut.macet.length > 0
              ? ` · ${denyut.macet.length} tahap menunggak`
              : ''),
          'Papan Denyut Mingguan (take → edit → tayang)',
          false,
        ),
    sosmed.belumDicatat
      ? belum(
          'sosmed',
          'marketing',
          'Hari sosmed aktif',
          'Log sosmed harian di Dashboard Manajemen',
        )
      : baris(
          'sosmed',
          'marketing',
          'Hari sosmed aktif',
          sosmed.hariAktif,
          target.sosmedHari,
          `${sosmed.hariAktif} dari ${target.sosmedHari} hari · ${sosmed.hariEngagement} hari berinteraksi · rentetan ${sosmed.runSekarang} hari`,
          'Log sosmed harian (posting, story, repost, engagement)',
        ),
    baris(
      'ide',
      'marketing',
      'Ide baru masuk papan',
      promoBulanIni.length,
      target.ide,
      `${promoBulanIni.length} dari ${target.ide} ide`,
      'Papan Promosi (kartu baru bulan ini)',
    ),

    // ---------------- Sales & Event (20%) ----------------
    pipeline.belumAda
      ? belum('leads', 'sales', 'Leads baru', 'Pipeline di layar Leads & Sales')
      : baris(
          'leads',
          'sales',
          'Leads baru',
          pipeline.baruBulanIni,
          target.leads,
          `${pipeline.baruBulanIni} dari ${target.leads} leads`,
          'Pipeline Leads & Sales',
        ),
    pipeline.kontakDinilai === 0
      ? belum(
          'kontak-cepat',
          'sales',
          `Lead dihubungi ≤ ${AMBANG_KONTAK_HARI} hari`,
          'Catatan follow-up pada lead di layar Leads & Sales',
        )
      : baris(
          'kontak-cepat',
          'sales',
          `Lead dihubungi ≤ ${AMBANG_KONTAK_HARI} hari`,
          pipeline.rasioKontakCepat,
          TARGET_KONTAK_CEPAT,
          `${pipeline.kontakCepat} dari ${pipeline.kontakDinilai} lead dihubungi tepat waktu` +
            (pipeline.belumDihubungi.length > 0
              ? ` · ${pipeline.belumDihubungi.length} belum disentuh`
              : ''),
          'Riwayat follow-up vs tanggal lead masuk',
          false,
        ),
    pipeline.belumAda
      ? belum('closing', 'sales', 'Closing', 'Pipeline di layar Leads & Sales')
      : baris(
          'closing',
          'sales',
          'Closing',
          pipeline.closingBulanIni,
          target.closing,
          `${pipeline.closingBulanIni} dari ${target.closing} closing senilai ${formatRupiah(pipeline.nilaiClosing)}`,
          'Pipeline Leads & Sales (tanggal closing)',
        ),
    baris(
      'event',
      'sales',
      'Event terlaksana',
      jumlahEvent,
      target.event,
      `${jumlahEvent} dari ${target.event} event`,
      'Laporan event photobooth & game',
    ),

    // ---------------- Hasil bisnis (25%) ----------------
    baris(
      'tiket',
      'hasil',
      'Tiket terjual',
      ring.qtyTiket,
      target.tiket,
      `${ring.qtyTiket} dari ${target.tiket} tiket`,
      'Laporan pemasukan harian',
    ),
    baris(
      'omzet',
      'hasil',
      'Omzet',
      ring.omzet,
      target.omzet,
      `${formatRupiah(ring.omzet)} dari ${formatRupiah(target.omzet)}`,
      'Studio + event',
    ),

    // ---------------- Kepemimpinan (10%) ----------------
    mandiri.belumAda
      ? belum(
          'mandiri',
          'kepemimpinan',
          'Antrean ditutup tanpa owner',
          'Tombol “Selesai oleh” pada panel Butuh Tindakan',
        )
      : baris(
          'mandiri',
          'kepemimpinan',
          'Antrean ditutup tanpa owner',
          mandiri.mandiri,
          target.mandiri,
          `${mandiri.ditutupManajer} dari ${mandiri.total} item ditutup manajer` +
            ` · owner ${mandiri.ditutupOwner}× (bulan lalu ${mandiri.ownerBulanLalu}×)`,
          'Log “Selesai oleh” di panel Butuh Tindakan',
          false,
        ),
    !nilaiOwner || !(nilaiOwner.nilai > 0)
      ? belum(
          'penilaian',
          'kepemimpinan',
          'Penilaian owner (1–5)',
          'Diisi owner saat evaluasi bulanan',
        )
      : baris(
          'penilaian',
          'kepemimpinan',
          'Penilaian owner (1–5)',
          nilaiOwner.nilai,
          target.penilaian,
          `${nilaiOwner.nilai} dari 5 · target ${target.penilaian}`,
          'Penilaian manual owner',
          false,
        ),
  ]

  // ---- skor per kelompok, lalu skor akhir tertimbang ----
  const kelompok: SkorKelompok[] = KELOMPOK_ORDER.map((id) => {
    const isi = baris_.filter((b) => b.kelompok === id)
    const aktif = isi.filter((b) => b.status !== 'belum-aktif')
    return {
      id,
      label: KELOMPOK_LABEL[id],
      alasan: KELOMPOK_ALASAN[id],
      bobot: BOBOT_KELOMPOK[id],
      baris: isi,
      aktif: aktif.length,
      skor:
        aktif.length > 0
          ? aktif.reduce((s, b) => s + b.capaian, 0) / aktif.length
          : null,
    }
  })

  // Kelompok yang seluruh KPI-nya belum aktif KELUAR dari pembagi — kalau
  // dihitung nol, sebuah fitur yang belum dipakai akan terbaca sebagai
  // kegagalan manajer.
  const bobotAktif = kelompok
    .filter((k) => k.skor != null)
    .reduce((s, k) => s + k.bobot, 0)
  const skor =
    bobotAktif > 0
      ? kelompok
          .filter((k) => k.skor != null)
          .reduce((s, k) => s + (k.skor as number) * k.bobot, 0) / bobotAktif
      : 0

  const semuaAktif = baris_.filter((b) => b.status !== 'belum-aktif')
  return {
    baris: baris_,
    kelompok,
    skor,
    bobotAktif,
    aktif: semuaAktif.length,
    tercapai: semuaAktif.filter((b) => b.status === 'tercapai' || b.status === 'ontrack')
      .length,
    perhatian: semuaAktif.filter((b) => b.status === 'perhatian').length,
    tertinggal: semuaAktif.filter((b) => b.status === 'tertinggal').length,
    progres,
    laju: progres,
    targetSaran: !tersimpan,
    targetDisetujui: disetujui,
  }
}
