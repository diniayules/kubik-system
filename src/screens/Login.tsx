import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Icons } from '../components/Icons'

export function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await signIn(email.trim(), password)
      if (err) setError(translateError(err))
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
            <img src={`${import.meta.env.BASE_URL}kubik-logo.png`} alt="Kubik" />
          </div>
          <div>
            <div className="auth-kicker">Kubik Photobox Studio</div>
            <div className="auth-judul">Sistem Operasional</div>
          </div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@kubik.id"
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
            <Icons.unlock /> {loading ? 'Memproses…' : 'Masuk ke Sistem'}
          </button>
        </form>

        <div className="auth-hint">
          🔒 Akses khusus admin &amp; karyawan. Belum punya akun? Hubungi admin
          untuk dibuatkan.
        </div>
      </div>
    </div>
  )
}

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials'))
    return 'Email atau password salah'
  if (msg.includes('Email not confirmed'))
    return 'Email belum dikonfirmasi. Kontak admin.'
  return msg
}
