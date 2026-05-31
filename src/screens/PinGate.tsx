import { useEffect, useState } from 'react'
import type { Employee } from '../types'
import { hashPin } from '../storage'
import { Avatar } from '../components/Avatar'
import { Modal, ModalHead } from '../components/Modal'
import { Keypad, PinDots } from '../components/Keypad'
import { Icons } from '../components/Icons'

const PIN_LENGTH = 4

type Props = {
  employee: Employee
  aksiLabel: string
  onSuccess: () => void
  onSetPin: (pinHash: string) => void
  onCancel: () => void
}

export function PinGate({
  employee,
  aksiLabel,
  onSuccess,
  onSetPin,
  onCancel,
}: Props) {
  const needsSetup = !employee.pinHash
  const [tahap, setTahap] = useState<'masukkan' | 'konfirmasi'>('masukkan')
  const [pin, setPin] = useState('')
  const [pinPertama, setPinPertama] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [shake, setShake] = useState(false)
  const [memproses, setMemproses] = useState(false)

  function tekan(ch: string) {
    if (memproses || ok) return
    setError('')
    if (ch === 'back') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (pin.length < PIN_LENGTH) {
      setPin((p) => p + ch)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) tekan(e.key)
      else if (e.key === 'Backspace') tekan('back')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return
    void proses()
  }, [pin])

  async function proses() {
    setMemproses(true)
    try {
      if (needsSetup) {
        if (tahap === 'masukkan') {
          setPinPertama(pin)
          setPin('')
          setTahap('konfirmasi')
          return
        }
        if (pin !== pinPertama) {
          gagalkan('Konfirmasi PIN tidak cocok. Ulangi dari awal.')
          setPinPertama('')
          setTahap('masukkan')
          return
        }
        const hash = await hashPin(pin)
        setOk(true)
        setTimeout(() => onSetPin(hash), 600)
      } else {
        const hash = await hashPin(pin)
        if (hash === employee.pinHash) {
          setOk(true)
          setTimeout(() => onSuccess(), 600)
        } else {
          gagalkan('PIN salah, coba lagi.')
        }
      }
    } finally {
      setMemproses(false)
    }
  }

  function gagalkan(pesan: string) {
    setError(pesan)
    setPin('')
    setShake(true)
    setTimeout(() => setShake(false), 400)
  }

  let judul = `PIN — ${aksiLabel}`
  let sub = `${employee.nama}`
  if (needsSetup && tahap === 'masukkan') {
    judul = 'Buat PIN'
    sub = `Pilih ${PIN_LENGTH} digit untuk ${employee.nama}`
  } else if (needsSetup && tahap === 'konfirmasi') {
    judul = 'Konfirmasi PIN'
    sub = 'Ketik ulang PIN yang sama'
  }

  return (
    <Modal onClose={onCancel} wide>
      <ModalHead
        icon={ok ? <Icons.check /> : <Icons.finger />}
        color="var(--primary)"
        title={judul}
        sub={sub}
        onClose={onCancel}
      />
      <div className="modal-body" style={{ textAlign: 'center' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <Avatar name={employee.nama} size="lg" />
        </div>
        <p
          style={{
            color: 'var(--ink-soft)',
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {ok
            ? 'PIN benar! 🎉'
            : needsSetup && tahap === 'konfirmasi'
              ? 'Ketik ulang PIN'
              : 'Masukkan PIN 4 digit'}
        </p>
        <PinDots len={pin.length} error={shake} />
        <Keypad
          onKey={tekan}
          onBack={() => tekan('back')}
          onClear={() => setPin('')}
          disabled={memproses || ok}
        />
        <div className={'pin-msg' + (error ? ' err' : ok ? ' ok' : '')}>
          {error || (ok ? 'Berhasil!' : '')}
        </div>
        {needsSetup && (
          <div className="pin-hint">
            🔒 PIN ini akan diminta setiap kali <b>{employee.nama}</b> membuka
            absensi. Jaga kerahasiaannya.
          </div>
        )}
      </div>
    </Modal>
  )
}
