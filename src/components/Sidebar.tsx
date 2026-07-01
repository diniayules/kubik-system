import { useEffect } from 'react'
import { Icons } from './Icons'
import { useLang } from '../i18n'

export type NavId =
  | 'landing'
  | 'absensi'
  | 'profil'
  | 'laporan'
  | 'event-photobooth'
  | 'event-game'
  | 'inventaris'
  | 'pengeluaran'
  | 'promosi'
  | 'gaji'
  | 'pengaturan'

type Role = 'admin' | 'karyawan'

type Item = {
  id: NavId
  label: string
  icon: typeof Icons.home
  group: string
  adminOnly?: boolean
}

const NAV_ITEMS: Item[] = [
  { id: 'landing', label: 'Dashboard', icon: Icons.home, group: 'Utama' },
  { id: 'profil', label: 'Profil Karyawan', icon: Icons.user, group: 'Operasional' },
  { id: 'absensi', label: 'Presensi Karyawan', icon: Icons.clock, group: 'Operasional' },
  { id: 'inventaris', label: 'Inventaris & Stok', icon: Icons.box, group: 'Operasional' },
  // Karyawan boleh lihat menu Promosi — konten difilter per peran + RLS.
  { id: 'promosi', label: 'Papan Promosi', icon: Icons.sun, group: 'Operasional' },
  { id: 'laporan', label: 'Studio', icon: Icons.wallet, group: 'Keuangan' },
  { id: 'pengeluaran', label: 'Pengeluaran', icon: Icons.cart, group: 'Keuangan' },
  // Karyawan boleh lihat gaji — tapi hanya slip miliknya sendiri (difilter di layar).
  { id: 'gaji', label: 'Gaji Karyawan', icon: Icons.user, group: 'Keuangan' },
  // Event: tiap kategori jadi menu sendiri (halaman penuh, tanpa sub-tab).
  { id: 'event-photobooth', label: 'Photobooth', icon: Icons.camera, group: 'Event' },
  { id: 'event-game', label: 'Photo Game', icon: Icons.camera, group: 'Event' },
  // Karyawan juga boleh buka Pengaturan — bagian Teks & Branding tetap admin-only (difilter di layar).
  { id: 'pengaturan', label: 'Pengaturan', icon: Icons.lock, group: 'Sistem' },
]

type Props = {
  active: NavId
  open: boolean
  onClose: () => void
  onNavigate: (id: NavId) => void
  brandKicker: string
  brandName: string
  role: Role
  userNama: string
  userEmail: string
  onLogout: () => void
}

export function Sidebar({
  active,
  open,
  onClose,
  onNavigate,
  brandKicker,
  brandName,
  role,
  userNama,
  userEmail,
  onLogout,
}: Props) {
  const { t } = useLang()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const items = NAV_ITEMS.filter((i) => !(i.adminOnly && role !== 'admin'))
  const groups: { name: string; items: Item[] }[] = []
  for (const item of items) {
    let g = groups.find((x) => x.name === item.group)
    if (!g) {
      g = { name: item.group, items: [] }
      groups.push(g)
    }
    g.items.push(item)
  }

  const inisial = userNama
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={'sidebar' + (open ? ' is-open' : '')}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <img src={`${import.meta.env.BASE_URL}kubik-logo.png`} alt="Kubik" />
          </div>
          <div className="sidebar-brand-text">
            <span className="kicker">{brandKicker}</span>
            <span className="name">{brandName}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {groups.map((g) => (
            <div key={g.name} className="sidebar-group">
              <div className="sidebar-group-head">{t('side.group.' + g.name)}</div>
              {g.items.map((item) => {
                const Icon = item.icon
                const isActive = item.id === active
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={'sidebar-link' + (isActive ? ' is-active' : '')}
                    onClick={() => {
                      onNavigate(item.id)
                      onClose()
                    }}
                  >
                    <span className="sidebar-link-ikon">
                      <Icon />
                    </span>
                    <span className="sidebar-link-label">{t('side.' + item.id)}</span>
                    {isActive && (
                      <span className="sidebar-link-arrow">
                        <Icons.chevron />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-account">
          <div className="sidebar-account-avatar">{inisial || '👤'}</div>
          <div className="sidebar-account-info">
            <div className="sidebar-account-nama">{userNama}</div>
            <div className="sidebar-account-meta">
              <span className={`role-pill role-${role}`}>
                {role === 'admin' ? t('side.role.admin') : t('side.role.karyawan')}
              </span>
            </div>
            <div className="sidebar-account-email" title={userEmail}>
              {userEmail}
            </div>
          </div>
          <button
            type="button"
            className="sidebar-logout"
            onClick={onLogout}
            title={t('nav.logout')}
            aria-label={t('nav.logout')}
          >
            <Icons.logout />
          </button>
        </div>
      </aside>
    </>
  )
}
