import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { AppData } from '../types'
import { Manajemen } from '../screens/Manajemen'
import { PREVIEW_DATA, PREVIEW_IDS } from './data'
import { PreviewShell, useSudutPandang } from './shell'
import '../index.css'
import '../App.css'

function Preview() {
  const [data, setData] = useState<AppData>(PREVIEW_DATA)
  const { owner, tombol } = useSudutPandang()
  return (
    <PreviewShell bar={tombol}>
      <Manajemen
        data={data}
        setData={setData}
        isOwner={owner}
        meId={owner ? PREVIEW_IDS.OWNER : PREVIEW_IDS.MANAJER}
        onLihatAbsensi={() => {}}
        onLihatJadwal={() => {}}
        onLihatLeads={() => {}}
        onLihatInventaris={() => {}}
        onLihatPromosi={() => {}}
        onLihatLaporan={() => {}}
      />
    </PreviewShell>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
