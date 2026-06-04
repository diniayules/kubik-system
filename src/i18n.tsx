import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'id' | 'en'

const STORAGE_KEY = 'kubik-lang'

type Dict = Record<string, string>

const ID: Dict = {
  // Sidebar / nav
  'nav.dashboard': 'Dashboard',
  'nav.absensi': 'Absensi',
  'nav.laporan': 'Laporan Income',
  'nav.inventaris': 'Inventaris',
  'nav.pengeluaran': 'Pengeluaran',
  'nav.pengaturan': 'Pengaturan',
  'nav.logout': 'Keluar',
  // Sidebar groups
  'side.group.Utama': 'Utama',
  'side.group.Operasional': 'Operasional',
  'side.group.Keuangan': 'Studio',
  'side.group.Event': 'Event',
  'side.group.Sistem': 'Sistem',
  // Sidebar items
  'side.landing': 'Dashboard',
  'side.absensi': 'Presensi Karyawan',
  'side.profil': 'Profil Karyawan',
  'side.inventaris': 'Inventaris & Stok',
  'side.laporan': 'Pemasukan',
  'side.event-photobooth': 'Photobooth',
  'side.event-game': 'Photo Game',
  'side.pengeluaran': 'Pengeluaran',
  'side.gaji': 'Gaji Karyawan',
  'side.pengaturan': 'Pengaturan',
  // Sidebar account
  'side.role.admin': '🛡️ Admin',
  'side.role.karyawan': '👤 Karyawan',
  // Page meta
  'page.landing.title': 'Dashboard',
  'page.landing.sub': 'Ringkasan operasional studio hari ini',
  'page.absensi.title': 'Presensi Karyawan',
  'page.absensi.sub': 'Catat clock-in & clock-out per karyawan',
  'page.absen.title': 'Detail Absensi',
  'page.absen.sub': 'Catat event harian & ringkasan jam kerja',
  'page.riwayat.title': 'Riwayat Absensi',
  'page.riwayat.sub': 'Histori catatan absen per karyawan',
  'page.profil.title': 'Profil Karyawan',
  'page.profil.sub': 'Ringkasan kehadiran, jam kerja & penjualan tiap karyawan',
  'page.laporan.title': 'Laporan Pemasukan Harian',
  'page.laporan.sub': 'Penjualan Photobooth, Photobox, Photo Game & upgrade',
  'page.event-photobooth.title': 'Event · Photobooth',
  'page.event-photobooth.sub': 'Laporan Photobooth — sewa per jam & per voucher',
  'page.event-game.title': 'Event · Photo Game',
  'page.event-game.sub': 'Laporan Photo Game — sewa per jam & per voucher',
  'page.inventaris.title': 'Inventaris & Stok',
  'page.inventaris.sub': 'Kertas, tinta, amplop, dan catatan salah cetak',
  'page.pengeluaran.title': 'Pengeluaran Studio',
  'page.pengeluaran.sub': 'Catat belanja & biaya operasional',
  'page.gaji.title': 'Gaji Karyawan',
  'page.gaji.sub': 'Slip gaji bulanan: gaji pokok, bonus penjualan, lembur & potongan',
  'page.pengaturan.title': 'Pengaturan',
  'page.pengaturan.sub': 'Atur tema, font, ukuran teks, dan teks tampilan',
  // Settings - language
  'set.language.title': 'Bahasa',
  'set.language.sub': 'Pilih bahasa tampilan aplikasi.',
  'set.language.label': 'Bahasa aplikasi',
  'set.language.id': 'Indonesia',
  'set.language.en': 'Inggris',
  'set.language.changed': 'Bahasa diubah ke Indonesia',
}

const EN: Dict = {
  // Sidebar / nav
  'nav.dashboard': 'Dashboard',
  'nav.absensi': 'Attendance',
  'nav.laporan': 'Income Report',
  'nav.inventaris': 'Inventory',
  'nav.pengeluaran': 'Expenses',
  'nav.pengaturan': 'Settings',
  'nav.logout': 'Log out',
  // Sidebar groups
  'side.group.Utama': 'Main',
  'side.group.Operasional': 'Operations',
  'side.group.Keuangan': 'Studio',
  'side.group.Event': 'Event',
  'side.group.Sistem': 'System',
  // Sidebar items
  'side.landing': 'Dashboard',
  'side.absensi': 'Employee Attendance',
  'side.profil': 'Employee Profile',
  'side.inventaris': 'Inventory & Stock',
  'side.laporan': 'Income',
  'side.event-photobooth': 'Photobooth',
  'side.event-game': 'Photo Game',
  'side.pengeluaran': 'Expenses',
  'side.gaji': 'Employee Salary',
  'side.pengaturan': 'Settings',
  // Sidebar account
  'side.role.admin': '🛡️ Admin',
  'side.role.karyawan': '👤 Employee',
  // Page meta
  'page.landing.title': 'Dashboard',
  'page.landing.sub': "Today's studio operations summary",
  'page.absensi.title': 'Employee Attendance',
  'page.absensi.sub': 'Record clock-in & clock-out per employee',
  'page.absen.title': 'Attendance Detail',
  'page.absen.sub': 'Record daily events & work-hour summary',
  'page.riwayat.title': 'Attendance History',
  'page.riwayat.sub': 'Attendance record history per employee',
  'page.profil.title': 'Employee Profile',
  'page.profil.sub': 'Attendance, work hours & sales summary per employee',
  'page.laporan.title': 'Daily Income Report',
  'page.laporan.sub': 'Photobooth, Photobox, Photo Game sales & upgrades',
  'page.event-photobooth.title': 'Event · Photobooth',
  'page.event-photobooth.sub': 'Photobooth report — hourly & voucher rental',
  'page.event-game.title': 'Event · Photo Game',
  'page.event-game.sub': 'Photo Game report — hourly & voucher rental',
  'page.inventaris.title': 'Inventory & Stock',
  'page.inventaris.sub': 'Paper, ink, envelopes, and misprint notes',
  'page.pengeluaran.title': 'Studio Expenses',
  'page.pengeluaran.sub': 'Record purchases & operational costs',
  'page.gaji.title': 'Employee Salary',
  'page.gaji.sub': 'Monthly payslip: base salary, sales bonus, overtime & deductions',
  'page.pengaturan.title': 'Settings',
  'page.pengaturan.sub': 'Set theme, font, text size, and display text',
  // Settings - language
  'set.language.title': 'Language',
  'set.language.sub': 'Choose the app display language.',
  'set.language.label': 'App language',
  'set.language.id': 'Indonesian',
  'set.language.en': 'English',
  'set.language.changed': 'Language changed to English',
}

const DICTS: Record<Lang, Dict> = { id: ID, en: EN }

function loadLang(): Lang {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'en' || v === 'id' ? v : 'id'
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string }

const LangContext = createContext<Ctx | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => loadLang())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const t = (key: string) => DICTS[lang][key] ?? key
  const setLang = (l: Lang) => setLangState(l)

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang(): Ctx {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within LangProvider')
  return ctx
}
