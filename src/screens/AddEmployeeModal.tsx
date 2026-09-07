import { useState } from 'react'
import { Modal, ModalHead } from '../components/Modal'
import { Icons } from '../components/Icons'
import { createKaryawanAccount } from '../lib/db'
import { ROLE_DESKRIPSI, ROLE_EMOJI, ROLE_LABEL } from '../lib/roles'

export const ROLES = ['Operator', 'Editor', 'Kasir', 'Manajer']

/** Hak akses yang bisa diberikan lewat modal ini — owner tidak pernah dibuat di sini. */
const HAK_AKSES = ['karyawan', 'manager'] as const

type Props = {
  /** Dipanggil setelah akun berhasil dibuat (untuk reload daftar karyawan). */
  onCreated: (nama: string) => void
  onClose: () => void
  /** Hanya owner yang boleh mengangkat manajer (dikuatkan di edge function). */
  isOwner: boolean
}

export function AddEmployeeModal({ onCreated, onClose, isOwner }: Props) {
  const [nama, setNama] = useState('')
  const [jabatan, setJabatan] = useState(ROLES[0])
  const [hakAkses, setHakAkses] =
    useState<(typeof HAK_AKSES)[number]>('karyawan')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setError('')
    if (nama.trim().length < 2) {
      setError('Nama minimal 2 huruf')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Email tidak valid')
      return
    }
    if (password.length < 6) {
      setError('Password minimal 6 karakter')
      return
    }
    setLoading(true)
    try {
      await createKaryawanAccount({
        email: email.trim().toLowerCase(),
        password,
        nama: nama.trim(),
        jabatan,
        role: isOwner ? hakAkses : 'karyawan',
      })
      onCreated(nama.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat akun')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <ModalHead
        icon={<Icons.user />}
        color="var(--pink)"
        title="Tambah Karyawan"
        sub="Buatkan akun login baru"
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="field">
          <label>Nama karyawan</label>
          <input
            type="text"
            autoFocus
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="cth. Rara Putri"
          />
        </div>

        <div className="field">
          <label>Jabatan</label>
          <div className="role-pick">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                className={'role-opt' + (jabatan === r ? ' sel' : '')}
                onClick={() => setJabatan(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {isOwner && (
          <div className="field">
            <label>Hak akses</label>
            <div className="role-pick">
              {HAK_AKSES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={'role-opt' + (hakAkses === r ? ' sel' : '')}
                  onClick={() => setHakAkses(r)}
                >
                  {ROLE_EMOJI[r]} {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
            <div className="form-hint" style={{ marginTop: 8 }}>
              {ROLE_DESKRIPSI[hakAkses]}
            </div>
          </div>
        )}

        <div className="field">
          <label>Email login</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@kubik.id"
          />
        </div>

        <div className="field">
          <label>Password awal (min. 6 karakter)</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
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
          <div className="form-hint" style={{ marginTop: 10 }}>
            🔒 Berikan email &amp; password ini ke karyawan. Mereka bisa
            menggantinya nanti.
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <button
          type="button"
          className="btn btn--pink btn--block btn--lg"
          disabled={loading}
          onClick={() => void submit()}
        >
          <Icons.plus /> {loading ? 'Membuat akun…' : 'Buat Akun Karyawan'}
        </button>
      </div>
    </Modal>
  )
}
