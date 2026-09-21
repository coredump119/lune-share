import { useState } from 'react'
import { api } from '../lib/api'
import { useStore, go } from '../store'

export function Gate() {
  const { refreshAuth, auth } = useStore()
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setErr(null); setBusy(true)
    try { await api.enter(code); await refreshAuth(); go('/g') } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="gate">
      <form className="gate-card glass-strong fade-in" onSubmit={(e) => { e.preventDefault(); submit() }}>
        {auth?.site.tagline && <span className="eyebrow">{auth.site.tagline}</span>}
        <h1 style={{ fontSize: (auth?.site.name.length ?? 0) > 8 ? 30 : 40, textWrap: 'balance', lineHeight: 1.25 }}>{auth?.site.name}</h1>
        <p className="muted" style={{ maxWidth: 280 }}>输入发给你的邀请码就能进入。一人一码，请不要转发。</p>
        <input className="field" autoFocus placeholder="XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} />
        {err && <span className="err">{err}</span>}
        <button className="btn primary" type="submit" disabled={busy || code.trim().length < 4} style={{ width: '100%', height: 44 }}>{busy ? '验证中…' : '进入'}</button>
        <a className="tiny" href="#/admin">管理入口</a>
      </form>
    </div>
  )
}
