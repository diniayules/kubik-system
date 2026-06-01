import { useMemo, useState } from 'react'
import type { AppData, JenisKertas, SalahCetak, Tinta, WarnaTinta } from '../types'
import { todayKey } from '../storage'
import { formatTanggalPanjang } from '../attendance'
import {
  KATEGORI_PENGELUARAN_SUGGEST,
  WARNA_TINTA_COLOR,
  WARNA_TINTA_LABEL,
  WARNA_TINTA_LIST,
  findKertas,
  jumlahSalahCetakBulanIni,
  totalStokKertas,
  totalStokTinta,
  uidShort,
} from '../inventory'
import { Icons } from '../components/Icons'
import { Modal, ModalHead } from '../components/Modal'
import { useToast } from '../components/Toast'
import { catatSalahCetakRpc, hapusSalahCetakRpc } from '../lib/db'
import { usePrefs } from '../lib/prefs'

void KATEGORI_PENGELUARAN_SUGGEST

type Props = {
  data: AppData
  setData: (d: AppData) => void
  reload: () => void
  canEdit: boolean
}

type DialogState =
  | { type: 'tambahKertas' }
  | { type: 'editKertas'; kertas: JenisKertas }
  | { type: 'restockKertas'; kertas: JenisKertas }
  | { type: 'restockTinta'; tinta: Tinta }
  | { type: 'restockAmplop' }
  | { type: 'salahCetak' }
  | null

export function Inventaris({ data, setData, reload, canEdit }: Props) {
  const toast = useToast()
  const [dialog, setDialog] = useState<DialogState>(null)
  const prefs = usePrefs()
  const tampilan = prefs.tampilanInventaris
  const tampilanTinta = prefs.tampilanTinta

  const salahCetakBulan = jumlahSalahCetakBulanIni(data.salahCetak)
  const salahCetakSorted = useMemo(
    () =>
      [...data.salahCetak].sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [data.salahCetak],
  )

  function tambahKertas(nama: string, stokAwal: number) {
    const baru: JenisKertas = { id: uidShort(), nama, stok: stokAwal }
    setData({ ...data, stokKertas: [...data.stokKertas, baru] })
    toast('ok', `Jenis kertas "${nama}" ditambahkan`)
    setDialog(null)
  }

  function editKertas(id: string, nama: string) {
    setData({
      ...data,
      stokKertas: data.stokKertas.map((k) =>
        k.id === id ? { ...k, nama } : k,
      ),
    })
    toast('ok', 'Nama kertas diperbarui')
    setDialog(null)
  }

  function hapusKertas(k: JenisKertas) {
    const ada = data.salahCetak.some((s) => s.kertasId === k.id)
    if (ada) {
      if (
        !confirm(
          `Kertas "${k.nama}" punya catatan salah cetak. Hapus tetap akan menghapus entri salah cetak terkait. Lanjutkan?`,
        )
      ) {
        return
      }
    } else if (!confirm(`Hapus jenis kertas "${k.nama}"?`)) {
      return
    }
    setData({
      ...data,
      stokKertas: data.stokKertas.filter((x) => x.id !== k.id),
      salahCetak: data.salahCetak.filter((s) => s.kertasId !== k.id),
    })
    toast('warn', `Kertas "${k.nama}" dihapus`)
  }

  function restockKertas(id: string, delta: number) {
    setData({
      ...data,
      stokKertas: data.stokKertas.map((k) =>
        k.id === id ? { ...k, stok: Math.max(0, k.stok + delta) } : k,
      ),
    })
    toast('ok', delta >= 0 ? `+${delta} lembar` : `${delta} lembar`)
    setDialog(null)
  }

  function restockTinta(warna: WarnaTinta, delta: number, catatan?: string) {
    setData({
      ...data,
      stokTinta: data.stokTinta.map((t) =>
        t.warna === warna
          ? {
              ...t,
              stok: Math.max(0, t.stok + delta),
              catatan: catatan !== undefined ? catatan : t.catatan,
            }
          : t,
      ),
    })
    const pesan =
      delta !== 0
        ? `${WARNA_TINTA_LABEL[warna]} ${delta >= 0 ? '+' : ''}${delta}`
        : `Catatan ${WARNA_TINTA_LABEL[warna]} diperbarui`
    toast('ok', pesan)
    setDialog(null)
  }

  function restockAmplop(delta: number) {
    setData({ ...data, stokAmplop: Math.max(0, data.stokAmplop + delta) })
    toast('ok', `Amplop ${delta >= 0 ? '+' : ''}${delta}`)
    setDialog(null)
  }

  async function catatSalahCetak(
    tanggal: string,
    kertasId: string,
    jumlah: number,
    alasan: string,
  ) {
    const k = findKertas(data.stokKertas, kertasId)
    if (!k) return
    if (k.stok < jumlah) {
      if (
        !confirm(
          `Stok ${k.nama} cuma ${k.stok} lembar, tapi mau catat ${jumlah}. Lanjutkan? (stok akan jadi 0)`,
        )
      ) {
        return
      }
    }
    try {
      // Atomik di server: catat salah_cetak + kurangi stok kertas sekaligus.
      await catatSalahCetakRpc(kertasId, jumlah, tanggal, alasan)
      reload()
      toast('warn', `Salah cetak ${k.nama} ${jumlah} lembar`)
      setDialog(null)
    } catch (e) {
      toast('warn', e instanceof Error ? e.message : 'Gagal mencatat salah cetak')
    }
  }

  async function hapusSalahCetak(s: SalahCetak) {
    if (!confirm(`Hapus catatan salah cetak ${s.jumlah} lembar (stok dikembalikan)?`)) {
      return
    }
    try {
      await hapusSalahCetakRpc(s.id)
      reload()
      toast('info', 'Catatan salah cetak dihapus, stok dikembalikan')
    } catch (e) {
      toast('warn', e instanceof Error ? e.message : 'Gagal menghapus salah cetak')
    }
  }

  return (
    <>
      <section className="hero hero--compact">
        <div className="hero-top">
          <span className="date-pill">
            <Icons.sun /> {formatTanggalPanjang(todayKey())}
          </span>
        </div>
        <h1>Inventaris & Stok 📦</h1>
        <p className="sub">
          Kelola stok kertas (berbagai jenis), tinta 6 warna, dan amplop. Catat
          salah cetak yang otomatis mengurangi stok kertas.
        </p>

        <div className="hero-stats">
          <div className="stat">
            <span className="dot" style={{ background: 'var(--primary-2)' }} />
            <span className="num">{totalStokKertas(data.stokKertas)}</span>
            <span className="lbl">Total kertas</span>
          </div>
          <div className="stat">
            <span className="dot" style={{ background: 'var(--mint)' }} />
            <span className="num">{totalStokTinta(data.stokTinta)}</span>
            <span className="lbl">Total tinta</span>
          </div>
          <div className="stat">
            <span className="dot" style={{ background: 'var(--yellow)' }} />
            <span className="num">{data.stokAmplop}</span>
            <span className="lbl">Amplop</span>
          </div>
          <div className="stat">
            <span className="dot" style={{ background: 'var(--pink)' }} />
            <span className="num">{salahCetakBulan}</span>
            <span className="lbl">Salah cetak bulan ini</span>
          </div>
        </div>
      </section>

      {/* Stok kertas */}
      <div className="section-head">
        <h2>
          Stok Kertas{' '}
          <span className="count-badge">{data.stokKertas.length}</span>
        </h2>
        {canEdit && (
          <button
            type="button"
            className="btn btn--add"
            onClick={() => setDialog({ type: 'tambahKertas' })}
          >
            <Icons.plus /> Tambah Jenis Kertas
          </button>
        )}
      </div>

      {data.stokKertas.length === 0 ? (
        <div className="emp-empty">
          <div className="ee-emoji">📄</div>
          <h3>Belum ada jenis kertas</h3>
          <p>Tambahkan jenis kertas (Doff Kasar, Holographic, dll).</p>
        </div>
      ) : tampilan === 'list' ? (
        <div className="kertas-list">
          {data.stokKertas.map((k) => (
            <div key={k.id} className="kertas-row">
              <div className="kertas-row-info">
                <div className="kertas-row-nama">{k.nama}</div>
                <div className="kertas-row-sub">Stok kertas</div>
              </div>
              <div
                className={`kertas-row-stok ${k.stok === 0 ? 'kosong' : k.stok < 10 ? 'tipis' : ''}`}
              >
                {k.stok} <span className="kertas-row-unit">lembar</span>
              </div>
              {canEdit && (
                <div className="kertas-row-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => setDialog({ type: 'restockKertas', kertas: k })}
                  >
                    <Icons.plus /> Atur Stok
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setDialog({ type: 'editKertas', kertas: k })}
                  >
                    <Icons.pencil /> Edit
                  </button>
                  <button
                    type="button"
                    className="emp-row-icon emp-row-danger"
                    onClick={() => hapusKertas(k)}
                    title="Hapus"
                  >
                    <Icons.trash />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="inv-grid">
          {data.stokKertas.map((k) => (
            <div key={k.id} className="inv-card">
              <div className="inv-card-head">
                <div>
                  <div className="inv-card-nama">{k.nama}</div>
                  <div className="inv-card-sub">Stok kertas</div>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    className="emp-x"
                    title="Hapus"
                    onClick={() => hapusKertas(k)}
                  >
                    <Icons.x />
                  </button>
                )}
              </div>
              <div className={`inv-stok ${k.stok === 0 ? 'kosong' : k.stok < 10 ? 'tipis' : ''}`}>
                {k.stok}
                <span className="inv-stok-unit">lembar</span>
              </div>
              {canEdit && (
                <div className="inv-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => setDialog({ type: 'restockKertas', kertas: k })}
                  >
                    <Icons.plus /> Atur Stok
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setDialog({ type: 'editKertas', kertas: k })}
                  >
                    <Icons.pencil /> Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stok tinta */}
      <div className="section-head">
        <h2>Stok Tinta (6 Warna)</h2>
      </div>
      {tampilanTinta === 'list' ? (
        <div className="tinta-list">
          {data.stokTinta.map((t) => (
            <div key={t.warna} className="tinta-list-row">
              <div
                className="tinta-color tinta-color-sm"
                style={{ background: WARNA_TINTA_COLOR[t.warna] }}
              >
                {t.warna}
              </div>
              <div className="tinta-list-info">
                <div className="tinta-list-nama">
                  {WARNA_TINTA_LABEL[t.warna]}
                </div>
                {t.catatan && (
                  <div className="tinta-list-catatan">📝 {t.catatan}</div>
                )}
              </div>
              <div
                className={`tinta-list-stok ${t.stok === 0 ? 'kosong' : t.stok < 2 ? 'tipis' : ''}`}
              >
                {t.stok}{' '}
                <span className="tinta-list-unit">btl</span>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setDialog({ type: 'restockTinta', tinta: t })}
                >
                  <Icons.pencil /> Atur
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="tinta-grid">
          {data.stokTinta.map((t) => (
            <div key={t.warna} className="tinta-card">
              <div className="tinta-row">
                <div
                  className="tinta-color"
                  style={{ background: WARNA_TINTA_COLOR[t.warna] }}
                >
                  {t.warna}
                </div>
                <div className="tinta-info">
                  <div className="tinta-label">
                    {WARNA_TINTA_LABEL[t.warna]}
                  </div>
                  <div
                    className={`tinta-stok ${t.stok === 0 ? 'kosong' : t.stok < 2 ? 'tipis' : ''}`}
                  >
                    {t.stok}{' '}
                    <span className="tinta-unit">btl</span>
                  </div>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setDialog({ type: 'restockTinta', tinta: t })}
                  >
                    <Icons.pencil /> Atur
                  </button>
                )}
              </div>
              {t.catatan && (
                <div className="tinta-catatan">📝 {t.catatan}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Amplop */}
      <div className="section-head">
        <h2>Stok Amplop</h2>
      </div>
      <div className="amplop-card">
        <div className="amplop-ikon">✉️</div>
        <div className="amplop-info">
          <div className="amplop-stok">
            {data.stokAmplop} <span className="amplop-unit">amplop</span>
          </div>
          <div className="amplop-sub">Sisa stok amplop</div>
        </div>
        {canEdit && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setDialog({ type: 'restockAmplop' })}
          >
            <Icons.plus /> Atur Stok
          </button>
        )}
      </div>

      {/* Salah cetak */}
      <div className="section-head">
        <h2>
          Catatan Salah Cetak{' '}
          <span className="count-badge">{data.salahCetak.length}</span>
        </h2>
        {canEdit && (
          <button
            type="button"
            className="btn btn--pink"
            onClick={() => setDialog({ type: 'salahCetak' })}
          >
            <Icons.alert /> Catat Salah Cetak
          </button>
        )}
      </div>
      {salahCetakSorted.length === 0 ? (
        <div className="emp-empty">
          <div className="ee-emoji">✅</div>
          <h3>Belum ada salah cetak</h3>
          <p>Catat di sini setiap kali kertas terbuang karena salah cetak.</p>
        </div>
      ) : (
        <div className="salah-list">
          {salahCetakSorted.map((s) => {
            const k = findKertas(data.stokKertas, s.kertasId)
            return (
              <div key={s.id} className="salah-row">
                <div className="salah-tanggal">
                  {formatTanggalPanjang(s.tanggal)}
                </div>
                <div className="salah-info">
                  <div className="salah-kertas">{k?.nama ?? '(kertas dihapus)'}</div>
                  {s.alasan && <div className="salah-alasan">{s.alasan}</div>}
                </div>
                <div className="salah-jumlah">
                  −{s.jumlah}
                  <span className="salah-unit">lembar</span>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    className="emp-x"
                    onClick={() => hapusSalahCetak(s)}
                    title="Hapus & kembalikan stok"
                  >
                    <Icons.trash />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {dialog?.type === 'tambahKertas' && (
        <KertasModal
          onSave={(nama, stok) => tambahKertas(nama, stok)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'editKertas' && (
        <KertasModal
          existing={dialog.kertas}
          onSave={(nama) => editKertas(dialog.kertas.id, nama)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'restockKertas' && (
        <AdjustModal
          title={`Adjust stok ${dialog.kertas.nama}`}
          currentStok={dialog.kertas.stok}
          unit="lembar"
          onSave={(delta) => restockKertas(dialog.kertas.id, delta)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'restockTinta' && (
        <AdjustModal
          title={`Atur tinta ${WARNA_TINTA_LABEL[dialog.tinta.warna]}`}
          currentStok={dialog.tinta.stok}
          unit="botol"
          currentCatatan={dialog.tinta.catatan}
          showCatatan
          onSave={(delta, catatan) =>
            restockTinta(dialog.tinta.warna, delta, catatan)
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'restockAmplop' && (
        <AdjustModal
          title="Adjust stok amplop"
          currentStok={data.stokAmplop}
          unit="amplop"
          onSave={(delta) => restockAmplop(delta)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'salahCetak' && (
        <SalahCetakModal
          kertasList={data.stokKertas}
          onSave={catatSalahCetak}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}

function KertasModal({
  existing,
  onSave,
  onClose,
}: {
  existing?: JenisKertas
  onSave: (nama: string, stokAwal: number) => void
  onClose: () => void
}) {
  const [nama, setNama] = useState(existing?.nama ?? '')
  const [stok, setStok] = useState('0')
  const canSave = nama.trim().length >= 2
  return (
    <Modal onClose={onClose}>
      <ModalHead
        icon={<Icons.plus />}
        color="var(--primary)"
        title={existing ? 'Edit Jenis Kertas' : 'Tambah Jenis Kertas'}
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="field">
          <label>Nama jenis kertas</label>
          <input
            type="text"
            autoFocus
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="cth. Doff Kasar"
          />
        </div>
        {!existing && (
          <div className="field">
            <label>Stok awal (lembar)</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={stok}
              onChange={(e) => setStok(e.target.value)}
              placeholder="0"
            />
          </div>
        )}
        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          disabled={!canSave}
          onClick={() => onSave(nama.trim(), parseInt(stok, 10) || 0)}
        >
          <Icons.check /> Simpan
        </button>
      </div>
    </Modal>
  )
}

function AdjustModal({
  title,
  currentStok,
  unit,
  currentCatatan,
  showCatatan,
  onSave,
  onClose,
}: {
  title: string
  currentStok: number
  unit: string
  currentCatatan?: string
  showCatatan?: boolean
  onSave: (delta: number, catatan?: string) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'tambah' | 'kurang'>('tambah')
  const [jumlah, setJumlah] = useState('')
  const [catatan, setCatatan] = useState(currentCatatan ?? '')
  const j = parseInt(jumlah, 10) || 0
  const delta = mode === 'tambah' ? j : -j
  const baruStok = Math.max(0, currentStok + delta)
  const catatanBerubah = showCatatan && catatan.trim() !== (currentCatatan ?? '').trim()
  const canSave = j !== 0 || catatanBerubah
  return (
    <Modal onClose={onClose}>
      <ModalHead
        icon={<Icons.pencil />}
        color="var(--primary)"
        title={title}
        sub={`Stok sekarang: ${currentStok} ${unit}`}
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="role-pick" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={'role-opt' + (mode === 'tambah' ? ' sel' : '')}
            onClick={() => setMode('tambah')}
          >
            + Tambah Stok
          </button>
          <button
            type="button"
            className={'role-opt' + (mode === 'kurang' ? ' sel' : '')}
            onClick={() => setMode('kurang')}
          >
            − Kurangi Stok
          </button>
        </div>
        <div className="field">
          <label>Jumlah ({unit})</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            autoFocus
            value={jumlah}
            onChange={(e) => setJumlah(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="form-hint">
          Hasil: <strong>{currentStok}</strong> {mode === 'tambah' ? '+' : '−'}{' '}
          <strong>{j}</strong> = <strong>{baruStok}</strong> {unit}
        </div>

        {showCatatan && (
          <div className="field" style={{ marginTop: 16 }}>
            <label>Catatan (opsional)</label>
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              rows={2}
              style={{ minHeight: 60, resize: 'vertical' }}
              placeholder="cth: tinggal setengah botol, hampir habis"
            />
            <div className="form-hint" style={{ marginTop: 8 }}>
              📝 Tulis kondisi sisa yang tidak bisa dihitung pakai angka (mis.
              "setengah botol", "tinggal seperempat").
            </div>
          </div>
        )}

        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          disabled={!canSave}
          onClick={() =>
            onSave(delta, showCatatan ? catatan.trim() : undefined)
          }
          style={{ marginTop: 16 }}
        >
          <Icons.check /> Simpan
        </button>
      </div>
    </Modal>
  )
}

function SalahCetakModal({
  kertasList,
  onSave,
  onClose,
}: {
  kertasList: JenisKertas[]
  onSave: (tanggal: string, kertasId: string, jumlah: number, alasan: string) => void
  onClose: () => void
}) {
  const [tanggal, setTanggal] = useState(todayKey())
  const [kertasId, setKertasId] = useState(kertasList[0]?.id ?? '')
  const [jumlah, setJumlah] = useState('1')
  const [alasan, setAlasan] = useState('')
  const j = parseInt(jumlah, 10) || 0
  const canSave = !!kertasId && j > 0 && !!tanggal

  return (
    <Modal onClose={onClose} wide>
      <ModalHead
        icon={<Icons.alert />}
        color="var(--pink)"
        title="Catat Salah Cetak"
        sub="Stok kertas akan otomatis berkurang"
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
          <label>Jenis kertas</label>
          {kertasList.length === 0 ? (
            <div className="form-hint">
              Belum ada jenis kertas. Tambahkan dulu di section Stok Kertas.
            </div>
          ) : (
            <div className="kertas-pick">
              {kertasList.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className={'shift-opt' + (kertasId === k.id ? ' sel' : '')}
                  onClick={() => setKertasId(k.id)}
                >
                  <div className="so-name">{k.nama}</div>
                  <div className="so-time">stok {k.stok}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="field">
          <label>Jumlah lembar yang terbuang</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={jumlah}
            onChange={(e) => setJumlah(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Alasan / catatan (opsional)</label>
          <textarea
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            rows={2}
            placeholder="cth: warna kena tinta basah, file korup"
            style={{ minHeight: 60, resize: 'vertical' }}
          />
        </div>
        <button
          type="button"
          className="btn btn--pink btn--block btn--lg"
          disabled={!canSave}
          onClick={() => onSave(tanggal, kertasId, j, alasan.trim())}
        >
          <Icons.check /> Catat & Kurangi Stok
        </button>
      </div>
    </Modal>
  )
}

// Mark unused warna imports as used (utility availability for future)
void WARNA_TINTA_LIST
