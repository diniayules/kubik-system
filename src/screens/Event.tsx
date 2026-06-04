import { useMemo, useState } from 'react'
import type { AppData, EventKategori, LaporanEvent, SewaTipe } from '../types'
import { todayKey } from '../storage'
import { formatTanggalPanjang } from '../attendance'
import { formatRupiah } from '../income'
import { hitungEvent, labelEventKategori } from '../event'
import { Icons } from '../components/Icons'
import { Modal, ModalHead } from '../components/Modal'
import { useToast } from '../components/Toast'
import { EventEntryModal } from './EventEntryModal'

type Props = {
  data: AppData
  setData: (d: AppData) => void
  kategori: EventKategori
}

// Tiap kategori event tampil sebagai halaman penuh sendiri (menu di sidebar).
// `key={kategori}` mereset state form/draft saat berpindah menu.
export function Event({ data, setData, kategori }: Props) {
  return (
    <EventKategoriPanel
      key={kategori}
      kategori={kategori}
      data={data}
      setData={setData}
    />
  )
}

function EventKategoriPanel({
  kategori,
  data,
  setData,
}: Props) {
  const toast = useToast()
  const hariIni = todayKey()
  const monthKey = hariIni.slice(0, 7)

  const [pilihTipe, setPilihTipe] = useState(false)
  const [formTipe, setFormTipe] = useState<SewaTipe | null>(null)
  const [editing, setEditing] = useState<LaporanEvent | null>(null)

  const sorted = useMemo(
    () =>
      data.laporanEvent
        .filter((l) => l.kategori === kategori)
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [data.laporanEvent, kategori],
  )
  const monthData = sorted.filter((l) => l.tanggal.startsWith(monthKey))
  const totalPendapatan = monthData.reduce(
    (s, l) => s + hitungEvent(l).pendapatan,
    0,
  )
  const totalLaba = monthData.reduce((s, l) => s + hitungEvent(l).laba, 0)

  function simpan(l: LaporanEvent) {
    const idx = data.laporanEvent.findIndex((x) => x.id === l.id)
    const baru =
      idx >= 0
        ? data.laporanEvent.map((x) => (x.id === l.id ? l : x))
        : [...data.laporanEvent, l]
    setData({ ...data, laporanEvent: baru })
    toast('ok', `Laporan ${l.tanggal} disimpan`)
    setEditing(null)
    setFormTipe(null)
  }

  function hapus(l: LaporanEvent) {
    if (!confirm(`Hapus laporan event tanggal ${l.tanggal}?`)) return
    setData({
      ...data,
      laporanEvent: data.laporanEvent.filter((x) => x.id !== l.id),
    })
    toast('warn', `Laporan ${l.tanggal} dihapus`)
  }

  return (
    <>
      <section className="hero hero--compact">
        <div className="hero-top">
          <span className="date-pill">
            <Icons.sun /> {formatTanggalPanjang(hariIni)}
          </span>
        </div>
        <h1>Laporan Event</h1>
        <p className="sub">{labelEventKategori(kategori)} · sewa per jam &amp; per voucher</p>

        <div className="hero-stats">
          <div className="stat">
            <span className="dot" style={{ background: 'var(--primary-2)' }} />
            <span className="num">{formatRupiah(totalPendapatan)}</span>
            <span className="lbl">Pendapatan bulan ini</span>
          </div>
          <div className="stat">
            <span className="dot" style={{ background: 'var(--mint)' }} />
            <span className="num">{formatRupiah(totalLaba)}</span>
            <span className="lbl">Laba bulan ini</span>
          </div>
          <div className="stat">
            <span className="dot" style={{ background: 'var(--yellow)' }} />
            <span className="num">{monthData.length}</span>
            <span className="lbl">Jumlah event bulan ini</span>
          </div>
        </div>
      </section>

      <div className="section-head">
        <h2>
          Daftar Laporan <span className="count-badge">{sorted.length}</span>
        </h2>
        <button
          type="button"
          className="btn btn--add"
          onClick={() => setPilihTipe(true)}
        >
          <Icons.plus /> Tambah Laporan
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="emp-empty">
          <div className="ee-emoji">🎪</div>
          <h3>Belum ada laporan {labelEventKategori(kategori)}</h3>
          <p>Klik "Tambah Laporan", lalu pilih sewa per jam atau per voucher.</p>
          <button
            type="button"
            className="btn btn--pink btn--lg"
            onClick={() => setPilihTipe(true)}
          >
            <Icons.plus /> Tambah Laporan
          </button>
        </div>
      ) : (
        <div className="income-list">
          {sorted.map((l) => (
            <EventRow
              key={l.id}
              laporan={l}
              onEdit={() => {
                setEditing(l)
                setFormTipe(l.tipe)
              }}
              onDelete={() => hapus(l)}
            />
          ))}
        </div>
      )}

      {/* Pilih tipe sewa sebelum buka form */}
      {pilihTipe && (
        <Modal onClose={() => setPilihTipe(false)}>
          <ModalHead
            icon={<Icons.plus />}
            color="var(--primary)"
            title="Tambah Laporan Event"
            sub={labelEventKategori(kategori)}
            onClose={() => setPilihTipe(false)}
          />
          <div className="modal-body">
            <p className="form-hint" style={{ marginBottom: 14 }}>
              Pilih jenis sewa untuk laporan ini:
            </p>
            <div className="event-tipe-pick">
              <button
                type="button"
                className="event-tipe-card"
                onClick={() => {
                  setEditing(null)
                  setFormTipe('jam')
                  setPilihTipe(false)
                }}
              >
                <span className="event-tipe-ikon">⏱️</span>
                <span className="event-tipe-judul">Sewa per Jam</span>
                <span className="event-tipe-sub">
                  Jam × tarif − biaya (kertas, tinta, listrik, upah) = laba
                </span>
              </button>
              <button
                type="button"
                className="event-tipe-card"
                onClick={() => {
                  setEditing(null)
                  setFormTipe('voucher')
                  setPilihTipe(false)
                }}
              >
                <span className="event-tipe-ikon">🎟️</span>
                <span className="event-tipe-judul">Sewa per Voucher</span>
                <span className="event-tipe-sub">
                  Jumlah voucher &amp; cetak × harga
                </span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {formTipe && (
        <EventEntryModal
          kategori={kategori}
          tipe={formTipe}
          existing={editing ?? undefined}
          onSave={simpan}
          onClose={() => {
            setFormTipe(null)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function EventRow({
  laporan,
  onEdit,
  onDelete,
}: {
  laporan: LaporanEvent
  onEdit: () => void
  onDelete: () => void
}) {
  const inc = hitungEvent(laporan)
  const isJam = laporan.tipe === 'jam'

  function handlePrint() {
    const node = document.querySelector(`[data-laporan-id="${laporan.id}"]`)
    if (!node) return
    node.classList.add('is-printing')
    const cleanup = () => node.classList.remove('is-printing')
    window.addEventListener('afterprint', cleanup, { once: true })
    setTimeout(() => window.print(), 40)
    setTimeout(cleanup, 4000)
  }

  return (
    <div className="income-card income-card--event" data-laporan-id={laporan.id}>
      <button
        type="button"
        className="income-card-delete"
        onClick={onDelete}
        title="Hapus laporan"
        aria-label="Hapus laporan"
      >
        <Icons.trash />
      </button>
      <div className="income-card-head">
        <div>
          <div className="income-card-tanggal">
            {formatTanggalPanjang(laporan.tanggal)}
          </div>
          <div className="income-card-sub">
            <span className={'event-badge event-badge--' + laporan.tipe}>
              {isJam ? '⏱️ Per Jam' : '🎟️ Per Voucher'}
            </span>
          </div>
        </div>
        <div className="income-card-total">
          <div className="income-card-total-num">{formatRupiah(inc.laba)}</div>
          <div className="income-card-total-lbl">
            {isJam ? 'Laba bersih' : 'Total'}
          </div>
        </div>
      </div>

      <div className="income-breakdown">
        {isJam ? (
          <>
            <div className="income-breakdown-row">
              <span>⏱️ Sewa</span>
              <span className="income-breakdown-qty">
                {laporan.jam ?? 0} jam × {formatRupiah(laporan.tarifPerJam ?? 0)}
              </span>
              <span className="income-breakdown-val">
                {formatRupiah(inc.pendapatan)}
              </span>
            </div>
            {(laporan.biayaKertas ?? 0) > 0 && (
              <BiayaRow label="📄 Kertas" val={laporan.biayaKertas ?? 0} />
            )}
            {(laporan.biayaTinta ?? 0) > 0 && (
              <BiayaRow label="🖨️ Tinta" val={laporan.biayaTinta ?? 0} />
            )}
            {(laporan.biayaListrik ?? 0) > 0 && (
              <BiayaRow label="⚡ Listrik" val={laporan.biayaListrik ?? 0} />
            )}
            {(laporan.upahOperator ?? 0) > 0 && (
              <BiayaRow label="🧑‍💼 Upah operator" val={laporan.upahOperator ?? 0} />
            )}
            <div className="income-breakdown-row income-breakdown-row--total">
              <span>Laba bersih</span>
              <span className="income-breakdown-qty" />
              <span className="income-breakdown-val">{formatRupiah(inc.laba)}</span>
            </div>
          </>
        ) : (
          <>
            {(laporan.voucher ?? 0) > 0 && (
              <div className="income-breakdown-row">
                <span>🎟️ Voucher</span>
                <span className="income-breakdown-qty">
                  {laporan.voucher} × {formatRupiah(laporan.hargaVoucher ?? 0)}
                </span>
                <span className="income-breakdown-val">
                  {formatRupiah((laporan.voucher ?? 0) * (laporan.hargaVoucher ?? 0))}
                </span>
              </div>
            )}
            {(laporan.cetak ?? 0) > 0 && (
              <div className="income-breakdown-row">
                <span>🖨️ (+) Cetak</span>
                <span className="income-breakdown-qty">
                  {laporan.cetak} × {formatRupiah(laporan.hargaCetak ?? 0)}
                </span>
                <span className="income-breakdown-val">
                  {formatRupiah((laporan.cetak ?? 0) * (laporan.hargaCetak ?? 0))}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {laporan.keterangan && (
        <div className="income-keterangan">
          <span className="income-keterangan-lbl">Catatan:</span>{' '}
          {laporan.keterangan}
        </div>
      )}

      <div className="income-card-actions">
        <button type="button" className="btn btn--ghost" onClick={onEdit}>
          <Icons.pencil /> Edit
        </button>
        <button type="button" className="btn btn--ghost" onClick={handlePrint}>
          <Icons.printer /> Print
        </button>
      </div>
    </div>
  )
}

function BiayaRow({ label, val }: { label: string; val: number }) {
  return (
    <div className="income-breakdown-row">
      <span>{label}</span>
      <span className="income-breakdown-qty">biaya</span>
      <span className="income-breakdown-val" style={{ color: 'var(--pink-deep)' }}>
        −{formatRupiah(val)}
      </span>
    </div>
  )
}
