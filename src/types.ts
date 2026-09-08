import type { Role } from './lib/roles'
export type { Role }

export type Employee = {
  id: string
  nama: string
  jabatan: string
  pinHash: string
  /**
   * Hak akses akun (lihat lib/roles.ts). Pengelola (owner/manager) tidak ikut
   * absen / tidak mengisi laporan income, jadi disaring dari daftar
   * operasional lewat `isPengelola`. Opsional agar data lama tetap
   * kompatibel; anggap `undefined` sebagai karyawan.
   */
  role?: Role
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
 * Jenis hari pada satu kartu absensi. Selain 3 shift kerja, ada 3 hari "tidak
 * dihitung gaji" yang dicatat eksplisit lewat tombol di pemilih shift:
 *  - 'cuti'   : cuti pribadi karyawan. Jatah 2 hari/bulan tidak memotong gaji;
 *               cuti ke-3 dst memotong 1 hari penuh.
 *  - 'libur'  : studio tutup / libur bersama (karyawan terpaksa ikut libur).
 *               Tidak pernah memotong gaji dan tidak memakai jatah cuti.
 *  - 'bersih' : ikut general cleaning sebulan sekali padahal tidak sedang shift.
 *               Kehadiran dicatat sebagai bukti ikut serta, tapi TIDAK menambah
 *               gaji (sudah termasuk gaji bulanan). Cukup ditandai hadir, tanpa
 *               jam masuk/pulang.
 *  - 'pantau' : kehadiran PENGELOLA (owner/manajer) di studio — datang mengecek
 *               karyawan, operasional, dsb. Hanya penanda "kapan ada di studio":
 *               cukup jam datang & pulang, tanpa jadwal shift, tanpa istirahat,
 *               tanpa hitungan telat/lembur, dan TIDAK pernah masuk perhitungan
 *               gaji per jam (pengelola digaji bulanan, bukan per jam).
 */
export type DayType = Shift | 'cuti' | 'libur' | 'bersih' | 'pantau'

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
 * Satu task dalam "closing checklist" yang dikonfigurasi admin (mis. mematikan
 * lampu studio, mengisi laporan keuangan, kirim laporan via WhatsApp). Disimpan
 * di `app_config.closing_checklist`. Urutan array = urutan tampil di modal.
 *
 * `shifts` menentukan di shift mana task ini muncul (pagi/sore/full berbeda
 * karena tugas closing-nya beda). `undefined`/kosong dianggap "semua shift"
 * demi kompatibilitas data lama.
 */
export type ClosingTask = {
  id: string
  label: string
  shifts?: Shift[]
}

/**
 * Bukti satu task closing yang sudah dicentang karyawan saat clock out. Disimpan
 * per hari di `absen_records.checklist_pulang`. `label` disnapshot saat pulang
 * supaya riwayat tetap benar meski admin kelak mengubah/menghapus task-nya.
 */
export type ChecklistPulangItem = {
  id: string
  label: string
  waktu: string
}

/**
 * Task "checklist pagi" (opening) — struktur sama persis dengan {@link ClosingTask},
 * dikonfigurasi admin & disimpan di `app_config.opening_checklist`. Muncul SETELAH
 * absen pagi. Alias supaya intent-nya jelas walau bentuknya identik.
 */
export type OpeningTask = ClosingTask

/**
 * Bukti satu task pagi yang dicentang setelah clock in. Disimpan per hari di
 * `absen_records.checklist_masuk`. Struktur sama dengan {@link ChecklistPulangItem}.
 */
export type ChecklistMasukItem = ChecklistPulangItem

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
  /**
   * Bukti closing checklist yang dicentang saat clock out (audit trail). Hanya
   * terisi untuk clock out real-time yang melewati checklist. `undefined` =
   * hari tanpa checklist (data lama, entri manual, atau checklist belum diatur).
   */
  checklistPulang?: ChecklistPulangItem[]
  /**
   * Bukti checklist pagi yang dicentang setelah clock in (audit trail). NON-blok:
   * jam masuk tetap tercatat walau ini kosong. `undefined` = hari tanpa checklist
   * pagi (data lama, entri manual, checklist belum diatur, atau belum diisi).
   */
  checklistMasuk?: ChecklistMasukItem[]
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

/**
 * Satu setoran uang tunai dari dompet/laci ke rekening bank. Dipakai di
 * rekonsiliasi rangkuman akhir bulan: income tunai yang sudah disetor tidak
 * lagi dianggap ada di dompet, melainkan pindah ke rekening. Per bulan,
 * saldo dompet yang diharapkan = income tunai − Σ setoran, dan saldo rekening
 * yang diharapkan = income QRIS + Σ setoran. `jumlah` selalu > 0 (Rupiah);
 * menghapus baris membatalkan setoran itu. Admin-only.
 */
export type SetoranRekening = {
  id: string
  tanggal: string
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
  /**
   * Sumber dana pengeluaran ini: dibayar dari uang tunai (`cash`, dompet/laci)
   * atau dari `rekening` (transfer/debit bank). Dipakai rekonsiliasi rangkuman
   * untuk memotong saldo yang tepat: dompet berkurang oleh pengeluaran cash,
   * rekening oleh pengeluaran rekening. `undefined` (data lama) dianggap `cash`.
   */
  sumber?: 'cash' | 'rekening'
}

/**
 * Tahap satu program promosi di "Papan Promosi" (kanban marketing).
 * Dua tahap pertama masih rahasia (hanya admin & pengusul); tiga tahap terakhir
 * tampil ke karyawan begitu `status` = 'disetujui'.
 *  - 'ide'        : usulan mentah (draft), belum tentu dijalankan.
 *  - 'rencana'    : sedang direncanakan admin, belum diumumkan.
 *  - 'comingsoon' : akan datang, boleh diumumkan ke karyawan.
 *  - 'berjalan'   : promo sedang aktif.
 *  - 'selesai'    : promo sudah berakhir / diarsipkan.
 */
export type PromoTahap = 'ide' | 'rencana' | 'comingsoon' | 'berjalan' | 'selesai'

/**
 * Status persetujuan satu kartu promosi (pola sama dengan [AbsenStatus]).
 *  - 'menunggu'  : ide yang diusulkan karyawan, belum di-ACC admin. Hanya admin
 *                  & si pengusul yang melihatnya.
 *  - 'disetujui' : kartu resmi milik papan. Kalau tahap-nya sudah tayang
 *                  (comingsoon/berjalan/selesai) ia tampil ke semua karyawan.
 */
export type PromoStatus = 'menunggu' | 'disetujui'

/**
 * Jenis kartu di Papan Promosi:
 *   campaign — program marketing bernama (dihitung untuk KPI "2/bulan")
 *   konten   — unggahan rutin terjadwal (Rabu, akhir pekan)
 *   promo    — potongan harga / penawaran
 */
export type PromoJenis = 'campaign' | 'konten' | 'promo'

/**
 * Tahap produksi satu konten. DIPATOK — sama untuk semua kartu, karena yang
 * dinilai adalah irama produksinya, bukan variasi alurnya. Yang boleh diatur
 * owner hanyalah HARI target tiap tahap, lewat [RitmeKonten].
 */
export type TahapKonten = 'take' | 'edit' | 'tayang'

/**
 * Satu tahap yang sudah dicentang pada sebuah kartu konten.
 *
 * `selesaiPada` DISTEMPEL DATABASE (trigger `promo_stamp_tahapan`, migration
 * 0051), bukan diisi dari layar — tanpa itu, tahap yang dicentang menyusul tak
 * terbedakan dari yang dikerjakan tepat waktu. Read-only bagi client: kirim
 * `kunci` (+ `oleh`) saja, tanggalnya diisi server.
 */
export type TahapanKartu = {
  kunci: TahapKonten
  /** `YYYY-MM-DD`. Diisi server. */
  selesaiPada?: string
  /** Yang mengerjakan — `profiles.id` ATAU nama bebas, seperti [SosmedHarian]. */
  oleh?: string
}

/**
 * Kontrak ritme konten mingguan antara owner & manajer. Satu objek untuk
 * seluruh aplikasi (bukan per bulan), disimpan di `app_config.ritme_konten`
 * (migration 0051).
 *
 * Diisi SEKALI, bukan tiap minggu: begitu ritme berdiri, owner tidak perlu
 * lagi bilang "minggu ini bikin konten" — diam berarti tetap jalan.
 *
 * Seperti [TargetBulanan], selama `disetujui` belum true angka yang lahir dari
 * ritme ini hanya simulasi dan tidak boleh dipakai menilai orang.
 */
export type RitmeKonten = {
  /** Berapa konten yang harus tayang tiap minggu. Ini yang melahirkan slot. */
  jumlah: number
  /** Hari target tiap tahap. 1 = Senin … 7 = Minggu. */
  hari: Record<TahapKonten, number>
  disetujui?: boolean
  /** ISO timestamp saat owner menyetujui. */
  disetujuiPada?: string
}

/**
 * Satu program promosi. Visibilitas ke karyawan diturunkan dari `tahap` + `status`
 * (bukan kolom terpisah): tampil kalau `status='disetujui'` dan tahap termasuk
 * comingsoon/berjalan/selesai, atau kalau kartu itu milik karyawan sendiri.
 * Dikuatkan di sisi server lewat RLS (migration 0035).
 */
export type PromoProgram = {
  id: string
  judul: string
  deskripsi: string
  tahap: PromoTahap
  status: PromoStatus
  /** Periode promo (opsional untuk ide/rencana). Format YYYY-MM-DD. */
  tanggalMulai?: string
  tanggalSelesai?: string
  /**
   * Apa kartu ini sebenarnya. Memisahkan konten rutin (posting Rabu/akhir
   * pekan) dari campaign besar, sehingga KPI "2 campaign/bulan" tidak
   * terpenuhi hanya oleh unggahan harian. Lihat migration 0046.
   */
  jenis?: PromoJenis
  /**
   * Operator yang ditugaskan mengerjakan (profiles.id). Dasar perhitungan
   * bonus marketing — lihat `kontribusiKonten()` di manajemen.ts.
   */
  pic?: string
  /** Batas waktu penyelesaian. Format YYYY-MM-DD. */
  deadline?: string
  /**
   * Tanggal kartu benar-benar masuk tahap 'selesai'. DISTEMPEL DATABASE
   * (trigger `promo_stamp_selesai`, migration 0046), bukan diisi dari layar —
   * inilah satu-satunya bukti ketepatan waktu terhadap `deadline`.
   * Read-only bagi client.
   */
  selesaiPada?: string
  /**
   * Centang tahap produksi (take → edit → tayang) untuk kartu berjenis
   * 'konten'. Dasar papan "Denyut Mingguan" di Dashboard Manajemen. Lihat
   * [TahapanKartu] & migration 0051.
   */
  tahapan?: TahapanKartu[]
  /** Pengusul / pembuat (profiles.id). Distempel otomatis saat insert. */
  dibuatOleh?: string
  /**
   * Kapan kartu ini dibuat (`created_at`, ISO). Dipakai Dashboard Manajemen
   * untuk menghitung KPI "ide & campaign baru bulan ini" — sebuah ide sering
   * belum punya tanggalMulai, jadi tanggal masuk papan-lah penandanya.
   */
  createdAt?: string
  /**
   * Desain promo untuk sosial media (data URL JPEG, di-resize di client).
   * Diunggah admin; karyawan yang bisa melihat promo dapat mengunduhnya untuk
   * diposting. `undefined` = belum ada desain. Lihat migration 0036.
   */
  desain?: string
}

/**
 * Satu sel roster: siapa dijadwalkan apa pada tanggal berapa.
 *
 * Ini RENCANA, sedangkan [AbsenHari] adalah REALISASI. Keduanya memakai
 * [DayType] yang sama supaya bisa dibandingkan langsung — dari situ muncul
 * "dijadwalkan tapi tidak masuk" dan "masuk tidak sesuai jadwal".
 * Disimpan di tabel `jadwal_shift` (migration 0044), kunci (tanggal, employeeId).
 */
export type JadwalShift = {
  /** Format `YYYY-MM-DD`. */
  tanggal: string
  employeeId: string
  shift: DayType
  catatan?: string
}

/**
 * Tahap pipeline sales, urut dari paling awal.
 *
 * `closing` & `gagal` adalah tahap AKHIR — keduanya keluar dari pipeline aktif
 * dan itulah yang membuat angka konversi bisa dihitung.
 */
export type LeadTahap =
  | 'baru'
  | 'dihubungi'
  | 'followup'
  | 'negosiasi'
  | 'closing'
  | 'gagal'

/** Jenis jasa/segmen yang dikejar. Mengikuti daftar target di brief manajer. */
export type LeadKategori =
  | 'play'
  | 'photobooth'
  | 'sekolah'
  | 'kampus'
  | 'komunitas'
  | 'perusahaan'
  | 'lainnya'

/**
 * Satu calon klien yang sedang dikejar — keadaan TERKINI-nya.
 * Riwayat kontaknya ada di [LeadFollowup]. Lihat migration 0047.
 */
export type Lead = {
  id: string
  /** Nama calon klien / instansi. */
  nama: string
  kontak: string
  /** Dari mana lead ini datang (DM Instagram, walk-in, referral, ...). */
  sumber: string
  kategori: LeadKategori
  tahap: LeadTahap
  /** Perkiraan nilai selama masih dikejar. */
  nilaiEstimasi: number
  /** Nilai sebenarnya setelah closing. */
  nilaiRealisasi: number
  /** Siapa yang mengejar (profiles.id) — dasar bonus event. */
  pic?: string
  /** Format `YYYY-MM-DD`. */
  tanggalMasuk: string
  /**
   * Tanggal lead ini benar-benar closing. DISTEMPEL DATABASE (trigger
   * `leads_stamp_closing`, migration 0047), bukan diisi dari layar — ia dasar
   * perhitungan bonus. Read-only bagi client.
   */
  tanggalClosing?: string
  alasanGagal?: string
  catatan?: string
  dibuatOleh?: string
}

/** Satu catatan follow-up pada sebuah lead. Lihat migration 0047. */
export type LeadFollowup = {
  id: string
  leadId: string
  /** Format `YYYY-MM-DD`. */
  tanggal: string
  catatan: string
  oleh?: string
}

/**
 * Apa yang diajukan sekolah/instansi.
 *  - 'sponsorship' : minta dukungan untuk satu acara (uang/voucher/booth).
 *  - 'mou'         : kerja sama berjangka, tanpa permintaan dana.
 *  - 'keduanya'    : MoU payung yang sekaligus mensponsori sebuah acara.
 */
export type KemitraanJenis = 'sponsorship' | 'mou' | 'keduanya'

/**
 * Status satu pengajuan, urut dari masuk sampai tuntas.
 *
 * 'disetujui' & 'ditolak' adalah KEPUTUSAN (tanggalnya distempel database);
 * 'selesai' berarti kewajiban kedua pihak sudah beres — sponsor dibayar dan
 * imbalannya sudah diterima — jadi kartunya boleh berhenti dipantau.
 */
export type KemitraanStatus =
  | 'masuk'
  | 'ditinjau'
  | 'disetujui'
  | 'ditolak'
  | 'selesai'

/** Wujud sponsor yang diberikan — tidak semuanya berupa uang tunai. */
export type KemitraanBentuk =
  | 'uang'
  | 'voucher'
  | 'produk'
  | 'booth'
  | 'jasa'
  | 'lainnya'

/**
 * Satu butir timbal balik yang dijanjikan untuk Kubik (logo di banner, booth
 * di acara, post Instagram sekolah, ...) beserta centang sudah terpenuhi atau
 * belum. Disimpan sebagai jsonb di `kemitraan.imbalan` — pola yang sama dengan
 * `promoPrograms.tahapan`, karena butirnya sedikit dan selalu dibaca bersama
 * induknya.
 */
export type KemitraanImbalan = {
  id: string
  teks: string
  selesai: boolean
}

/**
 * Satu pengajuan MoU / sponsorship yang masuk dari sekolah atau instansi.
 * Lihat migration 0053.
 *
 * Sengaja TERPISAH dari [Lead] walau sama-sama pipeline: lead dikejar supaya
 * Kubik dapat uang, sponsorship yang disetujui membuat Kubik keluar uang.
 * Mencampurnya akan membuat KPI sales mengaku mengejar order padahal beban.
 */
export type Kemitraan = {
  id: string
  /** Sekolah / instansi yang mengajukan. */
  instansi: string
  jenis: KemitraanJenis
  /** Orang yang menghubungi: ketua panitia, guru pembina, kesiswaan. */
  kontakNama: string
  kontak: string
  /** Nama kegiatan yang disponsori; kosong untuk MoU payung. */
  acara: string
  /** Format `YYYY-MM-DD`. */
  tanggalAcara?: string
  /** Format `YYYY-MM-DD`. */
  tanggalMasuk: string
  status: KemitraanStatus
  /** Isi proposalnya, apa adanya. */
  permintaan: string
  /** Nilai yang diminta di proposal. */
  nilaiDiminta: number
  /** Nilai yang akhirnya disetujui — selisihnya hasil negosiasi manajer. */
  nilaiDisetujui: number
  bentuk: KemitraanBentuk
  /** Timbal balik untuk Kubik. Lihat [KemitraanImbalan]. */
  imbalan: KemitraanImbalan[]
  /** Masa berlaku MoU (`YYYY-MM-DD`). Kosong untuk sponsorship sekali jalan. */
  mouMulai?: string
  mouBerakhir?: string
  alasanTolak?: string
  catatan?: string
  /** Siapa yang menangani pengajuan ini (profiles.id). */
  pic?: string
  /**
   * Tanggal pengajuan diputuskan (disetujui/ditolak). DISTEMPEL DATABASE
   * (trigger `kemitraan_stamp_keputusan`, migration 0053) — ia bukti kecepatan
   * respons, jadi read-only bagi client.
   */
  tanggalKeputusan?: string
  /**
   * Baris `pengeluaran` yang mencatat sponsor ini saat dibayar. Kosong = belum
   * dibayar. Disimpan supaya uangnya masuk laporan keuangan tepat sekali dan
   * bisa ditarik lagi kalau salah catat.
   */
  pengeluaranId?: string
  dibuatOleh?: string
}

/**
 * Catatan aktivitas sosial media SATU HARI.
 *
 * Satuannya sengaja hari, bukan unggahan: KPI-nya adalah "aktif setiap hari",
 * jadi yang perlu terjawab satu lookup adalah "tanggal ini sudah dikerjakan
 * belum?" — dan hari bolong otomatis terlihat sebagai tanggal yang hilang.
 * Disimpan di tabel `sosmed_harian` (migration 0046), kunci `tanggal`.
 */
export type SosmedHarian = {
  /** Format `YYYY-MM-DD`. Sekaligus kunci primer. */
  tanggal: string
  posting: boolean
  story: boolean
  repost: boolean
  /** Membalas komentar / berinteraksi dengan akun lain. */
  engagement: boolean
  catatan?: string
  /** Tautan ke unggahannya (opsional, untuk verifikasi). */
  tautan?: string
  /**
   * Entri profil PERTAMA dari `olehList` — cermin kolom lama `sosmed_harian.oleh`
   * (uuid ber-foreign-key). Jangan dibaca langsung: pakai `pengerjaSosmed()`
   * di manajemen.ts supaya data lama & baru terbaca sama.
   */
  oleh?: string
  /**
   * Semua yang mengerjakan hari itu. Tiap entri boleh berupa `profiles.id`
   * ATAU nama bebas (freelancer/anak magang yang tidak punya akun) — sebuah
   * hari sosmed sering dikerjakan berdua, dan memaksa semuanya punya akun akan
   * membuat orang berhenti mencatat. Lihat migration 0049.
   */
  olehList?: string[]
}

/**
 * Target bulanan manajer — pembanding untuk KPI Scorecard di Dashboard
 * Manajemen. Satu objek per periode `YYYY-MM`, disimpan di
 * `app_config.target_bulanan` (migration 0043).
 *
 * Semua angka adalah target SATU BULAN PENUH. Untuk bulan yang masih berjalan,
 * scorecard membandingkannya secara proporsional terhadap hari yang sudah lewat
 * (lihat `skorKPI` di manajemen.ts) supaya tanggal 5 tidak selalu terbaca
 * "tertinggal".
 */
export type TargetBulanan = {
  /** Omzet total (studio + event) dalam rupiah. */
  omzet: number
  /** Jumlah tiket terjual — KPI utama, patokannya 2x baseline. */
  tiket: number
  /** Jumlah event terlaksana (photobooth + photo game). */
  event: number
  /** Leads baru yang masuk pipeline. */
  leads: number
  /** Lead yang berhasil ditutup jadi order bulan ini. */
  closing: number
  /** Campaign/promo yang benar-benar DIEKSEKUSI (tahap berjalan/selesai). */
  campaign: number
  /** Ide baru yang masuk papan promosi. */
  ide: number
  /** Jumlah hari sosial media aktif (posting/story/repost/engagement). */
  sosmedHari: number
  /** Kepatuhan checklist pagi & closing, 0-1. */
  kepatuhan: number
  /** Cakupan jadwal shift, 0-1. */
  shiftCover: number
  /**
   * Porsi item "Butuh Tindakan" yang ditutup manajer SENDIRI (bukan owner),
   * 0-1. Inilah ukuran kemandirian: makin tinggi, makin sedikit owner turun
   * tangan. Lihat [EskalasiOwner].
   */
  mandiri: number
  /** Penilaian kualitatif owner saat evaluasi, skala 1-5. */
  penilaian: number
  /**
   * true = target periode ini sudah DISETUJUI owner. Sebelum disetujui,
   * scorecard tetap dihitung tapi ditandai "simulasi" — angka saran otomatis
   * belum boleh dipakai menilai orang.
   */
  disetujui?: boolean
  /** Kapan disetujui (ISO). Hanya jejak, tidak dipakai berhitung. */
  disetujuiPada?: string
}

/**
 * Penilaian kualitatif owner atas manajer untuk satu periode `YYYY-MM`.
 *
 * Satu-satunya KPI yang TIDAK bisa diturunkan dari data: kepemimpinan,
 * inisiatif, cara mengambil keputusan. Diisi manual saat evaluasi bulanan.
 * Disimpan di `app_config.penilaian_owner` (migration 0048).
 */
export type PenilaianOwner = {
  /** Skala 1-5. */
  nilai: number
  catatan?: string
  /** Kapan diisi (ISO). */
  diisiPada?: string
}

/**
 * Satu item antrean "Butuh Tindakan" yang sudah ditutup — beserta SIAPA yang
 * menutupnya.
 *
 * Gunanya satu: mengukur ketergantungan pada owner. Kalau tiap bulan makin
 * banyak item yang harus ditutup owner, manajer belum benar-benar memegang
 * kendali; angka itulah KPI kelompok Kepemimpinan.
 * Disimpan di `app_config.eskalasi_owner` (migration 0048).
 */
export type EskalasiOwner = {
  id: string
  /** Format `YYYY-MM-DD` — periode penilaian diambil dari sini. */
  tanggal: string
  /** Label antrean yang ditutup, mis. "Leads menunggu di-follow-up". */
  label: string
  /** Siapa yang benar-benar menyelesaikannya. */
  oleh: 'manager' | 'owner'
  /** Alasan eskalasi (opsional, 1 tap tanpa alasan tetap sah). */
  catatan?: string
  /** Akun yang mencatat (profiles.id). */
  dicatatOleh?: string
}

/**
 * Status satu hari menurut laporan closing manajer.
 *
 * Tiga, bukan dua: "kendala" yang sudah beres sendiri adalah kabar BAIK —
 * itulah bukti manajer memegang kendali — sedangkan "eskalasi" adalah hari
 * yang benar-benar memakan waktu owner. Menggabungkan keduanya jadi "ada
 * masalah" akan menghukum manajer justru saat ia bekerja dengan benar.
 */
export type StatusLaporanHarian = 'aman' | 'kendala' | 'eskalasi'

/**
 * Laporan closing harian yang ditulis manajer dengan tangan.
 *
 * Isinya sengaja tidak terstruktur: yang dicatat di sini justru kejadian yang
 * TIDAK punya tempat di tabel mana pun — printer macet lalu di-head cleaning,
 * pelanggan komplain lalu diredakan, operator tukar shift dadakan. Begitu
 * sesuatu cukup sering muncul sampai layak punya kolom sendiri, pindahkan ke
 * fitur yang tepat; jangan menumbuhkan formulir di sini.
 *
 * Satu baris per tanggal. Disimpan di tabel `laporan_harian` (migration 0052).
 */
export type LaporanHarian = {
  /** Format `YYYY-MM-DD`. Sekaligus kunci primer. */
  tanggal: string
  status: StatusLaporanHarian
  catatan: string
  /** Penulisnya (`profiles.id`) — biasanya manajer, kadang owner. */
  oleh?: string
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
  /**
   * Daftar task closing yang wajib dicentang karyawan sebelum clock out.
   * Dikonfigurasi admin di Pengaturan, disimpan di `app_config.closing_checklist`.
   * Array kosong = fitur nonaktif (clock out langsung tanpa checklist).
   */
  closingChecklist: ClosingTask[]
  /**
   * Daftar task checklist pagi yang muncul SETELAH karyawan clock in. Berbeda dari
   * closing: TIDAK memblokir absen — hanya pengingat + audit trail. Dikonfigurasi
   * admin di Pengaturan, disimpan di `app_config.opening_checklist`. Array kosong
   * = fitur nonaktif.
   */
  openingChecklist: OpeningTask[]
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
   * Riwayat setoran uang tunai ke rekening. Dipakai rekonsiliasi rangkuman
   * akhir bulan agar income tunai yang sudah disetor pindah ke sisi rekening
   * (tidak lagi terbaca sebagai cash di dompet). Disimpan di
   * `app_config.setoran_rekening` (JSONB array). Lihat [SetoranRekening].
   */
  setoranRekening: SetoranRekening[]
  /**
   * Saldo awal (opening balance) dompet & rekening saat sistem MULAI mencatat —
   * kas/uang yang sudah ada dari penjualan sebelum sistem dibangun. Dipakai
   * rekonsiliasi rangkuman yang dihitung KUMULATIF: saldo rekening seharusnya =
   * saldoAwal.rekening + Σ QRIS + Σ setoran (s/d bulan terpilih); dompet =
   * saldoAwal.dompet + Σ tunai − Σ setoran. Diisi sekali. Disimpan di
   * `app_config.saldo_awal` (JSONB). Default 0/0 = belum diisi.
   */
  saldoAwal: { dompet: number; rekening: number }
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
  /** Papan Promosi (kanban marketing). Lihat [PromoProgram] & migration 0035. */
  promoPrograms: PromoProgram[]
  /**
   * Target KPI manajer per periode `YYYY-MM`. Disimpan di
   * `app_config.target_bulanan` (JSONB), pola sama seperti saldoAktual.
   * Key tidak ada = belum diisi; dashboard memakai `saranTarget()` sebagai
   * angka sementara. Lihat [TargetBulanan] & migration 0043.
   */
  targetBulanan: Record<string, TargetBulanan>
  /**
   * Roster shift yang direncanakan. Lihat [JadwalShift] & migration 0044.
   * Kosong = jadwal belum disusun (KPI cakupan shift ikut nonaktif).
   */
  jadwalShift: JadwalShift[]
  /**
   * Penilaian owner per periode `YYYY-MM` (kelompok KPI Kepemimpinan).
   * Disimpan di `app_config.penilaian_owner`. Key tidak ada = belum dinilai,
   * dan KPI-nya ikut nonaktif (bukan dihitung nol).
   */
  penilaianOwner: Record<string, PenilaianOwner>
  /**
   * Log penutupan antrean "Butuh Tindakan" — dasar KPI ketergantungan owner.
   * Kosong = belum pernah dipakai (KPI kemandirian ikut nonaktif).
   */
  eskalasiOwner: EskalasiOwner[]
  /**
   * Kontrak ritme konten mingguan. Lihat [RitmeKonten] & migration 0051.
   * `undefined` = ritme belum diatur (papan Denyut Mingguan & KPI-nya ikut
   * nonaktif, bukan dinilai nol).
   */
  ritmeKonten?: RitmeKonten
  /**
   * Log aktivitas sosial media harian. Lihat [SosmedHarian] & migration 0046.
   * Kosong = belum pernah dicatat (KPI sosmed & engagement ikut nonaktif).
   */
  sosmedHarian: SosmedHarian[]
  /**
   * Laporan closing harian manajer. Lihat [LaporanHarian] & migration 0052.
   * Opsional supaya app tetap naik sebelum migrasinya dijalankan.
   */
  laporanHarian: LaporanHarian[]
  /**
   * Pipeline calon klien. Lihat [Lead] & migration 0047. Kosong = pipeline
   * belum dipakai (KPI leads ikut nonaktif).
   */
  leads: Lead[]
  /** Riwayat follow-up seluruh lead. Lihat [LeadFollowup]. */
  leadsFollowup: LeadFollowup[]
  /**
   * Pengajuan MoU & sponsorship yang masuk. Lihat [Kemitraan] & migration 0053.
   * Kosong = belum ada pengajuan yang dicatat.
   */
  kemitraan: Kemitraan[]
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
