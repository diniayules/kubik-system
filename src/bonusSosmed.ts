// =============================================================
// bonusSosmed.ts · Kenaikan gaji pokok operator dari target sosial media
// (murni / deterministik — tidak menyentuh database maupun layar).
//
// ATURANNYA (keputusan owner, September 2026):
//   Gaji pokok operator naik dari Rp 800.000 ke Rp 1.000.000 untuk SATU BULAN
//   kalau KETIGA syarat di bawah terpenuhi di bulan itu. Kurang satu pun,
//   gaji pokoknya tetap angka dasar — sengaja "semua atau tidak sama sekali",
//   supaya yang dijanjikan ke operator muat dalam satu kalimat dan tidak bisa
//   dipenuhi separuh-separuh oleh syarat yang paling mudah saja.
//
//   1. STORY  — minimal 1 story konten pada setiap hari ia masuk kerja.
//   2. KONTEN — minimal 4 kartu konten selesai dalam sebulan.
//   3. LIVE   — minimal 2 siaran langsung sebulan (“sekali tiap dua minggu”).
//              Studio dengan 2 operator berarti 4 live sebulan.
//
// KENAPA PENYEBUTNYA "HARI MASUK KERJA", BUKAN 30 HARI:
//   Studio cuma punya satu akun; yang bertanggung jawab atas story hari ini
//   adalah yang sedang shift. Menagih story pada hari seseorang libur berarti
//   menghukumnya karena hari itu ada orang lain. Efeknya juga adil dua arah:
//   operator yang jarang masuk punya penyebut kecil, jadi bonusnya tidak jadi
//   lebih gampang — ia tetap harus mengisi SEMUA harinya.
//
// KENAPA DINILAI SAAT BULAN TUTUP:
//   Selama bulan berjalan, tarif gaji pokok tetap angka dasar dan layar hanya
//   menampilkan progres + proyeksi. Kalau kenaikan dipakai real-time, nominal
//   gaji yang sudah terlihat operator bisa TURUN lagi keesokan harinya begitu
//   satu hari bolong — angka gaji tidak boleh bergerak mundur.
//
// BUKTINYA DARI MANA — semuanya butuh tangan pengelola, tidak ada satu pun
// yang bisa diselesaikan sendiri oleh yang dinilai:
//   - story & live : `klaim_sosmed` dengan status 'disetujui'. Operator
//     MELAPOR, pengelola MEMERIKSA; trigger `protect_klaim_sosmed` (migration
//     0060) memaksa laporan non-pengelola selalu masuk sebagai 'menunggu'.
//     Laporan yang belum diperiksa tidak menambah apa pun.
//   - konten       : `promo_programs.selesai_pada`, distempel trigger database
//     (migration 0046) saat pengelola memindahkan kartu ke tahap 'selesai'.
//     Centang tahap 'tayang' oleh PIC (migration 0061) hanyalah KLAIM dan
//     sengaja tidak pernah dibaca di sini.
// =============================================================
import type { AbsenHari, AppData, Employee, KlaimJenis, PromoProgram } from './types'

/** Gaji pokok sebulan setelah ketiga target terpenuhi. */
export const GAJI_POKOK_LULUS = 1_000_000
/** Minimal kartu konten selesai dalam sebulan. */
export const TARGET_KONTEN_SEBULAN = 4
/**
 * Minimal siaran langsung per orang, per BULAN.
 *
 * Owner menyebutnya "2 minggu sekali", tapi yang ditagih adalah angka bulanan —
 * bukan jarak antar-siaran. Jaraknya sengaja TIDAK dipaksa: menghanguskan
 * Rp 200.000 karena dua live kebetulan jatuh di minggu yang sama jauh lebih
 * keras daripada yang dijanjikan ke operator.
 */
export const TARGET_LIVE_SEBULAN = 2

/** Shift yang bukan hari kerja berbayar — disamakan dengan `gaji.ts`. */
const SHIFT_BUKAN_KERJA = new Set(['pantau', 'cuti', 'libur', 'bersih'])

export type KunciSyarat = 'story' | 'konten' | 'live'

export type SyaratBonus = {
  kunci: KunciSyarat
  label: string
  /** Bukti yang sudah terkumpul bulan ini. */
  capai: number
  /** Patokan kalau bulan ini berjalan sampai habis — dasar `lulus`. */
  target: number
  /** Patokan sampai HARI INI — dasar `onTrack`, untuk meter bulan berjalan. */
  targetKini: number
  /** Sudah memenuhi patokan penuh. */
  lulus: boolean
  /** Belum tentu lulus, tapi sampai hari ini belum tertinggal. */
  onTrack: boolean
  /** Satuan untuk ditulis di layar, mis. "hari". */
  satuan: string
}

export type CapaianBonus = {
  syarat: SyaratBonus[]
  /** Ketiga syarat terpenuhi penuh. */
  lulus: boolean
  /** Ketiganya masih on-track sampai hari ini (bulan berjalan). */
  onTrack: boolean
  /** Bulan ini sudah lewat, jadi penilaiannya final. */
  bulanTutup: boolean
  /** Gaji pokok yang diatur owner di layar Gaji. */
  gajiPokokDasar: number
  /** Gaji pokok yang benar-benar dipakai menghitung slip bulan ini. */
  gajiPokokEfektif: number
  /** Selisih yang didapat dari bonus (0 kalau belum/tidak lulus). */
  kenaikan: number
}

/** Hari terakhir bulan `monthKey` (YYYY-MM) sebagai `YYYY-MM-DD`. */
function akhirBulan(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${monthKey}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

/** Semua tanggal `YYYY-MM-DD` di bulan `monthKey`. */
function tanggalBulan(monthKey: string): string[] {
  const [y, m] = monthKey.split('-').map(Number)
  const n = new Date(y, m, 0).getDate()
  return Array.from(
    { length: n },
    (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`,
  )
}

/**
 * Tanggal-tanggal bulan ini yang benar-benar dijalani `emp` sebagai hari kerja.
 * Cuti, libur studio, general cleaning, dan kehadiran pengelola ('pantau')
 * tidak termasuk — sama persis dengan definisi `hariHadir` di `gaji.ts`,
 * supaya tidak ada dua pengertian "hari kerja" yang berbeda di aplikasi ini.
 */
function hariKerja(
  emp: Employee,
  records: AbsenHari[],
  monthKey: string,
  hariIni: string,
): string[] {
  return records
    .filter(
      (r) =>
        r.employeeId === emp.id &&
        r.tanggal.startsWith(monthKey) &&
        // Dipotong di hari ini: catatan bertanggal maju (mis. libur studio yang
        // dicatat lebih awal, atau salah ketik tanggal) tidak boleh menagih
        // story untuk hari yang belum terjadi.
        r.tanggal <= hariIni &&
        !SHIFT_BUKAN_KERJA.has(r.shift as string),
    )
    .map((r) => r.tanggal)
}

/**
 * Tanggal-tanggal yang laporan `jenis`-nya SUDAH DISETUJUI untuk `emp`.
 *
 * Hanya 'disetujui' yang masuk. Laporan 'menunggu' sengaja tidak dihitung
 * sebagian pun: kalau ia menambah angka walau sedikit, melapor jadi lebih
 * menguntungkan daripada mengerjakan, dan pemeriksaan pengelola kehilangan
 * artinya.
 */
function tanggalDisetujui(
  data: AppData,
  empId: string,
  jenis: KlaimJenis,
  monthKey: string,
): Set<string> {
  const hasil = new Set<string>()
  for (const k of data.klaimSosmed ?? []) {
    if (k.employeeId !== empId) continue
    if (k.jenis !== jenis) continue
    if (k.status !== 'disetujui') continue
    if (!k.tanggal.startsWith(monthKey)) continue
    hasil.add(k.tanggal)
  }
  return hasil
}


/**
 * Hitung capaian bonus satu operator untuk satu bulan.
 *
 * @param emp             operator yang dinilai
 * @param gajiPokokDasar  gaji pokok yang diatur owner (`data.gajiPokok[id]`)
 * @param monthKey        periode `YYYY-MM`
 * @param hariIni         `YYYY-MM-DD`
 */
export function capaianBonus(
  emp: Employee,
  gajiPokokDasar: number,
  data: AppData,
  monthKey: string,
  hariIni: string,
): CapaianBonus {
  const bulanTutup = akhirBulan(monthKey) < hariIni

  // --- 1. Story: tiap hari kerja harus punya story konten ---
  const storyOK = tanggalDisetujui(data, emp.id, 'story', monthKey)
  const hariKerjanya = hariKerja(emp, data.records, monthKey, hariIni)
  const storyCapai = hariKerjanya.filter((tgl) => storyOK.has(tgl)).length
  // Penyebutnya tumbuh sendiri mengikuti hari yang sudah dijalani, jadi target
  // penuh & target sampai hari ini memang angka yang sama.
  const storyTarget = hariKerjanya.length

  // --- 2. Konten: kartu Papan Promosi berjenis 'konten' yang selesai ---
  // Sengaja hanya `selesaiPada` (stempel database) — berbeda dari
  // `deadline`/`createdAt` yang cuma perkiraan. Untuk uang, perkiraan tidak cukup.
  const selesaiBulanIni = (p: PromoProgram) =>
    p.jenis === 'konten' &&
    p.pic === emp.id &&
    p.tahap === 'selesai' &&
    !!p.selesaiPada &&
    p.selesaiPada.startsWith(monthKey)
  const kontenCapai = data.promoPrograms.filter(selesaiBulanIni).length

  // --- 3. Live: minimal 2 siaran sebulan ---
  const liveCapai = tanggalDisetujui(data, emp.id, 'live', monthKey).size

  // Porsi bulan yang sudah dijalani — dipakai memprorata target konten supaya
  // tanggal 5 tidak selalu terbaca "tertinggal".
  const semuaTanggal = tanggalBulan(monthKey)
  const hariLewat = bulanTutup
    ? semuaTanggal.length
    : semuaTanggal.filter((t) => t <= hariIni).length
  const prorata = (target: number) =>
    Math.min(target, Math.floor((target * hariLewat) / semuaTanggal.length))
  const kontenTargetKini = prorata(TARGET_KONTEN_SEBULAN)
  const liveTargetKini = prorata(TARGET_LIVE_SEBULAN)

  const syarat: SyaratBonus[] = [
    {
      kunci: 'story',
      label: 'Story konten tiap hari kerja',
      capai: storyCapai,
      target: storyTarget,
      targetKini: storyTarget,
      lulus: storyCapai >= storyTarget,
      onTrack: storyCapai >= storyTarget,
      satuan: 'hari',
    },
    {
      kunci: 'konten',
      label: `Konten selesai · min. ${TARGET_KONTEN_SEBULAN}/bulan`,
      capai: kontenCapai,
      target: TARGET_KONTEN_SEBULAN,
      targetKini: kontenTargetKini,
      lulus: kontenCapai >= TARGET_KONTEN_SEBULAN,
      onTrack: kontenCapai >= kontenTargetKini,
      satuan: 'konten',
    },
    {
      kunci: 'live',
      label: `Live · min. ${TARGET_LIVE_SEBULAN}×/bulan`,
      capai: liveCapai,
      target: TARGET_LIVE_SEBULAN,
      targetKini: liveTargetKini,
      lulus: liveCapai >= TARGET_LIVE_SEBULAN,
      onTrack: liveCapai >= liveTargetKini,
      satuan: 'live',
    },
  ]

  const lulus = syarat.every((s) => s.lulus)
  const onTrack = syarat.every((s) => s.onTrack)
  // `Math.max` menjaga karyawan yang gaji dasarnya sudah di atas Rp 1.000.000
  // tidak justru TURUN karena berprestasi. Konsekuensinya: bagi mereka, bonus
  // ini tidak menambah apa-apa — kalau suatu saat ada operator senior seperti
  // itu, angkanya perlu diubah jadi tambahan (dasar + selisih), bukan patokan.
  const gajiPokokEfektif =
    bulanTutup && lulus ? Math.max(gajiPokokDasar, GAJI_POKOK_LULUS) : gajiPokokDasar

  return {
    syarat,
    lulus,
    onTrack,
    bulanTutup,
    gajiPokokDasar,
    gajiPokokEfektif,
    kenaikan: gajiPokokEfektif - gajiPokokDasar,
  }
}

/**
 * Pintasan untuk pemanggil yang cuma butuh angkanya (kas, rekap laporan):
 * gaji pokok yang berlaku untuk `emp` di bulan `monthKey`.
 */
export function gajiPokokBerlaku(
  emp: Employee,
  data: AppData,
  monthKey: string,
  hariIni: string,
): number {
  return capaianBonus(emp, data.gajiPokok[emp.id] ?? 0, data, monthKey, hariIni)
    .gajiPokokEfektif
}
