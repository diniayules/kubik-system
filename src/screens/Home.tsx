import { useEffect, useState } from 'react'
import type { AppData, Employee } from '../types'
import { todayKey } from '../storage'
import {
  SHIFT_DESKRIPSI,
  SHIFT_IKON,
  SHIFT_LABEL,
  SHIFT_LIST,
  SHIFT_RENTANG,
  SHIFT_TARGET_MENIT,
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
import { DEFAULTS } from '../appearance'
import { usePrefs } from '../lib/prefs'

type Props = {
  data: AppData
  isAdmin: boolean
  currentUserId: string
  onPickEmployee: (id: string) => void
  onLihatRiwayat: (id: string) => void
  onRename: (id: string) => void
  onHapus: (id: string) => void
  onAktifkan: (id: string) => void
  onTambah: () => void
  onSetujuiAbsen: (recordId: string) => void
  onTolakAbsen: (recordId: string) => void
}

export function Home({
  data,
  isAdmin,
  currentUserId,
  onPickEmployee,
  onLihatRiwayat,
  onRename,
  onHapus,
  onAktifkan,
  onTambah,
  onSetujuiAbsen,
  onTolakAbsen,
}: Props) {
  const hariIni = todayKey()
  const tanggalLabel = formatTanggalPanjang(hariIni)
  const tampilan = usePrefs().tampilanAbsensi

  const judul = data.headerJudul ?? DEFAULTS.headerJudul
  const sub = data.headerSub ?? DEFAULTS.headerSub

  // Admin adalah pengelola, bukan karyawan yang absen — jadi tidak ikut
  // tampil di roster maupun dihitung di statistik kehadiran.
  const karyawan = data.employees.filter((e) => e.role !== 'admin')
  const karyawanNonaktif = data.inactiveEmployees.filter(
    (e) => e.role !== 'admin',
  )

  // Absensi manual yang menunggu persetujuan admin (tanggal terbaru dulu).
  const pendingAbsen = data.records
    .filter((r) => r.status === 'menunggu')
    .slice()
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal))

  const stats = {
    total: karyawan.length,
    working: 0,
    done: 0,
  }
  for (const emp of karyawan) {
    const rec = data.records.find(
      (r) => r.employeeId === emp.id && r.tanggal === hariIni,
    )
    if (!rec) continue
    if (getEvent(rec, 'pulang')) stats.done += 1
    else if (getEvent(rec, 'masuk')) stats.working += 1
  }

  return (
    <>
      <section className="hero">
        <div className="hero-top">
          <span className="date-pill">{tanggalLabel}</span>
        </div>
        <h1>{renderJudul(judul)}</h1>
        <p className="sub">{sub}</p>

        <div className="hero-stats">
          <div className="stat">
            <span className="dot" style={{ background: 'var(--primary-2)' }} />
            <span className="num">{stats.total}</span>
            <span className="lbl">Karyawan</span>
          </div>
          <div className="stat">
            <span className="dot" style={{ background: 'var(--mint)' }} />
            <span className="num">{stats.working}</span>
            <span className="lbl">Sedang kerja</span>
          </div>
          <div className="stat">
            <span className="dot" style={{ background: 'var(--pink)' }} />
            <span className="num">{stats.done}</span>
            <span className="lbl">Selesai</span>
          </div>
        </div>

        <div className="shift-grid">
          {SHIFT_LIST.map((s) => (
            <div key={s} className={`shift shift--${s === 'full' ? 'penuh' : s}`}>
              <div className="shift-head">
                <span className="shift-emoji">{SHIFT_IKON[s]}</span>
                <h3>{SHIFT_LABEL[s]}</h3>
                <span className="shift-net">
                  {formatDurasi(SHIFT_TARGET_MENIT[s])}
                </span>
              </div>
              <div className="shift-meta">
                <span className="shift-time">
                  {SHIFT_RENTANG[s].replace(' WIB', '')}
                </span>
                <span className="shift-desc">{SHIFT_DESKRIPSI[s]}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="section-head">
        <h2>
          Daftar Karyawan <span className="count-badge">{stats.total}</span>
        </h2>
        {isAdmin && (
          <button type="button" className="btn btn--add" onClick={onTambah}>
            <Icons.info /> Cara Tambah Karyawan
          </button>
        )}
      </div>

      {karyawan.length === 0 ? (
        <div className="emp-empty">
          <div className="ee-emoji">📸</div>
          <h3>Belum ada karyawan</h3>
          <p>
            Karyawan baru mendaftar sendiri di halaman login. Setelah itu
            kartunya muncul di sini.
          </p>
        </div>
      ) : tampilan === 'list' ? (
        <div className="emp-list">
          {karyawan.map((emp) => (
            <EmployeeRow
              key={emp.id}
              employee={emp}
              data={data}
              tanggal={hariIni}
              canAbsen={isAdmin || emp.id === currentUserId}
              canRename={isAdmin || emp.id === currentUserId}
              canManage={isAdmin}
              onAbsen={() => onPickEmployee(emp.id)}
              onRiwayat={() => onLihatRiwayat(emp.id)}
              onRename={() => onRename(emp.id)}
              onHapus={() => onHapus(emp.id)}
            />
          ))}
        </div>
      ) : (
        <div className="emp-grid">
          {karyawan.map((emp) => (
            <EmployeeCard
              key={emp.id}
              employee={emp}
              data={data}
              tanggal={hariIni}
              canAbsen={isAdmin || emp.id === currentUserId}
              canRename={isAdmin || emp.id === currentUserId}
              canManage={isAdmin}
              onAbsen={() => onPickEmployee(emp.id)}
              onRiwayat={() => onLihatRiwayat(emp.id)}
              onRename={() => onRename(emp.id)}
              onHapus={() => onHapus(emp.id)}
            />
          ))}
        </div>
      )}

      {isAdmin && pendingAbsen.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 28 }}>
            <h2>
              Persetujuan Absensi Manual{' '}
              <span className="count-badge">{pendingAbsen.length}</span>
            </h2>
          </div>
          <p className="timeline-help" style={{ marginBottom: 12 }}>
            Karyawan mengisi absensi ini untuk tanggal lampau. Setujui agar
            dihitung sebagai kehadiran resmi, atau tolak untuk menghapusnya.
          </p>
          <div className="emp-list">
            {pendingAbsen.map((r) => {
              const emp =
                data.employees.find((e) => e.id === r.employeeId) ??
                data.inactiveEmployees.find((e) => e.id === r.employeeId)
              const masuk = getEvent(r, 'masuk')
              const pulang = getEvent(r, 'pulang')
              const shiftCls = r.shift === 'full' ? 'penuh' : r.shift
              return (
                <div key={r.id} className="emp-row status-belum">
                  <Avatar
                    name={emp?.nama ?? '?'}
                    colorIndex={colorIndexForName(r.employeeId)}
                    foto={emp?.foto}
                  />
                  <div className="emp-row-info">
                    <div className="emp-row-nama">{emp?.nama ?? 'Karyawan'}</div>
                    <div className="emp-row-meta">
                      <span className="emp-row-role">
                        {formatTanggalPanjang(r.tanggal)}
                      </span>
                      <span className={`badge badge--${shiftCls}`}>
                        {SHIFT_IKON[r.shift]} {SHIFT_LABEL[r.shift]}
                      </span>
                      <span className="badge badge--idle">⏳ Menunggu</span>
                    </div>
                  </div>
                  <div className="emp-row-stats">
                    <div className="emp-row-stat">
                      <span className="k">Masuk</span>
                      <span className={'v' + (masuk ? '' : ' empty')}>
                        {masuk ? formatJam(masuk.waktu) : '—'}
                      </span>
                    </div>
                    <div className="emp-row-stat">
                      <span className="k">Pulang</span>
                      <span className={'v' + (pulang ? '' : ' empty')}>
                        {pulang ? formatJam(pulang.waktu) : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="emp-row-actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => onSetujuiAbsen(r.id)}
                    >
                      <Icons.check /> Setujui
                    </button>
                    <button
                      type="button"
                      className="btn btn--pink"
                      onClick={() => onTolakAbsen(r.id)}
                    >
                      <Icons.x /> Tolak
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {isAdmin && karyawanNonaktif.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 28 }}>
            <h2>
              Karyawan Nonaktif{' '}
              <span className="count-badge">{karyawanNonaktif.length}</span>
            </h2>
          </div>
          <p className="timeline-help" style={{ marginBottom: 12 }}>
            Kartu mereka disembunyikan dari roster dan mereka tidak bisa mengisi
            absen. Klik <strong>Aktifkan kembali</strong> untuk memulihkan.
          </p>
          <div className="emp-list">
            {karyawanNonaktif.map((emp) => (
              <div key={emp.id} className="emp-row status-belum">
                <Avatar
                  name={emp.nama}
                  colorIndex={colorIndexForName(emp.id)}
                  foto={emp.foto}
                />
                <div className="emp-row-info">
                  <div className="emp-row-nama">{emp.nama}</div>
                  <div className="emp-row-meta">
                    <span className="emp-row-role">{emp.jabatan || '—'}</span>
                    <span className="badge badge--none">Nonaktif</span>
                  </div>
                </div>
                <div className="emp-row-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => onAktifkan(emp.id)}
                  >
                    <Icons.check /> Aktifkan kembali
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function renderJudul(judul: string) {
  // Buat emoji 👋 jadi wave animation
  const idx = judul.indexOf('👋')
  if (idx === -1) return judul
  const before = judul.slice(0, idx)
  const after = judul.slice(idx + 2)
  return (
    <>
      {before}
      <span className="wave">👋</span>
      {after}
    </>
  )
}

type CardProps = {
  employee: Employee
  data: AppData
  tanggal: string
  canAbsen: boolean
  canRename: boolean
  canManage: boolean
  onAbsen: () => void
  onRiwayat: () => void
  onRename: () => void
  onHapus: () => void
}

function EmployeeCard({
  employee,
  data,
  tanggal,
  canAbsen,
  canRename,
  canManage,
  onAbsen,
  onRiwayat,
  onRename,
  onHapus,
}: CardProps) {
  const record = data.records.find(
    (r) => r.employeeId === employee.id && r.tanggal === tanggal,
  )
  const masuk = getEvent(record, 'masuk')
  const pulang = getEvent(record, 'pulang')
  const takeover = record ? cariTakeover(record, data.records) : undefined
  const ringkasan = hitungRingkasan(record, takeover)
  const overlapNamaArr = record
    ? cariOperatorOverlap(record, data.records)
        .map((id) => data.employees.find((e) => e.id === id)?.nama)
        .filter(Boolean)
    : []

  let status: 'belum' | 'kerja' | 'selesai' = 'belum'
  if (pulang) status = 'selesai'
  else if (masuk) status = 'kerja'

  const shiftCls =
    record?.shift === 'full' ? 'penuh' : record?.shift ?? ''

  const [elapsed, setElapsed] = useState<string>('')
  useEffect(() => {
    if (status !== 'kerja' || !masuk) return
    const masukMs = new Date(masuk.waktu).getTime()
    const update = () => {
      const diff = Math.max(0, Date.now() - masukMs)
      const total = Math.floor(diff / 1000)
      const h = Math.floor(total / 3600)
      const m = Math.floor((total % 3600) / 60)
      const s = total % 60
      setElapsed(
        `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      )
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [status, masuk])

  return (
    <div className="emp-card">
      <div className="accent-strip" />
      <div className="emp-top">
        <Avatar
          name={employee.nama}
          colorIndex={colorIndexForName(employee.id)}
          foto={employee.foto}
        />
        <div className="emp-id">
          <div className="nm">{employee.nama}</div>
          <div className="role">{employee.jabatan || '—'}</div>
        </div>
        {canRename && (
          <button
            type="button"
            className="emp-x"
            onClick={onRename}
            title="Ubah nama"
          >
            <Icons.pencil />
          </button>
        )}
        {canManage && (
          <button
            type="button"
            className="emp-x"
            onClick={onHapus}
            title="Nonaktifkan karyawan"
          >
            <Icons.x />
          </button>
        )}
      </div>

      <div className="badges">
        {record ? (
          <span className={`badge badge--${shiftCls}`}>
            {SHIFT_IKON[record.shift]} {SHIFT_LABEL[record.shift]}
          </span>
        ) : (
          <span className="badge badge--none">
            <Icons.info /> Belum pilih shift
          </span>
        )}
        {status === 'kerja' && (
          <span className="badge badge--working">
            <span className="live-dot" /> Sedang bekerja
          </span>
        )}
        {status === 'selesai' && (
          <span className="badge badge--done">
            <Icons.check /> Selesai
          </span>
        )}
        {status === 'belum' && record && (
          <span className="badge badge--idle">
            <Icons.clock /> Siap absen
          </span>
        )}
        {ringkasan.overlapMenit > 0 && (
          <span
            className="badge badge--overlap"
            title={`Overlap dengan ${overlapNamaArr.join(', ')}`}
          >
            🤝 Overlap {formatDurasi(ringkasan.overlapMenit)}
          </span>
        )}
        {istirahatDilewatiCount(record) > 0 && (
          <span
            className="badge badge--skip"
            title="Karyawan tidak ambil istirahat — bantu customer"
          >
            🚫 No-break
          </span>
        )}
      </div>

      {status === 'kerja' && (
        <div className="work-banner">
          <Icons.clock /> Sedang bekerja
          <span className="timer">{elapsed || '0:00:00'}</span>
        </div>
      )}

      <div className="metrics">
        <div className="metric">
          <div className="k">Masuk</div>
          <div className={'v' + (masuk ? '' : ' empty')}>
            {masuk ? formatJam(masuk.waktu) : '—'}
          </div>
        </div>
        <div className="metric">
          <div className="k">Pulang</div>
          <div className={'v' + (pulang ? '' : ' empty')}>
            {pulang ? formatJam(pulang.waktu) : '—'}
          </div>
        </div>
        <div className="metric">
          <div className="k">Terlambat</div>
          <div
            className={
              'v' + (ringkasan.terlambatMenit > 0 ? ' late' : ' empty')
            }
          >
            {ringkasan.terlambatMenit > 0
              ? formatDurasi(ringkasan.terlambatMenit)
              : '—'}
          </div>
        </div>
        <div className="metric">
          <div className="k">Lembur</div>
          <div
            className={'v' + (ringkasan.lemburMenit > 0 ? ' over' : ' empty')}
          >
            {ringkasan.lemburMenit > 0
              ? formatDurasi(ringkasan.lemburMenit)
              : '—'}
          </div>
        </div>
      </div>

      <div className="emp-actions">
        {canAbsen && (
          <button
            type="button"
            className={
              status === 'kerja' ? 'btn btn--pink' : 'btn btn--primary'
            }
            onClick={onAbsen}
          >
            {status === 'kerja' ? <Icons.unlock /> : <Icons.arrow />}
            {status === 'kerja'
              ? 'Clock Out'
              : status === 'selesai'
                ? 'Buka Detail'
                : record
                  ? 'Clock In'
                  : 'Atur Absensi'}
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onRiwayat}
          title="Riwayat"
        >
          <Icons.history /> Riwayat
        </button>
      </div>
    </div>
  )
}

function EmployeeRow({
  employee,
  data,
  tanggal,
  canAbsen,
  canRename,
  canManage,
  onAbsen,
  onRiwayat,
  onRename,
  onHapus,
}: CardProps) {
  const record = data.records.find(
    (r) => r.employeeId === employee.id && r.tanggal === tanggal,
  )
  const masuk = getEvent(record, 'masuk')
  const pulang = getEvent(record, 'pulang')
  const ringkasan = hitungRingkasan(
    record,
    record ? cariTakeover(record, data.records) : undefined,
  )
  let status: 'belum' | 'kerja' | 'selesai' = 'belum'
  if (pulang) status = 'selesai'
  else if (masuk) status = 'kerja'
  const shiftCls = record?.shift === 'full' ? 'penuh' : record?.shift ?? ''

  return (
    <div className={`emp-row status-${status}`}>
      <Avatar
        name={employee.nama}
        colorIndex={colorIndexForName(employee.id)}
        foto={employee.foto}
      />
      <div className="emp-row-info">
        <div className="emp-row-nama">{employee.nama}</div>
        <div className="emp-row-meta">
          <span className="emp-row-role">{employee.jabatan || '—'}</span>
          {record && (
            <span className={`badge badge--${shiftCls}`}>
              {SHIFT_IKON[record.shift]} {SHIFT_LABEL[record.shift]}
            </span>
          )}
          {!record && <span className="badge badge--none">Belum shift</span>}
          {status === 'kerja' && (
            <span className="badge badge--working">
              <span className="live-dot" /> Kerja
            </span>
          )}
          {status === 'selesai' && (
            <span className="badge badge--done">Selesai</span>
          )}
        </div>
      </div>

      <div className="emp-row-stats">
        <div className="emp-row-stat">
          <span className="k">In</span>
          <span className={'v' + (masuk ? '' : ' empty')}>
            {masuk ? formatJam(masuk.waktu) : '—'}
          </span>
        </div>
        <div className="emp-row-stat">
          <span className="k">Out</span>
          <span className={'v' + (pulang ? '' : ' empty')}>
            {pulang ? formatJam(pulang.waktu) : '—'}
          </span>
        </div>
        <div className="emp-row-stat">
          <span className="k">Telat</span>
          <span className={'v' + (ringkasan.terlambatMenit > 0 ? ' late' : ' empty')}>
            {ringkasan.terlambatMenit > 0
              ? formatDurasi(ringkasan.terlambatMenit)
              : '—'}
          </span>
        </div>
        <div className="emp-row-stat">
          <span className="k">Lembur</span>
          <span className={'v' + (ringkasan.lemburMenit > 0 ? ' over' : ' empty')}>
            {ringkasan.lemburMenit > 0
              ? formatDurasi(ringkasan.lemburMenit)
              : '—'}
          </span>
        </div>
      </div>

      <div className="emp-row-actions">
        {canAbsen && (
          <button
            type="button"
            className={status === 'kerja' ? 'btn btn--pink' : 'btn btn--primary'}
            onClick={onAbsen}
          >
            {status === 'kerja'
              ? 'Clock Out'
              : status === 'selesai'
                ? 'Detail'
                : record
                  ? 'Clock In'
                  : 'Atur'}
          </button>
        )}
        <button
          type="button"
          className="emp-row-icon"
          onClick={onRiwayat}
          title="Riwayat"
        >
          <Icons.history />
        </button>
        {canRename && (
          <button
            type="button"
            className="emp-row-icon"
            onClick={onRename}
            title="Ubah nama"
          >
            <Icons.pencil />
          </button>
        )}
        {canManage && (
          <button
            type="button"
            className="emp-row-icon emp-row-danger"
            onClick={onHapus}
            title="Nonaktifkan karyawan"
          >
            <Icons.trash />
          </button>
        )}
      </div>
    </div>
  )
}
