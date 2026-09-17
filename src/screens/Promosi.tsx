import { useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  AppData,
  DesainLampiran,
  PromoJenis,
  PromoProgram,
  PromoTahap,
  TahapKonten,
} from '../types'
import { TAHAP_KONTEN, TAHAP_KONTEN_LABEL } from '../manajemen'
import { uid, todayKey } from '../storage'
import { formatTanggalPanjang } from '../attendance'
import { Icons } from '../components/Icons'
import { Modal, ModalHead } from '../components/Modal'
import { useToast } from '../components/Toast'
import { useLang } from '../i18n'

type Props = {
  data: AppData
  setData: (d: AppData) => void
  isAdmin: boolean
  currentUserId: string
}

/** Urutan tahap (juga urutan tampil grup list). */
const TAHAP_ORDER: PromoTahap[] = ['ide', 'rencana', 'comingsoon', 'berjalan', 'selesai']
/** Label jenis kartu. Hanya 'campaign' yang dihitung untuk KPI 2/bulan. */
const JENIS_LABEL: Record<PromoJenis, string> = {
  campaign: 'Campaign',
  konten: 'Konten rutin',
  promo: 'Promo / diskon',
}

/**
 * Hari eksekusi konten Kubik: Rabu, Sabtu, Minggu. Dipakai untuk tombol cepat
 * deadline supaya irama mingguan itu tidak perlu dihitung manual tiap kali.
 */
const HARI_KONTEN: { label: string; dow: number }[] = [
  { label: 'Rabu', dow: 3 },
  { label: 'Sabtu', dow: 6 },
  { label: 'Minggu', dow: 0 },
]

/** Tanggal terdekat (>= hari ini) yang jatuh pada hari `dow`. */
function konteBerikutnya(dow: number, hariIni: string): string {
  const d = new Date(`${hariIni}T00:00:00`)
  const maju = (dow - d.getDay() + 7) % 7
  d.setDate(d.getDate() + maju)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Tahap yang tampil ke karyawan (sisanya rahasia — dikuatkan RLS 0035). */
const TAHAP_KARYAWAN: PromoTahap[] = ['comingsoon', 'berjalan']

/** Maks dimensi desain promo (px) — cukup tajam untuk posting sosial media. */
const DESAIN_MAX = 1600

/**
 * Maks gambar per kartu. Desain disimpan sebagai data URL di dalam baris promo,
 * jadi batas inilah yang menjaga satu kartu tidak tumbuh jadi belasan megabyte.
 * Untuk file mentah atau folder berisi banyak varian, pakai tautan.
 */
const DESAIN_MAKS = 6

/** Semua gambar desain kartu — `desainList` dulu, lalu kolom lama (0056). */
function gambarKartu(p: PromoProgram): DesainLampiran[] {
  if (p.desainList?.length) return p.desainList
  return p.desain ? [{ nilai: p.desain, status: 'disetujui' }] : []
}

/** Tautan desain eksternal kartu (Google Drive, Canva, dsb). */
function tautanKartu(p: PromoProgram): DesainLampiran[] {
  return p.desainTautan ?? []
}

/**
 * Lampiran yang boleh DILIHAT seseorang: yang sudah disetujui, ditambah
 * usulannya sendiri (supaya ia tahu kiriman itu masuk). Pengelola melihat
 * semuanya — merekalah yang menyetujui. Cerminan RLS + trigger 0057.
 */
function terlihat(list: DesainLampiran[], isAdmin: boolean, uid: string): DesainLampiran[] {
  if (isAdmin) return list
  return list.filter((l) => l.status === 'disetujui' || l.oleh === uid)
}

const sudahAcc = (l: DesainLampiran) => l.status === 'disetujui'
const menungguAcc = (l: DesainLampiran) => l.status === 'menunggu'

/** Ada sesuatu untuk diambil di kartu ini (gambar ATAU tautan yang tayang). */
function punyaDesain(p: PromoProgram): boolean {
  return gambarKartu(p).some(sudahAcc) || tautanKartu(p).some(sudahAcc)
}

/**
 * Normalisasi tautan yang ditempel: tanpa skema (`drive.google.com/...`) tetap
 * diterima — itu bentuk yang paling sering muncul saat menyalin dari browser.
 * Kembalikan `null` kalau bukan URL http(s) yang masuk akal.
 */
function rapikanTautan(raw: string): string | null {
  const teks = raw.trim()
  if (!teks) return null
  const dengan = /^https?:\/\//i.test(teks) ? teks : `https://${teks}`
  try {
    const u = new URL(dengan)
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

/** Label pendek untuk tautan — domain + jalur, tanpa `https://www.`. */
function labelTautan(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    return u.pathname === '/' ? host : `${host}${u.pathname}`
  } catch {
    return url
  }
}

/** Baca File gambar, resize ≤ DESAIN_MAX, kembalikan data URL JPEG. */
function fileToDesainDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('File bukan gambar yang valid'))
      img.onload = () => {
        const skala = Math.min(1, DESAIN_MAX / Math.max(img.width, img.height))
        const w = Math.round(img.width * skala)
        const h = Math.round(img.height * skala)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas tidak didukung'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/** Picu unduhan satu data URL sebagai berkas gambar. */
function unduhSatu(src: string, nama: string) {
  const a = document.createElement('a')
  a.href = src
  a.download = nama
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Unduh SEMUA desain kartu yang sudah disetujui. Yang masih menunggu ACC
 * sengaja tidak ikut: file yang bisa diunduh adalah file yang bisa diposting.
 */
function unduhDesain(p: PromoProgram) {
  const list = gambarKartu(p).filter(sudahAcc).map((l) => l.nilai)
  if (list.length === 0) return
  const nama =
    (p.judul || 'desain-promo').replace(/[^\w\d-]+/g, '-').replace(/^-+|-+$/g, '') || 'desain-promo'
  list.forEach((src, i) => {
    const berkas = list.length === 1 ? `${nama}.jpg` : `${nama}-${i + 1}.jpg`
    // Dijeda: beberapa browser membatalkan unduhan beruntun yang dipicu dalam
    // satu hentakan dan hanya menyimpan berkas pertama.
    if (i === 0) unduhSatu(src, berkas)
    else setTimeout(() => unduhSatu(src, berkas), i * 300)
  })
}

/** Tombol unduh desain — hanya muncul kalau ada gambar yang sudah disetujui. */
function DownloadDesainBtn({ p }: { p: PromoProgram }) {
  const { t } = useLang()
  const jumlah = gambarKartu(p).filter(sudahAcc).length
  if (jumlah === 0) return null
  return (
    <button type="button" className="btn btn--ghost btn-mini-ghost" onClick={() => unduhDesain(p)}>
      <Icons.download /> {t('prom.unduh')}
      {jumlah > 1 && ` (${jumlah})`}
    </button>
  )
}

export function Promosi({ data, setData, isAdmin, currentUserId }: Props) {
  const toast = useToast()
  const { t } = useLang()
  const [editing, setEditing] = useState<PromoProgram | null>(null)
  const [showForm, setShowForm] = useState(false)
  // Kartu yang sedang dilampiri desain (alur ringan, terpisah dari edit kartu).
  const [unggahUntuk, setUnggahUntuk] = useState<PromoProgram | null>(null)

  // Nama pengusul untuk ditampilkan di baris.
  const namaById = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of [...data.employees, ...data.inactiveEmployees]) m.set(e.id, e.nama)
    return m
  }, [data.employees, data.inactiveEmployees])

  const promos = data.promoPrograms

  // Persist helpers -------------------------------------------------------
  function simpan(p: PromoProgram, opts?: { silent?: boolean }) {
    const idx = promos.findIndex((x) => x.id === p.id)
    const baru = idx >= 0 ? promos.map((x) => (x.id === p.id ? p : x)) : [...promos, p]
    setData({ ...data, promoPrograms: baru })
    if (!opts?.silent) {
      if (p.status === 'menunggu') toast('ok', t('prom.toast.usul', { judul: p.judul }))
      else toast('ok', t('prom.toast.simpan', { judul: p.judul }))
    }
    setShowForm(false)
    setEditing(null)
  }

  function hapus(p: PromoProgram) {
    if (!confirm(t('prom.hapus.konfirmasi', { judul: p.judul }))) return
    setData({ ...data, promoPrograms: promos.filter((x) => x.id !== p.id) })
    toast('warn', t('prom.toast.hapus'))
  }

  function setTahap(p: PromoProgram, tahap: PromoTahap) {
    simpan({ ...p, tahap }, { silent: true })
  }

  function setujui(p: PromoProgram) {
    setData({
      ...data,
      promoPrograms: promos.map((x) => (x.id === p.id ? { ...x, status: 'disetujui' as const } : x)),
    })
    toast('ok', t('prom.toast.setuju', { judul: p.judul }))
  }

  /**
   * Tulis ulang lampiran satu kartu. Dipakai dua arah: pengelola meng-ACC /
   * menolak, dan siapa pun melampirkan desain baru. Kolom lain tidak disentuh —
   * dan untuk operator, database memang menolak perubahan kolom lain (0057).
   */
  /**
   * Centang/urungkan satu tahap produksi kartu konten.
   *
   * Ini KLAIM, bukan penyelesaian: kartu baru dihitung untuk target konten
   * setelah pengelola memindahkannya ke tahap 'selesai' (`selesai_pada`
   * distempel trigger 0046). `selesaiPada` tiap tahap juga distempel server
   * (trigger 0051), jadi yang dikirim dari sini cuma kunci + pengerjanya.
   */
  function ubahTahapan(p: PromoProgram, kunci: TahapKonten) {
    const asli = promos.find((x) => x.id === p.id) ?? p
    const list = asli.tahapan ?? []
    const baru: PromoProgram = {
      ...asli,
      tahapan: list.some((t) => t.kunci === kunci)
        ? list.filter((t) => t.kunci !== kunci)
        : [...list, { kunci, oleh: currentUserId }],
    }
    setData({ ...data, promoPrograms: promos.map((x) => (x.id === p.id ? baru : x)) })
  }

  function simpanLampiran(
    p: PromoProgram,
    gambar: DesainLampiran[],
    tautan: DesainLampiran[],
    pesan?: string,
  ) {
    // Ambil versi terbaru kartunya: `p` bisa berupa salinan dari modal yang
    // sudah dibuka beberapa saat.
    const asli = promos.find((x) => x.id === p.id) ?? p
    const baru: PromoProgram = {
      ...asli,
      desainList: gambar,
      desainTautan: tautan,
      // Kolom lama ikut bergerak, tapi hanya boleh berisi desain yang tayang.
      desain: gambar.find(sudahAcc)?.nilai,
    }
    setData({ ...data, promoPrograms: promos.map((x) => (x.id === p.id ? baru : x)) })
    if (pesan) toast('ok', pesan)
  }

  function bukaTambah() {
    setEditing(null)
    setShowForm(true)
  }
  function bukaEdit(p: PromoProgram) {
    setEditing(p)
    setShowForm(true)
  }

  // ----------------------------------------------------------------------
  return (
    <>
      <section className="hero hero--compact">
        <div className="hero-top">
          <span className="date-pill">
            <Icons.sun /> {formatTanggalPanjang(todayKey())}
          </span>
        </div>
        <h1>{t('page.promosi.title')} 📣</h1>
        <p className="sub">{t('page.promosi.sub')}</p>
      </section>

      {isAdmin ? (
        <AdminView
          promos={promos}
          namaById={namaById}
          currentUserId={currentUserId}
          onTambah={bukaTambah}
          onEdit={bukaEdit}
          onHapus={hapus}
          onSetTahap={setTahap}
          onSetujui={setujui}
          onUnggah={setUnggahUntuk}
          onSetLampiran={simpanLampiran}
          onTahapan={ubahTahapan}
        />
      ) : (
        <KaryawanView
          promos={promos}
          namaById={namaById}
          currentUserId={currentUserId}
          onUsulkan={bukaTambah}
          onEdit={bukaEdit}
          onHapus={hapus}
          onUnggah={setUnggahUntuk}
        />
      )}

      {unggahUntuk && (
        <UnggahDesainModal
          p={unggahUntuk}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onSave={(gambar, tautan) => {
            simpanLampiran(
              unggahUntuk,
              gambar,
              tautan,
              isAdmin ? t('prom.toast.lampirAdmin') : t('prom.toast.lampirUsul'),
            )
            setUnggahUntuk(null)
          }}
          onClose={() => setUnggahUntuk(null)}
        />
      )}

      {showForm && (
        <PromoModal
          existing={editing ?? undefined}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          karyawan={data.employees}
          onSave={simpan}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

// ======================================================================
// Admin: inbox ide menunggu + daftar promo per tahap (list collapsible)
// ======================================================================
function AdminView({
  promos,
  namaById,
  currentUserId,
  onTambah,
  onEdit,
  onHapus,
  onSetTahap,
  onSetujui,
  onUnggah,
  onSetLampiran,
  onTahapan,
}: {
  promos: PromoProgram[]
  namaById: Map<string, string>
  currentUserId: string
  onTambah: () => void
  onEdit: (p: PromoProgram) => void
  onHapus: (p: PromoProgram) => void
  onSetTahap: (p: PromoProgram, tahap: PromoTahap) => void
  onSetujui: (p: PromoProgram) => void
  onUnggah: (p: PromoProgram) => void
  onSetLampiran: (p: PromoProgram, gambar: DesainLampiran[], tautan: DesainLampiran[]) => void
  onTahapan: (p: PromoProgram, kunci: TahapKonten) => void
}) {
  const { t } = useLang()
  const pending = promos.filter((p) => p.status === 'menunggu')
  const board = promos.filter((p) => p.status === 'disetujui')

  return (
    <>
      <div className="section-head">
        <h2>
          {t('page.promosi.title')} <span className="count-badge">{board.length}</span>
        </h2>
        <button type="button" className="btn btn--add" onClick={onTambah}>
          <Icons.plus /> {t('prom.tambah')}
        </button>
      </div>

      {/* Inbox ide yang menunggu persetujuan */}
      {pending.length > 0 && (
        <div className="promo-inbox">
          <div className="promo-inbox-head">
            <Icons.alert /> {t('prom.inbox.title')}{' '}
            <span className="count-badge">{pending.length}</span>
          </div>
          <div className="promo-list">
            {pending.map((p) => (
              <PromoRow
                key={p.id}
                p={p}
                namaById={namaById}
                isAdmin
                currentUserId={currentUserId}
                onUnggah={onUnggah}
                onSetLampiran={onSetLampiran}
                onTahapan={onTahapan}
                actions={
                  <>
                    <button type="button" className="btn btn--pink btn-mini" onClick={() => onSetujui(p)}>
                      <Icons.check /> {t('prom.setujui')}
                    </button>
                    <DownloadDesainBtn p={p} />
                    <button type="button" className="btn btn--ghost btn-mini-ghost" onClick={() => onEdit(p)}>
                      <Icons.pencil /> {t('prom.editSetujui')}
                    </button>
                    <button type="button" className="emp-x" onClick={() => onHapus(p)} title={t('prom.hapus')}>
                      <Icons.trash />
                    </button>
                  </>
                }
              />
            ))}
          </div>
        </div>
      )}

      {board.length === 0 && pending.length === 0 ? (
        <div className="emp-empty">
          <div className="ee-emoji">📣</div>
          <h3>{t('page.promosi.title')}</h3>
          <p>{t('prom.empty.admin')}</p>
          <button type="button" className="btn btn--pink btn--lg" onClick={onTambah}>
            <Icons.plus /> {t('prom.tambah')}
          </button>
        </div>
      ) : (
        TAHAP_ORDER.map((tahap) => {
          const rows = board.filter((p) => p.tahap === tahap)
          if (rows.length === 0) return null
          return (
            <div key={tahap} className="promo-group">
              <div className="promo-group-head">
                <span className={`promo-tahap-dot promo-tahap-dot--${tahap}`} />
                {t(`prom.tahap.${tahap}`)}
                <span className="count-badge">{rows.length}</span>
              </div>
              <div className="promo-list">
                {rows.map((p) => (
                  <PromoRow
                    key={p.id}
                    p={p}
                    namaById={namaById}
                    hideTahapChip
                    isAdmin
                    currentUserId={currentUserId}
                    onUnggah={onUnggah}
                    onSetLampiran={onSetLampiran}
                    onTahapan={onTahapan}
                    actions={
                      <>
                        <label className="promo-move">
                          <span className="sr-only">{t('prom.pindahTahap')}</span>
                          <select
                            value={p.tahap}
                            onChange={(e) => onSetTahap(p, e.target.value as PromoTahap)}
                            title={t('prom.pindahTahap')}
                          >
                            {TAHAP_ORDER.map((tt) => (
                              <option key={tt} value={tt}>
                                {t(`prom.tahap.${tt}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <DownloadDesainBtn p={p} />
                        <button type="button" className="btn btn--ghost btn-mini-ghost" onClick={() => onEdit(p)}>
                          <Icons.pencil /> {t('prom.edit')}
                        </button>
                        <button type="button" className="emp-x" onClick={() => onHapus(p)} title={t('prom.hapus')}>
                          <Icons.trash />
                        </button>
                      </>
                    }
                  />
                ))}
              </div>
            </div>
          )
        })
      )}
    </>
  )
}

// ======================================================================
// Karyawan: promo tayang (read-only) + ide yang ia usulkan
// ======================================================================
function KaryawanView({
  promos,
  namaById,
  currentUserId,
  onUsulkan,
  onEdit,
  onHapus,
  onUnggah,
}: {
  promos: PromoProgram[]
  /** Untuk menampilkan nama PIC — operator perlu tahu kartu mana tugasnya. */
  namaById: Map<string, string>
  currentUserId: string
  onUsulkan: () => void
  onEdit: (p: PromoProgram) => void
  onHapus: (p: PromoProgram) => void
  onUnggah: (p: PromoProgram) => void
}) {
  const { t } = useLang()
  const tayang = promos.filter((p) => p.status === 'disetujui' && TAHAP_KARYAWAN.includes(p.tahap))
  // Ide milik sendiri yang masih menunggu (bisa diedit/hapus selama menunggu).
  const ideSaya = promos.filter((p) => p.dibuatOleh === currentUserId && p.status === 'menunggu')

  return (
    <>
      <div className="section-head">
        <h2>
          {t('prom.tahap.berjalan')} & {t('prom.tahap.comingsoon')}{' '}
          <span className="count-badge">{tayang.length}</span>
        </h2>
        <button type="button" className="btn btn--add" onClick={onUsulkan}>
          <Icons.plus /> {t('prom.usulkan')}
        </button>
      </div>

      {tayang.length === 0 ? (
        <div className="emp-empty">
          <div className="ee-emoji">📣</div>
          <h3>{t('page.promosi.title')}</h3>
          <p>{t('prom.empty.karyawan')}</p>
          <button type="button" className="btn btn--pink btn--lg" onClick={onUsulkan}>
            <Icons.plus /> {t('prom.usulkan')}
          </button>
        </div>
      ) : (
        TAHAP_KARYAWAN.map((tahap) => {
          const rows = tayang.filter((p) => p.tahap === tahap)
          if (rows.length === 0) return null
          return (
            <div key={tahap} className="promo-group">
              <div className="promo-group-head">
                <span className={`promo-tahap-dot promo-tahap-dot--${tahap}`} />
                {t(`prom.tahap.${tahap}`)}
                <span className="count-badge">{rows.length}</span>
              </div>
              <div className="promo-list">
                {rows.map((p) => (
                  <PromoRow
                    key={p.id}
                    p={p}
                    namaById={namaById}
                    hideTahapChip
                    isAdmin={false}
                    currentUserId={currentUserId}
                    onUnggah={onUnggah}
                    actions={<DownloadDesainBtn p={p} />}
                  />
                ))}
              </div>
            </div>
          )
        })
      )}

      {/* Ide yang saya usulkan (menunggu ACC) */}
      {ideSaya.length > 0 && (
        <>
          <div className="section-head">
            <h2>
              {t('prom.badge.ideAnda')} <span className="count-badge">{ideSaya.length}</span>
            </h2>
          </div>
          <div className="promo-list">
            {ideSaya.map((p) => (
              <PromoRow
                key={p.id}
                p={p}
                namaById={namaById}
                isAdmin={false}
                currentUserId={currentUserId}
                onUnggah={onUnggah}
                actions={
                  <>
                    <DownloadDesainBtn p={p} />
                    <button type="button" className="btn btn--ghost btn-mini-ghost" onClick={() => onEdit(p)}>
                      <Icons.pencil /> {t('prom.edit')}
                    </button>
                    <button type="button" className="emp-x" onClick={() => onHapus(p)} title={t('prom.hapus')}>
                      <Icons.trash />
                    </button>
                  </>
                }
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ======================================================================
// Satu baris promo — collapsible. Header = poin penting; body (saat diklik)
// = deskripsi, desain, pengusul, aksi.
// ======================================================================
function PromoRow({
  p,
  namaById,
  actions,
  hideTahapChip,
  isAdmin,
  currentUserId,
  onUnggah,
  onSetLampiran,
  onTahapan,
}: {
  p: PromoProgram
  namaById?: Map<string, string>
  actions?: ReactNode
  hideTahapChip?: boolean
  isAdmin: boolean
  currentUserId: string
  /** Buka modal lampirkan desain. Absen = kartu ini tidak boleh dilampiri. */
  onUnggah?: (p: PromoProgram) => void
  /** Simpan hasil ACC/tolak lampiran. Hanya diisi untuk pengelola. */
  onSetLampiran?: (p: PromoProgram, gambar: DesainLampiran[], tautan: DesainLampiran[]) => void
  /** Centang tahap produksi. Absen = kartu ini tidak bisa dicentang di sini. */
  onTahapan?: (p: PromoProgram, kunci: TahapKonten) => void
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const nama = p.dibuatOleh ? namaById?.get(p.dibuatOleh) : undefined
  const gambar = terlihat(gambarKartu(p), isAdmin, currentUserId)
  const tautan = terlihat(tautanKartu(p), isAdmin, currentUserId)
  const gambarAcc = gambar.filter(sudahAcc)
  const tautanAcc = tautan.filter(sudahAcc)
  // Antrean ACC digabung (gambar + tautan) supaya pengelola menilainya sebagai
  // satu daftar, bukan dua tempat yang harus diingat dua-duanya.
  const antre: { l: DesainLampiran; jenis: 'gambar' | 'tautan' }[] = [
    ...gambar.filter(menungguAcc).map((l) => ({ l, jenis: 'gambar' as const })),
    ...tautan.filter(menungguAcc).map((l) => ({ l, jenis: 'tautan' as const })),
  ]

  /** ACC / tolak satu lampiran — keduanya hanya menulis ulang array kartunya. */
  function putuskan(l: DesainLampiran, jenis: 'gambar' | 'tautan', acc: boolean) {
    const ganti = (list: DesainLampiran[]) =>
      acc
        ? list.map((x) => (x.nilai === l.nilai ? { ...x, status: 'disetujui' as const } : x))
        : list.filter((x) => x.nilai !== l.nilai)
    onSetLampiran?.(
      p,
      jenis === 'gambar' ? ganti(gambarKartu(p)) : gambarKartu(p),
      jenis === 'tautan' ? ganti(tautanKartu(p)) : tautanKartu(p),
    )
  }
  const namaPic = p.pic ? namaById?.get(p.pic) : undefined
  // Status deadline: telat kalau sudah selesai lewat batas, atau menunggak
  // kalau batasnya sudah lewat tapi kartunya belum selesai.
  const deadlineNada = !p.deadline
    ? null
    : p.tahap === 'selesai'
      ? p.selesaiPada && p.selesaiPada > p.deadline
        ? 'telat'
        : 'tepat'
      : p.deadline < todayKey()
        ? 'menunggak'
        : 'menunggu'
  const periode =
    p.tanggalMulai || p.tanggalSelesai
      ? [p.tanggalMulai, p.tanggalSelesai]
          .filter(Boolean)
          .map((d) => formatTanggalPanjang(d as string))
          .join(' – ')
      : null

  return (
    <div className={'promo-item' + (open ? ' is-open' : '')}>
      <button
        type="button"
        className="promo-item-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="promo-item-main">
          <span className="promo-item-title">{p.judul || '—'}</span>
          <span className="promo-item-meta">
            {!hideTahapChip && (
              <span className={`promo-tahap-chip promo-tahap-chip--${p.tahap}`}>
                {t(`prom.tahap.${p.tahap}`)}
              </span>
            )}
            {periode && (
              <span className="promo-item-flag">
                <Icons.sun /> {periode}
              </span>
            )}
            {namaPic && (
              /* Diberi label: satu kartu memuat DUA nama — yang mengerjakan di
                 sini, yang mengusulkan di badan kartu. Tanpa label keduanya
                 tampak sebagai "nama orang" yang sama artinya. */
              <span className="promo-item-flag">
                <Icons.user /> PIC · {namaPic}
              </span>
            )}
            {p.deadline && (
              <span className={`promo-deadline promo-deadline--${deadlineNada}`}>
                <Icons.clock /> {formatTanggalPanjang(p.deadline)}
                {deadlineNada === 'menunggak' && ' · lewat'}
                {deadlineNada === 'telat' && ' · telat'}
                {deadlineNada === 'tepat' && ' · tepat'}
              </span>
            )}
            {punyaDesain(p) && (
              <span className="promo-item-flag">
                <Icons.download /> {t('prom.adaDesain')}
                {gambarAcc.length > 1 && ` · ${gambarAcc.length}`}
              </span>
            )}
            {antre.length > 0 && (
              <span className="promo-badge promo-badge--menunggu">
                <Icons.clock /> {t('prom.desainAntre', { n: String(antre.length) })}
              </span>
            )}
            {p.status === 'menunggu' && (
              <span className="promo-badge promo-badge--menunggu">
                <Icons.clock /> {t('prom.menunggu')}
              </span>
            )}
          </span>
        </span>
        <span className="promo-item-chevron">
          <Icons.chevron />
        </span>
      </button>

      {open && (
        <div className="promo-item-body">
          {/* Centang tahap produksi — hanya untuk kartu KONTEN, dan hanya oleh
              PIC-nya atau pengelola. Ini KLAIM "aku sudah mengerjakannya";
              kartunya baru dihitung untuk target konten setelah pengelola
              memindahkannya ke tahap Selesai. RLS + trigger 0061 menegakkan
              batas yang sama di server. */}
          {p.jenis === 'konten' &&
            p.tahap !== 'selesai' &&
            onTahapan &&
            (isAdmin || p.pic === currentUserId) && (
              <div className="promo-tahapan">
                <span className="promo-tahapan-lbl">Tahap produksi</span>
                <div className="promo-tahapan-list">
                  {TAHAP_KONTEN.map((k) => {
                    const sudah = p.tahapan?.some((t) => t.kunci === k)
                    return (
                      <button
                        key={k}
                        type="button"
                        className={'promo-tahapan-chip' + (sudah ? ' is-on' : '')}
                        onClick={() => onTahapan(p, k)}
                      >
                        {sudah ? '✓' : '○'} {TAHAP_KONTEN_LABEL[k]}
                      </button>
                    )
                  })}
                </div>
                <span className="promo-tahapan-nota">
                  Dihitung untuk targetmu setelah kartunya ditutup pengelola.
                </span>
              </div>
            )}
          {p.deskripsi ? (
            <div className="promo-card-desc">{p.deskripsi}</div>
          ) : (
            <div className="promo-card-desc promo-card-desc--empty">{t('prom.tanpaDeskripsi')}</div>
          )}
          {gambarAcc.length > 0 && (
            <div
              className={
                'promo-card-desain' + (gambarAcc.length > 1 ? ' promo-card-desain--grid' : '')
              }
            >
              {gambarAcc.map((l, i) => (
                <img
                  key={l.nilai.slice(-40) + i}
                  src={l.nilai}
                  alt={`${p.judul || 'Desain promo'} ${i + 1}`}
                  loading="lazy"
                />
              ))}
            </div>
          )}
          {tautanAcc.length > 0 && (
            <div className="promo-card-tautan">
              {tautanAcc.map((l) => (
                <a
                  key={l.nilai}
                  href={l.nilai}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="promo-tautan-chip"
                  title={l.nilai}
                >
                  <Icons.link /> {labelTautan(l.nilai)}
                </a>
              ))}
            </div>
          )}

          {/* Antrean ACC lampiran. Pengelola melihat semuanya; operator hanya
              kirimannya sendiri, supaya ia tahu desainnya sudah masuk. */}
          {antre.length > 0 && (
            <div className="promo-acc">
              <div className="promo-acc-head">
                <Icons.clock /> {t('prom.acc.title')}{' '}
                <span className="count-badge">{antre.length}</span>
              </div>
              {antre.map(({ l, jenis }) => {
                const pengirim = l.oleh ? namaById?.get(l.oleh) : undefined
                return (
                  <div key={jenis + l.nilai.slice(-40)} className="promo-acc-item">
                    {jenis === 'gambar' ? (
                      <img src={l.nilai} alt={t('prom.acc.title')} loading="lazy" />
                    ) : (
                      <a
                        href={l.nilai}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="promo-tautan-chip"
                        title={l.nilai}
                      >
                        <Icons.link /> {labelTautan(l.nilai)}
                      </a>
                    )}
                    <div className="promo-acc-meta">
                      <span className="promo-acc-oleh">
                        {pengirim ? `${t('prom.oleh')} ${pengirim}` : t('prom.acc.tanpaNama')}
                      </span>
                      <div className="promo-acc-aksi">
                        {isAdmin ? (
                          <>
                            <button
                              type="button"
                              className="btn btn--pink btn-mini"
                              onClick={() => putuskan(l, jenis, true)}
                            >
                              <Icons.check /> {t('prom.acc.setujui')}
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn-mini-ghost"
                              onClick={() => putuskan(l, jenis, false)}
                            >
                              <Icons.trash /> {t('prom.acc.tolak')}
                            </button>
                          </>
                        ) : (
                          <span className="promo-acc-status">{t('prom.acc.menunggu')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {nama && (
            <div className="promo-card-oleh">
              {t('prom.ideDari')} {nama}
            </div>
          )}
          {(onUnggah || actions) && (
            <div className="promo-card-actions">
              {onUnggah && (
                <button
                  type="button"
                  className="btn btn--ghost btn-mini-ghost"
                  onClick={() => onUnggah(p)}
                >
                  <Icons.plus /> {t('prom.lampirkan')}
                </button>
              )}
              {actions}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ======================================================================
// Editor lampiran desain — dipakai dua tempat: modal kartu (pengelola) dan
// modal "Lampirkan desain" (siapa pun yang melihat kartunya).
// ======================================================================

/** Lampiran baru dari pengguna ini. Untuk operator, database menimpanya jadi
 *  'menunggu' + `oleh` dirinya sendiri (0057) — ini hanya agar layar jujur
 *  sebelum server menjawab. */
function lampiranBaru(nilai: string, isAdmin: boolean, uid: string): DesainLampiran {
  return { nilai, oleh: uid, status: isAdmin ? 'disetujui' : 'menunggu' }
}

/**
 * Lampiran yang boleh DICABUT seseorang: pengelola bebas, operator hanya
 * usulannya sendiri yang belum di-ACC. Sama persis dengan aturan database,
 * supaya tombolnya tidak menjanjikan sesuatu yang akan ditolak server.
 */
function bisaCabut(l: DesainLampiran, isAdmin: boolean, uid: string): boolean {
  return isAdmin || (l.oleh === uid && l.status === 'menunggu')
}

function DesainEditor({
  isAdmin,
  currentUserId,
  gambar,
  setGambar,
  tautan,
  setTautan,
  tautanBaru,
  setTautanBaru,
  tautanError,
  setTautanError,
}: {
  isAdmin: boolean
  currentUserId: string
  gambar: DesainLampiran[]
  setGambar: (g: DesainLampiran[]) => void
  tautan: DesainLampiran[]
  setTautan: (l: DesainLampiran[]) => void
  tautanBaru: string
  setTautanBaru: (v: string) => void
  tautanError?: string
  setTautanError: (v?: string) => void
}) {
  const { t } = useLang()
  const [desainError, setDesainError] = useState<string>()
  const fileRef = useRef<HTMLInputElement>(null)

  async function pilihDesain(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setDesainError(undefined)
    // Sisa kuota dihitung dulu supaya pilihan berlebih dipangkas, bukan ditolak
    // seluruhnya — yang terpilih duluan tetap masuk.
    const sisa = DESAIN_MAKS - gambar.length
    if (sisa <= 0) {
      setDesainError(t('prom.form.desainPenuh', { maks: String(DESAIN_MAKS) }))
      return
    }
    try {
      const hasil = await Promise.all(files.slice(0, sisa).map(fileToDesainDataUrl))
      setGambar([...gambar, ...hasil.map((src) => lampiranBaru(src, isAdmin, currentUserId))])
      if (files.length > sisa) {
        setDesainError(t('prom.form.desainPenuh', { maks: String(DESAIN_MAKS) }))
      }
    } catch (err) {
      setDesainError(err instanceof Error ? err.message : 'Gagal memuat gambar')
    }
  }

  function tambahTautan() {
    const url = rapikanTautan(tautanBaru)
    if (!url) {
      setTautanError(t('prom.form.tautanInvalid'))
      return
    }
    if (!tautan.some((l) => l.nilai === url)) {
      setTautan([...tautan, lampiranBaru(url, isAdmin, currentUserId)])
    }
    setTautanBaru('')
    setTautanError(undefined)
  }

  return (
    <>
      <div className="field">
        <label>
          {t('prom.form.desain')}
          {gambar.length > 0 && (
            <span className="count-badge">
              {gambar.length}/{DESAIN_MAKS}
            </span>
          )}
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={pilihDesain}
          style={{ display: 'none' }}
        />
        {gambar.length > 0 && (
          <div className="promo-desain-grid">
            {gambar.map((l, i) => (
              <div key={l.nilai.slice(-40) + i} className="promo-desain-slot">
                <img src={l.nilai} alt={`${t('prom.form.desain')} ${i + 1}`} />
                {menungguAcc(l) && (
                  <span className="promo-desain-tag">{t('prom.acc.menunggu')}</span>
                )}
                {bisaCabut(l, isAdmin, currentUserId) && (
                  <button
                    type="button"
                    className="emp-x promo-desain-x"
                    onClick={() => setGambar(gambar.filter((_, idx) => idx !== i))}
                    title={t('prom.form.desainHapus')}
                  >
                    <Icons.trash />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="btn btn--ghost"
          disabled={gambar.length >= DESAIN_MAKS}
          onClick={() => fileRef.current?.click()}
        >
          <Icons.plus />{' '}
          {gambar.length > 0 ? t('prom.form.desainTambah') : t('prom.form.desainUnggah')}
        </button>
        <span className="promo-desain-hint">
          {desainError ? (
            <span style={{ color: 'var(--pink-deep)' }}>{desainError}</span>
          ) : (
            t('prom.form.desainHint', { maks: String(DESAIN_MAKS) })
          )}
        </span>
      </div>

      <div className="field">
        <label>{t('prom.form.tautan')}</label>
        {tautan.length > 0 && (
          <div className="promo-tautan-edit">
            {tautan.map((l) => (
              <span
                key={l.nilai}
                className={
                  'promo-tautan-chip promo-tautan-chip--edit' +
                  (menungguAcc(l) ? ' promo-tautan-chip--antre' : '')
                }
                title={l.nilai}
              >
                <Icons.link />
                <a href={l.nilai} target="_blank" rel="noreferrer noopener">
                  {labelTautan(l.nilai)}
                </a>
                {bisaCabut(l, isAdmin, currentUserId) && (
                  <button
                    type="button"
                    className="emp-x"
                    onClick={() => setTautan(tautan.filter((x) => x.nilai !== l.nilai))}
                    title={t('prom.form.tautanHapus')}
                  >
                    <Icons.x />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <div className="promo-tautan-input">
          <input
            type="url"
            inputMode="url"
            value={tautanBaru}
            onChange={(e) => {
              setTautanBaru(e.target.value)
              setTautanError(undefined)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                tambahTautan()
              }
            }}
            placeholder={t('prom.form.tautanPh')}
          />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!tautanBaru.trim()}
            onClick={tambahTautan}
          >
            <Icons.plus /> {t('prom.form.tautanTambah')}
          </button>
        </div>
        <span className="promo-desain-hint">
          {tautanError ? (
            <span style={{ color: 'var(--pink-deep)' }}>{tautanError}</span>
          ) : (
            t('prom.form.tautanHint')
          )}
        </span>
      </div>
    </>
  )
}

/**
 * Tautan yang sudah diketik tapi belum ditekan "Tambah" tetap ikut tersimpan —
 * kalau tidak, isian itu hilang tanpa jejak saat modalnya ditutup.
 * `null` = teksnya ada tapi bukan URL yang bisa dipakai.
 */
function gabungTautanBaru(
  tautan: DesainLampiran[],
  teks: string,
  isAdmin: boolean,
  uid: string,
): DesainLampiran[] | null {
  if (!teks.trim()) return tautan
  const url = rapikanTautan(teks)
  if (!url) return null
  if (tautan.some((l) => l.nilai === url)) return tautan
  return [...tautan, lampiranBaru(url, isAdmin, uid)]
}

// ======================================================================
// Modal "Lampirkan desain" — jalur ringan untuk menempelkan desain ke kartu
// yang sudah ada, tanpa membuka seluruh isi kartunya. Inilah satu-satunya
// pintu operator ke kartu orang lain (lihat migration 0057).
// ======================================================================
function UnggahDesainModal({
  p,
  isAdmin,
  currentUserId,
  onSave,
  onClose,
}: {
  p: PromoProgram
  isAdmin: boolean
  currentUserId: string
  onSave: (gambar: DesainLampiran[], tautan: DesainLampiran[]) => void
  onClose: () => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const [gambar, setGambar] = useState<DesainLampiran[]>(() =>
    terlihat(gambarKartu(p), isAdmin, currentUserId),
  )
  const [tautan, setTautan] = useState<DesainLampiran[]>(() =>
    terlihat(tautanKartu(p), isAdmin, currentUserId),
  )
  const [tautanBaru, setTautanBaru] = useState('')
  const [tautanError, setTautanError] = useState<string>()

  function simpan() {
    const tautanFinal = gabungTautanBaru(tautan, tautanBaru, isAdmin, currentUserId)
    if (!tautanFinal) {
      setTautanError(t('prom.form.tautanInvalid'))
      toast('warn', t('prom.form.tautanInvalid'))
      return
    }
    // Lampiran orang lain yang tidak terlihat operator TIDAK boleh ikut hilang:
    // kembalikan yang tersembunyi ke tempatnya sebelum menyimpan.
    const sisipTersembunyi = (semua: DesainLampiran[], tampil: DesainLampiran[]) => [
      ...semua.filter((l) => !terlihat([l], isAdmin, currentUserId).length),
      ...tampil,
    ]
    onSave(
      sisipTersembunyi(gambarKartu(p), gambar),
      sisipTersembunyi(tautanKartu(p), tautanFinal),
    )
  }

  return (
    <Modal onClose={onClose}>
      <ModalHead
        icon={<Icons.download />}
        color="var(--pink)"
        title={t('prom.lampirkan')}
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="promo-lampir-judul">{p.judul || '—'}</div>
        {!isAdmin && <div className="promo-lampir-nota">{t('prom.lampir.nota')}</div>}
        <DesainEditor
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          gambar={gambar}
          setGambar={setGambar}
          tautan={tautan}
          setTautan={setTautan}
          tautanBaru={tautanBaru}
          setTautanBaru={setTautanBaru}
          tautanError={tautanError}
          setTautanError={setTautanError}
        />
        <button type="button" className="btn btn--pink btn--block btn--lg" onClick={simpan}>
          <Icons.check /> {isAdmin ? t('prom.form.simpan') : t('prom.lampir.kirim')}
        </button>
      </div>
    </Modal>
  )
}

// ======================================================================
// Modal tambah/edit
// ======================================================================
function PromoModal({
  existing,
  isAdmin,
  currentUserId,
  karyawan,
  onSave,
  onClose,
}: {
  existing?: PromoProgram
  isAdmin: boolean
  currentUserId: string
  /** Kandidat PIC — hanya diisi/ditampilkan untuk admin. */
  karyawan: AppData['employees']
  onSave: (p: PromoProgram) => void
  onClose: () => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const [judul, setJudul] = useState(existing?.judul ?? '')
  const [deskripsi, setDeskripsi] = useState(existing?.deskripsi ?? '')
  const [tahap, setTahap] = useState<PromoTahap>(existing?.tahap ?? 'ide')
  const [mulai, setMulai] = useState(existing?.tanggalMulai ?? '')
  const [selesai, setSelesai] = useState(existing?.tanggalSelesai ?? '')
  const [jenis, setJenis] = useState<PromoJenis>(existing?.jenis ?? 'campaign')
  const [pic, setPic] = useState(existing?.pic ?? '')
  const [deadline, setDeadline] = useState(existing?.deadline ?? '')
  const [gambar, setGambar] = useState<DesainLampiran[]>(() =>
    existing ? terlihat(gambarKartu(existing), isAdmin, currentUserId) : [],
  )
  const [tautan, setTautan] = useState<DesainLampiran[]>(() =>
    existing ? terlihat(tautanKartu(existing), isAdmin, currentUserId) : [],
  )
  const [tautanBaru, setTautanBaru] = useState('')
  const [tautanError, setTautanError] = useState<string>()

  const canSave = !!judul.trim()

  function simpan() {
    if (!canSave) {
      toast('warn', t('prom.form.judulWajib'))
      return
    }
    const tautanFinal = gabungTautanBaru(tautan, tautanBaru, isAdmin, currentUserId)
    if (!tautanFinal) {
      setTautanError(t('prom.form.tautanInvalid'))
      toast('warn', t('prom.form.tautanInvalid'))
      return
    }
    // Lampiran yang tidak terlihat penyunting (usulan orang lain yang belum
    // di-ACC) dikembalikan ke tempatnya — menyunting kartu bukan alasan untuk
    // membuang antrean orang.
    const sisipTersembunyi = (semua: DesainLampiran[], tampil: DesainLampiran[]) => [
      ...semua.filter((l) => !terlihat([l], isAdmin, currentUserId).length),
      ...tampil,
    ]
    const gambarFinal = existing ? sisipTersembunyi(gambarKartu(existing), gambar) : gambar
    const tautanSimpan = existing
      ? sisipTersembunyi(tautanKartu(existing), tautanFinal)
      : tautanFinal
    // Admin: kartu selalu 'disetujui' & tahap sesuai pilihan.
    // Karyawan: usulan selalu 'ide' + 'menunggu' (dikuatkan trigger 0035).
    const p: PromoProgram = {
      id: existing?.id ?? uid(),
      judul: judul.trim(),
      deskripsi: deskripsi.trim(),
      tahap: isAdmin ? tahap : 'ide',
      status: isAdmin ? 'disetujui' : 'menunggu',
      tanggalMulai: mulai || undefined,
      tanggalSelesai: selesai || undefined,
      jenis,
      // PIC & deadline adalah alat pengelola untuk menugaskan; usulan karyawan
      // belum punya penanggung jawab sampai admin menetapkannya.
      pic: isAdmin ? pic || undefined : existing?.pic,
      deadline: isAdmin ? deadline || undefined : existing?.deadline,
      // `selesaiPada` distempel database (0046) — jangan pernah dikirim client.
      selesaiPada: existing?.selesaiPada,
      dibuatOleh: existing?.dibuatOleh ?? currentUserId,
      // `desain` (kolom lama) hanya boleh berisi desain yang tayang — 0056.
      desain: gambarFinal.find(sudahAcc)?.nilai,
      desainList: gambarFinal,
      desainTautan: tautanSimpan,
    }
    onSave(p)
  }

  return (
    <Modal onClose={onClose} wide>
      <ModalHead
        icon={<Icons.pencil />}
        color="var(--pink)"
        title={existing ? t('prom.edit') : isAdmin ? t('prom.tambah') : t('prom.usulkan')}
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="field">
          <label>{t('prom.form.judul')}</label>
          <input
            type="text"
            autoFocus={!existing}
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            placeholder={t('prom.form.judulPh')}
          />
        </div>
        <div className="field">
          <label>{t('prom.form.deskripsi')}</label>
          <textarea
            value={deskripsi}
            onChange={(e) => setDeskripsi(e.target.value)}
            rows={4}
            style={{ minHeight: 96, resize: 'vertical' }}
            placeholder={t('prom.form.deskripsiPh')}
          />
        </div>
        {isAdmin && (
          <div className="field">
            <label>{t('prom.form.tahap')}</label>
            <select value={tahap} onChange={(e) => setTahap(e.target.value as PromoTahap)}>
              {TAHAP_ORDER.map((tt) => (
                <option key={tt} value={tt}>
                  {t(`prom.tahap.${tt}`)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>Jenis</label>
          <select value={jenis} onChange={(e) => setJenis(e.target.value as PromoJenis)}>
            {(Object.keys(JENIS_LABEL) as PromoJenis[]).map((j) => (
              <option key={j} value={j}>
                {JENIS_LABEL[j]}
              </option>
            ))}
          </select>
          <span className="promo-desain-hint">
            Hanya <b>Campaign</b> yang dihitung untuk KPI “2 campaign per bulan”.
          </span>
        </div>
        {isAdmin && (
          <>
            <div className="field">
              <label>Dikerjakan oleh (PIC)</label>
              <select value={pic} onChange={(e) => setPic(e.target.value)}>
                <option value="">— belum ditugaskan —</option>
                {karyawan.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nama}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              <div className="promo-deadline-cepat">
                {HARI_KONTEN.map((h) => (
                  <button
                    key={h.label}
                    type="button"
                    className="btn btn--ghost btn-mini-ghost"
                    onClick={() => setDeadline(konteBerikutnya(h.dow, todayKey()))}
                  >
                    {h.label} ini
                  </button>
                ))}
                {deadline && (
                  <button
                    type="button"
                    className="btn btn--ghost btn-mini-ghost"
                    onClick={() => setDeadline('')}
                  >
                    Hapus
                  </button>
                )}
              </div>
              <span className="promo-desain-hint">
                Ketepatan terhadap deadline dinilai otomatis saat kartu masuk
                tahap “selesai”.
              </span>
            </div>
          </>
        )}
        <div className="promo-form-dates">
          <div className="field">
            <label>{t('prom.form.mulai')}</label>
            <input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('prom.form.selesai')}</label>
            <input type="date" value={selesai} onChange={(e) => setSelesai(e.target.value)} />
          </div>
        </div>
        <DesainEditor
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          gambar={gambar}
          setGambar={setGambar}
          tautan={tautan}
          setTautan={setTautan}
          tautanBaru={tautanBaru}
          setTautanBaru={setTautanBaru}
          tautanError={tautanError}
          setTautanError={setTautanError}
        />
        <button
          type="button"
          className="btn btn--pink btn--block btn--lg"
          disabled={!canSave}
          onClick={simpan}
        >
          <Icons.check /> {t('prom.form.simpan')}
        </button>
      </div>
    </Modal>
  )
}
