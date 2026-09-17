// Preview layar Jadwal — dipakai melihat baris giliran LIVE di bawah roster
// dengan mata sendiri. Roster sebulan penuh dirakit DI SINI, bukan di
// `data.ts`, supaya preview Dashboard Manajemen (yang menilai cakupan shift)
// tidak ikut berubah gara-gara layar ini.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { AbsenHari, AppData, JadwalShift, SosmedHarian } from '../types'
import { Jadwal } from '../screens/Jadwal'
import { PREVIEW_BULAN, PREVIEW_DATA, PREVIEW_IDS } from './data'
import { PreviewShell, useSudutPandang } from './shell'
import '../index.css'
import '../App.css'

const M = PREVIEW_BULAN
const tgl = (d: number) => `${M}-${String(d).padStart(2, '0')}`
const { RIZKY, AYU } = PREVIEW_IDS

// Roster berselang-seling sebulan penuh + beberapa hari sengaja dibiarkan
// bolong, supaya sel Live "belum ada yang bertugas" ikut terlihat.
const roster: JadwalShift[] = []
for (let d = 1; d <= 30; d += 1) {
  if (d === 13 || d === 20) continue // studio tutup
  roster.push({ tanggal: tgl(d), employeeId: RIZKY, shift: d % 2 ? 'pagi' : 'sore' })
  roster.push({ tanggal: tgl(d), employeeId: AYU, shift: d % 2 ? 'sore' : 'pagi' })
}

// Rencana live: minggu 1 & 2 sudah dijadwalkan, minggu 3 belum sama sekali.
const rencanaLive: Record<string, string> = {
  [tgl(3)]: RIZKY,
  [tgl(9)]: AYU,
  [tgl(24)]: RIZKY,
}
for (const j of roster) {
  if (rencanaLive[j.tanggal] === j.employeeId) j.live = true
}

// Realisasi: minggu 1 jadi, minggu 2 luput (lewat tanpa live).
const sosmed: SosmedHarian[] = [
  {
    tanggal: tgl(3),
    posting: false, story: true, repost: false, engagement: false,
    live: true, olehList: [RIZKY],
  },
]

// Presensi: dua operator masuk bergantian sampai hari ini. Tanpa ini baris
// Story tidak pernah menyalakan "terlewat" — kewajiban story hanya ditagih
// pada hari orang itu BENAR-BENAR masuk kerja (lihat `bonusSosmed.ts`).
const HARI_INI_TGL = Number(new Date().toISOString().slice(8, 10))
const presensi: AbsenHari[] = []
for (const j of roster) {
  if (Number(j.tanggal.slice(8, 10)) > HARI_INI_TGL) continue
  presensi.push({
    id: `${j.tanggal}-${j.employeeId}`,
    employeeId: j.employeeId,
    tanggal: j.tanggal,
    shift: j.shift,
    events: [],
  })
}

const DATA: AppData = {
  ...PREVIEW_DATA,
  jadwalShift: roster,
  records: presensi,
  sosmedHarian: [...(PREVIEW_DATA.sosmedHarian ?? []), ...sosmed],
}

function Preview() {
  const [data, setData] = useState<AppData>(DATA)
  // Di layar ini sudut pandang non-owner berarti OPERATOR, bukan manajer:
  // `bisaUbah` mati DAN `currentUserId` jadi Rizky, jadi yang terlihat adalah
  // hak melapor — bukan hak menyetujui.
  const { owner, tombol } = useSudutPandang('👤 Operator (Rizky)')
  return (
    <PreviewShell bar={tombol}>
      <Jadwal
        data={data}
        setData={setData}
        bisaUbah={owner}
        currentUserId={owner ? PREVIEW_IDS.OWNER : RIZKY}
      />
    </PreviewShell>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
