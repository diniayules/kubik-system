import type { CSSProperties, KeyboardEvent } from 'react'

type RupiahInputProps = {
  /** Nilai numerik murni (tanpa pemisah ribuan). 0 ditampilkan sebagai kosong. */
  value: number
  /** Dipanggil tiap ketukan dengan angka bersih (sudah di-clamp ke min/max). */
  onChange: (n: number) => void
  onBlur?: () => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
  min?: number
  max?: number
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}

/**
 * Kolom isian Rupiah: menampilkan angka dengan pemisah ribuan (format id-ID)
 * dan awalan "Rp", tetapi tetap mengeluarkan angka murni lewat onChange.
 * Mengganti <input type="number"> agar nominal uang mudah dibaca saat diketik.
 */
export default function RupiahInput({
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder = '0',
  autoFocus,
  disabled,
  min = 0,
  max,
  className,
  style,
  'aria-label': ariaLabel,
}: RupiahInputProps) {
  const display =
    Number.isFinite(value) && value !== 0 ? value.toLocaleString('id-ID') : ''

  function handle(raw: string) {
    const digits = raw.replace(/\D/g, '')
    let n = digits === '' ? 0 : parseInt(digits, 10)
    if (!Number.isFinite(n)) n = 0
    if (n < min) n = min
    if (max != null && n > max) n = max
    onChange(n)
  }

  return (
    <div
      className={'rupiah-input' + (disabled ? ' is-disabled' : '') + (className ? ' ' + className : '')}
      style={style}
    >
      <span className="rupiah-input-rp">Rp</span>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => handle(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}
