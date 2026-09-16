import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { AppData } from '../types'
import { Home } from '../screens/Home'
import { PREVIEW_DATA, PREVIEW_IDS } from './data'
import { PreviewShell, useSudutPandang } from './shell'
import '../index.css'
import '../App.css'

function Preview() {
  const [data, setData] = useState<AppData>(PREVIEW_DATA)
  const { owner, tombol } = useSudutPandang()
  return (
    <PreviewShell bar={tombol}>
      <Home
        data={data}
        setData={setData}
        isAdmin={owner}
        currentUserId={owner ? PREVIEW_IDS.OWNER : PREVIEW_IDS.MANAJER}
        onPickEmployee={() => {}}
        onLihatRiwayat={() => {}}
        onRename={() => {}}
        onHapus={() => {}}
        onAktifkan={() => {}}
        onTambah={() => {}}
        onSetujuiAbsen={() => {}}
        onTolakAbsen={() => {}}
      />
    </PreviewShell>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
