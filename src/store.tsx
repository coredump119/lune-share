import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './lib/api'

export type Route = { name: 'gate' } | { name: 'gallery'; id?: string } | { name: 'admin'; tab?: string }
export function parseRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  if (h.startsWith('admin')) return { name: 'admin', tab: h.split('/')[1] || 'upload' }
  if (h.startsWith('g')) return { name: 'gallery', id: h.split('/')[1] || undefined }
  return { name: 'gate' }
}
export const go = (path: string) => { location.hash = path }

interface State {
  route: Route
  auth: { site: { name: string; tagline: string }; viewer: boolean; admin: boolean; label: string | null; canPost: boolean; canExport: boolean } | null
  refreshAuth: () => Promise<void>
  dark: boolean; theme: 'auto' | 'light' | 'dark'; setTheme: (t: 'auto' | 'light' | 'dark') => void
  toast: (t: string, ms?: number) => void
  toasts: { id: number; text: string }[]
}
const Ctx = createContext<State | null>(null)
export function StoreProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(parseRoute)
  const [auth, setAuth] = useState<State['auth']>(null)
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([])
  const nid = useRef(1)
  const [theme, setThemeState] = useState<'auto' | 'light' | 'dark'>(() => { try { return (localStorage.getItem('ls-theme') as 'auto' | 'light' | 'dark') || 'auto' } catch { return 'auto' } })
  const [dark, setDark] = useState(false)
  useEffect(() => { const f = () => setRoute(parseRoute()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const refreshAuth = useCallback(async () => { try { setAuth(await api.me()) } catch { setAuth({ site: { name: '', tagline: '' }, viewer: false, admin: false, label: null, canPost: false, canExport: false }) } }, [])
  useEffect(() => { refreshAuth() }, [refreshAuth])
  useEffect(() => { if (auth?.site.name) document.title = auth.site.name }, [auth?.site.name])
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { const d = theme === 'dark' || (theme === 'auto' && mq.matches); document.documentElement.dataset.theme = d ? 'dark' : 'light'; setDark(d) }
    apply(); mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply)
  }, [theme])
  const setTheme = useCallback((t: 'auto' | 'light' | 'dark') => { setThemeState(t); try { localStorage.setItem('ls-theme', t) } catch { /* ignore */ } }, [])
  const toast = useCallback((text: string, ms = 3600) => { const id = nid.current++; setToasts((t) => [...t.slice(-2), { id, text }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms) }, [])
  const value = useMemo(() => ({ route, auth, refreshAuth, dark, theme, setTheme, toast, toasts }), [route, auth, refreshAuth, dark, theme, setTheme, toast, toasts])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const useStore = () => { const v = useContext(Ctx); if (!v) throw new Error('no store'); return v }

export function useIsMobile() {
  const [m, setM] = useState(() => matchMedia('(max-width: 640px)').matches)
  useEffect(() => { const mq = matchMedia('(max-width: 640px)'); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, [])
  return m
}
