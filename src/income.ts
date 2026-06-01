import type {
  IncomeItem,
  JenisKertas,
  LaporanIncome,
  Layanan,
  LayananDef,
  ProdukDef,
  ProdukItem,
  Upgrade,
  UpgradeDef,
  UpgradeItem,
} from './types'

// ---------- default catalogs ----------
// The income report ships with these items; admins can add/remove more in
// "Atur Harga". Item prices live in AppData.hargaTiket / hargaUpgrade keyed by
// the def `id`.
export const LAYANAN_CATALOG_DEFAULT: LayananDef[] = [
  { id: 'photobooth', label: 'Photobooth', ikon: '📸' },
  { id: 'photobox', label: 'Photobox', ikon: '🎞️' },
  { id: 'photo-game', label: 'Photo Game', ikon: '🎮' },
]

export const UPGRADE_CATALOG_DEFAULT: UpgradeDef[] = [
  { id: 'poster', label: 'Poster', ikon: '🖼️' },
  { id: 'crack-n-share', label: 'Crack n Share', ikon: '🎁' },
]

// Merchandise / other products start empty — admins add frame foto, t-shirt, …
export const PRODUK_CATALOG_DEFAULT: ProdukDef[] = []

// ---------- catalog lookups ----------
export function findLayananDef(
  catalog: LayananDef[],
  id: Layanan,
): LayananDef | undefined {
  return catalog.find((d) => d.id === id)
}

export function labelLayanan(catalog: LayananDef[], id: Layanan): string {
  return findLayananDef(catalog, id)?.label ?? id
}

export function ikonLayanan(catalog: LayananDef[], id: Layanan): string {
  return findLayananDef(catalog, id)?.ikon ?? '🏷️'
}

export function findUpgradeDef(
  catalog: UpgradeDef[],
  id: Upgrade,
): UpgradeDef | undefined {
  return catalog.find((d) => d.id === id)
}

export function labelUpgrade(catalog: UpgradeDef[], id: Upgrade): string {
  return findUpgradeDef(catalog, id)?.label ?? id
}

export function ikonUpgrade(catalog: UpgradeDef[], id: Upgrade): string {
  return findUpgradeDef(catalog, id)?.ikon ?? '🎁'
}

export function findProdukDef(
  catalog: ProdukDef[],
  id: string,
): ProdukDef | undefined {
  return catalog.find((d) => d.id === id)
}

export function labelProduk(catalog: ProdukDef[], id: string): string {
  return findProdukDef(catalog, id)?.label ?? id
}

export function ikonProduk(catalog: ProdukDef[], id: string): string {
  return findProdukDef(catalog, id)?.ikon ?? '🛍️'
}

/**
 * Catalog defs in display order, with any extra ids present in `ids` (e.g. a
 * deleted item that historic laporan still reference) appended so their data
 * never silently disappears from a report.
 */
export function mergeLayanan(
  catalog: LayananDef[],
  ids: Layanan[],
): LayananDef[] {
  const out = [...catalog]
  for (const id of ids) {
    if (!out.some((d) => d.id === id)) {
      out.push({ id, label: id, ikon: '🏷️' })
    }
  }
  return out
}

export function mergeUpgrade(
  catalog: UpgradeDef[],
  ids: Upgrade[],
): UpgradeDef[] {
  const out = [...catalog]
  for (const id of ids) {
    if (!out.some((d) => d.id === id)) {
      out.push({ id, label: id, ikon: '🎁' })
    }
  }
  return out
}

export function mergeProduk(
  catalog: ProdukDef[],
  ids: string[],
): ProdukDef[] {
  const out = [...catalog]
  for (const id of ids) {
    if (!out.some((d) => d.id === id)) {
      out.push({ id, label: id, ikon: '🛍️' })
    }
  }
  return out
}

export function formatRupiah(n: number): string {
  if (!Number.isFinite(n)) return 'Rp 0'
  const abs = Math.round(Math.abs(n))
  const sign = n < 0 ? '-' : ''
  return `${sign}Rp ${abs.toLocaleString('id-ID')}`
}

export function totalTiket(items: IncomeItem[]): number {
  return items.reduce((s, i) => s + (i.tiket || 0), 0)
}

export function totalCetak(items: IncomeItem[]): number {
  return items.reduce((s, i) => s + (i.cetak || 0), 0)
}

export function totalTiketPerLayanan(
  items: IncomeItem[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const i of items) out[i.layanan] = (out[i.layanan] ?? 0) + (i.tiket || 0)
  return out
}

export function totalUpgradePerTipe(
  upgrades: UpgradeItem[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const u of upgrades) out[u.tipe] = (out[u.tipe] ?? 0) + (u.jumlah || 0)
  return out
}

export function totalProdukPerTipe(
  produk: ProdukItem[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of produk)
    out[p.produkId] = (out[p.produkId] ?? 0) + (p.jumlah || 0)
  return out
}

export type IncomeBreakdown = {
  incomeTiket: number
  incomeTiketPerLayanan: Record<string, number>
  incomeCetak: number
  incomeUpgrade: number
  incomeUpgradePerTipe: Record<string, number>
  incomeProduk: number
  incomeProdukPerTipe: Record<string, number>
  /** Total income KOTOR sebelum potongan harga. */
  subtotal: number
  /** Potongan harga (diskon) dalam Rupiah. */
  potonganHarga: number
  /** Total income BERSIH = subtotal − potonganHarga. */
  total: number
}

export function hitungIncome(laporan: LaporanIncome): IncomeBreakdown {
  const perLayananTiket = totalTiketPerLayanan(laporan.items)
  const incomeTiketPerLayanan: Record<string, number> = {}
  let incomeTiket = 0
  for (const [id, qty] of Object.entries(perLayananTiket)) {
    const val = qty * (laporan.hargaTiket[id] ?? 0)
    incomeTiketPerLayanan[id] = val
    incomeTiket += val
  }

  const incomeCetak = totalCetak(laporan.items) * laporan.hargaCetak

  const perUpgradeTipe = totalUpgradePerTipe(laporan.upgrades)
  const incomeUpgradePerTipe: Record<string, number> = {}
  let incomeUpgrade = 0
  for (const [id, qty] of Object.entries(perUpgradeTipe)) {
    const val = qty * (laporan.hargaUpgrade[id] ?? 0)
    incomeUpgradePerTipe[id] = val
    incomeUpgrade += val
  }

  const perProdukTipe = totalProdukPerTipe(laporan.produk ?? [])
  const incomeProdukPerTipe: Record<string, number> = {}
  let incomeProduk = 0
  for (const [id, qty] of Object.entries(perProdukTipe)) {
    const val = qty * (laporan.hargaProduk?.[id] ?? 0)
    incomeProdukPerTipe[id] = val
    incomeProduk += val
  }

  const subtotal = incomeTiket + incomeCetak + incomeUpgrade + incomeProduk
  // Potongan dibatasi agar tidak melebihi subtotal (total tidak pernah negatif).
  const potonganHarga = Math.min(
    Math.max(0, laporan.potonganHarga ?? 0),
    subtotal,
  )

  return {
    incomeTiket,
    incomeTiketPerLayanan,
    incomeCetak,
    incomeUpgrade,
    incomeUpgradePerTipe,
    incomeProduk,
    incomeProdukPerTipe,
    subtotal,
    potonganHarga,
    total: subtotal - potonganHarga,
  }
}

// ---------- pemakaian stok (kertas + amplop) ----------
// Menghubungkan laporan income dengan inventaris: tiap tiket & tambahan cetak
// memotong 1 lembar kertas (jenis yang dipilih di laporan), tiap upgrade
// (Poster / Crack n Share) memotong 1 lembar kertas dengan NAMA yang sama, dan
// amplop berkurang sesuai `amplopTerpakai` (default = jumlah tiket).

/** Pemakaian stok satu laporan: { id kertas → jumlah lembar }, plus amplop. */
export type PemakaianStok = {
  kertas: Record<string, number>
  amplop: number
}

function normalNama(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Hitung berapa stok yang dipotong oleh sebuah laporan. Murni & deterministik
 * dari isi laporan, jadi bisa dipakai untuk menerapkan selisih saat edit/hapus.
 *
 * Catatan: kalau `kertasId`/`amplopTerpakai` tidak diisi (laporan lama sebelum
 * fitur ini), pemakaiannya dianggap 0 supaya edit/hapus laporan lama tidak
 * keliru "mengembalikan" stok yang tidak pernah dipotong.
 */
export function hitungPemakaianStok(
  laporan: Pick<
    LaporanIncome,
    'items' | 'upgrades' | 'pemakaianKertas' | 'amplopTerpakai'
  >,
  stokKertas: JenisKertas[],
  upgradeCatalog: UpgradeDef[],
): PemakaianStok {
  const kertas: Record<string, number> = {}
  const add = (id: string, n: number) => {
    if (n > 0) kertas[id] = (kertas[id] ?? 0) + n
  }

  // Tiket + tambahan cetak → jenis kertas yang dialokasikan di laporan (bisa
  // lebih dari satu jenis kalau sehari pakai kertas berbeda).
  for (const a of laporan.pemakaianKertas ?? []) {
    if (a.kertasId && stokKertas.some((k) => k.id === a.kertasId)) {
      add(a.kertasId, a.jumlah)
    }
  }

  // Upgrade → kertas dengan nama yang sama (Poster → "Poster", dst.). Dicocokkan
  // lewat nama karena id kertas berupa uuid, sedangkan id upgrade berupa slug.
  for (const u of laporan.upgrades) {
    if (!(u.jumlah > 0)) continue
    const label = labelUpgrade(upgradeCatalog, u.tipe)
    const k = stokKertas.find((x) => normalNama(x.nama) === normalNama(label))
    if (k) add(k.id, u.jumlah)
  }

  return { kertas, amplop: laporan.amplopTerpakai ?? 0 }
}

/**
 * Terapkan pemakaian stok: kurangi `tambah` (laporan baru/diedit) dan kembalikan
 * `hapus` (laporan lama yang diganti/dihapus). Selisih bersih dipotong dari
 * stok, di-clamp ke 0 (kolom DB punya CHECK stok >= 0). Mengembalikan stok baru
 * + flag `kurang` kalau ada yang sampai mentok 0 (stok tidak cukup).
 */
export function terapkanPemakaianStok(
  stokKertas: JenisKertas[],
  stokAmplop: number,
  tambah: PemakaianStok | null,
  hapus: PemakaianStok | null,
): { stokKertas: JenisKertas[]; stokAmplop: number; kurang: boolean } {
  let kurang = false
  const clamp0 = (n: number) => {
    if (n < 0) {
      kurang = true
      return 0
    }
    return n
  }

  const nextKertas = stokKertas.map((k) => {
    const delta = (tambah?.kertas[k.id] ?? 0) - (hapus?.kertas[k.id] ?? 0)
    return delta === 0 ? k : { ...k, stok: clamp0(k.stok - delta) }
  })

  const amplopDelta = (tambah?.amplop ?? 0) - (hapus?.amplop ?? 0)
  const nextAmplop =
    amplopDelta === 0 ? stokAmplop : clamp0(stokAmplop - amplopDelta)

  return { stokKertas: nextKertas, stokAmplop: nextAmplop, kurang }
}

export function ringkasanPerKaryawan(
  laporan: LaporanIncome,
): Record<
  string,
  { tiket: number; cetak: number; upgrade: number; produk: number; total: number }
> {
  const map: Record<
    string,
    { tiket: number; cetak: number; upgrade: number; produk: number; total: number }
  > = {}
  function get(id: string) {
    if (!map[id])
      map[id] = { tiket: 0, cetak: 0, upgrade: 0, produk: 0, total: 0 }
    return map[id]
  }
  for (const it of laporan.items) {
    const m = get(it.karyawanId)
    m.tiket += it.tiket
    m.cetak += it.cetak
    m.total +=
      it.tiket * (laporan.hargaTiket[it.layanan] ?? 0) +
      it.cetak * laporan.hargaCetak
  }
  for (const u of laporan.upgrades) {
    const m = get(u.karyawanId)
    m.upgrade += u.jumlah
    m.total += u.jumlah * (laporan.hargaUpgrade[u.tipe] ?? 0)
  }
  for (const p of laporan.produk ?? []) {
    const m = get(p.karyawanId)
    m.produk += p.jumlah
    m.total += p.jumlah * (laporan.hargaProduk?.[p.produkId] ?? 0)
  }
  return map
}
