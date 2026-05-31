import { Icons } from './Icons'

type KeypadProps = {
  onKey: (k: string) => void
  onBack: () => void
  onClear: () => void
  disabled?: boolean
}

export function Keypad({ onKey, onBack, onClear, disabled }: KeypadProps) {
  return (
    <div className="keypad">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
        <button
          key={k}
          type="button"
          className="key"
          disabled={disabled}
          onClick={() => onKey(k)}
        >
          {k}
        </button>
      ))}
      <button
        type="button"
        className="key key--fn"
        disabled={disabled}
        onClick={onClear}
      >
        Hapus
      </button>
      <button
        type="button"
        className="key"
        disabled={disabled}
        onClick={() => onKey('0')}
      >
        0
      </button>
      <button
        type="button"
        className="key key--fn"
        disabled={disabled}
        onClick={onBack}
        aria-label="backspace"
      >
        <Icons.back />
      </button>
    </div>
  )
}

type DotsProps = { len: number; total?: number; error?: boolean }

export function PinDots({ len, total = 4, error }: DotsProps) {
  return (
    <div className="pin-dots">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={
            'pin-dot' + (i < len ? ' filled' : '') + (error ? ' err' : '')
          }
        />
      ))}
    </div>
  )
}
