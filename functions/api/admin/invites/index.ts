import { type Env, json, bad, sha256, uid, now, normalizeCode } from '../../_lib'
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function genCode() { const a = new Uint8Array(12); crypto.getRandomValues(a); const s = [...a].map((b) => ALPHABET[b % ALPHABET.length]).join(''); return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}` }
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const rows = await env.DB.prepare(`SELECT i.*, (SELECT COUNT(DISTINCT device_id) FROM sessions s WHERE s.invite_id = i.id AND s.last_seen_at > ?) AS devices,
    (SELECT MAX(last_seen_at) FROM sessions s WHERE s.invite_id = i.id) AS last_seen FROM invites i ORDER BY created_at DESC`).bind(now() - 30 * 86400000).all<Record<string, unknown> & { id: string }>()
  const links = (await env.DB.prepare('SELECT invite_id, collection_id FROM invite_collections').all<{ invite_id: string; collection_id: string }>()).results
  return json({ invites: rows.results.map((r) => ({ ...r, collections: links.filter((l) => l.invite_id === r.id).map((l) => l.collection_id) })) })
}
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const b = (await request.json().catch(() => ({}))) as { label?: string; expires_at?: number | null; max_devices?: number; note?: string; can_post?: boolean; collections?: string[] | 'all' }
  const code = genCode(); const id = uid()
  const some = Array.isArray(b.collections)
  await env.DB.prepare('INSERT INTO invites (id, code_hash, label, created_at, expires_at, revoked_at, max_devices, can_post, note, scope) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)')
    .bind(id, await sha256(normalizeCode(code)), (b.label ?? '').slice(0, 60), now(), b.expires_at ?? null, Math.max(1, Math.min(10, b.max_devices ?? 3)), b.can_post ? 1 : 0, b.note ?? null, some ? 'some' : 'all').run()
  if (some) for (const c of b.collections as string[]) await env.DB.prepare('INSERT OR IGNORE INTO invite_collections (invite_id, collection_id) VALUES (?, ?)').bind(id, c).run()
  if (!id) return bad('failed', 500)
  return json({ id, code, label: b.label ?? '' }) // plaintext code is shown exactly once
}
