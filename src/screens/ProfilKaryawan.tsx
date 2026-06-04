import { useMemo, useRef, useState } from 'react'
import type { AppData, Employee } from '../types'
import {
  cariTakeover,
  formatDurasi,
  getEvent,
  hitungRingkasan,
} from '../attendance'
import { formatRupiah, ringkasanPerKaryawan } from '../income'
import { Avatar, colorIndexForName } from '../components/Avatar'
import { Modal, ModalHead } from '../components/Modal'
import { Icons } from '../components/Icons'

type Props = {
  data: AppData
  setData: (d: AppData) => void
  isAdmin: boolean
  currentUserId: string
}

/** Ringkasan profil seorang karyawan — diturunkan dari seluruh data absensi & penjualan. */
type Profil = {
  hariHadir: number
  kerjaMenit: number
  terlambatMenit: number
  lemburMenit: number
  hariCuti: number
  hariLibur: number
  jumlahItem: number
  totalPenjualan: number
}

const PROFIL_KOSONG: Profil = {
  hariHadir: 0,
  kerjaMenit: 0,
  terlambatMenit: 0,
  lemburMenit: 0,
  hariCuti: 0,
  hariLibur: 0,
  jumlahItem: 0,
  totalPenjualan: 0,
}

/** "1998-05-12" → "12 Mei 1998". Kosong → "—". */
function formatTanggalID(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return '—'
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function ProfilKaryawan({ data, setData, isAdmin, currentUserId }: Props) {
  // Admin = pengelola: lihat profil semua karyawan.
  // Karyawan: hanya profil miliknya sendiri.
  const karyawan = useMemo(
    () =>
      data.employees.filter((e) =>
        isAdmin ? e.role !== 'admin' : e.id === currentUserId,
      ),
    [data.employees, isAdmin, currentUserId],
  )

  // Karyawan yang sedang ditampilkan (full-page) & yang sedang diedit.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Employee | null>(null)

  // Profil aktif: pilihan user kalau masih valid, jika tidak ambil yang pertama.
  const selected =
    karyawan.find((e) => e.id === selectedId) ?? karyawan[0] ?? null

  // Hitung ringkasan seumur-hidup (semua bulan) untuk karyawan yang ditampilkan.
  const profil = useMemo<Profil>(() => {
    if (!selected) return PROFIL_KOSONG
    const p: Profil = { ...PROFIL_KOSONG }
    for (const rec of data.records) {
      if (rec.employeeId !== selected.id) continue
      if (rec.status === 'menunggu') continue // belum disetujui → tidak dihitung
      if (rec.shift === 'cuti') {
        p.hariCuti += 1
        continue
      }
      if (rec.shift === 'libur') {
        p.hariLibur += 1
        continue
      }
      const ring = hitungRingkasan(rec, cariTakeover(rec, data.records))
      if (getEvent(rec, 'masuk')) p.hariHadir += 1
      p.kerjaMenit += ring.kerjaBersihMenit
      p.terlambatMenit += ring.terlambatMenit
      p.lemburMenit += ring.lemburMenit
    }
    for (const lap of data.laporanIncome) {
      const r = ringkasanPerKaryawan(lap)[selected.id]
      if (!r) continue
      p.jumlahItem += r.tiket + r.cetak + r.upgrade + r.produk
      p.totalPenjualan += r.total
    }
    return p
  }, [selected, data.records, data.laporanIncome])

  function simpanProfil(next: Employee) {
    setData({
      ...data,
      employees: data.employees.map((e) => (e.id === next.id ? next : e)),
    })
    setEditing(null)
  }

  if (!selected) {
    return (
      <div className="gaji-empty">
        {isAdmin
          ? 'Belum ada karyawan. Karyawan baru mendaftar sendiri di halaman login.'
          : 'Profil kamu belum tersedia.'}
      </div>
    )
  }

  const gajiPokok = data.gajiPokok[selected.id] ?? 0
  const canEdit = isAdmin || selected.id === currentUserId
  const role = selected.role ?? 'karyawan'

  return (
    <>
      {/* Pemilih karyawan — hanya admin & jika lebih dari satu */}
      {isAdmin && karyawan.length > 1 && (
        <div className="profil-switcher">
          {karyawan.map((e) => (
            <button
              key={e.id}
              type="button"
              className={
                'profil-switcher-btn' +
                (e.id === selected.id ? ' is-active' : '')
              }
              onClick={() => setSelectedId(e.id)}
            >
              <Avatar
                name={e.nama}
                colorIndex={colorIndexForName(e.id)}
                size="sm"
                foto={e.foto}
              />
              <span>{e.nama}</span>
            </button>
          ))}
        </div>
      )}

      {/* Lembar profil */}
      <div className="profil-sheet">
        <div className="profil-sheet-head">
          <Avatar
            name={selected.nama}
            colorIndex={colorIndexForName(selected.id)}
            size="lg"
            foto={selected.foto}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nm">{selected.nama}</div>
            <div className="role">{selected.jabatan || 'Karyawan'}</div>
            <div className="profil-nik">
              NIK · {selected.nomorInduk || '—'}
            </div>
            <span className={`role-pill role-${role}`} style={{ marginTop: 6, display: 'inline-flex' }}>
              {role === 'admin' ? '🛡️ Admin' : '👤 Karyawan'}
            </span>
          </div>
          {canEdit && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setEditing(selected)}
            >
              <Icons.pencil /> Edit
            </button>
          )}
        </div>

        <section className="profil-sheet-sect">
          <h3>Data Pribadi</h3>
          <Row label="Nama lengkap" val={selected.namaLengkap || '—'} />
          <Row label="Nama panggilan" val={selected.nama} />
          <Row label="Jabatan" val={selected.jabatan || '—'} />
          <Row label="Tempat lahir" val={selected.tempatLahir || '—'} />
          <Row label="Tanggal lahir" val={formatTanggalID(selected.tanggalLahir)} />
          <Row label="Pendidikan terakhir" val={selected.pendidikan || '—'} />
          <Row label="Mulai kerja" val={formatTanggalID(selected.tanggalDiterima)} />
        </section>

        <section className="profil-sheet-sect">
          <h3>Kehadiran</h3>
          <Row label="Hari hadir" val={`${profil.hariHadir} hari`} />
          <Row label="Total jam kerja" val={formatDurasi(profil.kerjaMenit)} />
          <Row label="Terlambat" val={formatDurasi(profil.terlambatMenit)} />
          <Row label="Lembur" val={formatDurasi(profil.lemburMenit)} />
          <Row label="Cuti" val={`${profil.hariCuti} hari`} />
          <Row label="Libur studio" val={`${profil.hariLibur} hari`} />
        </section>

        <section className="profil-sheet-sect">
          <h3>Penjualan &amp; Gaji</h3>
          <Row label="Item terjual" val={`${profil.jumlahItem} item`} />
          <Row label="Total penjualan" val={formatRupiah(profil.totalPenjualan)} />
          <Row
            label="Gaji pokok / bulan"
            val={gajiPokok > 0 ? formatRupiah(gajiPokok) : 'Belum diatur'}
          />
        </section>
      </div>

      {editing && (
        <EditProfilModal
          employee={editing}
          isAdmin={isAdmin}
          onSave={simpanProfil}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function Row({ label, val }: { label: string; val: string }) {
  return (
    <div className="profil-row">
      <span className="profil-row-label">{label}</span>
      <span className="profil-row-val">{val}</span>
    </div>
  )
}

// =============================================================
// Modal edit profil
// =============================================================

/** Maks dimensi foto avatar (px) — di-resize di client agar data URL kecil. */
const FOTO_MAX = 320

/** Baca File gambar, resize ≤ FOTO_MAX, kembalikan data URL JPEG. */
function fileToFotoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('File bukan gambar yang valid'))
      img.onload = () => {
        const skala = Math.min(1, FOTO_MAX / Math.max(img.width, img.height))
        const w = Math.round(img.width * skala)
        const h = Math.round(img.height * skala)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas tidak didukung'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

function EditProfilModal({
  employee,
  isAdmin,
  onSave,
  onClose,
}: {
  employee: Employee
  isAdmin: boolean
  onSave: (e: Employee) => void
  onClose: () => void
}) {
  const [nama, setNama] = useState(employee.nama)
  const [nomorInduk, setNomorInduk] = useState(employee.nomorInduk ?? '')
  const [foto, setFoto] = useState<string | undefined>(employee.foto)
  const [namaLengkap, setNamaLengkap] = useState(employee.namaLengkap ?? '')
  const [jabatan, setJabatan] = useState(employee.jabatan ?? '')
  const [tempatLahir, setTempatLahir] = useState(employee.tempatLahir ?? '')
  const [tanggalLahir, setTanggalLahir] = useState(employee.tanggalLahir ?? '')
  const [pendidikan, setPendidikan] = useState(employee.pendidikan ?? '')
  const [tanggalDiterima, setTanggalDiterima] = useState(
    employee.tanggalDiterima ?? '',
  )
  const [fotoError, setFotoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function pilihFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // boleh pilih file sama lagi
    if (!file) return
    setFotoError(null)
    try {
      setFoto(await fileToFotoDataUrl(file))
    } catch (err) {
      setFotoError(err instanceof Error ? err.message : 'Gagal memproses foto')
    }
  }

  function simpan() {
    onSave({
      ...employee,
      nama: nama.trim() || employee.nama,
      // Nomor Induk Karyawan hanya admin yang boleh mengubah.
      nomorInduk: isAdmin ? nomorInduk.trim() : employee.nomorInduk,
      foto,
      namaLengkap: namaLengkap.trim(),
      // Jabatan hanya admin yang boleh mengubah (tampil di slip gaji).
      jabatan: isAdmin ? jabatan.trim() : employee.jabatan,
      tempatLahir: tempatLahir.trim(),
      tanggalLahir: tanggalLahir || undefined,
      pendidikan: pendidikan.trim(),
      tanggalDiterima: tanggalDiterima || undefined,
    })
  }

  return (
    <Modal onClose={onClose} wide>
      <ModalHead
        icon={<Icons.user />}
        color="var(--primary)"
        title="Edit Profil"
        sub={employee.nama}
        onClose={onClose}
      />
      <div className="modal-body">
        {/* Foto avatar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 18,
          }}
        >
          <Avatar
            name={nama || employee.nama}
            colorIndex={colorIndexForName(employee.id)}
            size="lg"
            foto={foto}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={pilihFoto}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => fileRef.current?.click()}
              >
                <Icons.download /> Unggah foto
              </button>
              {foto && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setFoto(undefined)}
                >
                  <Icons.trash /> Hapus
                </button>
              )}
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              {fotoError ? (
                <span style={{ color: 'var(--pink-deep)' }}>{fotoError}</span>
              ) : (
                'Format JPG/PNG — otomatis diperkecil.'
              )}
            </span>
          </div>
        </div>

        <div className="field">
          <label>Nomor Induk Karyawan{!isAdmin && ' (diatur admin)'}</label>
          <input
            type="text"
            value={nomorInduk}
            onChange={(e) => setNomorInduk(e.target.value)}
            placeholder="cth: KBK-001"
            disabled={!isAdmin}
          />
        </div>

        <div className="field">
          <label>Nama panggilan</label>
          <input
            type="text"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="cth: Dini"
          />
        </div>

        <div className="field">
          <label>Nama lengkap</label>
          <input
            type="text"
            value={namaLengkap}
            onChange={(e) => setNamaLengkap(e.target.value)}
            placeholder="cth: Dini Ayu Lestari"
          />
        </div>

        <div className="field">
          <label>Jabatan{!isAdmin && ' (diatur admin)'}</label>
          <input
            type="text"
            value={jabatan}
            onChange={(e) => setJabatan(e.target.value)}
            placeholder="cth: Operator, Kasir"
            disabled={!isAdmin}
          />
        </div>

        <div className="field">
          <label>Tempat lahir</label>
          <input
            type="text"
            value={tempatLahir}
            onChange={(e) => setTempatLahir(e.target.value)}
            placeholder="cth: Bandung"
          />
        </div>

        <div className="field">
          <label>Tanggal lahir</label>
          <input
            type="date"
            value={tanggalLahir}
            onChange={(e) => setTanggalLahir(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Pendidikan terakhir</label>
          <input
            type="text"
            value={pendidikan}
            onChange={(e) => setPendidikan(e.target.value)}
            placeholder="cth: SMA / D3 / S1"
          />
        </div>

        <div className="field">
          <label>Tanggal mulai kerja</label>
          <input
            type="date"
            value={tanggalDiterima}
            onChange={(e) => setTanggalDiterima(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          onClick={simpan}
        >
          <Icons.check /> Simpan Profil
        </button>
      </div>
    </Modal>
  )
}
