// =============================================================
// Leads.tsx · Pipeline calon klien (kanban sales).
//
// `laporan_event` hanya mencatat event yang SUDAH terjadi. Layar ini menampung
// yang sedang DIKEJAR: dari lead masuk, dihubungi, follow-up, negosiasi,
// sampai closing atau gagal.
//
// Kolomnya sengaja mengikuti pola Papan Promosi supaya tidak ada kosakata UI
// baru yang harus dipelajari. Bedanya satu: kartu di sini punya UMUR — berapa
// lama ia didiamkan — karena lead yang tidak di-follow-up adalah lead yang
// hilang, dan itulah yang paling perlu terlihat.
//
// Pipeline adalah data komersial: hanya pengelola yang boleh mengubah, operator
// hanya melihat lead yang di-PIC-kan padanya (RLS migration 0047).
//
// Layar ini bertab dua. Tab kedua — MoU & Sponsorship — sengaja menumpang di
// sini alih-alih jadi menu sidebar sendiri: keduanya pekerjaan kemitraan yang
// sama, ditangani orang yang sama, dan aplikasi ini dipakai satu owner + satu
// manajer. Datanya tetap terpisah (tabel `kemitraan`, migration 0053) karena
// arah uangnya berlawanan; lihat Kemitraan.tsx.
// =============================================================
import { useMemo, useState } from 'react'
import type { AppData, Lead, LeadFollowup, LeadKategori, LeadTahap } from '../types'
import { uid, todayKey } from '../storage'
import { formatRupiah } from '../income'
import { formatTanggalPanjang } from '../attendance'
import {
  AMBANG_FOLLOWUP_HARI,
  LEAD_KATEGORI_LABEL,
  LEAD_TAHAP_AKTIF,
  LEAD_TAHAP_LABEL,
  LEAD_TAHAP_ORDER,
  KEMITRAAN_STATUS_ANTRE,
  pipelineLeads,
} from '../manajemen'
import { Icons } from '../components/Icons'
import { Modal, ModalHead } from '../components/Modal'
import { useToast } from '../components/Toast'
import { Kemitraan } from './Kemitraan'

type Props = {
  data: AppData
  setData: (d: AppData) => void
  /** Hanya pengelola yang boleh mengubah; operator melihat lead miliknya. */
  bisaUbah: boolean
  currentUserId: string
}

export function Leads({ data, setData, bisaUbah, currentUserId }: Props) {
  const toast = useToast()
  const hariIni = todayKey()
  const [monthKey] = useState(() => hariIni.slice(0, 7))
  const [editing, setEditing] = useState<Lead | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState<'pipeline' | 'kemitraan'>('pipeline')

  const leads = data.leads ?? []
  const pipeline = useMemo(
    () => pipelineLeads(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const namaById = useMemo(
    () => new Map(data.employees.map((e) => [e.id, e.nama])),
    [data.employees],
  )
  // Badge tab: pengajuan yang masih menunggu keputusan. Angkanya di tab supaya
  // proposal yang masuk tidak perlu ditemukan dengan cara membuka tabnya dulu.
  const antreKemitraan = useMemo(
    () =>
      (data.kemitraan ?? []).filter((k) => KEMITRAAN_STATUS_ANTRE.includes(k.status))
        .length,
    [data.kemitraan],
  )
  const terakhirKontak = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of data.leadsFollowup ?? []) {
      const kini = m.get(f.leadId)
      if (!kini || f.tanggal > kini) m.set(f.leadId, f.tanggal)
    }
    return m
  }, [data.leadsFollowup])

  function simpan(l: Lead) {
    const ada = leads.some((x) => x.id === l.id)
    setData({
      ...data,
      leads: ada ? leads.map((x) => (x.id === l.id ? l : x)) : [...leads, l],
    })
    setShowForm(false)
    setEditing(null)
    toast('ok', ada ? 'Lead diperbarui' : 'Lead ditambahkan')
  }

  function hapus(l: Lead) {
    if (!confirm(`Hapus lead "${l.nama}"? Riwayat follow-up-nya ikut terhapus.`)) return
    setData({
      ...data,
      leads: leads.filter((x) => x.id !== l.id),
      leadsFollowup: (data.leadsFollowup ?? []).filter((f) => f.leadId !== l.id),
    })
    setEditing(null)
    setShowForm(false)
  }

  function pindahTahap(l: Lead, tahap: LeadTahap) {
    // `tanggalClosing` sengaja tidak disentuh di sini — distempel database.
    setData({ ...data, leads: leads.map((x) => (x.id === l.id ? { ...x, tahap } : x)) })
  }

  function catatFollowup(leadId: string, catatan: string) {
    const f: LeadFollowup = {
      id: uid(),
      leadId,
      tanggal: todayKey(),
      catatan,
      oleh: currentUserId,
    }
    setData({ ...data, leadsFollowup: [...(data.leadsFollowup ?? []), f] })
  }

  return (
    <>
      <section className="hero hero--compact">
        <div className="hero-top">
          <span className="date-pill">
            <Icons.sun /> {formatTanggalPanjang(hariIni)}
          </span>
        </div>
        <h1>Leads &amp; Sales 🎯</h1>
        <p className="sub">
          {tab === 'pipeline'
            ? 'Calon klien yang sedang dikejar — dari masuk sampai closing.'
            : 'Pengajuan MoU & sponsorship yang masuk dari sekolah dan instansi.'}
        </p>
      </section>

      <nav className="mgr-tabs" role="tablist" aria-label="Bagian Leads & Sales">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pipeline'}
          className={'mgr-tab' + (tab === 'pipeline' ? ' is-aktif' : '')}
          onClick={() => setTab('pipeline')}
        >
          <span className="mgr-tab-lbl">Pipeline</span>
          <em className="mgr-tab-sub">Calon klien yang kita kejar</em>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'kemitraan'}
          className={'mgr-tab' + (tab === 'kemitraan' ? ' is-aktif' : '')}
          onClick={() => setTab('kemitraan')}
        >
          <span className="mgr-tab-lbl">
            MoU &amp; Sponsorship
            {antreKemitraan > 0 && <em className="mgr-tab-badge">{antreKemitraan}</em>}
          </span>
          <em className="mgr-tab-sub">Pengajuan yang masuk ke kita</em>
        </button>
      </nav>

      {tab === 'kemitraan' ? (
        <Kemitraan data={data} setData={setData} bisaUbah={bisaUbah} />
      ) : (
        <>
      <section className="lead-stats">
        <Stat label="Leads baru bulan ini" nilai={String(pipeline.baruBulanIni)} />
        <Stat label="Closing bulan ini" nilai={String(pipeline.closingBulanIni)} nada="mint" />
        <Stat
          label="Nilai closing"
          nilai={formatRupiah(pipeline.nilaiClosing)}
          nada="mint"
        />
        <Stat
          label="Nilai pipeline"
          nilai={formatRupiah(pipeline.nilaiPipeline)}
          sub="Estimasi yang masih dikejar"
        />
        <Stat
          label="Konversi"
          nilai={`${Math.round(pipeline.konversi * 100)}%`}
          sub={`${pipeline.closingBulanIni} closing · ${pipeline.gagalBulanIni} gagal`}
          nada={pipeline.konversi >= 0.5 ? 'mint' : 'pink'}
        />
      </section>

      {pipeline.perluFollowup.length > 0 && (
        <section className="lead-alert">
          <b>
            Perlu di-follow-up ({pipeline.perluFollowup.length}) — didiamkan{' '}
            {AMBANG_FOLLOWUP_HARI} hari atau lebih:
          </b>
          <div className="lead-alert-list">
            {pipeline.perluFollowup.slice(0, 8).map((b) => (
              <button
                key={b.lead.id}
                type="button"
                onClick={() => {
                  setEditing(b.lead)
                  setShowForm(true)
                }}
              >
                {b.lead.nama || '(tanpa nama)'}
                <em>
                  {b.terakhir ? `diam ${b.diamHari} hari` : 'belum pernah dihubungi'}
                </em>
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
            <Icons.plus /> Tambah lead
          </button>
        </div>
      )}

      <section className="lead-board">
        {LEAD_TAHAP_ORDER.map((tahap) => {
          const kolom = leads.filter((l) => l.tahap === tahap)
          return (
            <div key={tahap} className={`lead-col lead-col--${tahap}`}>
              <div className="lead-col-head">
                <span>{LEAD_TAHAP_LABEL[tahap]}</span>
                <em>{kolom.length}</em>
              </div>
              <div className="lead-col-body">
                {kolom.length === 0 ? (
                  <p className="lead-kosong">—</p>
                ) : (
                  kolom.map((l) => {
                    const terakhir = terakhirKontak.get(l.id)
                    const diam = LEAD_TAHAP_AKTIF.includes(l.tahap)
                      ? Math.round(
                          (new Date(`${hariIni}T00:00:00`).getTime() -
                            new Date(`${terakhir ?? l.tanggalMasuk}T00:00:00`).getTime()) /
                            86_400_000,
                        )
                      : null
                    return (
                      <button
                        key={l.id}
                        type="button"
                        className={
                          'lead-kartu' +
                          (diam != null && diam >= AMBANG_FOLLOWUP_HARI ? ' is-basi' : '')
                        }
                        onClick={() => {
                          setEditing(l)
                          setShowForm(true)
                        }}
                      >
                        <span className="lead-kartu-nama">{l.nama || '(tanpa nama)'}</span>
                        <span className="lead-kartu-meta">
                          <em>{LEAD_KATEGORI_LABEL[l.kategori]}</em>
                          {(l.nilaiRealisasi || l.nilaiEstimasi) > 0 && (
                            <b>{formatRupiah(l.nilaiRealisasi || l.nilaiEstimasi)}</b>
                          )}
                        </span>
                        <span className="lead-kartu-kaki">
                          {l.pic && <span>{namaById.get(l.pic) ?? 'PIC'}</span>}
                          {diam != null && (
                            <span className={diam >= AMBANG_FOLLOWUP_HARI ? 'is-basi' : ''}>
                              {diam === 0 ? 'hari ini' : `${diam} hari`}
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </section>

      {showForm && (
        <LeadModal
          existing={editing ?? undefined}
          data={data}
          bisaUbah={bisaUbah}
          namaById={namaById}
          followup={(data.leadsFollowup ?? []).filter((f) => f.leadId === editing?.id)}
          onSave={simpan}
          onHapus={hapus}
          onPindah={pindahTahap}
          onFollowup={catatFollowup}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}
        </>
      )}
    </>
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
// Modal tambah/edit + riwayat follow-up
// ======================================================================
function LeadModal({
  existing,
  data,
  bisaUbah,
  namaById,
  followup,
  onSave,
  onHapus,
  onPindah,
  onFollowup,
  onClose,
}: {
  existing?: Lead
  data: AppData
  bisaUbah: boolean
  namaById: Map<string, string>
  followup: LeadFollowup[]
  onSave: (l: Lead) => void
  onHapus: (l: Lead) => void
  onPindah: (l: Lead, tahap: LeadTahap) => void
  onFollowup: (leadId: string, catatan: string) => void
  onClose: () => void
}) {
  const toast = useToast()
  const [nama, setNama] = useState(existing?.nama ?? '')
  const [kontak, setKontak] = useState(existing?.kontak ?? '')
  const [sumber, setSumber] = useState(existing?.sumber ?? '')
  const [kategori, setKategori] = useState<LeadKategori>(existing?.kategori ?? 'lainnya')
  const [tahap, setTahap] = useState<LeadTahap>(existing?.tahap ?? 'baru')
  const [estimasi, setEstimasi] = useState(String(existing?.nilaiEstimasi ?? 0))
  const [realisasi, setRealisasi] = useState(String(existing?.nilaiRealisasi ?? 0))
  const [pic, setPic] = useState(existing?.pic ?? '')
  const [masuk, setMasuk] = useState(existing?.tanggalMasuk ?? todayKey())
  const [alasan, setAlasan] = useState(existing?.alasanGagal ?? '')
  const [catatan, setCatatan] = useState(existing?.catatan ?? '')
  const [fuText, setFuText] = useState('')

  const angka = (t: string) => Number(t.replace(/[^\d]/g, '')) || 0

  function simpan() {
    if (!nama.trim()) {
      toast('warn', 'Nama calon klien wajib diisi')
      return
    }
    onSave({
      id: existing?.id ?? uid(),
      nama: nama.trim(),
      kontak: kontak.trim(),
      sumber: sumber.trim(),
      kategori,
      tahap,
      nilaiEstimasi: angka(estimasi),
      nilaiRealisasi: angka(realisasi),
      pic: pic || undefined,
      tanggalMasuk: masuk,
      // Distempel database saat tahap berpindah ke 'closing' — jangan dikirim.
      tanggalClosing: existing?.tanggalClosing,
      alasanGagal: alasan.trim() || undefined,
      catatan: catatan.trim() || undefined,
      dibuatOleh: existing?.dibuatOleh,
    })
  }

  return (
    <Modal onClose={onClose} wide>
      <ModalHead
        icon={<Icons.user />}
        color="var(--primary)"
        title={existing ? 'Ubah lead' : 'Tambah lead'}
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="field">
          <label>Nama calon klien / instansi</label>
          <input
            type="text"
            autoFocus={!existing}
            value={nama}
            disabled={!bisaUbah}
            onChange={(e) => setNama(e.target.value)}
            placeholder="mis. SMA 3 Bandung"
          />
        </div>
        <div className="lead-form-grid">
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
            <label>Sumber</label>
            <input
              type="text"
              value={sumber}
              disabled={!bisaUbah}
              onChange={(e) => setSumber(e.target.value)}
              placeholder="DM Instagram, walk-in, referral…"
            />
          </div>
          <div className="field">
            <label>Kategori</label>
            <select
              value={kategori}
              disabled={!bisaUbah}
              onChange={(e) => setKategori(e.target.value as LeadKategori)}
            >
              {(Object.keys(LEAD_KATEGORI_LABEL) as LeadKategori[]).map((k) => (
                <option key={k} value={k}>
                  {LEAD_KATEGORI_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tahap</label>
            <select
              value={tahap}
              disabled={!bisaUbah}
              onChange={(e) => setTahap(e.target.value as LeadTahap)}
            >
              {LEAD_TAHAP_ORDER.map((t) => (
                <option key={t} value={t}>
                  {LEAD_TAHAP_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Estimasi nilai (Rp)</label>
            <input
              type="number"
              inputMode="numeric"
              value={estimasi}
              disabled={!bisaUbah}
              onChange={(e) => setEstimasi(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Realisasi (Rp)</label>
            <input
              type="number"
              inputMode="numeric"
              value={realisasi}
              disabled={!bisaUbah}
              onChange={(e) => setRealisasi(e.target.value)}
            />
          </div>
          <div className="field">
            <label>PIC</label>
            <select value={pic} disabled={!bisaUbah} onChange={(e) => setPic(e.target.value)}>
              <option value="">— belum ditugaskan —</option>
              {data.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nama}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tanggal masuk</label>
            <input
              type="date"
              value={masuk}
              disabled={!bisaUbah}
              onChange={(e) => setMasuk(e.target.value)}
            />
          </div>
        </div>
        {tahap === 'gagal' && (
          <div className="field">
            <label>Alasan gagal</label>
            <input
              type="text"
              value={alasan}
              disabled={!bisaUbah}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="Harga, jadwal bentrok, pindah ke vendor lain…"
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
            style={{ minHeight: 72, resize: 'vertical' }}
          />
        </div>

        {existing && (
          <div className="field">
            <label>Riwayat follow-up</label>
            {followup.length === 0 ? (
              <p className="lead-fu-kosong">Belum pernah dihubungi.</p>
            ) : (
              <ul className="lead-fu-list">
                {[...followup]
                  .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
                  .map((f) => (
                    <li key={f.id}>
                      <b>{formatTanggalPanjang(f.tanggal)}</b>
                      <span>{f.catatan || '(tanpa catatan)'}</span>
                      {f.oleh && <em>{namaById.get(f.oleh) ?? ''}</em>}
                    </li>
                  ))}
              </ul>
            )}
            {bisaUbah && (
              <div className="lead-fu-tambah">
                <input
                  type="text"
                  value={fuText}
                  onChange={(e) => setFuText(e.target.value)}
                  placeholder="Hasil kontak hari ini…"
                />
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={!fuText.trim()}
                  onClick={() => {
                    onFollowup(existing.id, fuText.trim())
                    setFuText('')
                    toast('ok', 'Follow-up dicatat')
                  }}
                >
                  Catat
                </button>
              </div>
            )}
          </div>
        )}

        {bisaUbah && (
          <>
            {existing && tahap !== 'closing' && (
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={() => {
                  onPindah(existing, 'closing')
                  onClose()
                }}
              >
                <Icons.check /> Tandai closing
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
                <Icons.trash /> Hapus lead
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
