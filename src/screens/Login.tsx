import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Icons } from '../components/Icons'

type Mode = 'login' | 'register'

export function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nama, setNama] = useState('')
  const [jabatan, setJabatan] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error: err } = await signIn(email.trim(), password)
        if (err) setError(translateError(err))
      } else {
        if (nama.trim().length < 2) {
          setError('Nama minimal 2 huruf')
          return
        }
        if (password.length < 6) {
          setError('Password minimal 6 karakter')
          return
        }
        const { error: err } = await signUp(
          email.trim(),
          password,
          nama.trim(),
          jabatan.trim(),
        )
        if (err) {
          setError(translateError(err))
        } else {
          setMode('login')
          setError(
            'Akun dibuat! Silakan login. (Cek email kalau "Confirm email" aktif.)',
          )
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="bg-decor">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <span className="blob b4" />
      </div>
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">
            <img src="/kubik-logo.png" alt="Kubik" />
          </div>
          <div>
            <div className="auth-kicker">Kubik Photobox Studio</div>
            <div className="auth-judul">Sistem Operasional</div>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={'auth-tab' + (mode === 'login' ? ' is-active' : '')}
            onClick={() => {
              setMode('login')
              setError(null)
            }}
          >
            Masuk
          </button>
          <button
            type="button"
            className={'auth-tab' + (mode === 'register' ? ' is-active' : '')}
            onClick={() => {
              setMode('register')
              setError(null)
            }}
          >
            Daftar
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <div className="field">
                <label>Nama lengkap</label>
                <input
                  type="text"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="cth: Budi Santoso"
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Jabatan</label>
                <input
                  type="text"
                  value={jabatan}
                  onChange={(e) => setJabatan(e.target.value)}
                  placeholder="cth: Operator, Kasir, Admin"
                />
              </div>
            </>
          )}
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@kubik.id"
              required
              autoFocus={mode === 'login'}
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'min. 6 karakter' : '••••••••'}
              required
              minLength={6}
            />
            <label className="show-password">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              Tampilkan password
            </label>
          </div>

          {error && <div className="form-error">{error}</div>}

          <button
            type="submit"
            className="btn btn--primary btn--block btn--lg"
            disabled={loading}
          >
            <Icons.unlock />{' '}
            {loading
              ? 'Memproses…'
              : mode === 'login'
                ? 'Masuk ke Sistem'
                : 'Daftar Akun Baru'}
          </button>
        </form>

        <div className="auth-hint">
          {mode === 'login' ? (
            <>Belum punya akun? Klik tab <strong>Daftar</strong> di atas.</>
          ) : (
            <>
              🔒 User pertama yang daftar otomatis jadi <strong>admin</strong>.
              Pendaftaran berikutnya default <strong>karyawan</strong>.
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials'))
    return 'Email atau password salah'
  if (msg.includes('already registered')) return 'Email sudah terdaftar'
  if (msg.includes('Email not confirmed'))
    return 'Email belum dikonfirmasi. Cek inbox / kontak admin.'
  return msg
}
