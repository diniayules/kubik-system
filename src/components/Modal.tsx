import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Icons } from './Icons'

type Props = {
  onClose: () => void
  wide?: boolean
  children: ReactNode
}

export function Modal({ onClose, wide, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={'modal' + (wide ? ' modal--wide' : '')}>{children}</div>
    </div>
  )
}

type HeadProps = {
  icon: ReactNode
  color?: string
  title: string
  sub?: string
  onClose: () => void
}

export function ModalHead({ icon, color, title, sub, onClose }: HeadProps) {
  return (
    <div className="modal-head">
      <div
        className="avatar"
        style={{ width: 46, height: 46, background: color ?? 'var(--primary)', color: '#fff' }}
      >
        {icon}
      </div>
      <div>
        <div className="m-title">{title}</div>
        {sub && <div className="m-sub">{sub}</div>}
      </div>
      <button type="button" className="m-close" onClick={onClose} aria-label="Tutup">
        <Icons.x />
      </button>
    </div>
  )
}
