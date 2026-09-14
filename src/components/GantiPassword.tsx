import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Icons } from './Icons'
import { useToast } from './Toast'

/** Batas minimal password, disamakan dengan edge function `create-karyawan`. */
const MIN_PANJANG = 6

/**
 * Kartu "Akun & Password" di halaman Pengaturan: setiap orang (owner, manajer,
 * karyawan) bisa mengganti password akunnya sendiri tanpa perlu minta tolong
 * owner atau membuka dashboard Supabase.
 */
export function GantiPassword() {
  const { user } = useAuth()
  const toast = useToast()

  const [lama, setLama] = useState('')
  const [baru, setBaru] = useState('')
  const [ulangi, setUlangi] = useState('')
  const [lihat, setLihat] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const email = user?.email ?? ''

  async function simpan() {
    setError(null)
    if (!email) {
      setError('Sesi tidak terbaca. Coba keluar lalu masuk lagi.')
      return
    }
    if (!lama) {
      setError('Isi dulu password lama.')
      return
    }
    if (baru.length < MIN_PANJANG) {
      setError(`Password baru minimal ${MIN_PANJANG} karakter.`)
      return
    }
    if (baru !== ulangi) {
      setError('Ulangi password belum sama dengan password baru.')
      return
    }
    if (baru === lama) {
      setError('Password baru harus berbeda dari password lama.')
      return
    }

    setLoading(true)
    try {
      // Verifikasi password lama dulu. `updateUser` sebenarnya tidak memintanya,
      // jadi pengecekan ini yang mencegah orang lain mengganti password lewat
      // perangkat yang lupa di-logout. Login yang gagal tidak memutus sesi
      // yang sedang berjalan, jadi aman dipanggil di sini.
      const { error: errLama } = await supabase.auth.signInWithPassword({
        email,
        password: lama,
      })
      if (errLama) {
        setError('Password lama salah.')
        return
      }

      const { error: errUpdate } = await supabase.auth.updateUser({
        password: baru,
      })
      if (errUpdate) {
        setError(errUpdate.message)
        return
      }

      setLama('')
      setBaru('')
      setUlangi('')
      setLihat(false)
      toast('ok', 'Password berhasil diganti')
    } finally {
      setLoading(false)
    }
  }

  const tipe = lihat ? 'text' : 'password'

  return (
    <section className="settings-card">
      <div className="settings-head">
        <div className="settings-head-ikon">🔑</div>
        <div>
          <h2 className="settings-title">Akun &amp; Password</h2>
          <p className="settings-sub">
            {email
              ? `Anda masuk sebagai ${email}. Ganti password akun ini kapan saja.`
              : 'Ganti password akun Anda.'}
          </p>
        </div>
      </div>

      <div className="settings-section">
        <div className="field">
          <label>Password lama</label>
          <input
            type={tipe}
            value={lama}
            autoComplete="current-password"
            onChange={(e) => setLama(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <div className="field">
          <label>Password baru (min. {MIN_PANJANG} karakter)</label>
          <input
            type={tipe}
            value={baru}
            autoComplete="new-password"
            onChange={(e) => setBaru(e.target.value)}
            placeholder="••••••••"
            minLength={MIN_PANJANG}
          />
        </div>

        <div className="field">
          <label>Ulangi password baru</label>
          <input
            type={tipe}
            value={ulangi}
            autoComplete="new-password"
            onChange={(e) => setUlangi(e.target.value)}
            placeholder="••••••••"
            minLength={MIN_PANJANG}
          />
          <label className="show-password">
            <input
              type="checkbox"
              checked={lihat}
              onChange={(e) => setLihat(e.target.checked)}
            />
            Tampilkan password
          </label>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-hint" style={{ marginTop: 10 }}>
          🔒 Setelah diganti, pakai password baru untuk login berikutnya. Kalau
          lupa password lama, minta owner membuatkan yang baru.
        </div>

        <button
          type="button"
          className="btn btn--primary btn--lg"
          style={{ marginTop: 12 }}
          disabled={loading}
          onClick={() => void simpan()}
        >
          <Icons.check /> {loading ? 'Menyimpan…' : 'Ganti Password'}
        </button>
      </div>
    </section>
  )
}
