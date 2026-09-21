import { type Env, json, bad, deletePrompts, chunks } from '../../_lib'
/** Batch: { ids, action: approve | unpublish | delete | pin | unpin } */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const b = (await request.json().catch(() => null)) as { ids?: string[]; action?: string } | null
  const ids = (b?.ids ?? []).filter((x) => typeof x === 'string').slice(0, 600)
  if (!ids.length || !b?.action) return bad('ids and action required')
  const t = Date.now()
  if (b.action === 'delete') { await deletePrompts(env, ids); return json({ ok: true, n: ids.length }) }
  const sql = b.action === 'approve' ? 'UPDATE prompts SET published = 1, updated_at = ? WHERE id IN'
    : b.action === 'unpublish' ? 'UPDATE prompts SET published = 0, updated_at = ? WHERE id IN'
    : b.action === 'pin' ? 'UPDATE prompts SET sort = ?, updated_at = ? WHERE id IN'
    : b.action === 'unpin' ? 'UPDATE prompts SET sort = created_at, updated_at = ? WHERE id IN' : null
  if (!sql) return bad('unknown action')
  for (const part of chunks(ids)) await env.DB.prepare(`${sql} (${part.map(() => '?').join(',')})`).bind(...(b.action === 'pin' ? [t, t, ...part] : [t, ...part])).run()
  return json({ ok: true, n: ids.length })
}
