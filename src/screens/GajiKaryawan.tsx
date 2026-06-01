import { useEffect, useMemo, useState } from 'react'
import type { AppData } from '../types'
import { formatDurasi } from '../attendance'
import { formatRupiah } from '../income'
import {
  BONUS_PER_ITEM,
  HARI_KERJA_SEBULAN,
  JATAH_CUTI_SEBULAN,
  MENIT_KERJA_HARIAN,
  hariSeharusnyaBulan,
  hitungSlipGaji,
  type SlipGaji,
} from '../gaji'
import { todayKey } from '../storage'
import { Icons } from '../components/Icons'

type Props = {
  data: AppData
  setData: (d: AppData) => void
  isAdmin: boolean
  currentUserId: string
}

/** "2026-05" → "Mei 2026". */
function labelBulan(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, 1)
  return dt.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
}

/** Total menit → "12,5 jam" (1 desimal, id-ID). */
function jamDesimal(menit: number): string {
  return (menit / 60).toLocaleString('id-ID', { maximumFractionDigits: 1 })
}

/** Tarif/menit → "Rp 88,9/menit" (1 desimal). */
function formatTarif(n: number): string {
  return `Rp ${n.toLocaleString('id-ID', { maximumFractionDigits: 1 })}/menit`
}

export function GajiKaryawan({ data, setData, isAdmin, currentUserId }: Props) {
  // Admin = pengelola: lihat semua slip & bisa atur gaji pokok.
  // Karyawan: hanya slip miliknya sendiri, read-only.
  const karyawan = useMemo(
    () =>
      data.employees.filter((e) =>
        isAdmin ? e.role !== 'admin' : e.id === currentUserId,
      ),
    [data.employees, isAdmin, currentUserId],
  )

  const hariIni = todayKey()
  const bulanIni = hariIni.slice(0, 7)

  // Bulan yang benar-benar punya data (absen / laporan), terbaru di atas.
  const bulanBerdata = useMemo(() => {
    const set = new Set<string>()
    for (const r of data.records) set.add(r.tanggal.slice(0, 7))
    for (const l of data.laporanIncome) set.add(l.tanggal.slice(0, 7))
    return [...set].sort().reverse()
  }, [data.records, data.laporanIncome])

  // Pilihan di dropdown: bulan berdata + bulan berjalan, terbaru di atas.
  const bulanTersedia = useMemo(() => {
    const set = new Set<string>([bulanIni, ...bulanBerdata])
    return [...set].sort().reverse()
  }, [bulanBerdata, bulanIni])

  // `periode` = pilihan eksplisit user (null = belum memilih / mengikuti data).
  const [periode, setPeriode] = useState<string | null>(null)

  // Periode efektif yang dipakai untuk menghitung & menampilkan slip:
  //  - pilihan user, selama bulan itu masih ada di daftar;
  //  - jika tidak, ikuti bulan TERBARU yang punya data (jadi data yang baru
  //    diinput — termasuk bulan lalu / tanggal lampau — langsung muncul);
  //  - kalau belum ada data sama sekali, pakai bulan berjalan.
  const periodeAktif =
    periode && bulanTersedia.includes(periode)
      ? periode
      : bulanBerdata[0] ?? bulanIni

  // Data bulan terpilih.
  const recordsBulan = useMemo(
    () => data.records.filter((r) => r.tanggal.startsWith(periodeAktif)),
    [data.records, periodeAktif],
  )
  const laporanBulan = useMemo(
    () => data.laporanIncome.filter((l) => l.tanggal.startsWith(periodeAktif)),
    [data.laporanIncome, periodeAktif],
  )
  const hariSeharusnya = hariSeharusnyaBulan(periodeAktif, hariIni)

  // Slip gaji tiap karyawan untuk bulan terpilih.
  const slips = useMemo(
    () =>
      karyawan.map((emp) => ({
        emp,
        slip: hitungSlipGaji(
          emp,
          data.gajiPokok[emp.id] ?? 0,
          recordsBulan,
          laporanBulan,
          hariSeharusnya,
        ),
      })),
    [karyawan, data.gajiPokok, recordsBulan, laporanBulan, hariSeharusnya],
  )

  // KPI total.
  const total = useMemo(() => {
    const acc = { gajiPokok: 0, bonus: 0, gaji: 0, item: 0, menit: 0 }
    for (const { slip } of slips) {
      acc.gajiPokok += slip.gajiPokok
      acc.bonus += slip.bonusPenjualan
      acc.gaji += slip.total
      acc.item += slip.jumlahItem
      acc.menit += slip.kerjaBersihMenit
    }
    return acc
  }, [slips])

  function setGajiPokok(empId: string, nilai: number) {
    setData({
      ...data,
      gajiPokok: { ...data.gajiPokok, [empId]: Math.max(0, Math.round(nilai)) },
    })
  }

  // Status pembayaran per slip = key `${empId}::${periode}`.
  const dibayarKey = (empId: string) => `${empId}::${periodeAktif}`
  function setDibayar(empId: string, paid: boolean) {
    const next = { ...data.gajiDibayar }
    if (paid) next[dibayarKey(empId)] = true
    else delete next[dibayarKey(empId)]
    setData({ ...data, gajiDibayar: next })
  }

  // Pisahkan slip bulan terpilih: yang belum dibayar vs yang sudah (riwayat).
  const { belumDibayar, sudahDibayar } = useMemo(() => {
    const belum: typeof slips = []
    const sudah: typeof slips = []
    for (const s of slips) {
      if (data.gajiDibayar[dibayarKey(s.emp.id)]) sudah.push(s)
      else belum.push(s)
    }
    return { belumDibayar: belum, sudahDibayar: sudah }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slips, data.gajiDibayar, periodeAktif])

  return (
    <>
      <section className="gaji-toolbar">
        <div className="gaji-toolbar-info">
          <span className="gaji-periode-pill">{labelBulan(periodeAktif)}</span>
          <p className="gaji-toolbar-sub">
            {isAdmin ? (
              <>
                Slip gaji {slips.length} karyawan · gaji pokok + bonus
                penjualan (Rp {BONUS_PER_ITEM.toLocaleString('id-ID')}/item) +
                lembur &amp; shift penuh − keterlambatan − cuti berlebih
              </>
            ) : (
              <>
                Slip gaji kamu · diperbarui otomatis dari absensi &amp; penjualan
                (bonus Rp {BONUS_PER_ITEM.toLocaleString('id-ID')}/item)
              </>
            )}
          </p>
        </div>
        <label className="gaji-periode-select">
          <span>Periode</span>
          <select value={periodeAktif} onChange={(e) => setPeriode(e.target.value)}>
            {bulanTersedia.map((b) => (
              <option key={b} value={b}>
                {labelBulan(b)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {isAdmin && (
        <div className="kpi-grid">
          <KpiCard
            tone="pink"
            label="Total gaji dibayar"
            value={formatRupiah(total.gaji)}
            sub={`${slips.length} karyawan · ${labelBulan(periodeAktif)}`}
            icon={<Icons.wallet />}
          />
          <KpiCard
            tone="primary"
            label="Total gaji pokok"
            value={formatRupiah(total.gajiPokok)}
            sub="Sebelum penyesuaian"
            icon={<Icons.lock />}
          />
          <KpiCard
            tone="mint"
            label="Total bonus penjualan"
            value={formatRupiah(total.bonus)}
            sub={`${total.item} item terjual`}
            icon={<Icons.camera />}
          />
          <KpiCard
            tone="yellow"
            label="Total jam kerja"
            value={`${jamDesimal(total.menit)} jam`}
            sub={formatDurasi(total.menit)}
            icon={<Icons.clock />}
          />
        </div>
      )}

      {slips.length === 0 ? (
        <>
          <div className="section-head">
            <h2 style={{ fontSize: 20 }}>
              {isAdmin ? 'Slip Gaji per Karyawan' : 'Slip Gaji Saya'}
            </h2>
          </div>
          <div className="gaji-empty">
            {isAdmin
              ? 'Belum ada karyawan. Karyawan baru mendaftar sendiri di halaman login.'
              : 'Slip gaji kamu belum tersedia.'}
          </div>
        </>
      ) : (
        <>
          <div className="section-head">
            <h2 style={{ fontSize: 20 }}>
              {isAdmin ? 'Belum Dibayar' : 'Slip Gaji Saya'}
            </h2>
          </div>
          {belumDibayar.length === 0 ? (
            <div className="gaji-empty">
              Semua gaji {labelBulan(periodeAktif)} sudah dibayar. 🎉
            </div>
          ) : (
            <div className="gaji-grid">
              {belumDibayar.map(({ emp, slip }) => (
                <SlipCard
                  key={emp.id}
                  empId={emp.id}
                  nama={emp.nama}
                  jabatan={emp.jabatan}
                  slip={slip}
                  readOnly={!isAdmin}
                  dibayar={false}
                  onToggleDibayar={
                    isAdmin ? (v) => setDibayar(emp.id, v) : undefined
                  }
                  printTitle={`Slip Gaji · ${emp.nama} · ${labelBulan(periodeAktif)}`}
                  onGajiPokok={(v) => setGajiPokok(emp.id, v)}
                />
              ))}
            </div>
          )}

          {sudahDibayar.length > 0 && (
            <>
              <div className="section-head" style={{ marginTop: 28 }}>
                <h2 style={{ fontSize: 20 }}>
                  Riwayat — Sudah Dibayar · {labelBulan(periodeAktif)}
                </h2>
              </div>
              <div className="gaji-grid">
                {sudahDibayar.map(({ emp, slip }) => (
                  <SlipCard
                    key={emp.id}
                    empId={emp.id}
                    nama={emp.nama}
                    jabatan={emp.jabatan}
                    slip={slip}
                    readOnly={!isAdmin}
                    dibayar={true}
                    onToggleDibayar={
                      isAdmin ? (v) => setDibayar(emp.id, v) : undefined
                    }
                    printTitle={`Slip Gaji · ${emp.nama} · ${labelBulan(periodeAktif)}`}
                    onGajiPokok={(v) => setGajiPokok(emp.id, v)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

function SlipCard({
  empId,
  nama,
  jabatan,
  slip,
  readOnly,
  printTitle,
  onGajiPokok,
  dibayar = false,
  onToggleDibayar,
}: {
  empId: string
  nama: string
  jabatan: string
  slip: SlipGaji
  readOnly: boolean
  printTitle: string
  onGajiPokok: (v: number) => void
  dibayar?: boolean
  onToggleDibayar?: (paid: boolean) => void
}) {
  // Input gaji pokok pakai draft lokal supaya tidak menulis DB tiap ketukan;
  // commit saat blur / Enter.
  const [draft, setDraft] = useState(
    slip.gajiPokok ? String(slip.gajiPokok) : '',
  )
  useEffect(() => {
    setDraft(slip.gajiPokok ? String(slip.gajiPokok) : '')
  }, [slip.gajiPokok])

  function commit() {
    const v = parseInt(draft, 10) || 0
    if (v !== slip.gajiPokok) onGajiPokok(v)
  }

  function handlePrint() {
    const node = document.querySelector(`[data-slip-id="${empId}"]`)
    if (!node) return
    node.classList.add('is-printing')
    const cleanup = () => node.classList.remove('is-printing')
    window.addEventListener('afterprint', cleanup, { once: true })
    setTimeout(() => window.print(), 40)
    setTimeout(cleanup, 4000)
  }

  const inisial = nama
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="gaji-card" data-slip-id={empId}>
      {/* Kop slip — hanya tampil saat di-print */}
      <div className="gaji-print-head">
        <img className="gaji-print-logo" src={`${import.meta.env.BASE_URL}kubik-logo.png`} alt="Kubik" />
        <div className="gaji-print-title">{printTitle}</div>
      </div>

      <div className="gaji-card-head">
        <div className="gaji-avatar">{inisial || '👤'}</div>
        <div className="gaji-card-id">
          <div className="gaji-nama">{nama}</div>
          <div className="gaji-jabatan">{jabatan || 'Karyawan'}</div>
        </div>
      </div>

      {/* Gaji pokok hanya untuk admin (bisa diatur). Karyawan langsung melihat
          ringkasan kehadiran di bawah nama. */}
      {!readOnly && (
        <label className="gaji-pokok-field">
          <span>Gaji pokok / bulan</span>
          <div className="gaji-pokok-input">
            <span className="gaji-pokok-rp">Rp</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={50000}
              value={draft}
              placeholder="0"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
          </div>
          {slip.gajiPokok > 0 && (
            <span className="gaji-pokok-tarif">
              {formatTarif(slip.tarifPerMenit)} (÷{HARI_KERJA_SEBULAN} hari ÷
              {MENIT_KERJA_HARIAN} mnt)
            </span>
          )}
        </label>
      )}

      {/* Ringkasan kehadiran */}
      <div className="gaji-absen">
        <Chip label="Hadir" val={`${slip.hariHadir}/${slip.hariSeharusnya} hr`} />
        <Chip label="Telat" val={formatDurasi(slip.terlambatMenit)} warn={slip.terlambatMenit > 0} />
        <Chip label="Lembur" val={formatDurasi(slip.lemburMenit)} />
        <Chip label="Shift penuh" val={formatDurasi(slip.coverageMenit)} />
        <Chip
          label="Cuti"
          val={`${slip.cutiTerpakai}/${JATAH_CUTI_SEBULAN}${slip.hariCutiBerlebih > 0 ? ` (+${slip.hariCutiBerlebih} lebih)` : ''}`}
          warn={slip.hariCutiBerlebih > 0}
        />
        {slip.hariLibur > 0 && (
          <Chip label="Libur studio" val={`${slip.hariLibur} hr`} />
        )}
      </div>

      {/* Rincian gaji */}
      <div className="gaji-rincian">
        <Line label="Gaji pokok" val={slip.gajiPokok} />
        <Line
          label={`Bonus penjualan · ${slip.jumlahItem} item`}
          val={slip.bonusPenjualan}
          plus
          sub={`${slip.tiket} tiket · ${slip.cetak} cetak · ${slip.upgrade} upgrade · ${slip.produk} produk`}
        />
        {slip.upahLembur > 0 && (
          <Line
            label={`Lembur · ${formatDurasi(slip.lemburMenit)}`}
            val={slip.upahLembur}
            plus
          />
        )}
        {slip.upahCoverage > 0 && (
          <Line
            label={`Shift penuh · ${formatDurasi(slip.coverageMenit)}`}
            val={slip.upahCoverage}
            plus
          />
        )}
        {slip.potonganTerlambat > 0 && (
          <Line
            label={`Keterlambatan · ${formatDurasi(slip.terlambatMenit)}`}
            val={slip.potonganTerlambat}
            minus
          />
        )}
        {slip.potonganCuti > 0 && (
          <Line
            label={`Cuti berlebih · ${slip.hariCutiBerlebih} hari`}
            val={slip.potonganCuti}
            minus
          />
        )}
      </div>

      <div className="gaji-total">
        <span className="gaji-total-lbl">Total gaji</span>
        <span className="gaji-total-val">{formatRupiah(slip.total)}</span>
      </div>

      {/* Tanda tangan Owner — hanya tampil saat di-print */}
      <div className="gaji-print-sign">
        <div className="gaji-sign-box">
          <span className="gaji-sign-role">Owner</span>
          <span className="gaji-sign-line" />
          <span className="gaji-sign-name">&nbsp;</span>
        </div>
      </div>

      {/* Kontrol status pembayaran — pakai kelas .gaji-card-actions supaya ikut
          tersembunyi saat slip di-print (lihat @media print di App.css). */}
      {(onToggleDibayar || dibayar) && (
        <div className="gaji-card-actions">
          {onToggleDibayar ? (
            <button
              type="button"
              className={dibayar ? 'btn btn--ghost' : 'btn'}
              style={{ width: '100%' }}
              onClick={() => onToggleDibayar(!dibayar)}
            >
              {dibayar ? '↩ Tandai belum dibayar' : '✓ Tandai sudah dibayar'}
            </button>
          ) : (
            <span
              className="gaji-pokok-tarif"
              style={{
                width: '100%',
                textAlign: 'center',
                color: 'var(--mint-deep)',
              }}
            >
              ✓ Sudah dibayar
            </span>
          )}
        </div>
      )}

      <div className="gaji-card-actions">
        <button type="button" className="btn btn--ghost" onClick={handlePrint}>
          <Icons.printer /> Print slip
        </button>
      </div>
    </div>
  )
}

function Chip({ label, val, warn }: { label: string; val: string; warn?: boolean }) {
  return (
    <div className={'gaji-chip' + (warn ? ' is-warn' : '')}>
      <span className="gaji-chip-lbl">{label}</span>
      <span className="gaji-chip-val">{val}</span>
    </div>
  )
}

function Line({
  label,
  val,
  plus,
  minus,
  sub,
}: {
  label: string
  val: number
  plus?: boolean
  minus?: boolean
  sub?: string
}) {
  const sign = plus ? '+ ' : minus ? '− ' : ''
  return (
    <div className={'gaji-line' + (minus ? ' is-minus' : plus ? ' is-plus' : '')}>
      <div className="gaji-line-lbl">
        {label}
        {sub && <span className="gaji-line-sub">{sub}</span>}
      </div>
      <span className="gaji-line-val">
        {sign}
        {formatRupiah(val)}
      </span>
    </div>
  )
}

function KpiCard({
  tone,
  label,
  value,
  sub,
  icon,
}: {
  tone: 'primary' | 'mint' | 'pink' | 'yellow'
  label: string
  value: string
  sub: string
  icon: React.ReactNode
}) {
  return (
    <div className={`kpi-card kpi-${tone}`}>
      <div className="kpi-head">
        <span className="kpi-ikon">{icon}</span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}
