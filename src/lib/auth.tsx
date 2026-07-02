import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { type Profile, supabase, supabaseConfigured } from './supabase'

type AuthState = {
  loading: boolean
  configured: boolean
  user: User | null
  session: Session | null
  profile: Profile | null
  isAdmin: boolean
  isKaryawan: boolean
}

type AuthCtx = AuthState & {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  async function loadProfile(uid: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle()
    if (error) {
      console.error('[auth] loadProfile error', error)
      return null
    }
    return data as Profile | null
  }

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }
    let mounted = true

    // Safety net: never let the loading gate hang forever (e.g. if the auth
    // lock stalls). Fall back to "logged out" after a short timeout.
    const fallback = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 4000)

    // `onAuthStateChange` emits INITIAL_SESSION right after subscribing with the
    // persisted session (or null), and SIGNED_IN after a login. The callback
    // MUST stay synchronous and must NOT await other supabase-js calls: it runs
    // while the auth lock is held, so awaiting a DB query (loadProfile) here can
    // deadlock — leaving `profile` null and bouncing the user back to Login.
    // We therefore set session/loading immediately and defer loadProfile with
    // setTimeout(…, 0) so it runs outside the locked callback.
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!mounted) return
      setSession(s)
      if (!s?.user) {
        setProfile(null)
        setLoading(false)
        return
      }
      setTimeout(async () => {
        const p = await loadProfile(s.user.id)
        if (!mounted) return
        setProfile(p)
        setLoading(false)
      }, 0)
    })

    return () => {
      mounted = false
      clearTimeout(fallback)
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  // Pendaftaran mandiri ditutup: akun baru dibuat admin lewat edge function
  // `create-karyawan` (lihat createKaryawanAccount di lib/db). Tidak ada signUp
  // di sini agar tidak ada jalur publik membuat akun.

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }

  async function refreshProfile() {
    if (!session?.user) return
    const p = await loadProfile(session.user.id)
    setProfile(p)
  }

  const value: AuthCtx = useMemo(
    () => ({
      loading,
      configured: supabaseConfigured,
      user: session?.user ?? null,
      session,
      profile,
      isAdmin: profile?.role === 'admin',
      isKaryawan: profile?.role === 'karyawan',
      signIn,
      signOut,
      refreshProfile,
    }),
    [loading, session, profile],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return v
}
