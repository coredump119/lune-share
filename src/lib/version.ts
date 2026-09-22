/** Version of this copy, and a once-a-day look at GitHub to see whether the template moved on. */
export const APP_VERSION = __APP_VERSION__
const REPO = 'coredump119/lune-share'
export const REPO_URL = `https://github.com/${REPO}`
export const DOCS = 'https://lune-share-docs.pages.dev'
export const CHANGELOG_URL = `${DOCS}/changelog.html`
const KEY = 'ls-latest'
const newer = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) } return false }
export async function checkLatest(): Promise<{ latest: string; hasUpdate: boolean } | null> {
  try {
    const cached = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { latest: string; at: number } | null
    if (cached && Date.now() - cached.at < 86400000) return { latest: cached.latest, hasUpdate: newer(cached.latest, APP_VERSION) }
  } catch { /* ignore */ }
  try {
    // the docs site on Cloudflare Pages is reachable from mainland China; GitHub is the fallback
    const tryUrl = async (u: string) => { try { const r = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(8000) }); return r.ok ? ((await r.json()) as { version?: string }) : null } catch { return null } }
    const j = (await tryUrl(`${DOCS}/latest.json`)) ?? (await tryUrl(`https://raw.githubusercontent.com/${REPO}/main/package.json`))
    if (!j) return null
    const latest = String(j.version ?? '')
    if (!/^\d+\.\d+\.\d+$/.test(latest)) return null
    try { localStorage.setItem(KEY, JSON.stringify({ latest, at: Date.now() })) } catch { /* ignore */ }
    return { latest, hasUpdate: newer(latest, APP_VERSION) }
  } catch { return null }
}
