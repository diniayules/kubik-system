// =============================================================
// Kemitraan.tsx · Pengajuan MoU & sponsorship dari sekolah/instansi.
//
// Tab kedua di layar Leads & Sales. Isinya kebalikan dari tab Pipeline:
// di sana Kubik MENGEJAR order, di sini sekolah yang datang MEMINTA — dan
// yang disetujui membuat uang Kubik keluar, bukan masuk. Karena itu ia
// tabel sendiri (migration 0053) dan tidak pernah ikut dihitung sebagai
// nilai pipeline sales.
//
// Kanban 5 kolom mengikuti pola Papan Promosi & Leads supaya tidak ada
// kosakata UI baru. Tiga hal yang hanya ada di sini:
//   · umur antrean  — proposal yang didiamkan = pintu ke sekolah tertutup
//   · masa MoU      — kerja sama yang mau habis harus terlihat lebih dulu
//   · imbalan       — apa yang Kubik dapat, dicentang satu per satu
//
// Data komersial: hanya pengelola yang boleh mengubah (RLS 0053).
// =============================================================
import { useMemo, useState } from 'react'
import type {
  AppData,
  Kemitraan as Pengajuan,
  KemitraanBentuk,
  KemitraanImbalan,
  KemitraanJenis,
  KemitraanStatus,
  Pengeluaran,
} from '../types'
import { uid, todayKey } from '../storage'
import { formatRupiah } from '../income'
import { formatTanggalPanjang } from '../attendance'
import {
  AMBANG_MOU_HABIS_HARI,
  AMBANG_PENGAJUAN_HARI,
  KEMITRAAN_BENTUK_LABEL,
  KEMITRAAN_JENIS_LABEL,
  KEMITRAAN_STATUS_LABEL,
  KEMITRAAN_STATUS_ORDER,
  ringkasKemitraan,
} from '../manajemen'
import { Icons } from '../components/Icons'
import { Modal, ModalHead } from '../components/Modal'
import { useToast } from '../components/Toast'

/** Kategori baris `pengeluaran` yang dibuat otomatis dari sponsor dibayar. */
const KATEGORI_SPONSOR = 'Sponsorship'

type Props = {
  data: AppData
  setData: (d: AppData) => void
  /** Hanya pengelola yang boleh mengubah; operator melihat miliknya saja. */
  bisaUbah: boolean
}

export function Kemitraan({ data, setData, bisaUbah }: Props) {
  const toast = useToast()
  const hariIni = todayKey()
  const monthKey = hariIni.slice(0, 7)
  const [editing, setEditing] = useState<Pengajuan | null>(null)
  const [showForm, setShowForm] = useState(false)

  const semua = data.kemitraan ?? []
  const ringkas = useMemo(
    () => ringkasKemitraan(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const namaById = useMemo(
    () => new Map(data.employees.map((e) => [e.id, e.nama])),
    [data.employees],
  )

  function simpan(k: Pengajuan) {
    const ada = semua.some((x) => x.id === k.id)
    setData({
      ...data,
      kemitraan: ada ? semua.map((x) => (x.id === k.id ? k : x)) : [...semua, k],
    })
    setShowForm(false)
    setEditing(null)
    toast('ok', ada ? 'Pengajuan diperbarui' : 'Pengajuan dicatat')
  }

  function hapus(k: Pengajuan) {
    const punyaBiaya =
      k.pengeluaranId && data.pengeluaran.some((p) => p.id === k.pengeluaranId)
    if (
      !confirm(
        `Hapus pengajuan "${k.instansi}"?` +
          (punyaBiaya
            ? '\n\nPengeluaran sponsor yang sudah tercatat TIDAK ikut terhapus — hapus sendiri di layar Pengeluaran bila perlu.'
            : ''),
      )
    )
      return
    setData({ ...data, kemitraan: semua.filter((x) => x.id !== k.id) })
    setEditing(null)
    setShowForm(false)
  }

  function pindahStatus(k: Pengajuan, status: KemitraanStatus) {
    // `tanggalKeputusan` sengaja tidak disentuh — distempel database.
    setData({
      ...data,
      kemitraan: semua.map((x) => (x.id === k.id ? { ...x, status } : x)),
    })
  }

  /**
   * Sponsor uang tunai yang dibayar → satu baris `pengeluaran`, sekali saja.
   * Kedua slice ditulis dalam SATU setData supaya keduanya ikut satu putaran
   * persistChanges (write-through) dan tidak bisa setengah jadi.
   */
  function catatPembayaran(k: Pengajuan, sumber: 'cash' | 'rekening') {
    const p: Pengeluaran = {
      id: uid(),
      tanggal: todayKey(),
      kategori: KATEGORI_SPONSOR,
      deskripsi: `Sponsor ${k.instansi}${k.acara ? ` — ${k.acara}` : ''}`,
      jumlah: Math.round(k.nilaiDisetujui),
      catatan: `Pengajuan ${KEMITRAAN_JENIS_LABEL[k.jenis].toLowerCase()} masuk ${k.tanggalMasuk}`,
      sumber,
    }
    setData({
      ...data,
      pengeluaran: [...data.pengeluaran, p],
      kemitraan: semua.map((x) =>
        x.id === k.id ? { ...x, pengeluaranId: p.id } : x,
      ),
    })
    setEditing((cur) => (cur && cur.id === k.id ? { ...cur, pengeluaranId: p.id } : cur))
    toast('ok', 'Tercatat di Pengeluaran')
  }

  /** Batalkan pencatatan: baris pengeluarannya ikut ditarik, bukan ditinggal. */
  function batalkanPembayaran(k: Pengajuan) {
    setData({
      ...data,
      pengeluaran: data.pengeluaran.filter((p) => p.id !== k.pengeluaranId),
      kemitraan: semua.map((x) =>
        x.id === k.id ? { ...x, pengeluaranId: undefined } : x,
      ),
    })
    setEditing((cur) =>
      cur && cur.id === k.id ? { ...cur, pengeluaranId: undefined } : cur,
    )
    toast('ok', 'Pencatatan pengeluaran dibatalkan')
  }

  function buka(k: Pengajuan) {
    setEditing(k)
    setShowForm(true)
  }

  const mouAktif = semua.filter(
    (k) =>
      k.mouBerakhir &&
      k.mouBerakhir >= hariIni &&
      (k.status === 'disetujui' || k.status === 'selesai'),
  ).length

  return (
    <>
      <section className="lead-stats">
        <Stat
          label="Menunggu keputusan"
          nilai={String(ringkas.antre.length)}
          sub={
            ringkas.didiamkan > 0
              ? `${ringkas.didiamkan} sudah lewat ${AMBANG_PENGAJUAN_HARI} hari`
              : 'antrean bersih'
          }
          nada={ringkas.didiamkan > 0 ? 'pink' : 'mint'}
        />
        <Stat label="Masuk bulan ini" nilai={String(ringkas.masukBulanIni)} />
        <Stat
          label="Disetujui bulan ini"
          nilai={formatRupiah(ringkas.nilaiDisetujuiBulanIni)}
          sub={`${ringkas.disetujuiBulanIni} pengajuan · ini beban, bukan omzet`}
        />
        <Stat
          label="Belum dibayar"
          nilai={formatRupiah(ringkas.belumDibayar)}
          sub="Disetujui, belum masuk Pengeluaran"
          nada={ringkas.belumDibayar > 0 ? 'pink' : undefined}
        />
        <Stat label="MoU aktif" nilai={String(mouAktif)} sub="Masih berlaku" />
      </section>

      {ringkas.mouHabis.length > 0 && (
        <section className="lead-alert">
          <b>
            MoU perlu ditindaklanjuti ({ringkas.mouHabis.length}) — berakhir dalam{' '}
            {AMBANG_MOU_HABIS_HARI} hari atau kurang:
          </b>
          <div className="lead-alert-list">
            {ringkas.mouHabis.slice(0, 8).map((m) => (
              <button key={m.k.id} type="button" onClick={() => buka(m.k)}>
                {m.k.instansi || '(tanpa nama)'}
                <em>
                  {m.sisaHari < 0
                    ? `habis ${Math.abs(m.sisaHari)} hari lalu`
                    : m.sisaHari === 0
                      ? 'habis hari ini'
                      : `${m.sisaHari} hari lagi`}
                </em>
              </button>
            ))}
          </div>
        </section>
      )}

      {ringkas.imbalanTertunggak.length > 0 && (
        <section className="lead-alert">
          <b>
            Imbalan belum ditagih ({ringkas.imbalanTertunggak.length}) — sponsor sudah
            disetujui, kompensasi untuk Kubik belum terpenuhi:
          </b>
          <div className="lead-alert-list">
            {ringkas.imbalanTertunggak.slice(0, 8).map(({ k, sisa }) => (
              <button key={k.id} type="button" onClick={() => buka(k)}>
                {k.instansi || '(tanpa nama)'}
                <em>{sisa} butir</em>
              </button>
            ))}
          </div>
        </section>
      )}

      {bisaUbah && (
        <div className="lead-toolbar">
          <button
            type="button"
            className="btn btn--pink"
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
          >
            <Icons.plus /> Catat pengajuan
          </button>
        </div>
      )}

      {ringkas.belumAda ? (
        <p className="lead-kosong-panel">
          Belum ada pengajuan tercatat. Setiap proposal MoU atau permintaan sponsor
          yang masuk lewat WhatsApp, DM, atau surat sebaiknya dicatat di sini — supaya
          tidak ada yang hilang di chat dan MoU yang mau habis tetap terlihat.
        </p>
      ) : (
        <section className="lead-board mitra-board">
          {KEMITRAAN_STATUS_ORDER.map((status) => {
            const kolom = semua.filter((k) => k.status === status)
            return (
              <div key={status} className={`lead-col mitra-col--${status}`}>
                <div className="lead-col-head">
                  <span>{KEMITRAAN_STATUS_LABEL[status]}</span>
                  <em>{kolom.length}</em>
                </div>
                <div className="lead-col-body">
                  {kolom.length === 0 ? (
                    <p className="lead-kosong">—</p>
                  ) : (
                    kolom.map((k) => (
                      <KartuPengajuan
                        key={k.id}
                        k={k}
                        hariIni={hariIni}
                        pengeluaranAda={data.pengeluaran.some(
                          (p) => p.id === k.pengeluaranId,
                        )}
                        picNama={k.pic ? (namaById.get(k.pic) ?? 'PIC') : undefined}
                        onClick={() => buka(k)}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {showForm && (
        <PengajuanModal
          existing={editing ?? undefined}
          data={data}
          bisaUbah={bisaUbah}
          onSave={simpan}
          onHapus={hapus}
          onPindah={pindahStatus}
          onBayar={catatPembayaran}
          onBatalBayar={batalkanPembayaran}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function KartuPengajuan({
  k,
  hariIni,
  pengeluaranAda,
  picNama,
  onClick,
}: {
  k: Pengajuan
  hariIni: string
  pengeluaranAda: boolean
  picNama?: string
  onClick: () => void
}) {
  const hari = (a: string, b: string) =>
    Math.round(
      (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) /
        86_400_000,
    )
  const antre = k.status === 'masuk' || k.status === 'ditinjau'
  const umur = antre ? hari(k.tanggalMasuk, hariIni) : null
  const sisaMou = k.mouBerakhir ? hari(hariIni, k.mouBerakhir) : null
  const imbalanSisa = k.imbalan.filter((i) => !i.selesai).length
  const nilai = k.nilaiDisetujui || k.nilaiDiminta

  return (
    <button
      type="button"
      className={
        'lead-kartu' + (umur != null && umur >= AMBANG_PENGAJUAN_HARI ? ' is-basi' : '')
      }
      onClick={onClick}
    >
      <span className="lead-kartu-nama">{k.instansi || '(tanpa nama)'}</span>
      {k.acara && <span className="mitra-kartu-acara">{k.acara}</span>}
      <span className="lead-kartu-meta">
        <em>{KEMITRAAN_JENIS_LABEL[k.jenis]}</em>
        {nilai > 0 && <b>{formatRupiah(nilai)}</b>}
      </span>
      <span className="lead-kartu-kaki">
        {picNama && <span>{picNama}</span>}
        {umur != null && (
          <span className={umur >= AMBANG_PENGAJUAN_HARI ? 'is-basi' : ''}>
            {umur === 0 ? 'masuk hari ini' : `${umur} hari`}
          </span>
        )}
      </span>
      {(k.status === 'disetujui' || k.status === 'selesai') && (
        <span className="mitra-tag-row">
          {k.nilaiDisetujui > 0 && (
            <em className={pengeluaranAda ? 'is-ok' : 'is-utang'}>
              {pengeluaranAda ? 'sudah dibayar' : 'belum dibayar'}
            </em>
          )}
          {imbalanSisa > 0 && <em className="is-utang">{imbalanSisa} imbalan</em>}
          {sisaMou != null && sisaMou <= AMBANG_MOU_HABIS_HARI && (
            <em className="is-utang">
              {sisaMou < 0 ? 'MoU habis' : `MoU ${sisaMou} hari`}
            </em>
          )}
        </span>
      )}
    </button>
  )
}

function Stat({
  label,
  nilai,
  sub,
  nada,
}: {
  label: string
  nilai: string
  sub?: string
  nada?: 'mint' | 'pink'
}) {
  return (
    <div className={`lead-stat${nada ? ` is-${nada}` : ''}`}>
      <span className="k">{label}</span>
      <span className="v">{nilai}</span>
      {sub && <span className="s">{sub}</span>}
    </div>
  )
}

// ======================================================================
// Modal catat/ubah pengajuan
// ======================================================================
function PengajuanModal({
  existing,
  data,
  bisaUbah,
  onSave,
  onHapus,
  onPindah,
  onBayar,
  onBatalBayar,
  onClose,
}: {
  existing?: Pengajuan
  data: AppData
  bisaUbah: boolean
  onSave: (k: Pengajuan) => void
  onHapus: (k: Pengajuan) => void
  onPindah: (k: Pengajuan, status: KemitraanStatus) => void
  onBayar: (k: Pengajuan, sumber: 'cash' | 'rekening') => void
  onBatalBayar: (k: Pengajuan) => void
  onClose: () => void
}) {
  const toast = useToast()
  const [instansi, setInstansi] = useState(existing?.instansi ?? '')
  const [jenis, setJenis] = useState<KemitraanJenis>(existing?.jenis ?? 'sponsorship')
  const [kontakNama, setKontakNama] = useState(existing?.kontakNama ?? '')
  const [kontak, setKontak] = useState(existing?.kontak ?? '')
  const [acara, setAcara] = useState(existing?.acara ?? '')
  const [tanggalAcara, setTanggalAcara] = useState(existing?.tanggalAcara ?? '')
  const [masuk, setMasuk] = useState(existing?.tanggalMasuk ?? todayKey())
  const [status, setStatus] = useState<KemitraanStatus>(existing?.status ?? 'masuk')
  const [permintaan, setPermintaan] = useState(existing?.permintaan ?? '')
  const [diminta, setDiminta] = useState(String(existing?.nilaiDiminta ?? 0))
  const [disetujui, setDisetujui] = useState(String(existing?.nilaiDisetujui ?? 0))
  const [bentuk, setBentuk] = useState<KemitraanBentuk>(existing?.bentuk ?? 'uang')
  const [imbalan, setImbalan] = useState<KemitraanImbalan[]>(existing?.imbalan ?? [])
  const [imbalanBaru, setImbalanBaru] = useState('')
  const [mouMulai, setMouMulai] = useState(existing?.mouMulai ?? '')
  const [mouBerakhir, setMouBerakhir] = useState(existing?.mouBerakhir ?? '')
  const [alasan, setAlasan] = useState(existing?.alasanTolak ?? '')
  const [catatan, setCatatan] = useState(existing?.catatan ?? '')
  const [pic, setPic] = useState(existing?.pic ?? '')
  const [sumber, setSumber] = useState<'cash' | 'rekening'>('cash')

  const angka = (t: string) => Number(t.replace(/[^\d]/g, '')) || 0
  const adaMou = jenis === 'mou' || jenis === 'keduanya'
  const sudahDicatat =
    !!existing?.pengeluaranId &&
    data.pengeluaran.some((p) => p.id === existing.pengeluaranId)
  const biaya = data.pengeluaran.find((p) => p.id === existing?.pengeluaranId)

  function terkini(): Pengajuan {
    return {
      id: existing?.id ?? uid(),
      instansi: instansi.trim(),
      jenis,
      kontakNama: kontakNama.trim(),
      kontak: kontak.trim(),
      acara: acara.trim(),
      tanggalAcara: tanggalAcara || undefined,
      tanggalMasuk: masuk,
      status,
      permintaan: permintaan.trim(),
      nilaiDiminta: angka(diminta),
      nilaiDisetujui: angka(disetujui),
      bentuk,
      imbalan,
      mouMulai: adaMou ? mouMulai || undefined : undefined,
      mouBerakhir: adaMou ? mouBerakhir || undefined : undefined,
      alasanTolak: alasan.trim() || undefined,
      catatan: catatan.trim() || undefined,
      pic: pic || undefined,
      // Distempel database saat status pindah ke disetujui/ditolak.
      tanggalKeputusan: existing?.tanggalKeputusan,
      pengeluaranId: existing?.pengeluaranId,
      dibuatOleh: existing?.dibuatOleh,
    }
  }

  function simpan() {
    if (!instansi.trim()) {
      toast('warn', 'Nama sekolah / instansi wajib diisi')
      return
    }
    if (status === 'ditolak' && !alasan.trim()) {
      toast('warn', 'Isi alasan penolakan — sekolah berhak tahu, dan itu jadi arsip')
      return
    }
    if (adaMou && mouMulai && mouBerakhir && mouBerakhir < mouMulai) {
      toast('warn', 'Tanggal berakhir MoU mendahului tanggal mulai')
      return
    }
    onSave(terkini())
  }

  return (
    <Modal onClose={onClose} wide>
      <ModalHead
        icon={<Icons.wallet />}
        color="var(--primary)"
        title={existing ? 'Ubah pengajuan' : 'Catat pengajuan'}
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="field">
          <label>Sekolah / instansi</label>
          <input
            type="text"
            autoFocus={!existing}
            value={instansi}
            disabled={!bisaUbah}
            onChange={(e) => setInstansi(e.target.value)}
            placeholder="mis. SMA 3 Bandung"
          />
        </div>

        <div className="lead-form-grid">
          <div className="field">
            <label>Jenis pengajuan</label>
            <select
              value={jenis}
              disabled={!bisaUbah}
              onChange={(e) => setJenis(e.target.value as KemitraanJenis)}
            >
              {(Object.keys(KEMITRAAN_JENIS_LABEL) as KemitraanJenis[]).map((j) => (
                <option key={j} value={j}>
                  {KEMITRAAN_JENIS_LABEL[j]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select
              value={status}
              disabled={!bisaUbah}
              onChange={(e) => setStatus(e.target.value as KemitraanStatus)}
            >
              {KEMITRAAN_STATUS_ORDER.map((st) => (
                <option key={st} value={st}>
                  {KEMITRAAN_STATUS_LABEL[st]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Nama penghubung</label>
            <input
              type="text"
              value={kontakNama}
              disabled={!bisaUbah}
              onChange={(e) => setKontakNama(e.target.value)}
              placeholder="Ketua panitia / guru pembina"
            />
          </div>
          <div className="field">
            <label>Kontak</label>
            <input
              type="text"
              value={kontak}
              disabled={!bisaUbah}
              onChange={(e) => setKontak(e.target.value)}
              placeholder="WA / Instagram / email"
            />
          </div>
          <div className="field">
            <label>Nama acara</label>
            <input
              type="text"
              value={acara}
              disabled={!bisaUbah}
              onChange={(e) => setAcara(e.target.value)}
              placeholder="Pensi, Class Meeting, Wisuda…"
            />
          </div>
          <div className="field">
            <label>Tanggal acara</label>
            <input
              type="date"
              value={tanggalAcara}
              disabled={!bisaUbah}
              onChange={(e) => setTanggalAcara(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Tanggal proposal masuk</label>
            <input
              type="date"
              value={masuk}
              disabled={!bisaUbah}
              onChange={(e) => setMasuk(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Ditangani oleh</label>
            <select value={pic} disabled={!bisaUbah} onChange={(e) => setPic(e.target.value)}>
              <option value="">— belum ditugaskan —</option>
              {data.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nama}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Yang diminta</label>
          <textarea
            value={permintaan}
            disabled={!bisaUbah}
            onChange={(e) => setPermintaan(e.target.value)}
            rows={3}
            style={{ minHeight: 68, resize: 'vertical' }}
            placeholder="Isi proposalnya: dana Rp…, booth foto gratis, voucher untuk doorprize…"
          />
        </div>

        <div className="lead-form-grid">
          <div className="field">
            <label>Nilai diminta (Rp)</label>
            <input
              type="number"
              inputMode="numeric"
              value={diminta}
              disabled={!bisaUbah}
              onChange={(e) => setDiminta(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Nilai disetujui (Rp)</label>
            <input
              type="number"
              inputMode="numeric"
              value={disetujui}
              disabled={!bisaUbah}
              onChange={(e) => setDisetujui(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Bentuk sponsor</label>
            <select
              value={bentuk}
              disabled={!bisaUbah}
              onChange={(e) => setBentuk(e.target.value as KemitraanBentuk)}
            >
              {(Object.keys(KEMITRAAN_BENTUK_LABEL) as KemitraanBentuk[]).map((b) => (
                <option key={b} value={b}>
                  {KEMITRAAN_BENTUK_LABEL[b]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {adaMou && (
          <div className="lead-form-grid">
            <div className="field">
              <label>MoU mulai</label>
              <input
                type="date"
                value={mouMulai}
                disabled={!bisaUbah}
                onChange={(e) => setMouMulai(e.target.value)}
              />
            </div>
            <div className="field">
              <label>MoU berakhir</label>
              <input
                type="date"
                value={mouBerakhir}
                disabled={!bisaUbah}
                onChange={(e) => setMouBerakhir(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* --- Timbal balik untuk Kubik --- */}
        <div className="field">
          <label>Timbal balik untuk Kubik</label>
          {imbalan.length === 0 ? (
            <p className="lead-fu-kosong">
              Belum ada. Sponsorship tanpa daftar ini tidak bisa ditagih.
            </p>
          ) : (
            <ul className="mitra-imbalan">
              {imbalan.map((i) => (
                <li key={i.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={i.selesai}
                      disabled={!bisaUbah}
                      onChange={() =>
                        setImbalan((cur) =>
                          cur.map((x) =>
                            x.id === i.id ? { ...x, selesai: !x.selesai } : x,
                          ),
                        )
                      }
                    />
                    <span className={i.selesai ? 'is-done' : ''}>{i.teks}</span>
                  </label>
                  {bisaUbah && (
                    <button
                      type="button"
                      aria-label={`Hapus "${i.teks}"`}
                      onClick={() =>
                        setImbalan((cur) => cur.filter((x) => x.id !== i.id))
                      }
                    >
                      <Icons.x />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {bisaUbah && (
            <div className="lead-fu-tambah">
              <input
                type="text"
                value={imbalanBaru}
                onChange={(e) => setImbalanBaru(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (!imbalanBaru.trim()) return
                  setImbalan((cur) => [
                    ...cur,
                    { id: uid(), teks: imbalanBaru.trim(), selesai: false },
                  ])
                  setImbalanBaru('')
                }}
                placeholder="Logo di banner, booth di acara, post IG sekolah…"
              />
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!imbalanBaru.trim()}
                onClick={() => {
                  setImbalan((cur) => [
                    ...cur,
                    { id: uid(), teks: imbalanBaru.trim(), selesai: false },
                  ])
                  setImbalanBaru('')
                }}
              >
                Tambah
              </button>
            </div>
          )}
        </div>

        {status === 'ditolak' && (
          <div className="field">
            <label>Alasan ditolak</label>
            <input
              type="text"
              value={alasan}
              disabled={!bisaUbah}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="Anggaran habis, jadwal bentrok, tidak sesuai segmen…"
            />
          </div>
        )}

        <div className="field">
          <label>Catatan</label>
          <textarea
            value={catatan}
            disabled={!bisaUbah}
            onChange={(e) => setCatatan(e.target.value)}
            rows={3}
            style={{ minHeight: 68, resize: 'vertical' }}
          />
        </div>

        {/* --- Pembayaran sponsor → Pengeluaran --- */}
        {existing && (existing.status === 'disetujui' || existing.status === 'selesai') && (
          <div className="field">
            <label>Pembayaran sponsor</label>
            {existing.tanggalKeputusan && (
              <p className="mitra-nota">
                Diputuskan {formatTanggalPanjang(existing.tanggalKeputusan)}.
              </p>
            )}
            {sudahDicatat ? (
              <div className="mitra-bayar is-ok">
                <span>
                  Tercatat di Pengeluaran{' '}
                  {biaya ? `${formatTanggalPanjang(biaya.tanggal)} · ${formatRupiah(biaya.jumlah)}` : ''}
                </span>
                {bisaUbah && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => onBatalBayar(existing)}
                  >
                    Batalkan
                  </button>
                )}
              </div>
            ) : existing.bentuk !== 'uang' ? (
              // Sponsor non-tunai sengaja TIDAK dicatat sebagai pengeluaran:
              // rekonsiliasi kas (kas.ts) memotong dompet/rekening dari setiap
              // baris pengeluaran, padahal voucher/booth tidak mengurangi uang
              // yang ada di laci. Biayanya nyata, tapi bukan kas keluar.
              <p className="mitra-nota">
                Bentuknya {KEMITRAAN_BENTUK_LABEL[existing.bentuk].toLowerCase()} — tidak
                dicatat sebagai pengeluaran karena tidak ada uang yang keluar dari
                dompet atau rekening. Catat manual di Pengeluaran bila ada biaya
                tunai menyertainya.
              </p>
            ) : existing.nilaiDisetujui <= 0 ? (
              <p className="mitra-nota">Isi nilai disetujui dulu, lalu simpan.</p>
            ) : (
              bisaUbah && (
                <div className="mitra-bayar">
                  <select
                    value={sumber}
                    onChange={(e) => setSumber(e.target.value as 'cash' | 'rekening')}
                  >
                    <option value="cash">Dibayar tunai (dompet)</option>
                    <option value="rekening">Dibayar transfer (rekening)</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => onBayar(existing, sumber)}
                  >
                    <Icons.wallet /> Catat {formatRupiah(existing.nilaiDisetujui)}
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {bisaUbah && (
          <>
            {existing && existing.status !== 'disetujui' && existing.status !== 'selesai' && (
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={() => {
                  onPindah(existing, 'disetujui')
                  onClose()
                }}
              >
                <Icons.check /> Setujui pengajuan
              </button>
            )}
            <button
              type="button"
              className="btn btn--pink btn--block btn--lg"
              onClick={simpan}
            >
              <Icons.check /> Simpan
            </button>
            {existing && (
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={() => onHapus(existing)}
              >
                <Icons.trash /> Hapus pengajuan
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
