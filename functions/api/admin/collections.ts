import { type Env, json, bad, uid, deletePrompts } from '../_lib'
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const b = (await request.json().catch(() => ({}))) as { name?: string; id?: string; delete?: boolean; withPrompts?: boolean; sort?: number }
  if (b.delete && b.id) {
    let deleted = 0
    if (b.withPrompts) {
      // remove every prompt in the collection together with its images (D1 rows + R2 objects)
      const ids = (await env.DB.prepare('SELECT id FROM prompts WHERE collection_id = ?').bind(b.id).all<{ id: string }>()).results.map((r) => r.id)
      deleted = ids.length
      await deletePrompts(env, ids)
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE prompts SET collection_id = NULL WHERE collection_id = ?').bind(b.id),
      env.DB.prepare('DELETE FROM invite_collections WHERE collection_id = ?').bind(b.id),
      env.DB.prepare('DELETE FROM collections WHERE id = ?').bind(b.id),
    ])
    return json({ ok: true, deleted })
  }
  if (b.id) { await env.DB.prepare('UPDATE collections SET name = COALESCE(?, name), sort = COALESCE(?, sort) WHERE id = ?').bind(b.name?.trim() ?? null, b.sort ?? null, b.id).run(); return json({ ok: true }) }
  if (!b.name?.trim()) return bad('name required')
  const id = uid()
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM collections').first<{ n: number }>()
  await env.DB.prepare('INSERT INTO collections (id, name, sort) VALUES (?, ?, ?)').bind(id, b.name.trim(), n?.n ?? 0).run()
  return json({ id, name: b.name.trim() })
}
