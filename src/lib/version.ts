/** Version of this copy, and a once-a-day look at GitHub to see whether the template moved on. */
export const APP_VERSION = __APP_VERSION__
const REPO = 'coredump119/lune-share'
export const REPO_URL = `https://github.com/${REPO}`
const KEY = 'ls-latest'
const newer = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) } return false }
export async function checkLatest(): Promise<{ latest: string; hasUpdate: boolean } | null> {
  try {
    const cached = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { latest: string; at: number } | null
    if (cached && Date.now() - cached.at < 86400000) return { latest: cached.latest, hasUpdate: newer(cached.latest, APP_VERSION) }
  } catch { /* ignore */ }
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${REPO}/main/package.json`, { cache: 'no-store' })
    if (!r.ok) return null
    const latest = String(((await r.json()) as { version?: string }).version ?? '')
    if (!/^\d+\.\d+\.\d+$/.test(latest)) return null
    try { localStorage.setItem(KEY, JSON.stringify({ latest, at: Date.now() })) } catch { /* ignore */ }
    return { latest, hasUpdate: newer(latest, APP_VERSION) }
  } catch { return null }
}
