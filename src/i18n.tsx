import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'id' | 'en'

const STORAGE_KEY = 'kubik-lang'

type Dict = Record<string, string>

const ID: Dict = {
  // Sidebar / nav
  'nav.dashboard': 'Dashboard',
  'nav.absensi': 'Absensi',
  'nav.laporan': 'Laporan Income',
  'nav.inventaris': 'Inventaris',
  'nav.pengeluaran': 'Pengeluaran',
  'nav.pengaturan': 'Pengaturan',
  'nav.logout': 'Keluar',
  // Sidebar groups
  'side.group.Utama': 'Utama',
  'side.group.Operasional': 'Operasional',
  'side.group.Keuangan': 'Studio',
  'side.group.Event': 'Event',
  'side.group.Sistem': 'Sistem',
  // Sidebar items
  'side.landing': 'Dashboard',
  'side.absensi': 'Presensi Karyawan',
  'side.profil': 'Profil Karyawan',
  'side.inventaris': 'Inventaris & Stok',
  'side.laporan': 'Pemasukan',
  'side.event-photobooth': 'Photobooth',
  'side.event-game': 'Photo Game',
  'side.pengeluaran': 'Pengeluaran',
  'side.gaji': 'Gaji Karyawan',
  'side.pengaturan': 'Pengaturan',
  // Sidebar account
  'side.role.admin': '🛡️ Admin',
  'side.role.karyawan': '👤 Karyawan',
  // Page meta
  'page.landing.title': 'Dashboard',
  'page.landing.sub': 'Ringkasan operasional studio hari ini',
  'page.absensi.title': 'Presensi Karyawan',
  'page.absensi.sub': 'Catat clock-in & clock-out per karyawan',
  'page.absen.title': 'Detail Absensi',
  'page.absen.sub': 'Catat event harian & ringkasan jam kerja',
  'page.riwayat.title': 'Riwayat Absensi',
  'page.riwayat.sub': 'Histori catatan absen per karyawan',
  'page.profil.title': 'Profil Karyawan',
  'page.profil.sub': 'Ringkasan kehadiran, jam kerja & penjualan tiap karyawan',
  'page.laporan.title': 'Laporan Pemasukan Harian',
  'page.laporan.sub': 'Penjualan Photobooth, Photobox, Photo Game & upgrade',
  'page.event-photobooth.title': 'Event · Photobooth',
  'page.event-photobooth.sub': 'Laporan Photobooth — sewa per jam & per voucher',
  'page.event-game.title': 'Event · Photo Game',
  'page.event-game.sub': 'Laporan Photo Game — sewa per jam & per voucher',
  'page.inventaris.title': 'Inventaris & Stok',
  'page.inventaris.sub': 'Kertas, tinta, amplop, dan catatan salah cetak',
  'page.pengeluaran.title': 'Pengeluaran Studio',
  'page.pengeluaran.sub': 'Catat belanja & biaya operasional',
  'page.gaji.title': 'Gaji Karyawan',
  'page.gaji.sub': 'Slip gaji bulanan: gaji pokok, bonus penjualan, lembur & potongan',
  'page.pengaturan.title': 'Pengaturan',
  'page.pengaturan.sub': 'Atur tema, font, ukuran teks, dan teks tampilan',
  // Settings - language
  'set.language.title': 'Bahasa',
  'set.language.sub': 'Pilih bahasa tampilan aplikasi.',
  'set.language.label': 'Bahasa aplikasi',
  'set.language.id': 'Indonesia',
  'set.language.en': 'Inggris',
  'set.language.changed': 'Bahasa diubah ke Indonesia',
  // ===== Laporan Income =====
  'inc.aturHarga': 'Atur Item & Harga',
  // Atur item & harga
  'inc.cat.layanan': '📸 Layanan (tiket + cetak)',
  'inc.cat.ikon': 'Ikon',
  'inc.cat.namaLayanan': 'Nama layanan',
  'inc.cat.hargaTiket': 'Harga tiket',
  'inc.cat.hapusLayanan': 'Hapus layanan',
  'inc.cat.tambahLayanan': 'Tambah layanan',
  'inc.cat.hargaCetak': '(+) Harga Cetak (Rp) — berlaku untuk semua layanan',
  'inc.cat.upgrade': '🎁 Upgrade cetak (qty)',
  'inc.cat.namaUpgrade': 'Nama upgrade',
  'inc.cat.hargaItem': 'Harga / item',
  'inc.cat.hargaUpgrade': 'Harga upgrade',
  'inc.cat.hapusUpgrade': 'Hapus upgrade',
  'inc.cat.tambahUpgrade': 'Tambah upgrade',
  'inc.cat.produk': '🛍️ Produk (qty) — merchandise & lainnya',
  'inc.cat.namaProdukPh': 'Nama produk (cth: Frame foto, T-shirt)',
  'inc.cat.namaProduk': 'Nama produk',
  'inc.cat.hargaProduk': 'Harga produk',
  'inc.cat.hapusProduk': 'Hapus produk',
  'inc.cat.tambahProduk': 'Tambah produk',
  'inc.cat.simpan': 'Simpan',
  'inc.cat.batal': 'Batal',
  'inc.cat.hint': '⚠️ Item & harga ini berlaku untuk laporan baru. Laporan lama tetap pakai harga saat dibuat (snapshot).',
  'inc.cat.saved': 'Item & harga diperbarui',
  // Hero stats
  'inc.stat.hariIni': 'Hari ini',
  'inc.stat.minggu': '7 hari terakhir',
  'inc.stat.rata': 'Rata-rata / hari',
  'inc.stat.bulan': 'Bulan ini ({n} hari)',

  'inc.rekap.title': '🧾 Rangkuman Akhir Bulan',
  'inc.rekap.sub': 'Ringkasan keuangan {bulan} — hanya terlihat oleh admin',
  'inc.rekap.periode': 'Periode',
  'inc.rekap.tunai': 'Income Tunai',
  'inc.rekap.qris': 'Income QRIS',
  'inc.rekap.pemasukan': 'Total Pemasukan',
  'inc.rekap.gaji': 'Pengeluaran Gaji',
  'inc.rekap.lain': 'Pengeluaran Lain-lain',
  'inc.rekap.bersih': 'Bersih',
  'inc.rekap.rekonTitle': 'Cek saldo — dompet & rekening',
  'inc.rekap.dompet': 'Saldo dompet (aktual)',
  'inc.rekap.rekening': 'Saldo rekening (aktual)',
  'inc.rekap.balance': '✓ Balance dengan income',
  'inc.rekap.selisih': 'Selisih {rp}',
  'inc.rekap.hint':
    'Tunai + QRIS diambil dari metode pembayaran tiap laporan; gaji dihitung dari slip semua karyawan bulan ini; lain-lain dari halaman Pengeluaran. Isi saldo dompet & rekening yang sebenarnya untuk mengecek: dompet dibandingkan income tunai, rekening dibandingkan income QRIS (selisih = aktual − income).',
  // Uang besar / kecil bar
  'inc.ub.label': '💰 Total uang besar di laci',
  'inc.ub.hint': 'bertambah otomatis dari uang besar tiap laporan',
  'inc.ub.ambil': 'Ambil / Setor ke admin',
  'inc.uk.label': '🪙 Penyesuaian uang kecil bulan ini',
  'inc.uk.hint': 'tambah / pakai uang kecil agar float laci antar hari tetap cocok',
  'inc.uk.tambahPakai': 'Tambah / Pakai',
  // Daftar laporan
  'inc.list.title': 'Daftar Laporan',
  'inc.list.unduh': 'Unduh CSV',
  'inc.list.tambah': 'Tambah Laporan',
  'inc.empty.title': 'Belum ada laporan income',
  'inc.empty.sub': 'Klik "Tambah Laporan" untuk mulai mencatat penjualan harian.',
  // Toast & konfirmasi
  'inc.toast.simpan': 'Laporan {tgl} disimpan',
  'inc.toast.stokKurang': 'Stok tidak cukup — sebagian dipotong sampai 0',
  'inc.toast.hapus': 'Laporan {tgl} dihapus',
  'inc.confirm.timpa': 'Sudah ada laporan tanggal {tgl}. Timpa dengan data baru?',
  'inc.confirm.hapus': 'Hapus laporan tanggal {tgl}? Stok dikembalikan.',
  'inc.toast.ukTambah': 'Tambah uang kecil {rp} dicatat',
  'inc.toast.ukPakai': 'Pakai uang kecil {rp} dicatat',
  'inc.toast.ukHapus': 'Penyesuaian dihapus, float dikembalikan',
  'inc.toast.ubAmbil': 'Uang besar {rp} diambil',
  'inc.toast.ubHapus': 'Riwayat pengambilan dihapus, saldo dikembalikan',
  // Modal ambil uang besar
  'inc.ambil.title': 'Ambil / Setor Uang Besar',
  'inc.ambil.sub': 'Mengurangi total uang besar di laci',
  'inc.ambil.total': 'Total uang besar di laci',
  'inc.ambil.jumlah': '💵 Jumlah diambil (Rp)',
  'inc.ambil.semua': 'Ambil semua',
  'inc.ambil.maks': 'Tidak bisa melebihi saldo {rp}.',
  'inc.field.tanggal': '📅 Tanggal',
  'inc.field.catatan': '📝 Catatan (opsional)',
  'inc.ambil.catatanPh': 'mis. disetor ke admin',
  'inc.ambil.catat': 'Catat pengambilan',
  'inc.ambil.riwayat': '🧾 Riwayat pengambilan',
  'inc.ambil.hapusRiwayat': 'Hapus riwayat',
  'inc.ambil.hapusSaldo': 'Hapus & kembalikan saldo',
  // Modal penyesuaian uang kecil
  'inc.peny.title': 'Penyesuaian Uang Kecil',
  'inc.peny.sub': 'Tambah / pakai uang kecil di laci',
  'inc.peny.net': 'Net penyesuaian uang kecil bulan ini',
  'inc.peny.jenis': 'Jenis',
  'inc.peny.tambah': '➕ Tambah',
  'inc.peny.pakai': '➖ Pakai',
  'inc.peny.jumlahTambah': '🪙 Jumlah ditambah (Rp)',
  'inc.peny.jumlahPakai': '🪙 Jumlah dipakai (Rp)',
  'inc.peny.catatanTambahPh': 'mis. tukar pecahan',
  'inc.peny.catatanPakaiPh': 'mis. beli galon',
  'inc.peny.hint': 'Penyesuaian pada tanggal ini tidak mengubah laporan tanggal itu sendiri (uang kecilnya sudah dihitung), melainkan float yang dibawa ke laporan berikutnya.',
  'inc.peny.catatTambah': 'Catat penambahan',
  'inc.peny.catatPakai': 'Catat pemakaian',
  'inc.peny.riwayat': '🧾 Riwayat penyesuaian',
  'inc.peny.hapusFloat': 'Hapus & kembalikan float',
  // Kartu laporan
  'inc.card.hapus': 'Hapus laporan',
  'inc.card.tiket': 'tiket',
  'inc.card.cetak': 'cetak',
  'inc.card.upgrade': 'upgrade',
  'inc.card.produk': 'produk',
  'inc.card.item': 'item',
  'inc.card.totalIncome': 'Total income',
  'inc.card.cetakRow': '🖨️ (+) Cetak',
  'inc.card.potongan': '🏷️ Potongan harga',
  'inc.card.diskon': 'diskon',
  'inc.card.catatan': 'Catatan:',
  'inc.card.tunai': '💵 Tunai',
  'inc.card.qris': '📱 QRIS',
  'inc.card.bayarVia': 'bayar via',
  'inc.card.uangBesar': '💰 Uang besar',
  'inc.card.uangKecil': '🪙 Uang kecil',
  'inc.card.diLaci': 'di laci',
  'inc.card.balance': '🟢 LAPORAN BALANCE',
  'inc.card.notBalance': '🔴 LAPORAN TIDAK BALANCE',
  'inc.card.edit': 'Edit',
  'inc.card.print': 'Print',
  // Kalender
  'inc.kal.cetak': 'Cetak',
  'inc.kal.bulanPrev': 'Bulan sebelumnya',
  'inc.kal.bulanNext': 'Bulan berikutnya',
  'inc.kal.adaCatatan': 'Ada catatan',
  'inc.kal.klikBuka': 'Klik untuk laporan lengkap →',
  'inc.kal.tapBuka': 'Tap lagi untuk laporan lengkap →',
  'inc.kal.totalBulan': 'Total bulan ini',
  'inc.kal.hari': 'hari',
  'inc.kal.hariAda': 'Hari ada laporan',
  'inc.kal.tertinggi': 'Hari tertinggi',
  'inc.kal.kosongBulan': 'Belum ada laporan di {bulan}.',
  'inc.hari.min': 'Min',
  'inc.hari.sen': 'Sen',
  'inc.hari.sel': 'Sel',
  'inc.hari.rab': 'Rab',
  'inc.hari.kam': 'Kam',
  'inc.hari.jum': 'Jum',
  'inc.hari.sab': 'Sab',
  // ===== Form input laporan (IncomeEntryModal) =====
  'ie.title.edit': 'Edit Laporan Income',
  'ie.title.add': 'Tambah Laporan Income',
  'ie.tanggal': 'Tanggal',
  'ie.noEmployee': 'Belum ada karyawan. Tambahkan dulu di menu Presensi Karyawan supaya bisa input penjualan per karyawan.',
  // Section titles
  'ie.sec.layanan': 'Layanan (tiket & cetak)',
  'ie.sec.upgrade': 'Upgrade Cetak',
  'ie.sec.produk': 'Produk / Frame',
  'ie.sec.stok': 'Pemakaian Stok',
  'ie.sec.lain': 'Potongan harga & catatan',
  'ie.sec.bayar': 'Pembayaran via',
  'ie.sec.kasir': 'Uang Tunai di Kasir',
  // Summaries
  'ie.sum.ketuk': 'Ketuk untuk isi',
  'ie.sum.stokAuto': 'Otomatis dari tiket & produk',
  'ie.sum.opsional': 'Opsional',
  'ie.sum.adaCatatan': 'ada catatan',
  'ie.sum.diskon': 'diskon {rp}',
  'ie.sum.tunai': 'tunai {rp}',
  'ie.sum.qris': 'QRIS {rp}',
  'ie.sum.balance': 'BALANCE',
  'ie.sum.notBalance': 'TIDAK BALANCE',
  'ie.sum.lembarKertas': '{n} lembar kertas',
  'ie.sum.amplop': '{n} amplop',
  'ie.sum.frame': '{n} frame',
  // unit words
  'ie.unit.item': 'item',
  'ie.unit.tiket': 'tiket',
  'ie.unit.lembar': 'lembar',
  'ie.unit.buah': 'buah',
  'ie.unit.stok': 'stok',
  // Stok section
  'ie.stok.hint': 'Tiket & tambahan cetak memotong kertas; tiap tiket dapat 1 amplop. Upgrade (Poster / Crack n Share) tidak pakai amplop. Produk yang namanya sama dengan jenis frame memotong stok frame. Stok berkurang otomatis saat laporan disimpan.',
  'ie.stok.noKertas': 'Belum ada jenis kertas (selain kertas upgrade) di Inventaris. Tambahkan dulu supaya stok kertas bisa berkurang otomatis.',
  'ie.stok.jenisKertasAuto': 'Jenis kertas (untuk {n} lembar tiket & cetak)',
  'ie.stok.pakaiBeberapa': '+ Pakai beberapa jenis kertas',
  'ie.stok.pemakaianKertas': 'Pemakaian kertas (tiket + cetak = {n} lembar)',
  'ie.stok.pilihKertas': '— pilih kertas —',
  'ie.stok.hapusBaris': 'Hapus baris',
  'ie.stok.tambahKertas': '+ jenis kertas',
  'ie.stok.pakaiSatu': 'Pakai 1 kertas saja',
  'ie.stok.dialokasikan': 'Dialokasikan {n} dari {m} lembar',
  'ie.stok.sisa': ' · sisa {n} belum dialokasikan',
  'ie.stok.kelebihan': ' · kelebihan {n}',
  'ie.stok.amplopTerpakai': 'Amplop terpakai',
  'ie.stok.amplopAuto': '(otomatis = {n} tiket)',
  'ie.stok.ikutiTiket': 'Ikuti tiket',
  'ie.stok.amplopHint': 'Naikkan kalau customer minta cetak tambahan yang butuh amplop ekstra di luar amplop dari tiket.',
  'ie.stok.kurang': ' ⚠️ stok kurang',
  'ie.stok.amplopLbl': '✉️ Amplop',
  // Potongan & catatan
  'ie.lain.potongan': 'Potongan harga (Rp)',
  'ie.lain.potonganSub': '— diskon, dikurangkan dari total income',
  'ie.lain.potonganHint': 'Mis. diskon promo atau potongan khusus customer. Tidak memengaruhi bonus penjualan karyawan.',
  'ie.lain.keterangan': 'Keterangan (opsional)',
  'ie.lain.keteranganPh': 'cth: rame banget, ada event sekolah',
  // Pembayaran
  'ie.bayar.tunai': '💵 Tunai (Rp)',
  'ie.bayar.qris': '📱 QRIS (Rp)',
  'ie.bayar.hint': 'Catatan metode pembayaran yang diterima. Tidak memengaruhi total income.',
  // Kasir
  'ie.kasir.uangBesar': '💵 Uang besar (Rp)',
  'ie.kasir.uangKecil': '🪙 Uang kecil (Rp)',
  'ie.kasir.balance': '🟢 BALANCE',
  'ie.kasir.notBalance': '🔴 TIDAK BALANCE',
  'ie.kasir.hint': 'Untuk mengecek isi laci. Laci tidak mulai kosong tiap hari: uang kecil kembalian dari laporan sebelumnya tetap nyangkut. BALANCE jika (uang besar + uang kecil) − tunai sama dengan float yang masuk, yaitu uang kecil laporan sebelumnya ± penyesuaian (tambah/pakai) yang terjadi sebelum tanggal ini.',
  // Income total
  'ie.total.cetak': '(+) Cetak {n} × {rp}',
  'ie.total.potongan': '🏷️ Potongan harga',
  'ie.total.grand': 'TOTAL INCOME',
  // Group sub & cells
  'ie.grp.tiketCetak': 'Tiket {tiket} · Cetak {cetak}',
  'ie.grp.perItem': '{rp} / item',
  'ie.cell.tiket': 'Tiket',
  'ie.cell.cetak': '(+) Cetak',
  'ie.cell.jumlah': 'Jumlah',
  // Save
  'ie.save.edit': 'Simpan Perubahan',
  'ie.save.add': 'Simpan Laporan',
}

const EN: Dict = {
  // Sidebar / nav
  'nav.dashboard': 'Dashboard',
  'nav.absensi': 'Attendance',
  'nav.laporan': 'Income Report',
  'nav.inventaris': 'Inventory',
  'nav.pengeluaran': 'Expenses',
  'nav.pengaturan': 'Settings',
  'nav.logout': 'Log out',
  // Sidebar groups
  'side.group.Utama': 'Main',
  'side.group.Operasional': 'Operations',
  'side.group.Keuangan': 'Studio',
  'side.group.Event': 'Event',
  'side.group.Sistem': 'System',
  // Sidebar items
  'side.landing': 'Dashboard',
  'side.absensi': 'Employee Attendance',
  'side.profil': 'Employee Profile',
  'side.inventaris': 'Inventory & Stock',
  'side.laporan': 'Income',
  'side.event-photobooth': 'Photobooth',
  'side.event-game': 'Photo Game',
  'side.pengeluaran': 'Expenses',
  'side.gaji': 'Employee Salary',
  'side.pengaturan': 'Settings',
  // Sidebar account
  'side.role.admin': '🛡️ Admin',
  'side.role.karyawan': '👤 Employee',
  // Page meta
  'page.landing.title': 'Dashboard',
  'page.landing.sub': "Today's studio operations summary",
  'page.absensi.title': 'Employee Attendance',
  'page.absensi.sub': 'Record clock-in & clock-out per employee',
  'page.absen.title': 'Attendance Detail',
  'page.absen.sub': 'Record daily events & work-hour summary',
  'page.riwayat.title': 'Attendance History',
  'page.riwayat.sub': 'Attendance record history per employee',
  'page.profil.title': 'Employee Profile',
  'page.profil.sub': 'Attendance, work hours & sales summary per employee',
  'page.laporan.title': 'Daily Income Report',
  'page.laporan.sub': 'Photobooth, Photobox, Photo Game sales & upgrades',
  'page.event-photobooth.title': 'Event · Photobooth',
  'page.event-photobooth.sub': 'Photobooth report — hourly & voucher rental',
  'page.event-game.title': 'Event · Photo Game',
  'page.event-game.sub': 'Photo Game report — hourly & voucher rental',
  'page.inventaris.title': 'Inventory & Stock',
  'page.inventaris.sub': 'Paper, ink, envelopes, and misprint notes',
  'page.pengeluaran.title': 'Studio Expenses',
  'page.pengeluaran.sub': 'Record purchases & operational costs',
  'page.gaji.title': 'Employee Salary',
  'page.gaji.sub': 'Monthly payslip: base salary, sales bonus, overtime & deductions',
  'page.pengaturan.title': 'Settings',
  'page.pengaturan.sub': 'Set theme, font, text size, and display text',
  // Settings - language
  'set.language.title': 'Language',
  'set.language.sub': 'Choose the app display language.',
  'set.language.label': 'App language',
  'set.language.id': 'Indonesian',
  'set.language.en': 'English',
  'set.language.changed': 'Language changed to English',
  // ===== Income Report =====
  'inc.aturHarga': 'Manage Items & Prices',
  // Manage items & prices
  'inc.cat.layanan': '📸 Services (ticket + print)',
  'inc.cat.ikon': 'Icon',
  'inc.cat.namaLayanan': 'Service name',
  'inc.cat.hargaTiket': 'Ticket price',
  'inc.cat.hapusLayanan': 'Remove service',
  'inc.cat.tambahLayanan': 'Add service',
  'inc.cat.hargaCetak': '(+) Print Price (Rp) — applies to all services',
  'inc.cat.upgrade': '🎁 Print upgrades (qty)',
  'inc.cat.namaUpgrade': 'Upgrade name',
  'inc.cat.hargaItem': 'Price / item',
  'inc.cat.hargaUpgrade': 'Upgrade price',
  'inc.cat.hapusUpgrade': 'Remove upgrade',
  'inc.cat.tambahUpgrade': 'Add upgrade',
  'inc.cat.produk': '🛍️ Products (qty) — merchandise & more',
  'inc.cat.namaProdukPh': 'Product name (e.g. Photo frame, T-shirt)',
  'inc.cat.namaProduk': 'Product name',
  'inc.cat.hargaProduk': 'Product price',
  'inc.cat.hapusProduk': 'Remove product',
  'inc.cat.tambahProduk': 'Add product',
  'inc.cat.simpan': 'Save',
  'inc.cat.batal': 'Cancel',
  'inc.cat.hint': '⚠️ These items & prices apply to new reports. Existing reports keep the price set when created (snapshot).',
  'inc.cat.saved': 'Items & prices updated',
  // Hero stats
  'inc.stat.hariIni': 'Today',
  'inc.stat.minggu': 'Last 7 days',
  'inc.stat.rata': 'Average / day',
  'inc.stat.bulan': 'This month ({n} days)',

  'inc.rekap.title': '🧾 End-of-Month Summary',
  'inc.rekap.sub': '{bulan} financial summary — visible to admin only',
  'inc.rekap.periode': 'Period',
  'inc.rekap.tunai': 'Cash Income',
  'inc.rekap.qris': 'QRIS Income',
  'inc.rekap.pemasukan': 'Total Income',
  'inc.rekap.gaji': 'Salary Expense',
  'inc.rekap.lain': 'Other Expenses',
  'inc.rekap.bersih': 'Net',
  'inc.rekap.rekonTitle': 'Balance check — wallet & account',
  'inc.rekap.dompet': 'Cash wallet (actual)',
  'inc.rekap.rekening': 'Bank account (actual)',
  'inc.rekap.balance': '✓ Balanced with income',
  'inc.rekap.selisih': 'Difference {rp}',
  'inc.rekap.hint':
    'Cash + QRIS come from each report’s payment method; salary is computed from all employees’ slips this month; other expenses from the Expenses page. Enter the actual wallet & account balances to check: wallet vs cash income, account vs QRIS income (difference = actual − income).',
  // Big / small cash bar
  'inc.ub.label': '💰 Total large cash in drawer',
  'inc.ub.hint': 'increases automatically from the large cash of each report',
  'inc.ub.ambil': 'Withdraw / Hand to admin',
  'inc.uk.label': '🪙 Small-cash adjustments this month',
  'inc.uk.hint': 'add / use small cash so the drawer float matches across days',
  'inc.uk.tambahPakai': 'Add / Use',
  // Report list
  'inc.list.title': 'Report List',
  'inc.list.unduh': 'Download CSV',
  'inc.list.tambah': 'Add Report',
  'inc.empty.title': 'No income reports yet',
  'inc.empty.sub': 'Click "Add Report" to start recording daily sales.',
  // Toast & confirm
  'inc.toast.simpan': 'Report {tgl} saved',
  'inc.toast.stokKurang': 'Not enough stock — some was deducted down to 0',
  'inc.toast.hapus': 'Report {tgl} deleted',
  'inc.confirm.timpa': 'A report for {tgl} already exists. Overwrite with new data?',
  'inc.confirm.hapus': 'Delete the report for {tgl}? Stock will be restored.',
  'inc.toast.ukTambah': 'Added small cash {rp} recorded',
  'inc.toast.ukPakai': 'Used small cash {rp} recorded',
  'inc.toast.ukHapus': 'Adjustment deleted, float restored',
  'inc.toast.ubAmbil': 'Large cash {rp} withdrawn',
  'inc.toast.ubHapus': 'Withdrawal history deleted, balance restored',
  // Withdraw large cash modal
  'inc.ambil.title': 'Withdraw / Hand Over Large Cash',
  'inc.ambil.sub': 'Reduces the total large cash in the drawer',
  'inc.ambil.total': 'Total large cash in drawer',
  'inc.ambil.jumlah': '💵 Amount withdrawn (Rp)',
  'inc.ambil.semua': 'Withdraw all',
  'inc.ambil.maks': 'Cannot exceed the balance {rp}.',
  'inc.field.tanggal': '📅 Date',
  'inc.field.catatan': '📝 Note (optional)',
  'inc.ambil.catatanPh': 'e.g. handed to admin',
  'inc.ambil.catat': 'Record withdrawal',
  'inc.ambil.riwayat': '🧾 Withdrawal history',
  'inc.ambil.hapusRiwayat': 'Delete history',
  'inc.ambil.hapusSaldo': 'Delete & restore balance',
  // Small-cash adjustment modal
  'inc.peny.title': 'Small-Cash Adjustment',
  'inc.peny.sub': 'Add / use small cash in the drawer',
  'inc.peny.net': 'Net small-cash adjustment this month',
  'inc.peny.jenis': 'Type',
  'inc.peny.tambah': '➕ Add',
  'inc.peny.pakai': '➖ Use',
  'inc.peny.jumlahTambah': '🪙 Amount added (Rp)',
  'inc.peny.jumlahPakai': '🪙 Amount used (Rp)',
  'inc.peny.catatanTambahPh': 'e.g. exchange for change',
  'inc.peny.catatanPakaiPh': 'e.g. buy a water gallon',
  'inc.peny.hint': 'An adjustment on this date does not change that day’s report itself (its small cash is already counted), but the float carried over to the next report.',
  'inc.peny.catatTambah': 'Record addition',
  'inc.peny.catatPakai': 'Record usage',
  'inc.peny.riwayat': '🧾 Adjustment history',
  'inc.peny.hapusFloat': 'Delete & restore float',
  // Report card
  'inc.card.hapus': 'Delete report',
  'inc.card.tiket': 'tickets',
  'inc.card.cetak': 'prints',
  'inc.card.upgrade': 'upgrades',
  'inc.card.produk': 'products',
  'inc.card.item': 'items',
  'inc.card.totalIncome': 'Total income',
  'inc.card.cetakRow': '🖨️ (+) Print',
  'inc.card.potongan': '🏷️ Price discount',
  'inc.card.diskon': 'discount',
  'inc.card.catatan': 'Note:',
  'inc.card.tunai': '💵 Cash',
  'inc.card.qris': '📱 QRIS',
  'inc.card.bayarVia': 'paid via',
  'inc.card.uangBesar': '💰 Large cash',
  'inc.card.uangKecil': '🪙 Small cash',
  'inc.card.diLaci': 'in drawer',
  'inc.card.balance': '🟢 REPORT BALANCED',
  'inc.card.notBalance': '🔴 REPORT NOT BALANCED',
  'inc.card.edit': 'Edit',
  'inc.card.print': 'Print',
  // Calendar
  'inc.kal.cetak': 'Print',
  'inc.kal.bulanPrev': 'Previous month',
  'inc.kal.bulanNext': 'Next month',
  'inc.kal.adaCatatan': 'Has a note',
  'inc.kal.klikBuka': 'Click for full report →',
  'inc.kal.tapBuka': 'Tap again for full report →',
  'inc.kal.totalBulan': 'Total this month',
  'inc.kal.hari': 'days',
  'inc.kal.hariAda': 'Days with reports',
  'inc.kal.tertinggi': 'Highest day',
  'inc.kal.kosongBulan': 'No reports in {bulan} yet.',
  'inc.hari.min': 'Sun',
  'inc.hari.sen': 'Mon',
  'inc.hari.sel': 'Tue',
  'inc.hari.rab': 'Wed',
  'inc.hari.kam': 'Thu',
  'inc.hari.jum': 'Fri',
  'inc.hari.sab': 'Sat',
  // ===== Report input form (IncomeEntryModal) =====
  'ie.title.edit': 'Edit Income Report',
  'ie.title.add': 'Add Income Report',
  'ie.tanggal': 'Date',
  'ie.noEmployee': 'No employees yet. Add them first in the Employee Attendance menu so you can record sales per employee.',
  // Section titles
  'ie.sec.layanan': 'Services (ticket & print)',
  'ie.sec.upgrade': 'Print Upgrades',
  'ie.sec.produk': 'Products / Frames',
  'ie.sec.stok': 'Stock Usage',
  'ie.sec.lain': 'Discount & note',
  'ie.sec.bayar': 'Payment method',
  'ie.sec.kasir': 'Cash in Drawer',
  // Summaries
  'ie.sum.ketuk': 'Tap to fill in',
  'ie.sum.stokAuto': 'Automatic from tickets & products',
  'ie.sum.opsional': 'Optional',
  'ie.sum.adaCatatan': 'has a note',
  'ie.sum.diskon': 'discount {rp}',
  'ie.sum.tunai': 'cash {rp}',
  'ie.sum.qris': 'QRIS {rp}',
  'ie.sum.balance': 'BALANCED',
  'ie.sum.notBalance': 'NOT BALANCED',
  'ie.sum.lembarKertas': '{n} sheets of paper',
  'ie.sum.amplop': '{n} envelopes',
  'ie.sum.frame': '{n} frames',
  // unit words
  'ie.unit.item': 'items',
  'ie.unit.tiket': 'tickets',
  'ie.unit.lembar': 'sheets',
  'ie.unit.buah': 'pcs',
  'ie.unit.stok': 'stock',
  // Stock section
  'ie.stok.hint': 'Tickets & extra prints consume paper; each ticket gets 1 envelope. Upgrades (Poster / Crack n Share) use no envelope. Products named the same as a frame type consume frame stock. Stock decreases automatically when the report is saved.',
  'ie.stok.noKertas': 'No paper type (other than upgrade paper) in Inventory yet. Add one first so paper stock can decrease automatically.',
  'ie.stok.jenisKertasAuto': 'Paper type (for {n} sheets of tickets & prints)',
  'ie.stok.pakaiBeberapa': '+ Use multiple paper types',
  'ie.stok.pemakaianKertas': 'Paper usage (tickets + prints = {n} sheets)',
  'ie.stok.pilihKertas': '— select paper —',
  'ie.stok.hapusBaris': 'Remove row',
  'ie.stok.tambahKertas': '+ paper type',
  'ie.stok.pakaiSatu': 'Use only 1 paper',
  'ie.stok.dialokasikan': 'Allocated {n} of {m} sheets',
  'ie.stok.sisa': ' · {n} not yet allocated',
  'ie.stok.kelebihan': ' · {n} over',
  'ie.stok.amplopTerpakai': 'Envelopes used',
  'ie.stok.amplopAuto': '(automatic = {n} tickets)',
  'ie.stok.ikutiTiket': 'Follow tickets',
  'ie.stok.amplopHint': 'Increase it if a customer asks for extra prints that need envelopes beyond those from tickets.',
  'ie.stok.kurang': ' ⚠️ not enough stock',
  'ie.stok.amplopLbl': '✉️ Envelopes',
  // Discount & note
  'ie.lain.potongan': 'Price discount (Rp)',
  'ie.lain.potonganSub': '— discount, subtracted from total income',
  'ie.lain.potonganHint': 'e.g. promo discount or special customer discount. Does not affect employee sales bonus.',
  'ie.lain.keterangan': 'Note (optional)',
  'ie.lain.keteranganPh': 'e.g. very busy, school event',
  // Payment
  'ie.bayar.tunai': '💵 Cash (Rp)',
  'ie.bayar.qris': '📱 QRIS (Rp)',
  'ie.bayar.hint': 'A note of the payment methods received. Does not affect total income.',
  // Cash drawer
  'ie.kasir.uangBesar': '💵 Large cash (Rp)',
  'ie.kasir.uangKecil': '🪙 Small cash (Rp)',
  'ie.kasir.balance': '🟢 BALANCED',
  'ie.kasir.notBalance': '🔴 NOT BALANCED',
  'ie.kasir.hint': 'To check the drawer contents. The drawer does not start empty each day: small-cash change from the previous report stays behind. BALANCED when (large cash + small cash) − cash equals the incoming float, i.e. the previous report’s small cash ± adjustments (add/use) made before this date.',
  // Income total
  'ie.total.cetak': '(+) Print {n} × {rp}',
  'ie.total.potongan': '🏷️ Price discount',
  'ie.total.grand': 'TOTAL INCOME',
  // Group sub & cells
  'ie.grp.tiketCetak': 'Ticket {tiket} · Print {cetak}',
  'ie.grp.perItem': '{rp} / item',
  'ie.cell.tiket': 'Ticket',
  'ie.cell.cetak': '(+) Print',
  'ie.cell.jumlah': 'Qty',
  // Save
  'ie.save.edit': 'Save Changes',
  'ie.save.add': 'Save Report',
}

const DICTS: Record<Lang, Dict> = { id: ID, en: EN }

function loadLang(): Lang {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'en' || v === 'id' ? v : 'id'
}

/**
 * Locale untuk `toLocaleDateString` mengikuti bahasa aktif. Dibaca langsung dari
 * localStorage supaya bisa dipakai di helper non-React (mis. attendance.ts)
 * tanpa harus meneruskan context lewat banyak parameter.
 */
export function dateLocale(): string {
  return loadLang() === 'en' ? 'en-US' : 'id-ID'
}

type Vars = Record<string, string | number>
type Ctx = {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Vars) => string
}

const LangContext = createContext<Ctx | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => loadLang())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const t = (key: string, vars?: Vars) => {
    let s = DICTS[lang][key] ?? key
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]))
      }
    }
    return s
  }
  const setLang = (l: Lang) => setLangState(l)

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang(): Ctx {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within LangProvider')
  return ctx
}
