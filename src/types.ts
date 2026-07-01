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
  /**
   * Nomor Induk Karyawan (internal Kubik). HANYA admin yang boleh mengisi/
   * mengubah; karyawan melihat read-only. Migration 0026.
   */
  nomorInduk?: string
  /** Nomor handphone — bisa lebih dari satu. Migration 0027. */
  noHp?: string[]
  /**
   * Data profil kepegawaian (migration 0025). Semua opsional agar data lama
   * tetap kompatibel; bisa diisi/diedit karyawan sendiri maupun admin.
   *  - foto            : avatar foto (data URL JPEG, di-resize kecil di client)
   *  - namaLengkap     : nama lengkap resmi (vs `nama` panggilan)
   *  - tempatLahir     : tempat lahir
   *  - tanggalLahir    : tanggal lahir (YYYY-MM-DD)
   *  - pendidikan      : pendidikan terakhir
   *  - tanggalDiterima : tanggal mulai bekerja di Kubik (YYYY-MM-DD)
   */
  foto?: string
  namaLengkap?: string
  tempatLahir?: string
  tanggalLahir?: string
  pendidikan?: string
  tanggalDiterima?: string
}

/** Shift kerja (karyawan benar-benar bertugas hari itu). */
export type Shift = 'pagi' | 'sore' | 'full'

/**
 * Jenis hari pada satu kartu absensi. Selain 3 shift kerja, ada 2 hari "tidak
 * bekerja" yang dicatat eksplisit lewat tombol di pemilih shift:
 *  - 'cuti'  : cuti pribadi karyawan. Jatah 2 hari/bulan tidak memotong gaji;
 *              cuti ke-3 dst memotong 1 hari penuh.
 *  - 'libur' : studio tutup / libur bersama (karyawan terpaksa ikut libur).
 *              Tidak pernah memotong gaji dan tidak memakai jatah cuti.
 */
export type DayType = Shift | 'cuti' | 'libur'

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
  /** Shift kerja, atau penanda hari tidak bekerja ('cuti' / 'libur'). */
  shift: DayType
  events: AbsenEvent[]
  status?: AbsenStatus
  /**
   * Waktu ekstra berbayar yang diisi MANUAL (tidak bisa diturunkan otomatis dari
   * jadwal): mis. datang lebih cepat untuk backup rekan, atau meeting/evaluasi
   * di luar jam kerja. Dibayar `extraMenit × tarif/menit` di slip gaji, terpisah
   * dari lembur. `undefined`/0 = tidak ada. `extraCatatan` = alasan bebas.
   */
  extraMenit?: number
  extraCatatan?: string
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
  /**
   * Potongan harga (diskon) dalam Rupiah untuk laporan ini. Dikurangkan dari
   * total income kotor (tiket + cetak + upgrade + produk). `undefined`/0 = tanpa
   * potongan. Tidak memengaruhi bonus penjualan karyawan (yang dihitung per
   * item, bukan dari nilai rupiah).
   */
  potonganHarga?: number
  /**
   * Pembayaran yang diterima dipecah per metode (Rupiah). Murni informatif —
   * tidak memengaruhi total income maupun bonus karyawan. `undefined`/0 =
   * laporan lama atau metode itu tidak dipakai.
   */
  tunai?: number
  qris?: number
  /**
   * Rekonsiliasi uang tunai fisik di laci kasir (Rupiah). `uangBesar` +
   * `uangKecil` SEHARUSNYA balance dengan `tunai` (pembayaran tunai yang
   * diterima) — dipakai untuk mengecek isi laci. `totalUangBesar` murni catatan
   * dan TIDAK memengaruhi nilai apa pun. Semua opsional; `undefined`/0 = laporan
   * lama atau belum diisi.
   */
  uangBesar?: number
  uangKecil?: number
  /**
   * @deprecated Tidak lagi diisi manual. "Total uang besar" sekarang dihitung
   * otomatis sebagai buku kas: Σ(uangBesar semua laporan) − Σ(penarikan admin).
   * Lihat [PenarikanUangBesar] & AppData.penarikanUangBesar. Kolom DB lama
   * (`total_uang_besar`) dibiarkan demi data lama tapi tidak dipakai untuk tampilan.
   */
  totalUangBesar?: number
}

/**
 * Satu catatan pengambilan / setoran uang besar dari laci ke admin. Mengurangi
 * saldo "Total uang besar" (buku kas). `jumlah` selalu > 0 (Rupiah); menghapus
 * baris mengembalikan saldo. Admin-only.
 */
export type PenarikanUangBesar = {
  id: string
  tanggal: string
  jumlah: number
  catatan: string
}

/**
 * Satu penyesuaian uang kecil di laci di luar penjualan. Dipakai untuk
 * rekonsiliasi "float" laci: laci tidak mulai dari kosong tiap hari, ada
 * kembalian kecil yang nyangkut dari laporan sebelumnya.
 *  - `tipe` 'tambah' : admin/kasir menambah uang kecil ke laci (tukar pecahan).
 *  - `tipe` 'pakai'  : uang kecil dipakai keluar dari laci (belanja, dll).
 * Inilah yang menjelaskan kenapa float hari ini ≠ uang kecil kemarin. `jumlah`
 * selalu > 0 (Rupiah); menghapus baris mengembalikan float.
 */
export type PenyesuaianUangKecil = {
  id: string
  tanggal: string
  tipe: 'tambah' | 'pakai'
  jumlah: number
  catatan: string
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

export type WarnaTinta = 'BK' | 'LC' | 'M' | 'C' | 'Y' | 'LM'

export type JenisKertas = {
  id: string
  nama: string
  stok: number
}

/**
 * Stok frame foto. Persis seperti `JenisKertas`: beberapa jenis bernama, tiap
 * jenis punya stok sendiri. Berkurang otomatis saat produk dengan NAMA yang
 * sama terjual di laporan income (pencocokan lewat nama, sama seperti upgrade →
 * kertas), lihat `hitungPemakaianStok`.
 */
export type JenisFrame = {
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
  /**
   * Riwayat pengambilan/setoran uang besar dari laci ke admin. Dipakai bersama
   * `uangBesar` tiap laporan untuk menghitung saldo "Total uang besar" berjalan.
   */
  penarikanUangBesar: PenarikanUangBesar[]
  /**
   * Riwayat penyesuaian uang kecil di laci (tambah/pakai di luar penjualan).
   * Dipakai untuk rekonsiliasi float laci: menjelaskan selisih antara uang kecil
   * di laci dan kembalian yang nyangkut dari laporan sebelumnya.
   */
  penyesuaianUangKecil: PenyesuaianUangKecil[]
  /** Laporan event (Photobooth & Photo Game) — terpisah dari laporanIncome. */
  laporanEvent: LaporanEvent[]
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
  /**
   * Saldo aktual per bulan untuk rekonsiliasi rangkuman akhir bulan, key =
   * `YYYY-MM`. `dompet` = uang tunai fisik yang benar-benar ada di dompet/laci,
   * `rekening` = saldo bank hasil terima QRIS. Dipakai admin untuk mengecek
   * apakah income tunai balance dengan dompet & income QRIS balance dengan
   * rekening (selisih = aktual − income). Disimpan di `app_config.saldo_aktual`
   * (JSONB), pola sama seperti gajiDibayar. Key tidak ada = belum diisi.
   */
  saldoAktual: Record<string, { dompet: number; rekening: number }>
  /**
   * Info pembayaran per slip gaji, key = `${employeeId}::${YYYY-MM}`:
   *  - `metode` : "Pembayaran via" — label bebas (mis. "Transfer Bank", "Tunai").
   *  - `nomor`  : nomor rekening / e-wallet (isian manual karyawan).
   * Murni informatif, ditampilkan di slip termasuk saat di-print. KARYAWAN ikut
   * mengisi field ini untuk slipnya sendiri, jadi disimpan di tabel tersendiri
   * `gaji_pembayaran_via` (satu baris per karyawan+periode, RLS per-orang) —
   * BUKAN di app_config yang admin-only. Disimpan per periode sehingga mengganti
   * data bulan ini tidak mengubah slip bulan sebelumnya. Key tidak ada = belum
   * diisi. Lihat migrasi 0031 & 0032.
   */
  gajiPembayaranVia: Record<string, { metode: string; nomor: string }>
  stokKertas: JenisKertas[]
  /**
   * Stok frame foto (berbagai jenis). Berkurang otomatis saat produk dengan nama
   * yang sama terjual di laporan income. Lihat [JenisFrame].
   */
  stokFrame: JenisFrame[]
  stokTinta: Tinta[]
  stokAmplop: number
  salahCetak: SalahCetak[]
  pengeluaran: Pengeluaran[]
  headerJudul?: string
  headerSub?: string
  incomeJudul?: string
  incomeSub?: string
  brandKicker?: string
  brandName?: string
  dashJudul?: string
  dashSub?: string
  // Preferensi tampilan (fontPair, fontSize, tampilan*) per-perangkat — lihat lib/prefs.tsx.
}
