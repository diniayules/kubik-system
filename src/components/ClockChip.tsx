import { useEffect, useState } from 'react'
import { Icons } from './Icons'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function ClockChip() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const s = pad(now.getSeconds())
  return (
    <div className="clock-chip">
      <span className="lbl">WIB</span>
      <span className="now">
        {hm}
        <span className="sec">:{s}</span>
      </span>
      <span className="pulse">
        <Icons.clock />
      </span>
    </div>
  )
}
