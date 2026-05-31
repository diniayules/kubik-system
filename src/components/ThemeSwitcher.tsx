export type Theme = 'pop' | 'aurora' | 'studio' | 'tosca' | 'oui'

const THEMES: { id: Theme; label: string; c: string }[] = [
  { id: 'pop', label: 'Pop', c: '#FFCE2E' },
  { id: 'aurora', label: 'Aurora', c: '#6366F1' },
  { id: 'studio', label: 'Studio', c: '#EF5C8C' },
  { id: 'tosca', label: 'Tosca', c: '#14B8A6' },
  { id: 'oui', label: 'Candy', c: '#7274ED' },
]

type Props = {
  theme: Theme
  onChange: (t: Theme) => void
  inline?: boolean
}

export function ThemeSwitcher({ theme, onChange, inline }: Props) {
  return (
    <div className={'theme-switch' + (inline ? ' theme-switch--inline' : '')}>
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          className={'ts-btn' + (theme === t.id ? ' active' : '')}
          onClick={() => onChange(t.id)}
        >
          <span className="sw" style={{ background: t.c }} />
          <span className="lbl">{t.label}</span>
        </button>
      ))}
    </div>
  )
}
