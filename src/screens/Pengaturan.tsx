import { useState } from 'react'
import type {
  AppData,
  ClosingTask,
  FontPair,
  FontSize,
  Shift,
  TampilanMode,
} from '../types'
import { uid } from '../storage'
import { SHIFT_LABEL, SHIFT_LIST } from '../attendance'
import {
  DEFAULTS,
  FONT_PAIRS,
  FONT_PAIR_LIST,
  FONT_SIZE_LIST,
  FONT_SIZE_META,
} from '../appearance'
import { ThemeSwitcher, type Theme } from '../components/ThemeSwitcher'
import { Icons } from '../components/Icons'
import { useToast } from '../components/Toast'
import { useLang, type Lang } from '../i18n'
import { usePrefs, setPref, resetPrefs } from '../lib/prefs'

type Props = {
  data: AppData
  setData: (d: AppData) => void
  theme: Theme
  onChangeTheme: (t: Theme) => void
  isAdmin: boolean
}

export function Pengaturan({
  data,
  setData,
  theme,
  onChangeTheme,
  isAdmin,
}: Props) {
  const toast = useToast()
  const { lang, setLang, t } = useLang()
  const prefs = usePrefs()

  function changeLang(l: Lang) {
    setLang(l)
    toast('ok', l === 'id' ? 'Bahasa diubah ke Indonesia' : 'Language changed to English')
  }

  // Preferensi tampilan disimpan per-perangkat (localStorage), tidak ikut data bersama.
  const fontPair: FontPair = prefs.fontPair
  const fontSize: FontSize = prefs.fontSize

  // Local draft for text fields so user can edit + simpan
  const [brandKicker, setBrandKicker] = useState(
    data.brandKicker ?? DEFAULTS.brandKicker,
  )
  const [brandName, setBrandName] = useState(
    data.brandName ?? DEFAULTS.brandName,
  )
  const [dashJudul, setDashJudul] = useState(
    data.dashJudul ?? DEFAULTS.dashJudul,
  )
  const [dashSub, setDashSub] = useState(data.dashSub ?? DEFAULTS.dashSub)
  const [headerJudul, setHeaderJudul] = useState(
    data.headerJudul ?? DEFAULTS.headerJudul,
  )
  const [headerSub, setHeaderSub] = useState(
    data.headerSub ?? DEFAULTS.headerSub,
  )
  const [incomeJudul, setIncomeJudul] = useState(
    data.incomeJudul ?? DEFAULTS.incomeJudul,
  )
  const [incomeSub, setIncomeSub] = useState(
    data.incomeSub ?? DEFAULTS.incomeSub,
  )

  // Draft lokal daftar closing checklist (task sebelum clock out). Diedit di sini
  // lalu disimpan sekaligus ke app_config, sama polanya seperti Teks & Branding.
  const [closingTasks, setClosingTasks] = useState<ClosingTask[]>(
    data.closingChecklist,
  )
  function tambahTask() {
    setClosingTasks((ts) => [
      ...ts,
      { id: uid(), label: '', shifts: [...SHIFT_LIST] },
    ])
  }
  function ubahTaskLabel(id: string, label: string) {
    setClosingTasks((ts) => ts.map((t) => (t.id === id ? { ...t, label } : t)))
  }
  function toggleTaskShift(id: string, shift: Shift) {
    setClosingTasks((ts) =>
      ts.map((t) => {
        if (t.id !== id) return t
        const cur = t.shifts ?? [...SHIFT_LIST]
        const shifts = cur.includes(shift)
          ? cur.filter((s) => s !== shift)
          : [...cur, shift]
        return { ...t, shifts }
      }),
    )
  }
  function hapusTask(id: string) {
    setClosingTasks((ts) => ts.filter((t) => t.id !== id))
  }
  function pindahTask(id: string, arah: -1 | 1) {
    setClosingTasks((ts) => {
      const i = ts.findIndex((t) => t.id === id)
      const j = i + arah
      if (i < 0 || j < 0 || j >= ts.length) return ts
      const next = [...ts]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function simpanChecklist() {
    const bersih = closingTasks
      .map((t) => ({ ...t, label: t.label.trim() }))
      .filter((t) => t.label)
    setClosingTasks(bersih)
    setData({ ...data, closingChecklist: bersih })
    toast(
      'ok',
      bersih.length
        ? `Checklist tersimpan (${bersih.length} tugas)`
        : 'Checklist dikosongkan — clock out tanpa checklist',
    )
  }

  // Draft lokal checklist pagi (task setelah clock in). Pola sama seperti closing,
  // hanya beda field tujuan (openingChecklist) — non-blok, cuma pengingat.
  const [openingTasks, setOpeningTasks] = useState<ClosingTask[]>(
    data.openingChecklist,
  )
  function tambahTaskPagi() {
    setOpeningTasks((ts) => [
      ...ts,
      { id: uid(), label: '', shifts: [...SHIFT_LIST] },
    ])
  }
  function ubahTaskPagiLabel(id: string, label: string) {
    setOpeningTasks((ts) => ts.map((t) => (t.id === id ? { ...t, label } : t)))
  }
  function toggleTaskPagiShift(id: string, shift: Shift) {
    setOpeningTasks((ts) =>
      ts.map((t) => {
        if (t.id !== id) return t
        const cur = t.shifts ?? [...SHIFT_LIST]
        const shifts = cur.includes(shift)
          ? cur.filter((s) => s !== shift)
          : [...cur, shift]
        return { ...t, shifts }
      }),
    )
  }
  function hapusTaskPagi(id: string) {
    setOpeningTasks((ts) => ts.filter((t) => t.id !== id))
  }
  function pindahTaskPagi(id: string, arah: -1 | 1) {
    setOpeningTasks((ts) => {
      const i = ts.findIndex((t) => t.id === id)
      const j = i + arah
      if (i < 0 || j < 0 || j >= ts.length) return ts
      const next = [...ts]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function simpanChecklistPagi() {
    const bersih = openingTasks
      .map((t) => ({ ...t, label: t.label.trim() }))
      .filter((t) => t.label)
    setOpeningTasks(bersih)
    setData({ ...data, openingChecklist: bersih })
    toast(
      'ok',
      bersih.length
        ? `Checklist pagi tersimpan (${bersih.length} tugas)`
        : 'Checklist pagi dikosongkan — tanpa pengingat pagi',
    )
  }

  function setFontPair(p: FontPair) {
    setPref('fontPair', p)
    toast('ok', `Font diubah ke ${FONT_PAIRS[p].label}`)
  }

  function setFontSize(s: FontSize) {
    setPref('fontSize', s)
    toast('ok', `Ukuran teks ${FONT_SIZE_META[s].label}`)
  }

  function simpanTeks() {
    setData({
      ...data,
      brandKicker: brandKicker.trim() || undefined,
      brandName: brandName.trim() || undefined,
      dashJudul: dashJudul.trim() || undefined,
      dashSub: dashSub.trim() || undefined,
      headerJudul: headerJudul.trim() || undefined,
      headerSub: headerSub.trim() || undefined,
      incomeJudul: incomeJudul.trim() || undefined,
      incomeSub: incomeSub.trim() || undefined,
    })
    toast('ok', 'Teks tersimpan')
  }

  function resetTeks() {
    setBrandKicker(DEFAULTS.brandKicker)
    setBrandName(DEFAULTS.brandName)
    setDashJudul(DEFAULTS.dashJudul)
    setDashSub(DEFAULTS.dashSub)
    setHeaderJudul(DEFAULTS.headerJudul)
    setHeaderSub(DEFAULTS.headerSub)
    setIncomeJudul(DEFAULTS.incomeJudul)
    setIncomeSub(DEFAULTS.incomeSub)
    setData({
      ...data,
      brandKicker: undefined,
      brandName: undefined,
      dashJudul: undefined,
      dashSub: undefined,
      headerJudul: undefined,
      headerSub: undefined,
      incomeJudul: undefined,
      incomeSub: undefined,
    })
    toast('info', 'Teks dikembalikan ke default')
  }

  function resetTampilan() {
    resetPrefs()
    onChangeTheme('pop')
    toast('info', 'Tampilan dikembalikan ke default')
  }

  function setTampilanAbsensi(m: TampilanMode) {
    setPref('tampilanAbsensi', m)
    toast('ok', `Absensi: tampilan ${m === 'card' ? 'kartu' : 'list'}`)
  }
  function setTampilanInventaris(m: TampilanMode) {
    setPref('tampilanInventaris', m)
    toast('ok', `Inventaris: tampilan ${m === 'card' ? 'kartu' : 'list'}`)
  }
  function setTampilanTinta(m: TampilanMode) {
    setPref('tampilanTinta', m)
    toast('ok', `Stok tinta: tampilan ${m === 'card' ? 'kartu' : 'list'}`)
  }
  function setTampilanIncome(m: TampilanMode) {
    setPref('tampilanIncome', m)
    const nama =
      m === 'card' ? 'kartu' : m === 'kalender' ? 'kalender' : 'list'
    toast('ok', `Laporan income: tampilan ${nama}`)
  }
  const tampilanAbsensi = prefs.tampilanAbsensi
  const tampilanInventaris = prefs.tampilanInventaris
  const tampilanTinta = prefs.tampilanTinta
  const tampilanIncome = prefs.tampilanIncome

  return (
    <>
      <section className="settings-card">
        <div className="settings-head">
          <div className="settings-head-ikon">🌐</div>
          <div>
            <h2 className="settings-title">{t('set.language.title')}</h2>
            <p className="settings-sub">{t('set.language.sub')}</p>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">{t('set.language.label')}</div>
          <div className="mode-pick">
            <button
              type="button"
              className={'mode-btn' + (lang === 'id' ? ' is-active' : '')}
              onClick={() => changeLang('id')}
            >
              <span className="mode-ikon">🇮🇩</span> {t('set.language.id')}
            </button>
            <button
              type="button"
              className={'mode-btn' + (lang === 'en' ? ' is-active' : '')}
              onClick={() => changeLang('en')}
            >
              <span className="mode-ikon">🇬🇧</span> {t('set.language.en')}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-head">
          <div className="settings-head-ikon">🎨</div>
          <div>
            <h2 className="settings-title">Tampilan</h2>
            <p className="settings-sub">
              Tema warna, pasangan font, dan ukuran teks untuk seluruh aplikasi.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={resetTampilan}
          >
            ↺ Reset tampilan
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Tema warna</div>
          <ThemeSwitcher theme={theme} onChange={onChangeTheme} inline />
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Pasangan font</div>
          <div className="font-grid">
            {FONT_PAIR_LIST.map((p) => {
              const meta = FONT_PAIRS[p]
              const active = fontPair === p
              return (
                <button
                  key={p}
                  type="button"
                  className={'font-card' + (active ? ' is-active' : '')}
                  onClick={() => setFontPair(p)}
                >
                  <div
                    className="font-preview"
                    style={{ fontFamily: `'${meta.display}', sans-serif` }}
                  >
                    {meta.preview}
                  </div>
                  <div className="font-card-info">
                    <div className="font-name">{meta.label}</div>
                    <div className="font-desc">
                      {meta.display} · {meta.body}
                    </div>
                  </div>
                  {active && (
                    <span className="font-active-badge">
                      <Icons.check />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Ukuran teks</div>
          <div className="size-grid">
            {FONT_SIZE_LIST.map((s) => {
              const meta = FONT_SIZE_META[s]
              const active = fontSize === s
              return (
                <button
                  key={s}
                  type="button"
                  className={'size-card' + (active ? ' is-active' : '')}
                  onClick={() => setFontSize(s)}
                >
                  <div
                    className="size-preview"
                    style={{ fontSize: 12 + meta.scale * 8 }}
                  >
                    Aa
                  </div>
                  <div className="size-label">{meta.label}</div>
                  <div className="size-pct">{Math.round(meta.scale * 100)}%</div>
                </button>
              )
            })}
          </div>
          <div className="form-hint" style={{ marginTop: 8 }}>
            💡 Mengubah ukuran teks juga akan menyesuaikan semua kartu, tombol,
            dan jarak visual secara proporsional.
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Mode tampilan halaman</div>
          <div className="mode-row">
            <div className="mode-info">
              <div className="mode-judul">Presensi Karyawan</div>
              <div className="mode-desc">
                Pilih cara melihat daftar karyawan di halaman Absensi
              </div>
            </div>
            <div className="mode-pick">
              <button
                type="button"
                className={
                  'mode-btn' + (tampilanAbsensi === 'card' ? ' is-active' : '')
                }
                onClick={() => setTampilanAbsensi('card')}
              >
                <span className="mode-ikon">▦</span> Card
              </button>
              <button
                type="button"
                className={
                  'mode-btn' + (tampilanAbsensi === 'list' ? ' is-active' : '')
                }
                onClick={() => setTampilanAbsensi('list')}
              >
                <span className="mode-ikon">≡</span> List
              </button>
            </div>
          </div>

          <div className="mode-row">
            <div className="mode-info">
              <div className="mode-judul">Inventaris &amp; Stok Kertas</div>
              <div className="mode-desc">
                Pilih cara melihat daftar jenis kertas di halaman Inventaris
              </div>
            </div>
            <div className="mode-pick">
              <button
                type="button"
                className={
                  'mode-btn' +
                  (tampilanInventaris === 'card' ? ' is-active' : '')
                }
                onClick={() => setTampilanInventaris('card')}
              >
                <span className="mode-ikon">▦</span> Card
              </button>
              <button
                type="button"
                className={
                  'mode-btn' +
                  (tampilanInventaris === 'list' ? ' is-active' : '')
                }
                onClick={() => setTampilanInventaris('list')}
              >
                <span className="mode-ikon">≡</span> List
              </button>
            </div>
          </div>

          <div className="mode-row">
            <div className="mode-info">
              <div className="mode-judul">Stok Tinta (6 warna)</div>
              <div className="mode-desc">
                Pilih cara melihat daftar warna tinta di halaman Inventaris
              </div>
            </div>
            <div className="mode-pick">
              <button
                type="button"
                className={
                  'mode-btn' + (tampilanTinta === 'card' ? ' is-active' : '')
                }
                onClick={() => setTampilanTinta('card')}
              >
                <span className="mode-ikon">▦</span> Card
              </button>
              <button
                type="button"
                className={
                  'mode-btn' + (tampilanTinta === 'list' ? ' is-active' : '')
                }
                onClick={() => setTampilanTinta('list')}
              >
                <span className="mode-ikon">≡</span> List
              </button>
            </div>
          </div>

          <div className="mode-row">
            <div className="mode-info">
              <div className="mode-judul">Laporan Income</div>
              <div className="mode-desc">
                Pilih cara melihat daftar laporan di halaman Laporan Income
              </div>
            </div>
            <div className="mode-pick">
              <button
                type="button"
                className={
                  'mode-btn' + (tampilanIncome === 'card' ? ' is-active' : '')
                }
                onClick={() => setTampilanIncome('card')}
              >
                <span className="mode-ikon">▦</span> Card
              </button>
              <button
                type="button"
                className={
                  'mode-btn' + (tampilanIncome === 'list' ? ' is-active' : '')
                }
                onClick={() => setTampilanIncome('list')}
              >
                <span className="mode-ikon">≡</span> List
              </button>
              <button
                type="button"
                className={
                  'mode-btn' +
                  (tampilanIncome === 'kalender' ? ' is-active' : '')
                }
                onClick={() => setTampilanIncome('kalender')}
              >
                <span className="mode-ikon">🗓️</span> Kalender
              </button>
            </div>
          </div>
        </div>
      </section>

      {isAdmin && (
      <section className="settings-card">
        <div className="settings-head">
          <div className="settings-head-ikon">✏️</div>
          <div>
            <h2 className="settings-title">Teks &amp; Branding</h2>
            <p className="settings-sub">
              Ubah teks yang muncul di sidebar, dashboard, dan halaman absensi.
              Klik Simpan untuk menerapkan.
            </p>
          </div>
          <button type="button" className="btn btn--ghost" onClick={resetTeks}>
            ↺ Reset teks
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Branding sidebar</div>
          <div className="settings-grid">
            <div className="field">
              <label>Kicker (di atas nama)</label>
              <input
                type="text"
                value={brandKicker}
                onChange={(e) => setBrandKicker(e.target.value)}
                placeholder={DEFAULTS.brandKicker}
              />
            </div>
            <div className="field">
              <label>Nama sistem</label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder={DEFAULTS.brandName}
              />
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Halaman Dashboard (sambutan)</div>
          <div className="field">
            <label>Judul sambutan</label>
            <input
              type="text"
              value={dashJudul}
              onChange={(e) => setDashJudul(e.target.value)}
              placeholder={DEFAULTS.dashJudul}
            />
          </div>
          <div className="field">
            <label>Deskripsi sambutan</label>
            <textarea
              value={dashSub}
              onChange={(e) => setDashSub(e.target.value)}
              rows={2}
              placeholder={DEFAULTS.dashSub}
              style={{ minHeight: 64, resize: 'vertical' }}
            />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Halaman Absensi (sambutan)</div>
          <div className="field">
            <label>Judul sambutan</label>
            <input
              type="text"
              value={headerJudul}
              onChange={(e) => setHeaderJudul(e.target.value)}
              placeholder={DEFAULTS.headerJudul}
            />
          </div>
          <div className="field">
            <label>Deskripsi sambutan</label>
            <textarea
              value={headerSub}
              onChange={(e) => setHeaderSub(e.target.value)}
              rows={2}
              placeholder={DEFAULTS.headerSub}
              style={{ minHeight: 64, resize: 'vertical' }}
            />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">
            Halaman Laporan Income (judul)
          </div>
          <div className="field">
            <label>Judul laporan</label>
            <input
              type="text"
              value={incomeJudul}
              onChange={(e) => setIncomeJudul(e.target.value)}
              placeholder={DEFAULTS.incomeJudul}
            />
          </div>
          <div className="field">
            <label>Deskripsi laporan</label>
            <textarea
              value={incomeSub}
              onChange={(e) => setIncomeSub(e.target.value)}
              rows={2}
              placeholder={DEFAULTS.incomeSub}
              style={{ minHeight: 64, resize: 'vertical' }}
            />
          </div>
          <div className="form-hint" style={{ marginTop: 4 }}>
            💡 Untuk menambah / mengubah item &amp; harga laporan income, buka
            halaman <strong>Laporan Income → Atur Item &amp; Harga</strong>.
          </div>
        </div>

        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={simpanTeks}
        >
          <Icons.check /> Simpan Teks
        </button>
      </section>
      )}

      {isAdmin && (
      <section className="settings-card">
        <div className="settings-head">
          <div className="settings-head-ikon">🌙</div>
          <div>
            <h2 className="settings-title">Checklist Sebelum Pulang</h2>
            <p className="settings-sub">
              Daftar tugas closing yang wajib dicentang karyawan sebelum clock
              out (mis. mematikan lampu studio, mengisi laporan keuangan, kirim
              laporan via WhatsApp). Pilih di shift mana tiap tugas muncul —
              shift pagi & sore bisa punya tugas berbeda. Kosongkan untuk
              mematikan fitur.
            </p>
          </div>
        </div>

        <div className="settings-section">
          <div className="closing-cfg-list">
            {closingTasks.length === 0 && (
              <div className="form-hint">
                Belum ada tugas. Tambahkan minimal satu untuk mengaktifkan
                checklist saat clock out.
              </div>
            )}
            {closingTasks.map((t, i) => {
              const shifts = t.shifts ?? [...SHIFT_LIST]
              return (
                <div key={t.id} className="closing-cfg-row">
                  <div className="closing-cfg-main">
                    <span className="closing-cfg-num">{i + 1}.</span>
                    <input
                      type="text"
                      value={t.label}
                      onChange={(e) => ubahTaskLabel(t.id, e.target.value)}
                      placeholder="mis. Mematikan lampu studio"
                    />
                    <button
                      type="button"
                      className="btn-mini btn-mini-ghost"
                      onClick={() => pindahTask(t.id, -1)}
                      disabled={i === 0}
                      title="Naikkan"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-mini btn-mini-ghost"
                      onClick={() => pindahTask(t.id, 1)}
                      disabled={i === closingTasks.length - 1}
                      title="Turunkan"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-mini btn-mini-skip"
                      onClick={() => hapusTask(t.id)}
                      title="Hapus tugas"
                    >
                      <Icons.trash />
                    </button>
                  </div>
                  <div className="closing-cfg-shifts">
                    <span className="closing-cfg-shifts-label">
                      Tampil di shift:
                    </span>
                    {SHIFT_LIST.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`shift-toggle${shifts.includes(s) ? ' on' : ''}`}
                        onClick={() => toggleTaskShift(t.id, s)}
                      >
                        {SHIFT_LABEL[s].replace('Shift ', '')}
                      </button>
                    ))}
                    {shifts.length === 0 && (
                      <span className="closing-cfg-warn">
                        ⚠️ tak muncul di shift mana pun
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="closing-cfg-actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={tambahTask}
            >
              + Tambah Tugas
            </button>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={simpanChecklist}
            >
              <Icons.check /> Simpan Checklist
            </button>
          </div>
        </div>
      </section>
      )}

      {isAdmin && (
      <section className="settings-card">
        <div className="settings-head">
          <div className="settings-head-ikon">☀️</div>
          <div>
            <h2 className="settings-title">Checklist Pagi</h2>
            <p className="settings-sub">
              Daftar tugas persiapan buka yang muncul SETELAH karyawan absen pagi
              (mis. menyalakan lampu &amp; AC, menyapu, cek stok kertas, buka
              pintu). Berbeda dari checklist pulang — ini <strong>tidak
              memblokir</strong>: jam masuk tetap tercatat walau tugas belum
              dicentang. Pilih di shift mana tiap tugas muncul. Kosongkan untuk
              mematikan fitur.
            </p>
          </div>
        </div>

        <div className="settings-section">
          <div className="closing-cfg-list">
            {openingTasks.length === 0 && (
              <div className="form-hint">
                Belum ada tugas. Tambahkan minimal satu untuk mengaktifkan
                checklist pagi setelah clock in.
              </div>
            )}
            {openingTasks.map((t, i) => {
              const shifts = t.shifts ?? [...SHIFT_LIST]
              return (
                <div key={t.id} className="closing-cfg-row">
                  <div className="closing-cfg-main">
                    <span className="closing-cfg-num">{i + 1}.</span>
                    <input
                      type="text"
                      value={t.label}
                      onChange={(e) => ubahTaskPagiLabel(t.id, e.target.value)}
                      placeholder="mis. Menyalakan lampu & AC studio"
                    />
                    <button
                      type="button"
                      className="btn-mini btn-mini-ghost"
                      onClick={() => pindahTaskPagi(t.id, -1)}
                      disabled={i === 0}
                      title="Naikkan"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-mini btn-mini-ghost"
                      onClick={() => pindahTaskPagi(t.id, 1)}
                      disabled={i === openingTasks.length - 1}
                      title="Turunkan"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-mini btn-mini-skip"
                      onClick={() => hapusTaskPagi(t.id)}
                      title="Hapus tugas"
                    >
                      <Icons.trash />
                    </button>
                  </div>
                  <div className="closing-cfg-shifts">
                    <span className="closing-cfg-shifts-label">
                      Tampil di shift:
                    </span>
                    {SHIFT_LIST.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`shift-toggle${shifts.includes(s) ? ' on' : ''}`}
                        onClick={() => toggleTaskPagiShift(t.id, s)}
                      >
                        {SHIFT_LABEL[s].replace('Shift ', '')}
                      </button>
                    ))}
                    {shifts.length === 0 && (
                      <span className="closing-cfg-warn">
                        ⚠️ tak muncul di shift mana pun
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="closing-cfg-actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={tambahTaskPagi}
            >
              + Tambah Tugas
            </button>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={simpanChecklistPagi}
            >
              <Icons.check /> Simpan Checklist Pagi
            </button>
          </div>
        </div>
      </section>
      )}

      <section className="settings-card">
        <div className="settings-head">
          <div className="settings-head-ikon">💡</div>
          <div>
            <h2 className="settings-title">Catatan</h2>
            <p className="settings-sub">
              Pengaturan ini disimpan secara lokal di perangkat ini (browser).
              Tema, font, dan teks yang Anda atur tetap aktif setelah me-refresh
              halaman.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
