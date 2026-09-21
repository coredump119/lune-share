import { type Env, json, bad, now } from '../../_lib'
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = String(params.id)
  const b = (await request.json().catch(() => ({}))) as { revoke?: boolean; restore?: boolean; label?: string; expires_at?: number | null; max_devices?: number; note?: string; can_post?: boolean; collections?: string[] | 'all' }
  if (b.collections !== undefined) {
    const some = Array.isArray(b.collections)
    await env.DB.prepare('UPDATE invites SET scope = ? WHERE id = ?').bind(some ? 'some' : 'all', id).run()
    await env.DB.prepare('DELETE FROM invite_collections WHERE invite_id = ?').bind(id).run()
    if (some) for (const c of b.collections as string[]) await env.DB.prepare('INSERT OR IGNORE INTO invite_collections (invite_id, collection_id) VALUES (?, ?)').bind(id, c).run()
    if (Object.keys(b).length === 1) return json({ ok: true })
  }
  const sets: string[] = []; const vals: unknown[] = []
  if (b.revoke) { sets.push('revoked_at = ?'); vals.push(now()) }
  if (b.restore) { sets.push('revoked_at = NULL') }
  if (b.label !== undefined) { sets.push('label = ?'); vals.push(b.label.slice(0, 60)) }
  if (b.expires_at !== undefined) { sets.push('expires_at = ?'); vals.push(b.expires_at) }
  if (b.max_devices !== undefined) { sets.push('max_devices = ?'); vals.push(Math.max(1, Math.min(10, b.max_devices))) }
  if (b.note !== undefined) { sets.push('note = ?'); vals.push(b.note) }
  if (b.can_post !== undefined) { sets.push('can_post = ?'); vals.push(b.can_post ? 1 : 0) }
  if (!sets.length) return bad('nothing to update')
  await env.DB.prepare(`UPDATE invites SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run()
  if (b.revoke) await env.DB.prepare('DELETE FROM sessions WHERE invite_id = ?').bind(id).run()
  return json({ ok: true })
}
export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  const id = String(params.id)
  await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE invite_id = ?').bind(id), env.DB.prepare('DELETE FROM invites WHERE id = ?').bind(id)])
  return json({ ok: true })
}
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const id = String(params.id)
  const sessions = await env.DB.prepare('SELECT device_id, created_at, last_seen_at, ua FROM sessions WHERE invite_id = ? ORDER BY last_seen_at DESC').bind(id).all()
  const log = await env.DB.prepare('SELECT at, action, ua FROM access_log WHERE invite_id = ? ORDER BY at DESC LIMIT 50').bind(id).all()
  return json({ sessions: sessions.results, log: log.results })
}
