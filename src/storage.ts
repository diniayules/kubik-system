import type {
  AbsenHari,
  AppData,
  DayType,
  Employee,
  HargaProduk,
  HargaTiket,
  HargaUpgrade,
  IncomeItem,
  JenisKertas,
  LaporanIncome,
  LayananDef,
  Pengeluaran,
  ProdukDef,
  ProdukItem,
  SalahCetak,
  Tinta,
  UpgradeDef,
  UpgradeItem,
  WarnaTinta,
} from './types'
import { KERTAS_SEED, WARNA_TINTA_LIST } from './inventory'
import {
  LAYANAN_CATALOG_DEFAULT,
  PRODUK_CATALOG_DEFAULT,
  UPGRADE_CATALOG_DEFAULT,
} from './income'

const KEY = 'absensi-karyawan:data:v1'

export const HARGA_TIKET_DEFAULT: HargaTiket = {
  photobooth: 35000,
  photobox: 35000,
  'photo-game': 25000,
}
export const HARGA_CETAK_DEFAULT = 10000
export const HARGA_UPGRADE_DEFAULT: HargaUpgrade = {
  poster: 20000,
  'crack-n-share': 2000,
}
export const HARGA_PRODUK_DEFAULT: HargaProduk = {}

function defaultStokKertas(): JenisKertas[] {
  return KERTAS_SEED.map((k) => ({ id: k.id, nama: k.nama, stok: 0 }))
}
function defaultStokTinta(): Tinta[] {
  return WARNA_TINTA_LIST.map((w) => ({ warna: w, stok: 0 }))
}

const EMPTY: AppData = {
  employees: [],
  inactiveEmployees: [],
  records: [],
  laporanIncome: [],
  laporanEvent: [],
  layananCatalog: structuredClone(LAYANAN_CATALOG_DEFAULT),
  upgradeCatalog: structuredClone(UPGRADE_CATALOG_DEFAULT),
  produkCatalog: structuredClone(PRODUK_CATALOG_DEFAULT),
  hargaTiket: { ...HARGA_TIKET_DEFAULT },
  hargaCetak: HARGA_CETAK_DEFAULT,
  hargaUpgrade: { ...HARGA_UPGRADE_DEFAULT },
  hargaProduk: { ...HARGA_PRODUK_DEFAULT },
  gajiPokok: {},
  gajiDibayar: {},
  stokKertas: defaultStokKertas(),
  stokTinta: defaultStokTinta(),
  stokAmplop: 0,
  salahCetak: [],
  pengeluaran: [],
}

function migrasiIncomeItem(i: Partial<IncomeItem>): IncomeItem | null {
  // layanan id is admin-defined now: accept any non-empty string.
  const layanan =
    typeof i.layanan === 'string' && i.layanan.trim() ? i.layanan : null
  if (!layanan) return null
  return {
    layanan,
    karyawanId: typeof i.karyawanId === 'string' ? i.karyawanId : '',
    tiket: typeof i.tiket === 'number' ? Math.max(0, Math.floor(i.tiket)) : 0,
    cetak: typeof i.cetak === 'number' ? Math.max(0, Math.floor(i.cetak)) : 0,
  }
}

function migrasiUpgradeItem(u: Partial<UpgradeItem>): UpgradeItem | null {
  const tipe = typeof u.tipe === 'string' && u.tipe.trim() ? u.tipe : null
  if (!tipe) return null
  return {
    tipe,
    karyawanId: typeof u.karyawanId === 'string' ? u.karyawanId : '',
    jumlah: typeof u.jumlah === 'number' ? Math.max(0, Math.floor(u.jumlah)) : 0,
  }
}

function migrasiProdukItem(p: Partial<ProdukItem>): ProdukItem | null {
  const produkId =
    typeof p.produkId === 'string' && p.produkId.trim() ? p.produkId : null
  if (!produkId) return null
  return {
    produkId,
    karyawanId: typeof p.karyawanId === 'string' ? p.karyawanId : '',
    jumlah: typeof p.jumlah === 'number' ? Math.max(0, Math.floor(p.jumlah)) : 0,
  }
}

/** A flat record of id -> non-negative price. Legacy single-number form maps
 *  to all default ids. */
function normalizeHargaMap(raw: unknown, fallback: Record<string, number>): Record<string, number> {
  if (typeof raw === 'number') {
    const out: Record<string, number> = {}
    for (const id of Object.keys(fallback)) out[id] = raw
    return out
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const out: Record<string, number> = { ...fallback }
    for (const [id, v] of Object.entries(obj)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[id] = Math.max(0, v)
    }
    return out
  }
  return { ...fallback }
}

function normalizeHargaTiket(raw: unknown): HargaTiket {
  return normalizeHargaMap(raw, HARGA_TIKET_DEFAULT)
}

function normalizeHargaUpgrade(raw: unknown): HargaUpgrade {
  return normalizeHargaMap(raw, HARGA_UPGRADE_DEFAULT)
}

function normalizeHargaProduk(raw: unknown): HargaProduk {
  return normalizeHargaMap(raw, HARGA_PRODUK_DEFAULT)
}

function migrasiCatalog<T extends LayananDef | UpgradeDef>(
  raw: unknown,
  fallback: T[],
  fallbackIkon: string,
): T[] {
  if (!Array.isArray(raw)) return structuredClone(fallback)
  const out: T[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Partial<LayananDef>
    const id = typeof o.id === 'string' ? o.id.trim() : ''
    if (!id || out.some((d) => d.id === id)) continue
    out.push({
      id,
      label: typeof o.label === 'string' && o.label.trim() ? o.label : id,
      ikon: typeof o.ikon === 'string' && o.ikon.trim() ? o.ikon : fallbackIkon,
    } as T)
  }
  return out.length ? out : structuredClone(fallback)
}

function migrasiKertas(k: Partial<JenisKertas>): JenisKertas | null {
  if (!k || typeof k !== 'object') return null
  const nama = typeof k.nama === 'string' ? k.nama.trim() : ''
  if (!nama) return null
  return {
    id: k.id ?? Math.random().toString(36).slice(2),
    nama,
    stok: typeof k.stok === 'number' ? Math.max(0, Math.floor(k.stok)) : 0,
  }
}

function migrasiStokTinta(arr: unknown): Tinta[] {
  const out: Tinta[] = WARNA_TINTA_LIST.map((w) => ({ warna: w, stok: 0 }))
  if (Array.isArray(arr)) {
    for (const raw of arr) {
      if (!raw || typeof raw !== 'object') continue
      const r = raw as Partial<Tinta>
      const idx = WARNA_TINTA_LIST.indexOf(r.warna as WarnaTinta)
      if (idx < 0) continue
      out[idx].stok = typeof r.stok === 'number' ? Math.max(0, Math.floor(r.stok)) : 0
      if (typeof r.catatan === 'string') out[idx].catatan = r.catatan
    }
  }
  return out
}

function migrasiSalahCetak(s: Partial<SalahCetak>): SalahCetak | null {
  if (!s || typeof s !== 'object') return null
  if (typeof s.kertasId !== 'string' || !s.kertasId) return null
  return {
    id: s.id ?? Math.random().toString(36).slice(2),
    tanggal: s.tanggal ?? '',
    kertasId: s.kertasId,
    jumlah: typeof s.jumlah === 'number' ? Math.max(0, Math.floor(s.jumlah)) : 0,
    alasan: typeof s.alasan === 'string' ? s.alasan : '',
  }
}

function migrasiPengeluaran(p: Partial<Pengeluaran>): Pengeluaran | null {
  if (!p || typeof p !== 'object') return null
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    tanggal: p.tanggal ?? '',
    kategori: typeof p.kategori === 'string' ? p.kategori : '',
    deskripsi: typeof p.deskripsi === 'string' ? p.deskripsi : '',
    jumlah: typeof p.jumlah === 'number' ? Math.max(0, Math.floor(p.jumlah)) : 0,
    catatan: typeof p.catatan === 'string' ? p.catatan : '',
  }
}

function migrasiLaporan(l: Partial<LaporanIncome>): LaporanIncome {
  const items: IncomeItem[] = Array.isArray(l.items)
    ? (l.items
        .map((it) => migrasiIncomeItem(it as Partial<IncomeItem>))
        .filter(Boolean) as IncomeItem[])
    : []
  const upgrades: UpgradeItem[] = Array.isArray(l.upgrades)
    ? (l.upgrades
        .map((u) => migrasiUpgradeItem(u as Partial<UpgradeItem>))
        .filter(Boolean) as UpgradeItem[])
    : []
  const produk: ProdukItem[] = Array.isArray(l.produk)
    ? (l.produk
        .map((p) => migrasiProdukItem(p as Partial<ProdukItem>))
        .filter(Boolean) as ProdukItem[])
    : []
  return {
    id: l.id ?? Math.random().toString(36).slice(2),
    tanggal: l.tanggal ?? '',
    items,
    upgrades,
    produk,
    keterangan: typeof l.keterangan === 'string' ? l.keterangan : '',
    hargaTiket: normalizeHargaTiket(l.hargaTiket),
    hargaCetak:
      typeof l.hargaCetak === 'number' ? l.hargaCetak : HARGA_CETAK_DEFAULT,
    hargaUpgrade: normalizeHargaUpgrade(l.hargaUpgrade),
    hargaProduk: normalizeHargaProduk(l.hargaProduk),
    potonganHarga:
      typeof l.potonganHarga === 'number' && l.potonganHarga > 0
        ? l.potonganHarga
        : 0,
  }
}

const VALID_SHIFTS: DayType[] = ['pagi', 'sore', 'full', 'cuti', 'libur']

function migrasiRecord(r: Partial<AbsenHari> & { shift?: unknown }): AbsenHari {
  const shift =
    typeof r.shift === 'string' && (VALID_SHIFTS as string[]).includes(r.shift)
      ? (r.shift as DayType)
      : 'full'
  return {
    id: r.id ?? Math.random().toString(36).slice(2),
    employeeId: r.employeeId ?? '',
    tanggal: r.tanggal ?? '',
    shift,
    events: Array.isArray(r.events) ? r.events : [],
    status: r.status === 'menunggu' ? 'menunggu' : 'disetujui',
  }
}

function migrasiEmployee(e: Partial<Employee>): Employee {
  return {
    id: e.id ?? Math.random().toString(36).slice(2),
    nama: e.nama ?? '',
    jabatan: e.jabatan ?? '',
    pinHash: typeof e.pinHash === 'string' ? e.pinHash : '',
  }
}

export function loadData(): AppData {
  const raw = localStorage.getItem(KEY)
  if (!raw) return structuredClone(EMPTY)
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>
    const rawRecords = Array.isArray(parsed.records) ? parsed.records : []
    const rawEmployees = Array.isArray(parsed.employees) ? parsed.employees : []
    const rawLaporan = Array.isArray(parsed.laporanIncome)
      ? parsed.laporanIncome
      : []
    return {
      employees: rawEmployees.map((e) => migrasiEmployee(e as Partial<Employee>)),
      inactiveEmployees: [],
      records: rawRecords.map((r) => migrasiRecord(r as Partial<AbsenHari>)),
      laporanIncome: rawLaporan.map((l) =>
        migrasiLaporan(l as Partial<LaporanIncome>),
      ),
      laporanEvent: Array.isArray(parsed.laporanEvent) ? parsed.laporanEvent : [],
      layananCatalog: migrasiCatalog<LayananDef>(
        parsed.layananCatalog,
        LAYANAN_CATALOG_DEFAULT,
        '🏷️',
      ),
      upgradeCatalog: migrasiCatalog<UpgradeDef>(
        parsed.upgradeCatalog,
        UPGRADE_CATALOG_DEFAULT,
        '🎁',
      ),
      produkCatalog: migrasiCatalog<ProdukDef>(
        parsed.produkCatalog,
        PRODUK_CATALOG_DEFAULT,
        '🛍️',
      ),
      hargaTiket: normalizeHargaTiket(parsed.hargaTiket),
      hargaCetak:
        typeof parsed.hargaCetak === 'number'
          ? parsed.hargaCetak
          : HARGA_CETAK_DEFAULT,
      hargaUpgrade: normalizeHargaUpgrade(parsed.hargaUpgrade),
      hargaProduk: normalizeHargaProduk(parsed.hargaProduk),
      gajiPokok:
        parsed.gajiPokok && typeof parsed.gajiPokok === 'object'
          ? parsed.gajiPokok
          : {},
      gajiDibayar:
        parsed.gajiDibayar && typeof parsed.gajiDibayar === 'object'
          ? parsed.gajiDibayar
          : {},
      stokKertas: Array.isArray(parsed.stokKertas)
        ? (parsed.stokKertas
            .map((k) => migrasiKertas(k as Partial<JenisKertas>))
            .filter(Boolean) as JenisKertas[])
        : defaultStokKertas(),
      stokTinta: migrasiStokTinta(parsed.stokTinta),
      stokAmplop:
        typeof parsed.stokAmplop === 'number'
          ? Math.max(0, Math.floor(parsed.stokAmplop))
          : 0,
      salahCetak: Array.isArray(parsed.salahCetak)
        ? (parsed.salahCetak
            .map((s) => migrasiSalahCetak(s as Partial<SalahCetak>))
            .filter(Boolean) as SalahCetak[])
        : [],
      pengeluaran: Array.isArray(parsed.pengeluaran)
        ? (parsed.pengeluaran
            .map((p) => migrasiPengeluaran(p as Partial<Pengeluaran>))
            .filter(Boolean) as Pengeluaran[])
        : [],
      headerJudul:
        typeof parsed.headerJudul === 'string' ? parsed.headerJudul : undefined,
      headerSub:
        typeof parsed.headerSub === 'string' ? parsed.headerSub : undefined,
      incomeJudul:
        typeof parsed.incomeJudul === 'string' ? parsed.incomeJudul : undefined,
      incomeSub:
        typeof parsed.incomeSub === 'string' ? parsed.incomeSub : undefined,
      brandKicker:
        typeof parsed.brandKicker === 'string' ? parsed.brandKicker : undefined,
      brandName:
        typeof parsed.brandName === 'string' ? parsed.brandName : undefined,
      dashJudul:
        typeof parsed.dashJudul === 'string' ? parsed.dashJudul : undefined,
      dashSub:
        typeof parsed.dashSub === 'string' ? parsed.dashSub : undefined,
    }
  } catch {
    return structuredClone(EMPTY)
  }
}

export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`absensi-salt::${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function saveData(data: AppData): void {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function uid(): string {
  // Valid UUID so it can be used directly as a Supabase `uuid` primary key.
  return crypto.randomUUID()
}

export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
