import type { Role } from './roles'
// =============================================================
// db.ts · Supabase data layer for the AppData model.
//
// fetchAppData()    -> assemble the full AppData object from Supabase
//                      (DB-backed slices).
// persistChanges()  -> diff prev vs next AppData and write only the
//                      slices that changed (write-through `setData`).
//
// Device-local UI prefs (font, size, tampilan*) and theme are per-device,
// not per-account — handled separately in lib/prefs.tsx + App.tsx.
// =============================================================
import { supabase } from './supabase'
import type {
  AbsenHari,
  AppData,
  ClosingTask,
  Employee,
  EventKategori,
  HargaProduk,
  HargaTiket,
  HargaUpgrade,
  JadwalShift,
  JenisFrame,
  Kemitraan,
  KemitraanImbalan,
  Lead,
  LeadFollowup,
  JenisKertas,
  LaporanEvent,
  LaporanIncome,
  LayananDef,
  PenilaianOwner,
  PenyesuaianUangKecil,
  PenarikanUangBesar,
  Pengeluaran,
  SetoranRekening,
  ProdukDef,
  PromoProgram,
  DayType,
  SalahCetak,
  SewaTipe,
  SosmedHarian,
  LaporanHarian,
  TargetBulanan,
  Tinta,
  UpgradeDef,
  WarnaTinta,
  RitmeKonten,
  TahapanKartu,
} from '../types'
import {
  HARGA_CETAK_DEFAULT,
  HARGA_PRODUK_DEFAULT,
  HARGA_TIKET_DEFAULT,
  HARGA_UPGRADE_DEFAULT,
} from '../storage'
import {
  LAYANAN_CATALOG_DEFAULT,
  PRODUK_CATALOG_DEFAULT,
  UPGRADE_CATALOG_DEFAULT,
} from '../income'
import { WARNA_TINTA_LIST } from '../inventory'

// ---------- row types (snake_case, as stored) ----------
type ProfileRow = {
  id: string
  nama: string
  jabatan: string
  pin_hash: string | null
  role: Role | null
  nomor_induk: string | null
  no_hp: string[] | null
  foto: string | null
  nama_lengkap: string | null
  tempat_lahir: string | null
  tanggal_lahir: string | null
  pendidikan: string | null
  tanggal_diterima: string | null
}
type AbsenRow = {
  id: string
  employee_id: string
  tanggal: string
  shift: DayType
  events: AbsenHari['events']
  status: AbsenHari['status']
  extra_menit: number | null
  extra_catatan: string | null
  checklist_pulang: AbsenHari['checklistPulang'] | null
  checklist_masuk: AbsenHari['checklistMasuk'] | null
}
type LaporanRow = {
  id: string
  tanggal: string
  items: LaporanIncome['items']
  upgrades: LaporanIncome['upgrades']
  produk: LaporanIncome['produk']
  keterangan: string
  harga_tiket: HargaTiket
  harga_cetak: number
  harga_upgrade: HargaUpgrade
  harga_produk: HargaProduk
  kertas_id: string | null
  amplop_terpakai: number | null
  pemakaian_kertas: { kertasId: string; jumlah: number }[] | null
  potongan_harga: number | null
  tunai: number | null
  qris: number | null
  uang_besar: number | null
  uang_kecil: number | null
  total_uang_besar: number | null
}
type EventRow = {
  id: string
  tanggal: string
  kategori: string
  tipe: string
  keterangan: string | null
  jam: number | null
  tarif_per_jam: number | null
  biaya_kertas: number | null
  biaya_tinta: number | null
  biaya_listrik: number | null
  upah_operator: number | null
  voucher: number | null
  cetak: number | null
  harga_voucher: number | null
  harga_cetak: number | null
}
type PengeluaranRow = {
  id: string
  tanggal: string
  kategori: string
  deskripsi: string
  jumlah: number
  catatan: string
  sumber: 'cash' | 'rekening' | null
}
type PromoRow = {
  id: string
  judul: string | null
  deskripsi: string | null
  tahap: PromoProgram['tahap']
  status: PromoProgram['status']
  tanggal_mulai: string | null
  tanggal_selesai: string | null
  created_by: string | null
  created_at: string | null
  desain: string | null
  jenis: PromoProgram['jenis'] | null
  pic: string | null
  deadline: string | null
  selesai_pada: string | null
  tahapan: TahapanKartu[] | null
}
type LeadRow = {
  id: string
  nama: string | null
  kontak: string | null
  sumber: string | null
  kategori: Lead['kategori']
  tahap: Lead['tahap']
  nilai_estimasi: number | null
  nilai_realisasi: number | null
  pic: string | null
  tanggal_masuk: string
  tanggal_closing: string | null
  alasan_gagal: string | null
  catatan: string | null
  created_by: string | null
}
type LeadFollowupRow = {
  id: string
  lead_id: string
  tanggal: string
  catatan: string | null
  oleh: string | null
}
type KemitraanRow = {
  id: string
  instansi: string | null
  jenis: Kemitraan['jenis']
  kontak_nama: string | null
  kontak: string | null
  acara: string | null
  tanggal_acara: string | null
  tanggal_masuk: string
  status: Kemitraan['status']
  permintaan: string | null
  nilai_diminta: number | null
  nilai_disetujui: number | null
  bentuk: Kemitraan['bentuk']
  imbalan: KemitraanImbalan[] | null
  mou_mulai: string | null
  mou_berakhir: string | null
  alasan_tolak: string | null
  catatan: string | null
  pic: string | null
  tanggal_keputusan: string | null
  pengeluaran_id: string | null
  created_by: string | null
}
type SosmedRow = Omit<
  SosmedHarian,
  'catatan' | 'tautan' | 'oleh' | 'olehList'
> & {
  catatan: string | null
  tautan: string | null
  oleh: string | null
  oleh_list: string[] | null
}
type LaporanHarianRow = Omit<LaporanHarian, 'catatan' | 'oleh' | 'diperbarui'> & {
  catatan: string | null
  oleh: string | null
  updated_at: string | null
}
type JadwalShiftRow = {
  tanggal: string
  employee_id: string
  shift: JadwalShift['shift']
  catatan: string | null
}
type PenarikanUangBesarRow = {
  id: string
  tanggal: string
  jumlah: number
  catatan: string
}
type PenyesuaianUangKecilRow = {
  id: string
  tanggal: string
  tipe: 'tambah' | 'pakai'
  jumlah: number
  catatan: string
}
type GajiPembayaranViaRow = {
  employee_id: string
  periode: string
  metode: string
  nomor: string | null
}
type KertasRow = { id: string; nama: string; stok: number }
type FrameRow = { id: string; nama: string; stok: number }
type TintaRow = { warna: WarnaTinta; stok: number; catatan: string | null }
type AmplopRow = { id: number; stok: number }
type SalahCetakRow = {
  id: string
  tanggal: string
  kertas_id: string
  jumlah: number
  alasan: string
}
type ConfigRow = {
  id: number
  layanan_catalog: LayananDef[] | null
  upgrade_catalog: UpgradeDef[] | null
  produk_catalog: ProdukDef[] | null
  closing_checklist: ClosingTask[] | null
  opening_checklist: ClosingTask[] | null
  harga_tiket: HargaTiket
  harga_cetak: number
  harga_upgrade: HargaUpgrade
  harga_produk: HargaProduk | null
  gaji_pokok: Record<string, number> | null
  gaji_dibayar: Record<string, boolean> | null
  saldo_aktual: Record<string, { dompet: number; rekening: number }> | null
  setoran_rekening: SetoranRekening[] | null
  saldo_awal: { dompet: number; rekening: number } | null
  target_bulanan: Record<string, TargetBulanan> | null
  penilaian_owner: Record<string, PenilaianOwner> | null
  ritme_konten: RitmeKonten | null
  brand_kicker: string | null
  brand_name: string | null
  dash_judul: string | null
  dash_sub: string | null
  header_judul: string | null
  header_sub: string | null
  income_judul: string | null
  income_sub: string | null
}

function orErr<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

// =============================================================
// fetchAppData
// =============================================================
export async function fetchAppData(): Promise<AppData> {
  const [
    profilesRes,
    absenRes,
    laporanRes,
    eventRes,
    pengRes,
    penarikanRes,
    penyesuaianRes,
    pembayaranViaRes,
    kertasRes,
    frameRes,
    tintaRes,
    amplopRes,
    salahRes,
    configRes,
    inactiveRes,
    promoRes,
    jadwalRes,
    sosmedRes,
    laporanHarianRes,
    leadsRes,
    followupRes,
    kemitraanRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, nama, jabatan, pin_hash, role, nomor_induk, no_hp, foto, nama_lengkap, tempat_lahir, tanggal_lahir, pendidikan, tanggal_diterima')
      .eq('active', true)
      .order('created_at', { ascending: true }),
    supabase.from('absen_records').select('id, employee_id, tanggal, shift, events, status, extra_menit, extra_catatan, checklist_pulang, checklist_masuk'),
    supabase
      .from('laporan_income')
      .select(
        'id, tanggal, items, upgrades, produk, keterangan, harga_tiket, harga_cetak, harga_upgrade, harga_produk, kertas_id, amplop_terpakai, pemakaian_kertas, potongan_harga, tunai, qris, uang_besar, uang_kecil, total_uang_besar',
      ),
    supabase
      .from('laporan_event')
      .select(
        'id, tanggal, kategori, tipe, keterangan, jam, tarif_per_jam, biaya_kertas, biaya_tinta, biaya_listrik, upah_operator, voucher, cetak, harga_voucher, harga_cetak',
      ),
    // pengeluaran: semua user login (admin & karyawan) boleh lihat via RLS.
    supabase.from('pengeluaran').select('id, tanggal, kategori, deskripsi, jumlah, catatan, sumber'),
    // penarikan uang besar: semua user login (admin & karyawan) lihat via RLS.
    supabase
      .from('penarikan_uang_besar')
      .select('id, tanggal, jumlah, catatan')
      .order('tanggal', { ascending: true }),
    // penyesuaian uang kecil: semua user login (admin & karyawan) lihat via RLS.
    supabase
      .from('penyesuaian_uang_kecil')
      .select('id, tanggal, tipe, jumlah, catatan')
      .order('tanggal', { ascending: true }),
    // metode pembayaran gaji per (karyawan, periode): semua user login lihat.
    supabase.from('gaji_pembayaran_via').select('employee_id, periode, metode, nomor'),
    supabase.from('stok_kertas').select('id, nama, stok').order('nama', { ascending: true }),
    supabase.from('stok_frame').select('id, nama, stok').order('nama', { ascending: true }),
    supabase.from('stok_tinta').select('warna, stok, catatan'),
    supabase.from('stok_amplop').select('id, stok').eq('id', 1).maybeSingle(),
    supabase.from('salah_cetak').select('id, tanggal, kertas_id, jumlah, alasan'),
    supabase.from('app_config').select('*').eq('id', 1).maybeSingle(),
    // Karyawan nonaktif (active = false) — untuk fitur "Aktifkan kembali" admin.
    supabase
      .from('profiles')
      .select('id, nama, jabatan, pin_hash, role, nomor_induk, no_hp, foto, nama_lengkap, tempat_lahir, tanggal_lahir, pendidikan, tanggal_diterima')
      .eq('active', false)
      .order('created_at', { ascending: true }),
    // Papan Promosi: RLS memfilter baris yang boleh dilihat (admin semua;
    // karyawan hanya yang tayang + miliknya sendiri). Lihat migration 0035.
    supabase
      .from('promo_programs')
      .select('id, judul, deskripsi, tahap, status, tanggal_mulai, tanggal_selesai, created_by, created_at, desain, jenis, pic, deadline, selesai_pada, tahapan')
      .order('created_at', { ascending: true }),
    // Roster shift: RLS mengizinkan semua user login membaca (karyawan perlu
    // melihat jadwalnya sendiri). Lihat migration 0044.
    supabase
      .from('jadwal_shift')
      .select('tanggal, employee_id, shift, catatan')
      .order('tanggal', { ascending: true }),
    // Log sosmed harian: semua user login boleh membaca (operator perlu tahu
    // hari mana yang masih kosong). Lihat migration 0046.
    supabase
      .from('sosmed_harian')
      .select('tanggal, posting, story, repost, engagement, catatan, tautan, oleh')
      .order('tanggal', { ascending: true }),
    // Laporan closing harian: RLS mengunci baca & tulis ke pengelola saja —
    // isinya menyebut nama operator. Lihat migration 0052.
    supabase
      .from('laporan_harian')
      .select('tanggal, status, catatan, oleh, updated_at')
      .order('tanggal', { ascending: true }),
    // Pipeline leads: RLS memfilter (pengelola semua; operator hanya lead yang
    // di-PIC-kan padanya). Lihat migration 0047.
    supabase
      .from('leads')
      .select('id, nama, kontak, sumber, kategori, tahap, nilai_estimasi, nilai_realisasi, pic, tanggal_masuk, tanggal_closing, alasan_gagal, catatan, created_by')
      .order('tanggal_masuk', { ascending: true }),
    supabase
      .from('leads_followup')
      .select('id, lead_id, tanggal, catatan, oleh')
      .order('tanggal', { ascending: true }),
    // Pengajuan MoU & sponsorship: RLS sama dengan leads (pengelola semua;
    // operator hanya yang di-PIC-kan padanya). Lihat migration 0053.
    supabase
      .from('kemitraan')
      .select(
        'id, instansi, jenis, kontak_nama, kontak, acara, tanggal_acara, tanggal_masuk, status, permintaan, nilai_diminta, nilai_disetujui, bentuk, imbalan, mou_mulai, mou_berakhir, alasan_tolak, catatan, pic, tanggal_keputusan, pengeluaran_id, created_by',
      )
      .order('tanggal_masuk', { ascending: true }),
  ])

  const profiles = orErr(profilesRes) as ProfileRow[]
  const absen = orErr(absenRes) as AbsenRow[]
  const laporan = orErr(laporanRes) as LaporanRow[]
  const event = orErr(eventRes) as EventRow[]
  const peng = orErr(pengRes) as PengeluaranRow[]
  const penarikan = orErr(penarikanRes) as PenarikanUangBesarRow[]
  // Toleran kalau tabel `penyesuaian_uang_kecil` belum ada (migrasi 0030 belum
  // dijalankan) — fallback [] agar kode bisa naik lebih dulu dari migrasi tanpa
  // mematikan seluruh app. Fitur baru tinggal aktif begitu migrasi diterapkan.
  const penyesuaian = (
    penyesuaianRes.error ? [] : (penyesuaianRes.data ?? [])
  ) as PenyesuaianUangKecilRow[]
  // Toleran kalau tabel `gaji_pembayaran_via` belum ada (migrasi 0031 belum
  // dijalankan) — fallback [] agar app tetap jalan; fitur aktif begitu migrasi
  // diterapkan.
  const pembayaranVia = (
    pembayaranViaRes.error ? [] : (pembayaranViaRes.data ?? [])
  ) as GajiPembayaranViaRow[]
  const kertas = orErr(kertasRes) as KertasRow[]
  const frame = orErr(frameRes) as FrameRow[]
  const tinta = orErr(tintaRes) as TintaRow[]
  const amplop = orErr(amplopRes) as AmplopRow | null
  const salah = orErr(salahRes) as SalahCetakRow[]
  const config = orErr(configRes) as ConfigRow | null
  const inactiveProfiles = orErr(inactiveRes) as ProfileRow[]
  // Toleran kalau tabel `promo_programs` belum ada (migrasi 0035 belum
  // dijalankan) — fallback [] agar app tetap jalan; fitur aktif begitu migrasi
  // diterapkan.
  const promo = (promoRes.error ? [] : (promoRes.data ?? [])) as PromoRow[]
  // Toleran kalau tabel `jadwal_shift` belum ada (migrasi 0044 belum
  // dijalankan) — fallback [] agar app tetap jalan; fitur aktif begitu migrasi
  // diterapkan.
  const jadwal = (jadwalRes.error ? [] : (jadwalRes.data ?? [])) as JadwalShiftRow[]
  // Toleran kalau tabel `sosmed_harian` belum ada (migrasi 0046 belum
  // dijalankan) — fallback [] agar app tetap jalan.
  const sosmed = (sosmedRes.error ? [] : (sosmedRes.data ?? [])) as SosmedRow[]
  // Toleran kalau tabel `laporan_harian` belum ada (migrasi 0052 belum
  // dijalankan) — fallback [] agar app tetap jalan. Untuk operator, RLS
  // memulangkan [] juga: mereka memang tidak boleh membacanya.
  const laporanHarianRows = (
    laporanHarianRes.error ? [] : (laporanHarianRes.data ?? [])
  ) as LaporanHarianRow[]
  // Toleran kalau tabel `leads`/`leads_followup` belum ada (migrasi 0047 belum
  // dijalankan) — fallback [] agar app tetap jalan.
  const leadRows = (leadsRes.error ? [] : (leadsRes.data ?? [])) as LeadRow[]
  const followupRows = (
    followupRes.error ? [] : (followupRes.data ?? [])
  ) as LeadFollowupRow[]
  // Toleran kalau tabel `kemitraan` belum ada (migrasi 0053 belum dijalankan)
  // — fallback [] agar app tetap jalan; tab MoU & Sponsorship ikut kosong.
  const kemitraanRows = (
    kemitraanRes.error ? [] : (kemitraanRes.data ?? [])
  ) as KemitraanRow[]

  const toEmployee = (p: ProfileRow): Employee => ({
    id: p.id,
    nama: p.nama,
    jabatan: p.jabatan,
    pinHash: p.pin_hash ?? '',
    role: p.role ?? 'karyawan',
    nomorInduk: p.nomor_induk ?? undefined,
    noHp: Array.isArray(p.no_hp) ? p.no_hp : undefined,
    foto: p.foto ?? undefined,
    namaLengkap: p.nama_lengkap ?? undefined,
    tempatLahir: p.tempat_lahir ?? undefined,
    tanggalLahir: p.tanggal_lahir ?? undefined,
    pendidikan: p.pendidikan ?? undefined,
    tanggalDiterima: p.tanggal_diterima ?? undefined,
  })
  const employees: Employee[] = profiles.map(toEmployee)
  const inactiveEmployees: Employee[] = inactiveProfiles.map(toEmployee)

  const records: AbsenHari[] = absen.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    tanggal: r.tanggal,
    shift: r.shift,
    events: Array.isArray(r.events) ? r.events : [],
    status: r.status === 'menunggu' ? 'menunggu' : 'disetujui',
    extraMenit: r.extra_menit ?? 0,
    extraCatatan: r.extra_catatan ?? undefined,
    checklistPulang: Array.isArray(r.checklist_pulang)
      ? r.checklist_pulang
      : undefined,
    checklistMasuk: Array.isArray(r.checklist_masuk)
      ? r.checklist_masuk
      : undefined,
  }))

  const laporanIncome: LaporanIncome[] = laporan.map((l) => {
    const items = Array.isArray(l.items) ? l.items : []
    // Sumber pemakaian kertas: jsonb baru kalau ada; kalau tidak, fallback ke
    // kolom lama `kertas_id` (laporan dari versi single-kertas) dengan jumlah =
    // total tiket + cetak.
    let pemakaianKertas = Array.isArray(l.pemakaian_kertas)
      ? l.pemakaian_kertas
      : []
    if (pemakaianKertas.length === 0 && l.kertas_id) {
      const lembar = items.reduce(
        (s, i) => s + (i.tiket || 0) + (i.cetak || 0),
        0,
      )
      pemakaianKertas = [{ kertasId: l.kertas_id, jumlah: lembar }]
    }
    return {
      id: l.id,
      tanggal: l.tanggal,
      items,
      upgrades: Array.isArray(l.upgrades) ? l.upgrades : [],
      produk: Array.isArray(l.produk) ? l.produk : [],
      keterangan: l.keterangan ?? '',
      hargaTiket: l.harga_tiket,
      hargaCetak: l.harga_cetak,
      hargaUpgrade: l.harga_upgrade,
      hargaProduk: l.harga_produk ?? {},
      pemakaianKertas,
      amplopTerpakai: l.amplop_terpakai ?? undefined,
      potonganHarga: l.potongan_harga ?? 0,
      tunai: l.tunai ?? 0,
      qris: l.qris ?? 0,
      uangBesar: l.uang_besar ?? 0,
      uangKecil: l.uang_kecil ?? 0,
      totalUangBesar: l.total_uang_besar ?? 0,
    }
  })

  const laporanEvent: LaporanEvent[] = event.map((e) => ({
    id: e.id,
    tanggal: e.tanggal,
    kategori: (e.kategori as EventKategori) ?? 'photobooth',
    tipe: (e.tipe as SewaTipe) ?? 'voucher',
    keterangan: e.keterangan ?? '',
    jam: e.jam ?? undefined,
    tarifPerJam: e.tarif_per_jam ?? undefined,
    biayaKertas: e.biaya_kertas ?? undefined,
    biayaTinta: e.biaya_tinta ?? undefined,
    biayaListrik: e.biaya_listrik ?? undefined,
    upahOperator: e.upah_operator ?? undefined,
    voucher: e.voucher ?? undefined,
    cetak: e.cetak ?? undefined,
    hargaVoucher: e.harga_voucher ?? undefined,
    hargaCetak: e.harga_cetak ?? undefined,
  }))

  const pengeluaran: Pengeluaran[] = peng.map((p) => ({
    id: p.id,
    tanggal: p.tanggal,
    kategori: p.kategori,
    deskripsi: p.deskripsi,
    jumlah: p.jumlah,
    catatan: p.catatan ?? '',
    sumber: p.sumber ?? 'cash',
  }))

  const penarikanUangBesar: PenarikanUangBesar[] = penarikan.map((p) => ({
    id: p.id,
    tanggal: p.tanggal,
    jumlah: p.jumlah,
    catatan: p.catatan ?? '',
  }))

  const penyesuaianUangKecil: PenyesuaianUangKecil[] = penyesuaian.map((p) => ({
    id: p.id,
    tanggal: p.tanggal,
    tipe: p.tipe,
    jumlah: p.jumlah,
    catatan: p.catatan ?? '',
  }))

  const stokKertas: JenisKertas[] = kertas.map((k) => ({
    id: k.id,
    nama: k.nama,
    stok: k.stok,
  }))

  const stokFrame: JenisFrame[] = frame.map((f) => ({
    id: f.id,
    nama: f.nama,
    stok: f.stok,
  }))

  // Keep tinta in the canonical 6-warna order regardless of row order.
  const tintaByWarna = new Map(tinta.map((t) => [t.warna, t]))
  const stokTinta: Tinta[] = WARNA_TINTA_LIST.map((w) => {
    const row = tintaByWarna.get(w)
    return {
      warna: w,
      stok: row?.stok ?? 0,
      catatan: row?.catatan ?? undefined,
    }
  })

  const salahCetak: SalahCetak[] = salah.map((s) => ({
    id: s.id,
    tanggal: s.tanggal,
    kertasId: s.kertas_id,
    jumlah: s.jumlah,
    alasan: s.alasan ?? '',
  }))

  const promoPrograms: PromoProgram[] = promo.map((p) => ({
    id: p.id,
    judul: p.judul ?? '',
    deskripsi: p.deskripsi ?? '',
    tahap: p.tahap,
    status: p.status,
    tanggalMulai: p.tanggal_mulai ?? undefined,
    tanggalSelesai: p.tanggal_selesai ?? undefined,
    dibuatOleh: p.created_by ?? undefined,
    createdAt: p.created_at ?? undefined,
    desain: p.desain ?? undefined,
    jenis: p.jenis ?? 'campaign',
    pic: p.pic ?? undefined,
    deadline: p.deadline ?? undefined,
    selesaiPada: p.selesai_pada ?? undefined,
    // Toleran kalau kolom `tahapan` belum ada (migrasi 0051 belum dijalankan):
    // undefined -> papan Denyut Mingguan menganggap kartunya belum bertahap.
    tahapan: Array.isArray(p.tahapan) ? p.tahapan : undefined,
  }))

  return {
    employees,
    inactiveEmployees,
    records,
    laporanIncome,
    penarikanUangBesar,
    penyesuaianUangKecil,
    laporanEvent,
    layananCatalog:
      Array.isArray(config?.layanan_catalog) && config.layanan_catalog.length
        ? config.layanan_catalog
        : structuredClone(LAYANAN_CATALOG_DEFAULT),
    upgradeCatalog:
      Array.isArray(config?.upgrade_catalog) && config.upgrade_catalog.length
        ? config.upgrade_catalog
        : structuredClone(UPGRADE_CATALOG_DEFAULT),
    produkCatalog: Array.isArray(config?.produk_catalog)
      ? config.produk_catalog
      : structuredClone(PRODUK_CATALOG_DEFAULT),
    closingChecklist: Array.isArray(config?.closing_checklist)
      ? config.closing_checklist
      : [],
    openingChecklist: Array.isArray(config?.opening_checklist)
      ? config.opening_checklist
      : [],
    hargaTiket: config?.harga_tiket ?? { ...HARGA_TIKET_DEFAULT },
    hargaCetak: config?.harga_cetak ?? HARGA_CETAK_DEFAULT,
    hargaUpgrade: config?.harga_upgrade ?? { ...HARGA_UPGRADE_DEFAULT },
    hargaProduk: config?.harga_produk ?? { ...HARGA_PRODUK_DEFAULT },
    gajiPokok: config?.gaji_pokok ?? {},
    gajiDibayar: config?.gaji_dibayar ?? {},
    saldoAktual: config?.saldo_aktual ?? {},
    setoranRekening: Array.isArray(config?.setoran_rekening)
      ? config.setoran_rekening
      : [],
    saldoAwal: {
      dompet: config?.saldo_awal?.dompet ?? 0,
      rekening: config?.saldo_awal?.rekening ?? 0,
    },
    // Toleran kalau kolom `target_bulanan` belum ada (migrasi 0043 belum
    // dijalankan): `config.target_bulanan` undefined -> {}. Scorecard lalu
    // sepenuhnya memakai saran otomatis sampai owner mengisinya.
    targetBulanan: config?.target_bulanan ?? {},
    // Toleran kalau kolom penilaian/eskalasi belum ada (migrasi 0048 belum
    // dijalankan): KPI kelompok Kepemimpinan tampil 'belum aktif', bukan nol.
    penilaianOwner: config?.penilaian_owner ?? {},
    // `ritme_konten` default '{}' di database. Objek tanpa `jumlah` berarti
    // ritme BELUM diatur — dijadikan undefined supaya papan & KPI-nya nonaktif,
    // bukan dinilai nol.
    ritmeKonten:
      typeof config?.ritme_konten?.jumlah === 'number'
        ? config.ritme_konten
        : undefined,
    leads: leadRows.map(
      (r): Lead => ({
        id: r.id,
        nama: r.nama ?? '',
        kontak: r.kontak ?? '',
        sumber: r.sumber ?? '',
        kategori: r.kategori,
        tahap: r.tahap,
        nilaiEstimasi: Number(r.nilai_estimasi ?? 0),
        nilaiRealisasi: Number(r.nilai_realisasi ?? 0),
        pic: r.pic ?? undefined,
        tanggalMasuk: r.tanggal_masuk,
        tanggalClosing: r.tanggal_closing ?? undefined,
        alasanGagal: r.alasan_gagal || undefined,
        catatan: r.catatan || undefined,
        dibuatOleh: r.created_by ?? undefined,
      }),
    ),
    leadsFollowup: followupRows.map(
      (r): LeadFollowup => ({
        id: r.id,
        leadId: r.lead_id,
        tanggal: r.tanggal,
        catatan: r.catatan ?? '',
        oleh: r.oleh ?? undefined,
      }),
    ),
    kemitraan: kemitraanRows.map(
      (r): Kemitraan => ({
        id: r.id,
        instansi: r.instansi ?? '',
        jenis: r.jenis,
        kontakNama: r.kontak_nama ?? '',
        kontak: r.kontak ?? '',
        acara: r.acara ?? '',
        tanggalAcara: r.tanggal_acara ?? undefined,
        tanggalMasuk: r.tanggal_masuk,
        status: r.status,
        permintaan: r.permintaan ?? '',
        nilaiDiminta: Number(r.nilai_diminta ?? 0),
        nilaiDisetujui: Number(r.nilai_disetujui ?? 0),
        bentuk: r.bentuk,
        imbalan: Array.isArray(r.imbalan) ? r.imbalan : [],
        mouMulai: r.mou_mulai ?? undefined,
        mouBerakhir: r.mou_berakhir ?? undefined,
        alasanTolak: r.alasan_tolak || undefined,
        catatan: r.catatan || undefined,
        pic: r.pic ?? undefined,
        tanggalKeputusan: r.tanggal_keputusan ?? undefined,
        pengeluaranId: r.pengeluaran_id ?? undefined,
        dibuatOleh: r.created_by ?? undefined,
      }),
    ),
    sosmedHarian: sosmed.map((r) => ({
      tanggal: r.tanggal,
      posting: r.posting,
      story: r.story,
      repost: r.repost,
      engagement: r.engagement,
      catatan: r.catatan ?? undefined,
      tautan: r.tautan ?? undefined,
      oleh: r.oleh ?? undefined,
      // Toleran kalau kolom `oleh_list` belum ada (migrasi 0049 belum
      // dijalankan): jatuh kembali ke satu pengerja dari kolom lama.
      olehList: Array.isArray(r.oleh_list)
        ? r.oleh_list
        : r.oleh
          ? [r.oleh]
          : [],
    })),
    laporanHarian: laporanHarianRows.map((r) => ({
      tanggal: r.tanggal,
      status: r.status,
      catatan: r.catatan ?? '',
      oleh: r.oleh ?? undefined,
      diperbarui: r.updated_at ?? undefined,
    })),
    jadwalShift: jadwal.map((j) => ({
      tanggal: j.tanggal,
      employeeId: j.employee_id,
      shift: j.shift,
      catatan: j.catatan ?? undefined,
    })),
    gajiPembayaranVia: Object.fromEntries(
      pembayaranVia.map((r) => [
        `${r.employee_id}::${r.periode}`,
        { metode: r.metode ?? '', nomor: r.nomor ?? '' },
      ]),
    ),
    stokKertas,
    stokFrame,
    stokTinta,
    stokAmplop: amplop?.stok ?? 0,
    salahCetak,
    pengeluaran,
    promoPrograms,
    brandKicker: config?.brand_kicker ?? undefined,
    brandName: config?.brand_name ?? undefined,
    dashJudul: config?.dash_judul ?? undefined,
    dashSub: config?.dash_sub ?? undefined,
    headerJudul: config?.header_judul ?? undefined,
    headerSub: config?.header_sub ?? undefined,
    incomeJudul: config?.income_judul ?? undefined,
    incomeSub: config?.income_sub ?? undefined,
  }
}

// =============================================================
// persistChanges — diff prev vs next, write only what changed
// =============================================================
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export async function persistChanges(
  prev: AppData,
  next: AppData,
  userId: string,
): Promise<void> {
  const jobs: Promise<unknown>[] = []

  // ---- absen_records (own rows for karyawan; all for admin via RLS) ----
  syncRows(
    jobs,
    'absen_records',
    prev.records,
    next.records,
    (r) => r.id,
    (r) => ({
      id: r.id,
      employee_id: r.employeeId,
      tanggal: r.tanggal,
      shift: r.shift,
      events: r.events,
      status: r.status ?? 'disetujui',
      extra_menit: r.extraMenit ?? 0,
      extra_catatan: r.extraCatatan ?? null,
      checklist_pulang: r.checklistPulang ?? null,
      checklist_masuk: r.checklistMasuk ?? null,
    }),
  )

  // ---- laporan_income (created_by stamped on insert) ----
  syncRows(
    jobs,
    'laporan_income',
    prev.laporanIncome,
    next.laporanIncome,
    (l) => l.id,
    (l) => ({
      id: l.id,
      tanggal: l.tanggal,
      items: l.items,
      upgrades: l.upgrades,
      produk: l.produk,
      keterangan: l.keterangan,
      harga_tiket: l.hargaTiket,
      harga_cetak: l.hargaCetak,
      harga_upgrade: l.hargaUpgrade,
      harga_produk: l.hargaProduk,
      // Kolom lama `kertas_id` ditinggalkan (null); sumber kebenaran sekarang
      // `pemakaian_kertas` (mendukung lebih dari satu jenis kertas per laporan).
      kertas_id: null,
      pemakaian_kertas: l.pemakaianKertas ?? [],
      amplop_terpakai: l.amplopTerpakai ?? null,
      potongan_harga: l.potonganHarga ?? 0,
      tunai: l.tunai ?? 0,
      qris: l.qris ?? 0,
      uang_besar: l.uangBesar ?? 0,
      uang_kecil: l.uangKecil ?? 0,
      total_uang_besar: l.totalUangBesar ?? 0,
    }),
    userId,
  )

  // ---- laporan_event (created_by stamped on insert) ----
  syncRows(
    jobs,
    'laporan_event',
    prev.laporanEvent,
    next.laporanEvent,
    (e) => e.id,
    (e) => ({
      id: e.id,
      tanggal: e.tanggal,
      kategori: e.kategori,
      tipe: e.tipe,
      keterangan: e.keterangan,
      jam: e.jam ?? null,
      tarif_per_jam: e.tarifPerJam ?? null,
      biaya_kertas: e.biayaKertas ?? null,
      biaya_tinta: e.biayaTinta ?? null,
      biaya_listrik: e.biayaListrik ?? null,
      upah_operator: e.upahOperator ?? null,
      voucher: e.voucher ?? null,
      cetak: e.cetak ?? null,
      harga_voucher: e.hargaVoucher ?? null,
      harga_cetak: e.hargaCetak ?? null,
    }),
    userId,
  )

  // ---- pengeluaran (created_by stamped on insert; admin & karyawan) ----
  syncRows(
    jobs,
    'pengeluaran',
    prev.pengeluaran,
    next.pengeluaran,
    (p) => p.id,
    (p) => ({
      id: p.id,
      tanggal: p.tanggal,
      kategori: p.kategori,
      deskripsi: p.deskripsi,
      jumlah: p.jumlah,
      catatan: p.catatan,
      sumber: p.sumber ?? 'cash',
    }),
    userId,
  )

  // ---- promo_programs (created_by stamped on insert; admin & karyawan).
  // tahap/status yang boleh diubah karyawan dibatasi trigger protect_promo_status. ----
  syncRows(
    jobs,
    'promo_programs',
    prev.promoPrograms,
    next.promoPrograms,
    (p) => p.id,
    (p) => ({
      id: p.id,
      judul: p.judul,
      deskripsi: p.deskripsi,
      tahap: p.tahap,
      status: p.status,
      tanggal_mulai: p.tanggalMulai ?? null,
      tanggal_selesai: p.tanggalSelesai ?? null,
      desain: p.desain ?? null,
      jenis: p.jenis ?? 'campaign',
      pic: p.pic ?? null,
      deadline: p.deadline ?? null,
      // Hanya `kunci` & `oleh` yang berarti di sini — `selesaiPada` ditimpa
      // trigger promo_stamp_tahapan (0051) dengan alasan yang sama seperti
      // `selesai_pada` di bawah.
      tahapan: (p.tahapan ?? []).map((t) => ({ kunci: t.kunci, oleh: t.oleh ?? null })),
      // `selesai_pada` sengaja TIDAK ditulis dari sini — distempel trigger
      // promo_stamp_selesai (0046). Mengirimnya dari client akan membuat
      // "tepat waktu" bisa dikarang.
    }),
    userId,
  )

  // ---- penarikan_uang_besar (created_by stamped on insert; admin & karyawan) ----
  syncRows(
    jobs,
    'penarikan_uang_besar',
    prev.penarikanUangBesar,
    next.penarikanUangBesar,
    (p) => p.id,
    (p) => ({
      id: p.id,
      tanggal: p.tanggal,
      jumlah: p.jumlah,
      catatan: p.catatan,
    }),
    userId,
  )

  // ---- penyesuaian_uang_kecil (created_by stamped on insert; admin & karyawan) ----
  syncRows(
    jobs,
    'penyesuaian_uang_kecil',
    prev.penyesuaianUangKecil ?? [],
    next.penyesuaianUangKecil ?? [],
    (p) => p.id,
    (p) => ({
      id: p.id,
      tanggal: p.tanggal,
      tipe: p.tipe,
      jumlah: p.jumlah,
      catatan: p.catatan,
    }),
    userId,
  )

  // ---- gaji_pembayaran_via (per karyawan & periode; karyawan isi sendiri) ----
  // Map key = `${employeeId}::${YYYY-MM}`. Upsert key yang baru/berubah, hapus
  // key yang dihilangkan. Karyawan hanya boleh menyentuh baris miliknya (RLS).
  {
    const prevVia = prev.gajiPembayaranVia ?? {}
    const nextVia = next.gajiPembayaranVia ?? {}
    const parse = (k: string) => {
      const i = k.indexOf('::')
      return { employee_id: k.slice(0, i), periode: k.slice(i + 2) }
    }
    const upserts = Object.entries(nextVia)
      .filter(([k, v]) => !eq(prevVia[k], v))
      .map(([k, v]) => ({ ...parse(k), metode: v.metode, nomor: v.nomor }))
    if (upserts.length) {
      jobs.push(
        Promise.resolve(
          supabase
            .from('gaji_pembayaran_via')
            .upsert(upserts, { onConflict: 'employee_id,periode' }),
        ).then(throwIfError),
      )
    }
    for (const k of Object.keys(prevVia)) {
      if (!(k in nextVia)) {
        const { employee_id, periode } = parse(k)
        jobs.push(
          Promise.resolve(
            supabase
              .from('gaji_pembayaran_via')
              .delete()
              .eq('employee_id', employee_id)
              .eq('periode', periode),
          ).then(throwIfError),
        )
      }
    }
  }

  // ---- stok_kertas ----
  syncRows(
    jobs,
    'stok_kertas',
    prev.stokKertas,
    next.stokKertas,
    (k) => k.id,
    (k) => ({ id: k.id, nama: k.nama, stok: k.stok }),
  )

  // ---- stok_frame ----
  syncRows(
    jobs,
    'stok_frame',
    prev.stokFrame,
    next.stokFrame,
    (f) => f.id,
    (f) => ({ id: f.id, nama: f.nama, stok: f.stok }),
  )

  // ---- salah_cetak (created_by stamped on insert) ----
  syncRows(
    jobs,
    'salah_cetak',
    prev.salahCetak,
    next.salahCetak,
    (s) => s.id,
    (s) => ({
      id: s.id,
      tanggal: s.tanggal,
      kertas_id: s.kertasId,
      jumlah: s.jumlah,
      alasan: s.alasan,
    }),
    userId,
  )

  // ---- stok_tinta (fixed 6 rows, upsert-only by warna) ----
  const tintaChanged = next.stokTinta.filter((t) => {
    const p = prev.stokTinta.find((x) => x.warna === t.warna)
    return !p || !eq(p, t)
  })
  if (tintaChanged.length) {
    jobs.push(
      Promise.resolve(
        supabase.from('stok_tinta').upsert(
          tintaChanged.map((t) => ({
            warna: t.warna,
            stok: t.stok,
            catatan: t.catatan ?? '',
          })),
          { onConflict: 'warna' },
        ),
      ).then(throwIfError),
    )
  }

  // ---- stok_amplop (singleton id=1) ----
  if (prev.stokAmplop !== next.stokAmplop) {
    jobs.push(
      Promise.resolve(
        supabase.from('stok_amplop').update({ stok: next.stokAmplop }).eq('id', 1),
      ).then(throwIfError),
    )
  }

  // ---- profiles (update + deactivate only; no inserts) ----
  const prevEmp = new Map(prev.employees.map((e) => [e.id, e]))
  const nextEmp = new Map(next.employees.map((e) => [e.id, e]))
  for (const e of next.employees) {
    const p = prevEmp.get(e.id)
    if (p && !eq(p, e)) {
      jobs.push(
        Promise.resolve(
          supabase
            .from('profiles')
            .update({
              nama: e.nama,
              jabatan: e.jabatan,
              pin_hash: e.pinHash || null,
              nomor_induk: e.nomorInduk ?? '',
              no_hp: e.noHp ?? [],
              foto: e.foto ?? null,
              nama_lengkap: e.namaLengkap ?? '',
              tempat_lahir: e.tempatLahir ?? '',
              tanggal_lahir: e.tanggalLahir || null,
              pendidikan: e.pendidikan ?? '',
              tanggal_diterima: e.tanggalDiterima || null,
            })
            .eq('id', e.id),
        ).then(throwIfError),
      )
    }
  }
  for (const e of prev.employees) {
    if (!nextEmp.has(e.id)) {
      // "Hapus" karyawan = nonaktifkan (hard auth-user delete needs service role).
      jobs.push(
        Promise.resolve(
          supabase.from('profiles').update({ active: false }).eq('id', e.id),
        ).then(throwIfError),
      )
    }
  }

  // ---- leads & riwayat follow-up ----
  // `tanggal_closing` sengaja TIDAK ditulis — distempel trigger
  // leads_stamp_closing (0047) supaya tanggal dasar bonus tak bisa dikarang.
  syncRows(
    jobs,
    'leads',
    prev.leads ?? [],
    next.leads ?? [],
    (l) => l.id,
    (l) => ({
      id: l.id,
      nama: l.nama,
      kontak: l.kontak,
      sumber: l.sumber,
      kategori: l.kategori,
      tahap: l.tahap,
      nilai_estimasi: l.nilaiEstimasi || 0,
      nilai_realisasi: l.nilaiRealisasi || 0,
      pic: l.pic ?? null,
      tanggal_masuk: l.tanggalMasuk,
      alasan_gagal: l.alasanGagal ?? '',
      catatan: l.catatan ?? '',
    }),
    userId,
  )
  syncRows(
    jobs,
    'leads_followup',
    prev.leadsFollowup ?? [],
    next.leadsFollowup ?? [],
    (f) => f.id,
    (f) => ({
      id: f.id,
      lead_id: f.leadId,
      tanggal: f.tanggal,
      catatan: f.catatan,
      oleh: f.oleh ?? null,
    }),
  )

  // ---- kemitraan (pengajuan MoU & sponsorship) ----
  // `tanggal_keputusan` sengaja TIDAK ditulis — distempel trigger
  // kemitraan_stamp_keputusan (0053), sama alasannya dengan leads di atas.
  syncRows(
    jobs,
    'kemitraan',
    prev.kemitraan ?? [],
    next.kemitraan ?? [],
    (k) => k.id,
    (k) => ({
      id: k.id,
      instansi: k.instansi,
      jenis: k.jenis,
      kontak_nama: k.kontakNama,
      kontak: k.kontak,
      acara: k.acara,
      tanggal_acara: k.tanggalAcara ?? null,
      tanggal_masuk: k.tanggalMasuk,
      status: k.status,
      permintaan: k.permintaan,
      nilai_diminta: k.nilaiDiminta || 0,
      nilai_disetujui: k.nilaiDisetujui || 0,
      bentuk: k.bentuk,
      imbalan: k.imbalan ?? [],
      mou_mulai: k.mouMulai ?? null,
      mou_berakhir: k.mouBerakhir ?? null,
      alasan_tolak: k.alasanTolak ?? '',
      catatan: k.catatan ?? '',
      pic: k.pic ?? null,
      pengeluaran_id: k.pengeluaranId ?? null,
    }),
    userId,
  )

  // ---- sosmed_harian (satu baris per tanggal; kunci primer `tanggal`) ----
  syncRows(
    jobs,
    'sosmed_harian',
    prev.sosmedHarian ?? [],
    next.sosmedHarian ?? [],
    (r) => r.tanggal,
    (r) => ({
      tanggal: r.tanggal,
      posting: r.posting,
      story: r.story,
      repost: r.repost,
      engagement: r.engagement,
      catatan: r.catatan ?? '',
      tautan: r.tautan ?? '',
      // Kolom lama tetap diisi entri PROFIL pertama (ia ber-foreign-key, jadi
      // nama bebas tidak boleh masuk); daftar lengkapnya di `oleh_list`.
      oleh: (r.olehList ?? (r.oleh ? [r.oleh] : [])).find(isUuid) ?? null,
      oleh_list: r.olehList ?? (r.oleh ? [r.oleh] : []),
    }),
    undefined,
    'tanggal',
  )

  // ---- laporan_harian (satu baris per tanggal; kunci primer `tanggal`) ----
  syncRows(
    jobs,
    'laporan_harian',
    prev.laporanHarian ?? [],
    next.laporanHarian ?? [],
    (r) => r.tanggal,
    (r) => ({
      tanggal: r.tanggal,
      status: r.status,
      catatan: r.catatan,
      oleh: r.oleh ?? null,
    }),
    undefined,
    'tanggal',
  )

  // ---- jadwal_shift (kunci komposit tanggal+employee_id) ----
  syncJadwal(jobs, prev.jadwalShift ?? [], next.jadwalShift ?? [], userId)

  // ---- app_config (prices + branding text) ----
  const configFields: (keyof AppData)[] = [
    'layananCatalog',
    'upgradeCatalog',
    'produkCatalog',
    'closingChecklist',
    'openingChecklist',
    'hargaTiket',
    'hargaCetak',
    'hargaUpgrade',
    'hargaProduk',
    'gajiPokok',
    'gajiDibayar',
    'saldoAktual',
    'setoranRekening',
    'saldoAwal',
    'targetBulanan',
    'penilaianOwner',
    'ritmeKonten',
    'brandKicker',
    'brandName',
    'dashJudul',
    'dashSub',
    'headerJudul',
    'headerSub',
    'incomeJudul',
    'incomeSub',
  ]
  if (configFields.some((f) => !eq(prev[f], next[f]))) {
    jobs.push(
      Promise.resolve(
        supabase
          .from('app_config')
          .update({
            layanan_catalog: next.layananCatalog,
            upgrade_catalog: next.upgradeCatalog,
            produk_catalog: next.produkCatalog,
            closing_checklist: next.closingChecklist ?? [],
            opening_checklist: next.openingChecklist ?? [],
            harga_tiket: next.hargaTiket,
            harga_cetak: next.hargaCetak,
            harga_upgrade: next.hargaUpgrade,
            harga_produk: next.hargaProduk,
            gaji_pokok: next.gajiPokok ?? {},
            gaji_dibayar: next.gajiDibayar ?? {},
            saldo_aktual: next.saldoAktual ?? {},
            setoran_rekening: next.setoranRekening ?? [],
            saldo_awal: next.saldoAwal ?? { dompet: 0, rekening: 0 },
            target_bulanan: next.targetBulanan ?? {},
            penilaian_owner: next.penilaianOwner ?? {},
            ritme_konten: next.ritmeKonten ?? {},
            brand_kicker: next.brandKicker ?? null,
            brand_name: next.brandName ?? null,
            dash_judul: next.dashJudul ?? null,
            dash_sub: next.dashSub ?? null,
            header_judul: next.headerJudul ?? null,
            header_sub: next.headerSub ?? null,
            income_judul: next.incomeJudul ?? null,
            income_sub: next.incomeSub ?? null,
          })
          .eq('id', 1),
      ).then(throwIfError),
    )
  }

  await Promise.all(jobs)
}

/** Entri `olehList` yang berupa id profil (bukan nama bebas). */
function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

function throwIfError(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message)
  return res
}

/**
 * Sinkronisasi roster shift.
 *
 * Tidak memakai syncRows() karena `jadwal_shift` berkunci KOMPOSIT
 * (tanggal, employee_id) sementara syncRows menghapus lewat `.in('id', ...)`.
 * Baris baru & berubah sama-sama diselesaikan satu upsert onConflict, sehingga
 * menugaskan ulang orang yang sama di tanggal yang sama menimpa barisnya, bukan
 * menumpuk. Penghapusan dikelompokkan per tanggal supaya membersihkan satu hari
 * penuh tetap satu perintah.
 */
function syncJadwal(
  jobs: Promise<unknown>[],
  prev: JadwalShift[],
  next: JadwalShift[],
  userId?: string,
): void {
  const kunci = (j: JadwalShift) => `${j.tanggal}::${j.employeeId}`
  const prevMap = new Map(prev.map((j) => [kunci(j), j]))
  const nextKeys = new Set(next.map(kunci))

  const upserts = next
    .filter((j) => {
      const p = prevMap.get(kunci(j))
      return !p || !eq(p, j)
    })
    .map((j) => ({
      tanggal: j.tanggal,
      employee_id: j.employeeId,
      shift: j.shift,
      catatan: j.catatan ?? '',
      ...(prevMap.has(kunci(j)) || !userId ? {} : { created_by: userId }),
    }))

  if (upserts.length) {
    jobs.push(
      Promise.resolve(
        supabase
          .from('jadwal_shift')
          .upsert(upserts, { onConflict: 'tanggal,employee_id' }),
      ).then(throwIfError),
    )
  }

  const perTanggal = new Map<string, string[]>()
  for (const j of prev) {
    if (nextKeys.has(kunci(j))) continue
    const list = perTanggal.get(j.tanggal) ?? []
    list.push(j.employeeId)
    perTanggal.set(j.tanggal, list)
  }
  for (const [tanggal, ids] of perTanggal) {
    jobs.push(
      Promise.resolve(
        supabase
          .from('jadwal_shift')
          .delete()
          .eq('tanggal', tanggal)
          .in('employee_id', ids),
      ).then(throwIfError),
    )
  }
}

// Generic insert(new)/upsert(changed)/delete(removed) sync for a table
// keyed by a stable id. `createdByUser` (if given) stamps created_by on
// NEW rows only (so updates never reassign ownership).
function syncRows<T>(
  jobs: Promise<unknown>[],
  table: string,
  prev: T[],
  next: T[],
  key: (t: T) => string,
  toRow: (t: T) => Record<string, unknown>,
  createdByUser?: string,
  /** Kolom kunci primer di database — `sosmed_harian` memakai `tanggal`. */
  keyCol = 'id',
): void {
  const prevMap = new Map(prev.map((t) => [key(t), t]))
  const nextKeys = new Set(next.map(key))

  const inserts: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  for (const t of next) {
    const p = prevMap.get(key(t))
    if (!p) {
      const row = toRow(t)
      if (createdByUser) row.created_by = createdByUser
      inserts.push(row)
    } else if (!eq(p, t)) {
      updates.push(toRow(t))
    }
  }
  const deletes = prev.filter((t) => !nextKeys.has(key(t))).map(key)

  if (inserts.length) {
    jobs.push(Promise.resolve(supabase.from(table).insert(inserts)).then(throwIfError))
  }
  if (updates.length) {
    jobs.push(Promise.resolve(supabase.from(table).upsert(updates)).then(throwIfError))
  }
  if (deletes.length) {
    jobs.push(
      Promise.resolve(supabase.from(table).delete().in(keyCol, deletes)).then(
        throwIfError,
      ),
    )
  }
}

// =============================================================
// Salah cetak — operasi ATOMIK via RPC.
// Mencatat salah_cetak + mengurangi stok kertas dalam 1 transaksi server,
// jadi tidak mungkin lagi "baris salah cetak tersimpan tapi stok tidak turun".
// Setelah memanggil ini, panggil reload() agar state lokal ikut segar.
// =============================================================
export async function catatSalahCetakRpc(
  kertasId: string,
  jumlah: number,
  tanggal: string,
  alasan: string,
): Promise<void> {
  const { error } = await supabase.rpc('catat_salah_cetak', {
    p_kertas_id: kertasId,
    p_jumlah: jumlah,
    p_tanggal: tanggal,
    p_alasan: alasan,
  })
  if (error) throw new Error(error.message)
}

export async function hapusSalahCetakRpc(id: string): Promise<void> {
  const { error } = await supabase.rpc('hapus_salah_cetak', { p_id: id })
  if (error) throw new Error(error.message)
}

// =============================================================
// Aktif/nonaktif karyawan (profiles.active).
// Nonaktif menyembunyikan kartu dari roster; aktif kembali memulihkannya
// sehingga karyawan bisa mengisi absen lagi. Hanya admin yang diizinkan
// mengubah `active` (dijaga trigger protect_profile_privileges di RLS).
// Panggil reload() setelahnya agar daftar aktif & nonaktif ikut segar.
// =============================================================
export async function setEmployeeActive(
  id: string,
  active: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ active })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Membuat akun karyawan baru via edge function `create-karyawan`.
 * Pendaftaran mandiri sudah ditutup — hanya pengelola (diverifikasi di server)
 * yang bisa membuat akun. Password dipilih admin lalu diberikan ke karyawan.
 * Mengangkat manajer (`role: 'manager'`) hanya boleh dilakukan owner; edge
 * function menolak permintaan dari manajer.
 */
export async function createKaryawanAccount(input: {
  email: string
  password: string
  nama: string
  jabatan: string
  /** Hak akses akun baru. Hanya owner yang boleh mengirim 'manager'. */
  role?: Extract<Role, 'karyawan' | 'manager'>
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke('create-karyawan', {
    body: input,
  })
  if (error) {
    // Non-2xx dari fungsi datang sebagai FunctionsHttpError; pesan asli ada di
    // response body (error.context adalah Response).
    let msg = error.message
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const b = await ctx.json()
        if (b?.error) msg = b.error
      } catch {
        /* biarkan pesan default */
      }
    }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
}
