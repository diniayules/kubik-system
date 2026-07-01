import { Fragment, useMemo, useState } from 'react'
import type {
  AbsenEvent,
  AbsenHari,
  AbsenStatus,
  AppData,
  DayType,
  EventTipe,
} from '../types'
import { todayKey } from '../storage'
import {
  DAY_TYPE_LIST,
  EVENT_LABEL,
  SHIFT_IKON,
  SHIFT_JADWAL,
  SHIFT_LABEL,
  SHIFT_URUTAN,
  absenDisetujui,
  isHariKerja,
  cariOperatorOverlap,
  cariTakeover,
  formatBulanTahun,
  formatDurasi,
  formatJam,
  formatTanggalPanjang,
  getEvent,
  hitungRingkasan,
  istirahatDilewatiCount,
  jadwalISO,
} from '../attendance'
import { Avatar, colorIndexForName } from '../components/Avatar'
import { Icons } from '../components/Icons'
import { useToast } from '../components/Toast'

type Draft = {
  tanggal: string
  shift: DayType
  jam: Partial<Record<EventTipe, string>>
  extraMenit: string
  extraCatatan: string
}

type Props = {
  data: AppData
  setData: (d: AppData) => void
  employeeId: string
  isAdmin: boolean
  currentUserId: string
  onBack: () => void
}

export function Riwayat({
  data,
  setData,
  employeeId,
  isAdmin,
  currentUserId,
  onBack,
}: Props) {
  const toast = useToast()
  const today = todayKey()
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  // Accordion per bulan. Default: hanya bulan terbaru yang terbuka. `bulanFlip`
  // menyimpan bulan yang status bukanya dibalik dari default oleh pengguna.
  const [bulanFlip, setBulanFlip] = useState<Set<string>>(() => new Set())
  const toggleBulan = (key: string) =>
    setBulanFlip((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const employee = data.employees.find((e) => e.id === employeeId)
  // Pemilik kartu & admin boleh mengedit absensi langsung dari riwayat;
  // karyawan lain hanya melihat riwayat resmi (read-only).
  const bolehLihatMenunggu = isAdmin || employeeId === currentUserId
  const canEdit = isAdmin || employeeId === currentUserId
  const records = useMemo(
    () =>
      data.records
        .filter((r) => r.employeeId === employeeId)
        .filter((r) => bolehLihatMenunggu || absenDisetujui(r))
        .slice()
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [data.records, employeeId, bolehLihatMenunggu],
  )

  // Kelompokkan riwayat per bulan (YYYY-MM). `records` sudah terurut menurun,
  // jadi bulan terbaru muncul lebih dulu dan tanggal di tiap bulan tetap menurun.
  const perBulan = useMemo(() => {
    const map = new Map<string, AbsenHari[]>()
    for (const r of records) {
      const key = r.tanggal.slice(0, 7)
      const arr = map.get(key)
      if (arr) arr.push(r)
      else map.set(key, [r])
    }
    return Array.from(map.entries())
  }, [records])

  const total = useMemo(() => {
    let kerja = 0
    let terlambat = 0
    let lembur = 0
    let hari = 0
    let overlap = 0
    let cuti = 0
    let libur = 0
    let extra = 0
    const perShift = { pagi: 0, sore: 0, full: 0 } as Record<string, number>
    for (const r of records) {
      // Hanya absensi yang sudah disetujui dihitung sebagai kehadiran resmi.
      if (!absenDisetujui(r)) continue
      extra += Math.max(0, r.extraMenit ?? 0)
      if (r.shift === 'cuti') {
        cuti += 1
        continue
      }
      if (r.shift === 'libur') {
        libur += 1
        continue
      }
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
    return { kerja, terlambat, lembur, hari, perShift, overlap, cuti, libur, extra }
  }, [records, data.records])

  function bukaEdit(r: AbsenHari) {
    const jam: Partial<Record<EventTipe, string>> = {}
    for (const e of r.events) jam[e.tipe] = formatJam(e.waktu)
    setEditId(r.id)
    setDraft({
      tanggal: r.tanggal,
      shift: r.shift,
      jam,
      extraMenit: r.extraMenit ? String(r.extraMenit) : '',
      extraCatatan: r.extraCatatan ?? '',
    })
  }

  function batalEdit() {
    setEditId(null)
    setDraft(null)
  }

  // Simpan hasil edit inline langsung dari riwayat (tanpa pindah ke editor
  // absensi). Jam di-stempel ulang ke tanggal draft; untuk karyawan, mengubah
  // catatan lampau mengembalikan status ke 'menunggu' (persetujuan ulang admin).
  function simpanEdit(r: AbsenHari) {
    if (!draft) return
    const tgl = draft.tanggal
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl) || Number.isNaN(Date.parse(tgl))) {
      alert('Tanggal tidak valid (gunakan format kalender).')
      return
    }
    if (tgl > today) {
      alert('Tidak bisa memindahkan ke tanggal di masa depan.')
      return
    }
    if (
      tgl !== r.tanggal &&
      data.records.some(
        (x) =>
          x.employeeId === employeeId && x.tanggal === tgl && x.id !== r.id,
      )
    ) {
      alert(
        'Sudah ada catatan absensi di tanggal itu. Hapus dulu salah satu sebelum memindahkan.',
      )
      return
    }
    const sekarang = new Date().toISOString()
    const events: AbsenEvent[] = []
    // Hari cuti / libur tidak punya jam kerja → events tetap kosong.
    const slots = isHariKerja(draft.shift) ? SHIFT_URUTAN[draft.shift] : []
    for (const tipe of slots) {
      const val = (draft.jam[tipe] ?? '').trim()
      if (!val) continue
      if (!/^\d{2}:\d{2}$/.test(val)) {
        alert(`Format jam ${EVENT_LABEL[tipe]} tidak valid (HH:MM).`)
        return
      }
      const old = r.events.find((e) => e.tipe === tipe)
      const waktu = jadwalISO(tgl, val)
      if (old && formatJam(old.waktu) === val) {
        // Jam tidak berubah: pertahankan flag audit, stempel ulang ke tanggal.
        events.push({
          ...old,
          waktu,
          waktuAsli: old.waktuAsli
            ? jadwalISO(tgl, formatJam(old.waktuAsli))
            : old.waktuAsli,
        })
      } else {
        events.push({
          tipe,
          waktu,
          manual: true,
          diubahPada: sekarang,
          waktuAsli: old ? old.waktuAsli ?? old.waktu : undefined,
        })
      }
    }
    const extraMenit = Math.max(0, Math.round(Number(draft.extraMenit) || 0))
    const targetStatus: AbsenStatus =
      tgl !== today && !isAdmin ? 'menunggu' : 'disetujui'
    const updated: AbsenHari = {
      ...r,
      tanggal: tgl,
      shift: draft.shift,
      events,
      status: targetStatus,
      extraMenit,
      extraCatatan: draft.extraCatatan.trim() || undefined,
    }
    setData({
      ...data,
      records: data.records.map((x) => (x.id === r.id ? updated : x)),
    })
    toast('ok', 'Absensi diperbarui')
    if (r.status === 'disetujui' && targetStatus === 'menunggu') {
      toast('warn', 'Perubahan perlu persetujuan ulang admin')
    }
    batalEdit()
  }

  function hapusRecord(r: AbsenHari) {
    if (
      !confirm(
        `Hapus catatan absensi ${formatTanggalPanjang(r.tanggal)}? Aksi ini tidak bisa dibatalkan.`,
      )
    ) {
      return
    }
    setData({ ...data, records: data.records.filter((x) => x.id !== r.id) })
    toast('warn', 'Catatan absensi dihapus')
    batalEdit()
  }

  function exportCSV() {
    const header = [
      'Tanggal',
      'Karyawan',
      'Shift',
      'Jam Masuk',
      'Istirahat Siang Mulai',
      'Istirahat Siang Selesai',
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
      'Extra Time (menit)',
      'Catatan Extra Time',
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
        String(r.extraMenit ?? 0),
        r.extraCatatan ?? '',
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
          {(total.cuti > 0 || total.libur > 0) && (
            <div className="ringkasan-item tone-muted">
              <div className="ringkasan-label">Cuti &amp; Libur</div>
              <div className="ringkasan-value">
                {SHIFT_IKON.cuti} {total.cuti} cuti · {SHIFT_IKON.libur}{' '}
                {total.libur} libur
              </div>
              <div className="ringkasan-hint">tidak dihitung sebagai absen</div>
            </div>
          )}
          {total.overlap > 0 && (
            <div className="ringkasan-item tone-warning">
              <div className="ringkasan-label">Total overlap</div>
              <div className="ringkasan-value">{formatDurasi(total.overlap)}</div>
            </div>
          )}
          {total.extra > 0 && (
            <div className="ringkasan-item tone-success">
              <div className="ringkasan-label">Total extra time</div>
              <div className="ringkasan-value">{formatDurasi(total.extra)}</div>
              <div className="ringkasan-hint">backup / meeting di luar jadwal</div>
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
          {canEdit && (
            <p className="timeline-help">
              💡 Klik <strong>Edit</strong> pada baris tanggal untuk mengubah jam,
              shift, atau tanggal absensi <strong>langsung di sini</strong> tanpa
              pindah halaman.
            </p>
          )}
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
            {perBulan.map(([bulanKey, rows], bulanIdx) => {
              // Default terbuka hanya bulan terbaru (index 0); pengguna bisa
              // membalik status tiap bulan lewat `bulanFlip`.
              const terbuka = (bulanIdx === 0) !== bulanFlip.has(bulanKey)
              return (
              <div
                className={`riwayat-bulan${terbuka ? ' riwayat-bulan-buka' : ''}`}
                key={bulanKey}
              >
                <button
                  type="button"
                  className="riwayat-bulan-head"
                  onClick={() => toggleBulan(bulanKey)}
                  aria-expanded={terbuka}
                >
                  <span className="riwayat-bulan-chevron" aria-hidden="true">
                    ▾
                  </span>
                  <span className="riwayat-bulan-nama">
                    📅 {formatBulanTahun(rows[0].tanggal)}
                  </span>
                  <span className="riwayat-bulan-meta">{rows.length} hari</span>
                </button>
                {terbuka && (
                <div className="riwayat-bulan-rows">
                  {rows.map((r) => {
              const ring = hitungRingkasan(r, cariTakeover(r, data.records))
              const shiftCls = r.shift === 'full' ? 'penuh' : r.shift
              const pending = !absenDisetujui(r)
              const editing = editId === r.id
              return (
                <Fragment key={r.id}>
                <div
                  className={`riwayat-row${pending ? ' riwayat-pending' : ''}${editing ? ' riwayat-editing' : ''}`}
                >
                  <div className="riwayat-tanggal">
                    {formatTanggalPanjang(r.tanggal)}
                    {pending && (
                      <span
                        className="audit-badge audit-manual"
                        title="Entri manual menunggu persetujuan admin"
                      >
                        ⏳ Menunggu persetujuan
                      </span>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        className="btn-mini btn-mini-edit riwayat-edit-btn"
                        onClick={() => (editing ? batalEdit() : bukaEdit(r))}
                        title="Ubah jam, shift, atau tanggal absensi ini"
                      >
                        <Icons.pencil /> {editing ? 'Tutup' : 'Edit'}
                      </button>
                    )}
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
                    {(r.extraMenit ?? 0) > 0 && (
                      <div
                        className="audit-badge audit-extra"
                        title={r.extraCatatan || 'Waktu ekstra (backup / meeting)'}
                      >
                        ➕ Extra {formatDurasi(r.extraMenit ?? 0)}
                      </div>
                    )}
                    {r.checklistPulang && r.checklistPulang.length > 0 && (
                      <div
                        className="audit-badge audit-closing"
                        title={
                          'Closing checklist saat pulang:\n' +
                          r.checklistPulang
                            .map((c) => `✓ ${c.label} (${formatJam(c.waktu)})`)
                            .join('\n')
                        }
                      >
                        🌙 Closing {r.checklistPulang.length}
                      </div>
                    )}
                  </div>
                  <div>
                    {ring.sudahPulang ? formatDurasi(ring.kerjaBersihMenit) : '—'}
                  </div>
                </div>
                {editing && draft && (
                  <div className="riwayat-edit-panel">
                    <div className="edit-grid">
                      <label className="edit-field">
                        <span>Tanggal</span>
                        <input
                          type="date"
                          className="edit-time"
                          max={today}
                          value={draft.tanggal}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              tanggal: e.target.value || draft.tanggal,
                            })
                          }
                        />
                      </label>
                      <label className="edit-field">
                        <span>Shift</span>
                        <select
                          className="edit-time"
                          value={draft.shift}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              shift: e.target.value as DayType,
                            })
                          }
                        >
                          {DAY_TYPE_LIST.map((s) => (
                            <option key={s} value={s}>
                              {SHIFT_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="edit-jam-grid">
                      {(isHariKerja(draft.shift)
                        ? SHIFT_URUTAN[draft.shift]
                        : []
                      ).map((tipe) => (
                        <label key={tipe} className="edit-field">
                          <span>
                            {EVENT_LABEL[tipe]}{' '}
                            <em className="edit-jadwal">
                              (jadwal{' '}
                              {(isHariKerja(draft.shift)
                                ? SHIFT_JADWAL[draft.shift][tipe]
                                : undefined) ?? '—'}
                              )
                            </em>
                          </span>
                          <input
                            type="time"
                            className="edit-time"
                            value={draft.jam[tipe] ?? ''}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                jam: { ...draft.jam, [tipe]: e.target.value },
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <div className="edit-grid edit-extra-grid">
                      <label className="edit-field">
                        <span>
                          ➕ Extra time (menit){' '}
                          <em className="edit-jadwal">backup / meeting</em>
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="5"
                          className="edit-time"
                          value={draft.extraMenit}
                          onChange={(e) =>
                            setDraft({ ...draft, extraMenit: e.target.value })
                          }
                        />
                      </label>
                      <label className="edit-field edit-field-wide">
                        <span>Catatan extra time</span>
                        <input
                          type="text"
                          className="edit-time"
                          placeholder="mis. backup shift sore, meeting bulanan"
                          value={draft.extraCatatan}
                          onChange={(e) =>
                            setDraft({ ...draft, extraCatatan: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="edit-hint">
                      Kosongkan jam untuk menghapus catatan event itu. Mengubah
                      tanggal akan memindahkan catatan ini. Extra time dibayar
                      terpisah di slip gaji (mis. datang cepat backup rekan, atau
                      meeting/evaluasi di luar jam kerja).
                      {!isAdmin &&
                        ' Untuk tanggal lampau, perubahanmu perlu disetujui ulang admin.'}
                    </div>
                    <div className="edit-row">
                      <button
                        type="button"
                        className="btn btn--primary btn-mini"
                        onClick={() => simpanEdit(r)}
                      >
                        <Icons.check /> Simpan
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn-mini"
                        onClick={batalEdit}
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        className="btn btn--pink btn-mini"
                        onClick={() => hapusRecord(r)}
                        style={{ marginLeft: 'auto' }}
                      >
                        <Icons.trash /> Hapus
                      </button>
                    </div>
                  </div>
                )}
                </Fragment>
              )
                  })}
                </div>
                )}
              </div>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}
