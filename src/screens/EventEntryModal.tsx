import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { EventKategori, LaporanEvent, SewaTipe } from '../types'
import { todayKey } from '../storage'
import { Modal, ModalHead } from '../components/Modal'
import { Icons } from '../components/Icons'
import RupiahInput from '../components/RupiahInput'
import { formatRupiah } from '../income'
import { hitungEvent, labelEventKategori } from '../event'

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '13px 15px',
  borderRadius: 'var(--radius-sm)',
  border: '1.8px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--ink)',
  fontSize: 15,
  fontWeight: 600,
}

type Props = {
  kategori: EventKategori
  tipe: SewaTipe
  existing?: LaporanEvent
  onSave: (l: LaporanEvent) => void
  onClose: () => void
}

export function EventEntryModal({
  kategori,
  tipe,
  existing,
  onSave,
  onClose,
}: Props) {
  const [tanggal, setTanggal] = useState(existing?.tanggal ?? todayKey())
  const [keterangan, setKeterangan] = useState(existing?.keterangan ?? '')

  // mode 'jam'
  const [jam, setJam] = useState(existing?.jam ?? 0)
  const [tarif, setTarif] = useState(existing?.tarifPerJam ?? 0)
  const [biayaKertas, setBiayaKertas] = useState(existing?.biayaKertas ?? 0)
  const [biayaTinta, setBiayaTinta] = useState(existing?.biayaTinta ?? 0)
  const [biayaListrik, setBiayaListrik] = useState(existing?.biayaListrik ?? 0)
  const [upah, setUpah] = useState(existing?.upahOperator ?? 0)

  // mode 'voucher'
  const [voucher, setVoucher] = useState(existing?.voucher ?? 0)
  const [cetak, setCetak] = useState(existing?.cetak ?? 0)
  // Harga diatur khusus per event. Laporan lama mempertahankan harga snapshot.
  const [hargaVoucher, setHargaVoucher] = useState(existing?.hargaVoucher ?? 0)
  const [hargaCetak, setHargaCetak] = useState(existing?.hargaCetak ?? 0)

  const isJam = tipe === 'jam'

  // Preview perhitungan
  const preview: LaporanEvent = {
    id: existing?.id ?? 'preview',
    tanggal,
    kategori,
    tipe,
    keterangan,
    jam,
    tarifPerJam: tarif,
    biayaKertas,
    biayaTinta,
    biayaListrik,
    upahOperator: upah,
    voucher,
    cetak,
    hargaVoucher,
    hargaCetak,
  }
  const inc = hitungEvent(preview)

  const canSave = isJam
    ? jam > 0 || tarif > 0 || biayaKertas > 0 || upah > 0
    : voucher > 0 || cetak > 0

  function simpan() {
    const base = {
      id: existing?.id ?? crypto.randomUUID(),
      tanggal,
      kategori,
      tipe,
      keterangan: keterangan.trim(),
    }
    const l: LaporanEvent = isJam
      ? {
          ...base,
          jam,
          tarifPerJam: tarif,
          biayaKertas,
          biayaTinta,
          biayaListrik,
          upahOperator: upah,
        }
      : {
          ...base,
          voucher,
          cetak,
          hargaVoucher,
          hargaCetak,
        }
    onSave(l)
  }

  return (
    <Modal onClose={onClose} wide>
      <ModalHead
        icon={isJam ? <Icons.clock /> : <Icons.wallet />}
        color="var(--primary)"
        title={
          (existing ? 'Edit' : 'Tambah') +
          ` Laporan · ${isJam ? 'Sewa per Jam' : 'Sewa per Voucher'}`
        }
        sub={`${labelEventKategori(kategori)} · ${tanggal}`}
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="field">
          <label>Tanggal</label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            style={inputStyle}
          />
        </div>

        {isJam ? (
          <>
            <div className="event-field-grid">
              <NumField
                label="Durasi (jam)"
                value={jam}
                onChange={setJam}
                allowDecimal
              />
              <NumField label="Tarif / jam (Rp)" value={tarif} onChange={setTarif} />
            </div>

            <div className="upgrade-section">
              <div className="upgrade-section-head">
                <span className="upgrade-section-ikon">💸</span>
                <div>
                  <div className="upgrade-section-judul">Biaya Event</div>
                  <div className="upgrade-section-sub">
                    Isi nominal Rupiah. Laba = pendapatan sewa − total biaya.
                  </div>
                </div>
              </div>
              <div className="event-field-grid">
                <NumField label="Kertas (Rp)" value={biayaKertas} onChange={setBiayaKertas} />
                <NumField label="Tinta (Rp)" value={biayaTinta} onChange={setBiayaTinta} />
                <NumField label="Listrik (Rp)" value={biayaListrik} onChange={setBiayaListrik} />
                <NumField label="Upah operator (Rp)" value={upah} onChange={setUpah} />
              </div>
            </div>
          </>
        ) : (
          <div className="upgrade-section">
            <div className="upgrade-section-head">
              <span className="upgrade-section-ikon">🎟️</span>
              <div>
                <div className="upgrade-section-judul">Voucher &amp; Cetak</div>
                <div className="upgrade-section-sub">
                  Atur jumlah &amp; harga khusus untuk event ini.
                </div>
              </div>
            </div>
            <div className="event-field-grid">
              <NumField label="Jumlah voucher" value={voucher} onChange={setVoucher} />
              <NumField
                label="Harga / voucher (Rp)"
                value={hargaVoucher}
                onChange={setHargaVoucher}
              />
              <NumField label="(+) Cetak" value={cetak} onChange={setCetak} />
              <NumField
                label="Harga / cetak (Rp)"
                value={hargaCetak}
                onChange={setHargaCetak}
              />
            </div>
          </div>
        )}

        <div className="field">
          <label>Keterangan (opsional)</label>
          <textarea
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            rows={2}
            placeholder="cth: event sekolah, sewa 4 jam + 2 operator"
            style={{ minHeight: 60, resize: 'vertical' }}
          />
        </div>

        <div className="income-total">
          <div className="income-total-row">
            <span>Pendapatan</span>
            <span className="income-total-val">{formatRupiah(inc.pendapatan)}</span>
          </div>
          {isJam && (
            <div className="income-total-row">
              <span>Total biaya</span>
              <span className="income-total-val">−{formatRupiah(inc.biaya)}</span>
            </div>
          )}
          <div className="income-total-row income-total-grand">
            <span>{isJam ? 'LABA BERSIH' : 'TOTAL'}</span>
            <span className="income-total-val">{formatRupiah(inc.laba)}</span>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          disabled={!canSave}
          onClick={simpan}
        >
          <Icons.check /> {existing ? 'Simpan Perubahan' : 'Simpan Laporan'}
        </button>
      </div>
    </Modal>
  )
}

function NumField({
  label,
  value,
  onChange,
  allowDecimal = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  allowDecimal?: boolean
}) {
  // Field bernominal Rupiah (label memuat "(Rp)") pakai kolom mata uang
  // berformat ribuan; sisanya (durasi jam, jumlah voucher, dll) tetap angka biasa.
  const money = !allowDecimal && label.includes('(Rp)')
  return (
    <label className="field" style={{ marginBottom: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)' }}>
        {label}
      </span>
      {money ? (
        <RupiahInput value={value} onChange={onChange} />
      ) : (
        <input
          type="number"
          inputMode={allowDecimal ? 'decimal' : 'numeric'}
          min={0}
          step={allowDecimal ? 0.5 : 1000}
          value={value === 0 ? '' : String(value)}
          placeholder="0"
          onChange={(e) => {
            const v = allowDecimal
              ? parseFloat(e.target.value)
              : parseInt(e.target.value, 10)
            onChange(Number.isFinite(v) ? Math.max(0, v) : 0)
          }}
          style={inputStyle}
        />
      )}
    </label>
  )
}
