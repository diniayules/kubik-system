import { useMemo, useState } from 'react'
import type { AppData, Pengeluaran as Peng } from '../types'
import { todayKey } from '../storage'
import { formatTanggalPanjang } from '../attendance'
import { formatRupiah } from '../income'
import {
  KATEGORI_PENGELUARAN_SUGGEST,
  bulanIni,
  totalPengeluaran,
  uidShort,
} from '../inventory'
import { Icons } from '../components/Icons'
import { Modal, ModalHead } from '../components/Modal'
import { useToast } from '../components/Toast'

type Props = {
  data: AppData
  setData: (d: AppData) => void
}

export function Pengeluaran({ data, setData }: Props) {
  const toast = useToast()
  const [editing, setEditing] = useState<Peng | null>(null)
  const [showForm, setShowForm] = useState(false)

  const sorted = useMemo(
    () =>
      [...data.pengeluaran].sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [data.pengeluaran],
  )
  const grupHarian = useMemo(() => {
    const map = new Map<string, Peng[]>()
    for (const p of sorted) {
      const arr = map.get(p.tanggal)
      if (arr) arr.push(p)
      else map.set(p.tanggal, [p])
    }
    return [...map.entries()].map(([tanggal, items]) => ({
      tanggal,
      items,
      total: items.reduce((s, p) => s + p.jumlah, 0),
    }))
  }, [sorted])
  const totalBulan = totalPengeluaran(data.pengeluaran, (p) => bulanIni(p.tanggal))
  const totalSemua = totalPengeluaran(data.pengeluaran)
  const kategoriBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of data.pengeluaran.filter((p) => bulanIni(p.tanggal))) {
      map.set(p.kategori || 'Lainnya', (map.get(p.kategori || 'Lainnya') ?? 0) + p.jumlah)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [data.pengeluaran])

  function simpan(p: Peng) {
    const idx = data.pengeluaran.findIndex((x) => x.id === p.id)
    let baru: Peng[]
    if (idx >= 0) {
      baru = data.pengeluaran.map((x) => (x.id === p.id ? p : x))
    } else {
      baru = [...data.pengeluaran, p]
    }
    setData({ ...data, pengeluaran: baru })
    toast('ok', `Pengeluaran ${formatRupiah(p.jumlah)} disimpan`)
    setShowForm(false)
    setEditing(null)
  }

  function hapus(p: Peng) {
    if (!confirm(`Hapus pengeluaran ${formatRupiah(p.jumlah)} (${p.deskripsi})?`)) {
      return
    }
    setData({
      ...data,
      pengeluaran: data.pengeluaran.filter((x) => x.id !== p.id),
    })
    toast('warn', 'Pengeluaran dihapus')
  }

  function exportCSV() {
    const header = ['Tanggal', 'Hari', 'Kategori', 'Deskripsi', 'Jumlah', 'Catatan']
    const rows = sorted.map((p) => [
      p.tanggal,
      formatTanggalPanjang(p.tanggal),
      p.kategori,
      p.deskripsi,
      String(p.jumlah),
      p.catatan,
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pengeluaran-${todayKey().slice(0, 7)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <section className="hero">
        <div className="hero-top">
          <span className="date-pill">
            <Icons.sun /> {formatTanggalPanjang(todayKey())}
          </span>
        </div>
        <h1>Pengeluaran Studio 🛒</h1>
        <p className="sub">
          Catat pengeluaran belanja studio (kertas, tinta, listrik, dll) — terpisah
          dari laporan income agar laba bersih bisa dihitung.
        </p>

        <div className="hero-stats">
          <div className="stat">
            <span className="dot" style={{ background: 'var(--pink)' }} />
            <span className="num">{formatRupiah(totalBulan)}</span>
            <span className="lbl">Bulan ini</span>
          </div>
          <div className="stat">
            <span className="dot" style={{ background: 'var(--primary-2)' }} />
            <span className="num">{formatRupiah(totalSemua)}</span>
            <span className="lbl">Total semua</span>
          </div>
          <div className="stat">
            <span className="dot" style={{ background: 'var(--yellow)' }} />
            <span className="num">{data.pengeluaran.length}</span>
            <span className="lbl">Total entri</span>
          </div>
        </div>

        {kategoriBreakdown.length > 0 && (
          <div className="kategori-breakdown">
            <div className="kategori-breakdown-judul">Per kategori bulan ini</div>
            <div className="kategori-list">
              {kategoriBreakdown.map(([kat, jml]) => (
                <div key={kat} className="kategori-chip">
                  <span className="kategori-nama">{kat}</span>
                  <span className="kategori-jml">{formatRupiah(jml)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="section-head">
        <h2>
          Daftar Pengeluaran{' '}
          <span className="count-badge">{data.pengeluaran.length}</span>
        </h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {data.pengeluaran.length > 0 && (
            <button type="button" className="btn btn--ghost" onClick={exportCSV}>
              <Icons.download /> Unduh CSV
            </button>
          )}
          <button
            type="button"
            className="btn btn--add"
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
          >
            <Icons.plus /> Tambah Pengeluaran
          </button>
        </div>
      </div>

      {data.pengeluaran.length === 0 ? (
        <div className="emp-empty">
          <div className="ee-emoji">🧾</div>
          <h3>Belum ada pengeluaran</h3>
          <p>Klik "Tambah Pengeluaran" untuk mulai mencatat belanja studio.</p>
          <button
            type="button"
            className="btn btn--pink btn--lg"
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
          >
            <Icons.plus /> Tambah Pengeluaran
          </button>
        </div>
      ) : (
        <div className="pengeluaran-grup-list">
          {grupHarian.map((grup) => (
            <div key={grup.tanggal} className="pengeluaran-grup">
              <div className="pengeluaran-grup-head">
                <div className="pengeluaran-grup-tanggal">
                  <Icons.sun /> {formatTanggalPanjang(grup.tanggal)}
                  <span className="pengeluaran-grup-count">
                    {grup.items.length} entri
                  </span>
                </div>
                <div className="pengeluaran-grup-total">
                  {formatRupiah(grup.total)}
                </div>
              </div>
              <div className="pengeluaran-list">
                {grup.items.map((p) => (
                  <div key={p.id} className="pengeluaran-row">
                    <div>
                      <div className="pengeluaran-deskripsi">
                        <span className="pengeluaran-kat">
                          {p.kategori || 'Lainnya'}
                        </span>{' '}
                        {p.deskripsi}
                      </div>
                      {p.catatan && (
                        <div className="pengeluaran-catatan">{p.catatan}</div>
                      )}
                    </div>
                    <div className="pengeluaran-jml">
                      {formatRupiah(p.jumlah)}
                    </div>
                    <div className="pengeluaran-actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn-mini-ghost"
                        onClick={() => {
                          setEditing(p)
                          setShowForm(true)
                        }}
                      >
                        <Icons.pencil /> Edit
                      </button>
                      <button
                        type="button"
                        className="emp-x"
                        onClick={() => hapus(p)}
                        title="Hapus"
                      >
                        <Icons.trash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <PengeluaranModal
          existing={editing ?? undefined}
          suggestKategori={[
            ...new Set([
              ...KATEGORI_PENGELUARAN_SUGGEST,
              ...data.pengeluaran.map((p) => p.kategori).filter(Boolean),
            ]),
          ]}
          onSave={simpan}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function PengeluaranModal({
  existing,
  suggestKategori,
  onSave,
  onClose,
}: {
  existing?: Peng
  suggestKategori: string[]
  onSave: (p: Peng) => void
  onClose: () => void
}) {
  const [tanggal, setTanggal] = useState(existing?.tanggal ?? todayKey())
  const [kategori, setKategori] = useState(existing?.kategori ?? '')
  const [deskripsi, setDeskripsi] = useState(existing?.deskripsi ?? '')
  const [jumlah, setJumlah] = useState(
    existing?.jumlah ? String(existing.jumlah) : '',
  )
  const [catatan, setCatatan] = useState(existing?.catatan ?? '')

  const j = parseInt(jumlah, 10) || 0
  const canSave = !!tanggal && !!deskripsi.trim() && j > 0

  function simpan() {
    onSave({
      id: existing?.id ?? uidShort(),
      tanggal,
      kategori: kategori.trim() || 'Lainnya',
      deskripsi: deskripsi.trim(),
      jumlah: j,
      catatan: catatan.trim(),
    })
  }

  return (
    <Modal onClose={onClose} wide>
      <ModalHead
        icon={<Icons.pencil />}
        color="var(--pink)"
        title={existing ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}
        sub={tanggal}
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="field">
          <label>Tanggal</label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Kategori</label>
          <input
            type="text"
            list="kategori-suggest"
            value={kategori}
            onChange={(e) => setKategori(e.target.value)}
            placeholder="cth: Kertas, Tinta, Listrik"
          />
          <datalist id="kategori-suggest">
            {suggestKategori.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>Deskripsi</label>
          <input
            type="text"
            autoFocus={!existing}
            value={deskripsi}
            onChange={(e) => setDeskripsi(e.target.value)}
            placeholder="cth: Beli kertas doff 1 rim"
          />
        </div>
        <div className="field">
          <label>Jumlah (Rp)</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={jumlah}
            onChange={(e) => setJumlah(e.target.value)}
            placeholder="0"
          />
          {j > 0 && (
            <div className="form-hint" style={{ marginTop: 8 }}>
              = {formatRupiah(j)}
            </div>
          )}
        </div>
        <div className="field">
          <label>Catatan (opsional)</label>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={2}
            style={{ minHeight: 60, resize: 'vertical' }}
            placeholder="cth: dari toko Aman, kontak 0812..."
          />
        </div>
        <button
          type="button"
          className="btn btn--pink btn--block btn--lg"
          disabled={!canSave}
          onClick={simpan}
        >
          <Icons.check /> {existing ? 'Simpan Perubahan' : 'Simpan Pengeluaran'}
        </button>
      </div>
    </Modal>
  )
}
