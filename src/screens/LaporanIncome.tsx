import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AppData,
  LaporanIncome as Laporan,
  LayananDef,
  PenyesuaianUangKecil,
  PenarikanUangBesar,
  ProdukDef,
  UpgradeDef,
} from '../types'
import { todayKey, uid } from '../storage'
import { formatTanggalPanjang } from '../attendance'
import { DEFAULTS } from '../appearance'
import {
  formatRupiah,
  hitungIncome,
  hitungPemakaianStok,
  mergeLayanan,
  mergeProduk,
  mergeUpgrade,
  ringkasanPerKaryawan,
  terapkanPemakaianStok,
  totalCetak,
  totalProdukPerTipe,
  totalTiketPerLayanan,
  totalUpgradePerTipe,
} from '../income'
import { Icons } from '../components/Icons'
import { IncomeEntryModal } from './IncomeEntryModal'
import { Modal, ModalHead } from '../components/Modal'
import { useToast } from '../components/Toast'
import { usePrefs } from '../lib/prefs'

type Props = {
  data: AppData
  setData: (d: AppData) => void
  isAdmin: boolean
  currentUserId: string
}

export function LaporanIncome({ data, setData, isAdmin, currentUserId }: Props) {
  const toast = useToast()
  // Karyawan boleh input & edit laporan, tapi nominal Rupiah disembunyikan.
  const showMoney = isAdmin
  // Admin & karyawan sama-sama boleh menambah laporan income. Admin mengisi
  // atas nama karyawan (semua kolom karyawan bisa diedit lewat form), selain
  // tetap bisa edit/hapus/atur harga & ekspor.
  const canTambahLaporan = true
  // Admin tidak diatribusikan sebagai operator penjualan, jadi tidak masuk
  // kolom per-karyawan di ekspor CSV.
  const karyawan = data.employees.filter((e) => e.role !== 'admin')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Laporan | null>(null)
  const [showSetting, setShowSetting] = useState(false)
  // Modal "Ambil / Setor uang besar" (admin & karyawan/kasir).
  const [showAmbil, setShowAmbil] = useState(false)
  // Modal "Penyesuaian uang kecil" (tambah/pakai float laci; admin & karyawan).
  const [showPenyesuaian, setShowPenyesuaian] = useState(false)
  // Laporan yang sedang dibuka detailnya dari tampilan kalender.
  const [detail, setDetail] = useState<Laporan | null>(null)

  // ---- "Atur Harga" draft state (item catalog + prices) ----
  const [draftLayanan, setDraftLayanan] = useState<LayananDef[]>(
    data.layananCatalog,
  )
  const [draftHargaTiket, setDraftHargaTiket] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      data.layananCatalog.map((d) => [d.id, String(data.hargaTiket[d.id] ?? 0)]),
    ),
  )
  const [draftUpgrade, setDraftUpgrade] = useState<UpgradeDef[]>(
    data.upgradeCatalog,
  )
  const [draftHargaUpgrade, setDraftHargaUpgrade] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      data.upgradeCatalog.map((d) => [
        d.id,
        String(data.hargaUpgrade[d.id] ?? 0),
      ]),
    ),
  )
  const [draftProduk, setDraftProduk] = useState<ProdukDef[]>(
    data.produkCatalog,
  )
  const [draftHargaProduk, setDraftHargaProduk] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      data.produkCatalog.map((d) => [d.id, String(data.hargaProduk[d.id] ?? 0)]),
    ),
  )
  const [draftCetak, setDraftCetak] = useState(String(data.hargaCetak))

  function openSetting() {
    // Reset drafts from the current data each time the panel opens.
    setDraftLayanan(data.layananCatalog)
    setDraftHargaTiket(
      Object.fromEntries(
        data.layananCatalog.map((d) => [
          d.id,
          String(data.hargaTiket[d.id] ?? 0),
        ]),
      ),
    )
    setDraftUpgrade(data.upgradeCatalog)
    setDraftHargaUpgrade(
      Object.fromEntries(
        data.upgradeCatalog.map((d) => [
          d.id,
          String(data.hargaUpgrade[d.id] ?? 0),
        ]),
      ),
    )
    setDraftProduk(data.produkCatalog)
    setDraftHargaProduk(
      Object.fromEntries(
        data.produkCatalog.map((d) => [
          d.id,
          String(data.hargaProduk[d.id] ?? 0),
        ]),
      ),
    )
    setDraftCetak(String(data.hargaCetak))
    setShowSetting(true)
  }

  const hariIni = todayKey()
  const judul = data.incomeJudul ?? DEFAULTS.incomeJudul
  const sub = data.incomeSub ?? DEFAULTS.incomeSub
  const tampilan = usePrefs().tampilanIncome

  const sorted = useMemo(
    () =>
      [...data.laporanIncome].sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [data.laporanIncome],
  )
  const incomeHariIni = sorted.find((l) => l.tanggal === hariIni)
  const totalHariIni = incomeHariIni ? hitungIncome(incomeHariIni).total : 0

  const last7 = useMemo(() => {
    const result: { tanggal: string; total: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const l = data.laporanIncome.find((x) => x.tanggal === k)
      result.push({ tanggal: k, total: l ? hitungIncome(l).total : 0 })
    }
    return result
  }, [data.laporanIncome])
  const max7 = Math.max(1, ...last7.map((d) => d.total))
  const sum7 = last7.reduce((s, d) => s + d.total, 0)
  const rata7 = Math.round(sum7 / 7)

  const monthKey = hariIni.slice(0, 7)
  const monthData = sorted.filter((l) => l.tanggal.startsWith(monthKey))
  const totalBulanIni = monthData.reduce((s, l) => s + hitungIncome(l).total, 0)

  // ---- Buku kas "uang besar" (admin & karyawan) --------------------------
  // Saldo berjalan = Σ(uangBesar tiap laporan) − Σ(pengambilan/setoran).
  // Kumulatif per laporan = saldo s/d tanggal laporan itu. `penarikanUangBesar`
  // kini terlihat admin & karyawan (RLS 0029), jadi saldo benar untuk keduanya.
  // `cumulativeById` (saldo s/d tanggal laporan) tidak lagi tampil di kartu,
  // tapi masih dipakai kolom "total uang besar terkumpul" di ekspor CSV.
  const uangBesarLedger = useMemo(() => {
    const penarikan = data.penarikanUangBesar ?? []
    const totalMasuk = data.laporanIncome.reduce(
      (s, l) => s + (l.uangBesar ?? 0),
      0,
    )
    const totalDiambil = penarikan.reduce((s, p) => s + (p.jumlah ?? 0), 0)
    const cumulativeById = new Map<string, number>()
    for (const l of data.laporanIncome) {
      const masuk = data.laporanIncome
        .filter((x) => x.tanggal <= l.tanggal)
        .reduce((s, x) => s + (x.uangBesar ?? 0), 0)
      const diambil = penarikan
        .filter((p) => p.tanggal <= l.tanggal)
        .reduce((s, p) => s + (p.jumlah ?? 0), 0)
      cumulativeById.set(l.id, masuk - diambil)
    }
    return { saldo: totalMasuk - totalDiambil, cumulativeById }
  }, [data.laporanIncome, data.penarikanUangBesar])

  // ---- Rekonsiliasi "float" uang kecil di laci ---------------------------
  // Laci TIDAK mulai dari kosong tiap hari: uang kecil yang nyangkut di laporan
  // sebelumnya menjadi "kembalian" yang masuk hari ini. Penyesuaian uang kecil
  // (tambah/pakai di luar penjualan) mengubah float yang DIBAWA ke laporan
  // BERIKUTNYA — bukan balance hari penyesuaian itu sendiri (uang kecil hari itu
  // sudah dihitung & balance). Per laporan, float masuk =
  //   uang kecil laporan sebelumnya + Σ(tambah−pakai) penyesuaian sejak laporan
  //   sebelumnya s/d sebelum laporan ini.
  const kasirRekonById = useMemo(() => {
    const penyesuaian = data.penyesuaianUangKecil ?? []
    const asc = [...data.laporanIncome].sort((a, b) =>
      a.tanggal.localeCompare(b.tanggal),
    )
    const byId = new Map<string, { floatMasuk: number }>()
    let prevKecil = 0
    let prevDate = ''
    for (const l of asc) {
      const antara = penyesuaian
        .filter((p) => p.tanggal >= prevDate && p.tanggal < l.tanggal)
        .reduce((s, p) => s + (p.tipe === 'tambah' ? 1 : -1) * (p.jumlah ?? 0), 0)
      byId.set(l.id, { floatMasuk: prevKecil + antara })
      prevKecil = l.uangKecil ?? 0
      prevDate = l.tanggal
    }
    return byId
  }, [data.laporanIncome, data.penyesuaianUangKecil])

  // Net penyesuaian uang kecil bulan ini (tambah − pakai) untuk info di bar.
  const penyesuaianBulanIni = (data.penyesuaianUangKecil ?? [])
    .filter((p) => p.tanggal.startsWith(hariIni.slice(0, 7)))
    .reduce((s, p) => s + (p.tipe === 'tambah' ? 1 : -1) * (p.jumlah ?? 0), 0)

  function catatPenyesuaian(p: PenyesuaianUangKecil) {
    setData({
      ...data,
      penyesuaianUangKecil: [...(data.penyesuaianUangKecil ?? []), p],
    })
    const label = p.tipe === 'tambah' ? 'Tambah' : 'Pakai'
    toast('ok', `${label} uang kecil ${formatRupiah(p.jumlah)} dicatat`)
  }

  function hapusPenyesuaian(id: string) {
    setData({
      ...data,
      penyesuaianUangKecil: (data.penyesuaianUangKecil ?? []).filter(
        (p) => p.id !== id,
      ),
    })
    toast('ok', 'Penyesuaian dihapus, float dikembalikan')
  }

  function catatPenarikan(p: PenarikanUangBesar) {
    setData({
      ...data,
      penarikanUangBesar: [...(data.penarikanUangBesar ?? []), p],
    })
    toast('ok', `Uang besar ${formatRupiah(p.jumlah)} diambil`)
  }

  function hapusPenarikan(id: string) {
    setData({
      ...data,
      penarikanUangBesar: (data.penarikanUangBesar ?? []).filter(
        (p) => p.id !== id,
      ),
    })
    toast('ok', 'Riwayat pengambilan dihapus, saldo dikembalikan')
  }

  function simpanLaporan(l: Laporan) {
    const idx = data.laporanIncome.findIndex((x) => x.id === l.id)
    let baru: Laporan[]
    // Laporan lama yang digantikan (untuk mengembalikan stok yang dulu dipotong,
    // lalu memotong ulang sesuai data baru = selisih).
    let lama: Laporan | null = null
    if (idx >= 0) {
      lama = data.laporanIncome[idx]
      baru = data.laporanIncome.map((x) => (x.id === l.id ? l : x))
    } else {
      const sameDate = data.laporanIncome.find((x) => x.tanggal === l.tanggal)
      if (sameDate) {
        if (
          !confirm(
            `Sudah ada laporan tanggal ${l.tanggal}. Timpa dengan data baru?`,
          )
        ) {
          return
        }
        lama = sameDate
        baru = data.laporanIncome.map((x) => (x.tanggal === l.tanggal ? l : x))
      } else {
        baru = [...data.laporanIncome, l]
      }
    }

    // Sesuaikan stok kertas, amplop & frame: potong pemakaian baru, kembalikan
    // lama (frame ikut terpotong dari produk yang namanya cocok).
    const pakaiBaru = hitungPemakaianStok(
      l,
      data.stokKertas,
      data.upgradeCatalog,
      data.produkCatalog,
      data.stokFrame,
    )
    const pakaiLama = lama
      ? hitungPemakaianStok(
          lama,
          data.stokKertas,
          data.upgradeCatalog,
          data.produkCatalog,
          data.stokFrame,
        )
      : null
    const { stokKertas, stokAmplop, stokFrame, kurang } = terapkanPemakaianStok(
      data.stokKertas,
      data.stokAmplop,
      data.stokFrame,
      pakaiBaru,
      pakaiLama,
    )

    setData({ ...data, laporanIncome: baru, stokKertas, stokAmplop, stokFrame })
    toast('ok', `Laporan ${l.tanggal} disimpan`)
    if (kurang) {
      toast('warn', 'Stok tidak cukup — sebagian dipotong sampai 0')
    }
    setShowForm(false)
    setEditing(null)
  }

  function hapusLaporan(l: Laporan) {
    if (!confirm(`Hapus laporan tanggal ${l.tanggal}? Stok dikembalikan.`)) return
    // Kembalikan stok yang dulu dipotong laporan ini (kertas, amplop & frame).
    const pakai = hitungPemakaianStok(
      l,
      data.stokKertas,
      data.upgradeCatalog,
      data.produkCatalog,
      data.stokFrame,
    )
    const { stokKertas, stokAmplop, stokFrame } = terapkanPemakaianStok(
      data.stokKertas,
      data.stokAmplop,
      data.stokFrame,
      null,
      pakai,
    )
    setData({
      ...data,
      laporanIncome: data.laporanIncome.filter((x) => x.id !== l.id),
      stokKertas,
      stokAmplop,
      stokFrame,
    })
    toast('warn', `Laporan ${l.tanggal} dihapus`)
  }

  // ---- catalog editor handlers ----
  function patchLayanan(id: string, patch: Partial<LayananDef>) {
    setDraftLayanan((arr) =>
      arr.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    )
  }
  function addLayanan() {
    const id = uid()
    setDraftLayanan((arr) => [...arr, { id, label: 'Layanan baru', ikon: '🏷️' }])
    setDraftHargaTiket((m) => ({ ...m, [id]: '' }))
  }
  function removeLayanan(id: string) {
    setDraftLayanan((arr) => arr.filter((d) => d.id !== id))
    setDraftHargaTiket((m) => {
      const next = { ...m }
      delete next[id]
      return next
    })
  }
  function patchUpgrade(id: string, patch: Partial<UpgradeDef>) {
    setDraftUpgrade((arr) =>
      arr.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    )
  }
  function addUpgrade() {
    const id = uid()
    setDraftUpgrade((arr) => [...arr, { id, label: 'Upgrade baru', ikon: '🎁' }])
    setDraftHargaUpgrade((m) => ({ ...m, [id]: '' }))
  }
  function removeUpgrade(id: string) {
    setDraftUpgrade((arr) => arr.filter((d) => d.id !== id))
    setDraftHargaUpgrade((m) => {
      const next = { ...m }
      delete next[id]
      return next
    })
  }
  function patchProduk(id: string, patch: Partial<ProdukDef>) {
    setDraftProduk((arr) =>
      arr.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    )
  }
  function addProduk() {
    const id = uid()
    setDraftProduk((arr) => [...arr, { id, label: 'Produk baru', ikon: '🛍️' }])
    setDraftHargaProduk((m) => ({ ...m, [id]: '' }))
  }
  function removeProduk(id: string) {
    setDraftProduk((arr) => arr.filter((d) => d.id !== id))
    setDraftHargaProduk((m) => {
      const next = { ...m }
      delete next[id]
      return next
    })
  }

  function simpanHarga() {
    const layananCatalog: LayananDef[] = draftLayanan.map((d) => ({
      id: d.id,
      label: d.label.trim() || 'Item',
      ikon: d.ikon.trim() || '🏷️',
    }))
    const upgradeCatalog: UpgradeDef[] = draftUpgrade.map((d) => ({
      id: d.id,
      label: d.label.trim() || 'Item',
      ikon: d.ikon.trim() || '🎁',
    }))
    const hargaTiket: Record<string, number> = {}
    for (const d of layananCatalog) {
      hargaTiket[d.id] = parseInt(draftHargaTiket[d.id] ?? '', 10) || 0
    }
    const hargaUpgrade: Record<string, number> = {}
    for (const d of upgradeCatalog) {
      hargaUpgrade[d.id] = parseInt(draftHargaUpgrade[d.id] ?? '', 10) || 0
    }
    const produkCatalog: ProdukDef[] = draftProduk.map((d) => ({
      id: d.id,
      label: d.label.trim() || 'Item',
      ikon: d.ikon.trim() || '🛍️',
    }))
    const hargaProduk: Record<string, number> = {}
    for (const d of produkCatalog) {
      hargaProduk[d.id] = parseInt(draftHargaProduk[d.id] ?? '', 10) || 0
    }
    setData({
      ...data,
      layananCatalog,
      upgradeCatalog,
      produkCatalog,
      hargaTiket,
      hargaCetak: parseInt(draftCetak, 10) || 0,
      hargaUpgrade,
      hargaProduk,
    })
    toast('ok', 'Item & harga diperbarui')
    setShowSetting(false)
  }

  function exportCSV() {
    const allLayanan = mergeLayanan(
      data.layananCatalog,
      sorted.flatMap((l) => l.items.map((i) => i.layanan)),
    )
    const allUpgrade = mergeUpgrade(
      data.upgradeCatalog,
      sorted.flatMap((l) => l.upgrades.map((u) => u.tipe)),
    )
    const allProduk = mergeProduk(
      data.produkCatalog,
      sorted.flatMap((l) => (l.produk ?? []).map((p) => p.produkId)),
    )
    const header = [
      'Tanggal',
      'Hari',
      ...allLayanan.flatMap((def) =>
        karyawan.flatMap((e) => [
          `${def.label}-${e.nama}-Tiket`,
          `${def.label}-${e.nama}-Cetak`,
        ]),
      ),
      ...allUpgrade.flatMap((def) =>
        karyawan.map((e) => `${def.label}-${e.nama}`),
      ),
      ...allProduk.flatMap((def) =>
        karyawan.map((e) => `${def.label}-${e.nama}`),
      ),
      ...allLayanan.map((def) => `Total Tiket ${def.label}`),
      'Total Cetak',
      ...allUpgrade.map((def) => `Total ${def.label}`),
      ...allProduk.map((def) => `Total ${def.label}`),
      ...allLayanan.map((def) => `Income ${def.label}`),
      'Income Cetak',
      ...allUpgrade.map((def) => `Income ${def.label}`),
      ...allProduk.map((def) => `Income ${def.label}`),
      // Total penjualan per karyawan (sudah termasuk tiket, cetak, upgrade &
      // produk/frame) — supaya kontribusi frame ikut terlihat di total tiap orang.
      ...karyawan.map((e) => `Total Penjualan ${e.nama}`),
      'Potongan Harga',
      'Total Income',
      'Tunai',
      'QRIS',
      'Uang Besar',
      'Uang Kecil',
      'Total Terkumpul',
      'Keterangan',
    ]
    const rows = sorted.map((l) => {
      const inc = hitungIncome(l)
      const tPerLayanan = totalTiketPerLayanan(l.items)
      const uPerTipe = totalUpgradePerTipe(l.upgrades)
      const pPerTipe = totalProdukPerTipe(l.produk ?? [])
      const cells: string[] = [l.tanggal, formatTanggalPanjang(l.tanggal)]
      for (const def of allLayanan) {
        for (const emp of karyawan) {
          const it = l.items.find(
            (x) => x.layanan === def.id && x.karyawanId === emp.id,
          )
          cells.push(String(it?.tiket ?? 0))
          cells.push(String(it?.cetak ?? 0))
        }
      }
      for (const def of allUpgrade) {
        for (const emp of karyawan) {
          const u = l.upgrades.find(
            (x) => x.tipe === def.id && x.karyawanId === emp.id,
          )
          cells.push(String(u?.jumlah ?? 0))
        }
      }
      for (const def of allProduk) {
        for (const emp of karyawan) {
          const p = (l.produk ?? []).find(
            (x) => x.produkId === def.id && x.karyawanId === emp.id,
          )
          cells.push(String(p?.jumlah ?? 0))
        }
      }
      for (const def of allLayanan) cells.push(String(tPerLayanan[def.id] ?? 0))
      cells.push(String(totalCetak(l.items)))
      for (const def of allUpgrade) cells.push(String(uPerTipe[def.id] ?? 0))
      for (const def of allProduk) cells.push(String(pPerTipe[def.id] ?? 0))
      for (const def of allLayanan)
        cells.push(String(inc.incomeTiketPerLayanan[def.id] ?? 0))
      cells.push(String(inc.incomeCetak))
      for (const def of allUpgrade)
        cells.push(String(inc.incomeUpgradePerTipe[def.id] ?? 0))
      for (const def of allProduk)
        cells.push(String(inc.incomeProdukPerTipe[def.id] ?? 0))
      const perKar = ringkasanPerKaryawan(l)
      for (const emp of karyawan)
        cells.push(String(perKar[emp.id]?.total ?? 0))
      cells.push(String(inc.potonganHarga))
      cells.push(String(inc.total))
      cells.push(String(l.tunai ?? 0), String(l.qris ?? 0))
      cells.push(
        String(l.uangBesar ?? 0),
        String(l.uangKecil ?? 0),
        String(uangBesarLedger.cumulativeById.get(l.id) ?? 0),
      )
      cells.push(l.keterangan)
      return cells
    })
    const csv = [header, ...rows]
      .map((row) =>
        row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
      )
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `laporan-income-${monthKey}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <section className="hero hero--compact">
        <div className="hero-top">
          <span className="date-pill">
            <Icons.sun /> {formatTanggalPanjang(hariIni)}
          </span>
          {isAdmin && (
            <button
              type="button"
              className="hero-edit-btn"
              onClick={() => (showSetting ? setShowSetting(false) : openSetting())}
            >
              <Icons.lock /> Atur Item &amp; Harga
            </button>
          )}
        </div>
        <h1>{judul}</h1>
        <p className="sub">{sub}</p>

        {showSetting && (
          <div className="hero-edit-form">
            <div className="harga-cat-head">📸 Layanan (tiket + cetak)</div>
            <div className="harga-cat-list">
              {draftLayanan.map((def) => (
                <div key={def.id} className="harga-cat-row">
                  <input
                    type="text"
                    className="harga-cat-ikon"
                    value={def.ikon}
                    onChange={(e) => patchLayanan(def.id, { ikon: e.target.value })}
                    aria-label="Ikon"
                    maxLength={4}
                  />
                  <input
                    type="text"
                    className="harga-cat-label"
                    value={def.label}
                    onChange={(e) =>
                      patchLayanan(def.id, { label: e.target.value })
                    }
                    placeholder="Nama layanan"
                    aria-label="Nama layanan"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    className="harga-cat-harga"
                    value={draftHargaTiket[def.id] ?? ''}
                    onChange={(e) =>
                      setDraftHargaTiket((m) => ({
                        ...m,
                        [def.id]: e.target.value,
                      }))
                    }
                    placeholder="Harga tiket"
                    aria-label="Harga tiket"
                  />
                  <button
                    type="button"
                    className="harga-cat-del"
                    onClick={() => removeLayanan(def.id)}
                    title="Hapus layanan"
                    aria-label="Hapus layanan"
                  >
                    <Icons.trash />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={addLayanan}
              >
                <Icons.plus /> Tambah layanan
              </button>
            </div>

            <div className="field" style={{ margin: '14px 0' }}>
              <label>(+) Harga Cetak (Rp) — berlaku untuk semua layanan</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                value={draftCetak}
                onChange={(e) => setDraftCetak(e.target.value)}
              />
            </div>

            <div className="harga-cat-head">🎁 Upgrade cetak (qty)</div>
            <div className="harga-cat-list">
              {draftUpgrade.map((def) => (
                <div key={def.id} className="harga-cat-row">
                  <input
                    type="text"
                    className="harga-cat-ikon"
                    value={def.ikon}
                    onChange={(e) => patchUpgrade(def.id, { ikon: e.target.value })}
                    aria-label="Ikon"
                    maxLength={4}
                  />
                  <input
                    type="text"
                    className="harga-cat-label"
                    value={def.label}
                    onChange={(e) =>
                      patchUpgrade(def.id, { label: e.target.value })
                    }
                    placeholder="Nama upgrade"
                    aria-label="Nama upgrade"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={500}
                    className="harga-cat-harga"
                    value={draftHargaUpgrade[def.id] ?? ''}
                    onChange={(e) =>
                      setDraftHargaUpgrade((m) => ({
                        ...m,
                        [def.id]: e.target.value,
                      }))
                    }
                    placeholder="Harga / item"
                    aria-label="Harga upgrade"
                  />
                  <button
                    type="button"
                    className="harga-cat-del"
                    onClick={() => removeUpgrade(def.id)}
                    title="Hapus upgrade"
                    aria-label="Hapus upgrade"
                  >
                    <Icons.trash />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={addUpgrade}
              >
                <Icons.plus /> Tambah upgrade
              </button>
            </div>

            <div className="harga-cat-head" style={{ marginTop: 14 }}>
              🛍️ Produk (qty) — merchandise &amp; lainnya
            </div>
            <div className="harga-cat-list">
              {draftProduk.map((def) => (
                <div key={def.id} className="harga-cat-row">
                  <input
                    type="text"
                    className="harga-cat-ikon"
                    value={def.ikon}
                    onChange={(e) => patchProduk(def.id, { ikon: e.target.value })}
                    aria-label="Ikon"
                    maxLength={4}
                  />
                  <input
                    type="text"
                    className="harga-cat-label"
                    value={def.label}
                    onChange={(e) =>
                      patchProduk(def.id, { label: e.target.value })
                    }
                    placeholder="Nama produk (cth: Frame foto, T-shirt)"
                    aria-label="Nama produk"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    className="harga-cat-harga"
                    value={draftHargaProduk[def.id] ?? ''}
                    onChange={(e) =>
                      setDraftHargaProduk((m) => ({
                        ...m,
                        [def.id]: e.target.value,
                      }))
                    }
                    placeholder="Harga / item"
                    aria-label="Harga produk"
                  />
                  <button
                    type="button"
                    className="harga-cat-del"
                    onClick={() => removeProduk(def.id)}
                    title="Hapus produk"
                    aria-label="Hapus produk"
                  >
                    <Icons.trash />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={addProduk}
              >
                <Icons.plus /> Tambah produk
              </button>
            </div>

            <div className="hero-edit-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={simpanHarga}
              >
                <Icons.check /> Simpan
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setShowSetting(false)}
              >
                Batal
              </button>
            </div>
            <div className="form-hint">
              ⚠️ Item &amp; harga ini berlaku untuk laporan baru. Laporan lama
              tetap pakai harga saat dibuat (snapshot).
            </div>
          </div>
        )}

        {showMoney && (
          <div className="hero-stats">
            <div className="stat">
              <span className="dot" style={{ background: 'var(--mint)' }} />
              <span className="num">{formatRupiah(totalHariIni)}</span>
              <span className="lbl">Hari ini</span>
            </div>
            <div className="stat">
              <span className="dot" style={{ background: 'var(--primary-2)' }} />
              <span className="num">{formatRupiah(sum7)}</span>
              <span className="lbl">7 hari terakhir</span>
            </div>
            <div className="stat">
              <span className="dot" style={{ background: 'var(--yellow)' }} />
              <span className="num">{formatRupiah(rata7)}</span>
              <span className="lbl">Rata-rata / hari</span>
            </div>
            <div className="stat">
              <span className="dot" style={{ background: 'var(--pink)' }} />
              <span className="num">{formatRupiah(totalBulanIni)}</span>
              <span className="lbl">Bulan ini ({monthData.length} hari)</span>
            </div>
          </div>
        )}

        {showMoney && (
          <div className="mini-chart">
            {last7.map((d) => {
              const pct = max7 > 0 ? (d.total / max7) * 100 : 0
              const [, m, dd] = d.tanggal.split('-')
              const isToday = d.tanggal === hariIni
              return (
                <div key={d.tanggal} className="mini-chart-col">
                  <div
                    className={'mini-chart-bar' + (isToday ? ' today' : '')}
                    style={{ height: `${Math.max(4, pct)}%` }}
                    title={`${d.tanggal}: ${formatRupiah(d.total)}`}
                  />
                  <div className="mini-chart-lbl">
                    {dd}/{m}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Saldo "uang besar" di laci & tombol ambil/setor ditampilkan untuk
            admin DAN karyawan (kasir): kasir yang memegang laci menyetor uang
            besar ke admin, jadi mereka perlu lihat saldo & mencatatnya. */}
        <div className="uang-besar-bar">
          <div className="uang-besar-info">
            <span className="uang-besar-lbl">💰 Total uang besar di laci</span>
            <span className="uang-besar-val">
              {formatRupiah(uangBesarLedger.saldo)}
            </span>
            <span className="uang-besar-hint">
              bertambah otomatis dari uang besar tiap laporan
            </span>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setShowAmbil(true)}
          >
            <Icons.download /> Ambil / Setor ke admin
          </button>
        </div>

        {/* Penyesuaian uang kecil (float laci): tambah/pakai di luar penjualan.
            Dipegang kasir — mereka yang mengelola uang kecil di laci. */}
        <div className="uang-besar-bar">
          <div className="uang-besar-info">
            <span className="uang-besar-lbl">🪙 Penyesuaian uang kecil bulan ini</span>
            <span className="uang-besar-val">
              {penyesuaianBulanIni < 0 ? '− ' : '+ '}
              {formatRupiah(Math.abs(penyesuaianBulanIni))}
            </span>
            <span className="uang-besar-hint">
              tambah / pakai uang kecil agar float laci antar hari tetap cocok
            </span>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setShowPenyesuaian(true)}
          >
            <Icons.cart /> Tambah / Pakai
          </button>
        </div>
      </section>

      <div className="section-head">
        <h2>
          Daftar Laporan{' '}
          <span className="count-badge">{data.laporanIncome.length}</span>
        </h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {showMoney && data.laporanIncome.length > 0 && (
            <button type="button" className="btn btn--ghost" onClick={exportCSV}>
              <Icons.download /> Unduh CSV
            </button>
          )}
          {canTambahLaporan && (
            <button
              type="button"
              className="btn btn--add"
              onClick={() => {
                setEditing(null)
                setShowForm(true)
              }}
            >
              <Icons.plus /> Tambah Laporan
            </button>
          )}
        </div>
      </div>

      {data.laporanIncome.length === 0 ? (
        <div className="emp-empty">
          <div className="ee-emoji">💸</div>
          <h3>Belum ada laporan income</h3>
          <p>Klik "Tambah Laporan" untuk mulai mencatat penjualan harian.</p>
          <button
            type="button"
            className="btn btn--pink btn--lg"
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
          >
            <Icons.plus /> Tambah Laporan
          </button>
        </div>
      ) : tampilan === 'kalender' ? (
        <KalenderIncome
          data={data}
          sorted={sorted}
          hariIni={hariIni}
          onOpen={setDetail}
        />
      ) : (
        <div
          className={
            'income-list' + (tampilan === 'list' ? ' income-list--list' : '')
          }
        >
          {sorted.map((l) => (
            <IncomeRow
              key={l.id}
              data={data}
              laporan={l}
              canManage={true}
              // Kartu laporan selalu menampilkan harga & total income (termasuk
              // untuk karyawan) — sama persis seperti tampilan admin. Ringkasan
              // di hero (stat & grafik) tetap khusus admin lewat `showMoney`.
              showMoney={true}
              kasirRekon={kasirRekonById.get(l.id)}
              onEdit={() => {
                setEditing(l)
                setShowForm(true)
              }}
              onDelete={() => hapusLaporan(l)}
            />
          ))}
        </div>
      )}

      {/* Detail laporan saat sebuah tanggal di kalender diklik — memakai
          kartu yang sama persis dengan tampilan "card". */}
      {detail && (
        <Modal wide onClose={() => setDetail(null)}>
          <div className="income-detail-modal">
            <IncomeRow
              data={data}
              laporan={detail}
              canManage={true}
              showMoney={true}
              kasirRekon={kasirRekonById.get(detail.id)}
              onEdit={() => {
                setEditing(detail)
                setShowForm(true)
                setDetail(null)
              }}
              onDelete={() => {
                hapusLaporan(detail)
                setDetail(null)
              }}
            />
          </div>
        </Modal>
      )}

      {showForm && (
        <IncomeEntryModal
          data={data}
          existing={editing ?? undefined}
          showMoney={showMoney}
          // Karyawan hanya boleh mengisi kolomnya sendiri. Admin (yang tidak
          // mengisi laporan) tidak terpengaruh karena form ini khusus karyawan.
          editableKaryawanId={isAdmin ? null : currentUserId}
          onSave={simpanLaporan}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}

      {showAmbil && (
        <AmbilUangBesarModal
          saldo={uangBesarLedger.saldo}
          riwayat={data.penarikanUangBesar ?? []}
          hariIni={hariIni}
          onAmbil={catatPenarikan}
          onHapus={hapusPenarikan}
          onClose={() => setShowAmbil(false)}
        />
      )}

      {showPenyesuaian && (
        <PenyesuaianUangKecilModal
          riwayat={data.penyesuaianUangKecil ?? []}
          netBulanIni={penyesuaianBulanIni}
          hariIni={hariIni}
          onSimpan={catatPenyesuaian}
          onHapus={hapusPenyesuaian}
          onClose={() => setShowPenyesuaian(false)}
        />
      )}
    </>
  )
}

// Modal admin: catat pengambilan/setoran uang besar (mengurangi saldo) + riwayat.
function AmbilUangBesarModal({
  saldo,
  riwayat,
  hariIni,
  onAmbil,
  onHapus,
  onClose,
}: {
  saldo: number
  riwayat: PenarikanUangBesar[]
  hariIni: string
  onAmbil: (p: PenarikanUangBesar) => void
  onHapus: (id: string) => void
  onClose: () => void
}) {
  const [jumlah, setJumlah] = useState<number>(0)
  const [tanggal, setTanggal] = useState<string>(hariIni)
  const [catatan, setCatatan] = useState<string>('')

  const valid = jumlah > 0 && jumlah <= saldo
  // Riwayat terbaru di atas.
  const riwayatUrut = [...riwayat].sort((a, b) => b.tanggal.localeCompare(a.tanggal))

  function simpan() {
    if (!valid) return
    onAmbil({ id: uid(), tanggal, jumlah: Math.floor(jumlah), catatan: catatan.trim() })
    setJumlah(0)
    setCatatan('')
  }

  return (
    <Modal onClose={onClose}>
      <ModalHead
        icon={<Icons.download />}
        color="var(--pink)"
        title="Ambil / Setor Uang Besar"
        sub="Mengurangi total uang besar di laci"
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="income-card-total" style={{ marginBottom: 14 }}>
          <div className="income-card-total-num">{formatRupiah(saldo)}</div>
          <div className="income-card-total-lbl">Total uang besar di laci</div>
        </div>

        <div className="field">
          <label>💵 Jumlah diambil (Rp)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={saldo}
              step={1000}
              value={jumlah === 0 ? '' : String(jumlah)}
              placeholder="0"
              onChange={(e) =>
                setJumlah(
                  Math.max(0, Math.min(saldo, parseInt(e.target.value, 10) || 0)),
                )
              }
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn--ghost"
              disabled={saldo <= 0}
              onClick={() => setJumlah(saldo)}
            >
              Ambil semua
            </button>
          </div>
          {jumlah > saldo && (
            <div className="form-hint" style={{ color: 'var(--warn, #b26a00)' }}>
              Tidak bisa melebihi saldo {formatRupiah(saldo)}.
            </div>
          )}
        </div>

        <div className="field">
          <label>📅 Tanggal</label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value || hariIni)}
          />
        </div>

        <div className="field">
          <label>📝 Catatan (opsional)</label>
          <input
            type="text"
            value={catatan}
            placeholder="mis. disetor ke admin"
            onChange={(e) => setCatatan(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn btn--pink btn--lg"
          disabled={!valid}
          onClick={simpan}
          style={{ width: '100%' }}
        >
          <Icons.download /> Catat pengambilan
        </button>

        {riwayatUrut.length > 0 && (
          <div className="penarikan-riwayat">
            <div className="harga-cat-head">🧾 Riwayat pengambilan</div>
            {riwayatUrut.map((p) => (
              <div key={p.id} className="penarikan-row">
                <div className="penarikan-row-info">
                  <span className="penarikan-row-tgl">
                    {formatTanggalPanjang(p.tanggal)}
                  </span>
                  {p.catatan && (
                    <span className="penarikan-row-cat">{p.catatan}</span>
                  )}
                </div>
                <span className="penarikan-row-val">
                  − {formatRupiah(p.jumlah)}
                </span>
                <button
                  type="button"
                  className="emp-row-icon emp-row-danger"
                  aria-label="Hapus riwayat"
                  title="Hapus & kembalikan saldo"
                  onClick={() => onHapus(p.id)}
                >
                  <Icons.trash />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

// Modal: catat penyesuaian uang kecil di laci (tambah/pakai di luar penjualan)
// + riwayat. Tanpa "saldo" cap seperti uang besar — uang kecil bukan saldo
// tunggal yang menumpuk, melainkan float revolving yang dibawa antar hari.
// Pencatatan ini menjelaskan kenapa float hari ini ≠ uang kecil kemarin.
function PenyesuaianUangKecilModal({
  riwayat,
  netBulanIni,
  hariIni,
  onSimpan,
  onHapus,
  onClose,
}: {
  riwayat: PenyesuaianUangKecil[]
  netBulanIni: number
  hariIni: string
  onSimpan: (p: PenyesuaianUangKecil) => void
  onHapus: (id: string) => void
  onClose: () => void
}) {
  const [tipe, setTipe] = useState<'tambah' | 'pakai'>('tambah')
  const [jumlah, setJumlah] = useState<number>(0)
  const [tanggal, setTanggal] = useState<string>(hariIni)
  const [catatan, setCatatan] = useState<string>('')

  const valid = jumlah > 0
  // Riwayat terbaru di atas.
  const riwayatUrut = [...riwayat].sort((a, b) =>
    b.tanggal.localeCompare(a.tanggal),
  )

  function simpan() {
    if (!valid) return
    onSimpan({
      id: uid(),
      tanggal,
      tipe,
      jumlah: Math.floor(jumlah),
      catatan: catatan.trim(),
    })
    setJumlah(0)
    setCatatan('')
  }

  return (
    <Modal onClose={onClose}>
      <ModalHead
        icon={<Icons.cart />}
        color="var(--pink)"
        title="Penyesuaian Uang Kecil"
        sub="Tambah / pakai uang kecil di laci"
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="income-card-total" style={{ marginBottom: 14 }}>
          <div className="income-card-total-num">
            {netBulanIni < 0 ? '− ' : '+ '}
            {formatRupiah(Math.abs(netBulanIni))}
          </div>
          <div className="income-card-total-lbl">
            Net penyesuaian uang kecil bulan ini
          </div>
        </div>

        {/* Toggle Tambah (+) / Pakai (−). */}
        <div className="field">
          <label>Jenis</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={'btn ' + (tipe === 'tambah' ? 'btn--pink' : 'btn--ghost')}
              onClick={() => setTipe('tambah')}
              style={{ flex: 1 }}
            >
              ➕ Tambah
            </button>
            <button
              type="button"
              className={'btn ' + (tipe === 'pakai' ? 'btn--pink' : 'btn--ghost')}
              onClick={() => setTipe('pakai')}
              style={{ flex: 1 }}
            >
              ➖ Pakai
            </button>
          </div>
        </div>

        <div className="field">
          <label>
            🪙 Jumlah {tipe === 'tambah' ? 'ditambah' : 'dipakai'} (Rp)
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={jumlah === 0 ? '' : String(jumlah)}
            placeholder="0"
            onChange={(e) =>
              setJumlah(Math.max(0, parseInt(e.target.value, 10) || 0))
            }
          />
        </div>

        <div className="field">
          <label>📅 Tanggal</label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value || hariIni)}
          />
        </div>

        <div className="field">
          <label>📝 Catatan (opsional)</label>
          <input
            type="text"
            value={catatan}
            placeholder={
              tipe === 'tambah' ? 'mis. tukar pecahan' : 'mis. beli galon'
            }
            onChange={(e) => setCatatan(e.target.value)}
          />
        </div>

        <div className="form-hint">
          Penyesuaian pada tanggal ini tidak mengubah laporan tanggal itu sendiri
          (uang kecilnya sudah dihitung), melainkan float yang dibawa ke laporan
          berikutnya.
        </div>

        <button
          type="button"
          className="btn btn--pink btn--lg"
          disabled={!valid}
          onClick={simpan}
          style={{ width: '100%' }}
        >
          <Icons.cart /> Catat {tipe === 'tambah' ? 'penambahan' : 'pemakaian'}
        </button>

        {riwayatUrut.length > 0 && (
          <div className="penarikan-riwayat">
            <div className="harga-cat-head">🧾 Riwayat penyesuaian</div>
            {riwayatUrut.map((p) => (
              <div key={p.id} className="penarikan-row">
                <div className="penarikan-row-info">
                  <span className="penarikan-row-tgl">
                    {formatTanggalPanjang(p.tanggal)}
                  </span>
                  {p.catatan && (
                    <span className="penarikan-row-cat">{p.catatan}</span>
                  )}
                </div>
                <span
                  className="penarikan-row-val"
                  style={{
                    color:
                      p.tipe === 'tambah'
                        ? 'var(--mint-deep, #0B8A6B)'
                        : 'var(--danger, #C0392B)',
                  }}
                >
                  {p.tipe === 'tambah' ? '+ ' : '− '}
                  {formatRupiah(p.jumlah)}
                </span>
                <button
                  type="button"
                  className="emp-row-icon emp-row-danger"
                  aria-label="Hapus riwayat"
                  title="Hapus & kembalikan float"
                  onClick={() => onHapus(p.id)}
                >
                  <Icons.trash />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

function IncomeRow({
  data,
  laporan,
  canManage,
  showMoney,
  kasirRekon,
  onEdit,
  onDelete,
}: {
  data: AppData
  laporan: Laporan
  canManage: boolean
  showMoney: boolean
  /**
   * Rekonsiliasi float laci: `floatMasuk` = uang kecil kembalian dari laporan
   * sebelumnya, sudah memperhitungkan penyesuaian (tambah/pakai) yang terjadi
   * sebelum laporan ini. Dipakai untuk menentukan status BALANCE.
   * `undefined` = laporan paling awal / data belum tersedia.
   */
  kasirRekon?: { floatMasuk: number }
  onEdit: () => void
  onDelete: () => void
}) {
  const inc = hitungIncome(laporan)
  const tPerLayanan = totalTiketPerLayanan(laporan.items)
  const uPerTipe = totalUpgradePerTipe(laporan.upgrades)
  const pPerTipe = totalProdukPerTipe(laporan.produk ?? [])
  const tC = totalCetak(laporan.items)
  const perKar = ringkasanPerKaryawan(laporan)
  const layananDefs = mergeLayanan(
    data.layananCatalog,
    laporan.items.map((i) => i.layanan),
  )
  const upgradeDefs = mergeUpgrade(
    data.upgradeCatalog,
    laporan.upgrades.map((u) => u.tipe),
  )
  const produkDefs = mergeProduk(
    data.produkCatalog,
    (laporan.produk ?? []).map((p) => p.produkId),
  )
  const totalTiketAll = Object.values(tPerLayanan).reduce((s, n) => s + n, 0)
  const totalUpgradeAll = Object.values(uPerTipe).reduce((s, n) => s + n, 0)
  const totalProdukAll = Object.values(pPerTipe).reduce((s, n) => s + n, 0)

  function handlePrint() {
    const node = document.querySelector(`[data-laporan-id="${laporan.id}"]`)
    if (!node) return
    node.classList.add('is-printing')
    const cleanup = () => node.classList.remove('is-printing')
    window.addEventListener('afterprint', cleanup, { once: true })
    setTimeout(() => window.print(), 40)
    // Fallback if afterprint doesn't fire
    setTimeout(cleanup, 4000)
  }

  return (
    <div className="income-card" data-laporan-id={laporan.id}>
      {canManage && (
        <button
          type="button"
          className="income-card-delete"
          onClick={onDelete}
          title="Hapus laporan"
          aria-label="Hapus laporan"
        >
          <Icons.trash />
        </button>
      )}
      <div className="income-card-head">
        <div>
          <div className="income-card-tanggal">
            {formatTanggalPanjang(laporan.tanggal)}
          </div>
          <div className="income-card-sub">
            {totalTiketAll} tiket · {tC} cetak
            {totalUpgradeAll > 0 && <> · {totalUpgradeAll} upgrade</>}
            {totalProdukAll > 0 && <> · {totalProdukAll} produk</>}
          </div>
        </div>
        {showMoney && (
          <div className="income-card-total">
            <div className="income-card-total-num">{formatRupiah(inc.total)}</div>
            <div className="income-card-total-lbl">Total income</div>
          </div>
        )}
      </div>

      <div className="income-breakdown">
        {layananDefs.map((def) =>
          (tPerLayanan[def.id] ?? 0) > 0 ? (
            <div key={def.id} className="income-breakdown-row">
              <span>
                {def.ikon} {def.label}
              </span>
              <span className="income-breakdown-qty">
                {tPerLayanan[def.id]} tiket
              </span>
              {showMoney && (
                <span className="income-breakdown-val">
                  {formatRupiah(inc.incomeTiketPerLayanan[def.id] ?? 0)}
                </span>
              )}
            </div>
          ) : null,
        )}
        {tC > 0 && (
          <div className="income-breakdown-row">
            <span>🖨️ (+) Cetak</span>
            <span className="income-breakdown-qty">{tC} item</span>
            {showMoney && (
              <span className="income-breakdown-val">
                {formatRupiah(inc.incomeCetak)}
              </span>
            )}
          </div>
        )}
        {upgradeDefs.map((def) =>
          (uPerTipe[def.id] ?? 0) > 0 ? (
            <div key={def.id} className="income-breakdown-row">
              <span>
                {def.ikon} {def.label}
              </span>
              <span className="income-breakdown-qty">{uPerTipe[def.id]} item</span>
              {showMoney && (
                <span className="income-breakdown-val">
                  {formatRupiah(inc.incomeUpgradePerTipe[def.id] ?? 0)}
                </span>
              )}
            </div>
          ) : null,
        )}
        {produkDefs.map((def) =>
          (pPerTipe[def.id] ?? 0) > 0 ? (
            <div key={def.id} className="income-breakdown-row">
              <span>
                {def.ikon} {def.label}
              </span>
              <span className="income-breakdown-qty">{pPerTipe[def.id]} item</span>
              {showMoney && (
                <span className="income-breakdown-val">
                  {formatRupiah(inc.incomeProdukPerTipe[def.id] ?? 0)}
                </span>
              )}
            </div>
          ) : null,
        )}
        {showMoney && inc.potonganHarga > 0 && (
          <div className="income-breakdown-row">
            <span>🏷️ Potongan harga</span>
            <span className="income-breakdown-qty">diskon</span>
            <span className="income-breakdown-val">
              −{formatRupiah(inc.potonganHarga)}
            </span>
          </div>
        )}
      </div>

      <div className="income-perkar">
        {Object.entries(perKar).map(([kId, s]) => {
          const emp = data.employees.find((e) => e.id === kId)
          if (!emp) return null
          const detail: string[] = []
          if (s.tiket > 0) detail.push(`${s.tiket} tiket`)
          if (s.cetak > 0) detail.push(`${s.cetak} cetak`)
          if (s.upgrade > 0) detail.push(`${s.upgrade} upgrade`)
          if (s.produk > 0) detail.push(`${s.produk} produk`)
          return (
            <div key={kId} className="income-perkar-row">
              <span className="income-perkar-nama">{emp.nama}</span>
              <span className="income-perkar-rinci">{detail.join(' + ')}</span>
              {showMoney && (
                <span className="income-perkar-total">{formatRupiah(s.total)}</span>
              )}
            </div>
          )
        })}
      </div>

      {laporan.keterangan && (
        <div className="income-keterangan">
          <span className="income-keterangan-lbl">Catatan:</span>{' '}
          {laporan.keterangan}
        </div>
      )}

      {showMoney && ((laporan.tunai ?? 0) > 0 || (laporan.qris ?? 0) > 0) && (
        <div className="income-breakdown">
          <div className="income-breakdown-row">
            <span>💵 Tunai</span>
            <span className="income-breakdown-qty">bayar via</span>
            <span className="income-breakdown-val">
              {formatRupiah(laporan.tunai ?? 0)}
            </span>
          </div>
          <div className="income-breakdown-row">
            <span>📱 QRIS</span>
            <span className="income-breakdown-qty">bayar via</span>
            <span className="income-breakdown-val">
              {formatRupiah(laporan.qris ?? 0)}
            </span>
          </div>
        </div>
      )}

      {showMoney &&
        ((laporan.uangBesar ?? 0) > 0 ||
          (laporan.uangKecil ?? 0) > 0 ||
          (kasirRekon?.floatMasuk ?? 0) !== 0) &&
        (() => {
          const kasir = (laporan.uangBesar ?? 0) + (laporan.uangKecil ?? 0)
          const tunai = laporan.tunai ?? 0
          const floatMasuk = kasirRekon?.floatMasuk ?? 0
          // BALANCE: sisa di laci setelah tunai hari ini harus cocok dengan float
          // yang masuk (uang kecil laporan sebelumnya ± penyesuaian sebelum ini).
          const balance = kasir - (tunai + floatMasuk) === 0
          return (
            <div className="income-breakdown">
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 15,
                  letterSpacing: 0.4,
                  textAlign: 'center',
                  color: balance
                    ? 'var(--mint-deep, #0B8A6B)'
                    : 'var(--danger, #C0392B)',
                }}
              >
                {balance ? '🟢 LAPORAN BALANCE' : '🔴 LAPORAN TIDAK BALANCE'}
              </div>
            </div>
          )
        })()}

      <div className="income-card-actions">
        {canManage && (
          <button type="button" className="btn btn--ghost" onClick={onEdit}>
            <Icons.pencil /> Edit
          </button>
        )}
        {showMoney && (
          <button type="button" className="btn btn--ghost" onClick={handlePrint}>
            <Icons.printer /> Print
          </button>
        )}
      </div>
    </div>
  )
}

// Palet warna untuk segmen diagram per item. Warna diberikan otomatis sesuai
// urutan item di katalog (lihat buildChannels) supaya konsisten antar hari.
const PALET_INCOME = [
  '#E0218A', // magenta
  '#1F2C77', // biru gelap
  '#F4A62A', // amber
  '#1FC7A0', // mint
  '#7C5CFC', // ungu
  '#FF6FA5', // pink
  '#3B5BDB', // biru
  '#0B8A6B', // hijau tua
  '#B47A00', // emas
  '#C13B72', // maroon
  '#2A9D8F', // teal
  '#E76F51', // koral
]

type IncomeChannel = {
  key: string
  label: string
  ikon: string
  color: string
}

/**
 * Daftar "channel" income (layanan → cetak → upgrade → produk) dalam urutan
 * tetap, lengkap dengan warna dari palet. Dibangun dari katalog + semua id yang
 * pernah muncul di laporan, sehingga warna tiap item stabil di seluruh kalender
 * (item yang sudah dihapus pun tetap dapat warna sendiri).
 */
function buildChannels(data: AppData, reports: Laporan[]): IncomeChannel[] {
  const layanan = mergeLayanan(
    data.layananCatalog,
    reports.flatMap((l) => l.items.map((i) => i.layanan)),
  )
  const upgrade = mergeUpgrade(
    data.upgradeCatalog,
    reports.flatMap((l) => l.upgrades.map((u) => u.tipe)),
  )
  const produk = mergeProduk(
    data.produkCatalog,
    reports.flatMap((l) => (l.produk ?? []).map((p) => p.produkId)),
  )
  const out: IncomeChannel[] = []
  let i = 0
  const next = () => PALET_INCOME[i++ % PALET_INCOME.length]
  for (const d of layanan)
    out.push({ key: `L:${d.id}`, label: d.label, ikon: d.ikon, color: next() })
  out.push({ key: 'cetak', label: 'Cetak', ikon: '🖨️', color: next() })
  for (const d of upgrade)
    out.push({ key: `U:${d.id}`, label: d.label, ikon: d.ikon, color: next() })
  for (const d of produk)
    out.push({ key: `P:${d.id}`, label: d.label, ikon: d.ikon, color: next() })
  return out
}

/** Nilai income (Rp) per channel untuk satu laporan. */
function channelValues(laporan: Laporan): Record<string, number> {
  const inc = hitungIncome(laporan)
  const out: Record<string, number> = {}
  for (const [id, v] of Object.entries(inc.incomeTiketPerLayanan))
    out[`L:${id}`] = v
  out['cetak'] = inc.incomeCetak
  for (const [id, v] of Object.entries(inc.incomeUpgradePerTipe))
    out[`U:${id}`] = v
  for (const [id, v] of Object.entries(inc.incomeProdukPerTipe))
    out[`P:${id}`] = v
  return out
}

const NAMA_HARI_SINGKAT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function ringkasRupiah(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}jt`
  if (n >= 1_000) return `${Math.round(n / 1000)}rb`
  return String(Math.round(n))
}

/**
 * Tampilan kalender untuk daftar laporan income. Tiap tanggal yang punya
 * laporan tampil sebagai diagram batang bertumpuk berwarna per item; hover (atau
 * tap pertama di layar sentuh) memunculkan pop-up total, dan klik (tap kedua)
 * membuka laporan lengkap lewat `onOpen`.
 */
function KalenderIncome({
  data,
  sorted,
  hariIni,
  onOpen,
}: {
  data: AppData
  sorted: Laporan[]
  hariIni: string
  onOpen: (l: Laporan) => void
}) {
  const channels = useMemo(() => buildChannels(data, sorted), [data, sorted])

  // Peta tanggal → laporan (satu laporan per tanggal).
  const byDate = useMemo(() => {
    const m: Record<string, Laporan> = {}
    for (const l of sorted) if (!m[l.tanggal]) m[l.tanggal] = l
    return m
  }, [sorted])

  const [tahun, setTahun] = useState(() => Number(hariIni.slice(0, 4)))
  const [bulan, setBulan] = useState(() => Number(hariIni.slice(5, 7)) - 1) // 0-indexed
  // Tanggal yang sedang "dipilih" lewat tap di layar sentuh (untuk pop-up).
  const [aktif, setAktif] = useState<string | null>(null)
  // Perangkat dengan hover (desktop): klik langsung membuka laporan. Layar
  // sentuh: tap pertama → pop-up, tap kedua → buka.
  const [bisaHover] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(hover: hover)').matches,
  )

  const totalPerTanggal = useMemo(() => {
    const m: Record<string, number> = {}
    for (const l of sorted) m[l.tanggal] = hitungIncome(l).total
    return m
  }, [sorted])

  function gantiBulan(delta: number) {
    setAktif(null)
    let b = bulan + delta
    let y = tahun
    if (b < 0) {
      b = 11
      y--
    } else if (b > 11) {
      b = 0
      y++
    }
    setBulan(b)
    setTahun(y)
  }

  const firstDow = new Date(tahun, bulan, 1).getDay()
  const jumlahHari = new Date(tahun, bulan + 1, 0).getDate()

  // Income tertinggi pada bulan tampil — untuk skala tinggi batang.
  let maxBulan = 1
  for (let d = 1; d <= jumlahHari; d++) {
    const t = totalPerTanggal[`${tahun}-${pad2(bulan + 1)}-${pad2(d)}`] ?? 0
    if (t > maxBulan) maxBulan = t
  }

  const cells: ReactNode[] = []
  for (let i = 0; i < firstDow; i++)
    cells.push(<div key={`x${i}`} className="kal-cell kal-cell--empty" />)

  let totalBulan = 0
  let hariAda = 0
  let best: { tgl: string; total: number } | null = null

  for (let d = 1; d <= jumlahHari; d++) {
    const tgl = `${tahun}-${pad2(bulan + 1)}-${pad2(d)}`
    const lap = byDate[tgl]
    const isToday = tgl === hariIni
    if (!lap) {
      cells.push(
        <div
          key={tgl}
          className={'kal-cell kal-cell--kosong' + (isToday ? ' is-today' : '')}
        >
          <span className="kal-dnum">{d}</span>
        </div>,
      )
      continue
    }

    const total = totalPerTanggal[tgl] ?? 0
    totalBulan += total
    hariAda++
    if (!best || total > best.total) best = { tgl, total }

    const vals = channelValues(lap)
    const segs = channels.filter((c) => (vals[c.key] ?? 0) > 0)
    // Segmen warna mewakili income KOTOR per channel, jadi proporsinya dibagi
    // jumlah kotor (bukan `total` yang sudah dipotong diskon) agar pas mengisi
    // batang.
    const grossSegTotal = segs.reduce((s, c) => s + (vals[c.key] ?? 0), 0) || 1
    const barH = total > 0 ? Math.max(18, Math.round((total / maxBulan) * 100)) : 0

    cells.push(
      <div
        key={tgl}
        className={
          'kal-cell kal-cell--ada' +
          (isToday ? ' is-today' : '') +
          (aktif === tgl ? ' is-active' : '')
        }
        role="button"
        tabIndex={0}
        onClick={() => {
          if (bisaHover || aktif === tgl) onOpen(lap)
          else setAktif(tgl)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen(lap)
          }
        }}
      >
        <span className="kal-dnum">{d}</span>
        <div className="kal-bar-wrap">
          <div className="kal-bar" style={{ height: `${barH}%` }}>
            {segs.map((c) => (
              <div
                key={c.key}
                className="kal-seg"
                style={{
                  height: `${((vals[c.key] ?? 0) / grossSegTotal) * 100}%`,
                  background: c.color,
                }}
              />
            ))}
          </div>
        </div>
        <span className="kal-amt">{ringkasRupiah(total)}</span>
        {lap.keterangan && <span className="kal-dot" title="Ada catatan" />}

        <div className="kal-tip" role="tooltip">
          <div className="kal-tip-date">{formatTanggalPanjang(tgl)}</div>
          <div className="kal-tip-total">{formatRupiah(total)}</div>
          {segs.map((c) => (
            <div key={c.key} className="kal-tip-row">
              <span className="kal-tip-sw" style={{ background: c.color }} />
              <span className="kal-tip-lbl">
                {c.ikon} {c.label}
              </span>
              <span className="kal-tip-val">{formatRupiah(vals[c.key] ?? 0)}</span>
            </div>
          ))}
          {(lap.potonganHarga ?? 0) > 0 && (
            <div className="kal-tip-row">
              <span className="kal-tip-sw" style={{ background: 'transparent' }} />
              <span className="kal-tip-lbl">🏷️ Potongan harga</span>
              <span className="kal-tip-val">
                −{formatRupiah(lap.potonganHarga ?? 0)}
              </span>
            </div>
          )}
          <div className="kal-tip-hint">
            {bisaHover ? 'Klik untuk laporan lengkap →' : 'Tap lagi untuk laporan lengkap →'}
          </div>
        </div>
      </div>,
    )
  }

  const judulBulan = new Date(tahun, bulan, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  })
  const rata = hariAda ? Math.round(totalBulan / hariAda) : 0

  return (
    <div className="kal-wrap">
      <div className="kal-nav">
        <button
          type="button"
          className="kal-nav-btn"
          onClick={() => gantiBulan(-1)}
          aria-label="Bulan sebelumnya"
        >
          ‹
        </button>
        <span className="kal-nav-lbl">{judulBulan}</span>
        <button
          type="button"
          className="kal-nav-btn"
          onClick={() => gantiBulan(1)}
          aria-label="Bulan berikutnya"
        >
          ›
        </button>
      </div>

      <div className="kal-legend">
        {channels.map((c) => (
          <span key={c.key} className="kal-legend-item">
            <span className="kal-legend-sw" style={{ background: c.color }} />
            {c.ikon} {c.label}
          </span>
        ))}
      </div>

      <div className="kal-card">
        <div className="kal-dow">
          {NAMA_HARI_SINGKAT.map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
        <div className="kal-grid">{cells}</div>

        {hariAda > 0 ? (
          <div className="kal-foot">
            <div className="kal-foot-stat">
              <div className="v">{formatRupiah(totalBulan)}</div>
              <div className="l">Total bulan ini</div>
            </div>
            <div className="kal-foot-stat">
              <div className="v">{hariAda} hari</div>
              <div className="l">Hari ada laporan</div>
            </div>
            <div className="kal-foot-stat">
              <div className="v">{formatRupiah(rata)}</div>
              <div className="l">Rata-rata / hari</div>
            </div>
            <div className="kal-foot-stat">
              <div className="v">
                {best
                  ? `${Number(best.tgl.slice(8))} · ${ringkasRupiah(best.total)}`
                  : '—'}
              </div>
              <div className="l">Hari tertinggi</div>
            </div>
          </div>
        ) : (
          <div className="kal-empty-month">
            Belum ada laporan di {judulBulan}.
          </div>
        )}
      </div>
    </div>
  )
}
