import type { AppData } from '../types'
import { todayKey } from '../storage'
import { formatTanggalPanjang, getEvent } from '../attendance'
import { formatRupiah, hitungIncome } from '../income'
import {
  bulanIni,
  jumlahSalahCetakBulanIni,
  totalPengeluaran,
  totalStokFrame,
  totalStokKertas,
  totalStokTinta,
} from '../inventory'
import { Icons } from '../components/Icons'
import { DEFAULTS } from '../appearance'

type Props = {
  data: AppData
  setData: (d: AppData) => void
  isAdmin: boolean
  onAbsensi: () => void
  onLaporan: () => void
  onInventaris: () => void
  onPengeluaran: () => void
}

export function Landing({
  data,
  isAdmin,
  onAbsensi,
  onLaporan,
  onInventaris,
  onPengeluaran,
}: Props) {
  const hariIni = todayKey()
  const tanggalLabel = formatTanggalPanjang(hariIni)
  const judul = data.dashJudul ?? DEFAULTS.dashJudul
  const sub = data.dashSub ?? DEFAULTS.dashSub

  // Absensi stats — admin (pengelola) tidak ikut absen, jadi tidak dihitung.
  const karyawan = data.employees.filter((e) => e.role !== 'admin')
  let working = 0
  let selesai = 0
  for (const emp of karyawan) {
    const rec = data.records.find(
      (r) => r.employeeId === emp.id && r.tanggal === hariIni,
    )
    if (!rec) continue
    if (getEvent(rec, 'pulang')) selesai += 1
    else if (getEvent(rec, 'masuk')) working += 1
  }

  // Income stats
  const incomeHariIni = data.laporanIncome.find((l) => l.tanggal === hariIni)
  const totalHariIni = incomeHariIni ? hitungIncome(incomeHariIni).total : 0
  const monthKey = hariIni.slice(0, 7)
  const totalBulanIni = data.laporanIncome
    .filter((l) => l.tanggal.startsWith(monthKey))
    .reduce((s, l) => s + hitungIncome(l).total, 0)

  // Inventaris stats
  const totalKertas = totalStokKertas(data.stokKertas)
  const totalFrame = totalStokFrame(data.stokFrame)
  const totalTinta = totalStokTinta(data.stokTinta)
  const stokTipis = data.stokKertas.filter((k) => k.stok < 10).length
  const salahBulan = jumlahSalahCetakBulanIni(data.salahCetak)

  // Pengeluaran stats
  const pengBulan = totalPengeluaran(data.pengeluaran, (p) => bulanIni(p.tanggal))
  const labaBulan = totalBulanIni - pengBulan

  return (
    <>
      <section className="dash-greet">
        <div>
          <span className="date-pill">{tanggalLabel}</span>
          <h2 className="dash-greet-judul">{renderJudul(judul)}</h2>
          <p className="dash-greet-sub">{sub}</p>
        </div>
        {isAdmin ? (
          <div className="dash-laba-card">
            <div className="dash-laba-lbl">Laba bersih bulan ini</div>
            <div
              className={
                'dash-laba-val ' +
                (labaBulan >= 0 ? 'is-positif' : 'is-negatif')
              }
            >
              {labaBulan >= 0 ? '+' : ''}
              {formatRupiah(labaBulan)}
            </div>
            <div className="dash-laba-detail">
              Income {formatRupiah(totalBulanIni)} − Pengeluaran{' '}
              {formatRupiah(pengBulan)}
            </div>
          </div>
        ) : (
          <div className="dash-laba-card">
            <div className="dash-laba-lbl">Income hari ini</div>
            <div className="dash-laba-val is-positif">
              {formatRupiah(totalHariIni)}
            </div>
            <div className="dash-laba-detail">{tanggalLabel}</div>
          </div>
        )}
      </section>

      <div className="kpi-grid">
        <KpiCard
          tone="primary"
          label="Karyawan"
          value={String(karyawan.length)}
          sub={`${working} sedang kerja · ${selesai} selesai`}
          icon={<Icons.clock />}
        />
        <KpiCard
          tone="mint"
          label="Income hari ini"
          value={formatRupiah(totalHariIni)}
          sub={isAdmin ? `Bulan ini ${formatRupiah(totalBulanIni)}` : tanggalLabel}
          icon={<Icons.wallet />}
        />
        <KpiCard
          tone="pink"
          label="Pengeluaran bulan ini"
          value={formatRupiah(pengBulan)}
          sub={`${data.pengeluaran.length} entri tercatat`}
          icon={<Icons.cart />}
        />
        <KpiCard
          tone="yellow"
          label="Inventaris"
          value={`${totalKertas} kertas`}
          sub={`${totalFrame} frame · ${totalTinta} btl tinta · ${data.stokAmplop} amplop${stokTipis > 0 ? ` · ${stokTipis} jenis tipis` : ''}`}
          icon={<Icons.box />}
        />
      </div>

      <div className="section-head">
        <h2 style={{ fontSize: 20 }}>Akses Cepat</h2>
      </div>

      <div className="quick-grid">
        <QuickCard
          tone="absensi"
          emoji="⏱️"
          title="Absensi Karyawan"
          sub="Clock-in, clock-out, riwayat absen"
          onClick={onAbsensi}
        />
        <QuickCard
          tone="income"
          emoji="💰"
          title="Laporan Income Harian"
          sub="Tiket & cetak Photobooth/Box/Game"
          onClick={onLaporan}
        />
        <QuickCard
          tone="inventaris"
          emoji="📦"
          title="Inventaris & Stok"
          sub="Kertas, frame, tinta 6 warna, amplop"
          onClick={onInventaris}
          badge={salahBulan > 0 ? `${salahBulan} salah cetak` : undefined}
        />
        <QuickCard
          tone="pengeluaran"
          emoji="🛒"
          title="Pengeluaran Studio"
          sub="Catat belanja & biaya operasional"
          onClick={onPengeluaran}
        />
      </div>
    </>
  )
}

function renderJudul(judul: string) {
  const idx = judul.indexOf('👋')
  if (idx === -1) return judul
  return (
    <>
      {judul.slice(0, idx)}
      <span className="wave">👋</span>
      {judul.slice(idx + 2)}
    </>
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

function QuickCard({
  tone,
  emoji,
  title,
  sub,
  badge,
  onClick,
}: {
  tone: 'absensi' | 'income' | 'inventaris' | 'pengeluaran'
  emoji: string
  title: string
  sub: string
  badge?: string
  onClick: () => void
}) {
  return (
    <button type="button" className={`quick-card quick-${tone}`} onClick={onClick}>
      <div className="quick-ikon">{emoji}</div>
      <div className="quick-body">
        <div className="quick-title">{title}</div>
        {badge && <span className="quick-badge">{badge}</span>}
        <div className="quick-sub">{sub}</div>
      </div>
      <span className="quick-arrow">
        <Icons.chevron />
      </span>
    </button>
  )
}
