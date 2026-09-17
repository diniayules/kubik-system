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
// Di bawah roster ada baris LIVE: giliran siaran langsung (target 1x seminggu,
// bagian dari bonus gaji pokok operator — lihat `bonusSosmed.ts`). Pola yang
// sama berlaku di sana: sel bergaris = dijadwalkan, sel terisi = live-nya
// benar-benar terjadi (dibaca dari `sosmed_harian.live`, dicentang pengelola di
// Dashboard Manajemen). Live hanya bisa dijadwalkan pada orang yang memang
// punya shift hari itu — yang siaran adalah yang sedang di studio.
//
// Selain rencana, grid ini juga menampilkan CUTI yang sudah di-ACC owner. Cuti
// diajukan karyawan dari laman Presensi (entri manual → status 'menunggu') dan
// baru resmi setelah disetujui; begitu resmi ia muncul sendiri di sel tanggal
// yang bersangkutan — tidak perlu disalin ulang ke roster. Cuti resmi menimpa
// tampilan rencana (realisasi mengalahkan rencana) dan selnya dikunci supaya
// keputusan owner tidak tertimpa satu klik.
// =============================================================
import { useMemo, useState } from 'react'
import type {
  AbsenHari,
  AppData,
  DayType,
  JadwalShift,
  KlaimJenis,
  KlaimSosmed,
  KlaimStatus,
} from '../types'
import { SHIFT_IKON, SHIFT_LABEL } from '../attendance'
import { todayKey } from '../storage'
import { cakupanShift, geserHari, hariDalamBulan, seninMinggu } from '../manajemen'
import { TARGET_LIVE_SEMINGGU, mingguDinilai } from '../bonusSosmed'
import { isPengelola } from '../lib/roles'
import { Avatar, colorIndexForName } from '../components/Avatar'

type Props = {
  data: AppData
  setData: (d: AppData) => void
  /**
   * Pengelola: boleh menyusun roster DAN menyetujui laporan tugas sosmed.
   * Karyawan: roster baca-saja, tapi tetap boleh melapor di barisnya sendiri.
   */
  bisaUbah: boolean
  /** Dipakai membatasi laporan tugas ke baris milik yang sedang login. */
  currentUserId: string
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

/** Shift yang orangnya benar-benar ada di studio — hanya ini yang bisa live. */
const SHIFT_DI_STUDIO: DayType[] = ['pagi', 'sore', 'full']

/** Shift yang BUKAN hari kerja berbayar — disalin dari `gaji.ts`/`bonusSosmed.ts`. */
const SHIFT_BUKAN_KERJA: DayType[] = ['pantau', 'cuti', 'libur', 'bersih']

/** Tugas sosmed yang dilaporkan per hari, urut tampil di bawah roster. */
const TUGAS: { jenis: KlaimJenis; label: string }[] = [
  { jenis: 'story', label: 'Story konten' },
  { jenis: 'live', label: 'Live' },
]

/** "2026-09-01" → "1 Sep". */
function tglPendek(tanggal: string): string {
  return new Date(`${tanggal}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  })
}

/** Inisial maksimal 2 huruf, untuk sel Live yang sempit. */
function inisial(nama: string): string {
  return nama
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

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

export function Jadwal({ data, setData, bisaUbah, currentUserId }: Props) {
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
    const lama = jadwalMap.get(`${tanggal}::${employeeId}`)
    const sisa = (data.jadwalShift ?? []).filter(
      (j) => !(j.tanggal === tanggal && j.employeeId === employeeId),
    )
    // Rencana live ikut kalau orangnya MASIH di studio (pagi ↔ sore ↔ penuh
    // cuma menggeser jam). Begitu selnya jadi cuti/libur/kosong, rencana
    // live-nya gugur sendiri — tidak ada siaran tanpa orang di tempat.
    const live = !!lama?.live && !!shift && SHIFT_DI_STUDIO.includes(shift)
    setData({
      ...data,
      jadwalShift: shift
        ? [...sisa, { tanggal, employeeId, shift, live }]
        : sisa,
    })
  }

  function putar(tanggal: string, employeeId: string) {
    if (!bisaUbah) return
    const kini = jadwalMap.get(`${tanggal}::${employeeId}`)?.shift ?? null
    const idx = SIKLUS.indexOf(kini)
    setSel(tanggal, employeeId, SIKLUS[(idx + 1) % SIKLUS.length])
  }

  // --- Tugas sosial media: laporan operator + persetujuan pengelola ---

  /** Kunci klaim: satu laporan per (tanggal, orang, jenis). */
  const kKlaim = (tanggal: string, empId: string, jenis: KlaimJenis) =>
    `${tanggal}::${empId}::${jenis}`

  const klaimMap = useMemo(() => {
    const m = new Map<string, KlaimSosmed>()
    for (const k of data.klaimSosmed ?? []) {
      if (!k.tanggal.startsWith(monthKey)) continue
      m.set(kKlaim(k.tanggal, k.employeeId, k.jenis), k)
    }
    return m
  }, [data.klaimSosmed, monthKey])

  /**
   * Hari yang benar-benar DIJALANI tiap orang (dari presensi, bukan roster).
   * Dipakai menandai hari kerja yang lewat tanpa story — dan aturannya disalin
   * persis dari `bonusSosmed.ts` supaya papan ini tidak pernah menyalakan
   * merah untuk hari yang hitungan gajinya sendiri tidak menagih apa pun.
   */
  const kerjaSet = useMemo(() => {
    const set = new Set<string>()
    for (const r of data.records) {
      if (!r.tanggal.startsWith(monthKey)) continue
      if (SHIFT_BUKAN_KERJA.includes(r.shift)) continue
      set.add(`${r.tanggal}::${r.employeeId}`)
    }
    return set
  }, [data.records, monthKey])

  /** Tanggal → karyawan yang DIJADWALKAN live (rencana, dari roster). */
  const liveRencana = useMemo(() => {
    const m = new Map<string, string>()
    for (const j of data.jadwalShift ?? []) {
      if (j.live && j.tanggal.startsWith(monthKey)) m.set(j.tanggal, j.employeeId)
    }
    return m
  }, [data.jadwalShift, monthKey])

  /**
   * Ubah satu laporan. `null` = cabut.
   *
   * Sisi server tetap yang menentukan (trigger `protect_klaim_sosmed`): apa pun
   * yang dikirim operator dipaksa jadi 'menunggu' atas namanya sendiri. Fungsi
   * ini hanya membuat layar setuju dengan aturan itu sebelum ditolak diam-diam.
   */
  function ubahKlaim(
    tanggal: string,
    empId: string,
    jenis: KlaimJenis,
    status: KlaimStatus | null,
  ) {
    const sisa = (data.klaimSosmed ?? []).filter(
      (k) =>
        !(k.tanggal === tanggal && k.employeeId === empId && k.jenis === jenis),
    )
    setData({
      ...data,
      klaimSosmed: status
        ? [...sisa, { tanggal, employeeId: empId, jenis, status }]
        : sisa,
    })
  }

  /**
   * Satu klik memutar status, dan urutannya BERBEDA menurut siapa yang menekan:
   *   pengelola — kosong → disetujui → kosong, dan 'menunggu' → disetujui.
   *               Inilah tombol ACC-nya; ia juga boleh mencatat langsung untuk
   *               hari yang operatornya lupa melapor.
   *   operator  — kosong → menunggu → kosong (mencabut laporannya sendiri).
   *               'disetujui' tidak bisa ia sentuh lagi; kalau bisa, ia tinggal
   *               menunggu ACC lalu mengganti isinya.
   */
  function putarKlaim(tanggal: string, empId: string, jenis: KlaimJenis) {
    const kini = klaimMap.get(kKlaim(tanggal, empId, jenis))?.status ?? null
    if (bisaUbah) {
      ubahKlaim(tanggal, empId, jenis, kini === 'disetujui' ? null : 'disetujui')
      return
    }
    if (empId !== currentUserId || kini === 'disetujui') return
    ubahKlaim(tanggal, empId, jenis, kini === 'menunggu' ? null : 'menunggu')
  }

  /** Berapa laporan yang masih menunggu diperiksa bulan ini. */
  const antreanKlaim = useMemo(
    () =>
      (data.klaimSosmed ?? []).filter(
        (k) => k.status === 'menunggu' && k.tanggal.startsWith(monthKey),
      ).length,
    [data.klaimSosmed, monthKey],
  )

  /**
   * Konten yang tayang per tanggal — BACA SAJA di layar ini.
   *
   * Satuan konten adalah kartu Papan Promosi, bukan tanggal, jadi papan ini
   * tidak boleh jadi jalur tulis kedua: centangnya ada di kartunya sendiri.
   * Yang ditampilkan di sini cuma hasilnya, supaya satu layar bisa menjawab
   * "bulan ini targetku sudah sampai mana".
   *   kartu tahap 'selesai'            → sudah di-ACC pengelola (dihitung bonus)
   *   centang tahap 'tayang' oleh PIC  → klaim, belum ditutup pengelola
   */
  const kontenPerTanggal = useMemo(() => {
    const m = new Map<string, { pic?: string; disetujui: boolean }>()
    for (const p of data.promoPrograms) {
      if (p.jenis !== 'konten') continue
      if (p.tahap === 'selesai' && p.selesaiPada?.startsWith(monthKey)) {
        m.set(p.selesaiPada, { pic: p.pic, disetujui: true })
        continue
      }
      const tayang = p.tahapan?.find((t) => t.kunci === 'tayang')
      if (tayang?.selesaiPada?.startsWith(monthKey) && !m.has(tayang.selesaiPada)) {
        m.set(tayang.selesaiPada, { pic: p.pic, disetujui: false })
      }
    }
    return m
  }, [data.promoPrograms, monthKey])

  /**
   * Status live tiap minggu, PER ORANG. Inilah alasan panel ini ada: pada hari
   * Senin, minggu yang masih kosong harus terlihat SEBELUM minggunya habis —
   * bukan ketahuan saat bulan sudah tutup.
   *
   * Definisi minggunya dipinjam dari `bonusSosmed.ts` supaya papan ini dan
   * hitungan gajinya tidak pernah memotong minggu di tempat berbeda.
   */
  const mingguPerOrang = useMemo(() => {
    const semua = mingguDinilai(monthKey)
    return staf.map((e) => ({
      emp: e,
      minggu: semua.map((senin) => {
        const akhir = geserHari(senin, 6)
        const dalam = (t: string) => t >= senin && t <= akhir
        const jadi = (data.klaimSosmed ?? []).filter(
          (k) =>
            k.employeeId === e.id &&
            k.jenis === 'live' &&
            k.status === 'disetujui' &&
            dalam(k.tanggal),
        ).length
        const rencana = (data.jadwalShift ?? []).some(
          (j) => j.live && j.employeeId === e.id && dalam(j.tanggal),
        )
        return {
          senin,
          akhir,
          rencana,
          cukup: jadi >= TARGET_LIVE_SEMINGGU,
          lewat: akhir < hariIni,
          berjalan: senin <= hariIni && hariIni <= akhir,
        }
      }),
    }))
  }, [monthKey, staf, data.klaimSosmed, data.jadwalShift, hariIni])

  /**
   * Senin dari minggu-minggu yang dinilai bulan ini. Tanggal di ujung bulan
   * bisa jatuh di minggu milik bulan sebelah (lihat `mingguDinilai`) — live di
   * sana sah, cuma dihitungnya di periode lain, dan itu harus terbaca dari
   * selnya supaya tidak terlihat seperti live yang "tidak dihitung".
   */
  const mingguSet = useMemo(() => new Set(mingguDinilai(monthKey)), [monthKey])

  /**
   * Kepala tabel tanggal — dipakai KEDUA tabel supaya kolomnya sejajar dan
   * tabel tugas tetap terbaca tanpa harus menengok ke tabel di atasnya.
   *
   * Penanda "slot shift belum terisi penuh" hanya relevan di roster, jadi ia
   * dimatikan lewat `tandaiBolong` di tabel tugas — kalau ikut menyala di sana
   * ia akan terbaca seolah tugasnya yang bolong.
   */
  function kepalaTanggal(labelKolom: string, tandaiBolong: boolean) {
    return (
      <thead>
        <tr>
          <th className="jdw-sticky">{labelKolom}</th>
          {tanggalList.map((t) => {
            const bolong =
              tandaiBolong && perHari.get(t.tanggal)?.tercover === false
            return (
              <th
                key={t.tanggal}
                className={
                  (t.akhirPekan ? 'is-pekan' : '') +
                  (t.isHariIni ? ' is-kini' : '') +
                  (bolong ? ' is-bolong' : '')
                }
                title={bolong ? 'Slot shift belum terisi penuh' : undefined}
              >
                <em>{t.namaHari}</em>
                {t.hari}
              </th>
            )
          })}
        </tr>
      </thead>
    )
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
          <h2>Jadwal Karyawan</h2>
          <p>
            {cakupan.hariTercover} dari {cakupan.hariDinilai} hari berjalan sudah
            terisi penuh
            {cakupan.bolongMendatang.length > 0 && (
              <> · <b>{cakupan.bolongMendatang.length} hari ke depan masih bolong</b></>
            )}
            {cutiMap.size > 0 && (
              <> · {cutiMap.size} cuti disetujui tampil otomatis</>
            )}
            {antreanKlaim > 0 && (
              <>
                {' '}
                ·{' '}
                <b>
                  {antreanKlaim} laporan tugas{' '}
                  {bisaUbah ? 'menunggu diperiksa' : 'menunggu diperiksa pengelola'}
                </b>
              </>
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

      {staf.length === 0 ? (
        <section className="jdw-panel">
          <p className="jdw-empty">Belum ada karyawan aktif untuk dijadwalkan.</p>
        </section>
      ) : (
        <>
          {/* ---------- Panel 1 · Roster shift ---------- */}
          <section className="jdw-panel">
            <div className="jdw-scroll">
              <table className="jdw-tabel">
                {kepalaTanggal('Karyawan', true)}
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

          {/* ---------- Panel 2 · Tugas sosial media ----------
              Tabel TERPISAH dari roster, bukan baris tambahan di bawahnya.
              Keduanya memang grid tanggal × orang, tapi isinya dua bahasa yang
              berbeda — roster menjawab "siapa masuk", papan ini menjawab "sudah
              dikerjakan & sudah diperiksa belum" — dan orang yang sama muncul
              di dua-duanya. Digabung, kolom kirinya jadi berisi nama yang sama
              dua kali dan tidak ada yang tahu batas antara keduanya di mana. */}
          <section className="jdw-panel">
            <div className="jdw-panel-head">
              <div>
                <h3>Tugas Sosial Media</h3>
                <p>
                  Operator mencentang kalau sudah mengerjakan; pengelola yang
                  memeriksa. Hanya yang <b>disetujui</b> yang dihitung untuk
                  bonus gaji pokok.
                </p>
              </div>
              {antreanKlaim > 0 && (
                <span className="jdw-antrean">
                  {antreanKlaim} menunggu diperiksa
                </span>
              )}
            </div>

            <div className="jdw-scroll">
              <table className="jdw-tabel jdw-tabel--tugas">
                {kepalaTanggal('Tugas', false)}
                <tbody>
                {/* --- Tugas sosial media -------------------------------
                    Satu baris per (orang × tugas), bukan satu baris tim:
                    yang dinilai — dan dibayar — adalah orangnya, jadi story
                    dua operator di hari yang sama harus bisa dibedakan.

                    Operator menekan sel di BARISNYA SENDIRI untuk melapor;
                    pengelola menekan untuk memeriksa. Trigger di database
                    (migrasi 0060) yang benar-benar menegakkan pembagian itu. */}
                {staf.map((e) =>
                  TUGAS.map((tg, i) => (
                    <tr
                      key={`${e.id}-${tg.jenis}`}
                      className={'jdw-tugas-row' + (i === 0 ? ' is-awal' : '')}
                    >
                      <th className="jdw-sticky">
                        <span className="jdw-orang jdw-orang-tugas">
                          {i === 0 ? (
                            <Avatar
                              name={e.nama}
                              foto={e.foto}
                              colorIndex={colorIndexForName(e.nama)}
                              size="sm"
                            />
                          ) : (
                            <i className="jdw-tugas-lanjut" aria-hidden="true" />
                          )}
                          <span>
                            {i === 0 && <b>{e.nama}</b>}
                            <em>{tg.label}</em>
                          </span>
                        </span>
                      </th>
                      {tanggalList.map((t) => {
                        const klaim = klaimMap.get(kKlaim(t.tanggal, e.id, tg.jenis))
                        const status = klaim?.status ?? null
                        const rencanaLive =
                          tg.jenis === 'live' &&
                          liveRencana.get(t.tanggal) === e.id
                        const hariKerja = kerjaSet.has(`${t.tanggal}::${e.id}`)
                        const lewat = t.tanggal < hariIni
                        // Merah = kewajiban yang benar-benar terlewat. Story
                        // hanya ditagih pada hari orang itu MASUK KERJA; live
                        // hanya pada hari yang memang dijadwalkan untuknya.
                        const luput =
                          !status &&
                          lewat &&
                          (tg.jenis === 'story' ? hariKerja : rencanaLive)
                        const bolehKlik =
                          bisaUbah ||
                          (e.id === currentUserId && status !== 'disetujui')
                        const lainBulan =
                          tg.jenis === 'live' &&
                          !mingguSet.has(seninMinggu(t.tanggal))
                        const judul = status === 'disetujui'
                          ? `Sudah diperiksa & disetujui${bisaUbah ? ' — klik untuk mencabut' : ''}`
                          : status === 'menunggu'
                            ? bisaUbah
                              ? `${e.nama} melapor sudah mengerjakannya — klik untuk menyetujui`
                              : 'Sudah dilaporkan, menunggu diperiksa pengelola'
                            : luput
                              ? tg.jenis === 'story'
                                ? 'Hari kerja yang lewat tanpa story'
                                : 'Dijadwalkan live, tapi tidak ada laporan'
                              : bolehKlik
                                ? bisaUbah
                                  ? 'Belum ada laporan — klik untuk mencatat langsung'
                                  : 'Klik kalau kamu sudah mengerjakannya'
                                : 'Belum ada laporan'
                        return (
                          <td
                            key={t.tanggal}
                            className={t.akhirPekan ? 'is-pekan' : ''}
                          >
                            <button
                              type="button"
                              className={
                                'jdw-sel jdw-tugas' +
                                (status === 'disetujui'
                                  ? ' is-acc'
                                  : status === 'menunggu'
                                    ? ' is-tunggu'
                                    : luput
                                      ? ' is-luput'
                                      : rencanaLive
                                        ? ' is-rencana'
                                        : '')
                              }
                              disabled={!bolehKlik}
                              onClick={() => putarKlaim(t.tanggal, e.id, tg.jenis)}
                              title={
                                judul +
                                (lainBulan
                                  ? ' · minggunya dihitung di bulan sebelah'
                                  : '')
                              }
                            >
                              {status === 'disetujui'
                                ? '✓'
                                : status === 'menunggu'
                                  ? '•'
                                  : luput
                                    ? '✕'
                                    : rencanaLive
                                      ? '○'
                                      : ''}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )),
                )}

                {/* Konten tayang — BACA SAJA. Centangnya ada di kartu Papan
                    Promosi; menaruh jalur tulis kedua di sini akan melahirkan
                    dua tanggal "konten selesai" yang bisa berbeda. */}
                <tr className="jdw-tugas-row is-awal jdw-konten-row">
                  <th className="jdw-sticky">
                    <span className="jdw-orang jdw-orang-tugas">
                      <i className="jdw-tugas-ikon" aria-hidden="true">
                        🎬
                      </i>
                      <span>
                        <b>Konten tayang</b>
                        <em>dari Papan Promosi</em>
                      </span>
                    </span>
                  </th>
                  {tanggalList.map((t) => {
                    const k = kontenPerTanggal.get(t.tanggal)
                    const pic = k?.pic ? staf.find((e) => e.id === k.pic) : undefined
                    return (
                      <td key={t.tanggal} className={t.akhirPekan ? 'is-pekan' : ''}>
                        <span
                          className={
                            'jdw-sel jdw-tugas is-baca' +
                            (k ? (k.disetujui ? ' is-acc' : ' is-tunggu') : '')
                          }
                          title={
                            !k
                              ? 'Tidak ada konten tayang di tanggal ini'
                              : k.disetujui
                                ? `Kartu sudah ditutup pengelola${pic ? ` — ${pic.nama}` : ''} (dihitung untuk target konten)`
                                : `Dicentang tayang oleh PIC${pic ? ` — ${pic.nama}` : ''}, kartunya belum ditutup pengelola`
                          }
                        >
                          {k ? (pic ? inisial(pic.nama) : '•') : ''}
                        </span>
                      </td>
                    )
                  })}
                </tr>
                </tbody>
              </table>
            </div>

        {/* Rekap live per minggu, per orang — inti panelnya: lubang minggu ini
            harus terlihat hari SENIN, bukan ketahuan saat bulan sudah tutup. */}
        {mingguPerOrang.map(({ emp, minggu }) =>
          minggu.length === 0 ? null : (
            <div key={emp.id} className="jdw-minggu">
              <span className="jdw-minggu-lbl">
                Live {emp.nama} · <b>{minggu.filter((m) => m.cukup).length}</b> dari{' '}
                {minggu.length} minggu
              </span>
              <div className="jdw-minggu-list">
                {minggu.map((m) => {
                  const status = m.cukup
                    ? 'is-cukup'
                    : m.lewat
                      ? 'is-luput'
                      : m.rencana
                        ? 'is-rencana'
                        : m.berjalan
                          ? 'is-mendesak'
                          : 'is-kosong'
                  return (
                    <span
                      key={m.senin}
                      className={`jdw-minggu-chip ${status}`}
                      title={
                        m.cukup
                          ? 'Sudah ada live yang disetujui minggu ini'
                          : m.lewat
                            ? 'Minggu ini lewat tanpa live yang disetujui'
                            : m.rencana
                              ? 'Sudah dijadwalkan, laporannya belum ada'
                              : 'Belum dijadwalkan'
                      }
                    >
                      <i>{m.cukup ? '✓' : m.lewat ? '✕' : m.rencana ? '○' : '!'}</i>
                      {tglPendek(m.senin)}–{tglPendek(m.akhir)}
                    </span>
                  )
                })}
              </div>
            </div>
          ),
        )}

            <div className="jdw-kaki">
              <div className="jdw-legend">
                <span>
                  <i className="jdw-sel jdw-tugas is-rencana">○</i>
                  Live dijadwalkan
                </span>
                <span>
                  <i className="jdw-sel jdw-tugas is-tunggu">•</i>
                  Dilaporkan, belum diperiksa
                </span>
                <span>
                  <i className="jdw-sel jdw-tugas is-acc">✓</i>
                  Disetujui — baru ini yang dihitung
                </span>
                <span>
                  <i className="jdw-sel jdw-tugas is-luput">✕</i>
                  Terlewat
                </span>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  )
}
