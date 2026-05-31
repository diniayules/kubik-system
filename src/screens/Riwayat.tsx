import { useMemo } from 'react'
import type { AppData } from '../types'
import {
  SHIFT_IKON,
  SHIFT_LABEL,
  cariOperatorOverlap,
  cariTakeover,
  formatDurasi,
  formatJam,
  formatTanggalPanjang,
  getEvent,
  hitungRingkasan,
  istirahatDilewatiCount,
} from '../attendance'
import { Avatar, colorIndexForName } from '../components/Avatar'
import { Icons } from '../components/Icons'

type Props = {
  data: AppData
  employeeId: string
  onBack: () => void
}

export function Riwayat({ data, employeeId, onBack }: Props) {
  const employee = data.employees.find((e) => e.id === employeeId)
  const records = useMemo(
    () =>
      data.records
        .filter((r) => r.employeeId === employeeId)
        .slice()
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [data.records, employeeId],
  )

  const total = useMemo(() => {
    let kerja = 0
    let terlambat = 0
    let lembur = 0
    let hari = 0
    let overlap = 0
    const perShift = { pagi: 0, sore: 0, full: 0 } as Record<string, number>
    for (const r of records) {
      const ring = hitungRingkasan(r, cariTakeover(r, data.records))
      kerja += ring.kerjaBersihMenit
      terlambat += ring.terlambatMenit
      lembur += ring.lemburMenit
      overlap += ring.overlapMenit
      if (ring.sudahPulang) {
        hari += 1
        perShift[r.shift] = (perShift[r.shift] ?? 0) + 1
      }
    }
    return { kerja, terlambat, lembur, hari, perShift, overlap }
  }, [records, data.records])

  function exportCSV() {
    const header = [
      'Tanggal',
      'Karyawan',
      'Shift',
      'Jam Masuk',
      'Istirahat Siang Mulai',
      'Istirahat Siang Selesai',
      'Ganti Shift',
      'Istirahat Sore Mulai',
      'Istirahat Sore Selesai',
      'Jam Pulang',
      'Terlambat (menit)',
      'Lembur (menit)',
      'Istirahat Lebih (menit)',
      'Kerja Bersih (menit)',
      'Overlap Shift Berikutnya (menit)',
      'Catatan Overlap',
      'Istirahat Dilewati',
    ]
    const rows = records.map((r) => {
      const ring = hitungRingkasan(r, cariTakeover(r, data.records))
      const overlapIds = cariOperatorOverlap(r, data.records)
      const overlapNama = overlapIds
        .map((id) => data.employees.find((e) => e.id === id)?.nama ?? '?')
        .join('; ')
      const catatan =
        ring.overlapMenit > 0
          ? `Overlap ${formatJam(ring.overlapMulai)}-${formatJam(ring.overlapSelesai)} dengan ${overlapNama || 'shift sore'}`
          : ''
      return [
        r.tanggal,
        employee?.nama ?? '',
        SHIFT_LABEL[r.shift],
        formatJam(getEvent(r, 'masuk')?.waktu),
        formatJam(getEvent(r, 'istirahat-siang-mulai')?.waktu),
        formatJam(getEvent(r, 'istirahat-siang-selesai')?.waktu),
        formatJam(getEvent(r, 'ganti-shift')?.waktu),
        formatJam(getEvent(r, 'istirahat-sore-mulai')?.waktu),
        formatJam(getEvent(r, 'istirahat-sore-selesai')?.waktu),
        formatJam(getEvent(r, 'pulang')?.waktu),
        String(ring.terlambatMenit),
        String(ring.lemburMenit),
        String(ring.istirahatLebihMenit),
        String(ring.kerjaBersihMenit),
        String(ring.overlapMenit),
        catatan,
        String(istirahatDilewatiCount(r)),
      ]
    })
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `absensi-${employee?.nama.replace(/\s+/g, '-').toLowerCase() ?? employeeId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!employee) {
    return (
      <div className="detail-card">
        <p>Karyawan tidak ditemukan.</p>
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Kembali
        </button>
      </div>
    )
  }

  return (
    <>
      <button type="button" className="back-link" onClick={onBack}>
        <Icons.back /> Kembali
      </button>

      <section className="detail-head">
        <Avatar
          name={employee.nama}
          colorIndex={colorIndexForName(employee.id)}
          size="lg"
        />
        <div className="emp-id">
          <div className="nm">Riwayat — {employee.nama}</div>
          <div className="role">{employee.jabatan || '—'}</div>
        </div>
        {records.length > 0 && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={exportCSV}
            style={{ marginLeft: 'auto' }}
          >
            <Icons.download /> Unduh CSV
          </button>
        )}
      </section>

      <section className="detail-card">
        <div className="ringkasan-grid">
          <div className="ringkasan-item tone-primary">
            <div className="ringkasan-label">Total hari kerja</div>
            <div className="ringkasan-value">{total.hari} hari</div>
            <div className="ringkasan-hint">
              {SHIFT_IKON.pagi} {total.perShift.pagi ?? 0} pagi ·{' '}
              {SHIFT_IKON.sore} {total.perShift.sore ?? 0} sore ·{' '}
              {SHIFT_IKON.full} {total.perShift.full ?? 0} full
            </div>
          </div>
          <div className="ringkasan-item tone-muted">
            <div className="ringkasan-label">Total jam kerja bersih</div>
            <div className="ringkasan-value">{formatDurasi(total.kerja)}</div>
          </div>
          <div className="ringkasan-item tone-danger">
            <div className="ringkasan-label">Total terlambat</div>
            <div className="ringkasan-value">{formatDurasi(total.terlambat)}</div>
          </div>
          <div className="ringkasan-item tone-success">
            <div className="ringkasan-label">Total lembur</div>
            <div className="ringkasan-value">{formatDurasi(total.lembur)}</div>
          </div>
          {total.overlap > 0 && (
            <div className="ringkasan-item tone-warning">
              <div className="ringkasan-label">Total overlap</div>
              <div className="ringkasan-value">{formatDurasi(total.overlap)}</div>
            </div>
          )}
        </div>
      </section>

      {records.length === 0 ? (
        <div className="detail-card" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--ink-soft)' }}>📭 Belum ada catatan absensi.</p>
        </div>
      ) : (
        <section className="detail-card">
          <div className="riwayat-table">
            <div className="riwayat-row riwayat-head">
              <div>Tanggal</div>
              <div>Shift</div>
              <div>Masuk</div>
              <div>Pulang</div>
              <div>Terlambat</div>
              <div>Lembur</div>
              <div>Kerja Bersih</div>
            </div>
            {records.map((r) => {
              const ring = hitungRingkasan(r, cariTakeover(r, data.records))
              const shiftCls = r.shift === 'full' ? 'penuh' : r.shift
              return (
                <div key={r.id} className="riwayat-row">
                  <div className="riwayat-tanggal">
                    {formatTanggalPanjang(r.tanggal)}
                  </div>
                  <div>
                    <span className={`badge badge--${shiftCls}`}>
                      {SHIFT_IKON[r.shift]} {SHIFT_LABEL[r.shift]}
                    </span>
                  </div>
                  <div>{formatJam(getEvent(r, 'masuk')?.waktu)}</div>
                  <div>{formatJam(getEvent(r, 'pulang')?.waktu)}</div>
                  <div
                    className={
                      ring.terlambatMenit > 0 ? 'tone-danger' : 'tone-muted'
                    }
                  >
                    {ring.terlambatMenit > 0
                      ? formatDurasi(ring.terlambatMenit)
                      : '—'}
                  </div>
                  <div
                    className={
                      ring.lemburMenit > 0 ? 'tone-success' : 'tone-muted'
                    }
                  >
                    {ring.lemburMenit > 0 ? formatDurasi(ring.lemburMenit) : '—'}
                    {ring.overlapMenit > 0 && (
                      <div
                        className="audit-badge audit-overlap"
                        title={`Overlap ${formatJam(ring.overlapMulai)} – ${formatJam(ring.overlapSelesai)}`}
                      >
                        🤝 Overlap {formatDurasi(ring.overlapMenit)}
                      </div>
                    )}
                    {istirahatDilewatiCount(r) > 0 && (
                      <div
                        className="audit-badge audit-skip"
                        title="Karyawan tidak ambil istirahat"
                      >
                        🚫 No-break
                      </div>
                    )}
                  </div>
                  <div>
                    {ring.sudahPulang ? formatDurasi(ring.kerjaBersihMenit) : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}
