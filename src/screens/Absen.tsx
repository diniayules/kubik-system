import { useEffect, useState } from 'react'
import type {
  AbsenEvent,
  AbsenHari,
  AbsenStatus,
  AppData,
  DayType,
  EventTipe,
} from '../types'
import { todayKey, uid } from '../storage'
import {
  DAY_TYPE_LIST,
  EVENT_IKON,
  EVENT_LABEL,
  SHIFT_DESKRIPSI,
  SHIFT_IKON,
  SHIFT_JADWAL,
  SHIFT_LABEL,
  SHIFT_LIST,
  SHIFT_RENTANG,
  SHIFT_URUTAN,
  TIDAK_KERJA_LIST,
  cariOperatorOverlap,
  cariTakeover,
  diffMenit,
  eventBerikutnya,
  formatDurasi,
  formatJam,
  formatTanggalPanjang,
  getEvent,
  hitungRingkasan,
  isHariKerja,
  istirahatDilewatiCount,
  jadwalISO,
} from '../attendance'
import { Avatar, colorIndexForName } from '../components/Avatar'
import { Icons } from '../components/Icons'
import { useToast } from '../components/Toast'

type Props = {
  data: AppData
  setData: (d: AppData) => void
  employeeId: string
  isAdmin: boolean
  /** Tanggal awal yang dibuka (mis. dari tombol Edit di Riwayat). Default hari ini. */
  initialTanggal?: string
  onBack: () => void
  onLihatRiwayat: () => void
}

export function Absen({
  data,
  setData,
  employeeId,
  isAdmin,
  initialTanggal,
  onBack,
  onLihatRiwayat,
}: Props) {
  const toast = useToast()
  const employee = data.employees.find((e) => e.id === employeeId)
  const today = todayKey()
  const [tanggal, setTanggal] = useState(
    initialTanggal && initialTanggal <= today ? initialTanggal : today,
  )
  // Mode manual = mengisi absensi untuk tanggal selain hari ini (mis. lupa
  // absen kemarin). Untuk karyawan, entri manual berstatus 'menunggu' sampai
  // di-ACC admin; absensi real-time hari ini & entri admin langsung disetujui.
  const isManual = tanggal !== today
  const recordStatus: AbsenStatus =
    isManual && !isAdmin ? 'menunggu' : 'disetujui'
  const record = data.records.find(
    (r) => r.employeeId === employeeId && r.tanggal === tanggal,
  )
  const menunggu = record?.status === 'menunggu'
  // Mengedit catatan manual yang SUDAH disetujui (oleh karyawan) mengembalikan
  // statusnya jadi 'menunggu' → perlu persetujuan ulang admin.
  const perluPersetujuanUlang =
    record?.status === 'disetujui' && recordStatus === 'menunggu'
  const takeover = record ? cariTakeover(record, data.records) : undefined
  const ringkasan = hitungRingkasan(record, takeover)
  const overlapNama = record
    ? cariOperatorOverlap(record, data.records)
        .map((id) => data.employees.find((e) => e.id === id)?.nama ?? '?')
        .join(', ')
    : ''
  const next = eventBerikutnya(record)
  const [now, setNow] = useState(() => new Date())
  const [editingTipe, setEditingTipe] = useState<EventTipe | null>(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

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

  // Pesan toast: untuk shift kerja "Shift pagi dipilih", untuk cuti/libur cukup
  // "Cuti dipilih" tanpa kata "shift".
  function labelPilih(shift: DayType): string {
    return isHariKerja(shift)
      ? `Shift ${SHIFT_LABEL[shift].toLowerCase()}`
      : SHIFT_LABEL[shift]
  }

  function pilihShift(shift: DayType) {
    const baru: AbsenHari = {
      id: uid(),
      employeeId,
      tanggal,
      shift,
      events: [],
      status: recordStatus,
    }
    setData({ ...data, records: [...data.records, baru] })
    toast('ok', `${labelPilih(shift)} dipilih`)
  }

  function gantiShift(shift: DayType) {
    if (!record) return
    if (record.events.length > 0) {
      if (
        !confirm(
          'Sudah ada catatan event. Mengganti akan menghapus semua catatan hari ini. Lanjutkan?',
        )
      ) {
        return
      }
    }
    setData({
      ...data,
      records: data.records.map((r) =>
        r.id === record.id
          ? { ...r, shift, events: [], status: recordStatus }
          : r,
      ),
    })
    toast('info', `Diganti ke ${labelPilih(shift).toLowerCase()}`)
    if (perluPersetujuanUlang) {
      toast('warn', 'Catatan diubah — perlu persetujuan ulang admin')
    }
  }

  function catatEvent(tipe: EventTipe) {
    if (!record || !isHariKerja(record.shift)) return
    const waktu = new Date().toISOString()

    // Auto-prompt: kalau klik pulang tapi belum ada catatan istirahat sama sekali
    if (tipe === 'pulang') {
      const istirahatTipes = SHIFT_URUTAN[record.shift].filter(
        (s) => s.startsWith('istirahat-'),
      )
      const adaIstirahat = istirahatTipes.some((s) => getEvent(record, s))
      if (istirahatTipes.length > 0 && !adaIstirahat) {
        const lewati = confirm(
          'Belum ada catatan istirahat hari ini. Hari ini tanpa istirahat?\n\nOK = Tandai istirahat dilewati & catat pulang\nCancel = Batalkan (catat istirahat dulu)',
        )
        if (!lewati) return
        // Mark all unlogged break events as dilewati at current time
        const skipped: AbsenEvent[] = istirahatTipes.map((s) => ({
          tipe: s,
          waktu,
          dilewati: true,
        }))
        const updated: AbsenHari = {
          ...record,
          status: recordStatus,
          events: [...record.events, ...skipped, { tipe, waktu }],
        }
        setData({
          ...data,
          records: data.records.map((r) => (r.id === record.id ? updated : r)),
        })
        toast('info', `Istirahat dilewati · Pulang ${formatJam(waktu)}`)
        return
      }
    }

    const ada = record.events.some((e) => e.tipe === tipe)
    let updated: AbsenHari
    if (ada) {
      if (
        !confirm(
          `Sudah pernah dicatat "${EVENT_LABEL[tipe]}". Timpa dengan waktu sekarang?`,
        )
      ) {
        return
      }
      updated = {
        ...record,
        status: recordStatus,
        events: record.events.map((e) => (e.tipe === tipe ? { tipe, waktu } : e)),
      }
    } else {
      updated = {
        ...record,
        status: recordStatus,
        events: [...record.events, { tipe, waktu }],
      }
    }
    setData({
      ...data,
      records: data.records.map((r) => (r.id === record.id ? updated : r)),
    })
    toast('ok', `${EVENT_LABEL[tipe]} ${formatJam(waktu)}`)
  }

  function lewatiIstirahat(mulaiTipe: EventTipe) {
    if (!record || !isHariKerja(record.shift)) return
    const shift = record.shift
    const selesaiTipe: EventTipe =
      mulaiTipe === 'istirahat-siang-mulai'
        ? 'istirahat-siang-selesai'
        : 'istirahat-sore-selesai'
    // Untuk entri manual (tanggal lampau), stempel pakai jam jadwal supaya tidak
    // ter-cap waktu hari ini; untuk hari ini pakai waktu sekarang.
    const stempel = (tipe: EventTipe) =>
      isManual
        ? jadwalISO(tanggal, SHIFT_JADWAL[shift][tipe] ?? '00:00')
        : new Date().toISOString()
    const mulaiEv: AbsenEvent = {
      tipe: mulaiTipe,
      waktu: stempel(mulaiTipe),
      dilewati: true,
    }
    const selesaiEv: AbsenEvent = {
      tipe: selesaiTipe,
      waktu: stempel(selesaiTipe),
      dilewati: true,
    }
    const bersih = record.events.filter(
      (e) => e.tipe !== mulaiTipe && e.tipe !== selesaiTipe,
    )
    const updated: AbsenHari = {
      ...record,
      status: recordStatus,
      events: [...bersih, mulaiEv, selesaiEv],
    }
    setData({
      ...data,
      records: data.records.map((r) => (r.id === record.id ? updated : r)),
    })
    toast(
      'info',
      `${mulaiTipe.includes('siang') ? 'Istirahat siang' : 'Istirahat sore'} dilewati`,
    )
    if (perluPersetujuanUlang) {
      toast('warn', 'Catatan diubah — perlu persetujuan ulang admin')
    }
  }

  function bukaEdit(tipe: EventTipe) {
    if (!record || !isHariKerja(record.shift)) return
    const ev = getEvent(record, tipe)
    const jamDefault = ev
      ? formatJam(ev.waktu)
      : SHIFT_JADWAL[record.shift][tipe] ?? formatJam(new Date().toISOString())
    setEditingTipe(tipe)
    setEditValue(jamDefault)
  }
  function batalEdit() {
    setEditingTipe(null)
    setEditValue('')
  }
  function simpanEdit() {
    if (!record || !editingTipe) return
    if (!/^\d{2}:\d{2}$/.test(editValue)) {
      alert('Format waktu tidak valid (gunakan HH:MM)')
      return
    }
    const waktuBaru = jadwalISO(tanggal, editValue)
    const sekarang = new Date().toISOString()
    const adaSekarang = getEvent(record, editingTipe)
    let baru: AbsenEvent
    if (adaSekarang) {
      baru = {
        tipe: editingTipe,
        waktu: waktuBaru,
        waktuAsli: adaSekarang.waktuAsli ?? adaSekarang.waktu,
        diubahPada: sekarang,
        manual: adaSekarang.manual,
      }
    } else {
      baru = {
        tipe: editingTipe,
        waktu: waktuBaru,
        diubahPada: sekarang,
        manual: true,
      }
    }
    const updated: AbsenHari = {
      ...record,
      status: recordStatus,
      events: adaSekarang
        ? record.events.map((e) => (e.tipe === editingTipe ? baru : e))
        : [...record.events, baru],
    }
    setData({
      ...data,
      records: data.records.map((r) => (r.id === record.id ? updated : r)),
    })
    toast('info', `${EVENT_LABEL[editingTipe]} di-edit ke ${editValue}`)
    if (perluPersetujuanUlang) {
      toast('warn', 'Catatan diubah — perlu persetujuan ulang admin')
    }
    batalEdit()
  }

  // Pindahkan catatan ke tanggal lain TANPA mengetik ulang jam — dipakai saat
  // jamnya sudah benar tapi tanggalnya salah. Jam (HH:MM) tiap event di-stempel
  // ulang ke tanggal baru; untuk karyawan, status kembali jadi 'menunggu'.
  function pindahTanggal() {
    if (!record) return
    const input = prompt(
      `Pindahkan catatan absensi ${formatTanggalPanjang(tanggal)} ke tanggal lain.\n` +
        `Jam yang sudah diisi akan tetap dipertahankan.\n\n` +
        `Tanggal tujuan (format YYYY-MM-DD):`,
      tanggal,
    )?.trim()
    if (!input) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(Date.parse(input))) {
      alert('Format tanggal tidak valid (gunakan YYYY-MM-DD).')
      return
    }
    if (input === tanggal) return
    if (input > today) {
      alert('Tidak bisa memindahkan ke tanggal di masa depan.')
      return
    }
    const bentrok = data.records.some(
      (r) =>
        r.employeeId === employeeId &&
        r.tanggal === input &&
        r.id !== record.id,
    )
    if (bentrok) {
      alert(
        'Sudah ada catatan absensi di tanggal itu. Hapus dulu salah satu sebelum memindahkan.',
      )
      return
    }
    const targetStatus: AbsenStatus =
      input !== today && !isAdmin ? 'menunggu' : 'disetujui'
    const events = record.events.map((e) => ({
      ...e,
      waktu: jadwalISO(input, formatJam(e.waktu)),
      waktuAsli: e.waktuAsli ? jadwalISO(input, formatJam(e.waktuAsli)) : e.waktuAsli,
    }))
    const updated: AbsenHari = {
      ...record,
      tanggal: input,
      events,
      status: targetStatus,
    }
    setData({
      ...data,
      records: data.records.map((r) => (r.id === record.id ? updated : r)),
    })
    setTanggal(input)
    batalEdit()
    toast('ok', `Catatan dipindahkan ke ${formatTanggalPanjang(input)}`)
    if (record.status === 'disetujui' && targetStatus === 'menunggu') {
      toast('warn', 'Tanggal diubah — perlu persetujuan ulang admin')
    }
  }

  // Atur waktu ekstra berbayar (manual): datang lebih cepat untuk backup rekan,
  // atau meeting/evaluasi di luar jam kerja. Dibayar terpisah di slip gaji.
  function aturExtra() {
    if (!record) return
    const menitStr = prompt(
      'Extra time (menit) — datang lebih cepat untuk backup rekan, atau meeting/evaluasi di luar jam kerja:',
      String(record.extraMenit ?? 0),
    )
    if (menitStr == null) return
    const menit = Math.max(0, Math.round(Number(menitStr) || 0))
    let catatan = record.extraCatatan ?? ''
    if (menit > 0) {
      const c = prompt(
        'Catatan extra time (mis. backup shift sore, meeting bulanan):',
        catatan,
      )
      if (c == null) return
      catatan = c.trim()
    } else {
      catatan = ''
    }
    const updated: AbsenHari = {
      ...record,
      extraMenit: menit,
      extraCatatan: catatan || undefined,
      status: recordStatus,
    }
    setData({
      ...data,
      records: data.records.map((r) => (r.id === record.id ? updated : r)),
    })
    toast(
      'ok',
      menit > 0 ? `Extra time ${menit} menit dicatat` : 'Extra time dihapus',
    )
    if (record.status === 'disetujui' && recordStatus === 'menunggu') {
      toast('warn', 'Perubahan perlu persetujuan ulang admin')
    }
  }

  function resetHariIni() {
    if (!record) return
    if (
      !confirm(
        `Hapus semua catatan absensi ${formatTanggalPanjang(tanggal)}? Aksi ini tidak bisa dibatalkan.`,
      )
    ) {
      return
    }
    setData({
      ...data,
      records: data.records.filter((r) => r.id !== record.id),
    })
    toast('warn', 'Catatan absensi dihapus')
  }

  return (
    <>
      <button type="button" className="back-link" onClick={onBack}>
        <Icons.back /> Kembali ke daftar karyawan
      </button>

      <section className="detail-head">
        <Avatar
          name={employee.nama}
          colorIndex={colorIndexForName(employee.id)}
          size="lg"
        />
        <div className="emp-id">
          <div className="nm">{employee.nama}</div>
          <div className="role">{employee.jabatan || '—'}</div>
          <div className="tanggal">{formatTanggalPanjang(tanggal)}</div>
        </div>
        <div className="absen-tanggal-pick">
          <label className="absen-tanggal-label" htmlFor="absen-tanggal">
            Tanggal absensi
          </label>
          <input
            id="absen-tanggal"
            type="date"
            className="edit-time"
            value={tanggal}
            max={today}
            onChange={(e) => {
              setTanggal(e.target.value || today)
              batalEdit()
            }}
          />
          {isManual && (
            <button
              type="button"
              className="btn-mini btn-mini-ghost"
              onClick={() => setTanggal(today)}
            >
              Hari ini
            </button>
          )}
        </div>
        <div className="detail-clock">
          <div className="jam">
            {String(now.getHours()).padStart(2, '0')}:
            {String(now.getMinutes()).padStart(2, '0')}:
            {String(now.getSeconds()).padStart(2, '0')}
          </div>
          <div className="zone">WIB</div>
        </div>
      </section>

      {isManual && (
        <div className="overlap-banner manual-banner">
          📅 <strong>Absensi manual untuk {formatTanggalPanjang(tanggal)}</strong>
          {isAdmin ? (
            <div className="overlap-sub">
              Entri admin untuk tanggal lampau langsung tercatat sebagai
              kehadiran resmi (tidak perlu persetujuan).
            </div>
          ) : perluPersetujuanUlang ? (
            <div className="overlap-sub">
              ✅ Catatan ini <strong>sudah disetujui</strong>. Jika kamu
              mengubahnya (mengedit jam atau shift), statusnya kembali jadi{' '}
              <strong>menunggu</strong> dan perlu <strong>persetujuan ulang
              admin</strong> sebelum dihitung lagi sebagai kehadiran resmi.
            </div>
          ) : (
            <div className="overlap-sub">
              Isi jam dengan tombol <strong>Edit</strong> pada tiap baris. Setelah
              disimpan, entri ini berstatus <strong>menunggu persetujuan admin</strong>{' '}
              dan belum dihitung sebagai kehadiran resmi sampai disetujui.
            </div>
          )}
        </div>
      )}

      {menunggu && (
        <div className="overlap-banner pending-banner">
          ⏳ <strong>Menunggu persetujuan admin</strong>
          <div className="overlap-sub">
            Catatan ini belum dihitung sebagai kehadiran resmi. Admin dapat
            menyetujui atau menolaknya dari halaman Absensi.
          </div>
        </div>
      )}

      {!record ? (
        <ShiftPicker onPick={pilihShift} />
      ) : !isHariKerja(record.shift) ? (
        <section className="detail-card">
          <ShiftBadge shift={record.shift} onChange={gantiShift} />
          <CutiLiburInfo shift={record.shift} />
        </section>
      ) : (
        <>
          <section className="detail-card">
            <ShiftBadge shift={record.shift} onChange={gantiShift} />
            {isManual ? (
              <div className="next-action">
                <div className="next-label">Isi jam manual</div>
                <div className="next-value">
                  Gunakan tombol <strong>Edit</strong> pada tiap baris di bawah
                  untuk mengisi jam {EVENT_LABEL.masuk.toLowerCase()}, istirahat,
                  dan pulang.
                </div>
              </div>
            ) : next ? (
              <div className="next-action">
                <div className="next-label">Berikutnya</div>
                <div className="next-value">
                  {EVENT_IKON[next]} {EVENT_LABEL[next]}{' '}
                  <span className="next-jadwal">
                    (jadwal {SHIFT_JADWAL[record.shift][next] ?? '—'})
                  </span>
                </div>
                <div className="next-buttons">
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    onClick={() => catatEvent(next)}
                  >
                    <Icons.check /> Catat {EVENT_LABEL[next]}
                  </button>
                  {(next === 'istirahat-siang-mulai' ||
                    next === 'istirahat-sore-mulai') && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--lg"
                      onClick={() => lewatiIstirahat(next)}
                      title="Bantu customer, tidak istirahat — stempel di audit trail"
                    >
                      🚫 Lewati Istirahat
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="next-action selesai">
                <div className="next-label">
                  ✅ Semua catatan {SHIFT_LABEL[record.shift].toLowerCase()}{' '}
                  lengkap
                </div>
              </div>
            )}
          </section>

          <section className="detail-card">
            <h2>Ringkasan Hari Ini</h2>
            {(record.extraMenit ?? 0) > 0 && (
              <div className="overlap-banner extra-banner">
                ➕{' '}
                <strong>
                  Extra time {formatDurasi(record.extraMenit ?? 0)}
                </strong>
                {record.extraCatatan ? ` · ${record.extraCatatan}` : ''}
                <div className="overlap-sub">
                  Dibayar terpisah di slip gaji (backup / meeting di luar jam
                  kerja).
                </div>
              </div>
            )}
            {istirahatDilewatiCount(record) > 0 && (
              <div className="overlap-banner skip-banner">
                🚫{' '}
                <strong>
                  {istirahatDilewatiCount(record)} istirahat dilewati
                </strong>{' '}
                — karyawan tidak ambil break (mis. bantu customer). Jam kerja
                bersih sudah ditambah otomatis 60 menit per istirahat yang
                dilewati.
              </div>
            )}
            {ringkasan.overlapMenit > 0 && (
              <div className="overlap-banner">
                🤝{' '}
                <strong>
                  Overlap dengan shift berikutnya{' '}
                  {formatDurasi(ringkasan.overlapMenit)}
                </strong>{' '}
                ({formatJam(ringkasan.overlapMulai)} →{' '}
                {formatJam(ringkasan.overlapSelesai)})
                {overlapNama && <> · bersama {overlapNama}</>}
                <div className="overlap-sub">
                  Lembur dihitung penuh — atasan akan meninjau saat payroll.
                </div>
              </div>
            )}
            <div className="ringkasan-grid">
              <RingkasanItem
                label="Jam kerja bersih"
                value={
                  ringkasan.sudahPulang
                    ? formatDurasi(ringkasan.kerjaBersihMenit)
                    : 'Belum pulang'
                }
                hint={`Target ${formatDurasi(ringkasan.targetKerjaMenit)}`}
                tone="primary"
              />
              <RingkasanItem
                label="Terlambat masuk"
                value={
                  ringkasan.terlambatMenit > 0
                    ? formatDurasi(ringkasan.terlambatMenit)
                    : 'Tepat waktu'
                }
                tone={ringkasan.terlambatMenit > 0 ? 'danger' : 'success'}
              />
              <RingkasanItem
                label="Lembur"
                value={
                  ringkasan.lemburMenit > 0
                    ? formatDurasi(ringkasan.lemburMenit)
                    : '—'
                }
                tone={ringkasan.lemburMenit > 0 ? 'success' : 'muted'}
              />
              <RingkasanItem
                label="Istirahat melebihi jatah"
                value={
                  ringkasan.istirahatLebihMenit > 0
                    ? formatDurasi(ringkasan.istirahatLebihMenit)
                    : '—'
                }
                tone={
                  ringkasan.istirahatLebihMenit > 0 ? 'warning' : 'muted'
                }
              />
            </div>
          </section>

          <section className="detail-card">
            <h2>Detail Catatan</h2>
            <p className="timeline-help">
              💡 Lupa klik tepat waktu? Tombol <strong>Edit</strong>{' '}
              menyimpan jam yang benar dengan jejak audit otomatis.
            </p>
            <ol className="timeline-list">
              {SHIFT_URUTAN[record.shift].map((tipe) => {
                const ev = getEvent(record, tipe)
                const jadwal = isHariKerja(record.shift)
                  ? SHIFT_JADWAL[record.shift][tipe] ?? ''
                  : ''
                let info: {
                  label: string
                  tone: 'success' | 'danger' | 'warning' | 'muted'
                } = { label: 'Belum dicatat', tone: 'muted' }
                if (ev && jadwal) {
                  const selisih = diffMenit(ev.waktu, jadwalISO(tanggal, jadwal))
                  if (selisih === 0) info = { label: 'Tepat waktu', tone: 'success' }
                  else if (selisih > 0) {
                    if (
                      tipe === 'masuk' ||
                      tipe === 'istirahat-siang-selesai' ||
                      tipe === 'istirahat-sore-selesai'
                    ) {
                      info = { label: `Telat ${formatDurasi(selisih)}`, tone: 'danger' }
                    } else if (
                      tipe === 'pulang' ||
                      tipe === 'istirahat-siang-mulai' ||
                      tipe === 'istirahat-sore-mulai'
                    ) {
                      info = { label: `Lembur ${formatDurasi(selisih)}`, tone: 'success' }
                    } else {
                      info = { label: `Lebih lambat ${formatDurasi(selisih)}`, tone: 'warning' }
                    }
                  } else {
                    info = { label: `Lebih cepat ${formatDurasi(-selisih)}`, tone: 'warning' }
                  }
                }
                const sedangEdit = editingTipe === tipe
                return (
                  <li key={tipe} className={`timeline-item ${ev ? 'done' : ''}`}>
                    <div className="timeline-ikon">{EVENT_IKON[tipe]}</div>
                    <div>
                      <div className="timeline-label">{EVENT_LABEL[tipe]}</div>
                      <div className="timeline-jadwal">Jadwal {jadwal}</div>
                      {ev && <AuditBadge ev={ev} />}
                    </div>
                    <div className="timeline-jam">
                      <div className="timeline-aktual">{formatJam(ev?.waktu)}</div>
                      <div className={`timeline-info tone-${info.tone}`}>
                        {info.label}
                      </div>
                    </div>
                    <div className="timeline-actions">
                      {!ev && !isManual && (
                        <button
                          type="button"
                          className="btn-mini"
                          onClick={() => catatEvent(tipe)}
                        >
                          Catat
                        </button>
                      )}
                      {!ev &&
                        (tipe === 'istirahat-siang-mulai' ||
                          tipe === 'istirahat-sore-mulai') && (
                          <button
                            type="button"
                            className="btn-mini btn-mini-skip"
                            onClick={() => lewatiIstirahat(tipe)}
                            title="Tandai istirahat dilewati"
                          >
                            🚫 Lewati
                          </button>
                        )}
                      <button
                        type="button"
                        className="btn-mini btn-mini-edit"
                        onClick={() => bukaEdit(tipe)}
                      >
                        <Icons.pencil /> Edit
                      </button>
                    </div>
                    {sedangEdit && (
                      <div className="edit-panel">
                        <div className="edit-label">Atur waktu manual:</div>
                        <div className="edit-row">
                          <input
                            type="time"
                            className="edit-time"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="btn btn--primary btn-mini"
                            onClick={simpanEdit}
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
                        </div>
                        <div className="edit-hint">
                          Perubahan dicatat sebagai audit trail.
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        </>
      )}

      <div className="bottom-actions">
        <button type="button" className="btn btn--ghost" onClick={onLihatRiwayat}>
          <Icons.history /> Lihat Riwayat
        </button>
        {record && (
          <button type="button" className="btn btn--ghost" onClick={pindahTanggal}>
            📅 Ubah Tanggal
          </button>
        )}
        {record && (
          <button type="button" className="btn btn--ghost" onClick={aturExtra}>
            ➕ Extra Time
          </button>
        )}
        {record && (
          <button type="button" className="btn btn--pink" onClick={resetHariIni}>
            <Icons.trash /> {isManual ? 'Hapus Catatan' : 'Reset Hari Ini'}
          </button>
        )}
      </div>
    </>
  )
}

function ShiftPicker({ onPick }: { onPick: (s: DayType) => void }) {
  return (
    <section className="detail-card">
      <h2>Pilih Shift Hari Ini</h2>
      <p className="timeline-help">
        Pilih shift kerja, atau tandai hari ini sebagai cuti / libur studio.
      </p>
      <div className="shift-pick" style={{ marginTop: 12 }}>
        {SHIFT_LIST.map((s) => (
          <button
            key={s}
            type="button"
            className="shift-opt"
            onClick={() => onPick(s)}
          >
            <div className="so-emoji">{SHIFT_IKON[s]}</div>
            <div className="so-name">{SHIFT_LABEL[s].replace('Shift ', '')}</div>
            <div className="so-time">{SHIFT_RENTANG[s].replace(' WIB', '')}</div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink-soft)',
                marginTop: 6,
                lineHeight: 1.4,
              }}
            >
              {SHIFT_DESKRIPSI[s]}
            </div>
          </button>
        ))}
      </div>

      <div className="shift-pick-sep">atau tandai tidak bekerja</div>
      <div className="shift-pick shift-pick--off">
        {TIDAK_KERJA_LIST.map((s) => (
          <button
            key={s}
            type="button"
            className={`shift-opt shift-opt--${s}`}
            onClick={() => onPick(s)}
          >
            <div className="so-emoji">{SHIFT_IKON[s]}</div>
            <div className="so-name">{SHIFT_LABEL[s]}</div>
            <div className="so-time">{SHIFT_RENTANG[s]}</div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink-soft)',
                marginTop: 6,
                lineHeight: 1.4,
              }}
            >
              {SHIFT_DESKRIPSI[s]}
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function CutiLiburInfo({ shift }: { shift: 'cuti' | 'libur' }) {
  return (
    <div className="next-action selesai">
      <div className="next-label">
        {SHIFT_IKON[shift]} Hari ini ditandai{' '}
        <strong>{SHIFT_LABEL[shift]}</strong>
      </div>
      <div className="next-value">
        {shift === 'cuti'
          ? 'Cuti pribadi — jatah 2 hari/bulan tidak memotong gaji. Cuti ke-3 dan seterusnya memotong 1 hari kerja.'
          : 'Studio tutup / libur bersama — gaji tetap penuh dan tidak memakai jatah cuti.'}{' '}
        Tidak ada jam kerja yang perlu dicatat. Gunakan{' '}
        <strong>Ganti shift</strong> di atas bila ingin mengubahnya.
      </div>
    </div>
  )
}

function ShiftBadge({
  shift,
  onChange,
}: {
  shift: DayType
  onChange: (s: DayType) => void
}) {
  const [showOpsi, setShowOpsi] = useState(false)
  const shiftCls = shift === 'full' ? 'penuh' : shift
  return (
    <div className="shift-bar">
      <div className="shift-bar-info">
        <span className={`badge badge--${shiftCls}`}>
          {SHIFT_IKON[shift]} {SHIFT_LABEL[shift]}
        </span>
        <span className="shift-bar-rentang">{SHIFT_RENTANG[shift]}</span>
      </div>
      <button
        type="button"
        className="btn btn--ghost btn-mini-ghost"
        onClick={() => setShowOpsi((v) => !v)}
      >
        {showOpsi ? 'Tutup' : 'Ganti shift'}
      </button>
      {showOpsi && (
        <div className="shift-bar-opsi">
          {DAY_TYPE_LIST.filter((s) => s !== shift).map((s) => (
            <button
              key={s}
              type="button"
              className="shift-opsi"
              onClick={() => {
                onChange(s)
                setShowOpsi(false)
              }}
            >
              {SHIFT_IKON[s]} Ganti ke {SHIFT_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AuditBadge({ ev }: { ev: AbsenEvent }) {
  if (ev.dilewati) {
    return (
      <div className="audit-badge audit-skip">
        🚫 Tidak istirahat — bantu customer
      </div>
    )
  }
  if (!ev.manual && !ev.waktuAsli) return null
  const waktuDiubah = ev.diubahPada
    ? new Date(ev.diubahPada).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null
  if (ev.manual && !ev.waktuAsli) {
    return (
      <div className="audit-badge audit-manual">
        📝 Manual{waktuDiubah ? ` · ${waktuDiubah}` : ''}
      </div>
    )
  }
  return (
    <div className="audit-badge audit-edit">
      ✏️ Diubah dari {formatJam(ev.waktuAsli)}
      {waktuDiubah ? ` · ${waktuDiubah}` : ''}
    </div>
  )
}

type ItemProps = {
  label: string
  value: string
  hint?: string
  tone: 'primary' | 'success' | 'danger' | 'warning' | 'muted'
}

function RingkasanItem({ label, value, hint, tone }: ItemProps) {
  return (
    <div className={`ringkasan-item tone-${tone}`}>
      <div className="ringkasan-label">{label}</div>
      <div className="ringkasan-value">{value}</div>
      {hint && <div className="ringkasan-hint">{hint}</div>}
    </div>
  )
}
