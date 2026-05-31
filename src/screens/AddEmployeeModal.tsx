import { useState } from 'react'
import { Modal, ModalHead } from '../components/Modal'
import { Icons } from '../components/Icons'
import { hashPin } from '../storage'

const PIN_LENGTH = 4

export const ROLES = ['Operator', 'Editor', 'Kasir', 'Manajer']

type Props = {
  onAdd: (data: { nama: string; jabatan: string; pinHash: string }) => void
  onClose: () => void
}

export function AddEmployeeModal({ onAdd, onClose }: Props) {
  const [nama, setNama] = useState('')
  const [jabatan, setJabatan] = useState(ROLES[0])
  const [pin, setPin] = useState('')
  const [konfirmasi, setKonfirmasi] = useState('')
  const [error, setError] = useState('')

  const can = nama.trim().length >= 2

  async function submit() {
    if (!can) {
      setError('Nama minimal 2 huruf')
      return
    }
    if (!/^\d+$/.test(pin) || pin.length !== PIN_LENGTH) {
      setError(`PIN harus ${PIN_LENGTH} digit angka`)
      return
    }
    if (pin !== konfirmasi) {
      setError('Konfirmasi PIN tidak cocok')
      return
    }
    const hash = await hashPin(pin)
    onAdd({ nama: nama.trim(), jabatan, pinHash: hash })
  }

  return (
    <Modal onClose={onClose} wide>
      <ModalHead
        icon={<Icons.user />}
        color="var(--pink)"
        title="Tambah Karyawan"
        sub="Kartu absen baru"
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
          <label>Peran</label>
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

        <div className="field">
          <label>PIN pribadi karyawan ({PIN_LENGTH} digit)</label>
          <div className="pin-form-grid">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={PIN_LENGTH}
              className="pin-input"
              style={{
                width: '100%',
                padding: '13px 15px',
                borderRadius: 'var(--radius-sm)',
                border: '1.8px solid var(--line)',
                background: 'var(--surface-2)',
                color: 'var(--ink)',
              }}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))
              }
              placeholder="••••"
            />
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={PIN_LENGTH}
              className="pin-input"
              style={{
                width: '100%',
                padding: '13px 15px',
                borderRadius: 'var(--radius-sm)',
                border: '1.8px solid var(--line)',
                background: 'var(--surface-2)',
                color: 'var(--ink)',
              }}
              value={konfirmasi}
              onChange={(e) =>
                setKonfirmasi(
                  e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH),
                )
              }
              placeholder="ulangi"
            />
          </div>
          <div className="form-hint" style={{ marginTop: 10 }}>
            🔒 PIN dipegang masing-masing karyawan untuk mencegah titip absen.
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <button
          type="button"
          className="btn btn--pink btn--block btn--lg"
          disabled={!can}
          onClick={() => void submit()}
        >
          <Icons.plus /> Tambah ke Daftar
        </button>
      </div>
    </Modal>
  )
}
