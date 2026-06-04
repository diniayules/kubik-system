export const AVA_GRAD: [string, string][] = [
  ['#3B5BDB', '#6FA0FF'],
  ['#FF5E9C', '#FF9CC0'],
  ['#16C79A', '#7DEBCF'],
  ['#FFB02E', '#FFD45E'],
  ['#7C5CFF', '#B79CFF'],
  ['#FF7847', '#FFB07A'],
]

export function colorIndexForName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return Math.abs(hash) % AVA_GRAD.length
}

type Props = {
  name: string
  colorIndex?: number
  size?: 'sm' | 'md' | 'lg'
  /** Foto avatar (data URL / URL). Bila ada, menggantikan inisial. */
  foto?: string
}

export function Avatar({ name, colorIndex, size = 'md', foto }: Props) {
  const init =
    name
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  const idx = colorIndex ?? colorIndexForName(name)
  const [c1, c2] = AVA_GRAD[idx % AVA_GRAD.length]
  const cls = size === 'lg' ? 'avatar avatar-lg' : 'avatar'
  return (
    <div className={cls} style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
      {foto ? <img src={foto} alt={name} /> : init}
    </div>
  )
}
