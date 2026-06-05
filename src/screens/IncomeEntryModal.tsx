import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type {
  AppData,
  IncomeItem,
  LaporanIncome,
  ProdukItem,
  Upgrade,
  UpgradeItem,
} from '../types'
import { todayKey } from '../storage'
import { Modal, ModalHead } from '../components/Modal'
import { Icons } from '../components/Icons'
import {
  formatRupiah,
  hitungIncome,
  hitungPemakaianStok,
  labelUpgrade,
  mergeLayanan,
  mergeProduk,
  mergeUpgrade,
  totalCetak,
  totalProdukPerTipe,
  totalTiket,
  totalTiketPerLayanan,
  totalUpgradePerTipe,
} from '../income'

const selStyle: CSSProperties = {
  width: '100%',
  padding: '13px 15px',
  borderRadius: 'var(--radius-sm)',
  border: '1.8px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--ink)',
  fontSize: 15,
  fontWeight: 600,
}

type Props = {
  data: AppData
  existing?: LaporanIncome
  showMoney?: boolean
  // Jika diisi, hanya kolom karyawan dengan id ini yang bisa diedit; kolom
  // karyawan lain ditampilkan read-only. `null` = semua kolom bisa diedit
  // (mis. untuk admin).
  editableKaryawanId?: string | null
  onSave: (laporan: LaporanIncome) => void
  onClose: () => void
}

export function IncomeEntryModal({
  data,
  existing,
  showMoney = true,
  editableKaryawanId = null,
  onSave,
  onClose,
}: Props) {
  // Admin (pengelola) tidak mengisi laporan income / tidak diatribusikan
  // sebagai operator penjualan, jadi tidak muncul sebagai pilihan karyawan.
  const employees = data.employees.filter((e) => e.role !== 'admin')
  // Kolom karyawan lain dikunci agar tidak bisa diisi orang yang sedang login.
  const isLocked = (empId: string) =>
    editableKaryawanId != null && empId !== editableKaryawanId
  // Catalog drives which line items show — plus any ids the existing laporan
  // references that were since removed, so editing never loses historic data.
  const layananList = useMemo(
    () =>
      mergeLayanan(
        data.layananCatalog,
        existing?.items.map((i) => i.layanan) ?? [],
      ),
    [data.layananCatalog, existing],
  )
  const upgradeList = useMemo(
    () =>
      mergeUpgrade(
        data.upgradeCatalog,
        existing?.upgrades.map((u) => u.tipe) ?? [],
      ),
    [data.upgradeCatalog, existing],
  )
  const produkList = useMemo(
    () =>
      mergeProduk(
        data.produkCatalog,
        existing?.produk?.map((p) => p.produkId) ?? [],
      ),
    [data.produkCatalog, existing],
  )

  const [tanggal, setTanggal] = useState<string>(
    existing?.tanggal ?? todayKey(),
  )
  const [keterangan, setKeterangan] = useState<string>(
    existing?.keterangan ?? '',
  )
  const [items, setItems] = useState<IncomeItem[]>(() => {
    const seed: IncomeItem[] = []
    for (const def of layananList) {
      for (const emp of employees) {
        const found = existing?.items.find(
          (it) => it.layanan === def.id && it.karyawanId === emp.id,
        )
        seed.push({
          layanan: def.id,
          karyawanId: emp.id,
          tiket: found?.tiket ?? 0,
          cetak: found?.cetak ?? 0,
        })
      }
    }
    return seed
  })
  const [upgrades, setUpgrades] = useState<UpgradeItem[]>(() => {
    const seed: UpgradeItem[] = []
    for (const def of upgradeList) {
      for (const emp of employees) {
        const found = existing?.upgrades.find(
          (u) => u.tipe === def.id && u.karyawanId === emp.id,
        )
        seed.push({
          tipe: def.id,
          karyawanId: emp.id,
          jumlah: found?.jumlah ?? 0,
        })
      }
    }
    return seed
  })
  const [produk, setProduk] = useState<ProdukItem[]>(() => {
    const seed: ProdukItem[] = []
    for (const def of produkList) {
      for (const emp of employees) {
        const found = existing?.produk?.find(
          (p) => p.produkId === def.id && p.karyawanId === emp.id,
        )
        seed.push({
          produkId: def.id,
          karyawanId: emp.id,
          jumlah: found?.jumlah ?? 0,
        })
      }
    }
    return seed
  })

  // --- Pemakaian stok: jenis kertas untuk tiket+cetak, & amplop terpakai ---
  // Default jenis kertas = kertas pertama yang BUKAN kertas upgrade (mis. Doff
  // Kasar / Holographic), karena Poster & Crack n Share dipotong otomatis lewat
  // upgrade. Kalau semua kertas adalah kertas upgrade, pakai yang pertama.
  const upgradeNama = useMemo(
    () =>
      new Set(
        data.upgradeCatalog.map((d) =>
          labelUpgrade(data.upgradeCatalog, d.id).trim().toLowerCase(),
        ),
      ),
    [data.upgradeCatalog],
  )
  // Kertas yang bisa dipilih untuk tiket+cetak = SEMUA kertas KECUALI kertas
  // upgrade (Poster / Crack n Share), karena kertas itu sudah otomatis terpotong
  // saat upgrade-nya diinput (lewat pencocokan nama). Stoknya tetap ada & tetap
  // tampil di preview pemotongan.
  const kertasPilihan = useMemo(
    () =>
      data.stokKertas.filter(
        (k) => !upgradeNama.has(k.nama.trim().toLowerCase()),
      ),
    [data.stokKertas, upgradeNama],
  )
  const defaultKertasId = useMemo(() => {
    const nonUpgrade = kertasPilihan[0]
    return (
      existing?.pemakaianKertas?.[0]?.kertasId ??
      nonUpgrade?.id ??
      data.stokKertas[0]?.id ??
      ''
    )
  }, [data.stokKertas, upgradeNama, existing])
  // Alokasi kertas: mode "otomatis" = satu jenis kertas, jumlahnya ikut total
  // tiket+cetak. Mode manual = daftar {kertas, jumlah} yang bisa dipecah ke
  // beberapa jenis (untuk hari yang pakai kertas berbeda).
  const initLembar = useMemo(
    () => totalTiket(existing?.items ?? []) + totalCetak(existing?.items ?? []),
    [existing],
  )
  const [kertasAuto, setKertasAuto] = useState<boolean>(() => {
    const pk = existing?.pemakaianKertas
    if (!pk || pk.length === 0) return true
    return pk.length === 1 && pk[0].jumlah === initLembar
  })
  const [kertasRows, setKertasRows] = useState<
    { kertasId: string; jumlah: number }[]
  >(() => {
    const pk = existing?.pemakaianKertas
    if (pk && pk.length) return pk.map((x) => ({ ...x }))
    return [{ kertasId: defaultKertasId, jumlah: 0 }]
  })
  // Amplop: default mengikuti jumlah tiket sampai diubah manual.
  const [amplopManual, setAmplopManual] = useState<boolean>(
    existing?.amplopTerpakai != null,
  )
  const [amplopInput, setAmplopInput] = useState<number>(
    existing?.amplopTerpakai ?? 0,
  )
  // Potongan harga (diskon) dalam Rupiah — dikurangkan dari total income.
  const [potonganHarga, setPotonganHarga] = useState<number>(
    existing?.potonganHarga ?? 0,
  )
  // Pembayaran via (Rupiah) — pecahan tunai & QRIS. Informatif saja.
  const [tunai, setTunai] = useState<number>(existing?.tunai ?? 0)
  const [qris, setQris] = useState<number>(existing?.qris ?? 0)
  // Uang tunai di laci kasir (Rupiah). uangBesar + uangKecil seharusnya balance
  // dengan `tunai`. "Total uang besar" tidak lagi diinput di sini — dihitung
  // otomatis sebagai buku kas di laman Laporan Income.
  const [uangBesar, setUangBesar] = useState<number>(existing?.uangBesar ?? 0)
  const [uangKecil, setUangKecil] = useState<number>(existing?.uangKecil ?? 0)

  // Price snapshot. Keep the laporan's historic prices for items it already
  // had, but fall back to the current catalog price for any item without a
  // snapshot yet (e.g. a produk added after this laporan was first created).
  // A plain `existing ?? data` breaks here because an empty `{}` is truthy.
  const hargaTiket = { ...data.hargaTiket, ...(existing?.hargaTiket ?? {}) }
  const hargaCetak = existing?.hargaCetak ?? data.hargaCetak
  const hargaUpgrade = { ...data.hargaUpgrade, ...(existing?.hargaUpgrade ?? {}) }
  const hargaProduk = { ...data.hargaProduk, ...(existing?.hargaProduk ?? {}) }

  // Amplop terpakai: kalau belum diubah manual, ikut jumlah tiket.
  const jumlahTiket = totalTiket(items)
  const amplopTerpakai = amplopManual ? amplopInput : jumlahTiket

  // Alokasi kertas efektif. Mode otomatis = satu jenis kertas sebanyak total
  // tiket+cetak; mode manual = daftar baris yang diisi sendiri.
  const totalLembar = jumlahTiket + totalCetak(items)
  const pemakaianKertas = kertasAuto
    ? kertasRows[0]?.kertasId
      ? [{ kertasId: kertasRows[0].kertasId, jumlah: totalLembar }]
      : []
    : kertasRows.filter((r) => r.kertasId && r.jumlah > 0)
  const totalDialokasikan = pemakaianKertas.reduce((s, r) => s + r.jumlah, 0)

  const previewLaporan: LaporanIncome = {
    id: existing?.id ?? 'preview',
    tanggal,
    items,
    upgrades,
    produk,
    keterangan,
    hargaTiket,
    hargaCetak,
    hargaUpgrade,
    hargaProduk,
    pemakaianKertas,
    amplopTerpakai,
    potonganHarga,
    tunai,
    qris,
    uangBesar,
    uangKecil,
  }
  const inc = hitungIncome(previewLaporan)
  const tiketPerLayanan = totalTiketPerLayanan(items)
  const tC = totalCetak(items)
  const upgradePerTipe = totalUpgradePerTipe(upgrades)
  const produkPerTipe = totalProdukPerTipe(produk)

  // Preview pemakaian stok yang akan dipotong saat laporan disimpan.
  const pemakaian = hitungPemakaianStok(
    previewLaporan,
    data.stokKertas,
    data.upgradeCatalog,
    data.produkCatalog,
    data.stokFrame,
  )
  const kertasTerpotong = data.stokKertas
    .map((k) => ({ k, jumlah: pemakaian.kertas[k.id] ?? 0 }))
    .filter((x) => x.jumlah > 0)
  const frameTerpotong = data.stokFrame
    .map((f) => ({ f, jumlah: pemakaian.frame[f.id] ?? 0 }))
    .filter((x) => x.jumlah > 0)

  // --- Ringkasan 1-baris untuk header section saat terlipat (accordion) ---
  const totalUpgradeQty = Object.values(upgradePerTipe).reduce((s, n) => s + n, 0)
  const totalProdukQty = Object.values(produkPerTipe).reduce((s, n) => s + n, 0)
  const totalKertasPotong = kertasTerpotong.reduce((s, x) => s + x.jumlah, 0)
  const totalFramePotong = frameTerpotong.reduce((s, x) => s + x.jumlah, 0)
  const upgradeSummary =
    totalUpgradeQty > 0 ? `${totalUpgradeQty} item` : 'Ketuk untuk isi'
  const produkSummary =
    totalProdukQty > 0 ? `${totalProdukQty} item` : 'Ketuk untuk isi'
  const stokSummary =
    [
      totalKertasPotong > 0 ? `${totalKertasPotong} lembar kertas` : null,
      amplopTerpakai > 0 ? `${amplopTerpakai} amplop` : null,
      totalFramePotong > 0 ? `${totalFramePotong} frame` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Otomatis dari tiket & produk'
  const lainSummary =
    [
      potonganHarga > 0 ? `diskon ${formatRupiah(potonganHarga)}` : null,
      keterangan.trim() ? 'ada catatan' : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Opsional'
  const bayarSummary =
    [
      tunai > 0 ? `tunai ${formatRupiah(tunai)}` : null,
      qris > 0 ? `QRIS ${formatRupiah(qris)}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Opsional'

  // Rekonsiliasi float laci. Laci TIDAK mulai dari kosong tiap hari: ada uang
  // kecil kembalian yang nyangkut dari laporan sebelumnya. Jadi BALANCE bukan
  // saat (besar+kecil) === tunai, melainkan saat sisa di laci setelah tunai
  // hari ini = uang kecil kemarin + penyesuaian (tambah−pakai) hari ini:
  //   (uangBesar + uangKecil) − tunai  ===  uangKecilKemarin + Σtambah − Σpakai
  const uangKasir = uangBesar + uangKecil
  const prevLaporan = data.laporanIncome
    .filter((l) => l.tanggal < tanggal)
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal))[0]
  const floatMasuk = prevLaporan?.uangKecil ?? 0
  const penyesuaianHariIni = (data.penyesuaianUangKecil ?? [])
    .filter((p) => p.tanggal === tanggal)
    .reduce((s, p) => s + (p.tipe === 'tambah' ? 1 : -1) * (p.jumlah ?? 0), 0)
  const floatSeharusnya = floatMasuk + penyesuaianHariIni
  const floatAktual = uangKasir - tunai
  const kasirBalance = floatAktual === floatSeharusnya
  const kasirTerisi = uangBesar > 0 || uangKecil > 0
  const kasirSummary = !kasirTerisi
    ? 'Opsional'
    : kasirBalance
      ? 'BALANCE'
      : 'TIDAK BALANCE'

  // Section yang dibuka otomatis saat edit kalau laporannya sudah punya isi,
  // supaya data lama tidak tersembunyi. Dihitung sekali dari `existing`.
  const upgradeDefaultOpen = !!existing?.upgrades?.some((u) => u.jumlah > 0)
  const produkDefaultOpen = !!existing?.produk?.some((p) => p.jumlah > 0)
  const stokDefaultOpen =
    !!existing &&
    (existing.amplopTerpakai != null ||
      (existing.pemakaianKertas?.length ?? 0) > 1)
  const lainDefaultOpen =
    (existing?.potonganHarga ?? 0) > 0 || !!existing?.keterangan?.trim()
  const bayarDefaultOpen =
    (existing?.tunai ?? 0) > 0 || (existing?.qris ?? 0) > 0
  const kasirDefaultOpen =
    (existing?.uangBesar ?? 0) > 0 ||
    (existing?.uangKecil ?? 0) > 0 ||
    (existing?.totalUangBesar ?? 0) > 0

  function setItem(
    layanan: string,
    kId: string,
    k: 'tiket' | 'cetak',
    v: number,
  ) {
    if (isLocked(kId)) return
    setItems((arr) =>
      arr.map((i) =>
        i.layanan === layanan && i.karyawanId === kId
          ? { ...i, [k]: Math.max(0, Math.floor(v || 0)) }
          : i,
      ),
    )
  }

  function setUpgrade(tipe: Upgrade, kId: string, v: number) {
    if (isLocked(kId)) return
    setUpgrades((arr) =>
      arr.map((u) =>
        u.tipe === tipe && u.karyawanId === kId
          ? { ...u, jumlah: Math.max(0, Math.floor(v || 0)) }
          : u,
      ),
    )
  }

  function setProdukJumlah(produkId: string, kId: string, v: number) {
    if (isLocked(kId)) return
    setProduk((arr) =>
      arr.map((p) =>
        p.produkId === produkId && p.karyawanId === kId
          ? { ...p, jumlah: Math.max(0, Math.floor(v || 0)) }
          : p,
      ),
    )
  }

  function get(layanan: string, kId: string): IncomeItem | undefined {
    return items.find((i) => i.layanan === layanan && i.karyawanId === kId)
  }
  function getU(tipe: Upgrade, kId: string): UpgradeItem | undefined {
    return upgrades.find((u) => u.tipe === tipe && u.karyawanId === kId)
  }
  function getP(produkId: string, kId: string): ProdukItem | undefined {
    return produk.find((p) => p.produkId === produkId && p.karyawanId === kId)
  }

  // --- handler alokasi kertas ---
  function setAutoPaper(id: string) {
    setKertasRows((prev) => {
      const next = prev.length ? [...prev] : [{ kertasId: id, jumlah: 0 }]
      next[0] = { ...next[0], kertasId: id }
      return next
    })
  }
  function pakaiBeberapaKertas() {
    // Bekukan jumlah baris pertama ke total lembar, lalu tambah baris kosong.
    setKertasRows((prev) => {
      const base = prev.length
        ? [...prev]
        : [{ kertasId: defaultKertasId, jumlah: 0 }]
      base[0] = { kertasId: base[0].kertasId, jumlah: totalLembar }
      return [...base, { kertasId: '', jumlah: 0 }]
    })
    setKertasAuto(false)
  }
  function pakaiSatuKertas() {
    setKertasRows((prev) => [
      { kertasId: prev[0]?.kertasId ?? defaultKertasId, jumlah: 0 },
    ])
    setKertasAuto(true)
  }
  function setRowKertas(i: number, id: string) {
    setKertasRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, kertasId: id } : r)))
  }
  function setRowJumlah(i: number, v: number) {
    setKertasAuto(false)
    setKertasRows((prev) =>
      prev.map((r, idx) =>
        idx === i ? { ...r, jumlah: Math.max(0, Math.floor(v || 0)) } : r,
      ),
    )
  }
  function tambahBarisKertas() {
    setKertasAuto(false)
    setKertasRows((prev) => [...prev, { kertasId: '', jumlah: 0 }])
  }
  function hapusBarisKertas(i: number) {
    setKertasRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  function simpan() {
    const laporan: LaporanIncome = {
      id: existing?.id ?? crypto.randomUUID(),
      tanggal,
      items: items.filter((i) => i.tiket > 0 || i.cetak > 0),
      upgrades: upgrades.filter((u) => u.jumlah > 0),
      produk: produk.filter((p) => p.jumlah > 0),
      keterangan: keterangan.trim(),
      hargaTiket,
      hargaCetak,
      hargaUpgrade,
      hargaProduk,
      pemakaianKertas,
      amplopTerpakai,
      potonganHarga: Math.max(0, Math.floor(potonganHarga || 0)),
      tunai: Math.max(0, Math.floor(tunai || 0)),
      qris: Math.max(0, Math.floor(qris || 0)),
      uangBesar: Math.max(0, Math.floor(uangBesar || 0)),
      uangKecil: Math.max(0, Math.floor(uangKecil || 0)),
    }
    onSave(laporan)
  }

  const ada =
    items.some((i) => i.tiket > 0 || i.cetak > 0) ||
    upgrades.some((u) => u.jumlah > 0) ||
    produk.some((p) => p.jumlah > 0) ||
    !!keterangan.trim()
  const canSave = !!tanggal && ada

  return (
    <Modal onClose={onClose} wide>
      <ModalHead
        icon={<Icons.pencil />}
        color="var(--mint-deep)"
        title={existing ? 'Edit Laporan Income' : 'Tambah Laporan Income'}
        sub={tanggal}
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="field">
          <label>Tanggal</label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            style={{
              width: '100%',
              padding: '13px 15px',
              borderRadius: 'var(--radius-sm)',
              border: '1.8px solid var(--line)',
              background: 'var(--surface-2)',
              color: 'var(--ink)',
              fontSize: 15,
              fontWeight: 600,
            }}
          />
        </div>

        {employees.length === 0 ? (
          <div className="form-hint">
            Belum ada karyawan. Tambahkan dulu di menu Presensi Karyawan supaya
            bisa input penjualan per karyawan.
          </div>
        ) : (
          <>
            <Section
              ikon="📸"
              title="Layanan (tiket & cetak)"
              defaultOpen
            >
              {layananList.map((def) => (
                <ItemGroup
                  key={def.id}
                  title={def.label}
                  ikon={def.ikon}
                  hargaTiket={hargaTiket[def.id] ?? 0}
                  hargaCetak={hargaCetak}
                  showMoney={showMoney}
                  employees={employees}
                  isLocked={isLocked}
                  getValue={(empId, k) => get(def.id, empId)?.[k] ?? 0}
                  onChange={(empId, k, v) => setItem(def.id, empId, k, v)}
                />
              ))}
            </Section>

            <Section
              ikon="🎨"
              title="Upgrade Cetak"
              summary={upgradeSummary}
              defaultOpen={upgradeDefaultOpen}
            >
              {upgradeList.map((def) => (
                <UpgradeGroup
                  key={def.id}
                  title={def.label}
                  ikon={def.ikon}
                  harga={hargaUpgrade[def.id] ?? 0}
                  showMoney={showMoney}
                  employees={employees}
                  isLocked={isLocked}
                  getValue={(empId) => getU(def.id, empId)?.jumlah ?? 0}
                  onChange={(empId, v) => setUpgrade(def.id, empId, v)}
                />
              ))}
            </Section>

            {produkList.length > 0 && (
              <Section
                ikon="🛍️"
                title="Produk / Frame"
                summary={produkSummary}
                defaultOpen={produkDefaultOpen}
              >
                {produkList.map((def) => (
                  <UpgradeGroup
                    key={def.id}
                    title={def.label}
                    ikon={def.ikon}
                    harga={hargaProduk[def.id] ?? 0}
                    showMoney={showMoney}
                    employees={employees}
                    isLocked={isLocked}
                    getValue={(empId) => getP(def.id, empId)?.jumlah ?? 0}
                    onChange={(empId, v) => setProdukJumlah(def.id, empId, v)}
                  />
                ))}
              </Section>
            )}
          </>
        )}

        <Section
          ikon="📦"
          title="Pemakaian Stok"
          summary={stokSummary}
          defaultOpen={stokDefaultOpen}
        >
          <div className="form-hint" style={{ marginTop: -2, marginBottom: 10 }}>
            Tiket &amp; tambahan cetak memotong kertas; tiap tiket dapat 1 amplop.
            Upgrade (Poster / Crack n Share) tidak pakai amplop. Produk yang
            namanya sama dengan jenis frame memotong stok frame. Stok berkurang
            otomatis saat laporan disimpan.
          </div>

          {kertasPilihan.length === 0 ? (
            <div className="form-hint">
              Belum ada jenis kertas (selain kertas upgrade) di Inventaris.
              Tambahkan dulu supaya stok kertas bisa berkurang otomatis.
            </div>
          ) : kertasAuto ? (
            <div className="field">
              <label>Jenis kertas (untuk {totalLembar} lembar tiket &amp; cetak)</label>
              <select
                value={kertasRows[0]?.kertasId ?? ''}
                onChange={(e) => setAutoPaper(e.target.value)}
                style={selStyle}
              >
                {kertasPilihan.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama} · stok {k.stok}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ marginTop: 8 }}
                onClick={pakaiBeberapaKertas}
              >
                + Pakai beberapa jenis kertas
              </button>
            </div>
          ) : (
            <div className="field">
              <label>
                Pemakaian kertas (tiket + cetak = {totalLembar} lembar)
              </label>
              {kertasRows.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <select
                    value={r.kertasId}
                    onChange={(e) => setRowKertas(i, e.target.value)}
                    style={{ ...selStyle, flex: 1 }}
                  >
                    <option value="">— pilih kertas —</option>
                    {kertasPilihan.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nama} · stok {k.stok}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={r.jumlah === 0 ? '' : String(r.jumlah)}
                    placeholder="0"
                    onChange={(e) =>
                      setRowJumlah(i, parseInt(e.target.value, 10) || 0)
                    }
                    style={{ ...selStyle, width: 90 }}
                  />
                  {kertasRows.length > 1 && (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => hapusBarisKertas(i)}
                      aria-label="Hapus baris"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={tambahBarisKertas}
                >
                  + jenis kertas
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={pakaiSatuKertas}
                >
                  Pakai 1 kertas saja
                </button>
              </div>
              <div
                className="form-hint"
                style={{
                  marginTop: 6,
                  color:
                    totalDialokasikan === totalLembar
                      ? undefined
                      : 'var(--warn, #b26a00)',
                }}
              >
                Dialokasikan {totalDialokasikan} dari {totalLembar} lembar
                {totalDialokasikan === totalLembar
                  ? ' ✓'
                  : totalDialokasikan < totalLembar
                    ? ` · sisa ${totalLembar - totalDialokasikan} belum dialokasikan`
                    : ` · kelebihan ${totalDialokasikan - totalLembar}`}
              </div>
            </div>
          )}

          <div className="field">
            <label>
              Amplop terpakai{' '}
              {!amplopManual && (
                <span className="form-hint" style={{ fontWeight: 500 }}>
                  (otomatis = {jumlahTiket} tiket)
                </span>
              )}
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={amplopTerpakai === 0 ? '' : String(amplopTerpakai)}
                placeholder="0"
                onChange={(e) => {
                  setAmplopManual(true)
                  setAmplopInput(Math.max(0, parseInt(e.target.value, 10) || 0))
                }}
                style={{
                  flex: 1,
                  padding: '13px 15px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1.8px solid var(--line)',
                  background: 'var(--surface-2)',
                  color: 'var(--ink)',
                  fontSize: 15,
                  fontWeight: 600,
                }}
              />
              {amplopManual && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setAmplopManual(false)
                    setAmplopInput(0)
                  }}
                >
                  Ikuti tiket
                </button>
              )}
            </div>
            <div className="form-hint">
              Naikkan kalau customer minta cetak tambahan yang butuh amplop
              ekstra di luar amplop dari tiket.
            </div>
          </div>

          {(kertasTerpotong.length > 0 ||
            frameTerpotong.length > 0 ||
            amplopTerpakai > 0) && (
            <div className="income-total" style={{ marginTop: 4 }}>
              {kertasTerpotong.map(({ k, jumlah }) => (
                <div key={k.id} className="income-total-row">
                  <span>📄 {k.nama}</span>
                  <span className="income-total-val">
                    −{jumlah} lembar
                    {jumlah > k.stok ? ' ⚠️ stok kurang' : ''}
                  </span>
                </div>
              ))}
              {frameTerpotong.map(({ f, jumlah }) => (
                <div key={f.id} className="income-total-row">
                  <span>🖼️ {f.nama}</span>
                  <span className="income-total-val">
                    −{jumlah} buah
                    {jumlah > f.stok ? ' ⚠️ stok kurang' : ''}
                  </span>
                </div>
              ))}
              {amplopTerpakai > 0 && (
                <div className="income-total-row">
                  <span>✉️ Amplop</span>
                  <span className="income-total-val">
                    −{amplopTerpakai}
                    {amplopTerpakai > data.stokAmplop ? ' ⚠️ stok kurang' : ''}
                  </span>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section
          ikon="🏷️"
          title="Potongan harga & catatan"
          summary={lainSummary}
          defaultOpen={lainDefaultOpen}
        >
          {/* Potongan harga bisa diisi siapa pun yang menginput laporan
              (termasuk karyawan), karena diskon bagian dari transaksi penjualan
              — bukan nominal income yang disembunyikan dari karyawan. */}
          <div className="field">
            <label>
              Potongan harga (Rp){' '}
              <span className="form-hint" style={{ fontWeight: 500 }}>
                — diskon, dikurangkan dari total income
              </span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={potonganHarga === 0 ? '' : String(potonganHarga)}
              placeholder="0"
              onChange={(e) =>
                setPotonganHarga(Math.max(0, parseInt(e.target.value, 10) || 0))
              }
              style={selStyle}
            />
            <div className="form-hint">
              Mis. diskon promo atau potongan khusus customer. Tidak memengaruhi
              bonus penjualan karyawan.
            </div>
          </div>

          <div className="field">
            <label>Keterangan (opsional)</label>
            <textarea
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              rows={2}
              placeholder="cth: rame banget, ada event sekolah"
              style={{ minHeight: 60, resize: 'vertical' }}
            />
          </div>
        </Section>

        <Section
          ikon="💳"
          title="Pembayaran via"
          summary={bayarSummary}
          defaultOpen={bayarDefaultOpen}
        >
          {/* Pecahan pembayaran yang diterima per metode (tunai/QRIS). Murni
              catatan — tidak memengaruhi total income maupun bonus karyawan. */}
          <div className="field">
            <label>💵 Tunai (Rp)</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={tunai === 0 ? '' : String(tunai)}
              placeholder="0"
              onChange={(e) =>
                setTunai(Math.max(0, parseInt(e.target.value, 10) || 0))
              }
              style={selStyle}
            />
          </div>

          <div className="field">
            <label>📱 QRIS (Rp)</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={qris === 0 ? '' : String(qris)}
              placeholder="0"
              onChange={(e) =>
                setQris(Math.max(0, parseInt(e.target.value, 10) || 0))
              }
              style={selStyle}
            />
          </div>
          <div className="form-hint">
            Catatan metode pembayaran yang diterima. Tidak memengaruhi total
            income.
          </div>
        </Section>

        <Section
          ikon="💰"
          title="Uang Tunai di Kasir"
          summary={kasirSummary}
          defaultOpen={kasirDefaultOpen}
        >
          {/* Cek isi laci: uang besar + uang kecil harus balance dengan
              pembayaran tunai. Total uang besar murni catatan. */}
          <div className="field">
            <label>💵 Uang besar (Rp)</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={uangBesar === 0 ? '' : String(uangBesar)}
              placeholder="0"
              onChange={(e) =>
                setUangBesar(Math.max(0, parseInt(e.target.value, 10) || 0))
              }
              style={selStyle}
            />
          </div>

          <div className="field">
            <label>🪙 Uang kecil (Rp)</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={uangKecil === 0 ? '' : String(uangKecil)}
              placeholder="0"
              onChange={(e) =>
                setUangKecil(Math.max(0, parseInt(e.target.value, 10) || 0))
              }
              style={selStyle}
            />
          </div>

          {/* Indikator BALANCE / TIDAK BALANCE. BALANCE = sisa di laci setelah
              tunai hari ini cocok dengan uang kecil kemarin + penyesuaian. */}
          {kasirTerisi && (
            <div
              style={{
                marginTop: 2,
                fontWeight: 800,
                fontSize: 16,
                letterSpacing: 0.5,
                color: kasirBalance
                  ? 'var(--mint-deep, #0B8A6B)'
                  : 'var(--danger, #C0392B)',
              }}
            >
              {kasirBalance ? '🟢 BALANCE' : '🔴 TIDAK BALANCE'}
            </div>
          )}

          <div className="form-hint">
            Untuk mengecek isi laci. Laci tidak mulai kosong tiap hari: uang kecil
            kembalian dari kemarin tetap nyangkut. BALANCE jika (uang besar + uang
            kecil) − tunai sama dengan uang kecil kemarin ditambah penyesuaian
            (tambah − pakai) uang kecil hari ini.
          </div>
        </Section>

        {showMoney && (
        <div className="income-total">
          {layananList.map((def) =>
            (tiketPerLayanan[def.id] ?? 0) > 0 ? (
              <div key={def.id} className="income-total-row">
                <span>
                  {def.ikon} {def.label} · {tiketPerLayanan[def.id]} tiket ×{' '}
                  {formatRupiah(hargaTiket[def.id] ?? 0)}
                </span>
                <span className="income-total-val">
                  {formatRupiah(inc.incomeTiketPerLayanan[def.id] ?? 0)}
                </span>
              </div>
            ) : null,
          )}
          {tC > 0 && (
            <div className="income-total-row">
              <span>
                (+) Cetak {tC} × {formatRupiah(hargaCetak)}
              </span>
              <span className="income-total-val">
                {formatRupiah(inc.incomeCetak)}
              </span>
            </div>
          )}
          {upgradeList.map((def) =>
            (upgradePerTipe[def.id] ?? 0) > 0 ? (
              <div key={def.id} className="income-total-row">
                <span>
                  {def.ikon} {def.label} · {upgradePerTipe[def.id]} ×{' '}
                  {formatRupiah(hargaUpgrade[def.id] ?? 0)}
                </span>
                <span className="income-total-val">
                  {formatRupiah(inc.incomeUpgradePerTipe[def.id] ?? 0)}
                </span>
              </div>
            ) : null,
          )}
          {produkList.map((def) =>
            (produkPerTipe[def.id] ?? 0) > 0 ? (
              <div key={def.id} className="income-total-row">
                <span>
                  {def.ikon} {def.label} · {produkPerTipe[def.id]} ×{' '}
                  {formatRupiah(hargaProduk[def.id] ?? 0)}
                </span>
                <span className="income-total-val">
                  {formatRupiah(inc.incomeProdukPerTipe[def.id] ?? 0)}
                </span>
              </div>
            ) : null,
          )}
          {inc.potonganHarga > 0 && (
            <div className="income-total-row">
              <span>🏷️ Potongan harga</span>
              <span className="income-total-val">
                −{formatRupiah(inc.potonganHarga)}
              </span>
            </div>
          )}
          <div className="income-total-row income-total-grand">
            <span>TOTAL INCOME</span>
            <span className="income-total-val">{formatRupiah(inc.total)}</span>
          </div>
        </div>
        )}

        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          disabled={!canSave}
          onClick={simpan}
        >
          <Icons.check /> {existing ? 'Simpan Perubahan' : 'Simpan Laporan'}
        </button>
      </div>
    </Modal>
  )
}

/**
 * Section yang bisa dilipat (accordion) untuk merapikan form input laporan.
 * Saat terlipat, header menampilkan ringkasan 1-baris (`summary`) supaya isinya
 * tetap kebaca sekilas tanpa harus membuka. State buka/tutup lokal; data input
 * hidup di komponen induk jadi tidak hilang saat section ditutup.
 */
function Section({
  ikon,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  ikon: string
  title: string
  summary?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={'acc' + (open ? ' is-open' : '')}>
      <button
        type="button"
        className="acc-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="acc-ikon">{ikon}</span>
        <span className="acc-titles">
          <span className="acc-judul">{title}</span>
          {!open && summary && <span className="acc-summary">{summary}</span>}
        </span>
        <span className={'acc-chev' + (open ? ' is-open' : '')}>
          <Icons.chevron />
        </span>
      </button>
      {open && <div className="acc-body">{children}</div>}
    </div>
  )
}

type GroupProps = {
  title: string
  ikon: string
  hargaTiket: number
  hargaCetak: number
  showMoney: boolean
  employees: { id: string; nama: string }[]
  isLocked: (empId: string) => boolean
  getValue: (empId: string, k: 'tiket' | 'cetak') => number
  onChange: (empId: string, k: 'tiket' | 'cetak', v: number) => void
}

function ItemGroup({
  title,
  ikon,
  hargaTiket,
  hargaCetak,
  showMoney,
  employees,
  isLocked,
  getValue,
  onChange,
}: GroupProps) {
  return (
    <div className="income-group">
      <div className="income-group-head">
        <span className="income-group-ikon">{ikon}</span>
        <div>
          <div className="income-group-judul">{title}</div>
          {showMoney && (
            <div className="income-group-sub">
              Tiket {formatRupiah(hargaTiket)} · Cetak {formatRupiah(hargaCetak)}
            </div>
          )}
        </div>
      </div>
      <div className="income-rows">
        {employees.map((emp) => {
          const locked = isLocked(emp.id)
          return (
            <div
              key={emp.id}
              className={'income-row' + (locked ? ' is-locked' : '')}
            >
              <div className="income-row-nama">
                {emp.nama}
                {locked && <Icons.lock />}
              </div>
              <NumberCell
                label="Tiket"
                value={getValue(emp.id, 'tiket')}
                disabled={locked}
                onChange={(v) => onChange(emp.id, 'tiket', v)}
              />
              <NumberCell
                label="(+) Cetak"
                value={getValue(emp.id, 'cetak')}
                disabled={locked}
                onChange={(v) => onChange(emp.id, 'cetak', v)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

type UpgradeGroupProps = {
  title: string
  ikon: string
  harga: number
  showMoney: boolean
  employees: { id: string; nama: string }[]
  isLocked: (empId: string) => boolean
  getValue: (empId: string) => number
  onChange: (empId: string, v: number) => void
}

function UpgradeGroup({
  title,
  ikon,
  harga,
  showMoney,
  employees,
  isLocked,
  getValue,
  onChange,
}: UpgradeGroupProps) {
  return (
    <div className="upgrade-group">
      <div className="upgrade-group-head">
        <span className="upgrade-group-ikon">{ikon}</span>
        <div className="upgrade-group-info">
          <div className="upgrade-group-judul">{title}</div>
          {showMoney && (
            <div className="upgrade-group-harga">{formatRupiah(harga)} / item</div>
          )}
        </div>
      </div>
      <div className="upgrade-rows">
        {employees.map((emp) => {
          const locked = isLocked(emp.id)
          return (
            <div
              key={emp.id}
              className={'upgrade-row' + (locked ? ' is-locked' : '')}
            >
              <div className="income-row-nama">
                {emp.nama}
                {locked && <Icons.lock />}
              </div>
              <NumberCell
                label="Jumlah"
                value={getValue(emp.id)}
                disabled={locked}
                onChange={(v) => onChange(emp.id, v)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NumberCell({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const display = useMemo(() => (value === 0 ? '' : String(value)), [value])
  return (
    <label className="income-cell">
      <span className="income-cell-label">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        className="income-cell-input"
        value={display}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        placeholder="0"
      />
    </label>
  )
}
