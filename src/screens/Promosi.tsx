import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppData, PromoProgram, PromoTahap } from '../types'
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
/** Tahap yang tampil ke karyawan (sisanya rahasia — dikuatkan RLS 0035). */
const TAHAP_KARYAWAN: PromoTahap[] = ['comingsoon', 'berjalan']

/** Maks dimensi desain promo (px) — cukup tajam untuk posting sosial media. */
const DESAIN_MAX = 1600

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

/** Unduh desain (data URL) sebagai file gambar untuk diposting. */
function unduhDesain(p: PromoProgram) {
  if (!p.desain) return
  const nama =
    (p.judul || 'desain-promo').replace(/[^\w\d-]+/g, '-').replace(/^-+|-+$/g, '') || 'desain-promo'
  const a = document.createElement('a')
  a.href = p.desain
  a.download = `${nama}.jpg`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Tombol unduh desain — hanya muncul kalau promo punya desain. */
function DownloadDesainBtn({ p }: { p: PromoProgram }) {
  const { t } = useLang()
  if (!p.desain) return null
  return (
    <button type="button" className="btn btn--ghost btn-mini-ghost" onClick={() => unduhDesain(p)}>
      <Icons.download /> {t('prom.unduh')}
    </button>
  )
}

export function Promosi({ data, setData, isAdmin, currentUserId }: Props) {
  const toast = useToast()
  const { t } = useLang()
  const [editing, setEditing] = useState<PromoProgram | null>(null)
  const [showForm, setShowForm] = useState(false)

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
          onTambah={bukaTambah}
          onEdit={bukaEdit}
          onHapus={hapus}
          onSetTahap={setTahap}
          onSetujui={setujui}
        />
      ) : (
        <KaryawanView
          promos={promos}
          currentUserId={currentUserId}
          onUsulkan={bukaTambah}
          onEdit={bukaEdit}
          onHapus={hapus}
        />
      )}

      {showForm && (
        <PromoModal
          existing={editing ?? undefined}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
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
  onTambah,
  onEdit,
  onHapus,
  onSetTahap,
  onSetujui,
}: {
  promos: PromoProgram[]
  namaById: Map<string, string>
  onTambah: () => void
  onEdit: (p: PromoProgram) => void
  onHapus: (p: PromoProgram) => void
  onSetTahap: (p: PromoProgram, tahap: PromoTahap) => void
  onSetujui: (p: PromoProgram) => void
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
  currentUserId,
  onUsulkan,
  onEdit,
  onHapus,
}: {
  promos: PromoProgram[]
  currentUserId: string
  onUsulkan: () => void
  onEdit: (p: PromoProgram) => void
  onHapus: (p: PromoProgram) => void
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
                    hideTahapChip
                    actions={p.desain ? <DownloadDesainBtn p={p} /> : undefined}
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
}: {
  p: PromoProgram
  namaById?: Map<string, string>
  actions?: ReactNode
  hideTahapChip?: boolean
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const nama = p.dibuatOleh ? namaById?.get(p.dibuatOleh) : undefined
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
            {p.desain && (
              <span className="promo-item-flag">
                <Icons.download /> {t('prom.adaDesain')}
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
          {p.deskripsi ? (
            <div className="promo-card-desc">{p.deskripsi}</div>
          ) : (
            <div className="promo-card-desc promo-card-desc--empty">{t('prom.tanpaDeskripsi')}</div>
          )}
          {p.desain && (
            <div className="promo-card-desain">
              <img src={p.desain} alt={p.judul || 'Desain promo'} loading="lazy" />
            </div>
          )}
          {nama && (
            <div className="promo-card-oleh">
              {t('prom.oleh')} {nama}
            </div>
          )}
          {actions && <div className="promo-card-actions">{actions}</div>}
        </div>
      )}
    </div>
  )
}

// ======================================================================
// Modal tambah/edit
// ======================================================================
function PromoModal({
  existing,
  isAdmin,
  currentUserId,
  onSave,
  onClose,
}: {
  existing?: PromoProgram
  isAdmin: boolean
  currentUserId: string
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
  const [desain, setDesain] = useState<string | undefined>(existing?.desain)
  const [desainError, setDesainError] = useState<string>()
  const fileRef = useRef<HTMLInputElement>(null)

  const canSave = !!judul.trim()

  async function pilihDesain(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setDesainError(undefined)
      setDesain(await fileToDesainDataUrl(file))
    } catch (err) {
      setDesainError(err instanceof Error ? err.message : 'Gagal memuat gambar')
    }
  }

  function simpan() {
    if (!canSave) {
      toast('warn', t('prom.form.judulWajib'))
      return
    }
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
      dibuatOleh: existing?.dibuatOleh ?? currentUserId,
      desain: desain || undefined,
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
        <div className="field">
          <label>{t('prom.form.desain')}</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={pilihDesain}
            style={{ display: 'none' }}
          />
          {desain ? (
            <div className="promo-desain-edit">
              <img src={desain} alt={t('prom.form.desain')} className="promo-desain-preview" />
              <div className="promo-desain-edit-actions">
                <button
                  type="button"
                  className="btn btn--ghost btn-mini-ghost"
                  onClick={() => fileRef.current?.click()}
                >
                  <Icons.pencil /> {t('prom.form.desainGanti')}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn-mini-ghost"
                  onClick={() => setDesain(undefined)}
                >
                  <Icons.trash /> {t('prom.form.desainHapus')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
              <Icons.download /> {t('prom.form.desainUnggah')}
            </button>
          )}
          <span className="promo-desain-hint">
            {desainError ? (
              <span style={{ color: 'var(--pink-deep)' }}>{desainError}</span>
            ) : (
              t('prom.form.desainHint')
            )}
          </span>
        </div>
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
