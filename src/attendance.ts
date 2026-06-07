import type { AbsenEvent, AbsenHari, DayType, EventTipe, Shift } from './types'

export const EVENT_LABEL: Record<EventTipe, string> = {
  masuk: 'Jam Masuk',
  'istirahat-siang-mulai': 'Mulai Istirahat Siang',
  'istirahat-siang-selesai': 'Selesai Istirahat Siang',
  'istirahat-sore-mulai': 'Mulai Istirahat Sore',
  'istirahat-sore-selesai': 'Selesai Istirahat Sore',
  pulang: 'Jam Pulang',
}

export const EVENT_IKON: Record<EventTipe, string> = {
  masuk: '🟢',
  'istirahat-siang-mulai': '🍱',
  'istirahat-siang-selesai': '☕',
  'istirahat-sore-mulai': '🌆',
  'istirahat-sore-selesai': '💼',
  pulang: '🏠',
}

export const SHIFT_LABEL: Record<DayType, string> = {
  pagi: 'Shift Pagi',
  sore: 'Shift Sore',
  full: 'Shift Penuh',
  cuti: 'Cuti',
  libur: 'Libur Studio',
}

export const SHIFT_IKON: Record<DayType, string> = {
  pagi: '🌅',
  sore: '🌇',
  full: '🌞',
  cuti: '🌴',
  libur: '🏖️',
}

export const SHIFT_RENTANG: Record<DayType, string> = {
  pagi: '09:00 – 15:00 WIB',
  sore: '15:00 – 21:00 WIB',
  full: '09:00 – 21:00 WIB',
  cuti: 'Tidak masuk',
  libur: 'Studio tutup',
}

export const SHIFT_DESKRIPSI: Record<DayType, string> = {
  pagi: 'Istirahat 12:00–13:00 (kerja bersih 5 jam)',
  sore: 'Istirahat 18:00–19:00 (kerja bersih 5 jam)',
  full: 'Istirahat 12:00–13:00 & 18:00–19:00 (kerja bersih 10 jam)',
  cuti: 'Cuti pribadi · jatah 2 hari/bln (lebih dari itu dipotong)',
  libur: 'Studio tutup / libur bersama · gaji tetap penuh',
}

/** Penanda hari tidak bekerja yang dipilih lewat tombol (bukan shift kerja). */
export const TIDAK_KERJA_LIST: ('cuti' | 'libur')[] = ['cuti', 'libur']

/** Daftar lengkap jenis hari (3 shift kerja + cuti + libur). */
export const DAY_TYPE_LIST: DayType[] = ['pagi', 'sore', 'full', 'cuti', 'libur']

/** Apakah `s` adalah shift kerja (punya jadwal & event), bukan cuti/libur. */
export function isHariKerja(s: DayType): s is Shift {
  return s === 'pagi' || s === 'sore' || s === 'full'
}

export const SHIFT_URUTAN: Record<Shift, EventTipe[]> = {
  pagi: ['masuk', 'istirahat-siang-mulai', 'istirahat-siang-selesai', 'pulang'],
  sore: ['masuk', 'istirahat-sore-mulai', 'istirahat-sore-selesai', 'pulang'],
  full: [
    'masuk',
    'istirahat-siang-mulai',
    'istirahat-siang-selesai',
    'istirahat-sore-mulai',
    'istirahat-sore-selesai',
    'pulang',
  ],
}

export const SHIFT_JADWAL: Record<Shift, Partial<Record<EventTipe, string>>> = {
  pagi: {
    masuk: '09:00',
    'istirahat-siang-mulai': '12:00',
    'istirahat-siang-selesai': '13:00',
    pulang: '15:00',
  },
  sore: {
    masuk: '15:00',
    'istirahat-sore-mulai': '18:00',
    'istirahat-sore-selesai': '19:00',
    pulang: '21:00',
  },
  full: {
    masuk: '09:00',
    'istirahat-siang-mulai': '12:00',
    'istirahat-siang-selesai': '13:00',
    'istirahat-sore-mulai': '18:00',
    'istirahat-sore-selesai': '19:00',
    pulang: '21:00',
  },
}

export const SHIFT_LIST: Shift[] = ['pagi', 'sore', 'full']

export const SHIFT_TARGET_MENIT: Record<Shift, number> = {
  pagi: 5 * 60,
  sore: 5 * 60,
  full: 10 * 60,
}

const ISTIRAHAT_PAIRS: [EventTipe, EventTipe][] = [
  ['istirahat-siang-mulai', 'istirahat-siang-selesai'],
  ['istirahat-sore-mulai', 'istirahat-sore-selesai'],
]

export function getEvent(
  record: AbsenHari | undefined,
  tipe: EventTipe,
): AbsenEvent | undefined {
  return record?.events.find((e) => e.tipe === tipe)
}

/** Absensi terhitung resmi? (`menunggu` = entri manual belum di-ACC admin). */
export function absenDisetujui(record: AbsenHari | undefined): boolean {
  return record?.status !== 'menunggu'
}

export function jadwalISO(tanggal: string, jam: string): string {
  const [h, m] = jam.split(':').map(Number)
  const [y, mo, d] = tanggal.split('-').map(Number)
  const dt = new Date(y, mo - 1, d, h, m, 0, 0)
  return dt.toISOString()
}

export function diffMenit(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 60000)
}

export function formatJam(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatDurasi(menit: number): string {
  if (menit <= 0) return '0 menit'
  const j = Math.floor(menit / 60)
  const m = menit % 60
  if (j === 0) return `${m} menit`
  if (m === 0) return `${j} jam`
  return `${j} jam ${m} menit`
}

export function formatTanggalPanjang(tanggal: string): string {
  const [y, mo, d] = tanggal.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  return dt.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Label bulan + tahun untuk pengelompokan riwayat (mis. "Juni 2026").
export function formatBulanTahun(tanggal: string): string {
  const [y, mo] = tanggal.split('-').map(Number)
  const dt = new Date(y, mo - 1, 1)
  return dt.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
}

export type Ringkasan = {
  shift: Shift | null
  terlambatMenit: number
  lemburMenit: number
  istirahatLebihMenit: number
  kerjaBersihMenit: number
  targetKerjaMenit: number
  sudahPulang: boolean
  overlapMenit: number
  overlapMulai?: string
  overlapSelesai?: string
}

const SHIFT_SETELAH: Partial<Record<Shift, Shift>> = {
  pagi: 'sore',
}

export function cariTakeover(
  record: AbsenHari,
  semuaRecord: AbsenHari[],
): string | undefined {
  if (!isHariKerja(record.shift)) return undefined
  const shiftBerikutnya = SHIFT_SETELAH[record.shift]
  if (!shiftBerikutnya) return undefined
  let paling: number | undefined
  for (const r of semuaRecord) {
    if (!absenDisetujui(r)) continue
    if (r.employeeId === record.employeeId) continue
    if (r.tanggal !== record.tanggal) continue
    if (r.shift !== shiftBerikutnya) continue
    const masuk = r.events.find((e) => e.tipe === 'masuk')
    if (!masuk) continue
    const ms = new Date(masuk.waktu).getTime()
    if (paling === undefined || ms < paling) paling = ms
  }
  return paling !== undefined ? new Date(paling).toISOString() : undefined
}

export function cariOperatorOverlap(
  record: AbsenHari,
  semuaRecord: AbsenHari[],
): string[] {
  if (!isHariKerja(record.shift)) return []
  const shiftBerikutnya = SHIFT_SETELAH[record.shift]
  if (!shiftBerikutnya) return []
  const pulang = record.events.find((e) => e.tipe === 'pulang')
  if (!pulang) return []
  const pulangMs = new Date(pulang.waktu).getTime()
  const ids: string[] = []
  for (const r of semuaRecord) {
    if (!absenDisetujui(r)) continue
    if (r.employeeId === record.employeeId) continue
    if (r.tanggal !== record.tanggal) continue
    if (r.shift !== shiftBerikutnya) continue
    const masuk = r.events.find((e) => e.tipe === 'masuk')
    if (!masuk) continue
    if (new Date(masuk.waktu).getTime() < pulangMs) {
      ids.push(r.employeeId)
    }
  }
  return ids
}

export function hitungRingkasan(
  record: AbsenHari | undefined,
  takeoverPada?: string,
): Ringkasan {
  // Hari cuti / libur tidak punya jam kerja → ringkasan kosong (tidak dihitung
  // sebagai kehadiran, terlambat, maupun lembur).
  if (!record || !isHariKerja(record.shift)) {
    return {
      shift: null,
      terlambatMenit: 0,
      lemburMenit: 0,
      istirahatLebihMenit: 0,
      kerjaBersihMenit: 0,
      targetKerjaMenit: 0,
      sudahPulang: false,
      overlapMenit: 0,
    }
  }

  const shift = record.shift
  const tanggal = record.tanggal
  const jadwal = SHIFT_JADWAL[shift] ?? SHIFT_JADWAL.full
  const slots = SHIFT_URUTAN[shift] ?? SHIFT_URUTAN.full

  const masuk = getEvent(record, 'masuk')
  const pulang = getEvent(record, 'pulang')

  let terlambatMenit = 0
  if (masuk && jadwal.masuk) {
    terlambatMenit = Math.max(
      0,
      diffMenit(masuk.waktu, jadwalISO(tanggal, jadwal.masuk)),
    )
  }

  let lemburMenit = 0
  if (pulang && jadwal.pulang) {
    lemburMenit += Math.max(
      0,
      diffMenit(pulang.waktu, jadwalISO(tanggal, jadwal.pulang)),
    )
  }
  for (const tipe of slots) {
    if (!tipe.endsWith('-mulai')) continue
    const ev = getEvent(record, tipe)
    if (ev?.dilewati) continue
    const jdw = jadwal[tipe]
    if (ev && jdw) {
      lemburMenit += Math.max(0, diffMenit(ev.waktu, jadwalISO(tanggal, jdw)))
    }
  }

  let overlapMenit = 0
  let overlapMulai: string | undefined
  let overlapSelesai: string | undefined
  if (pulang && takeoverPada) {
    const pulangMs = new Date(pulang.waktu).getTime()
    const takeoverMs = new Date(takeoverPada).getTime()
    if (pulangMs > takeoverMs) {
      overlapMenit = Math.round((pulangMs - takeoverMs) / 60000)
      overlapMulai = takeoverPada
      overlapSelesai = pulang.waktu
    }
  }

  let istirahatLebihMenit = 0
  for (const [m, s] of ISTIRAHAT_PAIRS) {
    if (!slots.includes(m)) continue
    const mEv = getEvent(record, m)
    const sEv = getEvent(record, s)
    if (mEv && sEv) {
      const aktual = diffMenit(sEv.waktu, mEv.waktu)
      istirahatLebihMenit += Math.max(0, aktual - 60)
    }
  }

  let kerjaBersihMenit = 0
  if (masuk && pulang) {
    const masukAktualMs = new Date(masuk.waktu).getTime()
    const masukJadwalMs = jadwal.masuk
      ? new Date(jadwalISO(tanggal, jadwal.masuk)).getTime()
      : masukAktualMs
    const masukEfektifMs = Math.max(masukAktualMs, masukJadwalMs)
    let total = Math.round(
      (new Date(pulang.waktu).getTime() - masukEfektifMs) / 60000,
    )
    for (const [m, s] of ISTIRAHAT_PAIRS) {
      if (!slots.includes(m)) continue
      const mEv = getEvent(record, m)
      const sEv = getEvent(record, s)
      if (mEv && sEv) {
        total -= Math.max(0, diffMenit(sEv.waktu, mEv.waktu))
      } else {
        total -= 60
      }
    }
    kerjaBersihMenit = Math.max(0, total)
  }

  return {
    shift,
    terlambatMenit,
    lemburMenit,
    istirahatLebihMenit,
    kerjaBersihMenit,
    targetKerjaMenit: SHIFT_TARGET_MENIT[shift],
    sudahPulang: !!pulang,
    overlapMenit,
    overlapMulai,
    overlapSelesai,
  }
}

export function istirahatDilewatiCount(record: AbsenHari | undefined): number {
  if (!record || !isHariKerja(record.shift)) return 0
  let n = 0
  for (const [m] of ISTIRAHAT_PAIRS) {
    if (!SHIFT_URUTAN[record.shift]?.includes(m)) continue
    const ev = getEvent(record, m)
    if (ev?.dilewati) n += 1
  }
  return n
}

export function eventBerikutnya(record: AbsenHari | undefined): EventTipe | null {
  if (!record || !isHariKerja(record.shift)) return null
  const slots = SHIFT_URUTAN[record.shift] ?? SHIFT_URUTAN.full
  for (const tipe of slots) {
    if (!getEvent(record, tipe)) return tipe
  }
  return null
}
