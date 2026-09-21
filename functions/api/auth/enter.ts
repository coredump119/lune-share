import { type Env, json, bad, sha256, normalizeCode, rateLimit, now, uid, sign, setCookie } from '../_lib'
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'x'
  if (!(await rateLimit(env, 'enter:' + (await sha256(ip)).slice(0, 16), 10))) return bad('尝试太频繁，一分钟后再试', 429)
  const { code } = (await request.json().catch(() => ({}))) as { code?: string }
  if (!code || normalizeCode(code).length < 4) return bad('请输入邀请码')
  const hash = await sha256(normalizeCode(code))
  const inv = await env.DB.prepare('SELECT id, label, expires_at, revoked_at, max_devices FROM invites WHERE code_hash = ?').bind(hash).first<{ id: string; label: string; expires_at: number | null; revoked_at: number | null; max_devices: number }>()
  if (!inv) return bad('邀请码不存在', 404)
  if (inv.revoked_at) return bad('这个邀请码已被作废', 403)
  if (inv.expires_at && inv.expires_at < now()) return bad('这个邀请码已过期', 403)
  const active = await env.DB.prepare('SELECT COUNT(DISTINCT device_id) AS n FROM sessions WHERE invite_id = ? AND last_seen_at > ?').bind(inv.id, now() - 30 * 86400000).first<{ n: number }>()
  const dev = uid()
  if ((active?.n ?? 0) >= inv.max_devices) return bad(`这个邀请码已在 ${inv.max_devices} 台设备上使用，请联系发码人`, 403)
  const sid = uid()
  const ua = (request.headers.get('user-agent') ?? '').slice(0, 160)
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (id, invite_id, device_id, created_at, last_seen_at, ua) VALUES (?, ?, ?, ?, ?, ?)').bind(sid, inv.id, dev, now(), now(), ua),
    env.DB.prepare('INSERT INTO access_log (invite_id, at, action, ua) VALUES (?, ?, ?, ?)').bind(inv.id, now(), 'enter', ua),
  ])
  const days = Number(env.SESSION_DAYS ?? 30)
  const token = await sign(env.SESSION_SECRET, { sid, inv: inv.id, dev, exp: now() + days * 86400000 })
  return json({ ok: true, label: inv.label }, 200, { 'set-cookie': setCookie('ls_session', token, days * 86400) })
}
