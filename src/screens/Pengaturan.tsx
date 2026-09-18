import { useState } from 'react'
import type {
  AppData,
  ClosingTask,
  FontPair,
  FontSize,
  NotifikasiConfig,
  PeriksaNotifikasi,
  Shift,
  TampilanMode,
} from '../types'
import {
  NOTIFIKASI_DEFAULT,
  PERIKSA_LABEL,
  PERIKSA_NOTIFIKASI,
} from '../types'
import { kirimNotifikasiUji } from '../lib/db'
import { uid, todayKey } from '../storage'
import { SHIFT_LABEL, SHIFT_LIST } from '../attendance'
import {
  DEFAULTS,
  FONT_PAIRS,
  FONT_PAIR_LIST,
  FONT_SIZE_LIST,
  FONT_SIZE_META,
} from '../appearance'
import { ThemeSwitcher, type Theme } from '../components/ThemeSwitcher'
import { GantiPassword } from '../components/GantiPassword'
import { Icons } from '../components/Icons'
import { useToast } from '../components/Toast'
import { useLang, type Lang } from '../i18n'
import { usePrefs, setPref, resetPrefs } from '../lib/prefs'

// "2026-09-16" -> "16 Sep 2026", untuk catatan kecil kapan tugas mulai dinilai.
function tglSingkat(tanggal: string): string {
  const [y, m, d] = tanggal.split('-').map(Number)
  if (!y || !m || !d) return tanggal
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

type Props = {
  data: AppData
  setData: (d: AppData) => void
  theme: Theme
  onChangeTheme: (t: Theme) => void
  isAdmin: boolean
  /**
   * Kartu "Pengingat Harian Manajer" hanya untuk owner. Manajer memang
   * pengelola, tapi dialah yang sedang diingatkan — memberinya sakelar untuk
   * mematikan pengingatnya sendiri membuat seluruh fiturnya tak ada artinya.
   */
  isOwner: boolean
}

export function Pengaturan({
  data,
  setData,
  theme,
  onChangeTheme,
  isAdmin,
  isOwner,
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

  // Tugas yang baru pertama kali disimpan dicap tanggal hari ini (`mulai`).
  // Penilaian SOP di Dashboard Manajemen memakai cap itu supaya tugas baru tidak
  // dihitung mundur ke hari-hari sebelum ia ada. Tugas lama yang belum punya cap
  // dibiarkan apa adanya — riwayatnya memang berlaku sejak awal.
  function capMulai(draft: ClosingTask[], tersimpan: ClosingTask[]) {
    const lama = new Set(tersimpan.map((t) => t.id))
    const hariIni = todayKey()
    return draft.map((t) =>
      t.mulai || lama.has(t.id) ? t : { ...t, mulai: hariIni },
    )
  }

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
    const bersih = capMulai(closingTasks, data.closingChecklist)
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
    const bersih = capMulai(openingTasks, data.openingChecklist)
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

  // ---------- Pengingat harian manajer (migration 0062) ----------
  // Draf lokal + tombol Simpan, pola sama seperti checklist & branding:
  // chat id diketik karakter demi karakter, dan write-through setData akan
  // menulis ke database di setiap ketukan kalau tidak ditahan di sini.
  const notifTersimpan: NotifikasiConfig = {
    ...NOTIFIKASI_DEFAULT,
    ...(data.notifikasi ?? {}),
  }
  const [notif, setNotif] = useState<NotifikasiConfig>(notifTersimpan)
  const [ujiJalan, setUjiJalan] = useState(false)

  /** Sebuah pemeriksaan menyala kecuali dimatikan dengan sengaja. */
  function periksaNyala(k: PeriksaNotifikasi): boolean {
    return notif.periksa?.[k] !== false
  }

  function togglePeriksa(k: PeriksaNotifikasi) {
    setNotif({
      ...notif,
      periksa: { ...notif.periksa, [k]: !periksaNyala(k) },
    })
  }

  const notifBerubah =
    notif.aktif !== notifTersimpan.aktif ||
    notif.chatManajer !== notifTersimpan.chatManajer ||
    notif.chatOwner !== notifTersimpan.chatOwner ||
    notif.eskalasiHari !== notifTersimpan.eskalasiHari ||
    PERIKSA_NOTIFIKASI.some(
      (k) =>
        (notif.periksa?.[k] !== false) !==
        (notifTersimpan.periksa?.[k] !== false),
    )

  function simpanNotifikasi() {
    const bersih: NotifikasiConfig = {
      ...notif,
      chatManajer: notif.chatManajer.trim(),
      chatOwner: notif.chatOwner.trim(),
      eskalasiHari: Math.min(14, Math.max(1, notif.eskalasiHari || 2)),
    }
    if (bersih.aktif && !bersih.chatManajer) {
      toast('warn', 'Isi Chat ID manajer dulu sebelum mengaktifkan')
      return
    }
    setNotif(bersih)
    setData({ ...data, notifikasi: bersih })
    toast('ok', 'Pengaturan pengingat disimpan')
  }

  // Uji coba memakai konfigurasi yang ADA DI SERVER, bukan draf di layar —
  // karena itu tombolnya terkunci selama masih ada perubahan belum disimpan.
  async function ujiNotifikasi() {
    setUjiJalan(true)
    try {
      const n = await kirimNotifikasiUji()
      toast(
        'ok',
        n > 0
          ? `Terkirim — berisi ${n} hal yang sedang menunggak`
          : 'Terkirim — saat ini tidak ada yang menunggak',
      )
    } catch (e) {
      toast('warn', e instanceof Error ? e.message : 'Gagal mengirim')
    } finally {
      setUjiJalan(false)
    }
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
                    {t.mulai && (
                      <span className="closing-cfg-mulai">
                        dinilai sejak {tglSingkat(t.mulai)}
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
                    {t.mulai && (
                      <span className="closing-cfg-mulai">
                        dinilai sejak {tglSingkat(t.mulai)}
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

      {isOwner && (
      <section className="settings-card">
        <div className="settings-head">
          <div className="settings-head-ikon">🔔</div>
          <div>
            <h2 className="settings-title">Pengingat Harian Manajer</h2>
            <p className="settings-sub">
              Tiap pagi sistem memeriksa apa yang masih menggantung — laporan
              harian, ACC absen, klaim story/live, kartu konten, lead, kendala
              teknis, roster minggu depan, stok frame — lalu mengirim satu pesan
              Telegram ke manajer. Kalau semuanya beres, tidak ada pesan yang dikirim sama
              sekali, jadi pesan yang masuk selalu berarti ada yang perlu
              dikerjakan.
            </p>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Tujuan</div>
          <div className="settings-grid">
            <div className="field">
              <label>Chat ID manajer</label>
              <input
                type="text"
                inputMode="numeric"
                value={notif.chatManajer}
                onChange={(e) =>
                  setNotif({ ...notif, chatManajer: e.target.value })
                }
                placeholder="mis. 123456789"
              />
            </div>
            <div className="field">
              <label>Chat ID owner (tembusan eskalasi)</label>
              <input
                type="text"
                inputMode="numeric"
                value={notif.chatOwner}
                onChange={(e) =>
                  setNotif({ ...notif, chatOwner: e.target.value })
                }
                placeholder="kosongkan kalau tidak ingin ditembusi"
              />
            </div>
          </div>
          <div className="form-hint">
            Mendapatkan chat id: minta orangnya mengirim satu pesan apa pun ke
            bot, lalu buka <code>api.telegram.org/bot&lt;token&gt;/getUpdates</code>{' '}
            di browser — angka pada <code>chat.id</code> itulah yang diisi di
            sini.
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Yang diperiksa</div>
          <div className="closing-cfg-actions">
            {PERIKSA_NOTIFIKASI.map((k) => (
              <button
                key={k}
                type="button"
                className={`shift-toggle${periksaNyala(k) ? ' on' : ''}`}
                onClick={() => togglePeriksa(k)}
              >
                {PERIKSA_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="form-hint">
            Matikan yang ternyata tidak perlu. Semakin sedikit yang menyala,
            semakin besar kemungkinan pesannya tetap dibaca.
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Eskalasi &amp; status</div>
          <div className="settings-grid">
            <div className="field">
              <label>Tembuskan ke owner setelah (hari)</label>
              <input
                type="number"
                min={1}
                max={14}
                value={notif.eskalasiHari}
                onChange={(e) =>
                  setNotif({ ...notif, eskalasiHari: Number(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label>Status pengingat</label>
              <button
                type="button"
                className={`shift-toggle${notif.aktif ? ' on' : ''}`}
                onClick={() => setNotif({ ...notif, aktif: !notif.aktif })}
              >
                {notif.aktif ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>
          </div>
        </div>

        <div className="closing-cfg-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={simpanNotifikasi}
            disabled={!notifBerubah}
          >
            Simpan
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={ujiNotifikasi}
            disabled={notifBerubah || ujiJalan || !notif.chatManajer}
          >
            {ujiJalan ? 'Mengirim…' : '✈️ Kirim uji coba'}
          </button>
          {notifBerubah && (
            <span className="form-hint">
              Simpan dulu — uji coba memakai pengaturan yang sudah tersimpan.
            </span>
          )}
        </div>
      </section>
      )}

      <GantiPassword />

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
