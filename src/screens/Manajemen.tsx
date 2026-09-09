import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AppData,
  LaporanHarian,
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
  AKSI_SOSMED_LABEL,
  aktivitasSosmed,
  cakupanShift,
  dampakSosmed,
  MIN_SAMPEL_DAMPAK,
  denyutKonten,
  eksekusiKonten,
  kesiapanJadwal,
  NAMA_HARI,
  TAHAP_KONTEN,
  TAHAP_KONTEN_LABEL,
  kualitasCampaign,
  AMBANG_JADWAL_H,
  HARI_SISA_MERAH,
  JENDELA_PEMAKAIAN,
  kontribusiKonten,
  kontribusiSales,
  laporanClosing,
  STATUS_LAPORAN,
  STATUS_LAPORAN_LABEL,
  STATUS_LAPORAN_PENDEK,
  LEAD_KATEGORI_LABEL,
  LEAD_TAHAP_LABEL,
  LEAD_TAHAP_ORDER,
  pengerjaSosmed,
  pipelineLeads,
  ringkasanBulan,
  saranTarget,
  skorKPI,
  targetBerlaku,
} from '../manajemen'
import type {
  AksiSosmed,
  BarisKPI,
  HariDampak,
  MingguKonten,
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

/** "2 konten/minggu · Take video Sen · Editing Sel · Tayang Rab". */
function teksRitme(r: RitmeKonten): string {
  const tahap = TAHAP_KONTEN.map(
    (k) => `${TAHAP_KONTEN_LABEL[k]} ${NAMA_HARI[Math.min(6, Math.max(0, (r.hari[k] ?? 1) - 1))]}`,
  )
  return [`${r.jumlah} konten/minggu`, ...tahap].join(' · ')
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
 * Empat pekerjaan manajer, satu tab masing-masing — plus rapornya sendiri yang
 * hanya owner boleh buka. Urutannya sengaja: yang harus dikerjakan dulu, baru
 * yang harus dipantau, terakhir yang cuma dibaca.
 */
type TabMgr = 'kpi' | 'hari' | 'operasional' | 'marketing' | 'uang'

const TAB_MGR: { id: TabMgr; label: string; sub: string }[] = [
  { id: 'kpi', label: 'KPI Manajer', sub: 'rapor bulanan' },
  { id: 'hari', label: 'Hari Ini', sub: 'antrean & centang' },
  { id: 'operasional', label: 'Operasional', sub: 'Karyawan & SOP' },
  { id: 'marketing', label: 'Marketing', sub: 'konten & leads' },
  { id: 'uang', label: 'Uang', sub: 'omzet & margin' },
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
    Manajer mendarat di "Hari Ini" (daftar kerjanya), owner di "KPI Manajer"
    (alasan ia membuka halaman ini). Tab tidak disimpan ke storage — sekali
    berpindah layar, keduanya kembali ke titik berangkat yang benar.
  */
  const [tab, setTab] = useState<TabMgr>(isOwner ? 'kpi' : 'hari')

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
  // Scorecard hanya untuk owner (lihat panel "KPI Manajer" di bawah), jadi
  // tidak perlu dihitung sama sekali untuk akun manajer.
  const kpi = useMemo(
    () => (isOwner ? skorKPI(data, monthKey, hariIni) : null),
    [data, monthKey, hariIni, isOwner],
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
  const kontribusi = useMemo(
    () => kontribusiKonten(data, monthKey),
    [data, monthKey],
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
   * formulir Marketing. Dipakai centang cepat di tab "Hari Ini".
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
   * Wujudkan satu slot virtual jadi kartu sungguhan di Papan Promosi, dengan
   * deadline = hari tayang minggu itu. Judul & detailnya disunting di Papan
   * Promosi — papan ini sengaja tidak menduplikasi formulir kartu.
   */
  function buatKartuKonten(m: MingguKonten, nomor: number) {
    const kartu: PromoProgram = {
      id: uid(),
      judul: `Konten #${nomor} · ${labelTanggalPendek(m.mulai)}`,
      deskripsi: '',
      tahap: 'rencana',
      status: 'disetujui',
      jenis: 'konten',
      deadline: m.batas,
      dibuatOleh: meId,
      createdAt: new Date().toISOString(),
      tahapan: [],
    }
    setData({ ...data, promoPrograms: [...data.promoPrograms, kartu] })
  }

  /**
   * Simpan ritme. Selama `disetujui` belum true, KPI "konten mingguan tepat
   * ritme" tetap dihitung tapi ditandai simulasi — pola yang sama dengan
   * persetujuan target bulanan.
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

  const tindakan = [
    {
      // Paling mendesak: hari yang sudah di depan mata tapi belum ada penjaga.
      jumlah: jadwal.bolongMendatang.length,
      label: 'Hari ke depan tanpa operator terjadwal',
      aksi: 'Buka jadwal shift',
      onClick: onLihatJadwal,
      nada: 'pink' as const,
    },
    {
      jumlah: pipeline.perluFollowup.length,
      label: 'Leads menunggu di-follow-up',
      aksi: 'Buka leads & sales',
      onClick: onLihatLeads,
      nada: 'primary' as const,
    },
    {
      jumlah: eksekusi.menunggak.length,
      label: 'Campaign lewat deadline & belum selesai',
      aksi: 'Buka papan promosi',
      onClick: onLihatPromosi,
      nada: 'yellow' as const,
    },
    {
      /*
        Hanya menagih hari kerja yang sudah lewat — `laporan.bolong` sendiri
        yang menyaring hari tutup. Ditaruh di antrean, bukan sebagai peringatan
        terpisah, supaya laporan harian ikut hilang dari layar begitu ditulis,
        persis seperti antrean lainnya.
      */
      jumlah: laporan.bolong.length,
      label:
        laporan.bolong[0] === hariIni
          ? 'Laporan closing hari ini belum ditulis'
          : 'Hari kerja tanpa laporan closing',
      aksi: 'Tulis laporan',
      onClick: () => {
        setTab('hari')
        setTglLaporanPilih(laporan.bolong[0] ?? hariIni)
      },
      nada: 'yellow' as const,
    },
    {
      jumlah: ops.absenMenunggu,
      label: 'Absensi manual menunggu persetujuan',
      aksi: 'Buka presensi',
      onClick: onLihatAbsensi,
      nada: 'pink' as const,
    },
    {
      jumlah: ops.stokKritis.length,
      label: 'Item stok di bawah ambang aman',
      aksi: 'Buka inventaris',
      onClick: onLihatInventaris,
      nada: 'yellow' as const,
    },
    {
      jumlah: ops.promoMenunggu,
      label: 'Ide promosi menunggu ACC',
      aksi: 'Buka papan promosi',
      onClick: onLihatPromosi,
      nada: 'primary' as const,
    },
    {
      jumlah: ops.hariTanpaLaporan,
      label: 'Hari berjalan tanpa laporan pemasukan',
      aksi: 'Buka pemasukan',
      onClick: onLihatLaporan,
      nada: 'primary' as const,
    },
    {
      // KPI baru: lead yang jendela 2 harinya lewat tanpa satu pun kontak.
      jumlah: pipeline.belumDihubungi.length,
      label: 'Lead baru belum pernah dihubungi',
      aksi: 'Buka leads & sales',
      onClick: onLihatLeads,
      nada: 'pink' as const,
    },
    {
      // Peringatan paling awal yang dipunyai dashboard ini: tahap yang lewat
      // tenggat hari ini sudah menyalakan lampu untuk hari tayang nanti.
      jumlah: denyut.macet.length,
      label: 'Tahap konten mingguan lewat tenggat',
      aksi: 'Buka papan promosi',
      onClick: onLihatPromosi,
      nada: 'pink' as const,
    },
    {
      jumlah: siapCampaign.belumSiap.length,
      label: 'Campaign tanpa PIC atau deadline',
      aksi: 'Buka papan promosi',
      onClick: onLihatPromosi,
      nada: 'yellow' as const,
    },
    {
      jumlah: siapJadwal.berikutnya
        ? siapJadwal.berikutnya.hariDinilai - siapJadwal.berikutnya.hariTerisi
        : 0,
      label: `Hari minggu depan belum dijadwalkan (batas H-${AMBANG_JADWAL_H})`,
      aksi: 'Buka jadwal shift',
      onClick: onLihatJadwal,
      nada: 'primary' as const,
    },
  ].filter((t) => t.jumlah > 0)

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
      {/* ---------- Tab ---------- */}
      {/*
        Kubik usaha kecil — satu owner, satu manajer — jadi dashboard-nya tidak
        boleh terasa seperti ERP. Tidak ada panel yang dihapus, tapi sebelas
        panel dipisah per PEKERJAAN, bukan per sumber data: apa yang harus
        kubereskan hari ini, apakah operasional jalan, apakah marketing jalan,
        dan apakah uangnya bergerak. Manajer mendarat di "Hari Ini" karena itu
        satu-satunya tab yang wajib ia buka tiap pagi; owner mendarat di "KPI
        Manajer" karena itu alasan ia membuka halaman ini.
      */}
      <nav className="mgr-tabs" role="tablist" aria-label="Bagian dashboard">
        {TAB_MGR.filter((x) => x.id !== 'kpi' || isOwner).map((x) => (
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
              {x.id === 'hari' && tindakan.length > 0 && (
                <em className="mgr-tab-badge">{tindakan.length}</em>
              )}
            </span>
            <em className="mgr-tab-sub">{x.sub}</em>
          </button>
        ))}
      </nav>

      {/*
        Owner-only. Skor ini adalah penilaian ATAS manajer, dipakai owner saat
        evaluasi — memperlihatkannya kepada yang dinilai mengubah perilakunya
        (kejar angka, bukan kejar hasil) dan membocorkan target yang belum
        disetujui. Manajer tetap memegang seluruh bahan kerjanya di tab lain:
        antrean tindakan, jadwal, sosmed, pipeline — bahan kerjanya, bukan
        rapornya.
      */}
      {tab === 'kpi' && isOwner && kpi && (
        <Panel
          judul="KPI Manajer"
          sub={
            <>
              {kpi.aktif} KPI aktif · {kpi.tercapai} on track · {kpi.perhatian}{' '}
              perlu perhatian · {kpi.tertinggal} tertinggal
              {kpi.bobotAktif < 1 && (
                <>
                  {' '}
                  · bobot yang menilai {persen(kpi.bobotAktif)} (kelompok tanpa
                  data dikeluarkan dari pembagi)
                </>
              )}
            </>
          }
          badge={`Bulan ${persen(kpi.progres)} · Skor ${persen(kpi.skor)} dari pace`}
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
          {!kpi.targetDisetujui && (
            <div className="mgr-simulasi">
              <div>
                <b>Simulasi — belum disetujui.</b>{' '}
                {kpi.targetSaran
                  ? 'Target periode ini masih saran otomatis (2× rata-rata 3 bulan terakhir).'
                  : 'Target sudah diisi tapi belum disetujui owner.'}{' '}
                Skor di bawah belum boleh dipakai menilai orang.
              </div>
              {isOwner && (
                <button
                  type="button"
                  className="mgr-aksi-btn is-utama"
                  onClick={setujuiTarget}
                >
                  Setujui target
                </button>
              )}
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
              'mgr-kpi-kelompok-list' + (kpi.targetDisetujui ? '' : ' is-simulasi')
            }
          >
            {kpi.kelompok.map((g) => (
              <KelompokBlok
                key={g.id}
                kelompok={g}
                laju={kpi.progres}
                ekstra={
                  g.id === 'kepemimpinan' ? (
                    <PenilaianOwnerBox
                      key={monthKey}
                      nilai={nilaiOwner?.nilai ?? 0}
                      catatan={nilaiOwner?.catatan}
                      onSimpan={simpanPenilaian}
                    />
                  ) : undefined
                }
              />
            ))}
          </div>
          <p className="mgr-hint">
            Tiga angka sengaja dipisah:{' '}
            <b>progres bulan {persen(kpi.progres)}</b> → <b>pace</b> = target
            bulanan × progres bulan → <b>capaian</b> = aktual ÷ pace (dibatasi
            150%). Skor kelompok = rata-rata capaian KPI aktif di dalamnya; skor
            akhir = Σ(skor kelompok × bobot) ÷ bobot kelompok yang aktif. Kelompok
            yang seluruh KPI-nya belum ada datanya dikeluarkan dari pembagi, bukan
            dihitung nol.
          </p>
        </Panel>
      )}

      {tab === 'hari' && (
        <div className="mgr-cols">
          <div className="mgr-col">
            <Panel
              judul="Butuh Tindakan"
              sub="Antrean yang dihitung langsung dari data. Angkanya turun sendiri begitu penyebabnya dibereskan."
            >
              {tindakan.length === 0 ? (
                <p className="mgr-empty">
                  ✅ Tidak ada antrean. Semua sudah tertangani.
                </p>
              ) : (
                <ul className="mgr-todo">
                  {tindakan.map((t) => (
                    <li key={t.label}>
                      <span className={`mgr-todo-num mgr-todo-num--${t.nada}`}>
                        {t.jumlah}
                      </span>
                      <span className="mgr-todo-teks">
                        <span className="lbl">{t.label}</span>
                        <button type="button" className="mgr-todo-aksi" onClick={t.onClick}>
                          {t.aksi} <Icons.chevron />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="mgr-col mgr-col--side">
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

            <Panel
              judul="Sosmed Hari Ini"
              sub={
                sosmed.belumDicatat
                  ? 'Belum ada catatan bulan ini — centang begitu satu aktivitas selesai.'
                  : `Rentetan ${sosmed.runSekarang} hari · konsistensi ${persen(sosmed.konsistensi)} bulan ini`
              }
              aksi={
                <button
                  type="button"
                  className="mgr-aksi-btn"
                  onClick={() => setTab('marketing')}
                >
                  Riwayat &amp; pengerja
                </button>
              }
            >
              {/*
                Centang cepat, tanpa memilih tanggal dan tanpa memilih orang —
                inilah satu-satunya bentuk pencatatan yang benar-benar dilakukan
                tiap hari. Formulir lengkapnya (tanggal lain, nama pengerja,
                tautan) tetap ada di tab Marketing.
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
                      disusulkan dari tab Marketing.
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
              aksi={
                <button
                  type="button"
                  className="mgr-aksi-btn"
                  onClick={() => setTab('marketing')}
                >
                  Buka papan
                </button>
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
                          : (s.pic ? (namaById.get(s.pic) ?? 'PIC tidak dikenal') : 'tanpa PIC')}
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
          </div>
        </div>
      )}

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
          </div>

          <div className="mgr-col mgr-col--side">
            <Panel
              judul="Kesehatan Operasional"
              sub={`${ops.salahCetakBulan} lembar salah cetak bulan ini`}
            >
              <div className="mgr-mini-stats">
                <MiniStat k="Kertas" v={`${ops.totalKertas}`} />
                <MiniStat k="Frame" v={`${ops.totalFrame}`} />
                <MiniStat k="Tinta" v={`${ops.totalTinta}`} />
                <MiniStat k="Amplop" v={`${ops.amplop}`} />
              </div>
              {ops.stokKritis.length === 0 ? (
                <p className="mgr-empty">
                  Tidak ada stok yang perlu dibeli minggu ini.
                </p>
              ) : (
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
              )}
              <p className="mgr-hint">
                Urutan memakai <b>hari sisa</b> = stok ÷ rata-rata pemakaian{' '}
                {JENDELA_PEMAKAIAN} hari terakhir. Merah = kurang dari{' '}
                {HARI_SISA_MERAH} hari. Item tanpa riwayat pemakaian (mis. tinta)
                tetap memakai ambang tetap.
              </p>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'marketing' && (
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
                      onClick={() =>
                        ubahSosmed(tglSosmed, { [a]: !logHariIni?.[a] } as Partial<SosmedHarian>)
                      }
                    >
                      {logHariIni?.[a] ? '✓' : '○'} {AKSI_SOSMED_LABEL[a as AksiSosmed]}
                    </button>
                  ))}
                </div>
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
                isOwner ? (
                  <button
                    type="button"
                    className={'mgr-aksi-btn' + (denyut.disetujui ? '' : ' is-utama')}
                    onClick={() => setEditRitme((v) => !v)}
                  >
                    {editRitme ? 'Tutup' : 'Atur ritme'}
                  </button>
                ) : undefined
              }
            >
              {editRitme && isOwner && (
                <RitmeEditor
                  ritme={denyut.ritme}
                  disetujui={denyut.disetujui}
                  onSimpan={simpanRitme}
                  onBatal={() => setEditRitme(false)}
                />
              )}

              {!editRitme && !denyut.disetujui && (
                <p className="mgr-hint">
                  {denyut.belumDiatur
                    ? 'Papan memakai ritme bawaan — belum pernah diatur owner.'
                    : 'Ritme ini belum disetujui owner.'}{' '}
                  Slot & tenggatnya tetap digambar, tapi skornya masih simulasi.
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

                    {mingguAktif.slot.map((slot) => (
                      <Fragment key={slot.nomor}>
                        <div className={`mgr-mgg-baris is-${slot.status}`}>
                          <span className="jdl">{slot.judul}</span>
                          {slot.virtual ? (
                            <button
                              type="button"
                              className="mgr-mgg-buat"
                              onClick={() => buatKartuKonten(mingguAktif, slot.nomor)}
                            >
                              + Buat kartu
                            </button>
                          ) : (
                            <span className="pic">
                              {slot.pic
                                ? (namaById.get(slot.pic) ?? 'PIC tidak dikenal')
                                : 'Tanpa PIC'}
                            </span>
                          )}
                        </div>
                        {tanggalMinggu(mingguAktif.mulai).map((t) => (
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
                        ))}
                      </Fragment>
                    ))}
                  </div>
                </div>
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

            <Panel
              judul="Kontribusi Konten"
              sub="Siapa mengerjakan apa bulan ini — dasar bonus marketing"
              badge={
                eksekusi.jatuhTempo > 0
                  ? `${persen(eksekusi.ketepatan)} tepat waktu`
                  : undefined
              }
            >
              {kontribusi.length === 0 ? (
                <p className="mgr-empty">
                  Belum ada kartu ber-PIC maupun hari sosmed yang ditandai
                  pengerjanya. Tetapkan PIC di Papan Promosi.
                </p>
              ) : (
                <div className="mgr-tabel-wrap">
                  <table className="mgr-tabel">
                    <thead>
                      <tr>
                        <th>Operator</th>
                        <th className="num">Selesai</th>
                        <th className="num">Telat</th>
                        <th className="num">Berjalan</th>
                        <th className="num">Hari sosmed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kontribusi.map((k) => (
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
                                <span className="jb">{k.jabatan || 'Operator'}</span>
                              </span>
                            </span>
                          </td>
                          <td className="num is-kuat">{k.selesai}</td>
                          <td className={`num${k.telat > 0 ? ' is-minus' : ''}`}>
                            {k.telat}
                          </td>
                          <td className="num">{k.berjalan}</td>
                          <td className="num">{k.hariSosmed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {eksekusi.menunggak.length > 0 && (
                <div className="mgr-menunggak">
                  <b>Lewat deadline & belum selesai</b>
                  <ul>
                    {eksekusi.menunggak.map((m) => (
                      <li key={m.id}>
                        <span>{m.judul}</span>
                        <em>
                          telat {m.telatHari} hari
                          {m.pic &&
                            ` · ${data.employees.find((e) => e.id === m.pic)?.nama ?? 'PIC'}`}
                        </em>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'uang' && (
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
                      rekonsiliasi kas hanya bisa dibuka oleh owner.
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
 * saya segini padahal semua checklist hijau" — kelompok Hasil bisnis 25%.
 */
function KelompokBlok({
  kelompok,
  laju,
  ekstra,
}: {
  kelompok: SkorKelompok
  laju: number
  /** Isian tambahan di bawah baris (dipakai kelompok Kepemimpinan). */
  ekstra?: ReactNode
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
      {ekstra}
    </div>
  )
}

/**
 * Penilaian kualitatif owner 1–5 untuk periode terpilih.
 *
 * Satu-satunya KPI yang tidak diturunkan dari data — dan itu disengaja:
 * kepemimpinan tidak punya jejak di tabel mana pun. Hanya dirender di dalam
 * panel KPI Manajer yang owner-only, jadi tidak perlu mode baca-saja.
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
 * Kontrak ritme konten mingguan: berapa konten per minggu, dan hari target
 * tiap tahap. Tahapannya sendiri DIPATOK (take → edit → tayang) — yang bisa
 * bergeser cuma harinya.
 */
function RitmeEditor({
  ritme,
  disetujui,
  onSimpan,
  onBatal,
}: {
  ritme: RitmeKonten
  disetujui: boolean
  onSimpan: (r: RitmeKonten) => void
  onBatal: () => void
}) {
  const [draf, setDraf] = useState<RitmeKonten>(ritme)

  // Urutan hari tidak boleh mundur: konten tidak bisa tayang sebelum diedit.
  // Ditahan di sini, bukan di `denyutKonten()`, supaya ritme yang tersimpan
  // selalu masuk akal alih-alih dikoreksi diam-diam saat dinilai.
  const urut = TAHAP_KONTEN.map((k) => draf.hari[k] ?? 1)
  const mundur = urut.some((h, i) => i > 0 && h < urut[i - 1])

  return (
    <div className="mgr-target-editor">
      <div className="mgr-ritme-grid">
        <label className="mgr-target-field">
          <span>
            Konten per minggu<em>slot</em>
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
        {TAHAP_KONTEN.map((k) => (
          <label key={k} className="mgr-target-field">
            <span>{TAHAP_KONTEN_LABEL[k]}<em>hari</em></span>
            <select
              value={draf.hari[k] ?? 1}
              onChange={(e) =>
                setDraf((d) => ({
                  ...d,
                  hari: { ...d.hari, [k]: Number(e.target.value) },
                }))
              }
            >
              {NAMA_HARI.map((nama, i) => (
                <option key={nama} value={i + 1}>
                  {nama}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {mundur && (
        <p className="mgr-hint">
          Urutan harinya mundur — konten tidak bisa tayang sebelum di-take atau
          diedit.
        </p>
      )}
      <div className="mgr-target-aksi">
        <span className="spacer" />
        <button type="button" className="mgr-aksi-btn" onClick={onBatal}>
          Batal
        </button>
        <button
          type="button"
          className="mgr-aksi-btn"
          disabled={mundur}
          onClick={() => onSimpan(draf)}
        >
          Simpan
        </button>
        <button
          type="button"
          className="mgr-aksi-btn is-utama"
          disabled={mundur || (disetujui && draf === ritme)}
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
