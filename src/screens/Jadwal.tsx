// =============================================================
// Jadwal.tsx · Roster shift (jadwal RENCANA).
//
// Layar ini menjawab pertanyaan yang selama ini tidak bisa dijawab aplikasi:
// "siapa yang SEHARUSNYA masuk besok?". Tabel absensi hanya mencatat realisasi
// setelah kejadian; di sini shift ditetapkan lebih dulu.
//
// Bentuknya grid tanggal × karyawan. Satu klik pada sel memutar pilihan shift
// (— → pagi → sore → penuh → cuti → libur → —) supaya menyusun sebulan penuh
// tidak perlu membuka modal 60 kali.
//
// Menyusun jadwal adalah wewenang pengelola (owner & manajer); karyawan hanya
// membaca. Dikuatkan di server lewat RLS migration 0044.
//
// Selain rencana, grid ini juga menampilkan CUTI yang sudah di-ACC owner. Cuti
// diajukan karyawan dari laman Presensi (entri manual → status 'menunggu') dan
// baru resmi setelah disetujui; begitu resmi ia muncul sendiri di sel tanggal
// yang bersangkutan — tidak perlu disalin ulang ke roster. Cuti resmi menimpa
// tampilan rencana (realisasi mengalahkan rencana) dan selnya dikunci supaya
// keputusan owner tidak tertimpa satu klik.
// =============================================================
import { useMemo, useState } from 'react'
import type { AbsenHari, AppData, DayType, JadwalShift } from '../types'
import { SHIFT_IKON, SHIFT_LABEL } from '../attendance'
import { todayKey } from '../storage'
import { cakupanShift, hariDalamBulan } from '../manajemen'
import { isPengelola } from '../lib/roles'
import { Avatar, colorIndexForName } from '../components/Avatar'

type Props = {
  data: AppData
  setData: (d: AppData) => void
  /** Hanya pengelola yang boleh mengubah; karyawan melihat saja. */
  bisaUbah: boolean
}

/** Urutan putar saat sel diklik. `null` = kosongkan. */
const SIKLUS: (DayType | null)[] = [
  'pagi',
  'sore',
  'full',
  'cuti',
  'libur',
  null,
]

const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

function labelBulan(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  })
}

function geser(monthKey: string, arah: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1 + arah, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Tooltip sel cuti resmi — sekalian menyebut rencana yang ditimpanya. */
function judulCuti(rencana: DayType | undefined): string {
  const dasar = 'Cuti disetujui owner — tercatat otomatis dari presensi'
  return rencana && rencana !== 'cuti'
    ? `${dasar} (rencana semula: ${SHIFT_LABEL[rencana]})`
    : dasar
}

export function Jadwal({ data, setData, bisaUbah }: Props) {
  const hariIni = todayKey()
  const [monthKey, setMonthKey] = useState(() => hariIni.slice(0, 7))

  // Manajer & owner tidak ikut roster operasional — merekalah yang menyusunnya.
  const staf = useMemo(
    () => data.employees.filter((e) => !isPengelola(e.role)),
    [data.employees],
  )

  const tanggalList = useMemo(() => {
    const total = hariDalamBulan(monthKey)
    return Array.from({ length: total }, (_, i) => {
      const hari = i + 1
      const tanggal = `${monthKey}-${String(hari).padStart(2, '0')}`
      const [y, m] = monthKey.split('-').map(Number)
      return {
        tanggal,
        hari,
        namaHari: HARI_PENDEK[new Date(y, m - 1, hari).getDay()],
        akhirPekan: [0, 6].includes(new Date(y, m - 1, hari).getDay()),
        isHariIni: tanggal === hariIni,
      }
    })
  }, [monthKey, hariIni])

  const jadwalMap = useMemo(() => {
    const m = new Map<string, JadwalShift>()
    for (const j of data.jadwalShift ?? []) m.set(`${j.tanggal}::${j.employeeId}`, j)
    return m
  }, [data.jadwalShift])

  // Cuti yang sudah disetujui owner (lihat komentar kepala berkas). Entri yang
  // masih 'menunggu' sengaja tidak ikut — pengajuan belum tentu jadi.
  const cutiMap = useMemo(() => {
    const m = new Map<string, AbsenHari>()
    for (const r of data.records) {
      if (r.shift !== 'cuti') continue
      if (r.status === 'menunggu') continue
      if (!r.tanggal.startsWith(monthKey)) continue
      m.set(`${r.tanggal}::${r.employeeId}`, r)
    }
    return m
  }, [data.records, monthKey])

  const cakupan = useMemo(
    () => cakupanShift(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const perHari = useMemo(
    () => new Map(cakupan.perHari.map((h) => [h.tanggal, h])),
    [cakupan],
  )

  function setSel(tanggal: string, employeeId: string, shift: DayType | null) {
    const sisa = (data.jadwalShift ?? []).filter(
      (j) => !(j.tanggal === tanggal && j.employeeId === employeeId),
    )
    setData({
      ...data,
      jadwalShift: shift ? [...sisa, { tanggal, employeeId, shift }] : sisa,
    })
  }

  function putar(tanggal: string, employeeId: string) {
    if (!bisaUbah) return
    const kini = jadwalMap.get(`${tanggal}::${employeeId}`)?.shift ?? null
    const idx = SIKLUS.indexOf(kini)
    setSel(tanggal, employeeId, SIKLUS[(idx + 1) % SIKLUS.length])
  }

  /** Hapus seluruh baris jadwal di bulan yang sedang dilihat. */
  function kosongkanBulan() {
    if (!confirm(`Kosongkan seluruh jadwal ${labelBulan(monthKey)}?`)) return
    setData({
      ...data,
      jadwalShift: (data.jadwalShift ?? []).filter(
        (j) => !j.tanggal.startsWith(monthKey),
      ),
    })
  }

  return (
    <>
      <section className="jdw-head">
        <div>
          <span className="jdw-kicker">Operasional · Roster</span>
          <h2>Jadwal Shift</h2>
          <p>
            {cakupan.hariTercover} dari {cakupan.hariDinilai} hari berjalan sudah
            terisi penuh
            {cakupan.bolongMendatang.length > 0 && (
              <> · <b>{cakupan.bolongMendatang.length} hari ke depan masih bolong</b></>
            )}
            {cutiMap.size > 0 && (
              <> · {cutiMap.size} cuti disetujui tampil otomatis</>
            )}
          </p>
        </div>
        <div className="jdw-nav">
          <button type="button" onClick={() => setMonthKey(geser(monthKey, -1))}>
            ‹
          </button>
          <span>{labelBulan(monthKey)}</span>
          <button type="button" onClick={() => setMonthKey(geser(monthKey, 1))}>
            ›
          </button>
        </div>
      </section>

      {cakupan.bolongMendatang.length > 0 && (
        <section className="jdw-alert">
          <b>Belum ada operator:</b>
          <div className="jdw-alert-list">
            {cakupan.bolongMendatang.map((h) => (
              <span key={h.tanggal}>
                {new Date(`${h.tanggal}T00:00:00`).toLocaleDateString('id-ID', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
                <em>
                  {h.belumDisusun
                    ? 'belum disusun'
                    : `slot ${h.kosong.join(' & ')} kosong`}
                </em>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="jdw-panel">
        {staf.length === 0 ? (
          <p className="jdw-empty">Belum ada karyawan aktif untuk dijadwalkan.</p>
        ) : (
          <div className="jdw-scroll">
            <table className="jdw-tabel">
              <thead>
                <tr>
                  <th className="jdw-sticky">Karyawan</th>
                  {tanggalList.map((t) => (
                    <th
                      key={t.tanggal}
                      className={
                        (t.akhirPekan ? 'is-pekan' : '') +
                        (t.isHariIni ? ' is-kini' : '') +
                        (perHari.get(t.tanggal)?.tercover === false
                          ? ' is-bolong'
                          : '')
                      }
                      title={
                        perHari.get(t.tanggal)?.tercover === false
                          ? 'Slot shift belum terisi penuh'
                          : undefined
                      }
                    >
                      <em>{t.namaHari}</em>
                      {t.hari}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staf.map((e) => (
                  <tr key={e.id}>
                    <th className="jdw-sticky">
                      <span className="jdw-orang">
                        <Avatar
                          name={e.nama}
                          foto={e.foto}
                          colorIndex={colorIndexForName(e.nama)}
                          size="sm"
                        />
                        <span>{e.nama}</span>
                      </span>
                    </th>
                    {tanggalList.map((t) => {
                      const kunci = `${t.tanggal}::${e.id}`
                      const rencana = jadwalMap.get(kunci)?.shift
                      const cutiACC = cutiMap.get(kunci)
                      const shift: DayType | undefined = cutiACC
                        ? 'cuti'
                        : rencana
                      return (
                        <td key={t.tanggal} className={t.akhirPekan ? 'is-pekan' : ''}>
                          <button
                            type="button"
                            className={`jdw-sel${shift ? ` is-${shift}` : ''}${
                              cutiACC ? ' is-acc' : ''
                            }`}
                            disabled={!bisaUbah || !!cutiACC}
                            onClick={() => putar(t.tanggal, e.id)}
                            title={
                              cutiACC
                                ? judulCuti(rencana)
                                : shift
                                  ? `${SHIFT_LABEL[shift]} — klik untuk mengganti`
                                  : 'Kosong — klik untuk menjadwalkan'
                            }
                          >
                            {shift ? SHIFT_IKON[shift] : ''}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="jdw-kaki">
          <div className="jdw-legend">
            {(['pagi', 'sore', 'full', 'cuti', 'libur'] as DayType[]).map((s) => (
              <span key={s}>
                <i className={`jdw-sel is-${s}`}>{SHIFT_IKON[s]}</i>
                {SHIFT_LABEL[s]}
              </span>
            ))}
            <span>
              <i className="jdw-sel is-cuti is-acc">{SHIFT_IKON.cuti}</i>
              Cuti disetujui (otomatis)
            </span>
          </div>
          {bisaUbah && (
            <button type="button" className="jdw-hapus" onClick={kosongkanBulan}>
              Kosongkan bulan ini
            </button>
          )}
        </div>
      </section>
    </>
  )
}
