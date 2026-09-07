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
  EventKategori,
  JadwalShift,
  Lead,
  LeadTahap,
  PromoProgram,
  Shift,
  SosmedHarian,
  TargetBulanan,
} from './types'
import { cariTakeover, hitungRingkasan, isHariKerja } from './attendance'
import { hitungEvent } from './event'
import { formatRupiah, hitungIncome, ringkasanPerKaryawan } from './income'
import { hariSeharusnyaBulan } from './gaji'
import { isPengelola } from './lib/roles'

// Ambang "stok menipis" — mengikuti badge `.tipis` di layar Inventaris
// (kertas & frame < 10, tinta < 2). Amplop belum punya padanan di sana.
export const AMBANG_KERTAS = 10
export const AMBANG_FRAME = 10
export const AMBANG_TINTA = 2
export const AMBANG_AMPLOP = 50

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
  /** Laba ÷ omzet. 0 kalau belum ada omzet. */
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

  const omzet = omzetStudio + eventPendapatan
  const biaya = pengeluaran + eventBiaya
  const laba = omzet - biaya
  const hariBerjalan = hariSeharusnyaBulan(monthKey, hariIni)

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

export function kinerjaKaryawan(
  data: AppData,
  monthKey: string,
  hariIni: string,
): KinerjaKaryawan[] {
  const staf = data.employees.filter((e) => !isPengelola(e.role))
  const hariSeharusnya = hariSeharusnyaBulan(monthKey, hariIni)
  const byId = new Map<string, KinerjaKaryawan>()
  for (const e of staf) {
    byId.set(e.id, {
      id: e.id,
      nama: e.nama,
      jabatan: e.jabatan,
      foto: e.foto,
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

export function operasional(
  data: AppData,
  monthKey: string,
  hariIni: string,
): Operasional {
  const stokKritis: StokKritis[] = []
  for (const k of data.stokKertas) {
    if (k.stok < AMBANG_KERTAS)
      stokKritis.push({ nama: `Kertas ${k.nama}`, stok: k.stok, satuan: 'lembar', ambang: AMBANG_KERTAS })
  }
  for (const f of data.stokFrame) {
    if (f.stok < AMBANG_FRAME)
      stokKritis.push({ nama: `Frame ${f.nama}`, stok: f.stok, satuan: 'pcs', ambang: AMBANG_FRAME })
  }
  for (const t of data.stokTinta) {
    if (t.stok < AMBANG_TINTA)
      stokKritis.push({ nama: `Tinta ${t.warna}`, stok: t.stok, satuan: 'botol', ambang: AMBANG_TINTA })
  }
  if (data.stokAmplop < AMBANG_AMPLOP)
    stokKritis.push({ nama: 'Amplop', stok: data.stokAmplop, satuan: 'pcs', ambang: AMBANG_AMPLOP })

  const hariBerjalan = hariSeharusnyaBulan(monthKey, hariIni)
  const berlaporan = new Set(
    data.laporanIncome
      .filter((l) => l.tanggal.startsWith(monthKey))
      .map((l) => l.tanggal),
  )

  return {
    stokKritis: stokKritis.sort((a, b) => a.stok - b.stok),
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
  /** true kalau roster belum pernah disusun sama sekali (fitur belum dipakai). */
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

  function nilaiHari(tanggal: string): HariJadwal {
    const baris = perTanggal.get(tanggal) ?? []
    const kerja = baris.filter((j) => isHariKerja(j.shift))
    // "Libur studio" hanya berlaku kalau memang tidak ada yang dijadwalkan
    // bekerja — kalau ada, hari itu tetap hari buka bagi mereka.
    const libur = kerja.length === 0 && baris.some((j) => j.shift === 'libur')
    const kosong = libur
      ? []
      : SLOT_WAJIB.filter((slot) => !kerja.some((j) => menutupSlot(j.shift, slot)))
    return {
      tanggal,
      kerja,
      kosong,
      libur,
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

  return {
    perHari,
    hariTercover,
    hariDinilai,
    cakupan: hariDinilai > 0 ? hariTercover / hariDinilai : 0,
    bolongMendatang,
    belumDisusun: semua.length === 0,
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

export type HariSosmed = {
  tanggal: string
  /** Sudah lewat/hari ini — hari yang belum tiba tidak dinilai. */
  berjalan: boolean
  /** Minimal satu aksi tercatat. */
  aktif: boolean
  /** Berapa dari 4 aksi yang dikerjakan. */
  jumlahAksi: number
  engagement: boolean
  oleh?: string
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
      oleh: r?.oleh,
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

export type DampakSosmed = {
  perHari: HariDampak[]
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
  const omzetPerHari = new Map<string, number>()
  for (const l of data.laporanIncome) {
    if (!l.tanggal.startsWith(monthKey)) continue
    omzetPerHari.set(
      l.tanggal,
      (omzetPerHari.get(l.tanggal) ?? 0) + hitungIncome(l).total,
    )
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
  return {
    perHari,
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
    if (!r.oleh || !r.tanggal.startsWith(monthKey)) continue
    const k = byId.get(r.oleh)
    if (!k) continue
    if (AKSI_SOSMED.some((a) => r[a])) k.hariSosmed += 1
  }

  return [...byId.values()]
    .map((k) => ({ ...k, total: k.selesai + k.hariSosmed }))
    .filter((k) => k.total > 0 || k.berjalan > 0)
    .sort((a, b) => b.total - a.total)
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
  for (const f of data.leadsFollowup ?? []) {
    const kini = terakhirKontak.get(f.leadId)
    if (!kini || f.tanggal > kini) terakhirKontak.set(f.leadId, f.tanggal)
  }

  const perTahap = LEAD_TAHAP_KOSONG()
  let nilaiPipeline = 0
  let baruBulanIni = 0
  let closingBulanIni = 0
  let gagalBulanIni = 0
  let nilaiClosing = 0
  const perluFollowup: LeadBasi[] = []

  for (const l of leads) {
    const slot = perTahap[l.tahap] ?? { jumlah: 0, nilai: 0 }
    slot.jumlah += 1
    slot.nilai += l.tahap === 'closing' ? l.nilaiRealisasi || l.nilaiEstimasi : l.nilaiEstimasi
    perTahap[l.tahap] = slot

    if (l.tanggalMasuk.startsWith(monthKey)) baruBulanIni += 1

    if (LEAD_TAHAP_AKTIF.includes(l.tahap)) {
      nilaiPipeline += l.nilaiEstimasi
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
    nilaiClosing,
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
// 8. Target & KPI Scorecard manajer
// ---------------------------------------------------------------

/** Jumlah hari kalender dalam sebuah bulan. `2026-02` → 28. */
export function hariDalamBulan(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/**
 * Faktor "sudah sejauh mana bulan ini berjalan", 0–1.
 *
 * Dipakai supaya bulan berjalan tidak selalu terbaca "tertinggal": pada
 * tanggal 6 dari 30 hari, laju = 0,2 — jadi capaian 20% dari target bulanan
 * sudah dianggap ON TRACK, bukan gagal. Bulan yang sudah lewat = 1.
 */
export function lajuBulan(monthKey: string, hariIni: string): number {
  const total = hariDalamBulan(monthKey)
  const berjalan = hariSeharusnyaBulan(monthKey, hariIni)
  return total > 0 ? Math.min(1, berjalan / total) : 0
}

/** Target default untuk periode yang belum punya data pembanding sama sekali. */
const TARGET_MINIMUM: TargetBulanan = {
  omzet: 0,
  tiket: 0,
  event: 2,
  leads: 20,
  campaign: 2,
  ide: 4,
  sosmedHari: 26,
  kepatuhan: 0.9,
  shiftCover: 1,
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

/** Target yang berlaku: yang disimpan owner, kalau belum ada pakai saran. */
export function targetBerlaku(
  data: AppData,
  monthKey: string,
  hariIni: string,
): { target: TargetBulanan; tersimpan: boolean } {
  const simpan = data.targetBulanan?.[monthKey]
  if (simpan) return { target: simpan, tersimpan: true }
  return { target: saranTarget(data, monthKey, hariIni), tersimpan: false }
}

export type StatusKPI = 'tercapai' | 'ontrack' | 'tertinggal' | 'belum-aktif'

export type BarisKPI = {
  id: string
  /** Kolom "Area" pada tabel KPI. */
  area: string
  label: string
  /** Capaian & target dalam satuan aslinya. */
  nilai: number
  target: number
  /** nilai ÷ target, di-clamp 0–1.2 untuk lebar bar. */
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

export type Scorecard = {
  baris: BarisKPI[]
  /** Rata-rata progress dari KPI yang AKTIF saja, 0–1. */
  skor: number
  aktif: number
  tercapai: number
  tertinggal: number
  laju: number
  /** true kalau target periode ini masih saran otomatis (belum disetujui owner). */
  targetSaran: boolean
}

/**
 * Susun KPI Scorecard manajer — 12 baris yang menurunkan tabel KPI di brief
 * jadi angka.
 *
 * Enam baris sudah punya sumber data; sisanya sengaja TETAP DITAMPILKAN dengan
 * status `belum-aktif` + keterangan `butuh`, supaya jelas mana yang belum bisa
 * dinilai dan kenapa — lebih jujur daripada menyembunyikannya atau
 * menampilkannya sebagai nol.
 */
export function skorKPI(
  data: AppData,
  monthKey: string,
  hariIni: string,
): Scorecard {
  const ring = ringkasanBulan(data, monthKey, hariIni)
  const check = kepatuhanChecklist(data, monthKey)
  const { target, tersimpan } = targetBerlaku(data, monthKey, hariIni)
  const jadwal = cakupanShift(data, monthKey, hariIni)
  const sosmed = aktivitasSosmed(data, monthKey, hariIni)
  const eksekusi = eksekusiKonten(data, monthKey, hariIni)
  const pipeline = pipelineLeads(data, monthKey, hariIni)
  const laju = lajuBulan(monthKey, hariIni)

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
   * Status sebuah KPI. Dibandingkan terhadap `laju`, bukan terhadap target
   * penuh — lihat lajuBulan(). Ambang 0,85 memberi toleransi wajar supaya
   * tertinggal sedikit belum langsung berwarna merah.
   */
  function nilaiStatus(rasio: number, prorata: boolean): StatusKPI {
    if (rasio >= 1) return 'tercapai'
    // Ambang 0,85 memberi toleransi wajar supaya tertinggal sedikit belum
    // langsung merah. Untuk KPI rasio, patokannya penuh (1) — bukan laju.
    return rasio >= (prorata ? laju : 1) * 0.85 ? 'ontrack' : 'tertinggal'
  }

  function baris(
    id: string,
    area: string,
    label: string,
    nilai: number,
    target: number,
    teks: string,
    sumber: string,
    prorata = true,
  ): BarisKPI {
    // Target 0 berarti KPI ini belum bisa dinilai — entah owner belum mengisi
    // targetnya, atau periodenya belum berjalan. Menandainya 'ontrack' akan
    // menaikkan skor rata-rata secara palsu, jadi dikeluarkan dari penilaian.
    if (target <= 0) {
      return {
        id,
        area,
        label,
        nilai,
        target: 0,
        progress: 0,
        prorata,
        status: 'belum-aktif',
        teks,
        sumber,
        butuh: 'Target periode ini belum diisi',
      }
    }
    const rasio = nilai / target
    return {
      id,
      area,
      label,
      nilai,
      target,
      progress: Math.max(0, Math.min(1.2, rasio)),
      prorata,
      status: nilaiStatus(rasio, prorata),
      teks,
      sumber,
    }
  }

  function belum(
    id: string,
    area: string,
    label: string,
    butuh: string,
    target: number,
  ): BarisKPI {
    return {
      id,
      area,
      label,
      nilai: 0,
      target,
      progress: 0,
      prorata: false,
      status: 'belum-aktif',
      teks: 'Belum ada datanya',
      sumber: 'Menunggu fitur pendukung',
      butuh,
    }
  }

  const baris_: BarisKPI[] = [
    jadwal.belumDisusun
      ? belum(
          'shift',
          'Operasional',
          'Shift ter-cover',
          'Roster shift di layar Jadwal',
          target.shiftCover,
        )
      : baris(
          'shift',
          'Operasional',
          'Shift ter-cover',
          jadwal.cakupan,
          target.shiftCover,
          `${jadwal.hariTercover} dari ${jadwal.hariDinilai} hari terisi penuh`,
          'Roster shift (jadwal rencana)',
          false,
        ),
    baris(
      'laporan',
      'Laporan',
      'Hari berlaporan',
      ring.hariBerlaporan,
      ring.hariBerjalan,
      `${ring.hariBerlaporan} dari ${ring.hariBerjalan} hari berjalan`,
      'Laporan pemasukan harian',
      false,
    ),
    check.belumDiatur
      ? belum(
          'disiplin',
          'Disiplin',
          'Kepatuhan checklist',
          'Task checklist pagi & closing di Pengaturan',
          target.kepatuhan,
        )
      : baris(
          'disiplin',
          'Disiplin',
          'Kepatuhan checklist',
          check.rata,
          target.kepatuhan,
          `${(check.rata * 100).toFixed(0)}% dari target ${(target.kepatuhan * 100).toFixed(0)}%`,
          'Checklist pagi & closing',
          false,
        ),
    baris(
      'campaign',
      'Marketing',
      'Campaign dieksekusi',
      campaignJalan.length,
      target.campaign,
      `${campaignJalan.length} dari ${target.campaign} campaign`,
      'Papan Promosi (tahap berjalan/selesai)',
    ),
    baris(
      'ide',
      'Improvement',
      'Ide baru masuk papan',
      promoBulanIni.length,
      target.ide,
      `${promoBulanIni.length} dari ${target.ide} ide`,
      'Papan Promosi (kartu baru bulan ini)',
    ),
    eksekusi.belumDiatur || eksekusi.jatuhTempo === 0
      ? belum(
          'eksekusi',
          'Eksekusi',
          'Campaign selesai tepat jadwal',
          'Deadline pada kartu di Papan Promosi',
          1,
        )
      : baris(
          'eksekusi',
          'Eksekusi',
          'Campaign selesai tepat jadwal',
          eksekusi.ketepatan,
          1,
          `${eksekusi.tepatWaktu} tepat waktu dari ${eksekusi.jatuhTempo} jatuh tempo`,
          'Papan Promosi (deadline vs tanggal selesai)',
          false,
        ),
    sosmed.belumDicatat
      ? belum(
          'sosmed',
          'Social Media',
          'Hari sosmed aktif',
          'Log sosmed harian di Dashboard Manajemen',
          target.sosmedHari,
        )
      : baris(
          'sosmed',
          'Social Media',
          'Hari sosmed aktif',
          sosmed.hariAktif,
          target.sosmedHari,
          `${sosmed.hariAktif} dari ${target.sosmedHari} hari · rentetan ${sosmed.runSekarang} hari`,
          'Log sosmed harian',
        ),
    sosmed.belumDicatat
      ? belum(
          'engagement',
          'Engagement',
          'Aktivitas engagement',
          'Log sosmed harian di Dashboard Manajemen',
          target.sosmedHari,
        )
      : baris(
          'engagement',
          'Engagement',
          'Aktivitas engagement',
          sosmed.hariEngagement,
          target.sosmedHari,
          `${sosmed.hariEngagement} dari ${target.sosmedHari} hari berinteraksi`,
          'Log sosmed harian (aksi engagement)',
        ),
    baris(
      'tiket',
      'Sales',
      'Tiket terjual',
      ring.qtyTiket,
      target.tiket,
      `${ring.qtyTiket} dari ${target.tiket} tiket`,
      'Laporan pemasukan harian',
    ),
    baris(
      'omzet',
      'Sales',
      'Omzet',
      ring.omzet,
      target.omzet,
      `${formatRupiah(ring.omzet)} dari ${formatRupiah(target.omzet)}`,
      'Studio + event',
    ),
    baris(
      'event',
      'Event',
      'Event terlaksana',
      jumlahEvent,
      target.event,
      `${jumlahEvent} dari ${target.event} event`,
      'Laporan event photobooth & game',
    ),
    pipeline.belumAda
      ? belum('leads', 'Leads', 'Leads baru', 'Pipeline di layar Leads & Sales', target.leads)
      : baris(
          'leads',
          'Leads',
          'Leads baru',
          pipeline.baruBulanIni,
          target.leads,
          `${pipeline.baruBulanIni} dari ${target.leads} leads · ${pipeline.closingBulanIni} closing`,
          'Pipeline Leads & Sales',
        ),
  ]

  const aktif = baris_.filter((b) => b.status !== 'belum-aktif')
  return {
    baris: baris_,
    skor:
      aktif.length > 0
        ? aktif.reduce((s, b) => s + Math.min(1, b.progress), 0) / aktif.length
        : 0,
    aktif: aktif.length,
    tercapai: aktif.filter((b) => b.status === 'tercapai').length,
    tertinggal: aktif.filter((b) => b.status === 'tertinggal').length,
    laju,
    targetSaran: !tersimpan,
  }
}
