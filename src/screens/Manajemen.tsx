import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AppData,
  LaporanHarian,
  JobdeskItem,
  MasalahTeknis,
  StatusLaporanHarian,
  PromoProgram,
  RitmeKonten,
  SosmedHarian,
  TahapKonten,
  TargetBulanan,
} from '../types'
import { todayKey, uid } from '../storage'
import { formatDurasi, formatJam } from '../attendance'
import { formatRupiah } from '../income'
import { hitungRekonsiliasiKas } from '../kas'
import {
  bulanSebelumnya,
  bulanTerakhir,
  bulanTersedia,
  delta,
  kepatuhanChecklist,
  kinerjaKaryawan,
  operasional,
  AKSI_SOSMED,
  AKSI_SOSMED_HINT,
  AKSI_SOSMED_LABEL,
  aktivitasSosmed,
  cakupanShift,
  dampakSosmed,
  MIN_SAMPEL_DAMPAK,
  denyutKonten,
  jarakTahap,
  SIAPKAN_MAKS,
  eksekusiKonten,
  kesiapanJadwal,
  NAMA_HARI,
  TAHAP_KONTEN,
  TAHAP_KONTEN_LABEL,
  kualitasCampaign,
  AMBANG_JADWAL_H,
  HARI_SISA_MERAH,
  JENDELA_PEMAKAIAN,
  kontribusiSales,
  KATEGORI_MASALAH_LABEL,
  KELOMPOK_LABEL,
  KELOMPOK_TUGAS,
  TINGKAT_MASALAH_LABEL,
  basisTarget,
  masalahTeknis,
  PENGALI_TARGET,
  laporanClosing,
  STATUS_LAPORAN,
  STATUS_LAPORAN_LABEL,
  STATUS_LAPORAN_PENDEK,
  LEAD_KATEGORI_LABEL,
  LEAD_TAHAP_LABEL,
  LEAD_TAHAP_ORDER,
  pengerjaSosmed,
  pipelineLeads,
  ringkasKemitraan,
  ringkasanBulan,
  saranTarget,
  skorKPI,
  targetBerlaku,
} from '../manajemen'
import type {
  AksiSosmed,
  BarisKPI,
  Operasional,
  TugasManajer,
  RingkasKemitraan,
  RingkasMasalah,
  HariDampak,
  SkorKelompok,
} from '../manajemen'
import { isPengelola } from '../lib/roles'
import { Avatar, colorIndexForName } from '../components/Avatar'
import { Icons } from '../components/Icons'

type Props = {
  data: AppData
  /** Write-through ke Supabase — dipakai owner untuk menyimpan target KPI. */
  setData: (d: AppData) => void
  /**
   * Owner melihat semuanya. Manajer melihat panel yang sama KECUALI gaji per
   * orang & rekonsiliasi kas — lihat lib/roles.ts.
   */
  isOwner: boolean
  /** Akun yang sedang login — distempel pada log "Selesai oleh". */
  meId?: string
  onLihatAbsensi: () => void
  onLihatJadwal: () => void
  onLihatLeads: () => void
  onLihatInventaris: () => void
  onLihatPromosi: () => void
  onLihatLaporan: () => void
}

/** "2026-09" → "September 2026". */
function labelBulan(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  })
}

/** "2026-09" → "Sep". */
function labelBulanPendek(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'short' })
}

/** 1.250.000 → "1,3 jt". Untuk sumbu grafik yang sempit. */
const BULAN_PENDEK = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

/** "2026-09-08" → "8 Sep". */
function labelTanggalPendek(tanggal: string): string {
  return `${Number(tanggal.slice(8))} ${BULAN_PENDEK[Number(tanggal.slice(5, 7)) - 1]}`
}

/** "2026-09-08" → "Sen, 8 Sep". */
function labelHariTanggal(tanggal: string): string {
  // getDay(): 0 = Minggu, sedangkan NAMA_HARI mulai dari Senin.
  const hari = (new Date(`${tanggal}T00:00:00`).getDay() + 6) % 7
  return `${NAMA_HARI[hari]}, ${labelTanggalPendek(tanggal)}`
}

/** Tujuh tanggal satu minggu, mulai Senin. */
function tanggalMinggu(mulai: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${mulai}T00:00:00`)
    d.setDate(d.getDate() + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
}

/**
 * "min. 2 konten/minggu · Take video H-2 · Editing H-1".
 *
 * Disebut sebagai JARAK, bukan nama hari, karena itulah yang sebenarnya
 * mengikat sejak tiap kartu punya hari tayangnya sendiri (lihat `jarakTahap`).
 */
function teksRitme(r: RitmeKonten): string {
  const jarak = jarakTahap(r)
  const tahap = TAHAP_KONTEN.filter((k) => k !== 'tayang').map(
    (k) => `${TAHAP_KONTEN_LABEL[k]} ${jarak[k] === 0 ? 'hari-H' : `H-${jarak[k]}`}`,
  )
  return [`min. ${r.jumlah} konten/minggu`, ...tahap].join(' · ')
}

/**
 * Contoh konkret dari satu angka `siapkan`: "kartu yang tayang Sabtu di-take
 * Kamis, diedit Jumat". Angka H-2 benar tapi abstrak; nama hari membuat owner
 * langsung tahu apa yang ia setujui. Sabtu dipakai sebagai contoh karena cukup
 * jauh dari awal minggu untuk menampung rantai terpanjang yang masuk akal.
 */
function contohRantai(siapkan: number): string {
  const CONTOH = 5 // indeks Sabtu pada NAMA_HARI (0 = Senin)
  const take = NAMA_HARI[Math.max(0, CONTOH - siapkan)]
  const edit = NAMA_HARI[Math.max(0, CONTOH - Math.min(1, siapkan))]
  return `contohnya tayang ${NAMA_HARI[CONTOH]} berarti take ${take}, editing ${edit}`
}

function rupiahRingkas(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace('.', ',')} M`
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} jt`
  if (abs >= 1_000) return `${Math.round(n / 1_000)} rb`
  return String(Math.round(n))
}

function persen(x: number, digit = 0): string {
  return `${(x * 100).toFixed(digit).replace('.', ',')}%`
}

/** "target sampai hari ini" dalam satuan yang enak dibaca. */
function formatPace(pace: number): string {
  if (pace >= 100_000) return `pace ${rupiahRingkas(pace)}`
  return `pace ${pace.toFixed(pace < 10 ? 1 : 0).replace('.', ',')}`
}

/**
 * Empat tab, empat tugas manajer — tidak ada yang kelima.
 *
 * Susunan sebelumnya punya lima tab yang dibagi per SUMBER DATA ("Hari Ini",
 * "Marketing", "Uang"), sehingga satu tugas tersebar ke beberapa layar: MoU
 * duduk di layar lain sama sekali, sementara antrean kerjanya menumpuk jadi
 * satu daftar dua belas baris yang mencampur kertas habis dengan lead yang
 * belum ditelepon. Sekarang tabnya persis job description manajer, dan tiap
 * tab berbentuk sama: **tugas ini → antreannya → detailnya**.
 *
 * Tab "Hari Ini" sengaja DIHAPUS, bukan dipindah: antrean gabungan memaksa
 * manajer menyortir sendiri mana yang tugasnya yang mana. Sekarang tiap
 * antrean muncul di tab pemiliknya, dan angka di label tab yang memberi tahu
 * ada berapa tunggakan tanpa perlu membukanya.
 *
 * Untuk OWNER, tiap tab menyelipkan satu blok rapor di antara kalimat tugas
 * dan antreannya. Blok itu tidak pernah terlihat oleh manajer — lihat `kpi`
 * di dalam komponen. Kelompok KPI kelima, "Penilaian Owner", tidak punya tab
 * karena ia bukan tugas yang bisa dikerjakan; ia dirender di tab Keuangan
 * bersama panel owner-only lainnya.
 */
type TabMgr = TugasManajer

const TAB_MGR: { id: TabMgr; label: string; sub: string }[] = [
  { id: 'operasional', label: 'Operasional', sub: 'SOP · stok · kendala teknis' },
  { id: 'sales', label: 'Leads & Sales', sub: 'MoU · event' },
  { id: 'sosmed', label: 'Social Media', sub: 'ide · jadwal · keaktifan' },
  { id: 'keuangan', label: 'Keuangan', sub: 'omzet · target 2×' },
]

export function Manajemen({
  data,
  setData,
  isOwner,
  meId,
  onLihatAbsensi,
  onLihatJadwal,
  onLihatLeads,
  onLihatInventaris,
  onLihatPromosi,
  onLihatLaporan,
}: Props) {
  const hariIni = todayKey()
  const periodeList = useMemo(() => bulanTersedia(data, hariIni), [data, hariIni])
  const [monthKey, setMonthKey] = useState(() => hariIni.slice(0, 7))

  /*
    Keduanya mendarat di Operasional — tugas nomor satu, dan satu-satunya yang
    kalau bocor akan menjatuhkan tiga tugas lainnya. Owner tidak lagi mendarat
    di rapor: rapornya sekarang menempel di tiap tab sebagai kepala halaman,
    jadi tidak ada lagi layar yang isinya cuma menilai tanpa bisa dikerjakan.
  */
  const [tab, setTab] = useState<TabMgr>('operasional')

  const kini = useMemo(
    () => ringkasanBulan(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const lalu = useMemo(
    () => ringkasanBulan(data, bulanSebelumnya(monthKey), hariIni),
    [data, monthKey, hariIni],
  )
  const tren = useMemo(
    () =>
      bulanTerakhir(monthKey, 6).map((k) => ringkasanBulan(data, k, hariIni)),
    [data, monthKey, hariIni],
  )
  const kinerja = useMemo(
    () => kinerjaKaryawan(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const checklist = useMemo(
    () => kepatuhanChecklist(data, monthKey),
    [data, monthKey],
  )
  const ops = useMemo(
    () => operasional(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const kas = useMemo(
    () => (isOwner ? hitungRekonsiliasiKas(data, monthKey, hariIni) : null),
    [data, monthKey, hariIni, isOwner],
  )
  /*
    Scorecard OWNER-ONLY, dan itu keputusan produk, bukan kelalaian: ini
    penilaian ATAS manajer yang dipakai owner saat evaluasi. Memperlihatkannya
    kepada yang dinilai mengubah perilakunya (kejar angka, bukan kejar hasil)
    dan membocorkan target yang belum disetujui.

    Yang TIDAK ikut disembunyikan adalah antrean kerjanya: manajer tetap
    melihat apa yang harus dibereskan di tiap tugas — bahan kerjanya, bukan
    rapornya. Karena itu `tindakan` di bawah sengaja tidak bersandar pada
    objek ini, kecuali satu baris omzet yang memang ikut ditutup.
  */
  const kpi = useMemo(
    () => (isOwner ? skorKPI(data, monthKey, hariIni) : null),
    [data, monthKey, hariIni, isOwner],
  )
  const masalah = useMemo(
    () => masalahTeknis(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const jadwal = useMemo(
    () => cakupanShift(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const sosmed = useMemo(
    () => aktivitasSosmed(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const laporan = useMemo(
    () => laporanClosing(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const eksekusi = useMemo(
    () => eksekusiKonten(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const denyut = useMemo(
    () => denyutKonten(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const dampak = useMemo(
    () => dampakSosmed(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const pipeline = useMemo(
    () => pipelineLeads(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const sales = useMemo(() => kontribusiSales(data, monthKey), [data, monthKey])
  const siapJadwal = useMemo(
    () => kesiapanJadwal(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const siapCampaign = useMemo(
    () => kualitasCampaign(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const nilaiOwner = data.penilaianOwner?.[monthKey]

  const [tglPilih, setTglPilih] = useState(hariIni)
  // Tanggal yang dicatat harus ikut periode yang sedang dilihat; kalau pemilih
  // bulan digeser, jatuh ke hari ini (bulan berjalan) atau tanggal 1.
  const tglSosmed = tglPilih.startsWith(monthKey)
    ? tglPilih
    : monthKey === hariIni.slice(0, 7)
      ? hariIni
      : `${monthKey}-01`
  const logHariIni = (data.sosmedHarian ?? []).find((r) => r.tanggal === tglSosmed)

  /** Bulan yang sedang dilihat memuat hari ini — syarat centang cepat. */
  const periodeBerjalan = hariIni.startsWith(monthKey)
  /**
   * Log tanggal HARI INI, terlepas dari tanggal mana yang sedang dipilih di
   * panel Sosial Media. Dipakai centang cepat di panel "Sosmed Hari Ini".
   */
  const logToday = (data.sosmedHarian ?? []).find((r) => r.tanggal === hariIni)

  // ---- Laporan closing harian ----
  const [tglLaporanPilih, setTglLaporanPilih] = useState(hariIni)
  // Sama seperti log sosmed: tanggal yang ditulis harus ikut periode yang
  // sedang dilihat, supaya tidak ada laporan nyasar ke bulan lain.
  const tglLaporan = tglLaporanPilih.startsWith(monthKey)
    ? tglLaporanPilih
    : periodeBerjalan
      ? hariIni
      : `${monthKey}-01`
  const laporanTerpilih = (data.laporanHarian ?? []).find(
    (r) => r.tanggal === tglLaporan,
  )
  /*
    Laporan ini boleh ditulis manajer MAUPUN owner, dan sampai sekarang
    keduanya terlihat identik di layar. Nama penulisnya sudah tersimpan di
    kolom `oleh` sejak awal — tinggal ditampilkan. Mantan pengelola dicari
    juga di daftar nonaktif supaya laporan lama tidak kehilangan namanya.
  */
  const penulisLaporan = laporanTerpilih?.oleh
    ? (
        data.employees.find((e) => e.id === laporanTerpilih.oleh) ??
        data.inactiveEmployees.find((e) => e.id === laporanTerpilih.oleh)
      )?.nama
    : undefined

  /**
   * Simpan/ubah laporan satu hari. Catatan kosong TIDAK menghapus barisnya —
   * beda dari log sosmed: "aman, tidak ada apa-apa" adalah laporan yang sah,
   * dan menghapusnya akan membuat hari itu terhitung bolong.
   */
  function simpanLaporan(
    tanggal: string,
    status: StatusLaporanHarian,
    catatan: string,
  ) {
    const list = data.laporanHarian ?? []
    const baris: LaporanHarian = {
      tanggal,
      status,
      catatan: catatan.trim(),
      oleh: meId,
      // Database yang jadi sumber kebenaran (trigger `laporan_harian_touch`),
      // tapi distempel lokal juga supaya jejaknya langsung terlihat tanpa
      // menunggu reload berikutnya.
      diperbarui: new Date().toISOString(),
    }
    setData({
      ...data,
      laporanHarian: [...list.filter((r) => r.tanggal !== tanggal), baris].sort(
        (a, b) => a.tanggal.localeCompare(b.tanggal),
      ),
    })
  }

  /**
   * Hapus laporan satu hari sepenuhnya — hari itu kembali terhitung bolong.
   *
   * Ada karena laporan closing tidak punya jalan mundur: sekali disimpan, satu
   * salah tanggal atau satu percobaan iseng akan menempel di riwayat selamanya
   * dan ikut mengubah rasio kepatuhan. "Perbarui" saja tidak cukup — statusnya
   * memang tidak boleh ada.
   */
  function hapusLaporan(tanggal: string) {
    setData({
      ...data,
      laporanHarian: (data.laporanHarian ?? []).filter(
        (r) => r.tanggal !== tanggal,
      ),
    })
  }

  /**
   * Catat/ubah satu hari sosmed. Baris yang semua aksinya mati DIHAPUS, bukan
   * disimpan sebagai baris kosong — supaya "hari bolong = tanggal yang hilang"
   * tetap benar dan tabelnya tidak menumpuk baris tak bermakna.
   */
  function ubahSosmed(tanggal: string, patch: Partial<SosmedHarian>) {
    const list = data.sosmedHarian ?? []
    const baru: SosmedHarian = {
      tanggal,
      posting: false,
      story: false,
      repost: false,
      engagement: false,
      live: false,
      ...list.find((r) => r.tanggal === tanggal),
      ...patch,
    }
    const sisa = list.filter((r) => r.tanggal !== tanggal)
    const kosong =
      AKSI_SOSMED.every((a) => !baru[a]) &&
      !baru.catatan &&
      !baru.tautan &&
      pengerjaSosmed(baru).length === 0
    setData({ ...data, sosmedHarian: kosong ? sisa : [...sisa, baru] })
  }

  // --- siapa yang mengerjakan sosmed hari terpilih (boleh lebih dari satu) ---
  const pengerjaHariIni = logHariIni ? pengerjaSosmed(logHariIni) : []
  /**
   * Nama bebas yang pernah dipakai — freelancer/anak magang yang tidak punya
   * akun. Dikumpulkan dari log itu sendiri supaya sekali diketik, seterusnya
   * tinggal diklik; tidak perlu tabel master orang.
   */
  const namaLuar = useMemo(() => {
    const idKaryawan = new Set(data.employees.map((e) => e.id))
    const set = new Set<string>()
    for (const r of data.sosmedHarian ?? []) {
      for (const o of pengerjaSosmed(r)) if (!idKaryawan.has(o)) set.add(o)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [data.sosmedHarian, data.employees])

  /**
   * Pengelola (owner/manajer) tidak muncul sebagai chip: yang dinilai di KPI
   * sosmed adalah eksekusi karyawan, dan owner yang sesekali ikut posting
   * cukup diketik sebagai nama tambahan. Chip yang terlanjur tercentang tetap
   * ditampilkan supaya pilihan lama masih bisa dilepas.
   */
  const opsiPengerja = [
    ...data.employees
      .filter((e) => !isPengelola(e.role) || pengerjaHariIni.includes(e.id))
      .map((e) => ({ key: e.id, label: e.nama, luar: false })),
    ...namaLuar.map((n) => ({ key: n, label: n, luar: true })),
  ]

  /**
   * `oleh` (satu orang, kolom lama) sengaja dikosongkan setiap kali daftar
   * diubah: `pengerjaSosmed()` mendahulukan `olehList`, dan menyisakan nilai
   * lama di sana hanya akan muncul kembali saat daftarnya dikosongkan.
   * Kolom uuid di database tetap terisi — db.ts menurunkannya dari daftar ini.
   */
  function setPengerja(daftar: string[]) {
    ubahSosmed(tglSosmed, { olehList: daftar, oleh: undefined })
  }

  function togglePengerja(key: string) {
    setPengerja(
      pengerjaHariIni.includes(key)
        ? pengerjaHariIni.filter((x) => x !== key)
        : [...pengerjaHariIni, key],
    )
  }

  const [namaBaru, setNamaBaru] = useState('')

  function tambahPengerja() {
    const nama = namaBaru.trim()
    if (!nama) return
    // Kalau namanya ternyata karyawan yang sudah ada, pakai akunnya — supaya
    // kontribusinya masuk ke orang yang sama, bukan jadi dua entri berbeda.
    const cocok = data.employees.find(
      (e) => e.nama.trim().toLowerCase() === nama.toLowerCase(),
    )
    const key = cocok?.id ?? nama
    if (!pengerjaHariIni.includes(key)) setPengerja([...pengerjaHariIni, key])
    setNamaBaru('')
  }
  const [editTarget, setEditTarget] = useState(false)

  // ---- Denyut Mingguan -------------------------------------------------
  const [mingguPilih, setMingguPilih] = useState<string | null>(null)
  const [editRitme, setEditRitme] = useState(false)
  /**
   * Slot yang sedang memilih hari tayang, `"<senin>#<nomor>"`. Selama terisi,
   * tujuh sel hari pada baris itu berubah jadi tombol pilih — pemilih tanggal
   * yang memakai kalender yang sudah ada di layar, bukan dialog baru.
   */
  const [pilihHari, setPilihHari] = useState<string | null>(null)
  // Minggu yang ditampilkan papan: pilihan manual, kalau tidak ada jatuh ke
  // minggu berjalan, lalu ke minggu terakhir di bulan itu (untuk bulan lampau).
  const mingguAktif =
    denyut.perMinggu.find((m) => m.mulai === mingguPilih) ??
    denyut.mingguIni ??
    denyut.perMinggu[denyut.perMinggu.length - 1]

  const namaById = useMemo(
    () => new Map(data.employees.map((e) => [e.id, e.nama])),
    [data.employees],
  )

  /**
   * Centang / urungkan satu tahap produksi. Yang dikirim hanya `kunci` & `oleh`
   * — tanggalnya distempel trigger promo_stamp_tahapan (0051), sama seperti
   * `selesaiPada` pada kartu.
   */
  function toggleTahap(kartuId: string, kunci: TahapKonten) {
    setData({
      ...data,
      promoPrograms: data.promoPrograms.map((p) => {
        if (p.id !== kartuId) return p
        const list = p.tahapan ?? []
        return {
          ...p,
          tahapan: list.some((t) => t.kunci === kunci)
            ? list.filter((t) => t.kunci !== kunci)
            : [...list, { kunci, oleh: meId }],
        }
      }),
    })
  }

  /**
   * Wujudkan satu slot jadi kartu sungguhan di Papan Promosi, dengan deadline =
   * hari tayang YANG DIPILIH di baris itu. Harinya ditanyakan (bukan dipatok ke
   * hari ritme) supaya konten kedua, ketiga, dan seterusnya dalam satu minggu
   * tidak menumpuk di tanggal yang sama. Judul & detailnya disunting di Papan
   * Promosi — papan ini sengaja tidak menduplikasi formulir kartu.
   */
  function buatKartuKonten(tayang: string) {
    const kartu: PromoProgram = {
      id: uid(),
      judul: `Konten · ${labelHariTanggal(tayang)}`,
      deskripsi: '',
      tahap: 'rencana',
      status: 'disetujui',
      jenis: 'konten',
      deadline: tayang,
      dibuatOleh: meId,
      createdAt: new Date().toISOString(),
      tahapan: [],
    }
    setData({ ...data, promoPrograms: [...data.promoPrograms, kartu] })
  }

  /**
   * Hapus satu kartu konten langsung dari papan — kartunya hilang juga dari
   * Papan Promosi, karena itu kartu yang sama.
   *
   * Yang TIDAK ikut terhapus adalah kewajibannya: kalau minggu itu jadi kurang
   * dari minimum, barisnya kembali muncul sebagai slot kosong. Menghapus kartu
   * tidak pernah bisa dipakai untuk mengosongkan papan.
   */
  function hapusKartuKonten(kartuId: string) {
    setData({
      ...data,
      promoPrograms: data.promoPrograms.filter((p) => p.id !== kartuId),
    })
  }

  /**
   * Pindahkan hari tayang sebuah kartu konten — jadwal ulang yang jujur:
   * target take & edit ikut bergeser mengikuti hari tayang yang baru.
   *
   * Yang TIDAK ikut bergeser adalah tanggal centangnya: `selesaiPada`
   * distempel database (0051), jadi menggeser jadwal hanya memindahkan target,
   * bukan mengarang ulang kapan pekerjaannya benar-benar terjadi. Sama persis
   * dengan mengubah deadline kartu di Papan Promosi.
   */
  function geserTayang(kartuId: string, tayang: string) {
    setData({
      ...data,
      promoPrograms: data.promoPrograms.map((p) =>
        p.id === kartuId ? { ...p, deadline: tayang } : p,
      ),
    })
  }

  /**
   * Simpan ritme — dari owner maupun manajer. Selama `disetujui` belum true,
   * KPI "konten mingguan tepat ritme" tetap dihitung tapi ditandai simulasi,
   * pola yang sama dengan persetujuan target bulanan.
   *
   * Siapa yang boleh menyetujui ditentukan di RitmeEditor, bukan di sini; RLS
   * `app_config` sendiri memang membuka tulis untuk pengelola (owner &
   * manajer, lihat 0042), jadi pembatasannya bersifat alur kerja — cukup untuk
   * satu owner + satu manajer, dan terlihat di layar owner kalau ritmenya
   * berubah jadi belum disetujui.
   */
  function simpanRitme(r: RitmeKonten) {
    setData({ ...data, ritmeKonten: r })
    setEditRitme(false)
  }

  function simpanTarget(t: TargetBulanan) {
    setData({
      ...data,
      targetBulanan: { ...(data.targetBulanan ?? {}), [monthKey]: t },
    })
    setEditTarget(false)
  }

  /**
   * Persetujuan owner atas target periode ini. Sebelum ini ditekan, seluruh
   * scorecard tampil abu-abu berlabel "simulasi" — angka saran otomatis tidak
   * boleh dipakai menilai orang tanpa ada yang menyetujuinya lebih dulu.
   */
  function setujuiTarget() {
    const { target } = targetBerlaku(data, monthKey, hariIni)
    simpanTarget({
      ...target,
      disetujui: true,
      disetujuiPada: new Date().toISOString(),
    })
  }

  function simpanPenilaian(nilai: number, catatan?: string) {
    setData({
      ...data,
      penilaianOwner: {
        ...(data.penilaianOwner ?? {}),
        [monthKey]: { nilai, catatan, diisiPada: new Date().toISOString() },
      },
    })
  }

  // ---- Jobdesk manajer (disusun owner, dicentang manajer) ----
  const jobdesk = data.jobdeskManajer?.[monthKey] ?? []
  const jobdeskLalu = data.jobdeskManajer?.[bulanSebelumnya(monthKey)] ?? []
  const jobdeskSelesai = jobdesk.filter((j) => j.selesaiPada).length
  const [editJobdesk, setEditJobdesk] = useState(false)

  function simpanJobdesk(items: JobdeskItem[]) {
    setData({
      ...data,
      jobdeskManajer: { ...(data.jobdeskManajer ?? {}), [monthKey]: items },
    })
  }

  /**
   * Centang/batal satu jobdesk. Membatalkan centang MENGHAPUS jejak siapa &
   * kapan (bukan menyimpan `selesaiPada: undefined` di sebelah `selesaiOleh`
   * lama) supaya tidak ada baris yang tampak belum selesai tapi masih membawa
   * nama pencentangnya.
   */
  function toggleJobdesk(id: string) {
    simpanJobdesk(
      jobdesk.map((j) =>
        j.id !== id
          ? j
          : j.selesaiPada
            ? { id: j.id, label: j.label }
            : { ...j, selesaiPada: new Date().toISOString(), selesaiOleh: meId },
      ),
    )
  }

  const saldoAktual = data.saldoAktual[monthKey] ?? { dompet: 0, rekening: 0 }

  const komposisi = [
    { label: 'Tiket', nilai: kini.incomeTiket, warna: 'var(--primary-2)' },
    { label: 'Cetak tambahan', nilai: kini.incomeCetak, warna: 'var(--mint)' },
    { label: 'Upgrade', nilai: kini.incomeUpgrade, warna: 'var(--yellow)' },
    { label: 'Produk', nilai: kini.incomeProduk, warna: 'var(--pink)' },
    {
      label: 'Event Photobooth',
      nilai: kini.eventPerKategori.photobooth.pendapatan,
      warna: 'var(--primary)',
    },
    {
      label: 'Event Photo Game',
      nilai: kini.eventPerKategori.game.pendapatan,
      warna: 'var(--pink-deep)',
    },
  ]
    .filter((k) => k.nilai > 0)
    .sort((a, b) => b.nilai - a.nilai)

  /**
   * Rupiah yang harus dikejar supaya omzet kembali sejajar dengan laju target.
   *
   * Diambil dari baris KPI omzet, bukan dihitung ulang di sini — kalau tidak,
   * angka di antrean bisa berbeda dari angka di rapor tepat di halaman yang
   * sama. 0 kalau sudah sejajar, kalau KPI-nya belum bisa dinilai (target
   * belum diisi / periode belum berjalan), atau kalau yang membuka bukan
   * owner — angka ini menyebut selisih terhadap target, jadi ia ikut tertutup
   * bersama rapornya.
   */
  const barisOmzet = kpi?.baris.find((b) => b.id === 'omzet')
  const kurangOmzet =
    barisOmzet && barisOmzet.status !== 'belum-aktif'
      ? Math.max(0, Math.round(barisOmzet.pace - barisOmzet.nilai))
      : 0

  /*
    Antrean kerja, sekarang BER-TUGAS.

    Dulu dua belas baris ini menumpuk jadi satu daftar di tab "Hari Ini",
    urutannya urutan penulisan kode, dan manajer harus menyortir sendiri mana
    yang urusan stok dan mana yang urusan lead. Tiap baris kini membawa `tugas`
    sehingga ia muncul di tab pemiliknya saja, dan `bobot` menentukan urutan —
    makin kecil makin genting, sehingga studio yang berhenti jualan selalu
    berada di atas ide promosi yang menunggu ACC.
  */
  const tindakan = [
    {
      // Paling genting yang bisa ada: studio tidak bisa menerima pelanggan.
      tugas: 'operasional' as TabMgr,
      bobot: 0,
      jumlah: masalah.stopTerbuka,
      label: 'Kendala teknis menghentikan studio',
      aksi: 'Buka log kendala',
      onClick: () => setTab('operasional'),
      nada: 'pink' as const,
    },
    {
      // Paling mendesak: hari yang sudah di depan mata tapi belum ada penjaga.
      tugas: 'operasional' as TabMgr,
      bobot: 1,
      jumlah: jadwal.bolongMendatang.length,
      label: 'Hari ke depan tanpa operator terjadwal',
      aksi: 'Buka jadwal shift',
      onClick: onLihatJadwal,
      nada: 'pink' as const,
    },
    {
      tugas: 'operasional' as TabMgr,
      bobot: 2,
      jumlah: masalah.terbuka.length - masalah.stopTerbuka,
      label: 'Kendala teknis belum dibereskan',
      aksi: 'Buka log kendala',
      onClick: () => setTab('operasional'),
      nada: 'yellow' as const,
    },
    {
      tugas: 'operasional' as TabMgr,
      bobot: 3,
      jumlah: ops.stokKritis.length,
      label: 'Item stok di bawah ambang aman',
      aksi: 'Buka inventaris',
      onClick: onLihatInventaris,
      nada: 'yellow' as const,
    },
    {
      /*
        Hanya menagih hari kerja yang sudah lewat — `laporan.bolong` sendiri
        yang menyaring hari tutup. Ditaruh di antrean, bukan sebagai peringatan
        terpisah, supaya laporan harian ikut hilang dari layar begitu ditulis,
        persis seperti antrean lainnya.
      */
      tugas: 'operasional' as TabMgr,
      bobot: 4,
      jumlah: laporan.bolong.length,
      label:
        laporan.bolong[0] === hariIni
          ? 'Laporan closing hari ini belum ditulis'
          : 'Hari kerja tanpa laporan closing',
      aksi: 'Tulis laporan',
      onClick: () => {
        setTab('operasional')
        setTglLaporanPilih(laporan.bolong[0] ?? hariIni)
      },
      nada: 'yellow' as const,
    },
    {
      tugas: 'operasional' as TabMgr,
      bobot: 5,
      jumlah: ops.absenMenunggu,
      label: 'Absensi manual menunggu persetujuan',
      aksi: 'Buka presensi',
      onClick: onLihatAbsensi,
      nada: 'pink' as const,
    },
    {
      tugas: 'operasional' as TabMgr,
      bobot: 6,
      jumlah: ops.hariTanpaLaporan,
      label: 'Hari berjalan tanpa laporan pemasukan',
      aksi: 'Buka pemasukan',
      onClick: onLihatLaporan,
      nada: 'primary' as const,
    },
    {
      tugas: 'operasional' as TabMgr,
      bobot: 7,
      jumlah: siapJadwal.berikutnya
        ? siapJadwal.berikutnya.hariDinilai - siapJadwal.berikutnya.hariTerisi
        : 0,
      label: `Hari minggu depan belum dijadwalkan (batas H-${AMBANG_JADWAL_H})`,
      aksi: 'Buka jadwal shift',
      onClick: onLihatJadwal,
      nada: 'primary' as const,
    },

    {
      // KPI: lead yang jendela 2 harinya lewat tanpa satu pun kontak.
      tugas: 'sales' as TabMgr,
      bobot: 0,
      jumlah: pipeline.belumDihubungi.length,
      label: 'Lead baru belum pernah dihubungi',
      aksi: 'Buka leads & sales',
      onClick: onLihatLeads,
      nada: 'pink' as const,
    },
    {
      tugas: 'sales' as TabMgr,
      bobot: 1,
      jumlah: pipeline.perluFollowup.length,
      label: 'Leads menunggu di-follow-up',
      aksi: 'Buka leads & sales',
      onClick: onLihatLeads,
      nada: 'primary' as const,
    },

    {
      // Peringatan paling awal yang dipunyai dashboard ini: tahap yang lewat
      // tenggat hari ini sudah menyalakan lampu untuk hari tayang nanti.
      tugas: 'sosmed' as TabMgr,
      bobot: 0,
      jumlah: denyut.macet.length,
      label: 'Tahap konten mingguan lewat tenggat',
      aksi: 'Buka papan promosi',
      onClick: onLihatPromosi,
      nada: 'pink' as const,
    },
    {
      tugas: 'sosmed' as TabMgr,
      bobot: 1,
      jumlah: eksekusi.menunggak.length,
      label: 'Campaign lewat deadline & belum selesai',
      aksi: 'Buka papan promosi',
      onClick: onLihatPromosi,
      nada: 'yellow' as const,
    },
    {
      tugas: 'sosmed' as TabMgr,
      bobot: 2,
      jumlah: siapCampaign.belumSiap.length,
      label: 'Campaign tanpa PIC atau deadline',
      aksi: 'Buka papan promosi',
      onClick: onLihatPromosi,
      nada: 'yellow' as const,
    },
    {
      tugas: 'sosmed' as TabMgr,
      bobot: 3,
      jumlah: ops.promoMenunggu,
      label: 'Ide promosi menunggu ACC',
      aksi: 'Buka papan promosi',
      onClick: onLihatPromosi,
      nada: 'primary' as const,
    },
    {
      /*
        Satu-satunya antrean tugas Keuangan, dan sengaja hanya satu: omzet
        tidak dikerjakan langsung — ia hasil dari tiga tugas lainnya. Yang bisa
        ditindak adalah SELISIHNYA, jadi barisnya muncul hanya kalau capaian
        sudah tertinggal dari laju target, dan angkanya adalah jumlah rupiah
        yang harus dikejar sisa bulan ini.
      */
      tugas: 'keuangan' as TabMgr,
      bobot: 0,
      /*
        `jumlah` adalah BANYAKNYA hal yang harus dibereskan — angka di dalam
        pill bulat, sama seperti baris lain. Selisih rupiahnya tidak boleh
        masuk ke sini: "3305000" meluber dari pill-nya dan terbaca seolah ada
        tiga juta antrean. Nominalnya tetap disebut, di labelnya.
      */
      jumlah: kurangOmzet > 0 ? 1 : 0,
      label: `Omzet tertinggal dari laju target (kurang ${rupiahRingkas(kurangOmzet)})`,
      aksi: 'Lihat tren & komposisi',
      onClick: () => setTab('keuangan'),
      nada: 'pink' as const,
    },
  ]
    .filter((t) => t.jumlah > 0)
    .sort((a, b) => a.bobot - b.bobot)

  const mou = useMemo(
    () => ringkasKemitraan(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  /** Target yang berlaku — dipakai panel MoU & Event untuk patokan event. */
  const target = useMemo(
    () => targetBerlaku(data, monthKey, hariIni).target,
    [data, monthKey, hariIni],
  )
  const jumlahEventBulanIni =
    kini.eventPerKategori.photobooth.jumlah + kini.eventPerKategori.game.jumlah

  // ---- Kendala teknis (migration 0055) ----
  /*
    Menandai selesai adalah keputusan, bukan laporan — RLS mengunci UPDATE ke
    `is_admin()` (migration 0055). Layar ini sendiri sudah digerbangi pengelola
    di App.tsx, jadi siapa pun yang sampai ke sini berhak; ditulis eksplisit
    supaya panelnya tetap benar kalau suatu saat dashboard dibuka lebih lebar.
  */
  const bisaKelolaMasalah = true

  function laporMasalah(baru: Omit<MasalahTeknis, 'id' | 'dilaporkanPada'>) {
    setData({
      ...data,
      masalahTeknis: [
        {
          ...baru,
          id: uid(),
          dilaporkanPada: new Date().toISOString(),
          dilaporkanOleh: baru.dilaporkanOleh ?? meId,
        },
        ...(data.masalahTeknis ?? []),
      ],
    })
  }

  function ubahMasalah(id: string, patch: Partial<MasalahTeknis>) {
    setData({
      ...data,
      masalahTeknis: (data.masalahTeknis ?? []).map((m) =>
        m.id === id ? { ...m, ...patch } : m,
      ),
    })
  }

  function tutupMasalah(id: string, solusi: string) {
    ubahMasalah(id, {
      selesaiPada: new Date().toISOString(),
      selesaiOleh: meId,
      solusi: solusi.trim(),
    })
  }

  /**
   * Buka lagi kendala yang terlanjur ditutup. Jejak penutupnya DIHAPUS, bukan
   * disisakan — pola yang sama dengan `toggleJobdesk`: tidak boleh ada baris
   * yang tampak terbuka tapi masih membawa nama orang yang menutupnya.
   */
  function bukaLagiMasalah(id: string) {
    ubahMasalah(id, {
      selesaiPada: undefined,
      selesaiOleh: undefined,
      solusi: '',
    })
  }

  function hapusMasalah(id: string) {
    setData({
      ...data,
      masalahTeknis: (data.masalahTeknis ?? []).filter((m) => m.id !== id),
    })
  }

  /** Blok rapor untuk tugas yang sedang dibuka — owner saja. */
  const kelompokAktif = kpi?.kelompok.find((g) => g.id === tab)
  /** Penilaian owner: kelompok berbobot yang tidak punya tab sendiri. */
  const kelompokOwner = kpi?.kelompok.find((g) => g.id === 'owner')
  /** Bulan pembanding target — dipakai menerangkan dari mana angka 2× berasal. */
  const basis = useMemo(
    () => basisTarget(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )

  /** Antrean tugas yang sedang dibuka, dan hitungan per tab untuk badge. */
  const antreanTab = tindakan.filter((t) => t.tugas === tab)
  const antreanPerTugas = (id: TabMgr) =>
    tindakan.filter((t) => t.tugas === id).length

  return (
    <>
      {/* ---------- Hero + pemilih periode ---------- */}
      <section className="mgr-hero">
        <div className="mgr-hero-text">
          <span className="mgr-kicker">
            {isOwner ? '👑 Owner' : '🛡️ Manajer'} · Dashboard Manajemen
          </span>
          <h2 className="mgr-hero-judul">{labelBulan(monthKey)}</h2>
          <p className="mgr-hero-sub">
            {kini.hariBerlaporan} hari berlaporan dari {kini.hariBerjalan} hari
            berjalan · rata-rata {formatRupiah(kini.rataPerHari)}/hari
          </p>
          {/*
            Skor gabungan, ditaruh di hero dan bukan di tab tersendiri: begitu
            ia punya halaman sendiri, halaman itu jadi satu-satunya yang isinya
            menilai tanpa bisa dikerjakan. Di sini ia terlihat dari tab mana
            pun, tanpa pernah merebut layar.

            OWNER-ONLY, sama seperti scorecard-nya — ini angka penilaian atas
            manajer, bukan alat kerjanya.
          */}
          {isOwner && kpi && (
            <div
              className={
                'mgr-hero-skor' + (kpi.targetDisetujui ? '' : ' is-simulasi')
              }
            >
              <span className="mgr-hero-skor-nilai">{persen(kpi.skor)}</span>
              <span className="mgr-hero-skor-teks">
                <b>Rapor manajer</b>
                <em>
                  bulan {persen(kpi.progres)} berjalan ·{' '}
                  {kpi.targetDisetujui ? 'target disetujui' : 'simulasi'}
                </em>
              </span>
            </div>
          )}
        </div>
        <label className="mgr-periode">
          <span>Periode</span>
          <select
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
          >
            {periodeList.map((k) => (
              <option key={k} value={k}>
                {labelBulan(k)}
              </option>
            ))}
          </select>
        </label>
      </section>
      {/* ---------- Tab = 4 tugas manajer ---------- */}
      <nav className="mgr-tabs" role="tablist" aria-label="Tugas manajer">
        {TAB_MGR.map((x) => {
          const antre = antreanPerTugas(x.id)
          return (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              className={'mgr-tab' + (tab === x.id ? ' is-aktif' : '')}
              onClick={() => setTab(x.id)}
            >
              <span className="mgr-tab-lbl">
                {x.label}
                {/* Badge ada di SEMUA tab sekarang — itulah yang menggantikan
                    tab "Hari Ini": tunggakan tiap tugas terbaca tanpa dibuka. */}
                {antre > 0 && <em className="mgr-tab-badge">{antre}</em>}
              </span>
              <em className="mgr-tab-sub">{x.sub}</em>
            </button>
          )
        })}
      </nav>

      {/* ---------- Kepala tiap tab: tugasnya, lalu antreannya ---------- */}
      {/*
        Urutannya disengaja: apa tugas ini (dan, untuk owner, sedang menang
        atau kalah) dulu — baru apa yang harus dikerjakan. Dibalik, antrean
        akan selalu dikerjakan tanpa pernah ada yang bertanya apakah
        mengerjakannya cukup.

        Blok rapor di tengah hanya muncul untuk owner. Manajer tetap mendapat
        kalimat tugasnya dan seluruh antreannya — bahan kerjanya, bukan
        rapornya.
      */}
      <Panel
        judul={`Tugas: ${KELOMPOK_LABEL[tab]}`}
        sub={KELOMPOK_TUGAS[tab]}
        badge={
          kelompokAktif
            ? kelompokAktif.skor != null
              ? `Capaian ${persen(kelompokAktif.skor)} · bobot ${persen(kelompokAktif.bobot)}`
              : 'Belum bisa dinilai'
            : antreanTab.length > 0
              ? `${antreanTab.length} antrean`
              : undefined
        }
        aksi={
          isOwner ? (
            <button
              type="button"
              className="mgr-aksi-btn"
              onClick={() => setEditTarget((v) => !v)}
            >
              {editTarget ? 'Tutup' : 'Atur target'}
            </button>
          ) : undefined
        }
      >
        {isOwner && kpi && kelompokAktif && (
          <>
            {!kpi.targetDisetujui && (
              <div className="mgr-simulasi">
                <div>
                  <b>Simulasi — belum disetujui.</b>{' '}
                  {kpi.targetSaran
                    ? `Target periode ini masih saran otomatis (${PENGALI_TARGET}× ${
                        basis
                          ? `${labelBulan(basis.monthKey)}${basis.berurutan ? '' : ' — bulan berisi terakhir'}`
                          : 'bulan lalu'
                      }).`
                    : 'Target sudah diisi tapi belum disetujui owner.'}{' '}
                  Skor di bawah belum boleh dipakai menilai orang.
                </div>
                <button
                  type="button"
                  className="mgr-aksi-btn is-utama"
                  onClick={setujuiTarget}
                >
                  Setujui target
                </button>
              </div>
            )}
            {editTarget && (
              <TargetEditor
                awal={targetBerlaku(data, monthKey, hariIni).target}
                saran={saranTarget(data, monthKey, hariIni)}
                onSimpan={simpanTarget}
                onBatal={() => setEditTarget(false)}
              />
            )}
            <div
              className={
                'mgr-kpi-kelompok-list' +
                (kpi.targetDisetujui ? '' : ' is-simulasi')
              }
            >
              <KelompokBlok kelompok={kelompokAktif} laju={kpi.progres} />
            </div>
          </>
        )}

        {/* ---------- Antrean tugas ini ---------- */}
        <div className={'mgr-antrean' + (isOwner ? '' : ' is-sendiri')}>
          <b className="mgr-antrean-judul">Yang harus dibereskan di tugas ini</b>
          {antreanTab.length === 0 ? (
            <p className="mgr-empty">
              ✅ Tidak ada antrean. Semua sudah tertangani.
            </p>
          ) : (
            <ul className="mgr-todo">
              {antreanTab.map((t) => (
                <li key={t.label}>
                  <span className={`mgr-todo-num mgr-todo-num--${t.nada}`}>
                    {t.jumlah}
                  </span>
                  <span className="mgr-todo-teks">
                    <span className="lbl">{t.label}</span>
                    <button
                      type="button"
                      className="mgr-todo-aksi"
                      onClick={t.onClick}
                    >
                      {t.aksi} <Icons.chevron />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {tab === 'operasional' && (
        <div className="mgr-cols">
          <div className="mgr-col">
            <Panel
              judul="Kinerja Karyawan"
              sub="Kehadiran, disiplin jam, dan kontribusi penjualan bulan ini"
            >
              {kinerja.length === 0 ? (
                <p className="mgr-empty">Belum ada karyawan aktif.</p>
              ) : (
                <div className="mgr-tabel-wrap">
                  <table className="mgr-tabel">
                    <thead>
                      <tr>
                        <th>Karyawan</th>
                        <th className="num">Hadir</th>
                        <th className="num">Telat</th>
                        <th className="num">Lembur</th>
                        <th className="num">Item</th>
                        <th className="num">Penjualan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kinerja.map((k, i) => (
                        <tr key={k.id}>
                          <td>
                            <div className="mgr-orang">
                              <span className="mgr-rank">{i + 1}</span>
                              <Avatar
                                name={k.nama}
                                colorIndex={colorIndexForName(k.id)}
                                foto={k.foto}
                              />
                              <span className="mgr-orang-teks">
                                <span className="nm">
                                  {k.nama}
                                  {/* Kepala operator ikut dinilai di tabel ini. */}
                                  {k.pengelola && (
                                    <em className="mgr-orang-tag">Manajer</em>
                                  )}
                                </span>
                                <span className="jb">{k.jabatan || 'Karyawan'}</span>
                              </span>
                            </div>
                          </td>
                          <td className="num">
                            <div className="mgr-hadir">
                              <span className="mgr-hadir-val">
                                {k.hariHadir}/{k.hariSeharusnya}
                              </span>
                              <span className="mgr-meter">
                                <span
                                  className={
                                    'mgr-meter-fill' +
                                    (k.kehadiran < 0.6 ? ' is-rendah' : '')
                                  }
                                  style={{ width: `${k.kehadiran * 100}%` }}
                                />
                              </span>
                            </div>
                          </td>
                          <td className={'num' + (k.terlambatMenit > 0 ? ' is-minus' : '')}>
                            {k.terlambatMenit > 0 ? formatDurasi(k.terlambatMenit) : '—'}
                          </td>
                          <td className="num">
                            {k.lemburMenit > 0 ? formatDurasi(k.lemburMenit) : '—'}
                          </td>
                          <td className="num">{k.jumlahItem}</td>
                          <td className="num is-kuat">{formatRupiah(k.penjualan)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel
              judul="Jobdesk &amp; Checklist"
              sub="Kepatuhan checklist pagi (opening) &amp; closing per karyawan"
            >
              {checklist.belumDiatur ? (
                <p className="mgr-empty">
                  Checklist pagi &amp; closing belum diatur. Atur daftar tugasnya di
                  Pengaturan agar kepatuhan bisa dipantau di sini.
                </p>
              ) : checklist.totalWajib === 0 ? (
                <p className="mgr-empty">
                  Belum ada hari kerja tercatat di periode ini.
                </p>
              ) : (
                <>
                  <div className="mgr-kepatuhan-head">
                    <div>
                      <span className="mgr-kepatuhan-lbl">Kepatuhan rata-rata</span>
                      <span
                        className={
                          'mgr-kepatuhan-val' +
                          (checklist.rata < 0.8 ? ' is-rendah' : '')
                        }
                      >
                        {persen(checklist.rata)}
                      </span>
                    </div>
                    <span className="mgr-kepatuhan-sub">
                      {checklist.totalSelesai} dari {checklist.totalWajib} tugas
                      dicentang
                    </span>
                  </div>

                  <div className="mgr-bars">
                    {checklist.perOrang
                      .filter((o) => o.pagiWajib + o.pulangWajib > 0)
                      .map((o) => (
                        <div key={o.id} className="mgr-bar-row">
                          <span className="mgr-bar-label">{o.nama}</span>
                          <span className="mgr-bar-track">
                            <span
                              className="mgr-bar-fill"
                              style={{
                                width: `${o.kepatuhan * 100}%`,
                                background:
                                  o.kepatuhan >= 0.9
                                    ? 'var(--mint)'
                                    : o.kepatuhan >= 0.7
                                      ? 'var(--yellow)'
                                      : 'var(--pink)',
                              }}
                            />
                          </span>
                          <span className="mgr-bar-val">
                            {persen(o.kepatuhan)}
                            <em>
                              pagi {o.pagiSelesai}/{o.pagiWajib} · closing{' '}
                              {o.pulangSelesai}/{o.pulangWajib}
                            </em>
                          </span>
                        </div>
                      ))}
                  </div>

                  {checklist.taskTerlewat.length > 0 && (
                    <div className="mgr-terlewat">
                      <div className="mgr-terlewat-head">Paling sering terlewat</div>
                      <ul>
                        {checklist.taskTerlewat.slice(0, 5).map((t) => (
                          <li key={`${t.jenis}-${t.id}`}>
                            <span className={`mgr-tag mgr-tag--${t.jenis}`}>
                              {t.jenis === 'pagi' ? 'Pagi' : 'Closing'}
                            </span>
                            <span className="mgr-terlewat-lbl">{t.label}</span>
                            <span className="mgr-terlewat-num">
                              {t.terlewat}× dari {t.wajib}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </Panel>

            <Panel
              judul="Jobdesk Manajer"
              sub={
                isOwner
                  ? `Tugas yang Anda tetapkan untuk ${labelBulan(monthKey)}. Manajer mencentangnya sendiri di layar ini.`
                  : `Tugas dari owner untuk ${labelBulan(monthKey)}. Centang setelah beres.`
              }
              badge={
                jobdesk.length > 0
                  ? `${jobdeskSelesai}/${jobdesk.length}`
                  : undefined
              }
              aksi={
                isOwner ? (
                  <button
                    type="button"
                    className="mgr-aksi-btn"
                    onClick={() => setEditJobdesk((v) => !v)}
                  >
                    {editJobdesk ? 'Tutup' : jobdesk.length ? 'Atur jobdesk' : 'Susun jobdesk'}
                  </button>
                ) : undefined
              }
            >
              {editJobdesk ? (
                <JobdeskEditor
                  key={monthKey}
                  awal={jobdesk}
                  bulanLalu={jobdeskLalu}
                  labelBulanLalu={labelBulan(bulanSebelumnya(monthKey))}
                  onSimpan={(items) => {
                    simpanJobdesk(items)
                    setEditJobdesk(false)
                  }}
                  onBatal={() => setEditJobdesk(false)}
                />
              ) : jobdesk.length === 0 ? (
                <p className="mgr-empty">
                  {isOwner
                    ? 'Belum ada jobdesk untuk periode ini. Klik "Susun jobdesk" untuk menuliskan daftarnya — manajer langsung melihatnya di sini.'
                    : 'Owner belum menetapkan jobdesk untuk periode ini.'}
                </p>
              ) : (
                <>
                  <div className="mgr-jobdesk-head">
                    <span className="mgr-jobdesk-meter">
                      <span
                        className="mgr-jobdesk-fill"
                        style={{
                          width: `${(jobdeskSelesai / jobdesk.length) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="mgr-jobdesk-hitung">
                      {jobdeskSelesai} dari {jobdesk.length} selesai
                    </span>
                  </div>
                  <ul className="mgr-jobdesk">
                    {jobdesk.map((j) => {
                      const oleh = j.selesaiOleh
                        ? data.employees.find((e) => e.id === j.selesaiOleh)?.nama
                        : undefined
                      return (
                        <li
                          key={j.id}
                          className={'mgr-jobdesk-row' + (j.selesaiPada ? ' is-done' : '')}
                        >
                          <label>
                            <input
                              type="checkbox"
                              checked={Boolean(j.selesaiPada)}
                              onChange={() => toggleJobdesk(j.id)}
                            />
                            <span className="mgr-jobdesk-label">{j.label}</span>
                          </label>
                          {j.selesaiPada && (
                            <span className="mgr-jobdesk-jejak">
                              {labelTanggalPendek(todayKey(new Date(j.selesaiPada)))}
                              {oleh && ` · ${oleh}`}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </Panel>
          </div>

          <div className="mgr-col mgr-col--side">
            <KesehatanOpsPanel ops={ops} />

            <MasalahTeknisPanel
              siap={data.masalahTeknisSiap}
              ringkas={masalah}
              namaById={namaById}
              bisaTutup={bisaKelolaMasalah}
              onLapor={laporMasalah}
              onTutup={tutupMasalah}
              onBukaLagi={bukaLagiMasalah}
              onHapus={hapusMasalah}
            />

            <Panel
              judul="Laporan Closing"
              sub={
                laporan.belumDicatat
                  ? 'Ditulis manajer setelah tutup — kejadian yang tidak tercatat di mana pun: trouble, komplain, apa pun.'
                  : `${laporan.terisi} dari ${laporan.hariKerja} hari kerja terisi · ${laporan.kendala} kendala · ${laporan.eskalasi} perlu owner`
              }
              badge={laporan.hariKerja > 0 ? persen(laporan.rasio) : undefined}
            >
              {/*
                Strip sebulan lebih dulu, baru formulirnya. Urutan ini disengaja:
                yang paling sering dilakukan owner bukan menulis, melainkan
                memindai — mencari kotak yang tidak hijau.
              */}
              <div className="mgr-lap-strip">
                {laporan.perHari.map((h) => (
                  <button
                    key={h.tanggal}
                    type="button"
                    className={
                      `mgr-lap-sel is-${h.status ?? 'kosong'}` +
                      (h.berjalan ? '' : ' is-nanti') +
                      (h.hariKerja ? '' : ' is-tutup') +
                      (h.tanggal === tglLaporan ? ' is-pilih' : '')
                    }
                    onClick={() => setTglLaporanPilih(h.tanggal)}
                    title={
                      `${labelHariTanggal(h.tanggal)} — ` +
                      (h.status
                        ? `${STATUS_LAPORAN_PENDEK[h.status]}${h.catatan ? `: ${h.catatan}` : ''}`
                        : h.hariKerja
                          ? 'belum ada laporan'
                          : 'tidak ada kegiatan')
                    }
                  >
                    {Number(h.tanggal.slice(8))}
                  </button>
                ))}
              </div>

              <LaporanBox
                key={tglLaporan}
                tanggal={tglLaporan}
                awal={laporanTerpilih}
                penulis={penulisLaporan}
                // Hari yang belum tiba tidak bisa dilaporkan; tanggalnya tetap
                // bisa diklik supaya kalender terasa utuh.
                bisaTulis={tglLaporan <= hariIni}
                onSimpan={simpanLaporan}
                onHapus={hapusLaporan}
              />

              {laporan.terakhir.filter((r) => r.tanggal !== tglLaporan).length > 0 && (
                <div className="mgr-lap-riwayat">
                  <b>Laporan terakhir</b>
                  <ul>
                    {laporan.terakhir
                      .filter((r) => r.tanggal !== tglLaporan)
                      .slice(0, 4)
                      .map((r) => (
                        <li key={r.tanggal}>
                          <button
                            type="button"
                            onClick={() => setTglLaporanPilih(r.tanggal)}
                          >
                            <span className={`mgr-lap-tag is-${r.status}`}>
                              {STATUS_LAPORAN_PENDEK[r.status]}
                            </span>
                            <span className="tgl">{labelTanggalPendek(r.tanggal)}</span>
                            <span className="isi">
                              {r.catatan || <em>tanpa catatan</em>}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'sosmed' && (
        <div className="mgr-cols">
          <div className="mgr-col">
            <Panel
              judul="Sosial Media"
              sub={
                sosmed.belumDicatat
                  ? 'Belum ada catatan — centang aktivitas hari ini untuk mulai menilai KPI sosmed.'
                  : `${sosmed.hariAktif} dari ${sosmed.hariBerjalan} hari aktif · rentetan berjalan ${sosmed.runSekarang} hari (terpanjang ${sosmed.runTerpanjang})`
              }
              badge={
                sosmed.belumDicatat ? undefined : persen(sosmed.konsistensi)
              }
            >
              <div className="mgr-heat">
                {sosmed.perHari.map((h) => (
                  <button
                    key={h.tanggal}
                    type="button"
                    className={
                      `mgr-heat-sel lv-${h.jumlahAksi}` +
                      (h.berjalan ? '' : ' is-nanti') +
                      (h.tanggal === tglSosmed ? ' is-pilih' : '') +
                      (h.berjalan && !h.aktif ? ' is-bolong' : '')
                    }
                    onClick={() => setTglPilih(h.tanggal)}
                    title={`${h.tanggal} — ${h.jumlahAksi} dari 4 aktivitas`}
                  >
                    {Number(h.tanggal.slice(8))}
                  </button>
                ))}
              </div>

              <div className="mgr-sos-form">
                <div className="mgr-sos-tgl">
                  <label>
                    <span>Catat tanggal</span>
                    <input
                      type="date"
                      value={tglSosmed}
                      onChange={(e) => e.target.value && setTglPilih(e.target.value)}
                    />
                  </label>
                </div>

                {/*
                  Satu hari sering dikerjakan berdua — yang posting belum tentu
                  yang membalas komentar — dan sebagian pengerjanya tidak punya
                  akun. Jadi: pilih berapa pun orangnya, dan nama baru boleh
                  diketik langsung.
                */}
                <div className="mgr-sos-orang">
                  <span className="mgr-sos-orang-lbl">
                    Dikerjakan oleh
                    {pengerjaHariIni.length > 0 && (
                      <em>{pengerjaHariIni.length} orang</em>
                    )}
                  </span>
                  <div className="mgr-sos-orang-list">
                    {opsiPengerja.map((o) => {
                      const on = pengerjaHariIni.includes(o.key)
                      return (
                        <button
                          key={o.key}
                          type="button"
                          className={
                            'mgr-sos-chip' + (on ? ' is-on' : '') + (o.luar ? ' is-luar' : '')
                          }
                          onClick={() => togglePengerja(o.key)}
                          title={o.luar ? 'Nama tambahan (tanpa akun)' : undefined}
                        >
                          {on ? '✓' : '○'} {o.label}
                        </button>
                      )
                    })}
                    {opsiPengerja.length === 0 && (
                      <span className="mgr-sos-orang-kosong">
                        Belum ada nama — tambahkan di bawah.
                      </span>
                    )}
                  </div>
                  <div className="mgr-sos-orang-tambah">
                    <input
                      value={namaBaru}
                      placeholder="Tambah nama (freelancer, magang, owner…)"
                      onChange={(e) => setNamaBaru(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          tambahPengerja()
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="mgr-aksi-btn"
                      onClick={tambahPengerja}
                      disabled={!namaBaru.trim()}
                    >
                      Tambah
                    </button>
                  </div>
                </div>
                <div className="mgr-sos-aksi">
                  {AKSI_SOSMED.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={`mgr-sos-chip${logHariIni?.[a] ? ' is-on' : ''}`}
                      title={AKSI_SOSMED_HINT[a as AksiSosmed]}
                      onClick={() =>
                        ubahSosmed(tglSosmed, { [a]: !logHariIni?.[a] } as Partial<SosmedHarian>)
                      }
                    >
                      {logHariIni?.[a] ? '✓' : '○'} {AKSI_SOSMED_LABEL[a as AksiSosmed]}
                    </button>
                  ))}
                </div>
                {/* Story & Live sudah TIDAK dicentang di sini sejak migrasi
                    0060 — keduanya dilaporkan operator & disetujui pengelola di
                    layar Jadwal. Ditulis di layar supaya orang tidak mencarinya
                    di tempat yang salah lalu menyangka fiturnya hilang. */}
                <p className="mgr-hint">
                  <strong>Story</strong> &amp; <strong>Live</strong> tidak lagi
                  dicentang di sini: operator melaporkannya sendiri di{' '}
                  <strong>Jadwal Karyawan</strong>, dan kamu yang menyetujuinya
                  di sana. Yang tersisa di panel ini adalah log akun studio.
                </p>
                <input
                  className="mgr-sos-tautan"
                  type="url"
                  placeholder="Tautan unggahan (opsional)"
                  value={logHariIni?.tautan ?? ''}
                  onChange={(e) =>
                    ubahSosmed(tglSosmed, { tautan: e.target.value || undefined })
                  }
                />
              </div>

              {sosmed.bolong.length > 0 && (
                <p className="mgr-hint">
                  {sosmed.bolong.length} hari masih kosong bulan ini — kotak
                  bergaris pada kalender di atas.
                </p>
              )}
            </Panel>

            <Panel
              judul="Denyut Mingguan"
              sub={
                !denyut.disetujui
                  ? `${teksRitme(denyut.ritme)} — belum dinilai sampai ritmenya disetujui.`
                  : denyut.dinilai === 0
                    ? `${teksRitme(denyut.ritme)} — belum ada minggu yang hari tayangnya lewat bulan ini.`
                    : `${teksRitme(denyut.ritme)} · ${denyut.tepat} dari ${denyut.dinilai} slot tepat ritme bulan ini`
              }
              badge={denyut.dinilai > 0 ? persen(denyut.rasio) : undefined}
              aksi={
                // Terbuka untuk manajer juga — layar ini memang cuma dicapai
                // pengelola (owner & manajer), dan manajer-lah yang paling tahu
                // ritme produksi yang sanggup ia jalankan. Yang tetap owner-only
                // adalah MENYETUJUINYA; lihat RitmeEditor.
                <button
                  type="button"
                  className={'mgr-aksi-btn' + (denyut.disetujui ? '' : ' is-utama')}
                  onClick={() => setEditRitme((v) => !v)}
                >
                  {editRitme ? 'Tutup' : 'Atur ritme'}
                </button>
              }
            >
              {editRitme && (
                <RitmeEditor
                  ritme={denyut.ritme}
                  disetujui={denyut.disetujui}
                  bolehSetujui={isOwner}
                  onSimpan={simpanRitme}
                  onBatal={() => setEditRitme(false)}
                />
              )}

              {!editRitme && !denyut.disetujui && (
                <p className="mgr-hint">
                  {denyut.belumDiatur
                    ? 'Papan memakai ritme bawaan — belum pernah diatur.'
                    : 'Ritme ini belum disetujui owner.'}{' '}
                  Slot &amp; tenggatnya tetap digambar, tapi skornya masih
                  simulasi{isOwner ? '' : ' sampai owner menyetujuinya'}.
                </p>
              )}

              <div className="mgr-mgg-nav">
                {denyut.perMinggu.map((m) => (
                  <button
                    key={m.mulai}
                    type="button"
                    className={
                      'mgr-mgg-tab' +
                      (m.mulai === mingguAktif?.mulai ? ' is-pilih' : '') +
                      (m.berjalan ? ' is-kini' : '') +
                      (m.dinilai && m.beres < m.slot.length ? ' is-macet' : '')
                    }
                    onClick={() => setMingguPilih(m.mulai)}
                  >
                    {labelTanggalPendek(m.mulai)}–{labelTanggalPendek(m.selesai)}
                    <em>
                      {m.beres}/{m.slot.length}
                    </em>
                  </button>
                ))}
              </div>

              {mingguAktif && (
                <div className="mgr-mgg-wrap">
                  <div className="mgr-mgg">
                    <div className="mgr-mgg-sudut" />
                    {tanggalMinggu(mingguAktif.mulai).map((t, i) => (
                      <div
                        key={t}
                        className={'mgr-mgg-hari' + (t === hariIni ? ' is-kini' : '')}
                      >
                        <span>{NAMA_HARI[i]}</span>
                        <em>{Number(t.slice(8))}</em>
                      </div>
                    ))}

                    {mingguAktif.slot.map((slot) => {
                      const kunciSlot = `${mingguAktif.mulai}#${slot.nomor}`
                      const memilih = pilihHari === kunciSlot
                      return (
                        <Fragment key={kunciSlot}>
                          <div className={`mgr-mgg-baris is-${slot.status}`}>
                            <span className="jdl">
                              <span className="teks">{slot.judul}</span>
                              {slot.ekstra && <em className="ekstra">ekstra</em>}
                              {slot.id && (
                                <button
                                  type="button"
                                  className="mgr-mgg-hapus"
                                  title="Hapus kartu konten ini"
                                  aria-label={`Hapus kartu ${slot.judul}`}
                                  onClick={() => {
                                    const jejak = slot.tahapan.filter((t) => t.selesaiPada)
                                    if (
                                      confirm(
                                        `Hapus kartu "${slot.judul}"? Kartunya hilang juga dari Papan Promosi` +
                                          (jejak.length > 0
                                            ? `, berikut ${jejak.length} tahap yang sudah dicentang`
                                            : '') +
                                          '. Kalau minggu ini jadi kurang dari minimal, slotnya kembali kosong.',
                                      )
                                    ) {
                                      if (pilihHari === kunciSlot) setPilihHari(null)
                                      hapusKartuKonten(slot.id!)
                                    }
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                            {slot.virtual ? (
                              <button
                                type="button"
                                className="mgr-mgg-buat"
                                onClick={() => setPilihHari(memilih ? null : kunciSlot)}
                              >
                                {memilih ? 'Batal' : '+ Buat kartu'}
                              </button>
                            ) : (
                              <span className="pic">
                                {slot.pic
                                  ? (namaById.get(slot.pic) ?? 'PIC tidak dikenal')
                                  : 'Tanpa PIC'}
                                {' · '}
                                <button
                                  type="button"
                                  className="mgr-mgg-geser"
                                  onClick={() => setPilihHari(memilih ? null : kunciSlot)}
                                >
                                  {memilih ? 'batal' : 'ganti hari tayang'}
                                </button>
                              </span>
                            )}
                          </div>
                          {tanggalMinggu(mingguAktif.mulai).map((t) =>
                            memilih ? (
                              // Sel harinya sendiri yang jadi pemilih tanggal:
                              // hari tayang dipilih di kalender tempat ia akan
                              // muncul, bukan di kotak tanggal terpisah.
                              <div key={t} className="mgr-mgg-sel">
                                <button
                                  type="button"
                                  className={
                                    'mgr-mgg-pilih' + (t === slot.tayang ? ' is-kini' : '')
                                  }
                                  title={`Tayang ${labelHariTanggal(t)}`}
                                  onClick={() => {
                                    if (slot.virtual) buatKartuKonten(t)
                                    else if (slot.id) geserTayang(slot.id, t)
                                    setPilihHari(null)
                                  }}
                                >
                                  Tayang
                                </button>
                              </div>
                            ) : (
                              <div key={t} className="mgr-mgg-sel">
                                {slot.tahapan
                                  .filter((th) => th.target === t)
                                  .map((th) => (
                                    <button
                                      key={th.kunci}
                                      type="button"
                                      className={`mgr-mgg-chip is-${th.status}`}
                                      disabled={slot.virtual}
                                      title={
                                        slot.virtual
                                          ? 'Buat kartunya dulu untuk bisa mencentang tahap ini'
                                          : th.selesaiPada
                                            ? `Selesai ${labelTanggalPendek(th.selesaiPada)}` +
                                              (th.status === 'telat'
                                                ? ` · telat ${th.telatHari} hari`
                                                : ' · tepat waktu')
                                            : th.status === 'telat'
                                              ? `Lewat tenggat ${th.telatHari} hari`
                                              : `Target ${labelTanggalPendek(th.target)}`
                                      }
                                      onClick={() => slot.id && toggleTahap(slot.id, th.kunci)}
                                    >
                                      <b>
                                        {th.status === 'beres'
                                          ? '✓'
                                          : th.status === 'telat'
                                            ? '!'
                                            : '○'}
                                      </b>{' '}
                                      {th.label}
                                    </button>
                                  ))}
                              </div>
                            ),
                          )}
                        </Fragment>
                      )
                    })}
                  </div>
                </div>
              )}

              <p className="mgr-hint">
                Hari tayang dipilih per kartu: klik <b>+ Buat kartu</b> (atau{' '}
                <b>ganti hari tayang</b>), lalu pilih harinya di baris itu —
                take &amp; editing bergeser sendiri mengikuti. Baris yang masih
                bertombol <b>+ Buat kartu</b> adalah kekurangan dari minimal{' '}
                {denyut.ritme.jumlah} konten/minggu; konten lebih dari itu boleh
                dan ikut dinilai.
              </p>

              {denyut.macet.length > 0 && (
                <p className="mgr-hint">
                  Menunggak:{' '}
                  {denyut.macet
                    .slice(0, 3)
                    .map((m) => `${m.judul} — ${m.tahap} (${m.telatHari} hari)`)
                    .join(' · ')}
                  {denyut.macet.length > 3 && ` · +${denyut.macet.length - 3} lainnya`}
                </p>
              )}
            </Panel>
          </div>

          <div className="mgr-col mgr-col--side">
            <Panel
              judul="Sosmed Hari Ini"
              sub={
                sosmed.belumDicatat
                  ? 'Belum ada catatan bulan ini — centang begitu satu aktivitas selesai.'
                  : `Rentetan ${sosmed.runSekarang} hari · konsistensi ${persen(sosmed.konsistensi)} bulan ini`
              }
            >
              {/*
                Centang cepat, tanpa memilih tanggal dan tanpa memilih orang —
                inilah satu-satunya bentuk pencatatan yang benar-benar dilakukan
                tiap hari. Formulir lengkapnya (tanggal lain, nama pengerja,
                tautan) ada di panel Sosial Media di bawah.
              */}
              {!periodeBerjalan ? (
                <p className="mgr-empty">
                  Periode yang sedang dilihat bukan bulan berjalan. Centang harian
                  hanya berlaku untuk hari ini.
                </p>
              ) : (
                <>
                  <div className="mgr-sos-aksi">
                    {AKSI_SOSMED.map((a) => (
                      <button
                        key={a}
                        type="button"
                        className={`mgr-sos-chip${logToday?.[a] ? ' is-on' : ''}`}
                        onClick={() =>
                          ubahSosmed(hariIni, {
                            [a]: !logToday?.[a],
                          } as Partial<SosmedHarian>)
                        }
                      >
                        {logToday?.[a] ? '✓' : '○'} {AKSI_SOSMED_LABEL[a as AksiSosmed]}
                      </button>
                    ))}
                  </div>
                  {sosmed.bolong.length > 0 && (
                    <p className="mgr-hint">
                      {sosmed.bolong.length} hari bulan ini masih kosong — bisa
                      disusulkan dari panel Sosial Media di bawah.
                    </p>
                  )}
                </>
              )}
            </Panel>

            <Panel
              judul="Konten Minggu Ini"
              sub={teksRitme(denyut.ritme)}
              badge={
                denyut.mingguIni
                  ? `${denyut.mingguIni.beres}/${denyut.mingguIni.slot.length} slot`
                  : undefined
              }
            >
              {!denyut.mingguIni ? (
                <p className="mgr-empty">
                  Minggu berjalan tidak ada di periode yang sedang dilihat.
                </p>
              ) : (
                <ul className="mgr-slot-ringkas">
                  {denyut.mingguIni.slot.map((s) => (
                    <li key={s.nomor} className={`is-${s.status}`}>
                      <span className="ikon">
                        {s.status === 'beres' ? '✓' : s.status === 'macet' ? '!' : '○'}
                      </span>
                      <span className="lbl">{s.judul}</span>
                      <em>
                        {s.virtual
                          ? 'kartu belum dibuat'
                          : `${labelHariTanggal(s.tayang)} · ${
                              s.pic
                                ? (namaById.get(s.pic) ?? 'PIC tidak dikenal')
                                : 'tanpa PIC'
                            }`}
                      </em>
                    </li>
                  ))}
                </ul>
              )}
              {denyut.macet.length > 0 && (
                <p className="mgr-hint">
                  Menunggak:{' '}
                  {denyut.macet
                    .slice(0, 3)
                    .map((m) => `${m.judul} — ${m.tahap} (${m.telatHari} hari)`)
                    .join(' · ')}
                  {denyut.macet.length > 3 && ` · +${denyut.macet.length - 3} lainnya`}
                </p>
              )}
            </Panel>

            <Panel
              judul="Dampak Sosmed ke Penjualan"
              sub="Omzet harian, dibandingkan antara hari sosmed aktif dan hari pasif"
              badge={
                dampak.cukupSampel && dampak.selisih != null
                  ? `${dampak.selisih >= 0 ? '+' : ''}${persen(dampak.selisih)}`
                  : undefined
              }
            >
              <DampakChart rows={dampak.perHari} />
              <div className="mgr-mini-stats">
                <MiniStat
                  k={`Hari aktif (${dampak.hariAktif})`}
                  v={formatRupiah(dampak.rataAktif)}
                />
                <MiniStat
                  k={`Hari pasif (${dampak.hariPasif})`}
                  v={formatRupiah(dampak.rataPasif)}
                />
                {/*
                  Perbandingan apel-dengan-apel: Sabtu dibandingkan Sabtu, bukan
                  Sabtu dibandingkan Selasa.
                */}
                <MiniStat
                  k={`Vs hari yang sama (${dampak.banding.length} hari)`}
                  v={
                    dampak.liftHariSama == null
                      ? '—'
                      : `${dampak.liftHariSama >= 0 ? '+' : ''}${persen(dampak.liftHariSama)}`
                  }
                />
              </div>
              {dampak.cukupSampelHariSama && dampak.liftHariSama != null && (
                <p className="mgr-hint">
                  Dibandingkan <b>hari yang sama</b> pada 4 minggu sebelumnya
                  (Sabtu vs Sabtu), omzet pada hari sosmed aktif{' '}
                  {dampak.liftHariSama >= 0 ? 'lebih tinggi' : 'lebih rendah'}{' '}
                  <b>{persen(Math.abs(dampak.liftHariSama))}</b> dari
                  kebiasaannya. Cara ini menetralkan pola mingguan, jadi lebih
                  layak dipercaya daripada angka aktif-vs-pasif di atas.
                </p>
              )}
              <p className="mgr-hint">
                {!dampak.cukupSampel ? (
                  <>
                    Belum cukup data untuk dibandingkan — butuh minimal{' '}
                    {MIN_SAMPEL_DAMPAK} hari berlaporan di kedua sisi. Hari tanpa
                    laporan pemasukan tidak ikut dihitung, karena omzetnya tidak
                    diketahui (bukan nol).
                  </>
                ) : (
                  <>
                    Ini <b>korelasi, bukan sebab-akibat</b>: akhir pekan cenderung
                    ramai sekaligus cenderung jadi hari orang rajin posting. Pakai
                    sebagai petunjuk arah, bukan bukti.
                  </>
                )}
              </p>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'sales' && (
        <div className="mgr-cols">
          <div className="mgr-col">
            <Panel
              judul="Pipeline Leads & Sales"
              sub={
                pipeline.belumAda
                  ? 'Belum ada lead — tambahkan calon klien di layar Leads & Sales.'
                  : `${pipeline.baruBulanIni} lead baru · ${pipeline.closingBulanIni} closing senilai ${formatRupiah(pipeline.nilaiClosing)}`
              }
              badge={
                pipeline.closingBulanIni + pipeline.gagalBulanIni > 0
                  ? `Konversi ${persen(pipeline.konversi)}`
                  : undefined
              }
              aksi={
                <button type="button" className="mgr-aksi-btn" onClick={onLihatLeads}>
                  Buka pipeline
                </button>
              }
            >
              {pipeline.belumAda ? (
                <p className="mgr-empty">
                  Pipeline masih kosong. KPI “leads baru per bulan” aktif begitu
                  lead pertama dicatat.
                </p>
              ) : (
                <>
                  <div className="mgr-bars">
                    {LEAD_TAHAP_ORDER.map((t) => {
                      const slot = pipeline.perTahap[t]
                      const maks = Math.max(
                        1,
                        ...LEAD_TAHAP_ORDER.map((x) => pipeline.perTahap[x].jumlah),
                      )
                      return (
                        <div key={t} className="mgr-bar-row">
                          <span className="mgr-bar-label">{LEAD_TAHAP_LABEL[t]}</span>
                          <span className="mgr-bar-track">
                            <span
                              className="mgr-bar-fill"
                              style={{
                                width: `${(slot.jumlah / maks) * 100}%`,
                                background:
                                  t === 'closing'
                                    ? 'var(--mint)'
                                    : t === 'gagal'
                                      ? 'var(--pink)'
                                      : 'var(--primary-2)',
                              }}
                            />
                          </span>
                          <span className="mgr-bar-val">
                            {slot.jumlah}
                            {slot.nilai > 0 && <em>{formatRupiah(slot.nilai)}</em>}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mgr-mini-stats">
                    {/*
                      Yang ditonjolkan nilai TERTIMBANG: satu lead "baru" 10 juta
                      bukan uang yang sama dengan satu negosiasi 10 juta.
                    */}
                    <MiniStat
                      k="Pipeline tertimbang"
                      v={formatRupiah(pipeline.nilaiPipelineTertimbang)}
                    />
                    <MiniStat k="Closing" v={formatRupiah(pipeline.nilaiClosing)} />
                    <MiniStat k="Perlu follow-up" v={`${pipeline.perluFollowup.length}`} />
                    <MiniStat
                      k="Dihubungi ≤ 2 hari"
                      v={
                        pipeline.kontakDinilai > 0
                          ? persen(pipeline.rasioKontakCepat)
                          : '—'
                      }
                    />
                  </div>
                  <p className="mgr-hint">
                    Nilai pipeline ditimbang peluang tiap tahap — Baru 10%,
                    Dihubungi 25%, Follow-up 50%, Negosiasi 75% — supaya angkanya
                    bukan daftar harapan. Nilai mentahnya{' '}
                    {formatRupiah(pipeline.nilaiPipeline)}.
                  </p>

                  {pipeline.perluFollowup.length > 0 && (
                    <div className="mgr-menunggak">
                      <b>Didiamkan terlalu lama</b>
                      <ul>
                        {pipeline.perluFollowup.slice(0, 5).map((b) => (
                          <li key={b.lead.id}>
                            <span>
                              {b.lead.nama || '(tanpa nama)'} ·{' '}
                              {LEAD_KATEGORI_LABEL[b.lead.kategori]}
                            </span>
                            <em>
                              {b.terakhir
                                ? `diam ${b.diamHari} hari`
                                : 'belum pernah dihubungi'}
                            </em>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sales.length > 0 && (
                    <div className="mgr-tabel-wrap" style={{ marginTop: 16 }}>
                      <table className="mgr-tabel">
                        <thead>
                          <tr>
                            <th>PIC</th>
                            <th className="num">Leads</th>
                            <th className="num">Closing</th>
                            <th className="num">Gagal</th>
                            <th className="num">Nilai closing</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sales.map((k) => (
                            <tr key={k.id}>
                              <td>
                                <span className="mgr-orang">
                                  <Avatar
                                    name={k.nama}
                                    foto={k.foto}
                                    colorIndex={colorIndexForName(k.nama)}
                                    size="sm"
                                  />
                                  <span className="mgr-orang-teks">
                                    <span className="nm">{k.nama}</span>
                                    <span className="jb">{k.jabatan || '—'}</span>
                                  </span>
                                </span>
                              </td>
                              <td className="num">{k.leadsBaru}</td>
                              <td className="num is-kuat">{k.closing}</td>
                              <td className={`num${k.gagal > 0 ? ' is-minus' : ''}`}>
                                {k.gagal}
                              </td>
                              <td className="num is-kuat">{formatRupiah(k.nilaiClosing)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </Panel>
          </div>

          <div className="mgr-col mgr-col--side">
            <KemitraanPanel
              ringkas={mou}
              eventBulanIni={jumlahEventBulanIni}
              targetEvent={target.event}
              onBuka={onLihatLeads}
            />
          </div>
        </div>
      )}


      {tab === 'keuangan' && (
        <>
        {/* ---------- KPI ---------- */}
        <div className="mgr-kpi-grid">
          <StatCard
            nada="primary"
            label="Omzet"
            nilai={formatRupiah(kini.omzet)}
            delta={delta(kini.omzet, lalu.omzet)}
            sub={`Studio ${formatRupiah(kini.omzetStudio)} · Event ${formatRupiah(kini.eventPendapatan)}`}
            icon={<Icons.wallet />}
          />
          <StatCard
            nada="pink"
            label="Biaya"
            nilai={formatRupiah(kini.biaya)}
            delta={delta(kini.biaya, lalu.biaya)}
            deltaBaik="turun"
            sub={`Pengeluaran ${formatRupiah(kini.pengeluaran)} · Biaya event ${formatRupiah(kini.eventBiaya)}`}
            icon={<Icons.cart />}
          />
          {/*
            Dua margin, bukan satu. "Margin operasional" (sebelum gaji) adalah
            angka yang benar-benar dikendalikan manajer dan boleh ia lihat;
            "margin bersih" membuka struktur gaji, jadi owner saja.
          */}
          <StatCard
            nada="mint"
            label="Laba operasional"
            nilai={formatRupiah(kini.labaOperasional)}
            delta={delta(kini.labaOperasional, lalu.labaOperasional)}
            sub={`Sebelum gaji · bulan lalu ${formatRupiah(lalu.labaOperasional)}`}
            icon={<Icons.check />}
          />
          <StatCard
            nada="yellow"
            label="Margin operasional"
            nilai={persen(kini.marginOperasional, 1)}
            delta={null}
            sub={`Sebelum gaji · bulan lalu ${persen(lalu.marginOperasional, 1)}`}
            icon={<Icons.info />}
          />
          {isOwner && (
            <StatCard
              nada="primary"
              label="Margin bersih (setelah gaji)"
              nilai={persen(kini.margin, 1)}
              delta={null}
              sub={`Laba ${formatRupiah(kini.laba)} · beban gaji ${formatRupiah(kini.bebanGaji)}`}
              icon={<Icons.lock />}
            />
          )}
        </div>

          <div className="mgr-cols">
            <div className="mgr-col">
              <Panel
                judul="Tren 6 Bulan"
                sub={
                  isOwner
                    ? 'Omzet dibandingkan biaya, dan laba bersih (setelah gaji) tiap bulan'
                    : 'Omzet dibandingkan biaya, dan laba operasional (sebelum gaji) tiap bulan'
                }
              >
                {/* Garis laba mengikuti hak akses: manajer melihat laba SEBELUM
                    gaji, owner melihat laba bersih. Struktur gaji tetap tertutup. */}
                <TrenChart
                  labaLabel={isOwner ? 'Laba bersih' : 'Laba operasional'}
                  rows={tren.map((t) => ({
                    label: labelBulanPendek(t.monthKey),
                    omzet: t.omzet,
                    biaya: isOwner ? t.biaya : t.biayaOperasional,
                    laba: isOwner ? t.laba : t.labaOperasional,
                    aktif: t.monthKey === monthKey,
                  }))}
                />
              </Panel>

              <Panel
                judul="Komposisi Pendapatan"
                sub={`Total ${formatRupiah(kini.omzet)}${kini.potonganHarga > 0 ? ` · potongan harga ${formatRupiah(kini.potonganHarga)}` : ''}`}
              >
                {komposisi.length === 0 ? (
                  <p className="mgr-empty">Belum ada pemasukan di periode ini.</p>
                ) : (
                  <div className="mgr-bars">
                    {komposisi.map((k) => (
                      <div key={k.label} className="mgr-bar-row">
                        <span className="mgr-bar-label">{k.label}</span>
                        <span className="mgr-bar-track">
                          <span
                            className="mgr-bar-fill"
                            style={{
                              width: `${(k.nilai / komposisi[0].nilai) * 100}%`,
                              background: k.warna,
                            }}
                          />
                        </span>
                        <span className="mgr-bar-val">
                          {formatRupiah(k.nilai)}
                          <em>{persen(k.nilai / (kini.omzet || 1))}</em>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mgr-mini-stats">
                  <MiniStat k="Tiket" v={`${kini.qtyTiket}`} />
                  <MiniStat k="Cetak" v={`${kini.qtyCetak}`} />
                  <MiniStat k="Upgrade" v={`${kini.qtyUpgrade}`} />
                  <MiniStat k="Produk" v={`${kini.qtyProduk}`} />
                </div>
              </Panel>
            </div>

            <div className="mgr-col mgr-col--side">
              {isOwner && kas && (
                <Panel
                  judul="Kas &amp; Rekonsiliasi"
                  sub="Kumulatif s/d akhir periode terpilih · owner"
                  badge="Owner"
                >
                  <SaldoRow
                    label="Dompet (tunai)"
                    seharusnya={kas.dompetDiharapkan}
                    aktual={saldoAktual.dompet}
                  />
                  <SaldoRow
                    label="Rekening (QRIS)"
                    seharusnya={kas.rekeningDiharapkan}
                    aktual={saldoAktual.rekening}
                  />
                  <div className="mgr-kas-rincian">
                    <Rincian k="Tunai diterima" v={formatRupiah(kas.tunai)} />
                    <Rincian k="QRIS diterima" v={formatRupiah(kas.qris)} />
                    <Rincian k="Setoran ke rekening" v={formatRupiah(kas.setoran)} />
                    <Rincian
                      k="Pengeluaran tunai"
                      v={`− ${formatRupiah(kas.pengeluaranCash)}`}
                    />
                    <Rincian
                      k="Pengeluaran rekening"
                      v={`− ${formatRupiah(kas.pengeluaranRek)}`}
                    />
                    <Rincian
                      k="Gaji sudah dibayar"
                      v={`− ${formatRupiah(kas.gajiCash + kas.gajiRek)}`}
                    />
                    <Rincian
                      k="Saldo uang besar"
                      v={formatRupiah(kas.uangBesarSaldo)}
                    />
                  </div>
                  <p className="mgr-hint">
                    Saldo aktual diisi di layar Pemasukan → Rangkuman akhir bulan.
                    Selisih ≠ 0 berarti ada uang yang belum tercatat.
                  </p>
                </Panel>
              )}

              {/*
                Penilaian kualitatif owner — kelompok KPI berbobot penuh (10%)
                yang tidak punya tab sendiri, karena ia bukan tugas yang bisa
                dikerjakan manajer. Ditaruh di sini, bersama panel owner-only
                lainnya, dan bukan di kepala tab mana pun: yang mengisinya
                cuma owner, dan mengisinya adalah pekerjaan akhir bulan.
              */}
              {isOwner && kpi && kelompokOwner && (
                <Panel
                  judul="Penilaian Owner"
                  // Alasan kelompoknya sudah ditulis KelompokBlok di bawah —
                  // mengulanginya di sini membuat kalimat yang sama tampil dua
                  // kali beruntun.
                  sub={`Diisi saat evaluasi bulanan. Bobot ${persen(kelompokOwner.bobot)} dari skor manajer.`}
                  badge={
                    kelompokOwner.skor != null
                      ? `${nilaiOwner?.nilai ?? 0} dari 5`
                      : 'Belum diisi'
                  }
                >
                  <div
                    className={
                      'mgr-kpi-kelompok-list' +
                      (kpi.targetDisetujui ? '' : ' is-simulasi')
                    }
                  >
                    <KelompokBlok kelompok={kelompokOwner} laju={kpi.progres} />
                  </div>
                  <PenilaianOwnerBox
                    key={monthKey}
                    nilai={nilaiOwner?.nilai ?? 0}
                    catatan={nilaiOwner?.catatan}
                    onSimpan={simpanPenilaian}
                  />
                </Panel>
              )}

              {!isOwner && (
                <div className="mgr-locked">
                  <span className="mgr-locked-ikon">
                    <Icons.lock />
                  </span>
                  <div>
                    <div className="mgr-locked-judul">
                      KPI, gaji &amp; kas disembunyikan
                    </div>
                    <p>
                      Scorecard KPI Manajer, nominal gaji per karyawan, dan
                      rekonsiliasi kas hanya bisa dibuka oleh owner. Antrean
                      kerja tiap tugas tetap terbuka di kepala tiap tab.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// =============================================================
// Komponen kecil
// =============================================================

function Panel({
  judul,
  sub,
  badge,
  aksi,
  children,
}: {
  judul: ReactNode
  sub?: ReactNode
  badge?: string
  /** Tombol opsional di kanan judul (mis. "Atur target" untuk owner). */
  aksi?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mgr-panel">
      <div className="mgr-panel-head">
        <div>
          <h3>{judul}</h3>
          {sub && <p>{sub}</p>}
        </div>
        <div className="mgr-panel-kanan">
          {badge && <span className="mgr-panel-badge">{badge}</span>}
          {aksi}
        </div>
      </div>
      <div className="mgr-panel-body">{children}</div>
    </section>
  )
}

/**
 * Stok & salah cetak.
 *
 * Panel ini hampir selalu berkata "aman", jadi bentuk bawaannya sengaja cuma
 * dua baris: satu kalimat status di kepala, satu baris sisa stok di badannya.
 * Daftar item yang harus dibeli — beserta hitungan hari sisanya — baru
 * dibuka kalau ditekan, supaya kolom samping tidak habis dipakai angka yang
 * tidak perlu dibaca hari itu.
 */
function KesehatanOpsPanel({ ops }: { ops: Operasional }) {
  const [buka, setBuka] = useState(false)
  const perlu = ops.stokKritis.length
  // Badge dipakai untuk urgensi, bukan untuk mengulang hitungan di sub.
  const mendesak = ops.stokKritis.filter((s) => s.tingkat === 'merah').length
  return (
    <Panel
      judul="Kesehatan Operasional"
      sub={
        (perlu === 0
          ? 'Stok aman minggu ini'
          : `${perlu} item perlu dibeli`) +
        ` · ${ops.salahCetakBulan} lembar salah cetak bulan ini`
      }
      badge={mendesak > 0 ? `${mendesak} mendesak` : undefined}
      aksi={
        <button
          type="button"
          className="mgr-aksi-btn"
          onClick={() => setBuka((v) => !v)}
          aria-expanded={buka}
        >
          {buka ? 'Tutup' : 'Lihat stok'}
        </button>
      }
    >
      {/* Sisa stok total: satu baris, cukup untuk tahu perlu dibuka atau tidak. */}
      <div className="mgr-ops-ringkas">
        <span>
          <b>{ops.totalKertas}</b> lembar kertas
        </span>
        <span>
          <b>{ops.totalFrame}</b> frame
        </span>
        <span>
          <b>{ops.totalTinta}</b> botol tinta
        </span>
        <span>
          <b>{ops.amplop}</b> amplop
        </span>
      </div>

      {buka &&
        (perlu === 0 ? (
          <p className="mgr-empty">Tidak ada stok yang perlu dibeli minggu ini.</p>
        ) : (
          <>
            <ul className="mgr-stok">
              {ops.stokKritis.map((s) => (
                <li
                  key={s.nama}
                  className={
                    (s.stok === 0 ? 'is-habis' : '') +
                    (s.tingkat === 'merah' ? ' is-merah' : ' is-kuning')
                  }
                >
                  <span className="nm">{s.nama}</span>
                  <span className="vl">
                    {s.stok} {s.satuan}
                    {/*
                      Hari sisa mengalahkan ambang tetap: 10 lembar yang laku
                      1/hari tidak mendesak, 10 lembar yang laku 5/hari harus
                      dibeli hari ini.
                    */}
                    <em>
                      {s.hariSisa != null
                        ? `± ${Math.floor(s.hariSisa)} hari lagi habis`
                        : `ambang ${s.ambang} · belum ada data pemakaian`}
                    </em>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mgr-hint">
              Urutan memakai <b>hari sisa</b> = stok ÷ rata-rata pemakaian{' '}
              {JENDELA_PEMAKAIAN} hari terakhir. Merah = kurang dari{' '}
              {HARI_SISA_MERAH} hari. Item tanpa riwayat pemakaian (mis. tinta)
              tetap memakai ambang tetap.
            </p>
          </>
        ))}
    </Panel>
  )
}

const KATEGORI_MASALAH_ORDER: MasalahTeknis['kategori'][] = [
  'printer',
  'kamera',
  'jaringan',
  'listrik',
  'aplikasi',
  'lain',
]
const TINGKAT_MASALAH_ORDER: MasalahTeknis['tingkat'][] = [
  'stop',
  'ganggu',
  'ringan',
]

/** "17 jam" / "2,5 hari" — umur & durasi dalam satuan yang enak dibaca. */
function lamaTeks(jam: number): string {
  if (jam < 1) return 'kurang dari sejam'
  if (jam < 24) return `${Math.round(jam)} jam`
  return `${(jam / 24).toFixed(1).replace('.', ',')} hari`
}

/**
 * Log kendala teknis — tugas manajer nomor satu yang sampai sekarang tidak
 * punya tempat di mana pun.
 *
 * Bentuknya sengaja formulir satu baris, bukan modal: kendala dilaporkan
 * justru saat studio sedang repot, dan apa pun yang butuh lebih dari satu tap
 * untuk dibuka akan berakhir sebagai "nanti saja" lalu tidak pernah tercatat.
 * Yang wajib hanya judul; kategori & tingkat punya nilai bawaan yang benar
 * untuk kasus paling sering.
 */
function MasalahTeknisPanel({
  siap,
  ringkas,
  namaById,
  bisaTutup,
  onLapor,
  onTutup,
  onBukaLagi,
  onHapus,
}: {
  /** false = tabelnya belum ada; panel jadi baca-saja & menerangkan sebabnya. */
  siap: boolean
  ringkas: RingkasMasalah
  namaById: Map<string, string>
  /** Menandai selesai = keputusan pengelola. Lihat RLS migration 0055. */
  bisaTutup: boolean
  onLapor: (baru: Omit<MasalahTeknis, 'id' | 'dilaporkanPada'>) => void
  onTutup: (id: string, solusi: string) => void
  onBukaLagi: (id: string) => void
  onHapus: (id: string) => void
}) {
  const [judul, setJudul] = useState('')
  const [kategori, setKategori] = useState<MasalahTeknis['kategori']>('printer')
  const [tingkat, setTingkat] = useState<MasalahTeknis['tingkat']>('ganggu')
  const [catatan, setCatatan] = useState('')
  const [buka, setBuka] = useState(false)
  /** Id kendala yang sedang ditanyai "apa yang membereskannya?". */
  const [menutup, setMenutup] = useState<string | null>(null)
  const [solusi, setSolusi] = useState('')

  function kirim() {
    if (!judul.trim()) return
    onLapor({
      judul: judul.trim(),
      kategori,
      tingkat,
      catatan: catatan.trim(),
      solusi: '',
    })
    setJudul('')
    setCatatan('')
    setTingkat('ganggu')
    setBuka(false)
  }

  return (
    <Panel
      judul="Masalah Teknis"
      sub={
        !siap
          ? 'Fitur ini belum aktif — tabelnya belum ada di database.'
          : ringkas.belumAda
            ? 'Belum ada kendala tercatat — laporkan begitu ada alat yang bermasalah, sekecil apa pun.'
            : `${ringkas.beresBulanIni} dari ${ringkas.masukBulanIni} kendala bulan ini beres` +
              (ringkas.rataJamBeres > 0
                ? ` · rata-rata ${lamaTeks(ringkas.rataJamBeres)}`
                : '')
      }
      badge={
        !siap
          ? 'Belum aktif'
          : ringkas.terbuka.length > 0
            ? `${ringkas.terbuka.length} terbuka`
            : ringkas.belumAda
              ? undefined
              : 'Semua beres'
      }
      aksi={
        siap ? (
          <button
            type="button"
            className={'mgr-aksi-btn' + (buka ? '' : ' is-utama')}
            onClick={() => setBuka((v) => !v)}
          >
            {buka ? 'Tutup' : 'Lapor kendala'}
          </button>
        ) : undefined
      }
    >
      {/*
        Tanpa tabelnya, satu-satunya hal jujur yang bisa dilakukan panel ini
        adalah menerangkan kenapa ia kosong. Menampilkan tombol lapor akan
        menerima laporan lalu membuangnya diam-diam: insert-nya gagal, hook
        write-through menarik ulang data dari server, dan ketikan operator
        lenyap seolah tidak pernah ada.
      */}
      {!siap && (
        <p className="mgr-empty">
          Jalankan migrasi <code>0055_masalah_teknis.sql</code> di Supabase
          untuk mengaktifkan log kendala. Sampai itu dilakukan, panel ini kosong
          dan KPI “Kendala teknis dibereskan” tidak ikut dinilai — sisa
          dashboard tidak terpengaruh.
        </p>
      )}

      {buka && (
        <div className="mgr-masalah-form">
          <input
            type="text"
            value={judul}
            autoFocus
            placeholder="Apa yang bermasalah? mis. Printer 2 garis-garis"
            onChange={(e) => setJudul(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && kirim()}
          />
          <div className="mgr-masalah-pilih">
            <label>
              <span>Alat</span>
              <select
                value={kategori}
                onChange={(e) =>
                  setKategori(e.target.value as MasalahTeknis['kategori'])
                }
              >
                {KATEGORI_MASALAH_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {KATEGORI_MASALAH_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Dampak</span>
              <select
                value={tingkat}
                onChange={(e) =>
                  setTingkat(e.target.value as MasalahTeknis['tingkat'])
                }
              >
                {TINGKAT_MASALAH_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TINGKAT_MASALAH_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <textarea
            rows={2}
            value={catatan}
            placeholder="Detail tambahan (boleh kosong)"
            onChange={(e) => setCatatan(e.target.value)}
          />
          <div className="mgr-masalah-aksi">
            <button
              type="button"
              className="mgr-aksi-btn is-utama"
              disabled={!judul.trim()}
              onClick={kirim}
            >
              Simpan laporan
            </button>
          </div>
        </div>
      )}

      {!siap ? null : ringkas.terbuka.length === 0 ? (
        <p className="mgr-empty">
          {ringkas.belumAda
            ? 'Belum ada satu pun laporan. Selama tidak ada yang dicatat, KPI "kendala teknis dibereskan" tetap nonaktif — nol laporan bukan nol masalah.'
            : '✅ Tidak ada kendala yang menggantung.'}
        </p>
      ) : (
        <ul className="mgr-masalah-list">
          {ringkas.terbuka.map(({ masalah: m, umurHari }) => (
            <li key={m.id} className={`mgr-masalah-row is-${m.tingkat}`}>
              <div className="mgr-masalah-kepala">
                <span className={`mgr-masalah-tag is-${m.tingkat}`}>
                  {TINGKAT_MASALAH_LABEL[m.tingkat]}
                </span>
                <span className="mgr-masalah-judul">{m.judul}</span>
                <em className="mgr-masalah-umur">
                  {umurHari === 0 ? 'hari ini' : `${umurHari} hari`}
                </em>
              </div>
              <div className="mgr-masalah-meta">
                {KATEGORI_MASALAH_LABEL[m.kategori]}
                {m.dilaporkanOleh &&
                  ` · ${namaById.get(m.dilaporkanOleh) ?? 'dilaporkan operator'}`}
                {m.catatan && ` · ${m.catatan}`}
              </div>
              {bisaTutup &&
                (menutup === m.id ? (
                  <div className="mgr-masalah-tutup">
                    <input
                      type="text"
                      autoFocus
                      value={solusi}
                      placeholder="Apa yang membereskannya?"
                      onChange={(e) => setSolusi(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        onTutup(m.id, solusi)
                        setMenutup(null)
                        setSolusi('')
                      }}
                    />
                    <button
                      type="button"
                      className="mgr-aksi-btn is-utama"
                      onClick={() => {
                        onTutup(m.id, solusi)
                        setMenutup(null)
                        setSolusi('')
                      }}
                    >
                      Tandai selesai
                    </button>
                    <button
                      type="button"
                      className="mgr-aksi-btn"
                      onClick={() => {
                        setMenutup(null)
                        setSolusi('')
                      }}
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <div className="mgr-masalah-aksi">
                    <button
                      type="button"
                      className="mgr-aksi-btn"
                      onClick={() => {
                        setMenutup(m.id)
                        setSolusi('')
                      }}
                    >
                      Tandai selesai
                    </button>
                    <button
                      type="button"
                      className="mgr-aksi-btn"
                      onClick={() => onHapus(m.id)}
                    >
                      Hapus
                    </button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}

      {siap && ringkas.beresTerakhir.length > 0 && (
        <div className="mgr-masalah-riwayat">
          <b>Terakhir dibereskan</b>
          <ul>
            {ringkas.beresTerakhir.map((m) => (
              <li key={m.id}>
                <span className="mgr-masalah-beres">
                  <span className="tgl">
                    {labelTanggalPendek(
                      todayKey(new Date(m.selesaiPada as string)),
                    )}
                  </span>
                  <span className="isi">
                    {m.judul}
                    {m.solusi ? ` — ${m.solusi}` : ''}
                  </span>
                  {bisaTutup && (
                    <button
                      type="button"
                      className="mgr-aksi-btn"
                      onClick={() => onBukaLagi(m.id)}
                    >
                      Buka lagi
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        Alat yang paling sering rewel. Ini satu-satunya angka di panel ini yang
        bukan antrean: ia menjawab pertanyaan pembelian, bukan pertanyaan hari
        ini — printer yang muncul empat kali sebulan sudah bukan urusan servis.
      */}
      {siap && ringkas.perKategori.length > 0 && (
        <p className="mgr-hint">
          Bulan ini:{' '}
          {ringkas.perKategori
            .map((k) => `${KATEGORI_MASALAH_LABEL[k.kategori]} ${k.jumlah}×`)
            .join(' · ')}
        </p>
      )}
    </Panel>
  )
}

/**
 * MoU, sponsorship & event — separuh tugas nomor dua yang selama ini tidak
 * muncul sama sekali di dashboard.
 *
 * Datanya sudah lama ada (`ringkasKemitraan`, migration 0053), tapi hanya bisa
 * dilihat dengan membuka layar Leads lalu berpindah tab. Panel ini tidak
 * menduplikasi formulirnya — ia hanya menjawab "ada yang menunggu keputusanku?"
 * lalu melemparkan ke layar aslinya.
 */
function KemitraanPanel({
  ringkas,
  eventBulanIni,
  targetEvent,
  onBuka,
}: {
  ringkas: RingkasKemitraan
  eventBulanIni: number
  targetEvent: number
  onBuka: () => void
}) {
  return (
    <Panel
      judul="MoU, Sponsorship & Event"
      sub={
        ringkas.belumAda
          ? 'Belum ada pengajuan tercatat — catat proposal yang masuk di layar Leads & Sales, tab MoU.'
          : `${ringkas.masukBulanIni} pengajuan masuk · ${ringkas.disetujuiBulanIni} disetujui bulan ini`
      }
      badge={`${eventBulanIni}/${targetEvent} event`}
      aksi={
        <button type="button" className="mgr-aksi-btn" onClick={onBuka}>
          Buka MoU
        </button>
      }
    >
      <div className="mgr-mini-stats">
        <MiniStat k="Menunggu" v={String(ringkas.antre.length)} />
        <MiniStat k="Didiamkan" v={String(ringkas.didiamkan)} />
        <MiniStat k="MoU habis" v={String(ringkas.mouHabis.length)} />
      </div>

      {ringkas.antre.length > 0 && (
        <ul className="mgr-slot-ringkas">
          {ringkas.antre.slice(0, 4).map(({ k, umurHari }) => (
            <li key={k.id} className={umurHari >= 7 ? 'is-macet' : 'is-nanti'}>
              <span className="ikon">{umurHari >= 7 ? '!' : '○'}</span>
              <span className="lbl">{k.instansi}</span>
              <em>
                {umurHari} hari · {formatRupiah(k.nilaiDiminta)}
              </em>
            </li>
          ))}
        </ul>
      )}

      {ringkas.imbalanTertunggak.length > 0 && (
        <p className="mgr-hint">
          {ringkas.imbalanTertunggak.length} sponsor sudah disetujui tapi
          imbalannya belum ditagih — uangnya sudah keluar, kompensasinya belum
          masuk.
        </p>
      )}
    </Panel>
  )
}

const STATUS_LABEL: Record<BarisKPI['status'], string> = {
  tercapai: 'Tercapai',
  ontrack: 'On track',
  perhatian: 'Perlu perhatian',
  tertinggal: 'Tertinggal',
  'belum-aktif': 'Belum aktif',
}

/**
 * Satu kelompok KPI berbobot.
 *
 * Kepalanya menyebut bobot dan skor kelompok, badannya baris-baris KPI-nya.
 * Bobot ditampilkan terus-menerus karena itulah yang menjawab "kenapa skor
 * saya segini padahal semua checklist hijau" — Keuangan berbobot 30%.
 */
function KelompokBlok({
  kelompok,
  laju,
}: {
  kelompok: SkorKelompok
  laju: number
}) {
  const mati = kelompok.skor == null
  return (
    <div className={'mgr-kpi-kelompok' + (mati ? ' is-mati' : '')}>
      <div className="mgr-kpi-kelompok-head">
        <span className="mgr-kpi-kelompok-nama">{kelompok.label}</span>
        <span className="mgr-kpi-kelompok-bobot">
          Bobot {Math.round(kelompok.bobot * 100)}%
        </span>
        <span className="spacer" />
        <span
          className={
            'mgr-kpi-kelompok-skor' +
            (mati
              ? ' is-mati'
              : (kelompok.skor as number) >= 0.9
                ? ' is-baik'
                : (kelompok.skor as number) >= 0.7
                  ? ' is-sedang'
                  : ' is-buruk')
          }
        >
          {mati ? 'Belum dinilai' : persen(kelompok.skor as number)}
        </span>
      </div>
      <p className="mgr-kpi-kelompok-alasan">
        {kelompok.alasan}
        {mati && ' — kelompok ini dikeluarkan dari pembagi skor.'}
      </p>
      <div className="mgr-kpi-list">
        {kelompok.baris.map((b) => (
          <KpiRow key={b.id} baris={b} laju={laju} />
        ))}
      </div>
    </div>
  )
}

/**
 * Penilaian kualitatif owner 1–5 untuk periode terpilih.
 *
 * Satu-satunya KPI yang tidak diturunkan dari data — dan itu disengaja:
 * kesan owner tidak punya jejak di tabel mana pun. Hanya dirender di panel
 * "Penilaian Owner" pada tab Keuangan yang owner-only, jadi tidak perlu mode
 * baca-saja.
 */
/**
 * Formulir laporan closing satu hari: pilih status, tulis ceritanya, simpan.
 *
 * Punya draf sendiri (bukan menulis tiap ketikan ke database) supaya mengetik
 * paragraf tidak memicu satu penulisan Supabase per huruf. Dipasang dengan
 * `key={tanggal}` dari pemanggilnya, jadi berpindah tanggal otomatis memuat
 * ulang drafnya — tanpa useEffect.
 */
function LaporanBox({
  tanggal,
  awal,
  penulis,
  bisaTulis,
  onSimpan,
  onHapus,
}: {
  tanggal: string
  awal?: LaporanHarian
  /** Nama penulisnya, sudah dicarikan pemanggil dari `awal.oleh`. */
  penulis?: string
  bisaTulis: boolean
  onSimpan: (
    tanggal: string,
    status: StatusLaporanHarian,
    catatan: string,
  ) => void
  onHapus: (tanggal: string) => void
}) {
  const [status, setStatus] = useState<StatusLaporanHarian>(awal?.status ?? 'aman')
  const [catatan, setCatatan] = useState(awal?.catatan ?? '')

  const berubah =
    status !== (awal?.status ?? 'aman') || catatan.trim() !== (awal?.catatan ?? '')

  /*
    Jejak singkat: siapa menulis, dan kapan terakhir disentuh. Jam saja kalau
    ditulis pada hari laporannya (itu memang alurnya — tulis setelah closing);
    "disunting" beserta tanggalnya kalau lebih baru, karena itulah satu-satunya
    hal yang tidak bisa ditebak owner dari isi laporan.
  */
  const waktu = awal?.diperbarui
  const jejak = [
    penulis,
    waktu
      ? todayKey(new Date(waktu)) === tanggal
        ? formatJam(waktu)
        : `disunting ${labelTanggalPendek(todayKey(new Date(waktu)))} ${formatJam(waktu)}`
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  /** Kembalikan formulir ke isi yang tersimpan — batalkan ketikan yang belum disimpan. */
  function batalkanDraf() {
    setStatus(awal?.status ?? 'aman')
    setCatatan(awal?.catatan ?? '')
  }

  if (!bisaTulis) {
    return (
      <p className="mgr-empty">
        {labelHariTanggal(tanggal)} belum tiba — laporannya ditulis setelah
        closing hari itu.
      </p>
    )
  }

  return (
    <div className="mgr-lap-form">
      <div className="mgr-lap-head">
        <span className="mgr-lap-tgl">{labelHariTanggal(tanggal)}</span>
        {awal && (
          <span className="mgr-lap-sudah">
            {jejak || 'sudah ditulis'}
            <button
              type="button"
              className="mgr-lap-hapus"
              title="Hapus laporan hari ini"
              aria-label={`Hapus laporan ${labelHariTanggal(tanggal)}`}
              onClick={() => {
                if (
                  confirm(
                    `Hapus laporan ${labelHariTanggal(tanggal)}? Hari itu kembali terhitung belum ada laporan.`,
                  )
                ) {
                  onHapus(tanggal)
                  // Komponen tidak remount (key-nya tetap tanggal ini), jadi
                  // formulirnya dikosongkan manual — bukan ke isi yang barusan
                  // dihapus.
                  setStatus('aman')
                  setCatatan('')
                }
              }}
            >
              ×
            </button>
          </span>
        )}
      </div>

      <div className="mgr-lap-status">
        {STATUS_LAPORAN.map((st) => (
          <button
            key={st}
            type="button"
            className={`mgr-lap-pilih is-${st}` + (status === st ? ' is-on' : '')}
            onClick={() => setStatus(st)}
          >
            {status === st ? '●' : '○'} {STATUS_LAPORAN_LABEL[st]}
          </button>
        ))}
      </div>

      <textarea
        className="mgr-lap-teks"
        rows={3}
        value={catatan}
        placeholder="Mis. “Aman terkendali, semua operator kerja rapi.” atau “Printer macet jam 4, sudah head cleaning dan lancar lagi.”"
        onChange={(e) => setCatatan(e.target.value)}
      />

      <div className="mgr-lap-simpan">
        <button
          type="button"
          className="mgr-aksi-btn is-utama"
          disabled={!berubah}
          onClick={() => onSimpan(tanggal, status, catatan)}
        >
          {awal ? 'Perbarui laporan' : 'Simpan laporan'}
        </button>
        {berubah && (
          <>
            <button type="button" className="mgr-aksi-btn" onClick={batalkanDraf}>
              Batalkan
            </button>
            <em>belum tersimpan</em>
          </>
        )}
      </div>
    </div>
  )
}

function PenilaianOwnerBox({
  nilai,
  catatan,
  onSimpan,
}: {
  nilai: number
  catatan?: string
  onSimpan: (nilai: number, catatan?: string) => void
}) {
  const [draf, setDraf] = useState(catatan ?? '')
  return (
    <div className="mgr-nilai-owner">
      <span className="mgr-nilai-lbl">Penilaian owner</span>
      <div className="mgr-nilai-skala">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={'mgr-nilai-btn' + (nilai === n ? ' is-on' : '')}
            onClick={() => onSimpan(n, draf.trim() || undefined)}
          >
            {n}
          </button>
        ))}
      </div>
      <input
        className="mgr-nilai-catatan"
        placeholder="Catatan evaluasi (opsional)"
        value={draf}
        onChange={(e) => setDraf(e.target.value)}
        onBlur={() => nilai > 0 && onSimpan(nilai, draf.trim() || undefined)}
      />
    </div>
  )
}

/**
 * Satu baris scorecard: KPI, bar capaian, dan status.
 *
 * Bar menampilkan DUA hal sekaligus — capaian (isian berwarna) dan penanda
 * `laju` (garis tipis di posisi "seharusnya sudah sampai sini kalau on track").
 * Tanpa penanda itu, bar 30% di tanggal 9 tidak bisa dibedakan bagus/buruk.
 *
 * Angka yang dicetak di bawah bar adalah capaian terhadap PACE ("42% dari
 * pace"), bukan terhadap target penuh — itulah angka yang dipakai berhitung.
 */
function KpiRow({ baris, laju }: { baris: BarisKPI; laju: number }) {
  const mati = baris.status === 'belum-aktif'
  return (
    <div className={`mgr-kpi-row is-${baris.status}`}>
      <div className="mgr-kpi-teks">
        <span className="mgr-kpi-label">{baris.label}</span>
        <span className="mgr-kpi-sumber">
          {mati ? `Butuh: ${baris.butuh}` : baris.sumber}
        </span>
      </div>
      <div className="mgr-kpi-bar">
        <span className="mgr-kpi-track">
          <span
            className="mgr-kpi-fill"
            style={{ width: `${Math.min(100, baris.progress * 100)}%` }}
          />
          {!mati && baris.prorata && laju > 0 && laju < 1 && (
            <span
              className="mgr-kpi-laju"
              style={{ left: `${laju * 100}%` }}
              title="Posisi seharusnya kalau on track"
            />
          )}
        </span>
        <span className="mgr-kpi-capaian">
          {baris.teks}
          {!mati && (
            <em>
              {persen(baris.capaian)} dari pace
              {baris.prorata && ` (${formatPace(baris.pace)})`}
            </em>
          )}
        </span>
      </div>
      <span className="mgr-kpi-status">{STATUS_LABEL[baris.status]}</span>
    </div>
  )
}

/** Field target yang berupa angka — `disetujui`/`disetujuiPada` bukan isian. */
type FieldTargetKey = Exclude<keyof TargetBulanan, 'disetujui' | 'disetujuiPada'>

const FIELD_TARGET: {
  key: FieldTargetKey
  label: string
  sufiks?: string
  /** Disimpan 0–1 tapi diisi dalam persen supaya enak diketik. */
  persen?: boolean
}[] = [
  { key: 'omzet', label: 'Omzet', sufiks: 'Rp' },
  { key: 'tiket', label: 'Tiket terjual' },
  { key: 'event', label: 'Event terlaksana' },
  { key: 'campaign', label: 'Campaign dieksekusi' },
  { key: 'ide', label: 'Ide baru' },
  { key: 'leads', label: 'Leads baru' },
  { key: 'closing', label: 'Closing' },
  { key: 'sosmedHari', label: 'Hari sosmed aktif' },
  { key: 'kepatuhan', label: 'Kepatuhan checklist', sufiks: '%', persen: true },
  { key: 'shiftCover', label: 'Shift ter-cover', sufiks: '%', persen: true },
  {
    key: 'mandiri',
    label: 'Antrean ditutup tanpa owner',
    sufiks: '%',
    persen: true,
  },
  { key: 'penilaian', label: 'Penilaian owner minimal', sufiks: '1–5' },
]

/**
 * Form target satu periode. Owner-only (dipasang di Panel lewat prop `aksi`).
 * Tombol "Isi otomatis" mengembalikan saran 2× baseline — jadi angka 2× itu
 * ditawarkan, bukan dipaksakan.
 */
/**
 * Kontrak ritme konten mingguan — DUA ANGKA, tidak ada nama hari.
 *
 * Bentuk sebelumnya meminta hari untuk take, edit, dan tayang, dan itulah yang
 * membuatnya salah: satu rantai hari tetap untuk seluruh minggu berarti konten
 * kedua & ketiga menumpuk di tanggal yang sama, dan tidak ada cara memilih
 * kapan masing-masing tayang. Sekarang harinya milik tiap kartu (dipilih di
 * papan), sementara yang disepakati di sini cuma seberapa sering dan seberapa
 * awal disiapkan.
 */
function RitmeEditor({
  ritme,
  disetujui,
  bolehSetujui,
  onSimpan,
  onBatal,
}: {
  ritme: RitmeKonten
  disetujui: boolean
  /**
   * Owner. Manajer boleh MENGUSULKAN ritme tapi tidak menyetujuinya: ritme
   * adalah patokan yang dipakai menilai manajer sendiri, jadi kalau ia boleh
   * mengesahkan angkanya, scorecard-nya berhenti berarti.
   */
  bolehSetujui: boolean
  onSimpan: (r: RitmeKonten) => void
  onBatal: () => void
}) {
  // Ritme lama (berbasis nama hari) langsung dinormalkan ke bentuk baru begitu
  // editor dibuka, jadi menyimpan sekali saja sudah membuang sisa `hari`.
  const [draf, setDraf] = useState<RitmeKonten>(() => ({
    jumlah: ritme.jumlah,
    siapkan: jarakTahap(ritme).take,
    disetujui: ritme.disetujui,
    disetujuiPada: ritme.disetujuiPada,
  }))
  const siapkan = draf.siapkan ?? 0
  // Tidak ada lagi keadaan yang tidak sah untuk ditahan (dua-duanya angka yang
  // sudah di-clamp), jadi yang tersisa cuma: perlu tidaknya disetujui ulang.
  // Ritme lama yang masih berbentuk nama hari selalu dianggap berubah, supaya
  // persetujuannya ikut memindahkannya ke bentuk baru.
  const berubah =
    ritme.siapkan == null ||
    draf.jumlah !== ritme.jumlah ||
    siapkan !== jarakTahap(ritme).take

  return (
    <div className="mgr-target-editor">
      <div className="mgr-ritme-grid">
        <label className="mgr-target-field">
          <span>
            Minimal per minggu<em>konten</em>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={7}
            value={draf.jumlah}
            onChange={(e) =>
              setDraf((d) => ({
                ...d,
                jumlah: Math.min(7, Math.max(1, Number(e.target.value) || 1)),
              }))
            }
          />
        </label>
        <label className="mgr-target-field">
          <span>
            Siapkan sejak<em>H-…</em>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={SIAPKAN_MAKS}
            value={siapkan}
            onChange={(e) =>
              setDraf((d) => ({
                ...d,
                siapkan: Math.min(
                  SIAPKAN_MAKS,
                  Math.max(0, Math.round(Number(e.target.value) || 0)),
                ),
              }))
            }
          />
        </label>
      </div>
      <p className="mgr-hint">
        {teksRitme(draf)} — {contohRantai(siapkan)}. Hari tayangnya sendiri
        dipilih per kartu di papan, jadi konten boleh terbit hari apa saja dan
        boleh lebih dari {draf.jumlah}× seminggu; angka itu batas bawah, bukan
        kuota.
      </p>
      {!bolehSetujui && (
        <p className="mgr-hint">
          Angkanya boleh Anda ubah, tapi yang mengesahkan tetap owner — inilah
          patokan yang dipakai menilai Anda. Selama belum disetujui, papan tetap
          jalan dan skornya dihitung sebagai simulasi.
          {berubah && disetujui
            ? ' Menyimpan perubahan ini mencabut persetujuan yang sekarang.'
            : ''}
        </p>
      )}
      <div className="mgr-target-aksi">
        <span className="spacer" />
        <button type="button" className="mgr-aksi-btn" onClick={onBatal}>
          Batal
        </button>
        <button
          type="button"
          className={'mgr-aksi-btn' + (bolehSetujui ? '' : ' is-utama')}
          onClick={() =>
            onSimpan(
              // Usulan manajer yang mengubah angkanya mencabut persetujuan
              // lama: patokannya berubah, jadi harus disahkan ulang. Simpan
              // milik owner sendiri tidak perlu itu — ia memang pengesahnya.
              bolehSetujui || !berubah
                ? draf
                : { ...draf, disetujui: false, disetujuiPada: undefined },
            )
          }
        >
          {bolehSetujui ? 'Simpan' : 'Simpan usulan'}
        </button>
        {bolehSetujui && (
          <button
            type="button"
            className="mgr-aksi-btn is-utama"
            disabled={disetujui && !berubah}
            onClick={() =>
              onSimpan({
                ...draf,
                disetujui: true,
                disetujuiPada: new Date().toISOString(),
              })
            }
          >
            {disetujui ? 'Simpan & setujui ulang' : 'Setujui ritme'}
          </button>
        )}
      </div>
    </div>
  )
}

function TargetEditor({
  awal,
  saran,
  onSimpan,
  onBatal,
}: {
  awal: TargetBulanan
  saran: TargetBulanan
  onSimpan: (t: TargetBulanan) => void
  onBatal: () => void
}) {
  const [draf, setDraf] = useState<TargetBulanan>(awal)

  function ubah(key: FieldTargetKey, teks: string, persen?: boolean) {
    const angka = Number(teks.replace(/[^\d.-]/g, '')) || 0
    setDraf((d) => ({ ...d, [key]: persen ? angka / 100 : angka }))
  }

  return (
    <div className="mgr-target-editor">
      <div className="mgr-target-grid">
        {FIELD_TARGET.map((f) => (
          <label key={f.key} className="mgr-target-field">
            <span>
              {f.label}
              {f.sufiks && <em>{f.sufiks}</em>}
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={f.persen ? Math.round(draf[f.key] * 100) : draf[f.key]}
              onChange={(e) => ubah(f.key, e.target.value, f.persen)}
            />
          </label>
        ))}
      </div>
      <div className="mgr-target-aksi">
        <button
          type="button"
          className="mgr-aksi-btn"
          onClick={() => setDraf(saran)}
        >
          Isi otomatis (2× rata-rata 3 bulan)
        </button>
        <span className="spacer" />
        <button type="button" className="mgr-aksi-btn" onClick={onBatal}>
          Batal
        </button>
        <button
          type="button"
          className="mgr-aksi-btn"
          onClick={() => onSimpan({ ...draf, disetujui: false })}
        >
          Simpan sebagai draf
        </button>
        <button
          type="button"
          className="mgr-aksi-btn is-utama"
          onClick={() =>
            onSimpan({
              ...draf,
              disetujui: true,
              disetujuiPada: new Date().toISOString(),
            })
          }
        >
          Simpan &amp; setujui
        </button>
      </div>
    </div>
  )
}

/**
 * Penyusun jobdesk manajer (owner). Mengedit SALINAN lokal, baru menulis saat
 * "Simpan" — supaya menghapus baris tidak langsung menghilangkan centang
 * manajer sebelum owner yakin.
 *
 * Label diedit per-id dan sisa field item (`selesaiPada`/`selesaiOleh`)
 * dibiarkan utuh: memperbaiki typo tidak boleh membatalkan centang yang sudah
 * ada.
 */
function JobdeskEditor({
  awal,
  bulanLalu,
  labelBulanLalu,
  onSimpan,
  onBatal,
}: {
  awal: JobdeskItem[]
  /** Jobdesk periode sebelumnya — bahan tombol "Salin dari ...". */
  bulanLalu: JobdeskItem[]
  labelBulanLalu: string
  onSimpan: (items: JobdeskItem[]) => void
  onBatal: () => void
}) {
  const [draf, setDraf] = useState<JobdeskItem[]>(awal)

  function ubahLabel(id: string, label: string) {
    setDraf((d) => d.map((j) => (j.id === id ? { ...j, label } : j)))
  }

  function pindah(id: string, arah: -1 | 1) {
    setDraf((d) => {
      const i = d.findIndex((j) => j.id === id)
      const t = i + arah
      if (i < 0 || t < 0 || t >= d.length) return d
      const next = [...d]
      ;[next[i], next[t]] = [next[t], next[i]]
      return next
    })
  }

  function hapus(id: string) {
    setDraf((d) => d.filter((j) => j.id !== id))
  }

  function tambah() {
    setDraf((d) => [...d, { id: uid(), label: '' }])
  }

  /** Salin LABEL-nya saja: id & centang bulan lalu tidak boleh ikut terbawa. */
  function salinBulanLalu() {
    setDraf((d) => [
      ...d,
      ...bulanLalu.map((j) => ({ id: uid(), label: j.label })),
    ])
  }

  return (
    <div className="mgr-jobdesk-editor">
      {draf.length === 0 && (
        <p className="mgr-empty">
          Belum ada baris. Tambahkan tugas pertama untuk manajer.
        </p>
      )}
      {draf.map((j, i) => (
        <div key={j.id} className="mgr-jobdesk-edit-row">
          <span className="mgr-jobdesk-num">{i + 1}.</span>
          <input
            type="text"
            value={j.label}
            onChange={(e) => ubahLabel(j.id, e.target.value)}
            placeholder="mis. Rekap penjualan mingguan ke owner"
          />
          <button
            type="button"
            className="btn-mini btn-mini-ghost"
            onClick={() => pindah(j.id, -1)}
            disabled={i === 0}
            title="Naikkan"
          >
            ↑
          </button>
          <button
            type="button"
            className="btn-mini btn-mini-ghost"
            onClick={() => pindah(j.id, 1)}
            disabled={i === draf.length - 1}
            title="Turunkan"
          >
            ↓
          </button>
          <button
            type="button"
            className="btn-mini btn-mini-skip"
            onClick={() => hapus(j.id)}
            title="Hapus"
          >
            ×
          </button>
        </div>
      ))}
      <div className="mgr-jobdesk-edit-aksi">
        <button type="button" className="mgr-aksi-btn" onClick={tambah}>
          + Tambah tugas
        </button>
        {bulanLalu.length > 0 && (
          <button type="button" className="mgr-aksi-btn" onClick={salinBulanLalu}>
            Salin dari {labelBulanLalu}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="mgr-aksi-btn" onClick={onBatal}>
          Batal
        </button>
        <button
          type="button"
          className="mgr-aksi-btn is-utama"
          onClick={() =>
            /* Baris kosong dibuang, bukan disimpan sebagai tugas tanpa nama. */
            onSimpan(
              draf
                .map((j) => ({ ...j, label: j.label.trim() }))
                .filter((j) => j.label !== ''),
            )
          }
        >
          Simpan jobdesk
        </button>
      </div>
    </div>
  )
}

function StatCard({
  nada,
  label,
  nilai,
  sub,
  delta: d,
  deltaBaik = 'naik',
  icon,
}: {
  nada: 'primary' | 'mint' | 'pink' | 'yellow'
  label: string
  nilai: string
  sub: string
  /** Perubahan vs bulan lalu (−1..∞). `null` = tidak bisa dibandingkan. */
  delta: number | null
  /** Arah yang dianggap "bagus" — biaya justru bagus kalau turun. */
  deltaBaik?: 'naik' | 'turun'
  icon: ReactNode
}) {
  const naik = d != null && d > 0
  const netral = d == null || Math.abs(d) < 0.005
  const bagus = deltaBaik === 'naik' ? naik : !naik
  return (
    <div className={`mgr-stat mgr-stat--${nada}`}>
      <div className="mgr-stat-head">
        <span className="mgr-stat-ikon">{icon}</span>
        <span className="mgr-stat-label">{label}</span>
        {d != null && (
          <span
            className={
              'mgr-delta' +
              (netral ? ' is-netral' : bagus ? ' is-bagus' : ' is-buruk')
            }
            title="Dibandingkan bulan lalu"
          >
            {netral ? '±' : naik ? '▲' : '▼'} {persen(Math.abs(d))}
          </span>
        )}
      </div>
      <div className="mgr-stat-val">{nilai}</div>
      <div className="mgr-stat-sub">{sub}</div>
    </div>
  )
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="mgr-mini">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  )
}

function Rincian({ k, v }: { k: string; v: string }) {
  return (
    <div className="mgr-rincian">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  )
}

function SaldoRow({
  label,
  seharusnya,
  aktual,
}: {
  label: string
  seharusnya: number
  aktual: number
}) {
  const selisih = aktual - seharusnya
  const belumDiisi = aktual === 0
  return (
    <div className="mgr-saldo">
      <div className="mgr-saldo-lbl">{label}</div>
      <div className="mgr-saldo-grid">
        <span>
          <em>Seharusnya</em>
          {formatRupiah(seharusnya)}
        </span>
        <span>
          <em>Aktual</em>
          {belumDiisi ? '—' : formatRupiah(aktual)}
        </span>
        <span
          className={
            belumDiisi
              ? ''
              : selisih === 0
                ? 'is-pas'
                : selisih > 0
                  ? 'is-lebih'
                  : 'is-kurang'
          }
        >
          <em>Selisih</em>
          {belumDiisi
            ? 'belum diisi'
            : `${selisih > 0 ? '+' : ''}${formatRupiah(selisih)}`}
        </span>
      </div>
    </div>
  )
}

/**
 * Omzet harian sebulan, dengan penanda hari sosmed aktif.
 *
 * Batang = omzet hari itu; pita di bawahnya = seberapa banyak aktivitas sosmed
 * hari itu (makin pekat, makin banyak). Menaruh keduanya pada sumbu waktu yang
 * sama membuat polanya terbaca mata tanpa perlu percaya pada satu angka
 * persentase.
 *
 * Hari tanpa laporan pemasukan digambar sebagai batang kosong bergaris, bukan
 * batang nol — omzetnya tidak diketahui, dan menyamakannya dengan nol akan
 * membuat grafik berbohong.
 */
function DampakChart({ rows }: { rows: HariDampak[] }) {
  const W = 640
  const H = 200
  const padL = 52
  const padR = 10
  const padT = 12
  const padB = 44
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const pitaH = 10

  const maks = Math.max(1, ...rows.map((r) => r.omzet))
  const skalaMax = Math.ceil(maks / 4) * 4 || 1
  const y = (v: number) => padT + plotH - (v / skalaMax) * plotH
  const slotW = plotW / rows.length
  const barW = Math.max(2, Math.min(14, slotW - 3))

  if (rows.every((r) => !r.berlaporan)) {
    return <p className="mgr-empty">Belum ada laporan pemasukan di periode ini.</p>
  }

  return (
    <div className="mgr-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" preserveAspectRatio="none">
        <title>
          Omzet harian dibandingkan aktivitas sosial media pada bulan terpilih
        </title>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              className="mgr-chart-grid"
              x1={padL}
              x2={W - padR}
              y1={y(skalaMax * f)}
              y2={y(skalaMax * f)}
            />
            <text
              className="mgr-chart-axis"
              x={padL - 8}
              y={y(skalaMax * f) + 4}
              textAnchor="end"
            >
              {f === 0 ? '0' : rupiahRingkas(skalaMax * f)}
            </text>
          </g>
        ))}

        {rows.map((r, i) => {
          const cx = padL + slotW * i + slotW / 2
          const tinggi = Math.max(0, padT + plotH - y(r.omzet))
          return (
            <g key={r.tanggal}>
              {r.berlaporan ? (
                <rect
                  className={r.aktif ? 'mgr-dampak-bar is-aktif' : 'mgr-dampak-bar'}
                  x={cx - barW / 2}
                  y={y(r.omzet)}
                  width={barW}
                  height={Math.max(1, tinggi)}
                  rx={2}
                >
                  <title>{`${r.tanggal} · ${formatRupiah(r.omzet)} · ${r.aksi} aktivitas sosmed`}</title>
                </rect>
              ) : (
                <rect
                  className="mgr-dampak-bar is-kosong"
                  x={cx - barW / 2}
                  y={padT + plotH - 4}
                  width={barW}
                  height={4}
                  rx={2}
                >
                  <title>{`${r.tanggal} · belum ada laporan pemasukan`}</title>
                </rect>
              )}
              {/* Pita aktivitas sosmed, sejajar di bawah sumbu. */}
              <rect
                className={`mgr-dampak-pita lv-${r.aksi}`}
                x={cx - barW / 2}
                y={padT + plotH + 8}
                width={barW}
                height={pitaH}
                rx={2}
              >
                <title>{`${r.tanggal} · ${r.aksi} dari 4 aktivitas sosmed`}</title>
              </rect>
              {/* Label tanggal tiap 5 hari supaya tidak berdesakan. */}
              {(r.hari === 1 || r.hari % 5 === 0) && (
                <text
                  className="mgr-chart-label"
                  x={cx}
                  y={H - 6}
                  textAnchor="middle"
                >
                  {r.hari}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="mgr-legend">
        <span>
          <i className="mgr-legend-dampak-aktif" /> Omzet · hari sosmed aktif
        </span>
        <span>
          <i className="mgr-legend-dampak-pasif" /> Omzet · hari pasif
        </span>
        <span>
          <i className="mgr-legend-dampak-kosong" /> Tanpa laporan
        </span>
      </div>
    </div>
  )
}

/**
 * Grafik batang omzet vs biaya + garis laba. Inline SVG (tanpa library) supaya
 * ikut tema: semua warna memakai CSS variable yang sama dengan kartu lain.
 */
function TrenChart({
  rows,
  labaLabel,
}: {
  rows: {
    label: string
    omzet: number
    biaya: number
    laba: number
    aktif: boolean
  }[]
  /** Nama garis laba — beda untuk owner (bersih) & manajer (operasional). */
  labaLabel: string
}) {
  const W = 640
  const H = 220
  const padL = 56
  const padR = 12
  const padT = 12
  const padB = 34
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const maxNilai = Math.max(
    1,
    ...rows.map((r) => Math.max(r.omzet, r.biaya, r.laba)),
  )
  // Bulatkan ke atas supaya garis bantu jatuh di angka rapi.
  const skalaMax = Math.ceil(maxNilai / 4) * 4
  const y = (v: number) => padT + plotH - (v / skalaMax) * plotH
  const slotW = plotW / rows.length
  const barW = Math.min(22, slotW / 3.2)

  const titik = rows.map((r, i) => ({
    x: padL + slotW * i + slotW / 2,
    y: y(Math.max(0, r.laba)),
  }))

  if (rows.every((r) => r.omzet === 0 && r.biaya === 0)) {
    return <p className="mgr-empty">Belum ada data untuk 6 bulan terakhir.</p>
  }

  return (
    <div className="mgr-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" preserveAspectRatio="none">
        <title>Omzet, biaya, dan laba bersih enam bulan terakhir</title>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              className="mgr-chart-grid"
              x1={padL}
              x2={W - padR}
              y1={y(skalaMax * f)}
              y2={y(skalaMax * f)}
            />
            <text
              className="mgr-chart-axis"
              x={padL - 8}
              y={y(skalaMax * f) + 4}
              textAnchor="end"
            >
              {f === 0 ? '0' : rupiahRingkas(skalaMax * f)}
            </text>
          </g>
        ))}

        {rows.map((r, i) => {
          const cx = padL + slotW * i + slotW / 2
          return (
            <g key={r.label + i} className={r.aktif ? 'is-aktif' : undefined}>
              {r.aktif && (
                <rect
                  className="mgr-chart-sorot"
                  x={cx - slotW / 2 + 2}
                  y={padT}
                  width={slotW - 4}
                  height={plotH}
                  rx={8}
                />
              )}
              <rect
                className="mgr-chart-omzet"
                x={cx - barW - 2}
                y={y(r.omzet)}
                width={barW}
                height={Math.max(0, padT + plotH - y(r.omzet))}
                rx={4}
              >
                <title>{`${r.label} · omzet ${formatRupiah(r.omzet)}`}</title>
              </rect>
              <rect
                className="mgr-chart-biaya"
                x={cx + 2}
                y={y(r.biaya)}
                width={barW}
                height={Math.max(0, padT + plotH - y(r.biaya))}
                rx={4}
              >
                <title>{`${r.label} · biaya ${formatRupiah(r.biaya)}`}</title>
              </rect>
              <text
                className={'mgr-chart-label' + (r.aktif ? ' is-aktif' : '')}
                x={cx}
                y={H - 12}
                textAnchor="middle"
              >
                {r.label}
              </text>
            </g>
          )
        })}

        <polyline
          className="mgr-chart-laba"
          points={titik.map((t) => `${t.x},${t.y}`).join(' ')}
          fill="none"
        />
        {titik.map((t, i) => (
          <circle key={i} className="mgr-chart-dot" cx={t.x} cy={t.y} r={3.5}>
            <title>{`${rows[i].label} · laba ${formatRupiah(rows[i].laba)}`}</title>
          </circle>
        ))}
      </svg>

      <div className="mgr-legend">
        <span>
          <i className="mgr-legend-omzet" /> Omzet
        </span>
        <span>
          <i className="mgr-legend-biaya" /> Biaya
        </span>
        <span>
          <i className="mgr-legend-laba" /> {labaLabel}
        </span>
      </div>
    </div>
  )
}
