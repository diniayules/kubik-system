import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icons } from './Icons'

export type ToastKind = 'ok' | 'info' | 'warn'
type ToastItem = { id: number; type: ToastKind; msg: string }

type ToastCtx = (type: ToastKind, msg: string) => void
const Ctx = createContext<ToastCtx>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const id = useRef(0)

  const push = useCallback((type: ToastKind, msg: string) => {
    const newId = ++id.current
    setToasts((t) => [...t, { id: newId, type, msg }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== newId)), 3000)
  }, [])

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="t-ic">
              {t.type === 'ok' ? (
                <Icons.check />
              ) : t.type === 'warn' ? (
                <Icons.alert />
              ) : (
                <Icons.info />
              )}
            </span>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  return useContext(Ctx)
}
