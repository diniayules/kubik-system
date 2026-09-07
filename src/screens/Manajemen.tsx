import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppData, SosmedHarian, TargetBulanan } from '../types'
import { todayKey } from '../storage'
import { formatDurasi } from '../attendance'
import { formatRupiah } from '../income'
import { hitungRekonsiliasiKas } from '../kas'
import {
  bulanSebelumnya,
  bulanTerakhir,
  bulanTersedia,
  delta,
  kepatuhanChecklist,
  kinerjaKaryawan,
  operasional,
  AKSI_SOSMED,
  AKSI_SOSMED_LABEL,
  aktivitasSosmed,
  cakupanShift,
  dampakSosmed,
  MIN_SAMPEL_DAMPAK,
  eksekusiKonten,
  kontribusiKonten,
  kontribusiSales,
  LEAD_KATEGORI_LABEL,
  LEAD_TAHAP_LABEL,
  LEAD_TAHAP_ORDER,
  pipelineLeads,
  ringkasanBulan,
  saranTarget,
  skorKPI,
  targetBerlaku,
} from '../manajemen'
import type { AksiSosmed, BarisKPI, HariDampak } from '../manajemen'
import { Avatar, colorIndexForName } from '../components/Avatar'
import { Icons } from '../components/Icons'

type Props = {
  data: AppData
  /** Write-through ke Supabase — dipakai owner untuk menyimpan target KPI. */
  setData: (d: AppData) => void
  /**
   * Owner melihat semuanya. Manajer melihat panel yang sama KECUALI gaji per
   * orang & rekonsiliasi kas — lihat lib/roles.ts.
   */
  isOwner: boolean
  onLihatAbsensi: () => void
  onLihatJadwal: () => void
  onLihatLeads: () => void
  onLihatInventaris: () => void
  onLihatPromosi: () => void
  onLihatLaporan: () => void
}

/** "2026-09" → "September 2026". */
function labelBulan(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  })
}

/** "2026-09" → "Sep". */
function labelBulanPendek(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'short' })
}

/** 1.250.000 → "1,3 jt". Untuk sumbu grafik yang sempit. */
function rupiahRingkas(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace('.', ',')} M`
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} jt`
  if (abs >= 1_000) return `${Math.round(n / 1_000)} rb`
  return String(Math.round(n))
}

function persen(x: number, digit = 0): string {
  return `${(x * 100).toFixed(digit).replace('.', ',')}%`
}

export function Manajemen({
  data,
  setData,
  isOwner,
  onLihatAbsensi,
  onLihatJadwal,
  onLihatLeads,
  onLihatInventaris,
  onLihatPromosi,
  onLihatLaporan,
}: Props) {
  const hariIni = todayKey()
  const periodeList = useMemo(() => bulanTersedia(data, hariIni), [data, hariIni])
  const [monthKey, setMonthKey] = useState(() => hariIni.slice(0, 7))

  const kini = useMemo(
    () => ringkasanBulan(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const lalu = useMemo(
    () => ringkasanBulan(data, bulanSebelumnya(monthKey), hariIni),
    [data, monthKey, hariIni],
  )
  const tren = useMemo(
    () =>
      bulanTerakhir(monthKey, 6).map((k) => ringkasanBulan(data, k, hariIni)),
    [data, monthKey, hariIni],
  )
  const kinerja = useMemo(
    () => kinerjaKaryawan(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const checklist = useMemo(
    () => kepatuhanChecklist(data, monthKey),
    [data, monthKey],
  )
  const ops = useMemo(
    () => operasional(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const kas = useMemo(
    () => (isOwner ? hitungRekonsiliasiKas(data, monthKey, hariIni) : null),
    [data, monthKey, hariIni, isOwner],
  )
  const kpi = useMemo(
    () => skorKPI(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const jadwal = useMemo(
    () => cakupanShift(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const sosmed = useMemo(
    () => aktivitasSosmed(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const eksekusi = useMemo(
    () => eksekusiKonten(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const dampak = useMemo(
    () => dampakSosmed(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const kontribusi = useMemo(
    () => kontribusiKonten(data, monthKey),
    [data, monthKey],
  )
  const pipeline = useMemo(
    () => pipelineLeads(data, monthKey, hariIni),
    [data, monthKey, hariIni],
  )
  const sales = useMemo(() => kontribusiSales(data, monthKey), [data, monthKey])

  const [tglPilih, setTglPilih] = useState(hariIni)
  // Tanggal yang dicatat harus ikut periode yang sedang dilihat; kalau pemilih
  // bulan digeser, jatuh ke hari ini (bulan berjalan) atau tanggal 1.
  const tglSosmed = tglPilih.startsWith(monthKey)
    ? tglPilih
    : monthKey === hariIni.slice(0, 7)
      ? hariIni
      : `${monthKey}-01`
  const logHariIni = (data.sosmedHarian ?? []).find((r) => r.tanggal === tglSosmed)

  /**
   * Catat/ubah satu hari sosmed. Baris yang semua aksinya mati DIHAPUS, bukan
   * disimpan sebagai baris kosong — supaya "hari bolong = tanggal yang hilang"
   * tetap benar dan tabelnya tidak menumpuk baris tak bermakna.
   */
  function ubahSosmed(tanggal: string, patch: Partial<SosmedHarian>) {
    const list = data.sosmedHarian ?? []
    const baru: SosmedHarian = {
      tanggal,
      posting: false,
      story: false,
      repost: false,
      engagement: false,
      ...list.find((r) => r.tanggal === tanggal),
      ...patch,
    }
    const sisa = list.filter((r) => r.tanggal !== tanggal)
    const kosong =
      AKSI_SOSMED.every((a) => !baru[a]) && !baru.catatan && !baru.tautan && !baru.oleh
    setData({ ...data, sosmedHarian: kosong ? sisa : [...sisa, baru] })
  }
  const [editTarget, setEditTarget] = useState(false)

  function simpanTarget(t: TargetBulanan) {
    setData({
      ...data,
      targetBulanan: { ...(data.targetBulanan ?? {}), [monthKey]: t },
    })
    setEditTarget(false)
  }
  const saldoAktual = data.saldoAktual[monthKey] ?? { dompet: 0, rekening: 0 }

  const komposisi = [
    { label: 'Tiket', nilai: kini.incomeTiket, warna: 'var(--primary-2)' },
    { label: 'Cetak tambahan', nilai: kini.incomeCetak, warna: 'var(--mint)' },
    { label: 'Upgrade', nilai: kini.incomeUpgrade, warna: 'var(--yellow)' },
    { label: 'Produk', nilai: kini.incomeProduk, warna: 'var(--pink)' },
    {
      label: 'Event Photobooth',
      nilai: kini.eventPerKategori.photobooth.pendapatan,
      warna: 'var(--primary)',
    },
    {
      label: 'Event Photo Game',
      nilai: kini.eventPerKategori.game.pendapatan,
      warna: 'var(--pink-deep)',
    },
  ]
    .filter((k) => k.nilai > 0)
    .sort((a, b) => b.nilai - a.nilai)

  const tindakan = [
    {
      // Paling mendesak: hari yang sudah di depan mata tapi belum ada penjaga.
      jumlah: jadwal.bolongMendatang.length,
      label: 'Hari ke depan tanpa operator terjadwal',
      aksi: 'Buka jadwal shift',
      onClick: onLihatJadwal,
      nada: 'pink' as const,
    },
    {
      jumlah: pipeline.perluFollowup.length,
      label: 'Leads menunggu di-follow-up',
      aksi: 'Buka leads & sales',
      onClick: onLihatLeads,
      nada: 'primary' as const,
    },
    {
      jumlah: eksekusi.menunggak.length,
      label: 'Campaign lewat deadline & belum selesai',
      aksi: 'Buka papan promosi',
      onClick: onLihatPromosi,
      nada: 'yellow' as const,
    },
    {
      jumlah: ops.absenMenunggu,
      label: 'Absensi manual menunggu persetujuan',
      aksi: 'Buka presensi',
      onClick: onLihatAbsensi,
      nada: 'pink' as const,
    },
    {
      jumlah: ops.stokKritis.length,
      label: 'Item stok di bawah ambang aman',
      aksi: 'Buka inventaris',
      onClick: onLihatInventaris,
      nada: 'yellow' as const,
    },
    {
      jumlah: ops.promoMenunggu,
      label: 'Ide promosi menunggu ACC',
      aksi: 'Buka papan promosi',
      onClick: onLihatPromosi,
      nada: 'primary' as const,
    },
    {
      jumlah: ops.hariTanpaLaporan,
      label: 'Hari berjalan tanpa laporan pemasukan',
      aksi: 'Buka pemasukan',
      onClick: onLihatLaporan,
      nada: 'primary' as const,
    },
  ].filter((t) => t.jumlah > 0)

  return (
    <>
      {/* ---------- Hero + pemilih periode ---------- */}
      <section className="mgr-hero">
        <div className="mgr-hero-text">
          <span className="mgr-kicker">
            {isOwner ? '👑 Owner' : '🛡️ Manajer'} · Dashboard Manajemen
          </span>
          <h2 className="mgr-hero-judul">{labelBulan(monthKey)}</h2>
          <p className="mgr-hero-sub">
            {kini.hariBerlaporan} hari berlaporan dari {kini.hariBerjalan} hari
            berjalan · rata-rata {formatRupiah(kini.rataPerHari)}/hari
          </p>
        </div>
        <label className="mgr-periode">
          <span>Periode</span>
          <select
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
          >
            {periodeList.map((k) => (
              <option key={k} value={k}>
                {labelBulan(k)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {/* ---------- KPI Scorecard manajer ---------- */}
      <Panel
        judul="KPI Manajer"
        sub={
          kpi.targetSaran
            ? 'Target masih berupa saran otomatis (2× rata-rata 3 bulan terakhir) — belum disetujui.'
            : `${kpi.tercapai} tercapai · ${kpi.tertinggal} tertinggal dari ${kpi.aktif} KPI aktif`
        }
        badge={`Skor ${persen(kpi.skor)}`}
        aksi={
          isOwner ? (
            <button
              type="button"
              className="mgr-aksi-btn"
              onClick={() => setEditTarget((v) => !v)}
            >
              {editTarget ? 'Tutup' : 'Atur target'}
            </button>
          ) : undefined
        }
      >
        {editTarget && (
          <TargetEditor
            awal={targetBerlaku(data, monthKey, hariIni).target}
            saran={saranTarget(data, monthKey, hariIni)}
            onSimpan={simpanTarget}
            onBatal={() => setEditTarget(false)}
          />
        )}
        <div className="mgr-kpi-list">
          {kpi.baris.map((b) => (
            <KpiRow key={b.id} baris={b} laju={kpi.laju} />
          ))}
        </div>
        <p className="mgr-hint">
          Bulan berjalan dinilai proporsional: pada {persen(kpi.laju)} perjalanan
          bulan, capaian {persen(kpi.laju)} sudah dianggap on track.
        </p>
      </Panel>

      {/* ---------- KPI ---------- */}
      <div className="mgr-kpi-grid">
        <StatCard
          nada="primary"
          label="Omzet"
          nilai={formatRupiah(kini.omzet)}
          delta={delta(kini.omzet, lalu.omzet)}
          sub={`Studio ${formatRupiah(kini.omzetStudio)} · Event ${formatRupiah(kini.eventPendapatan)}`}
          icon={<Icons.wallet />}
        />
        <StatCard
          nada="pink"
          label="Biaya"
          nilai={formatRupiah(kini.biaya)}
          delta={delta(kini.biaya, lalu.biaya)}
          deltaBaik="turun"
          sub={`Pengeluaran ${formatRupiah(kini.pengeluaran)} · Biaya event ${formatRupiah(kini.eventBiaya)}`}
          icon={<Icons.cart />}
        />
        <StatCard
          nada="mint"
          label="Laba bersih"
          nilai={formatRupiah(kini.laba)}
          delta={delta(kini.laba, lalu.laba)}
          sub={`Bulan lalu ${formatRupiah(lalu.laba)}`}
          icon={<Icons.check />}
        />
        <StatCard
          nada="yellow"
          label="Margin"
          nilai={persen(kini.margin, 1)}
          delta={null}
          sub={`Bulan lalu ${persen(lalu.margin, 1)}`}
          icon={<Icons.info />}
        />
      </div>

      <div className="mgr-cols">
        {/* ================= Kolom utama ================= */}
        <div className="mgr-col">
          <Panel
            judul="Tren 6 Bulan"
            sub="Omzet dibandingkan biaya, dan laba bersih tiap bulan"
          >
            <TrenChart
              rows={tren.map((t) => ({
                label: labelBulanPendek(t.monthKey),
                omzet: t.omzet,
                biaya: t.biaya,
                laba: t.laba,
                aktif: t.monthKey === monthKey,
              }))}
            />
          </Panel>

          <Panel
            judul="Komposisi Pendapatan"
            sub={`Total ${formatRupiah(kini.omzet)}${kini.potonganHarga > 0 ? ` · potongan harga ${formatRupiah(kini.potonganHarga)}` : ''}`}
          >
            {komposisi.length === 0 ? (
              <p className="mgr-empty">Belum ada pemasukan di periode ini.</p>
            ) : (
              <div className="mgr-bars">
                {komposisi.map((k) => (
                  <div key={k.label} className="mgr-bar-row">
                    <span className="mgr-bar-label">{k.label}</span>
                    <span className="mgr-bar-track">
                      <span
                        className="mgr-bar-fill"
                        style={{
                          width: `${(k.nilai / komposisi[0].nilai) * 100}%`,
                          background: k.warna,
                        }}
                      />
                    </span>
                    <span className="mgr-bar-val">
                      {formatRupiah(k.nilai)}
                      <em>{persen(k.nilai / (kini.omzet || 1))}</em>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mgr-mini-stats">
              <MiniStat k="Tiket" v={`${kini.qtyTiket}`} />
              <MiniStat k="Cetak" v={`${kini.qtyCetak}`} />
              <MiniStat k="Upgrade" v={`${kini.qtyUpgrade}`} />
              <MiniStat k="Produk" v={`${kini.qtyProduk}`} />
            </div>
          </Panel>

          <Panel
            judul="Kinerja Karyawan"
            sub="Kehadiran, disiplin jam, dan kontribusi penjualan bulan ini"
          >
            {kinerja.length === 0 ? (
              <p className="mgr-empty">Belum ada karyawan aktif.</p>
            ) : (
              <div className="mgr-tabel-wrap">
                <table className="mgr-tabel">
                  <thead>
                    <tr>
                      <th>Karyawan</th>
                      <th className="num">Hadir</th>
                      <th className="num">Telat</th>
                      <th className="num">Lembur</th>
                      <th className="num">Item</th>
                      <th className="num">Penjualan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kinerja.map((k, i) => (
                      <tr key={k.id}>
                        <td>
                          <div className="mgr-orang">
                            <span className="mgr-rank">{i + 1}</span>
                            <Avatar
                              name={k.nama}
                              colorIndex={colorIndexForName(k.id)}
                              foto={k.foto}
                            />
                            <span className="mgr-orang-teks">
                              <span className="nm">{k.nama}</span>
                              <span className="jb">{k.jabatan || 'Karyawan'}</span>
                            </span>
                          </div>
                        </td>
                        <td className="num">
                          <div className="mgr-hadir">
                            <span className="mgr-hadir-val">
                              {k.hariHadir}/{k.hariSeharusnya}
                            </span>
                            <span className="mgr-meter">
                              <span
                                className={
                                  'mgr-meter-fill' +
                                  (k.kehadiran < 0.6 ? ' is-rendah' : '')
                                }
                                style={{ width: `${k.kehadiran * 100}%` }}
                              />
                            </span>
                          </div>
                        </td>
                        <td className={'num' + (k.terlambatMenit > 0 ? ' is-minus' : '')}>
                          {k.terlambatMenit > 0 ? formatDurasi(k.terlambatMenit) : '—'}
                        </td>
                        <td className="num">
                          {k.lemburMenit > 0 ? formatDurasi(k.lemburMenit) : '—'}
                        </td>
                        <td className="num">{k.jumlahItem}</td>
                        <td className="num is-kuat">{formatRupiah(k.penjualan)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            judul="Jobdesk &amp; Checklist"
            sub="Kepatuhan checklist pagi (opening) &amp; closing per karyawan"
          >
            {checklist.belumDiatur ? (
              <p className="mgr-empty">
                Checklist pagi &amp; closing belum diatur. Atur daftar tugasnya di
                Pengaturan agar kepatuhan bisa dipantau di sini.
              </p>
            ) : checklist.totalWajib === 0 ? (
              <p className="mgr-empty">
                Belum ada hari kerja tercatat di periode ini.
              </p>
            ) : (
              <>
                <div className="mgr-kepatuhan-head">
                  <div>
                    <span className="mgr-kepatuhan-lbl">Kepatuhan rata-rata</span>
                    <span
                      className={
                        'mgr-kepatuhan-val' +
                        (checklist.rata < 0.8 ? ' is-rendah' : '')
                      }
                    >
                      {persen(checklist.rata)}
                    </span>
                  </div>
                  <span className="mgr-kepatuhan-sub">
                    {checklist.totalSelesai} dari {checklist.totalWajib} tugas
                    dicentang
                  </span>
                </div>

                <div className="mgr-bars">
                  {checklist.perOrang
                    .filter((o) => o.pagiWajib + o.pulangWajib > 0)
                    .map((o) => (
                      <div key={o.id} className="mgr-bar-row">
                        <span className="mgr-bar-label">{o.nama}</span>
                        <span className="mgr-bar-track">
                          <span
                            className="mgr-bar-fill"
                            style={{
                              width: `${o.kepatuhan * 100}%`,
                              background:
                                o.kepatuhan >= 0.9
                                  ? 'var(--mint)'
                                  : o.kepatuhan >= 0.7
                                    ? 'var(--yellow)'
                                    : 'var(--pink)',
                            }}
                          />
                        </span>
                        <span className="mgr-bar-val">
                          {persen(o.kepatuhan)}
                          <em>
                            pagi {o.pagiSelesai}/{o.pagiWajib} · closing{' '}
                            {o.pulangSelesai}/{o.pulangWajib}
                          </em>
                        </span>
                      </div>
                    ))}
                </div>

                {checklist.taskTerlewat.length > 0 && (
                  <div className="mgr-terlewat">
                    <div className="mgr-terlewat-head">Paling sering terlewat</div>
                    <ul>
                      {checklist.taskTerlewat.slice(0, 5).map((t) => (
                        <li key={`${t.jenis}-${t.id}`}>
                          <span className={`mgr-tag mgr-tag--${t.jenis}`}>
                            {t.jenis === 'pagi' ? 'Pagi' : 'Closing'}
                          </span>
                          <span className="mgr-terlewat-lbl">{t.label}</span>
                          <span className="mgr-terlewat-num">
                            {t.terlewat}× dari {t.wajib}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Panel>

          <Panel
            judul="Sosial Media"
            sub={
              sosmed.belumDicatat
                ? 'Belum ada catatan — centang aktivitas hari ini untuk mulai menilai KPI sosmed.'
                : `${sosmed.hariAktif} dari ${sosmed.hariBerjalan} hari aktif · rentetan berjalan ${sosmed.runSekarang} hari (terpanjang ${sosmed.runTerpanjang})`
            }
            badge={
              sosmed.belumDicatat ? undefined : persen(sosmed.konsistensi)
            }
          >
            <div className="mgr-heat">
              {sosmed.perHari.map((h) => (
                <button
                  key={h.tanggal}
                  type="button"
                  className={
                    `mgr-heat-sel lv-${h.jumlahAksi}` +
                    (h.berjalan ? '' : ' is-nanti') +
                    (h.tanggal === tglSosmed ? ' is-pilih' : '') +
                    (h.berjalan && !h.aktif ? ' is-bolong' : '')
                  }
                  onClick={() => setTglPilih(h.tanggal)}
                  title={`${h.tanggal} — ${h.jumlahAksi} dari 4 aktivitas`}
                >
                  {Number(h.tanggal.slice(8))}
                </button>
              ))}
            </div>

            <div className="mgr-sos-form">
              <div className="mgr-sos-tgl">
                <label>
                  <span>Catat tanggal</span>
                  <input
                    type="date"
                    value={tglSosmed}
                    onChange={(e) => e.target.value && setTglPilih(e.target.value)}
                  />
                </label>
                <label>
                  <span>Dikerjakan oleh</span>
                  <select
                    value={logHariIni?.oleh ?? ''}
                    onChange={(e) =>
                      ubahSosmed(tglSosmed, { oleh: e.target.value || undefined })
                    }
                  >
                    <option value="">— belum ditentukan —</option>
                    {data.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nama}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mgr-sos-aksi">
                {AKSI_SOSMED.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`mgr-sos-chip${logHariIni?.[a] ? ' is-on' : ''}`}
                    onClick={() =>
                      ubahSosmed(tglSosmed, { [a]: !logHariIni?.[a] } as Partial<SosmedHarian>)
                    }
                  >
                    {logHariIni?.[a] ? '✓' : '○'} {AKSI_SOSMED_LABEL[a as AksiSosmed]}
                  </button>
                ))}
              </div>
              <input
                className="mgr-sos-tautan"
                type="url"
                placeholder="Tautan unggahan (opsional)"
                value={logHariIni?.tautan ?? ''}
                onChange={(e) =>
                  ubahSosmed(tglSosmed, { tautan: e.target.value || undefined })
                }
              />
            </div>

            {sosmed.bolong.length > 0 && (
              <p className="mgr-hint">
                {sosmed.bolong.length} hari masih kosong bulan ini — kotak
                bergaris pada kalender di atas.
              </p>
            )}
          </Panel>

          <Panel
            judul="Dampak Sosmed ke Penjualan"
            sub="Omzet harian, dibandingkan antara hari sosmed aktif dan hari pasif"
            badge={
              dampak.cukupSampel && dampak.selisih != null
                ? `${dampak.selisih >= 0 ? '+' : ''}${persen(dampak.selisih)}`
                : undefined
            }
          >
            <DampakChart rows={dampak.perHari} />
            <div className="mgr-mini-stats">
              <MiniStat
                k={`Hari aktif (${dampak.hariAktif})`}
                v={formatRupiah(dampak.rataAktif)}
              />
              <MiniStat
                k={`Hari pasif (${dampak.hariPasif})`}
                v={formatRupiah(dampak.rataPasif)}
              />
            </div>
            <p className="mgr-hint">
              {!dampak.cukupSampel ? (
                <>
                  Belum cukup data untuk dibandingkan — butuh minimal{' '}
                  {MIN_SAMPEL_DAMPAK} hari berlaporan di kedua sisi. Hari tanpa
                  laporan pemasukan tidak ikut dihitung, karena omzetnya tidak
                  diketahui (bukan nol).
                </>
              ) : (
                <>
                  Ini <b>korelasi, bukan sebab-akibat</b>: akhir pekan cenderung
                  ramai sekaligus cenderung jadi hari orang rajin posting. Pakai
                  sebagai petunjuk arah, bukan bukti.
                </>
              )}
            </p>
          </Panel>

          <Panel
            judul="Kontribusi Konten"
            sub="Siapa mengerjakan apa bulan ini — dasar bonus marketing"
            badge={
              eksekusi.jatuhTempo > 0
                ? `${persen(eksekusi.ketepatan)} tepat waktu`
                : undefined
            }
          >
            {kontribusi.length === 0 ? (
              <p className="mgr-empty">
                Belum ada kartu ber-PIC maupun hari sosmed yang ditandai
                pengerjanya. Tetapkan PIC di Papan Promosi.
              </p>
            ) : (
              <div className="mgr-tabel-wrap">
                <table className="mgr-tabel">
                  <thead>
                    <tr>
                      <th>Operator</th>
                      <th className="num">Selesai</th>
                      <th className="num">Telat</th>
                      <th className="num">Berjalan</th>
                      <th className="num">Hari sosmed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kontribusi.map((k) => (
                      <tr key={k.id}>
                        <td>
                          <span className="mgr-orang">
                            <Avatar
                              name={k.nama}
                              foto={k.foto}
                              colorIndex={colorIndexForName(k.nama)}
                              size="sm"
                            />
                            <span className="mgr-orang-teks">
                              <span className="nm">{k.nama}</span>
                              <span className="jb">{k.jabatan || 'Operator'}</span>
                            </span>
                          </span>
                        </td>
                        <td className="num is-kuat">{k.selesai}</td>
                        <td className={`num${k.telat > 0 ? ' is-minus' : ''}`}>
                          {k.telat}
                        </td>
                        <td className="num">{k.berjalan}</td>
                        <td className="num">{k.hariSosmed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {eksekusi.menunggak.length > 0 && (
              <div className="mgr-menunggak">
                <b>Lewat deadline & belum selesai</b>
                <ul>
                  {eksekusi.menunggak.map((m) => (
                    <li key={m.id}>
                      <span>{m.judul}</span>
                      <em>
                        telat {m.telatHari} hari
                        {m.pic &&
                          ` · ${data.employees.find((e) => e.id === m.pic)?.nama ?? 'PIC'}`}
                      </em>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel
            judul="Pipeline Leads & Sales"
            sub={
              pipeline.belumAda
                ? 'Belum ada lead — tambahkan calon klien di layar Leads & Sales.'
                : `${pipeline.baruBulanIni} lead baru · ${pipeline.closingBulanIni} closing senilai ${formatRupiah(pipeline.nilaiClosing)}`
            }
            badge={
              pipeline.closingBulanIni + pipeline.gagalBulanIni > 0
                ? `Konversi ${persen(pipeline.konversi)}`
                : undefined
            }
            aksi={
              <button type="button" className="mgr-aksi-btn" onClick={onLihatLeads}>
                Buka pipeline
              </button>
            }
          >
            {pipeline.belumAda ? (
              <p className="mgr-empty">
                Pipeline masih kosong. KPI “leads baru per bulan” aktif begitu
                lead pertama dicatat.
              </p>
            ) : (
              <>
                <div className="mgr-bars">
                  {LEAD_TAHAP_ORDER.map((t) => {
                    const slot = pipeline.perTahap[t]
                    const maks = Math.max(
                      1,
                      ...LEAD_TAHAP_ORDER.map((x) => pipeline.perTahap[x].jumlah),
                    )
                    return (
                      <div key={t} className="mgr-bar-row">
                        <span className="mgr-bar-label">{LEAD_TAHAP_LABEL[t]}</span>
                        <span className="mgr-bar-track">
                          <span
                            className="mgr-bar-fill"
                            style={{
                              width: `${(slot.jumlah / maks) * 100}%`,
                              background:
                                t === 'closing'
                                  ? 'var(--mint)'
                                  : t === 'gagal'
                                    ? 'var(--pink)'
                                    : 'var(--primary-2)',
                            }}
                          />
                        </span>
                        <span className="mgr-bar-val">
                          {slot.jumlah}
                          {slot.nilai > 0 && <em>{formatRupiah(slot.nilai)}</em>}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="mgr-mini-stats">
                  <MiniStat k="Pipeline" v={formatRupiah(pipeline.nilaiPipeline)} />
                  <MiniStat k="Closing" v={formatRupiah(pipeline.nilaiClosing)} />
                  <MiniStat k="Perlu follow-up" v={`${pipeline.perluFollowup.length}`} />
                </div>

                {pipeline.perluFollowup.length > 0 && (
                  <div className="mgr-menunggak">
                    <b>Didiamkan terlalu lama</b>
                    <ul>
                      {pipeline.perluFollowup.slice(0, 5).map((b) => (
                        <li key={b.lead.id}>
                          <span>
                            {b.lead.nama || '(tanpa nama)'} ·{' '}
                            {LEAD_KATEGORI_LABEL[b.lead.kategori]}
                          </span>
                          <em>
                            {b.terakhir
                              ? `diam ${b.diamHari} hari`
                              : 'belum pernah dihubungi'}
                          </em>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {sales.length > 0 && (
                  <div className="mgr-tabel-wrap" style={{ marginTop: 16 }}>
                    <table className="mgr-tabel">
                      <thead>
                        <tr>
                          <th>PIC</th>
                          <th className="num">Leads</th>
                          <th className="num">Closing</th>
                          <th className="num">Gagal</th>
                          <th className="num">Nilai closing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map((k) => (
                          <tr key={k.id}>
                            <td>
                              <span className="mgr-orang">
                                <Avatar
                                  name={k.nama}
                                  foto={k.foto}
                                  colorIndex={colorIndexForName(k.nama)}
                                  size="sm"
                                />
                                <span className="mgr-orang-teks">
                                  <span className="nm">{k.nama}</span>
                                  <span className="jb">{k.jabatan || '—'}</span>
                                </span>
                              </span>
                            </td>
                            <td className="num">{k.leadsBaru}</td>
                            <td className="num is-kuat">{k.closing}</td>
                            <td className={`num${k.gagal > 0 ? ' is-minus' : ''}`}>
                              {k.gagal}
                            </td>
                            <td className="num is-kuat">{formatRupiah(k.nilaiClosing)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>

        {/* ================= Kolom samping ================= */}
        <div className="mgr-col mgr-col--side">
          <Panel judul="Butuh Tindakan" sub="Antrean yang menunggu keputusanmu">
            {tindakan.length === 0 ? (
              <p className="mgr-empty">
                ✅ Tidak ada antrean. Semua sudah tertangani.
              </p>
            ) : (
              <ul className="mgr-todo">
                {tindakan.map((t) => (
                  <li key={t.label}>
                    <span className={`mgr-todo-num mgr-todo-num--${t.nada}`}>
                      {t.jumlah}
                    </span>
                    <span className="mgr-todo-teks">
                      <span className="lbl">{t.label}</span>
                      <button type="button" className="mgr-todo-aksi" onClick={t.onClick}>
                        {t.aksi} <Icons.chevron />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            judul="Kesehatan Operasional"
            sub={`${ops.salahCetakBulan} lembar salah cetak bulan ini`}
          >
            <div className="mgr-mini-stats">
              <MiniStat k="Kertas" v={`${ops.totalKertas}`} />
              <MiniStat k="Frame" v={`${ops.totalFrame}`} />
              <MiniStat k="Tinta" v={`${ops.totalTinta}`} />
              <MiniStat k="Amplop" v={`${ops.amplop}`} />
            </div>
            {ops.stokKritis.length === 0 ? (
              <p className="mgr-empty">Semua stok di atas ambang aman.</p>
            ) : (
              <ul className="mgr-stok">
                {ops.stokKritis.map((s) => (
                  <li key={s.nama} className={s.stok === 0 ? 'is-habis' : ''}>
                    <span className="nm">{s.nama}</span>
                    <span className="vl">
                      {s.stok} {s.satuan}
                      <em>ambang {s.ambang}</em>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {isOwner && kas && (
            <Panel
              judul="Kas &amp; Rekonsiliasi"
              sub="Kumulatif s/d akhir periode terpilih · owner"
              badge="Owner"
            >
              <SaldoRow
                label="Dompet (tunai)"
                seharusnya={kas.dompetDiharapkan}
                aktual={saldoAktual.dompet}
              />
              <SaldoRow
                label="Rekening (QRIS)"
                seharusnya={kas.rekeningDiharapkan}
                aktual={saldoAktual.rekening}
              />
              <div className="mgr-kas-rincian">
                <Rincian k="Tunai diterima" v={formatRupiah(kas.tunai)} />
                <Rincian k="QRIS diterima" v={formatRupiah(kas.qris)} />
                <Rincian k="Setoran ke rekening" v={formatRupiah(kas.setoran)} />
                <Rincian
                  k="Pengeluaran tunai"
                  v={`− ${formatRupiah(kas.pengeluaranCash)}`}
                />
                <Rincian
                  k="Pengeluaran rekening"
                  v={`− ${formatRupiah(kas.pengeluaranRek)}`}
                />
                <Rincian
                  k="Gaji sudah dibayar"
                  v={`− ${formatRupiah(kas.gajiCash + kas.gajiRek)}`}
                />
                <Rincian
                  k="Saldo uang besar"
                  v={formatRupiah(kas.uangBesarSaldo)}
                />
              </div>
              <p className="mgr-hint">
                Saldo aktual diisi di layar Pemasukan → Rangkuman akhir bulan.
                Selisih ≠ 0 berarti ada uang yang belum tercatat.
              </p>
            </Panel>
          )}

          {!isOwner && (
            <div className="mgr-locked">
              <span className="mgr-locked-ikon">
                <Icons.lock />
              </span>
              <div>
                <div className="mgr-locked-judul">Gaji &amp; kas disembunyikan</div>
                <p>
                  Nominal gaji per karyawan dan rekonsiliasi kas hanya bisa dibuka
                  oleh owner.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// =============================================================
// Komponen kecil
// =============================================================

function Panel({
  judul,
  sub,
  badge,
  aksi,
  children,
}: {
  judul: ReactNode
  sub?: ReactNode
  badge?: string
  /** Tombol opsional di kanan judul (mis. "Atur target" untuk owner). */
  aksi?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mgr-panel">
      <div className="mgr-panel-head">
        <div>
          <h3>{judul}</h3>
          {sub && <p>{sub}</p>}
        </div>
        <div className="mgr-panel-kanan">
          {badge && <span className="mgr-panel-badge">{badge}</span>}
          {aksi}
        </div>
      </div>
      <div className="mgr-panel-body">{children}</div>
    </section>
  )
}

const STATUS_LABEL: Record<BarisKPI['status'], string> = {
  tercapai: 'Tercapai',
  ontrack: 'On track',
  tertinggal: 'Tertinggal',
  'belum-aktif': 'Belum aktif',
}

/**
 * Satu baris scorecard: area, KPI, bar capaian, dan status.
 *
 * Bar menampilkan DUA hal sekaligus — capaian (isian berwarna) dan penanda
 * `laju` (garis tipis di posisi "seharusnya sudah sampai sini kalau on track").
 * Tanpa penanda itu, bar 30% di tanggal 9 tidak bisa dibedakan bagus/buruk.
 */
function KpiRow({ baris, laju }: { baris: BarisKPI; laju: number }) {
  const mati = baris.status === 'belum-aktif'
  return (
    <div className={`mgr-kpi-row is-${baris.status}`}>
      <div className="mgr-kpi-teks">
        <span className="mgr-kpi-area">{baris.area}</span>
        <span className="mgr-kpi-label">{baris.label}</span>
        <span className="mgr-kpi-sumber">
          {mati ? `Butuh: ${baris.butuh}` : baris.sumber}
        </span>
      </div>
      <div className="mgr-kpi-bar">
        <span className="mgr-kpi-track">
          <span
            className="mgr-kpi-fill"
            style={{ width: `${Math.min(100, baris.progress * 100)}%` }}
          />
          {!mati && baris.prorata && laju > 0 && laju < 1 && (
            <span
              className="mgr-kpi-laju"
              style={{ left: `${laju * 100}%` }}
              title="Posisi seharusnya kalau on track"
            />
          )}
        </span>
        <span className="mgr-kpi-capaian">{baris.teks}</span>
      </div>
      <span className="mgr-kpi-status">{STATUS_LABEL[baris.status]}</span>
    </div>
  )
}

const FIELD_TARGET: {
  key: keyof TargetBulanan
  label: string
  sufiks?: string
  /** Disimpan 0–1 tapi diisi dalam persen supaya enak diketik. */
  persen?: boolean
}[] = [
  { key: 'omzet', label: 'Omzet', sufiks: 'Rp' },
  { key: 'tiket', label: 'Tiket terjual' },
  { key: 'event', label: 'Event terlaksana' },
  { key: 'campaign', label: 'Campaign dieksekusi' },
  { key: 'ide', label: 'Ide baru' },
  { key: 'leads', label: 'Leads baru' },
  { key: 'sosmedHari', label: 'Hari sosmed aktif' },
  { key: 'kepatuhan', label: 'Kepatuhan checklist', sufiks: '%', persen: true },
  { key: 'shiftCover', label: 'Shift ter-cover', sufiks: '%', persen: true },
]

/**
 * Form target satu periode. Owner-only (dipasang di Panel lewat prop `aksi`).
 * Tombol "Isi otomatis" mengembalikan saran 2× baseline — jadi angka 2× itu
 * ditawarkan, bukan dipaksakan.
 */
function TargetEditor({
  awal,
  saran,
  onSimpan,
  onBatal,
}: {
  awal: TargetBulanan
  saran: TargetBulanan
  onSimpan: (t: TargetBulanan) => void
  onBatal: () => void
}) {
  const [draf, setDraf] = useState<TargetBulanan>(awal)

  function ubah(key: keyof TargetBulanan, teks: string, persen?: boolean) {
    const angka = Number(teks.replace(/[^\d.-]/g, '')) || 0
    setDraf((d) => ({ ...d, [key]: persen ? angka / 100 : angka }))
  }

  return (
    <div className="mgr-target-editor">
      <div className="mgr-target-grid">
        {FIELD_TARGET.map((f) => (
          <label key={f.key} className="mgr-target-field">
            <span>
              {f.label}
              {f.sufiks && <em>{f.sufiks}</em>}
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={f.persen ? Math.round(draf[f.key] * 100) : draf[f.key]}
              onChange={(e) => ubah(f.key, e.target.value, f.persen)}
            />
          </label>
        ))}
      </div>
      <div className="mgr-target-aksi">
        <button
          type="button"
          className="mgr-aksi-btn"
          onClick={() => setDraf(saran)}
        >
          Isi otomatis (2× rata-rata 3 bulan)
        </button>
        <span className="spacer" />
        <button type="button" className="mgr-aksi-btn" onClick={onBatal}>
          Batal
        </button>
        <button
          type="button"
          className="mgr-aksi-btn is-utama"
          onClick={() => onSimpan(draf)}
        >
          Simpan target
        </button>
      </div>
    </div>
  )
}

function StatCard({
  nada,
  label,
  nilai,
  sub,
  delta: d,
  deltaBaik = 'naik',
  icon,
}: {
  nada: 'primary' | 'mint' | 'pink' | 'yellow'
  label: string
  nilai: string
  sub: string
  /** Perubahan vs bulan lalu (−1..∞). `null` = tidak bisa dibandingkan. */
  delta: number | null
  /** Arah yang dianggap "bagus" — biaya justru bagus kalau turun. */
  deltaBaik?: 'naik' | 'turun'
  icon: ReactNode
}) {
  const naik = d != null && d > 0
  const netral = d == null || Math.abs(d) < 0.005
  const bagus = deltaBaik === 'naik' ? naik : !naik
  return (
    <div className={`mgr-stat mgr-stat--${nada}`}>
      <div className="mgr-stat-head">
        <span className="mgr-stat-ikon">{icon}</span>
        <span className="mgr-stat-label">{label}</span>
        {d != null && (
          <span
            className={
              'mgr-delta' +
              (netral ? ' is-netral' : bagus ? ' is-bagus' : ' is-buruk')
            }
            title="Dibandingkan bulan lalu"
          >
            {netral ? '±' : naik ? '▲' : '▼'} {persen(Math.abs(d))}
          </span>
        )}
      </div>
      <div className="mgr-stat-val">{nilai}</div>
      <div className="mgr-stat-sub">{sub}</div>
    </div>
  )
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="mgr-mini">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  )
}

function Rincian({ k, v }: { k: string; v: string }) {
  return (
    <div className="mgr-rincian">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  )
}

function SaldoRow({
  label,
  seharusnya,
  aktual,
}: {
  label: string
  seharusnya: number
  aktual: number
}) {
  const selisih = aktual - seharusnya
  const belumDiisi = aktual === 0
  return (
    <div className="mgr-saldo">
      <div className="mgr-saldo-lbl">{label}</div>
      <div className="mgr-saldo-grid">
        <span>
          <em>Seharusnya</em>
          {formatRupiah(seharusnya)}
        </span>
        <span>
          <em>Aktual</em>
          {belumDiisi ? '—' : formatRupiah(aktual)}
        </span>
        <span
          className={
            belumDiisi
              ? ''
              : selisih === 0
                ? 'is-pas'
                : selisih > 0
                  ? 'is-lebih'
                  : 'is-kurang'
          }
        >
          <em>Selisih</em>
          {belumDiisi
            ? 'belum diisi'
            : `${selisih > 0 ? '+' : ''}${formatRupiah(selisih)}`}
        </span>
      </div>
    </div>
  )
}

/**
 * Omzet harian sebulan, dengan penanda hari sosmed aktif.
 *
 * Batang = omzet hari itu; pita di bawahnya = seberapa banyak aktivitas sosmed
 * hari itu (makin pekat, makin banyak). Menaruh keduanya pada sumbu waktu yang
 * sama membuat polanya terbaca mata tanpa perlu percaya pada satu angka
 * persentase.
 *
 * Hari tanpa laporan pemasukan digambar sebagai batang kosong bergaris, bukan
 * batang nol — omzetnya tidak diketahui, dan menyamakannya dengan nol akan
 * membuat grafik berbohong.
 */
function DampakChart({ rows }: { rows: HariDampak[] }) {
  const W = 640
  const H = 200
  const padL = 52
  const padR = 10
  const padT = 12
  const padB = 44
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const pitaH = 10

  const maks = Math.max(1, ...rows.map((r) => r.omzet))
  const skalaMax = Math.ceil(maks / 4) * 4 || 1
  const y = (v: number) => padT + plotH - (v / skalaMax) * plotH
  const slotW = plotW / rows.length
  const barW = Math.max(2, Math.min(14, slotW - 3))

  if (rows.every((r) => !r.berlaporan)) {
    return <p className="mgr-empty">Belum ada laporan pemasukan di periode ini.</p>
  }

  return (
    <div className="mgr-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" preserveAspectRatio="none">
        <title>
          Omzet harian dibandingkan aktivitas sosial media pada bulan terpilih
        </title>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              className="mgr-chart-grid"
              x1={padL}
              x2={W - padR}
              y1={y(skalaMax * f)}
              y2={y(skalaMax * f)}
            />
            <text
              className="mgr-chart-axis"
              x={padL - 8}
              y={y(skalaMax * f) + 4}
              textAnchor="end"
            >
              {f === 0 ? '0' : rupiahRingkas(skalaMax * f)}
            </text>
          </g>
        ))}

        {rows.map((r, i) => {
          const cx = padL + slotW * i + slotW / 2
          const tinggi = Math.max(0, padT + plotH - y(r.omzet))
          return (
            <g key={r.tanggal}>
              {r.berlaporan ? (
                <rect
                  className={r.aktif ? 'mgr-dampak-bar is-aktif' : 'mgr-dampak-bar'}
                  x={cx - barW / 2}
                  y={y(r.omzet)}
                  width={barW}
                  height={Math.max(1, tinggi)}
                  rx={2}
                >
                  <title>{`${r.tanggal} · ${formatRupiah(r.omzet)} · ${r.aksi} aktivitas sosmed`}</title>
                </rect>
              ) : (
                <rect
                  className="mgr-dampak-bar is-kosong"
                  x={cx - barW / 2}
                  y={padT + plotH - 4}
                  width={barW}
                  height={4}
                  rx={2}
                >
                  <title>{`${r.tanggal} · belum ada laporan pemasukan`}</title>
                </rect>
              )}
              {/* Pita aktivitas sosmed, sejajar di bawah sumbu. */}
              <rect
                className={`mgr-dampak-pita lv-${r.aksi}`}
                x={cx - barW / 2}
                y={padT + plotH + 8}
                width={barW}
                height={pitaH}
                rx={2}
              >
                <title>{`${r.tanggal} · ${r.aksi} dari 4 aktivitas sosmed`}</title>
              </rect>
              {/* Label tanggal tiap 5 hari supaya tidak berdesakan. */}
              {(r.hari === 1 || r.hari % 5 === 0) && (
                <text
                  className="mgr-chart-label"
                  x={cx}
                  y={H - 6}
                  textAnchor="middle"
                >
                  {r.hari}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="mgr-legend">
        <span>
          <i className="mgr-legend-dampak-aktif" /> Omzet · hari sosmed aktif
        </span>
        <span>
          <i className="mgr-legend-dampak-pasif" /> Omzet · hari pasif
        </span>
        <span>
          <i className="mgr-legend-dampak-kosong" /> Tanpa laporan
        </span>
      </div>
    </div>
  )
}

/**
 * Grafik batang omzet vs biaya + garis laba. Inline SVG (tanpa library) supaya
 * ikut tema: semua warna memakai CSS variable yang sama dengan kartu lain.
 */
function TrenChart({
  rows,
}: {
  rows: {
    label: string
    omzet: number
    biaya: number
    laba: number
    aktif: boolean
  }[]
}) {
  const W = 640
  const H = 220
  const padL = 56
  const padR = 12
  const padT = 12
  const padB = 34
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const maxNilai = Math.max(
    1,
    ...rows.map((r) => Math.max(r.omzet, r.biaya, r.laba)),
  )
  // Bulatkan ke atas supaya garis bantu jatuh di angka rapi.
  const skalaMax = Math.ceil(maxNilai / 4) * 4
  const y = (v: number) => padT + plotH - (v / skalaMax) * plotH
  const slotW = plotW / rows.length
  const barW = Math.min(22, slotW / 3.2)

  const titik = rows.map((r, i) => ({
    x: padL + slotW * i + slotW / 2,
    y: y(Math.max(0, r.laba)),
  }))

  if (rows.every((r) => r.omzet === 0 && r.biaya === 0)) {
    return <p className="mgr-empty">Belum ada data untuk 6 bulan terakhir.</p>
  }

  return (
    <div className="mgr-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" preserveAspectRatio="none">
        <title>Omzet, biaya, dan laba bersih enam bulan terakhir</title>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              className="mgr-chart-grid"
              x1={padL}
              x2={W - padR}
              y1={y(skalaMax * f)}
              y2={y(skalaMax * f)}
            />
            <text
              className="mgr-chart-axis"
              x={padL - 8}
              y={y(skalaMax * f) + 4}
              textAnchor="end"
            >
              {f === 0 ? '0' : rupiahRingkas(skalaMax * f)}
            </text>
          </g>
        ))}

        {rows.map((r, i) => {
          const cx = padL + slotW * i + slotW / 2
          return (
            <g key={r.label + i} className={r.aktif ? 'is-aktif' : undefined}>
              {r.aktif && (
                <rect
                  className="mgr-chart-sorot"
                  x={cx - slotW / 2 + 2}
                  y={padT}
                  width={slotW - 4}
                  height={plotH}
                  rx={8}
                />
              )}
              <rect
                className="mgr-chart-omzet"
                x={cx - barW - 2}
                y={y(r.omzet)}
                width={barW}
                height={Math.max(0, padT + plotH - y(r.omzet))}
                rx={4}
              >
                <title>{`${r.label} · omzet ${formatRupiah(r.omzet)}`}</title>
              </rect>
              <rect
                className="mgr-chart-biaya"
                x={cx + 2}
                y={y(r.biaya)}
                width={barW}
                height={Math.max(0, padT + plotH - y(r.biaya))}
                rx={4}
              >
                <title>{`${r.label} · biaya ${formatRupiah(r.biaya)}`}</title>
              </rect>
              <text
                className={'mgr-chart-label' + (r.aktif ? ' is-aktif' : '')}
                x={cx}
                y={H - 12}
                textAnchor="middle"
              >
                {r.label}
              </text>
            </g>
          )
        })}

        <polyline
          className="mgr-chart-laba"
          points={titik.map((t) => `${t.x},${t.y}`).join(' ')}
          fill="none"
        />
        {titik.map((t, i) => (
          <circle key={i} className="mgr-chart-dot" cx={t.x} cy={t.y} r={3.5}>
            <title>{`${rows[i].label} · laba ${formatRupiah(rows[i].laba)}`}</title>
          </circle>
        ))}
      </svg>

      <div className="mgr-legend">
        <span>
          <i className="mgr-legend-omzet" /> Omzet
        </span>
        <span>
          <i className="mgr-legend-biaya" /> Biaya
        </span>
        <span>
          <i className="mgr-legend-laba" /> Laba bersih
        </span>
      </div>
    </div>
  )
}
