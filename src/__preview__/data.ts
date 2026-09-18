// =============================================================
// Data contoh untuk preview lokal. FIKTIF — jangan pernah menaruh data asli
// di sini; file ini ikut ter-commit dan terbaca siapa pun yang membuka repo.
// Lihat README.md di folder ini.
// =============================================================
import type { AppData, LaporanIncome } from '../types'
import { NOTIFIKASI_DEFAULT } from '../types'
import {
  HARGA_CETAK_DEFAULT,
  HARGA_TIKET_DEFAULT,
  HARGA_UPGRADE_DEFAULT,
} from '../storage'

const OWNER = '11111111-1111-4111-8111-111111111111'
const MANAJER = '22222222-2222-4222-8222-222222222222'
const RIZKY = '33333333-3333-4333-8333-333333333333'
const AYU = '44444444-4444-4444-8444-444444444444'

/*
  Tanggal dipatok, bukan diturunkan dari `new Date()`. Preview yang angkanya
  berubah tiap hari tidak bisa dipakai membandingkan "sebelum" dan "sesudah"
  sebuah perubahan tata letak.
*/
const BULAN_INI = '2026-09'
const BULAN_LALU = '2026-08'

const KERTAS_GLOSSY = '55555555-5555-4555-8555-555555555555'
const KERTAS_DOFF = '66666666-6666-4666-8666-666666666666'

function iso(tanggal: string, jam = '10:00'): string {
  return new Date(`${tanggal}T${jam}:00+07:00`).toISOString()
}

function laporanBulan(
  monthKey: string,
  hari: number[],
  tiketPerHari: number,
): LaporanIncome[] {
  return hari.map((d) => {
    const tgl = `${monthKey}-${String(d).padStart(2, '0')}`
    return {
      id: `lap-${tgl}`,
      tanggal: tgl,
      items: [
        {
          layanan: 'photobooth',
          karyawanId: d % 2 ? RIZKY : AYU,
          tiket: tiketPerHari,
          cetak: Math.round(tiketPerHari / 3),
        },
      ],
      upgrades: [{ tipe: 'poster', karyawanId: RIZKY, jumlah: d % 3 }],
      produk: [],
      keterangan: '',
      hargaTiket: HARGA_TIKET_DEFAULT,
      hargaCetak: HARGA_CETAK_DEFAULT,
      hargaUpgrade: HARGA_UPGRADE_DEFAULT,
      hargaProduk: {},
      pemakaianKertas: [{ kertasId: KERTAS_GLOSSY, jumlah: tiketPerHari }],
      amplopTerpakai: tiketPerHari,
      tunai: 400_000,
      qris: 250_000,
    }
  })
}

export const PREVIEW_DATA: AppData = {
  notifikasi: NOTIFIKASI_DEFAULT,
  employees: [
    { id: OWNER, nama: 'Dini', jabatan: 'Owner', pinHash: '', role: 'owner' },
    { id: MANAJER, nama: 'Yules', jabatan: 'Manajer', pinHash: '', role: 'manager' },
    { id: RIZKY, nama: 'Rizky', jabatan: 'Operator', pinHash: '', role: 'karyawan', tanggalDiterima: '2026-02-01' },
    { id: AYU, nama: 'Ayu', jabatan: 'Kasir', pinHash: '', role: 'karyawan', tanggalDiterima: '2026-05-10' },
  ],
  inactiveEmployees: [],
  records: [],
  // Bulan lalu sengaja lebih ramai: itulah yang membuat target 2x terasa berat
  // dan baris KPI omzet berwarna merah — keadaan yang paling perlu dilihat.
  laporanIncome: [
    ...laporanBulan(BULAN_LALU, [2, 5, 8, 11, 14, 17, 20, 23, 26, 29], 14),
    ...laporanBulan(BULAN_INI, [1, 3, 5, 8, 10, 12, 15], 11),
  ],
  penarikanUangBesar: [],
  penyesuaianUangKecil: [],
  laporanEvent: [],
  layananCatalog: [
    { id: 'photobooth', label: 'Photobooth', ikon: '📸' },
    { id: 'photo-game', label: 'Photo Game', ikon: '🎮' },
  ],
  upgradeCatalog: [
    { id: 'poster', label: 'Poster', ikon: '🖼️' },
    { id: 'crack-n-share', label: 'Crack n Share', ikon: '✂️' },
  ],
  produkCatalog: [],
  closingChecklist: [
    { id: 'c1', label: 'Matikan printer' },
    { id: 'c2', label: 'Hitung laci' },
  ],
  openingChecklist: [{ id: 'o1', label: 'Nyalakan kamera' }],
  hargaTiket: HARGA_TIKET_DEFAULT,
  hargaCetak: HARGA_CETAK_DEFAULT,
  hargaUpgrade: HARGA_UPGRADE_DEFAULT,
  hargaProduk: {},
  gajiPokok: { [RIZKY]: 1_800_000, [AYU]: 1_700_000 },
  gajiDibayar: {},
  saldoAktual: { [BULAN_INI]: { dompet: 1_250_000, rekening: 4_800_000 } },
  setoranRekening: [],
  saldoAwal: { dompet: 1_000_000, rekening: 3_000_000 },
  gajiPembayaranVia: {},
  // Glossy sengaja tinggal 6 lembar supaya antrean "stok di bawah ambang aman"
  // terisi tanpa perlu menunggu data asli.
  stokKertas: [
    { id: KERTAS_GLOSSY, nama: 'Glossy', stok: 6 },
    { id: KERTAS_DOFF, nama: 'Doff', stok: 120 },
  ],
  stokFrame: [{ id: 'f1', nama: 'Frame Kayu', stok: 4 }],
  stokTinta: [
    { warna: 'C', stok: 1 },
    { warna: 'M', stok: 3 },
  ],
  stokAmplop: 40,
  salahCetak: [],
  pengeluaran: [
    { id: 'p1', tanggal: `${BULAN_INI}-04`, kategori: 'Bahan', deskripsi: 'Kertas glossy 2 rol', jumlah: 900_000, catatan: '' },
    { id: 'p2', tanggal: `${BULAN_INI}-09`, kategori: 'Operasional', deskripsi: 'Listrik', jumlah: 650_000, catatan: '' },
    { id: 'p3', tanggal: `${BULAN_LALU}-06`, kategori: 'Bahan', deskripsi: 'Tinta set', jumlah: 1_100_000, catatan: '' },
  ],
  promoPrograms: [
    { id: 'pr1', judul: 'Promo Balik Sekolah', deskripsi: '', tahap: 'berjalan', status: 'disetujui', jenis: 'campaign', pic: RIZKY, deadline: `${BULAN_INI}-12`, createdAt: iso(`${BULAN_INI}-02`) },
    { id: 'pr2', judul: 'Giveaway Reels', deskripsi: '', tahap: 'rencana', status: 'menunggu', jenis: 'campaign', createdAt: iso(`${BULAN_INI}-07`) },
    // Dua konten di minggu yang sama tapi hari tayangnya beda — memperlihatkan
    // rantai take/edit yang bergeser mengikuti masing-masing kartu.
    { id: 'pr3', judul: 'Reels testimoni', deskripsi: '', tahap: 'berjalan', status: 'disetujui', jenis: 'konten', pic: AYU, deadline: `${BULAN_INI}-09`, createdAt: iso(`${BULAN_INI}-07`), tahapan: [{ kunci: 'take', oleh: AYU }] },
    { id: 'pr4', judul: 'Carousel harga', deskripsi: '', tahap: 'rencana', status: 'disetujui', jenis: 'konten', pic: RIZKY, deadline: `${BULAN_INI}-12`, createdAt: iso(`${BULAN_INI}-08`), tahapan: [] },
  ],
  // Dikosongkan supaya target jatuh ke saran otomatis (2x bulan lalu) dan
  // banner "Simulasi — belum disetujui" ikut terlihat.
  targetBulanan: {},
  jadwalShift: [
    { tanggal: `${BULAN_INI}-16`, employeeId: RIZKY, shift: 'pagi' },
    { tanggal: `${BULAN_INI}-17`, employeeId: AYU, shift: 'sore' },
  ],
  penilaianOwner: {
    [BULAN_LALU]: { nilai: 4, catatan: 'Responsif, tapi laporan sering telat.', diisiPada: iso(`${BULAN_INI}-01`) },
  },
  jobdeskManajer: {
    [BULAN_INI]: [
      { id: 'j1', label: 'Audit stok kertas mingguan', selesaiPada: iso(`${BULAN_INI}-08`), selesaiOleh: MANAJER },
      { id: 'j2', label: 'Susun jadwal shift bulan depan', darurat: true },
      { id: 'j3', label: 'Follow up MoU SMA 3' },
    ],
  },
  klaimSosmed: [
    { tanggal: `${BULAN_INI}-14`, employeeId: AYU, jenis: 'story', status: 'disetujui' },
    { tanggal: `${BULAN_INI}-15`, employeeId: AYU, jenis: 'story', status: 'disetujui' },
    { tanggal: `${BULAN_INI}-15`, employeeId: AYU, jenis: 'live', status: 'disetujui' },
    // Baru dilaporkan, belum diperiksa — inilah yang harus terlihat sebagai
    // antrean di layar Jadwal.
    { tanggal: `${BULAN_INI}-16`, employeeId: RIZKY, jenis: 'story', status: 'menunggu' },
  ],
  laporanHarian: [
    { tanggal: `${BULAN_INI}-12`, status: 'aman', catatan: 'Ramai, tidak ada kendala.', oleh: MANAJER, diperbarui: iso(`${BULAN_INI}-12`, '21:30') },
    { tanggal: `${BULAN_INI}-15`, status: 'kendala', catatan: 'Printer 2 macet, beres dengan head cleaning.', oleh: MANAJER, diperbarui: iso(`${BULAN_INI}-15`, '22:05') },
  ],
  /*
    Ubah ke `false` untuk melihat keadaan SEBELUM migrasi 0055 dijalankan:
    panel Masalah Teknis jadi baca-saja beserta keterangannya, dan strip lapor
    kendala di Home hilang sama sekali.
  */
  masalahTeknisSiap: true,
  masalahTeknis: [
    { id: 'm1', judul: 'Printer 2 hasil bergaris', kategori: 'printer', tingkat: 'stop', catatan: 'Head cleaning sudah 3x, masih bergaris.', dilaporkanOleh: RIZKY, dilaporkanPada: iso(`${BULAN_INI}-14`, '09:20'), solusi: '' },
    { id: 'm2', judul: 'WiFi putus-putus di jam sore', kategori: 'jaringan', tingkat: 'ganggu', catatan: '', dilaporkanOleh: AYU, dilaporkanPada: iso(`${BULAN_INI}-15`, '16:40'), solusi: '' },
    { id: 'm3', judul: 'Lampu ring light kedip', kategori: 'listrik', tingkat: 'ringan', catatan: '', dilaporkanOleh: RIZKY, dilaporkanPada: iso(`${BULAN_INI}-06`, '11:00'), selesaiPada: iso(`${BULAN_INI}-07`, '14:00'), selesaiOleh: MANAJER, solusi: 'Ganti adaptor.' },
  ],
  leads: [
    { id: 'l1', nama: 'SMA Negeri 3', kontak: '0812xxxx', sumber: 'Instagram', kategori: 'sekolah', tahap: 'dihubungi', nilaiEstimasi: 4_000_000, nilaiRealisasi: 0, pic: MANAJER, tanggalMasuk: `${BULAN_INI}-03` },
    { id: 'l2', nama: 'Wedding Rani', kontak: '0813xxxx', sumber: 'Referral', kategori: 'lainnya', tahap: 'baru', nilaiEstimasi: 2_500_000, nilaiRealisasi: 0, tanggalMasuk: `${BULAN_INI}-11` },
    { id: 'l3', nama: 'PT Sinar Jaya', kontak: '0814xxxx', sumber: 'Walk-in', kategori: 'perusahaan', tahap: 'closing', nilaiEstimasi: 6_000_000, nilaiRealisasi: 5_500_000, pic: MANAJER, tanggalMasuk: `${BULAN_LALU}-28`, tanggalClosing: `${BULAN_INI}-09` },
  ],
  leadsFollowup: [
    { id: 'f1', leadId: 'l1', tanggal: `${BULAN_INI}-04`, catatan: 'Kirim proposal.', oleh: MANAJER },
  ],
  kemitraan: [
    { id: 'k1', instansi: 'SMA Negeri 3', jenis: 'sponsorship', kontakNama: 'Bu Retno', kontak: '0812xxxx', acara: 'Pensi 2026', tanggalAcara: `${BULAN_INI}-28`, tanggalMasuk: `${BULAN_INI}-02`, status: 'masuk', permintaan: 'Booth gratis + voucher', nilaiDiminta: 3_000_000, nilaiDisetujui: 0, bentuk: 'booth', imbalan: [] },
    { id: 'k2', instansi: 'Kampus Merdeka', jenis: 'mou', kontakNama: 'Pak Anwar', kontak: '0815xxxx', acara: '', tanggalMasuk: `${BULAN_LALU}-20`, status: 'disetujui', permintaan: 'MoU tahunan', nilaiDiminta: 0, nilaiDisetujui: 0, bentuk: 'jasa', imbalan: [{ id: 'i1', teks: 'Logo di banner', selesai: false }], mouMulai: `${BULAN_LALU}-25`, mouBerakhir: `${BULAN_INI}-25` },
  ],
  headerJudul: 'Kubik Photobox',
  headerSub: 'Studio & Event',
  dashJudul: 'Dashboard Manajemen',
}

export const PREVIEW_IDS = { OWNER, MANAJER, RIZKY, AYU }
export const PREVIEW_BULAN = BULAN_INI
