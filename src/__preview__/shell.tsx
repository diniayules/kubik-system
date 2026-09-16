import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Kerangka minimum yang meniru bingkai App.tsx.
 *
 * `.app-shell` adalah grid `272px 1fr`; tanpa elemen di kolom pertama,
 * seluruh isi terhimpit ke 272px dan setiap panel terlihat rusak padahal
 * tidak. `<aside />` kosong itu yang menahan kolom sidebar.
 */
export function PreviewShell({
  children,
  bar,
}: {
  children: ReactNode
  bar?: ReactNode
}) {
  document.documentElement.dataset.theme = 'pop'
  return (
    <div className="app-shell">
      <aside />
      <div className="main">
        <main className="main-content">
          {bar && <div style={{ padding: '12px 0' }}>{bar}</div>}
          {children}
        </main>
      </div>
    </div>
  )
}

/** Tombol penukar sudut pandang Owner ↔ Manajer. */
export function useSudutPandang() {
  const [owner, setOwner] = useState(true)
  const tombol = (
    <button
      type="button"
      className="mgr-aksi-btn is-utama"
      onClick={() => setOwner((v) => !v)}
    >
      Lihat sebagai: {owner ? '👑 Owner' : '🛡️ Manajer'} (klik untuk tukar)
    </button>
  )
  return { owner, tombol }
}
