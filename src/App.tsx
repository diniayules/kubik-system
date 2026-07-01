import { useEffect, useState } from 'react'
import { Landing } from './screens/Landing'
import { Home } from './screens/Home'
import { Absen } from './screens/Absen'
import { Riwayat } from './screens/Riwayat'
import { ProfilKaryawan } from './screens/ProfilKaryawan'
import { LaporanIncome } from './screens/LaporanIncome'
import { Event } from './screens/Event'
import { Inventaris } from './screens/Inventaris'
import { Pengeluaran } from './screens/Pengeluaran'
import { Promosi } from './screens/Promosi'
import { GajiKaryawan } from './screens/GajiKaryawan'
import { Pengaturan } from './screens/Pengaturan'
import { Login } from './screens/Login'
import { ClockChip } from './components/ClockChip'
import { Sidebar, type NavId } from './components/Sidebar'
import { type Theme } from './components/ThemeSwitcher'
import { ToastProvider, useToast } from './components/Toast'
import { Icons } from './components/Icons'
import { DEFAULTS, applyAppearance } from './appearance'
import { AuthProvider, useAuth } from './lib/auth'
import { LangProvider, useLang } from './i18n'
import { useAppData } from './lib/useAppData'
import { usePrefs } from './lib/prefs'
import { setEmployeeActive } from './lib/db'
import { supabaseConfigured } from './lib/supabase'
import './App.css'

type Screen =
  | { name: 'landing' }
  | { name: 'absensi' }
  | { name: 'absen'; employeeId: string; tanggal?: string }
  | { name: 'riwayat'; employeeId: string }
  | { name: 'profil' }
  | { name: 'laporan' }
  | { name: 'event-photobooth' }
  | { name: 'event-game' }
  | { name: 'inventaris' }
  | { name: 'pengeluaran' }
  | { name: 'promosi' }
  | { name: 'gaji' }
  | { name: 'pengaturan' }

function loadTheme(): Theme {
  const t = localStorage.getItem('kubik-theme')
  if (
    t === 'pop' || t === 'aurora' || t === 'studio' || t === 'tosca' || t === 'oui' ||
    t === 'galaxy' || t === 'neon' ||
    t === 'popdark' || t === 'studiodark'
  )
    return t
  return 'pop'
}

function screenToNav(name: Screen['name']): NavId {
  if (name === 'absen' || name === 'riwayat') return 'absensi'
  return name as NavId
}

function Inner() {
  const toast = useToast()
  const auth = useAuth()
  const { t } = useLang()
  const { data, loading: dataLoading, setData, reload } = useAppData(
    auth.user?.id ?? null,
    (msg) => toast('warn', msg),
  )
  const [screen, setScreen] = useState<Screen>({ name: 'landing' })
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const prefs = usePrefs()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('kubik-theme', theme)
  }, [theme])

  useEffect(() => {
    applyAppearance(prefs.fontPair, prefs.fontSize)
  }, [prefs.fontPair, prefs.fontSize])

  // Restrict karyawan dari screen yang tidak diizinkan.
  // Pengaturan kini terbuka untuk karyawan (bagian sensitif difilter di dalam layar).
  useEffect(() => {
    if (!auth.profile) return
    if (auth.isAdmin) return
    const forbidden: Screen['name'][] = []
    if (forbidden.includes(screen.name)) {
      setScreen({ name: 'landing' })
    }
  }, [auth.profile, auth.isAdmin, screen.name])

  function navigate(id: NavId) {
    setScreen({ name: id } as Screen)
  }

  if (!supabaseConfigured) return <SupabaseSetupWarning />
  if (auth.loading) return <FullScreenLoading />
  if (!auth.session || !auth.profile) return <Login />
  if (dataLoading || !data) return <FullScreenLoading />

  const isAdmin = auth.isAdmin
  const currentUserId = auth.profile.id

  // Self-service: karyawan hanya membuka absensi miliknya; admin bisa siapa saja.
  function bukaAbsen(employeeId: string) {
    if (!isAdmin && employeeId !== currentUserId) {
      setScreen({ name: 'riwayat', employeeId })
      return
    }
    setScreen({ name: 'absen', employeeId })
  }

  async function nonaktifkanKaryawan(employeeId: string) {
    if (!data) return
    const emp = data.employees.find((e) => e.id === employeeId)
    if (
      !confirm(
        `Nonaktifkan ${emp?.nama ?? 'karyawan'}? Riwayat tetap tersimpan, kartunya disembunyikan dari daftar, dan ia tidak bisa mengisi absen. Bisa diaktifkan kembali kapan saja.`,
      )
    ) {
      return
    }
    try {
      await setEmployeeActive(employeeId, false)
      toast('warn', `${emp?.nama ?? 'Karyawan'} dinonaktifkan`)
      reload()
    } catch (e) {
      toast('warn', e instanceof Error ? e.message : 'Gagal menonaktifkan karyawan')
    }
  }

  async function aktifkanKaryawan(employeeId: string) {
    if (!data) return
    const emp = data.inactiveEmployees.find((e) => e.id === employeeId)
    try {
      await setEmployeeActive(employeeId, true)
      toast('ok', `${emp?.nama ?? 'Karyawan'} diaktifkan kembali`)
      reload()
    } catch (e) {
      toast('warn', e instanceof Error ? e.message : 'Gagal mengaktifkan karyawan')
    }
  }

  function renameKaryawan(employeeId: string) {
    if (!data) return
    // Karyawan hanya boleh mengubah nama akunnya sendiri; admin boleh siapa saja.
    if (!isAdmin && employeeId !== currentUserId) {
      toast('warn', 'Kamu hanya bisa mengubah nama akunmu sendiri.')
      return
    }
    const emp = data.employees.find((e) => e.id === employeeId)
    if (!emp) return
    const nama = prompt('Nama karyawan:', emp.nama)?.trim()
    if (nama == null) return // dibatalkan
    // Admin juga boleh mengatur jabatan (mis. Operator, Kasir) — tampil di slip gaji.
    let jabatan = emp.jabatan
    if (isAdmin) {
      const j = prompt('Jabatan (mis. Operator, Kasir, Admin):', emp.jabatan)
      if (j != null) jabatan = j.trim()
    }
    const namaFinal = nama || emp.nama
    if (namaFinal === emp.nama && jabatan === emp.jabatan) return
    setData({
      ...data,
      employees: data.employees.map((e) =>
        e.id === employeeId ? { ...e, nama: namaFinal, jabatan } : e,
      ),
    })
    toast('ok', 'Data karyawan diperbarui')
  }

  function setujuiAbsen(recordId: string) {
    if (!data) return
    const rec = data.records.find((r) => r.id === recordId)
    if (!rec) return
    const emp = data.employees.find((e) => e.id === rec.employeeId)
    setData({
      ...data,
      records: data.records.map((r) =>
        r.id === recordId ? { ...r, status: 'disetujui' } : r,
      ),
    })
    toast('ok', `Absensi ${emp?.nama ?? 'karyawan'} (${rec.tanggal}) disetujui`)
  }

  function tolakAbsen(recordId: string) {
    if (!data) return
    const rec = data.records.find((r) => r.id === recordId)
    if (!rec) return
    const emp = data.employees.find((e) => e.id === rec.employeeId)
    if (
      !confirm(
        `Tolak & hapus absensi manual ${emp?.nama ?? 'karyawan'} untuk ${rec.tanggal}?`,
      )
    ) {
      return
    }
    setData({
      ...data,
      records: data.records.filter((r) => r.id !== recordId),
    })
    toast('warn', `Absensi ${emp?.nama ?? 'karyawan'} (${rec.tanggal}) ditolak`)
  }

  function infoTambahKaryawan() {
    toast(
      'info',
      'Karyawan baru mendaftar sendiri di halaman login. Setelah itu admin mengatur jabatan & perannya di sini.',
    )
  }

  const meta = {
    title: t(`page.${screen.name}.title`),
    sub: t(`page.${screen.name}.sub`),
  }

  return (
    <>
      <div className="bg-decor">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <span className="blob b4" />
        <span className="blob b5" />
        <span className="blob b6" />
      </div>

      <div className="app-shell">
        <Sidebar
          active={screenToNav(screen.name)}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNavigate={(id) => navigate(id)}
          brandKicker={data.brandKicker ?? DEFAULTS.brandKicker}
          brandName={data.brandName ?? DEFAULTS.brandName}
          role={auth.profile.role}
          userNama={auth.profile.nama}
          userEmail={auth.profile.email}
          onLogout={async () => {
            await auth.signOut()
            toast('info', 'Anda telah keluar')
          }}
        />

        <div className="main">
          <header className="main-topbar">
            <button
              type="button"
              className="menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu"
            >
              <Icons.menu />
            </button>
            <div className="page-meta">
              <h1 className="page-title">{meta.title}</h1>
              <p className="page-sub">{meta.sub}</p>
            </div>
            <div className="topbar-actions">
              <ClockChip />
            </div>
          </header>

          <main className="main-content">
            {screen.name === 'landing' && (
              <Landing
                data={data}
                setData={setData}
                isAdmin={isAdmin}
                onAbsensi={() => setScreen({ name: 'absensi' })}
                onLaporan={() => setScreen({ name: 'laporan' })}
                onInventaris={() => setScreen({ name: 'inventaris' })}
                onPengeluaran={() => setScreen({ name: 'pengeluaran' })}
              />
            )}

            {screen.name === 'absensi' && (
              <Home
                data={data}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                onPickEmployee={(id) => bukaAbsen(id)}
                onLihatRiwayat={(id) =>
                  setScreen({ name: 'riwayat', employeeId: id })
                }
                onRename={(id) => renameKaryawan(id)}
                onHapus={(id) => nonaktifkanKaryawan(id)}
                onAktifkan={(id) => aktifkanKaryawan(id)}
                onTambah={infoTambahKaryawan}
                onSetujuiAbsen={setujuiAbsen}
                onTolakAbsen={tolakAbsen}
              />
            )}

            {screen.name === 'absen' && (
              <Absen
                data={data}
                setData={setData}
                employeeId={screen.employeeId}
                isAdmin={isAdmin}
                initialTanggal={screen.tanggal}
                onBack={() => setScreen({ name: 'absensi' })}
                onLihatRiwayat={() =>
                  setScreen({ name: 'riwayat', employeeId: screen.employeeId })
                }
              />
            )}

            {screen.name === 'riwayat' && (
              <Riwayat
                data={data}
                setData={setData}
                employeeId={screen.employeeId}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                onBack={() => setScreen({ name: 'absensi' })}
              />
            )}

            {screen.name === 'profil' && (
              <ProfilKaryawan
                data={data}
                setData={setData}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
              />
            )}

            {screen.name === 'laporan' && (
              <LaporanIncome
                data={data}
                setData={setData}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
              />
            )}

            {screen.name === 'event-photobooth' && (
              <Event
                data={data}
                setData={setData}
                kategori="photobooth"
              />
            )}

            {screen.name === 'event-game' && (
              <Event
                data={data}
                setData={setData}
                kategori="game"
              />
            )}

            {screen.name === 'inventaris' && (
              /* Semua karyawan boleh edit inventaris & stok (RLS 0006). */
              <Inventaris data={data} setData={setData} reload={reload} canEdit={true} />
            )}

            {screen.name === 'pengeluaran' && (
              <Pengeluaran data={data} setData={setData} />
            )}

            {screen.name === 'promosi' && (
              <Promosi
                data={data}
                setData={setData}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
              />
            )}

            {screen.name === 'gaji' && (
              <GajiKaryawan
                data={data}
                setData={setData}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
              />
            )}

            {screen.name === 'pengaturan' && (
              <Pengaturan
                data={data}
                setData={setData}
                theme={theme}
                onChangeTheme={setTheme}
                isAdmin={isAdmin}
              />
            )}
          </main>
        </div>
      </div>
    </>
  )
}

function FullScreenLoading() {
  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-judul">Memuat sesi…</div>
        <p style={{ color: 'var(--ink-soft)', marginTop: 8 }}>
          Mengecek status login Anda
        </p>
      </div>
    </div>
  )
}

function SupabaseSetupWarning() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">
            <img src={`${import.meta.env.BASE_URL}kubik-logo.png`} alt="Kubik" />
          </div>
          <div>
            <div className="auth-kicker">Kubik Photobox Studio</div>
            <div className="auth-judul">Supabase belum dikonfigurasi</div>
          </div>
        </div>
        <p style={{ color: 'var(--ink-soft)', lineHeight: 1.6, marginTop: 12 }}>
          Tambahkan kredensial Supabase di file <code>.env.local</code>:
        </p>
        <pre className="env-code">
          {`VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx`}
        </pre>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 12 }}>
          Lihat <code>supabase/README.md</code> untuk langkah lengkap setup
          (project, SQL migration, RLS).
        </p>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 10 }}>
          Setelah env terisi, restart <code>npm run dev</code>.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <ToastProvider>
          <Inner />
        </ToastProvider>
      </AuthProvider>
    </LangProvider>
  )
}
