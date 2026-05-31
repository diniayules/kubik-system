export type Employee = {
  id: string
  nama: string
  jabatan: string
  pinHash: string
  /**
   * Peran akun. Admin = pengelola (tidak ikut absen / tidak mengisi laporan
   * income), jadi disaring dari daftar operasional. Opsional agar data lama
   * tetap kompatibel; anggap `undefined` sebagai karyawan.
   */
  role?: 'admin' | 'karyawan'
}

export type Shift = 'pagi' | 'sore' | 'full'

export type EventTipe =
  | 'masuk'
  | 'istirahat-siang-mulai'
  | 'istirahat-siang-selesai'
  | 'istirahat-sore-mulai'
  | 'istirahat-sore-selesai'
  | 'pulang'

export type AbsenEvent = {
  tipe: EventTipe
  waktu: string
  waktuAsli?: string
  diubahPada?: string
  manual?: boolean
  dilewati?: boolean
}

/**
 * Status persetujuan satu hari absensi.
 *  - 'disetujui' : absensi resmi (real-time hari ini, atau manual yang sudah
 *                  di-ACC admin). Dihitung & ditampilkan sebagai kehadiran.
 *  - 'menunggu'  : entri manual karyawan untuk tanggal selain hari ini, belum
 *                  di-ACC admin. Tidak dihitung sampai disetujui.
 * `undefined` dianggap 'disetujui' agar data lama tetap kompatibel.
 */
export type AbsenStatus = 'menunggu' | 'disetujui'

export type AbsenHari = {
  id: string
  employeeId: string
  tanggal: string
  shift: Shift
  events: AbsenEvent[]
  status?: AbsenStatus
}

// Layanan & Upgrade are dynamic now: ids are admin-defined (see layananCatalog /
// upgradeCatalog). The default ids remain 'photobooth' | 'photobox' | ... but
// the type is an open string so admins can add custom items.
export type Layanan = string

export type Upgrade = string

/** A configurable income line: a ticket-based service (Photobooth, …). */
export type LayananDef = {
  id: string
  label: string
  ikon: string
}

/** A configurable income upgrade (Poster, Crack n Share, …). */
export type UpgradeDef = {
  id: string
  label: string
  ikon: string
}

/** A configurable merchandise/other product (frame foto, t-shirt, …). */
export type ProdukDef = {
  id: string
  label: string
  ikon: string
}

export type HargaTiket = Record<string, number>
export type HargaUpgrade = Record<string, number>
export type HargaProduk = Record<string, number>

export type IncomeItem = {
  layanan: Layanan
  karyawanId: string
  tiket: number
  cetak: number
}

export type UpgradeItem = {
  tipe: Upgrade
  karyawanId: string
  jumlah: number
}

export type ProdukItem = {
  produkId: string
  karyawanId: string
  jumlah: number
}

export type LaporanIncome = {
  id: string
  tanggal: string
  items: IncomeItem[]
  upgrades: UpgradeItem[]
  produk: ProdukItem[]
  keterangan: string
  hargaTiket: HargaTiket
  hargaCetak: number
  hargaUpgrade: HargaUpgrade
  hargaProduk: HargaProduk
  /**
   * Alokasi pemakaian kertas untuk tiket + tambahan cetak. Biasanya satu jenis
   * kertas (jumlah = total tiket + cetak), tapi bisa dipecah ke beberapa jenis
   * kalau dalam sehari operator memakai kertas berbeda (mis. customer minta
   * finishing lain). Tiap entri memotong `jumlah` lembar dari `kertasId`
   * (stok_kertas.id). Upgrade (Poster / Crack n Share) memotong kertas dengan
   * nama yang sama secara terpisah. `undefined`/`[]` = laporan lama sebelum
   * fitur ini (tidak memotong stok kertas).
   */
  pemakaianKertas?: { kertasId: string; jumlah: number }[]
  /**
   * Jumlah amplop yang terpakai. Default = jumlah tiket, tapi bisa diedit kalau
   * hari itu pakai lebih dari 1 per tiket. `undefined` = laporan lama sebelum
   * fitur ini (tidak memotong stok amplop).
   */
  amplopTerpakai?: number
}

// ---------- Event (Photobooth & Photo Game) ----------
// Laporan event berdiri SENDIRI, terpisah penuh dari laporan_income (Photo
// Studio): tidak menyentuh stok, gaji, maupun dashboard income.
export type EventKategori = 'photobooth' | 'game'
export type SewaTipe = 'jam' | 'voucher'

/**
 * Satu laporan event. Field yang dipakai bergantung pada `tipe`:
 *  - 'jam'     : jam, tarifPerJam, biayaKertas, biayaTinta, biayaListrik,
 *                upahOperator → laba = (jam × tarif) − total biaya.
 *  - 'voucher' : voucher, cetak (+ snapshot hargaVoucher/hargaCetak) →
 *                total = voucher × hargaVoucher + cetak × hargaCetak.
 */
export type LaporanEvent = {
  id: string
  tanggal: string
  kategori: EventKategori
  tipe: SewaTipe
  keterangan: string
  // --- mode 'jam' ---
  jam?: number
  tarifPerJam?: number
  biayaKertas?: number
  biayaTinta?: number
  biayaListrik?: number
  upahOperator?: number
  // --- mode 'voucher' ---
  voucher?: number
  cetak?: number
  hargaVoucher?: number
  hargaCetak?: number
}

/** Harga tetap per kategori event (dipakai mode voucher + default tarif/jam). */
export type EventConfig = {
  hargaVoucher: number
  hargaCetak: number
  tarifPerJam: number
}

export type WarnaTinta = 'BK' | 'LC' | 'M' | 'C' | 'Y' | 'LM'

export type JenisKertas = {
  id: string
  nama: string
  stok: number
}

export type Tinta = {
  warna: WarnaTinta
  stok: number
  catatan?: string
}

export type SalahCetak = {
  id: string
  tanggal: string
  kertasId: string
  jumlah: number
  alasan: string
}

export type Pengeluaran = {
  id: string
  tanggal: string
  kategori: string
  deskripsi: string
  jumlah: number
  catatan: string
}

export type FontPair = 'playful' | 'editorial' | 'modern' | 'minimal' | 'oui'
export type FontSize = 'small' | 'normal' | 'large' | 'xlarge'
export type TampilanMode = 'card' | 'list' | 'kalender'

export type AppData = {
  employees: Employee[]
  /**
   * Karyawan yang dinonaktifkan (profiles.active = false). Tidak ikut di roster
   * operasional / statistik / gaji — hanya dipakai admin untuk mengaktifkan
   * kembali (memulihkan kartu absensi mereka).
   */
  inactiveEmployees: Employee[]
  records: AbsenHari[]
  laporanIncome: LaporanIncome[]
  /** Laporan event (Photobooth & Photo Game) — terpisah dari laporanIncome. */
  laporanEvent: LaporanEvent[]
  /** Harga tetap per kategori event. Disimpan di `app_config.event_config`. */
  eventConfig?: Partial<Record<EventKategori, EventConfig>>
  layananCatalog: LayananDef[]
  upgradeCatalog: UpgradeDef[]
  produkCatalog: ProdukDef[]
  hargaTiket: HargaTiket
  hargaCetak: number
  hargaUpgrade: HargaUpgrade
  hargaProduk: HargaProduk
  /**
   * Gaji pokok bulanan per karyawan, keyed by employee id. Dipakai layar Gaji
   * untuk menghitung slip (tarif/menit = gaji ÷ 30 hari ÷ 300 menit, lalu
   * + bonus penjualan, + lembur, + coverage shift, − terlambat, − cuti lebih).
   * Disimpan di `app_config.gaji_pokok`. `undefined`/kosong = belum diisi (0).
   */
  gajiPokok: Record<string, number>
  /**
   * Status "sudah dibayar" per slip gaji, key = `${employeeId}::${YYYY-MM}`.
   * true = gaji bulan itu untuk karyawan tsb sudah dibayar (pindah ke Riwayat).
   * Disimpan di `app_config.gaji_dibayar` (JSONB), pola sama seperti gajiPokok.
   */
  gajiDibayar: Record<string, boolean>
  stokKertas: JenisKertas[]
  stokTinta: Tinta[]
  stokAmplop: number
  salahCetak: SalahCetak[]
  pengeluaran: Pengeluaran[]
  headerJudul?: string
  headerSub?: string
  incomeJudul?: string
  incomeSub?: string
  fontPair?: FontPair
  fontSize?: FontSize
  brandKicker?: string
  brandName?: string
  dashJudul?: string
  dashSub?: string
  tampilanAbsensi?: TampilanMode
  tampilanInventaris?: TampilanMode
  tampilanTinta?: TampilanMode
  tampilanIncome?: TampilanMode
}
